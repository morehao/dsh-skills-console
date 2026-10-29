/**
 * 订阅：来源探测 + 增删 + 刷新。
 * 拆分前是模块顶层 enrichSkillEntries / inspectSkillEntry + `createService` 返回对象里的
 * probeSource / addSubscription / removeSubscription / refreshSubscription，现在接 `ctx`。
 */
import { parseSkillFrontmatter } from '../skill-md.js';
import { parseSource, snapshotId } from '../updates.js';
import { readSnapshot, remoteCommitUnchanged } from './snapshots.js';
import { assertWritable, state } from './guards.js';
import { nowIso } from './shared.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

/** 用 raw 内容补 frontmatter 里的真实技能名/描述（CLI 按 name 安装）；取不到就回落目录名。 */
export async function enrichSkillEntries({ source, ref, entries, token, fetchImpl, concurrency = 8 }) {
  const results = new Array(entries.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await inspectSkillEntry({ source, ref, entry: entries[index], token, fetchImpl });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return results;
}

export async function inspectSkillEntry({ source, ref, entry, token, fetchImpl }) {
  const fallback = { name: entry.name, description: '', skillPath: entry.skillPath, valid: true };
  try {
    const url = `https://raw.githubusercontent.com/${source}/${ref}/${entry.skillPath.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'dsh-skills-console', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!response?.ok) return fallback;
    const fields = parseSkillFrontmatter(await response.text());
    // CLI 要求 name + description 都在，缺一个就整个跳过：这里同步标成 invalid，别让用户选了才发现装不上
    if (!fields.name || !fields.description) return { ...fallback, valid: false };
    return { name: fields.name, description: fields.description, skillPath: entry.skillPath, valid: true };
  } catch {
    return fallback;
  }
}

/** 只读探测来源里的 SKILL.md，供「添加技能」多选；不写 state、不建订阅。 */
export async function probeSource(ctx: ServiceCtx, { source, ref, subpath }) {
  const probeCache = ctx.runtime.probeCache;
  const PROBE_TTL_MS = ctx.runtime.PROBE_TTL_MS;
  const PROBE_MAX = ctx.runtime.PROBE_MAX;
  const parsed = parseSource(source);
  if (!parsed) throw new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');
  const canonicalSource = `${parsed.owner}/${parsed.repo}`;
  const requestedRef = typeof ref === 'string' && ref.trim() ? ref.trim() : null;
  const requestedSubpath = typeof subpath === 'string' && subpath.trim()
    ? subpath.trim().replace(/^\/+|\/+$/g, '') || null
    : null;
  const key = `${canonicalSource}@${requestedRef || ''}#${requestedSubpath || ''}`;
  const cached = probeCache.get(key);
  if (cached && (cached.pending || Date.now() - cached.at < PROBE_TTL_MS)) {
    return cached.pending || cached.value;
  }
  const pending = (async () => {
    // REST 优先；限流时 readSnapshot 内部用 Atom + codeload 兜底
    const probe = await readSnapshot(
      ctx,
      {
        id: null,
        source: canonicalSource,
        ref: requestedRef,
        subpath: requestedSubpath,
        snapshot: null,
      },
      { force: true, withCommit: false },
    );
    // 描述优先按 commit 抓（不可变、可缓存），没有 commit 再退回分支名
    const enrichRef = probe.snapshot?.commit || probe.branch;
    const enriched = await enrichSkillEntries({
      source: canonicalSource,
      ref: enrichRef,
      entries: probe.snapshot.entries,
      token: ctx.runtime.tokenOf,
      fetchImpl: ctx.fetchImpl,
    });
    const skills = enriched
      .filter((skill) => skill.valid)
      .map(({ name, description, skillPath }) => ({ name, description, skillPath }));
    return {
      ok: true,
      source: canonicalSource,
      ref: probe.branch,
      via: probe.via || 'rest',
      skills,
      skipped: enriched.length - skills.length,
    };
  })();
  probeCache.set(key, { pending, at: Date.now() });
  try {
    const value = await pending;
    probeCache.set(key, { value, at: Date.now() });
    for (const oldest of probeCache.keys()) {
      if (probeCache.size <= PROBE_MAX) break;
      probeCache.delete(oldest);
    }
    return value;
  } catch (error) {
    // 失败不留缓存，用户改一下来源或重试就能重新探测
    probeCache.delete(key);
    throw error;
  }
}

export async function addSubscription(ctx: ServiceCtx, { source, ref, subpath, skills = '*' }) {
  const { store, logger } = ctx;
  assertWritable(ctx);
  const parsed = parseSource(source);
  if (!parsed) throw new ServiceError('error.skills.bad-source', '订阅只接受 owner/repo 或 GitHub URL');
  const canonicalSource = `${parsed.owner}/${parsed.repo}`;
  const requestedRef = typeof ref === 'string' && ref.trim() ? ref.trim() : null;
  const requestedSubpath = typeof subpath === 'string' && subpath.trim()
    ? subpath.trim().replace(/^\/+|\/+$/g, '') || null
    : null;
  const id = snapshotId({ source: canonicalSource, ref: requestedRef, subpath: requestedSubpath });
  // 老记录可能用 URL / 原始字符串算过 id：按来源+ref+子目录再找一遍，避免同一仓库出现两条订阅
  const existing =
    state(ctx).subscriptions.find((item) => item.id === id) ||
    state(ctx).subscriptions.find(
      (item) =>
        item.source === canonicalSource &&
        (item.ref || null) === requestedRef &&
        (item.subpath || null) === requestedSubpath,
    );
  // 已有快照的重复添加直接返回；空壳（旧版本失败留下的）要走一次真实拉取，成功后再补全
  if (existing?.snapshot) return { ok: true, subscription: existing, existing: true };

  const candidate = {
    id: existing?.id || id,
    source: canonicalSource,
    ref: requestedRef || existing?.ref || null,
    subpath: requestedSubpath,
    skills,
    lastCheck: null,
    snapshot: null,
  };

  // 先读快照再落盘：上游失败时 state 里不能留下订阅，接口也必须如实报错
  const probe = await readSnapshot(ctx, candidate, { force: true });
  // 一条 skill 都没有 = 订阅了也没东西可装（多半是 subpath/ref 写错），同样不能算添加成功
  if (probe.snapshot.entries.length === 0) {
    throw new ServiceError(
      'error.skills.no-skills',
      `${canonicalSource}@${probe.branch}${requestedSubpath ? `/${requestedSubpath}` : ''} 里没有找到 SKILL.md`,
      { source: canonicalSource, ref: probe.branch, subpath: requestedSubpath },
    );
  }

  const record = {
    ...candidate,
    ...(existing?.adopted ? { adopted: true } : {}),
    ref: probe.branch,
    snapshot: probe.snapshot,
    lastCheck: {
      at: nowIso(),
      commit: probe.snapshot.commit,
      treeEtag: probe.snapshot.etag,
      status: 'changed',
    },
  };
  store.update((draft) => {
    const index = draft.subscriptions.findIndex((item) => item.id === record.id);
    if (index >= 0) draft.subscriptions[index] = { ...draft.subscriptions[index], ...record };
    else draft.subscriptions.push(record);
  });
  logger('subscription.add', {
    id: record.id,
    source: record.source,
    ref: record.ref,
    entries: record.snapshot.entries.length,
  });
  return {
    ok: true,
    changed: true,
    entries: record.snapshot.entries.length,
    subscription: state(ctx).subscriptions.find((item) => item.id === record.id),
  };
}

export async function removeSubscription(ctx: ServiceCtx, { id, keepInstalled = true }) {
  const store = ctx.store;
  assertWritable(ctx);
  const subscription = state(ctx).subscriptions.find((item) => item.id === id);
  if (!subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
  store.update((draft) => {
    draft.subscriptions = draft.subscriptions.filter((item) => item.id !== id);
    if (!keepInstalled) {
      for (const install of draft.installs) {
        if (install.subscriptionId === id) install.subscriptionId = null;
      }
    }
  });
  return { ok: true, id, keptInstalled: keepInstalled };
}

export async function refreshSubscription(ctx: ServiceCtx, { id, force = false }) {
  const { store, logger } = ctx;
  assertWritable(ctx);
  const subscription = state(ctx).subscriptions.find((item) => item.id === id);
  if (!subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
  // 短路：最常见的情况是「什么都没变」。先用 Atom 比 commit，一致就一次 REST 都不发。
  if (await remoteCommitUnchanged(ctx, subscription)) {
    const at = nowIso();
    store.update((draft) => {
      const row = draft.subscriptions.find((item) => item.id === id);
      if (row) row.lastCheck = { ...(row.lastCheck || {}), at, status: 'unchanged' };
    });
    logger('subscription.refresh', { id, notModified: true, via: 'atom' });
    return {
      ok: true,
      changed: false,
      notModified: true,
      via: 'atom',
      subscription: state(ctx).subscriptions.find((item) => item.id === id),
    };
  }
  let probe;
  try {
    probe = await readSnapshot(ctx, subscription, { force });
  } catch (error) {
    // 失败留痕（清单里能看到 lastCheck），但接口必须报错，不能把失败伪装成成功
    if (!store.readOnly) {
      store.update((draft) => {
        const row = draft.subscriptions.find((item) => item.id === id);
        if (row) row.lastCheck = { at: nowIso(), status: 'unknown', detail: error.message };
      });
    }
    throw error;
  }
  const at = nowIso();
  store.update((draft) => {
    const row = draft.subscriptions.find((item) => item.id === id);
    if (!row) return;
    if (!row.ref && probe.branch) row.ref = probe.branch;
    if (probe.notModified) {
      // 304 只刷新时间，绝不把 entries 置空
      row.lastCheck = { ...(row.lastCheck || {}), at, status: 'unchanged' };
      return;
    }
    row.snapshot = probe.snapshot;
    row.lastCheck = { at, commit: probe.snapshot.commit, treeEtag: probe.snapshot.etag, status: probe.changed ? 'changed' : 'unchanged' };
  });
  if (!probe.notModified) logger('subscription.refresh', { id, entries: probe.snapshot.entries.length, changed: probe.changed });
  return {
    ok: true,
    changed: !probe.notModified && probe.changed,
    ...(probe.notModified ? { notModified: true } : {}),
    via: probe.via || 'rest',
    subscription: state(ctx).subscriptions.find((item) => item.id === id),
  };
}

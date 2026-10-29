/**
 * 订阅快照读取：REST 优先，限流时 Atom/codeload 兜底；纯读（`persistRef` 例外）。
 * 拆分前是 `createService` 闭包里的 branchOf / readSnapshot / atomSnapshot
 * / remoteCommitUnchanged，现在接 `ctx`。
 */
import {
  fetchDefaultBranch,
  fetchTree,
  listSkillsFromTree,
  resolveCommit,
  resolveCommitTree,
} from '../updates.js';
import { fetchAtomCommit, snapshotFromTarball } from '../remote.js';
import { nowIso, snapshotRootBaselineStale, upstreamError } from './shared.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

/**
 * 订阅的分支：显式 ref > 记录里的 ref > 仓库默认分支。解析成功后顺手记住，省掉下次请求。
 * 返回 `{ branch, failure }`：`failure` 原样透出 `fetchDefaultBranch` 的结构化失败，
 * 由 `readSnapshot` 决定报哪种错误（T1）。
 */
export async function branchOf(ctx: ServiceCtx, subscription, { persist = false }: any = {}) {
  const { store, fetchImpl } = ctx;
  const tokenOf = ctx.runtime.tokenOf;
  if (subscription.ref) return { branch: subscription.ref, failure: null };
  let resolved;
  try {
    resolved = await fetchDefaultBranch({
      source: subscription.source,
      token: tokenOf,
      fetchImpl,
    });
  } catch (error) {
    return { branch: null, failure: { status: null, rateLimited: false, resetAt: null, error: error?.message || String(error) } };
  }
  const branch = resolved?.branch || null;
  if (!branch) return { branch: null, failure: resolved || null };
  if (persist && !store.readOnly) {
    store.update((draft) => {
      const row = draft.subscriptions.find((item) => item.id === subscription.id);
      if (row && !row.ref) row.ref = branch;
    });
  }
  return { branch, failure: null };
}

/**
 * 读一次订阅快照：只有网络与纯计算，**不写 store**（`persistRef` 例外，只补订阅的 ref）。
 * 上游失败一律抛 ServiceError —— 添加订阅必须先读到快照再记账，
 * 否则会留下「订阅存在但一个 skill 都没有」的空壳（上游 404 时还会显示添加成功）。
 *
 * 数据源：REST 优先；403/429 限流时用 Atom 取 commit，再下 codeload tarball 本地扫描，
 * 不启动任何外部进程。`allowUnchanged=false` 供更新计划使用：即使 commit 没变也要拿完整树。
 */
export async function readSnapshot(
  ctx: ServiceCtx,
  subscription,
  { force = false, withCommit = true, persistRef = false, allowUnchanged = true } = {},
) {
  const { fetchImpl } = ctx;
  const tokenOf = ctx.runtime.tokenOf;
  const source = subscription.source;
  try {
    const { branch, failure } = await branchOf(ctx, subscription, { persist: persistRef });
    if (!branch) {
      if (failure?.rateLimited) {
        return await atomSnapshot(ctx, subscription, {
          ref: subscription.ref || null,
          allowUnchanged,
          rateLimit: failure,
        });
      }
      throw upstreamError(source, failure);
    }
    const result = await fetchTree({
      source,
      ref: branch,
      etag: force || snapshotRootBaselineStale(subscription.snapshot) ? null : subscription.snapshot?.etag || null,
      token: tokenOf,
      fetchImpl,
    });
    if (result.error) {
      // 元数据已经通了，树再 404 说明是 ref 没了（不是仓库不存在）；只有限流降级
      if (result.rateLimited) {
        return await atomSnapshot(ctx, subscription, { ref: branch, allowUnchanged, rateLimit: result });
      }
      throw new ServiceError('error.skills.upstream-failed', `读取 ${source}@${branch} 失败：${result.error}`, {
        source,
        ref: branch,
        status: result.status ?? null,
      });
    }
    if (result.notModified) return { notModified: true, branch, via: 'rest' };
    const entries = listSkillsFromTree({
      tree: result.tree,
      rootSha: result.rootSha,
      subpath: subscription.subpath,
      repoName: source.split('/').pop(),
    });
    const previousRoot = subscription.snapshot?.rootSha || null;
    // 根级 SKILL.md 的 tree 基线就是仓库根 tree SHA。fetchTree 已由条目重建；只有在
    // 条目被截断/形态异常（rootSha 为 null）且确有根级技能时，才补一次 commits 请求，
    // 因为此时「重建」拿不到可靠值而「跳过」会让根级技能永远比对不了。
    let rootSha = result.rootSha || null;
    let resolved: any = null;
    const hasRootLevelSkill = entries.some((item) => !item.skillPath.includes('/'));
    if (!rootSha && hasRootLevelSkill) {
      resolved = await resolveCommitTree({ source, ref: branch, token: tokenOf, fetchImpl });
      rootSha = resolved?.treeSha || null;
    }
    // 探测只需要文件树，不付 resolveCommit 那一次请求
    let commit: any = null;
    if (withCommit) {
      if (resolved?.commit) commit = resolved.commit;
      else if (previousRoot && previousRoot === rootSha && subscription.snapshot?.commit) {
        commit = subscription.snapshot.commit;
      } else {
        commit = await resolveCommit({ source, ref: branch, token: tokenOf, fetchImpl });
      }
    }
    const changed =
      !subscription.snapshot ||
      previousRoot !== rootSha ||
      JSON.stringify(entries) !== JSON.stringify(subscription.snapshot.entries);
    return {
      branch,
      changed,
      via: 'rest',
      tree: result.tree,
      rootSha,
      snapshot: { commit, rootSha, entries, fetchedAt: nowIso(), etag: result.etag },
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('error.skills.upstream-failed', `读取 ${source} 失败：${error?.message || error}`, {
      source,
    });
  }
}

/**
 * 限流兜底：Atom 取 commit，与上次一致就短路；否则 codeload tarball 解压扫描。
 * 失败统一翻成 T1 的四类错误（限流保留原始 reset 信息）。
 */
export async function atomSnapshot(ctx: ServiceCtx, subscription, { ref = null, allowUnchanged = true, rateLimit = null }: any = {}) {
  const { logger, fetchImpl } = ctx;
  const tokenOf = ctx.runtime.tokenOf;
  const source = subscription.source;
  const startedAt = Date.now();
  let atom;
  try {
    atom = await fetchAtomCommit({ source, ref: ref || null, token: tokenOf, fetchImpl });
  } catch (error) {
    logger('atom.failed', { source, kind: error.code || 'atom-failed', message: error.message });
    throw upstreamError(source, {
      status: rateLimit?.status ?? error.status ?? null,
      rateLimited: Boolean(rateLimit?.rateLimited),
      resetAt: rateLimit?.resetAt ?? null,
      error: error.message,
    });
  }
  const branch = ref || subscription.ref || null;
  const previous = subscription.snapshot || null;
  if (
    allowUnchanged &&
    previous?.commit &&
    previous.commit === atom.commit &&
    Array.isArray(previous.entries) &&
    !snapshotRootBaselineStale(previous)
  ) {
    logger('atom.unchanged', { source, commit: atom.commit, ms: Date.now() - startedAt });
    return { branch, changed: false, notModified: true, via: 'atom', snapshot: previous };
  }
  let scan;
  try {
    scan = await snapshotFromTarball({
      source,
      commit: atom.commit,
      ref: branch,
      subpath: subscription.subpath,
      token: tokenOf,
      fetchImpl,
    });
  } catch (error) {
    logger('codeload.failed', { source, kind: error.code || 'scan-failed', message: error.message });
    throw upstreamError(source, {
      status: rateLimit?.status ?? error.status ?? null,
      rateLimited: Boolean(rateLimit?.rateLimited),
      resetAt: rateLimit?.resetAt ?? null,
      error: error.message,
    });
  }
  const changed =
    !previous ||
    previous.rootSha !== scan.rootSha ||
    JSON.stringify(previous.entries) !== JSON.stringify(scan.snapshot.entries);
  logger('atom.snapshot', {
    source,
    ref: branch,
    commit: atom.commit,
    entries: scan.snapshot.entries.length,
    changed,
    ms: Date.now() - startedAt,
  });
  return { ...scan, branch, changed };
}

/**
 * commit 短路：Atom feed 的 HEAD 与订阅快照一致 → 没变化，不请求 REST。
 * Atom 不可用时返回 false，照常走 REST（只增不减）。
 */
export async function remoteCommitUnchanged(ctx: ServiceCtx, subscription) {
  const { logger, fetchImpl } = ctx;
  const tokenOf = ctx.runtime.tokenOf;
  const commit = subscription.snapshot?.commit;
  if (!commit) return false;
  // 坏快照必须先走完整读修复，不能被 Atom 短路挡住（否则 phantom 更新永远消不掉）。
  if (snapshotRootBaselineStale(subscription.snapshot)) return false;
  try {
    const atom = await fetchAtomCommit({
      source: subscription.source,
      ref: subscription.ref || null,
      token: tokenOf,
      fetchImpl,
    });
    return atom.commit === commit;
  } catch (error) {
    logger('atom.failed', {
      source: subscription.source,
      kind: error.code || 'atom-failed',
      purpose: 'refresh',
    });
    return false;
  }
}

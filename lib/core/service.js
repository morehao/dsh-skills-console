import fs from 'node:fs';
import path from 'node:path';
import { StateReadOnlyError } from './state.js';
import { contentHash } from './hash.js';
import { createGit } from './git.js';
import { ensureLink, inspectTarget, removeLink } from './links.js';
import { buildLedger, readLock, scanCanonical } from './inventory.js';
import { createBackup, readBackup, restoreBackup, trashSkill } from './trash.js';
import {
  checkSkill,
  fetchDefaultBranch,
  fetchTree,
  hashShape,
  listSkillsFromTree,
  parseSource,
  planToken,
  resolveCommit,
  skillTreeSha,
  snapshotId,
} from './updates.js';

const QUEUE_LIMIT = 8;

export class ServiceError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function nowIso() {
  return new Date().toISOString();
}

// skills CLI 对任意 GitHub 仓库走 git clone；没装 git 时它把错误打在 stdout（spinner）里
const GIT_MISSING_RE = /spawn git ENOENT|git: command not found|not recognized as an internal or external command/i;

/** 把 CLI 的 add 失败翻译成可执行错误；git 缺失时不要只给一句 spawn ENOENT。 */
function cliAddFailure(result, action) {
  const detail = {
    code: result.code,
    stderr: (result.stderr || '').slice(-2000),
    stdout: (result.stdout || '').slice(-2000),
  };
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (GIT_MISSING_RE.test(output)) {
    return new ServiceError(
      'error.skills.git-missing',
      '安装/更新技能需要本机有 git（skills CLI 会 clone 仓库）；请安装 git 后重试',
      detail,
    );
  }
  return new ServiceError('error.skills.cli-failed', `skills ${action} 失败`, detail);
}

/** 本机时区的 `HH:mm`。手写而不是 `toLocaleTimeString`：不受 ICU / locale 差异影响。 */
function formatClock(ms) {
  const at = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * 上游失败 → 可执行错误（T1）。四类必须互不相同，否则用户只知道「读不到」，
 * 不知道该等、该改来源，还是该查网络。
 */
function upstreamError(source, failure) {
  const status = failure?.status ?? null;
  const resetAt = failure?.resetAt ?? null;
  const detail = { source, status, resetAt, error: failure?.error ?? null };
  if (failure?.rateLimited) {
    const resume = resetAt ? `约 ${formatClock(resetAt)} 后自动恢复；` : '';
    return new ServiceError(
      'error.skills.rate-limited',
      `GitHub 接口已限流（匿名 60 次/小时，按出口 IP 共享）。${resume}设置 GITHUB_TOKEN 可提到 5000 次/小时`,
      detail,
    );
  }
  if (status === 404) {
    return new ServiceError('error.skills.repo-not-found', `读不到 ${source}：仓库不存在或为私有`, detail);
  }
  if (status === 401 || status === 403) {
    return new ServiceError('error.skills.repo-forbidden', `读取 ${source} 被拒绝（HTTP ${status}）`, detail);
  }
  if (status) {
    return new ServiceError('error.skills.upstream-failed', `读取 ${source} 失败：HTTP ${status}`, detail);
  }
  return new ServiceError('error.skills.network', '无法连接 GitHub（网络或代理问题）', detail);
}

/** `skills add --json` 的输出：数组或 `{ installed: [...] }`，只取 name 并去重。 */
function installedNamesFrom(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.installed) ? parsed.installed : [];
    const names = rows.map((row) => (typeof row === 'string' ? row : row?.name)).filter(Boolean);
    return [...new Set(names)];
  } catch {
    return [];
  }
}

/** 极简 frontmatter 解析：只取 CLI 安装必需的两项（name / description）。 */
function parseSkillFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(String(text || ''));
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const fields = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || /^\s/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    if (key !== 'name' && key !== 'description') continue;
    let value = line.slice(colon + 1).trim();
    const block = /^([|>])[+-]?$/.exec(value);
    if (block) {
      const folded = block[1] === '>';
      const rows = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        rows.push(lines[index + 1].replace(/^\s+/, ''));
        index += 1;
      }
      value = folded ? rows.join(' ') : rows.join('\n');
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
    fields[key] = value.trim();
  }
  return fields;
}

/** 用 raw 内容补 frontmatter 里的真实技能名/描述（CLI 按 name 安装）；取不到就回落目录名。 */
async function enrichSkillEntries({ source, ref, entries, token, fetchImpl, concurrency = 8 }) {
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

async function inspectSkillEntry({ source, ref, entry, token, fetchImpl }) {
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

/** 写操作全局单写者队列：`add` 会同时改 canonical 与 lock，按技能分桶没有意义（设计 §14.3）。 */
function createQueue(logger) {
  let chain = Promise.resolve();
  let pending = 0;
  const enqueue = function enqueue(label, task) {
    if (pending >= QUEUE_LIMIT) {
      throw new ServiceError('error.skills.queue-full', '写操作排队过多，请稍后重试');
    }
    pending += 1;
    const run = chain.then(
      () => task(),
      () => task(),
    );
    chain = run.then(
      () => {
        pending -= 1;
      },
      () => {
        pending -= 1;
      },
    );
    logger('queue.run', { label, pending });
    return run;
  };
  enqueue.pending = () => pending;
  return enqueue;
}



export function createService({ paths, store, registry, cli, logger, env = process.env, fetchImpl = fetch, visibleProvider = async () => ({ skills: [], complete: true }), workspacesProvider = async () => [] }) {
  const enqueue = createQueue(logger);
  const tokenOf = (env.GITHUB_TOKEN || env.GH_TOKEN) || null;
  const git = createGit({ env, logger });
  // 探测缓存：同一来源短时间内重复检测直接复用；并发的相同请求合并成一次（不重复烧 API 配额）
  const probeCache = new Map();
  const PROBE_TTL_MS = 60_000;
  const PROBE_MAX = 50;

  function state() {
    return store.state;
  }

  function assertWritable() {
    if (store.readOnly) throw new StateReadOnlyError(store.problem);
  }

  /** 所有会调 CLI 的写操作共用；缺失时给 400，不要把裸 CliUnavailableError 漏成 500。 */
  async function requireUsableCli() {
    const capabilities = await cli.capabilities();
    if (!capabilities.usable) {
      throw new ServiceError(
        'error.skills.cli-missing',
        'skills CLI 不可用或不支持 --json/--full-depth，写操作已禁用',
        capabilities,
      );
    }
    return capabilities;
  }

  function detectedTargets() {
    return registry.detected();
  }

  function defaultTargets(current) {
    const targets = ['dsh-global'];
    // null = 老语义「所有探测到的 Agent」；数组 = 用户在「自动接入」里勾选的那些
    const selected = current.settings.autoLinkTargets ?? null;
    for (const target of detectedTargets()) {
      if (target.kind !== 'agent') continue;
      if (selected === null || selected.includes(target.target)) targets.push(target.target);
    }
    return targets;
  }

  /** 建链：逐条幂等，冲突跳过不覆盖，失败收集错误继续。 */
  function linkSkill(name, targets, { scopeProjects = [], record = true } = {}) {
    const created = [];
    const skipped = [];
    const failed = [];
    const canonicalPath = path.join(paths.canonical, name);
    if (!fs.existsSync(canonicalPath)) {
      throw new ServiceError('error.skills.not-installed', `${name} 不在 canonical 里`);
    }

    const resolved = [];
    for (const target of targets) {
      try {
        resolved.push(registry.resolve(target));
      } catch (error) {
        failed.push({ target, reason: error.message });
      }
    }
    // 作用范围非空 = 只写项目链，不写全局链（否则项目链没有额外效果，见 §4.6）
    for (const root of scopeProjects) {
      resolved.push(registry.resolve(`project:${root}`));
    }
    const effective = scopeProjects.length > 0 ? resolved.filter((item) => item.target !== 'dsh-global') : resolved;

    for (const target of effective) {
      const linkPath = path.join(target.dir, name);
      const result = ensureLink({ linkPath, canonicalPath });
      if (result.created) created.push({ target: target.target, linkPath, mode: result.mode });
      else if (result.skipped) skipped.push({ target: target.target, linkPath, reason: result.state });
      if (record) recordLink(name, target, linkPath, result.mode || 'relative', result.created);
    }
    return { created, skipped, failed };
  }

  /**
   * 订阅的分支：显式 ref > 记录里的 ref > 仓库默认分支。解析成功后顺手记住，省掉下次请求。
   * 返回 `{ branch, failure }`：`failure` 原样透出 `fetchDefaultBranch` 的结构化失败，
   * 由 `readSnapshot` 决定报哪种错误（T1）。
   */
  async function branchOf(subscription, { persist = false } = {}) {
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
   * T4：REST 因**限流**或 **404** 失败时先试 git（零配额）；git 也不行才抛 T1 的错误。
   */
  async function readSnapshot(subscription, { force = false, withCommit = true, persistRef = false } = {}) {
    const source = subscription.source;
    try {
      const { branch, failure } = await branchOf(subscription, { persist: persistRef });
      if (!branch) {
        if (failure?.rateLimited || failure?.status === 404) {
          const viaGit = await gitSnapshot(subscription, { ref: subscription.ref || null });
          if (viaGit) return viaGit;
        }
        throw upstreamError(source, failure);
      }
      const result = await fetchTree({
        source,
        ref: branch,
        etag: force ? null : subscription.snapshot?.etag || null,
        token: tokenOf,
        fetchImpl,
      });
      if (result.error) {
        // 元数据已经通了，树再 404 说明是 ref 没了（不是仓库不存在）；只有限流值得转 git
        if (result.rateLimited) {
          const viaGit = await gitSnapshot(subscription, { ref: branch });
          if (viaGit) return viaGit;
          throw upstreamError(source, {
            status: result.status ?? null,
            rateLimited: true,
            resetAt: result.resetAt ?? null,
            error: result.error,
          });
        }
        throw new ServiceError('error.skills.upstream-failed', `读取 ${source}@${branch} 失败：${result.error}`, {
          source,
          ref: branch,
          status: result.status ?? null,
        });
      }
      if (result.notModified) return { notModified: true, branch };
      const entries = listSkillsFromTree({
        tree: result.tree,
        rootSha: result.rootSha,
        subpath: subscription.subpath,
        repoName: source.split('/').pop(),
      });
      const previousRoot = subscription.snapshot?.rootSha || null;
      // 探测只需要文件树，不付 resolveCommit 那一次请求
      const commit = !withCommit
        ? null
        : previousRoot && previousRoot === result.rootSha && subscription.snapshot?.commit
          ? subscription.snapshot.commit
          : await resolveCommit({ source, ref: branch, token: tokenOf, fetchImpl });
      const changed =
        !subscription.snapshot ||
        previousRoot !== result.rootSha ||
        JSON.stringify(entries) !== JSON.stringify(subscription.snapshot.entries);
      return {
        branch,
        changed,
        via: 'rest',
        tree: result.tree,
        rootSha: result.rootSha,
        snapshot: { commit, rootSha: result.rootSha, entries, fetchedAt: nowIso(), etag: result.etag },
      };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('error.skills.upstream-failed', `读取 ${source} 失败：${error?.message || error}`, {
        source,
      });
    }
  }

  /**
   * T4：用 git 组装一份与 REST 同形的快照。`etag` 恒为 `null` —— 下次刷新会完整读一次，
   * 绝不会拿旧 ETag 去冒充 304。失败返回 `null`，由调用方抛 T1 的错误。
   */
  async function gitSnapshot(subscription, { ref = null, purpose = 'snapshot' } = {}) {
    const source = subscription.source;
    const event = purpose === 'probe' ? 'git.probe' : 'git.snapshot';
    if (!git.enabled()) return null;
    const startedAt = Date.now();
    let url;
    try {
      url = git.url(source);
    } catch (error) {
      logger('git.fallback', { source, kind: error.kind || 'invalid-url', purpose });
      return null;
    }
    if (!(await git.isAvailable())) {
      logger('git.fallback', { source, kind: 'git-missing', purpose });
      return null;
    }
    try {
      let branch = ref || null;
      if (!branch) {
        const head = await git.lsRemote({ url });
        branch = head.branch || 'main';
      }
      const tree = await git.tree({ url, ref: branch });
      const entries = listSkillsFromTree({
        tree: tree.entries,
        rootSha: tree.rootSha,
        subpath: subscription.subpath,
        repoName: source.split('/').pop(),
      });
      const changed =
        !subscription.snapshot ||
        subscription.snapshot.rootSha !== tree.rootSha ||
        JSON.stringify(entries) !== JSON.stringify(subscription.snapshot.entries);
      logger(event, {
        source,
        ref: branch,
        commit: tree.commit,
        entries: entries.length,
        changed,
        ms: Date.now() - startedAt,
      });
      return {
        branch,
        changed,
        via: 'git',
        tree: tree.entries,
        rootSha: tree.rootSha,
        snapshot: { commit: tree.commit, rootSha: tree.rootSha, entries, fetchedAt: nowIso(), etag: null },
      };
    } catch (error) {
      logger('git.fallback', {
        source,
        kind: error.kind || 'clone-failed',
        message: error.message,
        purpose,
        ms: Date.now() - startedAt,
      });
      return null;
    }
  }

  /**
   * T4 commit 短路：订阅快照的 commit 与远端 HEAD 一致 → 没变化，不必请求 REST。
   * 只对「跟着默认分支」的订阅生效：盯 tag / 其他分支时 HEAD 不代表它。
   */
  async function remoteCommitUnchanged(subscription) {
    const commit = subscription.snapshot?.commit;
    if (!commit || !git.enabled()) return false;
    if (!(await git.isAvailable())) return false;
    try {
      const head = await git.lsRemote({ url: git.url(subscription.source) });
      if (subscription.ref && head.branch && subscription.ref !== head.branch) return false;
      return head.commit === commit;
    } catch (error) {
      logger('git.fallback', {
        source: subscription.source,
        kind: error.kind || 'clone-failed',
        purpose: 'refresh',
      });
      return false;
    }
  }

  /**
   * 探测走 git：`ls-remote` 拿默认分支，`clone --filter=blob:none --no-checkout` 拿整树。
   * 不占 GitHub REST 配额，也不需要 token / gh —— 出口 IP 匿名配额被耗尽时这条路仍然通。
   * 失败一律返回 `null`，由调用方回退现有 REST 路径（默认开 = 只增不减）。
   */
  async function probeViaGit({ source, ref, subpath }) {
    const result = await gitSnapshot({ source, subpath, snapshot: null }, { ref, purpose: 'probe' });
    if (!result) return null;
    return { branch: result.branch, via: 'git', snapshot: result.snapshot };
  }

  /**
   * T3.7 安装后基线补录。CLI 在拿不到树时把 64 位内容哈希写进 lock（`add.ts:2254`），
   * 「手填技能名」这条安装路径又没有快照可依 —— 装上之后用 git 把目录 tree SHA 补进
   * `installs[].treeSha`，让 T2 的判定对这条路径同样生效。
   *
   * best effort：只读临时目录；任何失败只记日志，**不改安装结果**，`treeSha` 留 null。
   */
  async function backfillBaselines({ names, source, lock, ref }) {
    if (!git.enabled() || names.length === 0) return [];
    const targets = [];
    for (const name of names) {
      const lockEntry = lock.skills?.[name];
      if (hashShape(lockEntry?.skillFolderHash || null) !== 'content') continue;
      const install = store.findInstall(name);
      if (!install || install.treeSha) continue;
      targets.push({ name, skillPath: lockEntry?.skillPath || install.skillPath || null });
    }
    if (targets.length === 0) return [];
    if (!(await git.isAvailable())) {
      logger('git.error', { source, kind: 'git-missing', purpose: 'baseline' });
      return [];
    }
    const startedAt = Date.now();
    try {
      const url = git.url(source);
      let useRef = ref || null;
      if (!useRef) useRef = (await git.lsRemote({ url })).commit;
      // 与探测共用进程内缓存：同一 (url, ref) 只 clone 一次
      const tree = await git.tree({ url, ref: useRef });
      const updated = [];
      for (const target of targets) {
        const treeSha = target.skillPath
          ? skillTreeSha({ tree: tree.entries, skillPath: target.skillPath, rootSha: tree.rootSha })
          : null;
        if (!treeSha) {
          logger('git.error', { name: target.name, kind: 'no-tree-entry', purpose: 'baseline' });
          continue;
        }
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === target.name);
          if (row && !row.treeSha) row.treeSha = treeSha;
        });
        updated.push({ name: target.name, treeSha });
      }
      if (updated.length > 0) logger('git.baseline', { source, ref: useRef, updated, ms: Date.now() - startedAt });
      return updated;
    } catch (error) {
      logger('git.error', {
        source,
        kind: error.kind || 'clone-failed',
        message: error.message,
        purpose: 'baseline',
      });
      return [];
    }
  }

  function recordLink(name, target, linkPath, mode, created) {    if (store.readOnly) return;
    const existing = state().links.find((item) => item.skill === name && item.target === target.target);
    if (existing) return;
    if (!created) return;
    store.update((draft) => {
      draft.links.push({
        skill: name,
        target: target.target,
        agentDir: target.dir,
        linkPath,
        mode,
        createdAt: nowIso(),
      });
    });
  }

  async function visibleSkills(cwd) {
    try {
      const snapshot = await visibleProvider(cwd);
      return snapshot;
    } catch (error) {
      logger('visible.failed', { error: error.message });
      return { skills: [], complete: false, error: error.message };
    }
  }

  async function workspaceList() {
    try {
      return await workspacesProvider();
    } catch (error) {
      logger('workspaces.failed', { error: error.message });
      return [];
    }
  }

  /**
   * 一条「接管」记录：只算数据，不写盘。canonical 里没有来源也能接管，
   * 只是没有订阅、检测不到更新（等于仅能启停 / 接入 / 删除）。
   */
  function adoptionRecord(name, lockEntry) {
    const canonicalPath = path.join(paths.canonical, name);
    const parsed = lockEntry?.source ? parseSource(lockEntry.source) : null;
    const source = parsed ? `${parsed.owner}/${parsed.repo}` : null;
    const ref = lockEntry?.ref || null;
    const subscriptionId = source ? snapshotId({ source, ref, subpath: null }) : null;
    const installedHash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
    const dshLink = path.join(paths.dshGlobalSkills, name);
    const live = inspectTarget({ linkPath: dshLink, canonicalPath });
    return {
      name,
      subscriptionId,
      source,
      ref,
      skillPath: lockEntry?.skillPath || `${name}/SKILL.md`,
      installedHash,
      // 之前由 CLI/别人建的 DSH 链，接管后要记成自己的（否则账本里一直是 managed-external）
      link: live.state === 'managed-external' ? { target: 'dsh-global', agentDir: paths.dshGlobalSkills, linkPath: dshLink } : null,
    };
  }

  function applyAdoptions(draft, records) {
    for (const record of records) {
      if (record.subscriptionId && !draft.subscriptions.some((item) => item.id === record.subscriptionId)) {
        draft.subscriptions.push({
          id: record.subscriptionId,
          source: record.source,
          ref: record.ref,
          subpath: null,
          skills: '*',
          lastCheck: null,
          snapshot: null,
          adopted: true,
        });
      }
      if (!draft.installs.some((item) => item.name === record.name)) {
        draft.installs.push({
          name: record.name,
          subscriptionId: record.subscriptionId,
          skillPath: record.skillPath,
          ref: record.ref,
          commit: null,
          treeSha: null,
          installedHash: record.installedHash,
          installedAt: nowIso(),
          updatedAt: nowIso(),
          mode: 'on',
          scopeProjects: [],
          backup: null,
          adopted: true,
        });
      }
      if (record.link && !draft.links.some((item) => item.skill === record.name && item.target === 'dsh-global')) {
        draft.links.push({
          skill: record.name,
          target: record.link.target,
          agentDir: record.link.agentDir,
          linkPath: record.link.linkPath,
          mode: 'relative',
          createdAt: nowIso(),
        });
      }
    }
  }

  /**
   * 自动接管：canonical 里存在、账本里还没有的技能，一次补齐。
   *
   * canonical 本身就是"已安装"的权威来源；装的时候不一定经过本插件（终端里跑 CLI、
   * 升级前的老数据），要求用户逐个点「接管」没有意义。这里只补记账，不碰任何文件。
   * 有 lock 来源的顺带建订阅，之后更新检测就能工作。
   */
  function reconcileTracking(lock) {
    if (store.readOnly || enqueue.pending() > 0) return [];
    const known = new Set(state().installs.map((item) => item.name));
    const records = [];
    for (const entry of scanCanonical(paths)) {
      // 只对目录型技能记账：平铺 .md / 悬空链接无法按目录建链与启停
      if (entry.kind !== 'dir' || known.has(entry.name)) continue;
      records.push(adoptionRecord(entry.name, lock.skills?.[entry.name] || null));
    }
    if (records.length === 0) return [];
    store.update((draft) => applyAdoptions(draft, records));
    logger('skills.reconcile', { adopted: records.map((item) => item.name) });
    return records;
  }

  return {
    paths,
    store,
    registry,

    /** 每次请求前从磁盘重读状态：别的进程（或手工编辑）改过也要立刻看见。 */
    reloadState() {
      // 有写操作在跑时不要重读：否则会把队列里刚写完但尚未落盘的状态冲掉
      if (enqueue.pending() > 0) return store.state;
      store.load();
      return store.state;
    },

    async getState({ cwd, workspace } = {}) {
      const lock = readLock(paths);
      reconcileTracking(lock);
      const visible = await visibleSkills(cwd);
      const visibleNames = new Map(visible.skills.map((item) => [item.name, item.source || item.provider || 'unknown']));
      const ledger = buildLedger({ paths, state: state(), registry, lock, visibleNames });
      const capabilities = await cli.capabilities();
      return {
        ok: true,
        readOnly: store.readOnly,
        readOnlyReason: store.problem,
        settings: state().settings,
        agents: { all: registry.all(), detected: detectedTargets() },
        subscriptions: state().subscriptions,
        workspaces: await workspaceList(),
        installs: ledger.rows,
        visible: visible.skills,
        visibleComplete: visible.complete !== false,
        visibleOnly: ledger.visibleOnly,
        checks: state().checks,
        cli: capabilities,
        paths: {
          canonical: paths.canonical,
          lock: paths.lockFile,
          dshGlobal: paths.dshGlobalSkills,
          state: paths.stateFile,
        },
        cwd: cwd || null,
        workspace: workspace || null,
        scannedAt: ledger.scannedAt,
      };
    },

    async diagnostics() {
      const capabilities = await cli.capabilities({ force: true });
      const lock = readLock(paths);
      reconcileTracking(lock);
      const rows = buildLedger({ paths, state: state(), registry, lock, visibleNames: new Map() }).rows;
      const mismatched = rows
        .filter((row) => row.managed && row.lockHash)
        .map((row) => ({
          name: row.name,
          sourceType: row.sourceType,
          hash: row.lockHash,
          paired: row.sourceType === 'github' ? /^[0-9a-f]{40}$/.test(row.lockHash) : true,
        }))
        .filter((item) => !item.paired);
      return {
        ok: true,
        cli: capabilities,
        lock: { present: lock.present, version: lock.version, entries: Object.keys(lock.skills || {}).length, problem: lock.problem },
        canonical: { path: paths.canonical, entries: rows.length },
        paths,
        hashMismatch: mismatched,
        installs: state().installs.length,
        links: state().links.length,
        subscriptions: state().subscriptions.length,
        backups: state().installs.filter((item) => item.backup).length,
      };
    },

    async setSettings(patch) {
      assertWritable();
      const detected = new Set(detectedTargets().filter((target) => target.kind === 'agent').map((target) => target.target));
      store.update((draft) => {
        if (patch.autoLinkTargets === null) {
          draft.settings.autoLinkTargets = null;
        } else if (Array.isArray(patch.autoLinkTargets)) {
          // 只接受当前探测到的 Agent，避免把任意 target 字符串写进设置
          draft.settings.autoLinkTargets = [
            ...new Set(patch.autoLinkTargets.filter((target) => typeof target === 'string' && detected.has(target))),
          ];
        } else if (typeof patch.autoLinkAgents === 'boolean') {
          // 旧客户端兼容：true = 所有探测到的 Agent
          draft.settings.autoLinkTargets = patch.autoLinkAgents ? null : [];
        }
        if (patch.placement === 'settings' || patch.placement === 'sidebar') {
          draft.settings.placement = patch.placement;
        }
      });
      return { ok: true, settings: state().settings };
    },

    async setLinks({ skill, targets = [], action = 'add', scopeProjects = [] }) {
      assertWritable();
      const install = store.findInstall(skill);
      if (!install && action !== 'add') throw new ServiceError('error.skills.not-managed', `${skill} 没有安装记录`);
      if (action === 'remove') {
        const removed = [];
        for (const target of targets) {
          const resolved = registry.resolve(target);
          const result = removeLink({ linkPath: path.join(resolved.dir, skill), canonicalPath: path.join(paths.canonical, skill) });
          if (result.removed) removed.push({ target, linkPath: path.join(resolved.dir, skill) });
        }
        if (!store.readOnly) {
          store.update((draft) => {
            draft.links = draft.links.filter((link) => !(link.skill === skill && targets.includes(link.target)));
          });
        }
        return { ok: true, removed };
      }
      return { ok: true, ...linkSkill(skill, targets, { scopeProjects }) };
    },

    async listSkillBody({ name }) {
      const candidateDirs = [path.join(paths.canonical, name), path.join(paths.canonical, `${name}.md`)];
      for (const candidate of candidateDirs) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.isDirectory()) {
            const body = await fs.promises.readFile(path.join(candidate, 'SKILL.md'), 'utf8');
            return { ok: true, name, content: body, path: path.join(candidate, 'SKILL.md') };
          }
          const body = await fs.promises.readFile(candidate, 'utf8');
          return { ok: true, name, content: body, path: candidate };
        } catch {
          // 继续找下一种形态
        }
      }
      throw new ServiceError('error.skills.not-found', `${name} 不在 canonical 里`);
    },

    /**
     * 接管：把 CLI/别人装的技能纳入追踪（补一条 installs 记录）。
     * 有 lock 来源时顺带建/复用一个订阅，否则这个技能永远不会出现在更新检测里。
     */
    async adopt({ name }) {
      assertWritable();
      const canonicalPath = path.join(paths.canonical, name);
      if (!fs.existsSync(canonicalPath)) {
        throw new ServiceError('error.skills.not-found', `${name} 不在 canonical 里`);
      }
      if (store.findInstall(name)) return { ok: true, name, already: true };
      const lock = readLock(paths);
      const lockEntry = lock.skills?.[name] || null;
      const record = adoptionRecord(name, lockEntry);
      store.update((draft) => applyAdoptions(draft, [record]));
      logger('skill.adopt', { name, subscriptionId: record.subscriptionId, lockSource: lockEntry?.source || null });
      return {
        ok: true,
        name,
        subscriptionId: record.subscriptionId,
        tracked: Boolean(record.subscriptionId),
        installedHash: record.installedHash,
        note: record.subscriptionId ? null : '没有可识别的远端来源，只能追踪本地改动，不能检测更新',
      };
    },

    async setMode({ name, mode }) {
      assertWritable();
      if (mode !== 'on' && mode !== 'off') throw new ServiceError('error.skills.bad-mode', 'mode 只能是 on / off');
      const install = store.findInstall(name);
      if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
      return enqueue(`mode:${name}`, async () => {
        const scopeProjects = install.scopeProjects || [];
        if (mode === 'off') {
          // 只摘 DSH 侧链接（全局链 + 项目链），其他 Agent 与文件一律不动
          const dshTargets = ['dsh-global', ...scopeProjects.map((root) => `project:${root}`)];
          const removed = [];
          for (const target of dshTargets) {
            const resolved = registry.resolve(target);
            const result = removeLink({
              linkPath: path.join(resolved.dir, name),
              canonicalPath: path.join(paths.canonical, name),
              force: true,
            });
            if (result.removed) removed.push(target);
          }
          store.update((draft) => {
            const row = draft.installs.find((item) => item.name === name);
            if (row) row.mode = 'off';
            draft.links = draft.links.filter(
              (link) => !(link.skill === name && dshTargets.includes(link.target)),
            );
          });
          logger('mode.off', { name, removed });
          return { ok: true, mode: 'off', removed };
        }

        const result = linkSkill(name, ['dsh-global'], { scopeProjects });
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (row) row.mode = 'on';
        });
        logger('mode.on', { name, created: result.created.length });
        return { ok: true, mode: 'on', ...result };
      });
    },

    async install({ source, subscriptionId, skills = [], commit, targets, scopeProjects = [] }) {
      assertWritable();
      await requireUsableCli();
      // 技能名可留空：有订阅快照就装快照里的条目，否则交给 CLI 的 `--skill '*'`（整仓全部）
      const requested = (skills || []).filter(Boolean);

      return enqueue('install', async () => {
        const subscription = subscriptionId
          ? state().subscriptions.find((item) => item.id === subscriptionId)
          : null;
        if (subscriptionId && !subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
        const resolvedSource = subscription ? subscription.source : source;
        if (!parseSource(resolvedSource)) throw new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');

        const snapshot = subscription?.snapshot || null;
        const planned = requested.length > 0 ? requested : (snapshot?.entries || []).map((entry) => entry.name);
        const pin = commit || snapshot?.commit || subscription?.ref || null;
        const sourceArg = pin ? `${resolvedSource}#${pin}` : resolvedSource;

        const result = await cli.add({ source: sourceArg, skills: planned });
        if (result.timedOut) throw new ServiceError('error.skills.cli-timeout', 'skills add 超时');
        if (result.code !== 0) throw cliAddFailure(result, 'add');
        // 留空时实际装了哪些技能以 CLI 的 JSON 输出为准（可能不止一个）
        const names = planned.length > 0 ? planned : installedNamesFrom(result.stdout);
        if (names.length === 0) {
          throw new ServiceError('error.skills.cli-failed', 'skills add 成功，但输出里没有安装结果，无法记账', {
            stdout: result.stdout.slice(-2000),
          });
        }

        const lock = readLock(paths);
        const installed = [];
        const warnings = [];
        for (const name of names) {
          const canonicalPath = path.join(paths.canonical, name);
          if (!fs.existsSync(canonicalPath)) {
            warnings.push({ name, warning: 'add 成功但 canonical 里没有该目录（可能被目录发现提前终止）' });
            continue;
          }
          const lockEntry = lock.skills?.[name];
          if (!lockEntry) {
            warnings.push({ name, warning: 'lock 里没有该技能的记录（来源形态不支持记账）' });
          }
          const expected = snapshot?.entries?.find((entry) => entry.name === name);
          const lockHash = lockEntry?.skillFolderHash || null;
          const shape = hashShape(lockHash);
          // 只有两边都是 40 位 tree SHA 才有可比性。限流安装时 CLI 写的是 64 位内容哈希
          // （add.ts:2254），拿它比 tree SHA 必然不等 —— 那是形态问题，不是装错了。
          if (expected?.treeSha && shape === 'tree' && hashShape(expected.treeSha) === 'tree' && lockHash !== expected.treeSha) {
            warnings.push({
              name,
              warning: 'lock 的 skillFolderHash 与快照 treeSha 不一致（可能装到了别的 commit）',
              expected: expected.treeSha,
              actual: lockHash,
            });
          }
          const installedHash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
          const record = {
            name,
            subscriptionId: subscription ? subscription.id : null,
            skillPath: lockEntry?.skillPath || expected?.skillPath || `${name}/SKILL.md`,
            ref: pin,
            commit: snapshot?.commit || null,
            // 安装那一刻的 tree 基线：lock 被写成内容哈希时，更新判定靠它（T2）
            treeSha: expected?.treeSha || null,
            installedHash,
            installedAt: nowIso(),
            updatedAt: nowIso(),
            mode: 'on',
            scopeProjects: scopeProjects || [],
            backup: null,
          };
          store.update((draft) => {
            const index = draft.installs.findIndex((item) => item.name === name);
            if (index >= 0) draft.installs[index] = { ...draft.installs[index], ...record, installedAt: draft.installs[index].installedAt };
            else draft.installs.push(record);
          });
          installed.push({ name, lockHash, lockHashShape: shape, installedHash });
        }

        const linkTargets = Array.isArray(targets) && targets.length > 0 ? targets : defaultTargets(state());
        const linkResult = { created: [], skipped: [], failed: [] };
        for (const item of installed) {
          const one = linkSkill(item.name, linkTargets, { scopeProjects });
          linkResult.created.push(...one.created);
          linkResult.skipped.push(...one.skipped);
          linkResult.failed.push(...one.failed);
        }

        // T3.7：lock 被写成 64 位内容哈希形态（限流安装）时用 git 补一条 tree 基线，
        // 否则「手填技能名」装出来的技能在更新检查里只能是 unknown。
        const baselines = await backfillBaselines({ names, source: resolvedSource, lock, ref: pin });
        for (const item of installed) {
          const filled = baselines.find((row) => row.name === item.name);
          if (filled) item.treeSha = filled.treeSha;
        }

        logger('install', { source: sourceArg, skills: names, installed: installed.length });
        return {
          ok: true,
          installed,
          links: linkResult,
          warnings,
          source: sourceArg,
        };
      });
    },

    async remove({ name }) {
      assertWritable();
      await requireUsableCli(); // 快照与体检之前就拒绝，避免留下孤儿 trash
      return enqueue(`remove:${name}`, async () => {
        const canonicalPath = path.join(paths.canonical, name);
        if (!fs.existsSync(canonicalPath)) {
          throw new ServiceError('error.skills.not-found', `${name} 不在 canonical 里`);
        }

        // ① 体检：CLI 的 remove 会把所有 agent 目录下的同名条目 rm -rf，不区分是谁建的
        const conflicts = [];
        for (const target of detectedTargets()) {
          const linkPath = path.join(target.dir, name);
          const live = inspectTarget({ linkPath, canonicalPath });
          if (live.state === 'real') conflicts.push({ target: target.target, label: target.label, linkPath, reason: 'real' });
          if (live.state === 'foreign-link' && !live.broken) {
            conflicts.push({ target: target.target, label: target.label, linkPath, reason: 'foreign-link' });
          }
        }
        if (conflicts.length > 0) {
          throw new ServiceError(
            'error.skills.remove-conflict',
            `${conflicts.map((item) => item.label).join('、')} 里有不是本插件创建的 ${name}，继续会连带删掉它`,
            { conflicts },
          );
        }

        // ② 快照进回收站（默认开，保留 7 天）
        const hash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
        const trash = trashSkill({ paths, skill: name, fromDir: canonicalPath, hash });

        // ③ 调 CLI：绝不带 -a
        const result = await cli.remove({ names: [name] });
        const cliOk = result.code === 0 && !result.timedOut;

        // ④ 清自家链接
        const cleaned = [];
        for (const link of state().links.filter((item) => item.skill === name)) {
          const outcome = removeLink({ linkPath: link.linkPath, canonicalPath, force: true });
          if (outcome.removed) cleaned.push(link.linkPath);
        }

        // ⑤ 清记账
        store.update((draft) => {
          draft.installs = draft.installs.filter((item) => item.name !== name);
          draft.links = draft.links.filter((item) => item.skill !== name);
          delete draft.checks[name];
        });

        logger('remove', { name, cliOk, trash: trash.key });
        if (!cliOk) {
          return {
            ok: false,
            code: 'error.skills.cli-failed',
            message: 'skills remove 失败；已断开本插件建立的软链，真身可能仍在 canonical',
            detail: { code: result.code, stderr: result.stderr.slice(-2000) },
            trash: trash.key,
          };
        }
        return { ok: true, name, trash: trash.key, removedLinks: cleaned };
      });
    },

    /** 只读探测来源里的 SKILL.md，供「添加技能」多选；不写 state、不建订阅。 */
    async probeSource({ source, ref, subpath }) {
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
        // 优先 git（零配额）；不启用 / 不可用 / 失败都回落到原 REST 路径
        const viaGit = await probeViaGit({
          source: canonicalSource,
          ref: requestedRef,
          subpath: requestedSubpath,
        });
        const probe =
          viaGit ||
          (await readSnapshot(
            {
              id: null,
              source: canonicalSource,
              ref: requestedRef,
              subpath: requestedSubpath,
              snapshot: null,
            },
            { force: true, withCommit: false },
          ));
        // 描述优先按 commit 抓（不可变、可缓存），没有 commit 再退回分支名
        const enrichRef = probe.snapshot?.commit || probe.branch;
        const enriched = await enrichSkillEntries({
          source: canonicalSource,
          ref: enrichRef,
          entries: probe.snapshot.entries,
          token: tokenOf,
          fetchImpl,
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
    },

    async addSubscription({ source, ref, subpath, skills = '*' }) {
      assertWritable();
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
        state().subscriptions.find((item) => item.id === id) ||
        state().subscriptions.find(
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
      const probe = await readSnapshot(candidate, { force: true });
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
        subscription: state().subscriptions.find((item) => item.id === record.id),
      };
    },

    async removeSubscription({ id, keepInstalled = true }) {
      assertWritable();
      const subscription = state().subscriptions.find((item) => item.id === id);
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
    },

    async refreshSubscription({ id, force = false }) {
      assertWritable();
      const subscription = state().subscriptions.find((item) => item.id === id);
      if (!subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
      // T4 短路：最常见的情况是「什么都没变」。先用 ls-remote 比 commit，一致就一次 REST 都不发。
      if (await remoteCommitUnchanged(subscription)) {
        const at = nowIso();
        store.update((draft) => {
          const row = draft.subscriptions.find((item) => item.id === id);
          if (row) row.lastCheck = { ...(row.lastCheck || {}), at, status: 'unchanged' };
        });
        logger('subscription.refresh', { id, notModified: true, via: 'git' });
        return {
          ok: true,
          changed: false,
          notModified: true,
          via: 'git',
          subscription: state().subscriptions.find((item) => item.id === id),
        };
      }
      let probe;
      try {
        probe = await readSnapshot(subscription, { force });
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
        subscription: state().subscriptions.find((item) => item.id === id),
      };
    },

    async checkUpdates({ names, subscriptionId } = {}) {
      const installs = state().installs.filter((install) => {
        if (names && names.length > 0 && !names.includes(install.name)) return false;
        if (subscriptionId && install.subscriptionId !== subscriptionId) return false;
        return true;
      });
      const lock = readLock(paths);
      const groups = new Map();
      for (const install of installs) {
        const subscription = state().subscriptions.find((item) => item.id === install.subscriptionId);
        if (!subscription) continue;
        // 按订阅（id 已含 source/ref/subpath）分组：不能用 `ref || 'main'` 当键，否则 null-ref 与 main 会撞车
        if (!groups.has(subscription.id)) groups.set(subscription.id, { subscription, installs: [] });
        groups.get(subscription.id).installs.push(install);
      }

      const results = [];
      for (const { subscription, installs: groupInstalls } of groups.values()) {
        // T4：与 readSnapshot 同一套语义 —— 限流 / 404 时先试 git，都失败才逐个标 unknown
        // withCommit: false：判定只需要树，别为 check 多付一次 /commits 请求
        let probe;
        try {
          probe = await readSnapshot(subscription, { withCommit: false, persistRef: true });
        } catch (error) {
          for (const install of groupInstalls) {
            results.push({
              name: install.name,
              status: 'unknown',
              detail: error.message,
              code: error.code || null,
              checkedAt: nowIso(),
            });
          }
          continue;
        }
        if (probe.notModified) {
          for (const install of groupInstalls) {
            const previousCheck = state().checks?.[install.name];
            results.push({
              name: install.name,
              status: previousCheck?.status || 'current',
              detail: 'ETag 未变，沿用上次结论',
              checkedAt: nowIso(),
            });
          }
          continue;
        }
        for (const install of groupInstalls) {
          const skillPath = lock.skills?.[install.name]?.skillPath || install.skillPath;
          const entry = probe.tree.some((item) => item.type === 'blob' && item.path === skillPath)
            ? { skillPath }
            : null;
          const verdict = checkSkill({
            lockHash: lock.skills?.[install.name]?.skillFolderHash || null,
            recordedTreeSha: install.treeSha ?? null,
            snapshotEntry: entry,
            tree: probe.tree,
            rootSha: probe.rootSha,
          });
          results.push({ name: install.name, ...verdict, via: probe.via, checkedAt: nowIso() });
        }
      }

      if (!store.readOnly) {
        store.update((draft) => {
          for (const item of results) {
            const install = draft.installs.find((row) => row.name === item.name);
            draft.checks[item.name] = {
              name: item.name,
              status: item.status,
              detail: item.detail || null,
              wouldCommit: null,
              checkedAt: item.checkedAt,
              installCommit: install?.commit || null,
            };
          }
        });
      }
      logger('updates.check', { count: results.length });
      return { ok: true, checks: results };
    },

    async planUpdate({ name }) {
      const install = store.findInstall(name);
      if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
      const subscription = state().subscriptions.find((item) => item.id === install.subscriptionId);
      if (!subscription) throw new ServiceError('error.skills.no-subscription', '该技能不属于任何订阅，无法生成更新计划');
      // 与 checkUpdates 共用一套取数语义：限流时同样能靠 git 出计划（否则「查得到更新却更不了」）
      const probe = await readSnapshot(subscription, { force: true });
      const ref = probe.branch;
      const lock = readLock(paths);
      const skillPath = lock.skills?.[name]?.skillPath || install.skillPath;
      const entry = probe.tree.find((item) => item.type === 'blob' && item.path === skillPath);
      if (!entry) throw new ServiceError('error.skills.upstream-deleted', '上游已移除该技能');
      const targetTreeSha = skillTreeSha({ tree: probe.tree, skillPath, rootSha: probe.rootSha });
      const targetCommit = probe.snapshot?.commit ?? null;
      const token = planToken({
        subscriptionId: subscription.id,
        from: install.commit || null,
        to: targetCommit,
        installedHash: install.installedHash || null,
        targetTreeSha,
      });
      logger('updates.plan', { name, targetCommit, targetTreeSha });
      return {
        ok: true,
        name,
        token,
        fromCommit: install.commit || null,
        toCommit: targetCommit,
        ref,
        targetTreeSha,
        skillPath,
        localModified: Boolean(install.installedHash) && contentHash(path.join(paths.canonical, name)) !== install.installedHash,
      };
    },

    async applyUpdate({ name, token, overwrite = false }) {
      assertWritable();
      await requireUsableCli();
      return enqueue(`apply:${name}`, async () => {
        const plan = await this.planUpdate({ name });
        if (token && token !== plan.token) {
          throw new ServiceError('error.skills.stale-plan', '计划已失效（磁盘或上游被改动过），请重新检查');
        }
        const install = store.findInstall(name);
        if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
        const canonicalPath = path.join(paths.canonical, name);
        if (plan.localModified && !overwrite) {
          throw new ServiceError('error.skills.locally-modified', '本地有改动，更新会覆盖它们；确认后带 overwrite 重试', {
            plan,
          });
        }

        const subscription = state().subscriptions.find((item) => item.id === install.subscriptionId);
        const backup = fs.existsSync(canonicalPath)
          ? createBackup({ paths, skill: name, fromDir: canonicalPath, hash: install.installedHash })
          : null;

        const sourceArg = plan.toCommit
          ? `${subscription.source}#${plan.toCommit}`
          : `${subscription.source}#${plan.ref || subscription.ref || 'main'}`;
        const result = await cli.add({ source: sourceArg, skills: [name] });
        const lock = readLock(paths);
        const lockHash = lock.skills?.[name]?.skillFolderHash || null;
        const verified = Boolean(lockHash) && lockHash === plan.targetTreeSha;
        const present = fs.existsSync(canonicalPath);

        if (result.code !== 0 || !present || !verified) {
          if (backup) restoreBackup({ backup, toDir: canonicalPath });
          const failure = result.code !== 0 ? cliAddFailure(result, 'add') : null;
          const gitMissing = failure?.code === 'error.skills.git-missing';
          logger('updates.apply.failed', { name, code: result.code, verified, present });
          const suffix = backup ? '；已回滚到上一版' : '；没有可回滚的备份';
          return {
            ok: false,
            code: gitMissing ? failure.code : 'error.skills.update-failed',
            message: gitMissing ? `${failure.message}${suffix}` : `更新失败${suffix}`,
            detail: {
              cliCode: result.code,
              verified,
              present,
              stderr: (result.stderr || '').slice(-2000),
              ...(failure?.detail || {}),
            },
            backup: backup?.key || null,
          };
        }

        const installedHash = contentHash(canonicalPath);
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (!row) return;
          row.commit = plan.toCommit;
          // 更新后基线跟着走：lock 若仍是内容哈希形态，下一次判定要用新的 tree SHA
          row.treeSha = plan.targetTreeSha || row.treeSha || null;
          row.installedHash = installedHash;
          row.updatedAt = nowIso();
          row.backup = backup ? { key: backup.key, hash: install.installedHash || null, treeSha: install.treeSha ?? null } : row.backup;
          draft.checks[name] = { name, status: 'current', detail: null, wouldCommit: null, checkedAt: nowIso(), installCommit: plan.toCommit };
        });

        // 复验软链：更新重建的是目录，链接理论上不受影响，断一条就补一条
        const relinked = linkSkill(name, ['dsh-global'], { scopeProjects: install.scopeProjects || [] });
        logger('updates.apply', { name, from: plan.fromCommit, to: plan.toCommit, backup: backup?.key });
        return { ok: true, name, fromCommit: plan.fromCommit, toCommit: plan.toCommit, backup: backup?.key || null, relinked };
      });
    },

    async rollback({ name }) {
      assertWritable();
      return enqueue(`rollback:${name}`, async () => {
        const install = store.findInstall(name);
        if (!install?.backup?.key) throw new ServiceError('error.skills.no-backup', `${name} 没有可回滚的备份`);
        const backup = readBackup({ paths, key: install.backup.key });
        if (!backup) throw new ServiceError('error.skills.no-backup', '备份目录已不存在');
        const canonicalPath = path.join(paths.canonical, name);
        restoreBackup({ backup, toDir: canonicalPath });
        const installedHash = contentHash(canonicalPath);
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (!row) return;
          row.installedHash = installedHash;
          row.updatedAt = nowIso();
          row.commit = null;
          // 回滚回去的是备份那一刻的内容，tree 基线也得跟着退回去（不知道就置空，绝不沿用新版）
          row.treeSha = install.backup.treeSha ?? null;
          draft.checks[name] = { name, status: 'unknown', detail: '已回滚，需重新检查', checkedAt: nowIso() };
        });
        logger('updates.rollback', { name, backup: install.backup.key });
        return { ok: true, name, restoredFrom: install.backup.key, installedHash };
      });
    },
  };
}


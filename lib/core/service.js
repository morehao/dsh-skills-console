import fs from 'node:fs';
import path from 'node:path';
import { StateReadOnlyError } from './state.js';
import { contentHash } from './hash.js';
import { inspectTarget, removeLink } from './links.js';
import { exportSkills, unexportSkill } from './exporter.js';
import { ensureMigrated } from './migrations.js';
import { findProjectRoot, projectSkillsDir } from './paths.js';
import { listRoots } from './roots.js';
import { createShadow, inspectShadow, removeShadow } from './shadow.js';
import { resolveVisibility } from './visibility.js';
import { buildLedger, readLock, scanCanonical } from './inventory.js';
import { readLockFile, updateLock } from './lock.js';
import { readBackup, restoreBackup, trashSkill } from './trash.js';
import { parseSkillFrontmatter } from './skill-md.js';
import { readSkillFile, readSkillTree, resolveSkillRoot, SkillFileError } from './skill-files.js';
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
import { fetchAtomCommit, snapshotFromTarball } from './remote.js';

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

/**
 * 上次检查是否已经得出可用结论。`unknown` 不是结论（是「没能判定」），
 * 所以 304 时不能拿它当「上次结论」沿用，否则待检查会一直粘着。
 */
function isSettledCheck(check) {
  const status = check?.status;
  return status === 'current' || status === 'update-available' || status === 'upstream-deleted';
}

/** 读取层错误 → ServiceError（路由只认 ServiceError → 400），保留原 code / detail。 */
function skillFileFailure(error) {
  if (error instanceof SkillFileError) {
    return new ServiceError(error.code, error.message, error.detail ?? null);
  }
  return error;
}

/** 路由参数里的技能名：在拼任何路径之前先校验，拒绝穿越/分隔符/控制字符。 */
function assertSafeSkillName(name) {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 120 ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('..') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new ServiceError('error.skills.not-found', `技能名非法: ${String(name)}`);
  }
  return name;
}

/** Native installer 的失败 → 现有通用错误码（不新增前端交互，只换 toast 文案）。 */
function installerFailure(error, source, action = '安装') {
  const code = error?.code || null;
  const status = error?.status ?? null;
  const detail = { reason: code, status, ...(error?.available ? { available: error.available } : {}) };
  if (code === 'bad-source') return new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');
  if (code === 'no-skills') return new ServiceError('error.skills.no-skills', error.message, detail);
  if (code === 'skill-not-found') {
    return new ServiceError('error.skills.no-skills', error.message, detail);
  }
  if (code === 'timeout') {
    return new ServiceError('error.skills.network', '下载技能包超时，请检查网络或代理后重试', detail);
  }
  if (code === 'tarball-too-large') {
    return new ServiceError('error.skills.install-failed', '技能包超过大小上限，已中止安装', detail);
  }
  if (code === 'http-error' && status) {
    return upstreamError(source, { status, error: error.message });
  }
  if (['lock-unsupported', 'lock-corrupt', 'lock-unreadable', 'lock-conflict', 'lock-write-failed'].includes(code)) {
    return new ServiceError('error.skills.install-failed', `${action}失败：lock 不可写或已被其他进程修改（${code}）`, detail);
  }
  return new ServiceError('error.skills.install-failed', `${action}失败：${error?.message || error}`, detail);
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



export function createService({
  paths,
  store,
  registry,
  installer = null,
  logger,
  env = process.env,
  fetchImpl = fetch,
  visibleProvider = async () => ({ skills: [], complete: true }),
  workspacesProvider = async () => [],
}) {
  const enqueue = createQueue(logger);
  const tokenOf = (env.GITHUB_TOKEN || env.GH_TOKEN) || null;
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

  /** `/state.cli` 兼容字段：`usable` 由 native installer 与 lock 的可写性决定。 */
  function nativeCapabilities() {
    const capabilities = installer?.readiness?.() || {
      usable: false,
      source: 'missing',
      version: null,
      json: false,
      fullDepth: false,
      problem: 'installer-missing',
    };
    return capabilities;
  }

  /** 安装/更新/删除写操作的就绪门禁：只看 native installer 与 lock 的可写性。 */
  async function requireInstaller() {
    const capabilities = nativeCapabilities();
    if (!capabilities.usable) {
      throw new ServiceError(
        'error.skills.installer-unavailable',
        '本地安装器不可用（lock 版本/权限异常），写操作已禁用',
        capabilities,
      );
    }
    return capabilities;
  }



  function detectedTargets() {
    return registry.detected();
  }

  /**
   * 新安装/更新时默认导出的目标。v2 起默认空：导出是逐 agent 的显式动作，
   * 「装完就到处建链」正是 v1 那套「链接 = 可见性」的残留。
   */
  /**
   * 这个 agent 需要导出吗？判据由注册表算好（`exportable`）：读共享根的不需要、
   * DSH 自己的扫描根也不需要。`unknown` 仍然算「需要」——没验证过就按需要处理。
   */
  function needsExport(entry) {
    return entry.exportable === true;
  }

  function exportTargetList(current) {
    const selected = Array.isArray(current.settings.exportTargets) ? current.settings.exportTargets : [];
    if (selected.length === 0) return [];
    const detected = new Set(
      detectedTargets()
        .filter((item) => needsExport(item))
        .map((item) => item.target),
    );
    return selected.filter((target) => detected.has(target));
  }

  /** 某条技能已记账的导出目标（更新后复验用；不看 settings，导出是逐技能的） */
  function exportTargetsFor(skill) {
    return [...new Set(state().exports.filter((item) => item.skill === skill).map((item) => item.target))];
  }

  /** 导出（建链）：逐条幂等，冲突跳过不覆盖，失败收集原因继续。 */
  function exportSkill(name, targets, { record = true } = {}) {
    return exportSkills({
      paths,
      registry,
      name,
      targets,
      record: record ? (row) => recordExport(name, row) : () => {},
    });
  }

  /** 停用标记的 stubPath：user 用 `~/.dsh/skills`，project 用项目根的 `.dsh/skills`。 */
  function shadowPathFor(scope, name) {
    if (scope === 'user') return path.join(paths.dshGlobalSkills, name);
    if (scope.startsWith('project:')) return path.join(projectSkillsDir(scope.slice('project:'.length)), name);
    throw new ServiceError('error.skills.bad-scope', `不认识的停用范围：${scope}`);
  }

  /** 校验停用范围：只接受 `user` 或能反查到真实项目根的 `project:<abs>`。 */
  function assertShadowScope({ scope = 'user', projectRoot = null }) {
    if (projectRoot) {
      const root = path.resolve(projectRoot);
      if (findProjectRoot(root, fs.existsSync) !== root) {
        throw new ServiceError('error.skills.bad-project', `${projectRoot} 不是已登记的项目根（找不到 .git）`);
      }
      return `project:${root}`;
    }
    if (scope === 'user') return 'user';
    if (typeof scope === 'string' && scope.startsWith('project:')) {
      const root = scope.slice('project:'.length);
      if (!path.isAbsolute(root)) throw new ServiceError('error.skills.bad-scope', 'project 范围必须是绝对路径');
      const resolved = path.resolve(root);
      if (findProjectRoot(resolved, fs.existsSync) !== resolved) {
        throw new ServiceError('error.skills.bad-project', `${root} 不是已注册的项目根（找不到 .git）`);
      }
      return `project:${resolved}`;
    }
    throw new ServiceError('error.skills.bad-scope', `不认识的作用范围：${scope}`);
  }

  /** 建停用标记；同位置被外部链/真实目录占用时如实拒绝（409），不做覆盖。 */
  function ensureShadow({ name, scope, canonicalPath }) {
    const stubPath = shadowPathFor(scope, name);
    const current = inspectShadow(stubPath, name);
    if (current.state === 'link') {
      // export 模式的导出链：先摘链（只摘指向 canonical 的），再建标记
      const removed = unexportSkill({ linkPath: stubPath, canonicalPath, name, allowDangling: false });
      if (!removed.removed) {
        throw new ServiceError(
          'error.skills.shadow-conflict',
          `${stubPath} 被一个不是本插件创建的链接占用，无法建立停用标记`,
          { stubPath, state: 'foreign-link', reason: removed.reason || null },
        );
      }
    }
    try {
      const result = createShadow({ stubPath, name, scope, canonicalHash: canonicalPath && fs.existsSync(canonicalPath) ? contentHash(canonicalPath) : null });
      return { ...result, stubPath, scope };
    } catch (error) {
      throw new ServiceError(
        error.code || 'error.skills.shadow-failed',
        error.message || '建立停用标记失败',
        error.detail || { stubPath, scope },
      );
    }
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
   * 数据源：REST 优先；403/429 限流时用 Atom 取 commit，再下 codeload tarball 本地扫描，
   * 不启动任何外部进程。`allowUnchanged=false` 供更新计划使用：即使 commit 没变也要拿完整树。
   */
  async function readSnapshot(
    subscription,
    { force = false, withCommit = true, persistRef = false, allowUnchanged = true } = {},
  ) {
    const source = subscription.source;
    try {
      const { branch, failure } = await branchOf(subscription, { persist: persistRef });
      if (!branch) {
        if (failure?.rateLimited) {
          return await atomSnapshot(subscription, {
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
        etag: force ? null : subscription.snapshot?.etag || null,
        token: tokenOf,
        fetchImpl,
      });
      if (result.error) {
        // 元数据已经通了，树再 404 说明是 ref 没了（不是仓库不存在）；只有限流降级
        if (result.rateLimited) {
          return await atomSnapshot(subscription, { ref: branch, allowUnchanged, rateLimit: result });
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
   * 限流兜底：Atom 取 commit，与上次一致就短路；否则 codeload tarball 解压扫描。
   * 失败统一翻成 T1 的四类错误（限流保留原始 reset 信息）。
   */
  async function atomSnapshot(subscription, { ref = null, allowUnchanged = true, rateLimit = null } = {}) {
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
    if (allowUnchanged && previous?.commit && previous.commit === atom.commit && Array.isArray(previous.entries)) {
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
  async function remoteCommitUnchanged(subscription) {
    const commit = subscription.snapshot?.commit;
    if (!commit) return false;
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

  /**
   * 记账：只在链**确实存在且指向 canonical** 时写。
   * `created: false` 但没记账 = 链是上一次运行/别人建的、我们刚接管，也要补记。
   */
  function recordExport(name, { target, agentDir, linkPath, mode }) {
    if (store.readOnly) return;
    if (state().exports.some((item) => item.skill === name && item.target === target)) return;
    store.update((draft) => {
      if (draft.exports.some((item) => item.skill === name && item.target === target)) return;
      draft.exports.push({
        skill: name,
        target,
        agentDir,
        linkPath,
        mode: mode === 'junction' ? 'junction' : 'relative',
        createdAt: nowIso(),
      });
    });
  }

  /** cwd → 项目根（最近含 .git 的祖先）。拿不到就返回 null：不能凭空造 project 扫描根。 */
  function projectRootOf(cwd) {
    if (!cwd || typeof cwd !== 'string') return null;
    const start = path.resolve(cwd);
    if (!fs.existsSync(start)) return null;
    return findProjectRoot(start, fs.existsSync);
  }

  /** 组装一次可见性视图：扫根 + 合并宿主 snapshot 的 global 层。 */
  async function visibilityFor(cwd, { withHost = true } = {}) {
    const projectRoot = projectRootOf(cwd);
    const roots = listRoots({ paths, projectRoot });
    const host = withHost ? await visibleSkills(cwd) : { skills: [], complete: true };
    const shadowPaths = new Set(state().shadows.map((item) => item.stubPath));
    const resolved = resolveVisibility({ roots, hostSkills: host.skills, shadowPaths });
    return { ...resolved, hostComplete: host.complete !== false, projectRoot };
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
    return {
      name,
      subscriptionId,
      source,
      ref,
      skillPath: lockEntry?.skillPath || `${name}/SKILL.md`,
      installedHash,
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
          enabled: true,
          backup: null,
          adopted: true,
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
      // v1 → v2 的文件侧迁移（删历史 DSH 链 / 剪悬空导出 / 补停用标记）。
      // 幂等且带 manifest：中断后下次 load 接着做。
      if (!store.readOnly && store.state.migration && store.state.migration.status !== 'done') {
        try {
          ensureMigrated({ paths, store, logger });
        } catch (error) {
          logger('state.migrate.failed', { message: error.message });
        }
      }
      return store.state;
    },

    /** 供插件 apply 时主动跑一次迁移（不必等到第一个请求）。 */
    ensureMigrated() {
      return this.reloadState();
    },

    async getState({ cwd, workspace } = {}) {
      const lock = readLock(paths);
      reconcileTracking(lock);
      const visible = await visibilityFor(cwd);
      const ledger = buildLedger({ paths, state: state(), registry, lock, visibility: visible });
      const capabilities = nativeCapabilities();
      const rowByName = new Map(ledger.rows.map((row) => [row.name, row]));
      const visibleList = [];
      for (const [name, item] of visible.byName) {
        if (!item.visible) continue;
        const row = rowByName.get(name);
        visibleList.push({
          name,
          description: row?.description ?? null,
          source: item.winnerSource,
          provider: item.hostOnly ? 'host' : 'filesystem',
          path: item.path,
          nameConflict: Boolean(item.nameConflict),
          shadowedBy: item.shadowedBy || [],
        });
      }
      return {
        ok: true,
        readOnly: store.readOnly,
        readOnlyReason: store.problem,
        // direct：canonical 就是 rank 500 的扫描根，装完即可见；
        // unscanned：canonical 被挪到扫描根之外，本插件不提供可见性兜底（/diagnostics 会报出来）
        mode: paths.canonicalScanned ? 'direct' : 'unscanned',
        settings: state().settings,
        agents: { all: registry.all(), detected: detectedTargets() },
        subscriptions: state().subscriptions,
        workspaces: await workspaceList(),
        installs: ledger.rows,
        exports: state().exports,
        shadows: state().shadows,
        roots: visible.roots,
        visible: visibleList,
        visibleComplete: visible.hostComplete && visible.complete,
        visibleErrors: visible.errors,
        visibleOnly: ledger.visibleOnly,
        checks: state().checks,
        cli: capabilities,
        paths: {
          canonical: paths.canonical,
          lock: paths.lockFile,
          dshGlobal: paths.dshGlobalSkills,
          userAgents: paths.userAgentsSkills,
          state: paths.stateFile,
        },
        cwd: cwd || null,
        projectRoot: visible.projectRoot,
        workspace: workspace || null,
        scannedAt: ledger.scannedAt,
      };
    },

    async diagnostics() {
      const capabilities = nativeCapabilities();
      const lock = readLock(paths);
      reconcileTracking(lock);
      // 诊断不传 cwd：只看 user 两个根，避免把某个项目目录的副本算成全局事实
      const visible = await visibilityFor(null);
      const rows = buildLedger({ paths, state: state(), registry, lock, visibility: visible }).rows;
      const mismatched = rows
        .filter((row) => row.managed && row.lockHash)
        .map((row) => ({
          name: row.name,
          sourceType: row.sourceType,
          hash: row.lockHash,
          paired: row.sourceType === 'github' ? /^[0-9a-f]{40}$/.test(row.lockHash) : true,
        }))
        .filter((item) => !item.paired);

      const shadows = state().shadows || [];
      const exportsRows = state().exports || [];
      const drift = {
        /** 账上有链、磁盘上没有（迁移会收缩，运行期只报告） */
        exportsMissing: exportsRows.filter((row) => !row.linkPath || !fs.existsSync(row.linkPath)),
        /** 标记还在、真身没了 */
        shadowOrphans: shadows.filter((row) => !fs.existsSync(path.join(paths.canonical, row.skill))),
        /** 标记被改坏（SKILL.md 丢了/置位被删） */
        shadowBroken: shadows.filter((row) => inspectShadow(row.stubPath, row.skill).state === 'broken'),
        /** 说不该出现的组合：界面停用、模型仍可见 */
        disabledButVisible: state().installs.filter((item) => item.enabled === false && visible.byName.get(item.name)?.visible),
        /** 界面启用、模型不可见（真身缺失，或停用标记被项目副本盖过） */
        enabledButHidden: state().installs.filter((item) => item.enabled !== false && !visible.byName.get(item.name)?.visible),
        /** 没有记账、但看着像本插件生成物的标记 */
        shadowUnrecorded: [],
      };
      const recorded = new Set(shadows.map((row) => row.stubPath));
      for (const root of visible.roots) {
        if (!root.exists) continue;
        for (const entry of visible.byName.values()) {
          for (const candidate of entry.candidates) {
            if (candidate.source !== root.source) continue;
            if (recorded.has(candidate.path)) continue;
            if (candidate.shadowed) drift.shadowUnrecorded.push({ stubPath: candidate.path, name: entry.name });
          }
        }
      }

      return {
        ok: true,
        cli: capabilities,
        mode: paths.canonicalScanned ? 'direct' : 'unscanned',
        lock: { present: lock.present, version: lock.version, entries: Object.keys(lock.skills || {}).length, problem: lock.problem },
        canonical: { path: paths.canonical, entries: rows.length, scanned: paths.canonicalScanned },
        paths,
        roots: visible.roots,
        // 环境层面的硬限制：canonical 不在任何 DSH 扫描根里时，装好的技能对 DSH 不可见。
        // 这不是「还能补救」的状态，所以在诊断里明说，而不是静默假装支持。
        warnings: paths.canonicalScanned
          ? []
          : [{
              code: 'canonical-not-scanned',
              path: paths.canonical,
              message: `canonical ${paths.canonical} 不在 DSH 的扫描根里（DSH_AGENTS_HOME 被改过？），本插件不保证技能对 DSH 可见`,
            }],
        hashMismatch: mismatched,
        installs: state().installs.length,
        exports: exportsRows.length,
        shadows: shadows.length,
        drift,
        subscriptions: state().subscriptions.length,
        backups: state().installs.filter((item) => item.backup).length,
      };
    },

    async setSettings(patch) {
      assertWritable();
      // 读共享根的 agent 不进设置：存下来也永远不会建链（exporter 会跳过），
      // 留着只会让「新安装时自动导出 · N」数出一个人人都看不见的 1。
      const detected = new Set(detectedTargets().filter((target) => needsExport(target)).map((target) => target.target));
      const onlyDetected = (list) => [
        ...new Set((Array.isArray(list) ? list : []).filter((target) => typeof target === 'string' && detected.has(target))),
      ];
      store.update((draft) => {
        if (patch.exportTargets === null) {
          draft.settings.exportTargets = [];
        } else if (Array.isArray(patch.exportTargets)) {
          draft.settings.exportTargets = onlyDetected(patch.exportTargets);
        } else if (patch.autoLinkTargets === null) {
          // v1 客户端兼容：`null` 原本表示「所有探测到的 Agent」，语义照搬成显式全导出
          draft.settings.exportTargets = onlyDetected(detectedTargets().map((item) => item.target));
        } else if (Array.isArray(patch.autoLinkTargets)) {
          draft.settings.exportTargets = onlyDetected(patch.autoLinkTargets);
        } else if (typeof patch.autoLinkAgents === 'boolean') {
          draft.settings.exportTargets = patch.autoLinkAgents
            ? onlyDetected(detectedTargets().map((item) => item.target))
            : [];
        }
        if (patch.placement === 'settings' || patch.placement === 'sidebar') {
          draft.settings.placement = patch.placement;
        }
      });
      return { ok: true, settings: state().settings };
    },

    async setExports({ skill, targets = [], action = 'add' }) {
      assertSafeSkillName(skill);
      assertWritable();
      const canonicalPath = path.join(paths.canonical, skill);
      const exists = fs.existsSync(canonicalPath);
      if (action === 'remove') {
        const rows = state().exports.filter(
          (item) => item.skill === skill && (targets.length === 0 || targets.includes(item.target)),
        );
        const removed = [];
        const failed = [];
        for (const row of rows) {
          const outcome = unexportSkill({ linkPath: row.linkPath, canonicalPath, name: skill, allowDangling: !exists });
          if (outcome.removed || outcome.reason === 'absent') removed.push(row.target);
          else failed.push({ target: row.target, reason: outcome.reason || null, linkPath: row.linkPath });
        }
        // 只清「真的删掉 / 本来就不存在」的记录：删链失败仍记账会把漂移重新长出来
        store.update((draft) => {
          draft.exports = draft.exports.filter((item) => !(item.skill === skill && removed.includes(item.target)));
        });
        logger('exports.remove', { skill, removed, failed: failed.length });
        return { ok: true, action: 'remove', removed, failed };
      }
      if (!exists) throw new ServiceError('error.skills.not-installed', `${skill} 不在 canonical 里`);
      const result = exportSkill(skill, targets);
      logger('exports.add', { skill, created: result.created.length, skipped: result.skipped.length, failed: result.failed.length });
      return { ok: true, action: 'add', ...result };
    },

    /** @deprecated v2 起叫 `setExports`；`/links` 路由别名仍指到这里 */
    async setLinks(args) {
      return this.setExports(args);
    },

    /**
     * 读技能正文 / 单个文件（只读）：`path` 是技能根内的相对路径，省略时读 SKILL.md（平铺读 `<name>.md`）。
     * 技能名与相对路径都在拼路径之前校验；越界一律 400，不落文件系统。
     */
    async listSkillBody({ name, path: relPath }) {
      assertSafeSkillName(name);
      try {
        const root = await resolveSkillRoot(paths, name);
        const file = await readSkillFile({ root: root.root, kind: root.kind, relPath });
        return {
          ok: true,
          name,
          kind: root.kind,
          relPath: file.relPath,
          path: file.path,
          content: file.content,
          meta: parseSkillFrontmatter(file.content),
          size: file.size,
          truncated: file.truncated,
          mtime: file.mtime,
        };
      } catch (error) {
        throw skillFileFailure(error);
      }
    },

    /** 列技能目录的文件树（只读，不跟随符号链接）。 */
    async listSkillFiles({ name }) {
      assertSafeSkillName(name);
      try {
        const root = await resolveSkillRoot(paths, name);
        const tree = await readSkillTree({ root: root.root, kind: root.kind });
        return {
          ok: true,
          name,
          root: tree.root,
          kind: tree.kind,
          body: tree.body,
          hasSkillMd: tree.hasSkillMd,
          files: tree.files,
          totalBytes: tree.totalBytes,
          truncated: tree.truncated,
        };
      } catch (error) {
        throw skillFileFailure(error);
      }
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

    /**
     * 停用 = 在扫描根里放标记；启用 = 删标记。
     *
     * 三条不变量：
     * - 不碰真身（canonical 与 lock 完全不动，所以「更新」不会把停用态冲掉）；
     * - 建/删标记失败就**不改台账**，宁可报错也不留「界面说停用、模型照样看见」；
     * - `force` 不在这里出现：同位置被外部链占用时如实 409。
     */
    async setMode({ name, mode, scope = 'user', projectRoot = null }) {
      assertSafeSkillName(name);
      assertWritable();
      if (mode !== 'on' && mode !== 'off') throw new ServiceError('error.skills.bad-mode', 'mode 只能是 on / off');
      const install = store.findInstall(name);
      if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
      const resolvedScope = assertShadowScope({ scope, projectRoot });
      return enqueue(`mode:${name}:${resolvedScope}`, async () => {
        const canonicalPath = path.join(paths.canonical, name);
        const stubPath = shadowPathFor(resolvedScope, name);

        if (mode === 'off') {
          if (!fs.existsSync(canonicalPath)) {
            throw new ServiceError('error.skills.not-installed', `${name} 不在 canonical 里，没有可停用的真身`);
          }
          const shadow = ensureShadow({ name, scope: resolvedScope, canonicalPath });
          store.update((draft) => {
            const row = draft.installs.find((item) => item.name === name);
            if (row) row.enabled = false;
            if (!draft.shadows.some((item) => item.skill === name && item.stubPath === stubPath)) {
              draft.shadows.push({
                skill: name,
                scope: resolvedScope,
                stubPath,
                createdAt: nowIso(),
                canonicalHash: shadow.canonicalHash || null,
              });
            }
          });
          logger('mode.off', { name, scope: resolvedScope, stubPath, created: Boolean(shadow.created) });
          return { ok: true, mode: 'off', enabled: false, scope: resolvedScope, stubPath };
        }

        const removed = removeShadow({ stubPath, name });
        if (!removed.removed && removed.reason !== 'absent') {
          throw new ServiceError(
            'error.skills.shadow-locked',
            `停用标记删不掉（${removed.reason}），技能仍是停用状态`,
            { stubPath, reason: removed.reason },
          );
        }
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (row) row.enabled = true;
          draft.shadows = draft.shadows.filter((item) => !(item.skill === name && item.stubPath === stubPath));
        });
        logger('mode.on', { name, scope: resolvedScope, removed: removed.removed });
        return { ok: true, mode: 'on', enabled: true, scope: resolvedScope, stubPath };
      });
    },

    async install({ source, subscriptionId, skills = [], commit, targets }) {
      assertWritable();
      await requireInstaller();
      const requested = (skills || []).filter(Boolean);
      for (const name of requested) assertSafeSkillName(name);

      return enqueue('install', async () => {
        const subscription = subscriptionId
          ? state().subscriptions.find((item) => item.id === subscriptionId)
          : null;
        if (subscriptionId && !subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
        const resolvedSource = subscription ? subscription.source : source;
        if (!parseSource(resolvedSource)) {
          throw new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');
        }

        // 有快照就沿用（含 commit/entries）；否则现场解析默认分支、commit 与技能清单。
        let snapshot = subscription?.snapshot || null;
        let branch = subscription?.ref || null;
        if (!commit && !snapshot?.commit) {
          const subject = subscription || { source: resolvedSource, ref: null, subpath: null, snapshot: null };
          const read = await readSnapshot(subject, { withCommit: true, force: true });
          snapshot = read.snapshot;
          branch = read.branch;
        }

        const pin = commit || snapshot?.commit || branch || subscription?.ref || null;
        if (!pin) {
          throw new ServiceError('error.skills.upstream-failed', `无法解析 ${resolvedSource} 的 commit，请稍后重试`, {
            source: resolvedSource,
          });
        }
        const sourceArg = `${resolvedSource}#${pin}`;

        let result;
        try {
          result = await installer.install({
            source: resolvedSource,
            // pin 是 commit 时按 commit 下载；只有分支时让 installer 用分支
            commit: commit || snapshot?.commit || null,
            ref: pin,
            subpath: subscription?.subpath || null,
            names: requested,
            expectedEntries: snapshot?.entries || null,
          });
        } catch (error) {
          logger('install.failed', { source: sourceArg, code: error?.code || null });
          throw installerFailure(error, resolvedSource, '安装');
        }

        const installed = [];
        const warnings = [...(result.warnings || [])];
        const recordedAt = nowIso();
        for (const item of result.installed) {
          const canonicalPath = path.join(paths.canonical, item.name);
          if (!fs.existsSync(canonicalPath)) {
            warnings.push({ name: item.name, warning: '安装成功但 canonical 里没有该目录，未能记账' });
            continue;
          }
          const installedHash = item.contentHash || contentHash(canonicalPath);
          const expected = snapshot?.entries?.find((entry) => entry.name === item.name) || null;
          const lockHash = item.lockHash ?? item.treeSha ?? null;
          const shape = hashShape(lockHash);
          const record = {
            name: item.name,
            subscriptionId: subscription ? subscription.id : null,
            skillPath: item.skillPath,
            ref: pin,
            commit: commit || snapshot?.commit || null,
            // native installer 只写 40 位 tree SHA；旧 lock 的 64 位形态仍由 checkSkill 兼容
            treeSha: item.treeSha || expected?.treeSha || null,
            installedHash,
            installedAt: recordedAt,
            updatedAt: recordedAt,
            backup: item.backup
              ? { key: item.backup, hash: item.backupHash || null, treeSha: item.backupTreeSha || null }
              : null,
          };
          store.update((draft) => {
            const index = draft.installs.findIndex((row) => row.name === item.name);
            if (index >= 0) {
              draft.installs[index] = {
                ...draft.installs[index],
                ...record,
                installedAt: draft.installs[index].installedAt || record.installedAt,
              };
            } else {
              // 重新安装不改变启停意图：装之前停用的，装完仍然停用
              draft.installs.push({ ...record, enabled: true });
            }
          });
          installed.push({
            name: item.name,
            lockHash,
            lockHashShape: shape,
            treeSha: record.treeSha,
            installedHash,
            backup: item.backup || null,
          });
        }

        // 导出是显式动作：默认一个都不建；请求里点名了才建
        const exportTargets = Array.isArray(targets) && targets.length > 0 ? targets : exportTargetList(state());
        const linkResult = { created: [], skipped: [], failed: [] };
        for (const item of installed) {
          const one = exportSkill(item.name, exportTargets);
          linkResult.created.push(...one.created);
          linkResult.skipped.push(...one.skipped);
          linkResult.failed.push(...one.failed);
        }

        logger('install', { source: sourceArg, skills: installed.map((item) => item.name), installed: installed.length });
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
      assertSafeSkillName(name);
      assertWritable();
      await requireInstaller(); // 快照与体检之前就拒绝，避免留下孤儿 trash
      return enqueue(`remove:${name}`, async () => {
        const canonicalPath = path.join(paths.canonical, name);
        if (!fs.existsSync(canonicalPath)) {
          throw new ServiceError('error.skills.not-found', `${name} 不在 canonical 里`);
        }

        // ① 体检：只动自己建的链接；真实目录/外来链接先拦下（前端弹窗依赖 detail.conflicts）。
        // 顺手记下「此刻确认指向 canonical 的自家链」——真身删掉之后就没法再验了。
        const conflicts = [];
        const ownLinks = [];
        const shadowStubs = new Set((state().shadows || []).map((item) => item.stubPath));
        for (const target of detectedTargets()) {
          const linkPath = path.join(target.dir, name);
          // 本插件自己的停用标记也是「真实目录」，但它就是我们要清掉的东西
          if (shadowStubs.has(linkPath)) continue;
          const live = inspectTarget({ linkPath, canonicalPath });
          if (live.state === 'real') conflicts.push({ target: target.target, label: target.label, linkPath, reason: 'real' });
          if (live.state === 'foreign-link' && !live.broken) {
            conflicts.push({ target: target.target, label: target.label, linkPath, reason: 'foreign-link' });
          }
          if (live.state === 'managed' || live.state === 'managed-external') {
            ownLinks.push({ target: target.target, linkPath, state: live.state });
          }
        }
        if (conflicts.length > 0) {
          throw new ServiceError(
            'error.skills.remove-conflict',
            `${conflicts.map((item) => item.label).join('、')} 里有不是本插件创建的 ${name}，继续会连带删掉它`,
            { conflicts },
          );
        }

        // ② 快照进回收站；lock 写失败时用它把 canonical 恢复回来
        const hash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
        const trash = trashSkill({ paths, skill: name, fromDir: canonicalPath, hash });

        // ③ installer 删 lock 条目 + canonical；失败时不留“目录没了 lock 还在”的半状态
        try {
          await installer.remove({ name });
        } catch (error) {
          if (!fs.existsSync(canonicalPath)) {
            try {
              restoreBackup({
                backup: { contentDir: path.join(trash.dir, 'content') },
                toDir: canonicalPath,
              });
            } catch (restoreError) {
              logger('remove.restore.failed', { name, message: restoreError.message });
            }
          }
          const failure = installerFailure(error, name, '删除');
          logger('remove.failed', { name, code: error?.code || null });
          const kept = fs.existsSync(canonicalPath);
          return {
            ok: false,
            code: failure.code,
            message: `${failure.message}；${kept ? '真身仍在 canonical，回收站已留快照' : '已从回收站恢复真身'}`,
            detail: failure.detail,
            trash: trash.key,
          };
        }

        // ④ 清自家导出链：只删 ① 里验证过「指向 canonical」的那些，不按 force 乱扫
        const cleaned = [];
        for (const item of ownLinks) {
          const outcome = removeLink({ linkPath: item.linkPath, canonicalPath, force: true });
          if (outcome.removed) cleaned.push(item.linkPath);
        }

        // ⑤ 清停用标记：不带它走，删除后会留一个「看不见也不存在」的幽灵目录
        const shadowResults = [];
        for (const row of (state().shadows || []).filter((item) => item.skill === name)) {
          const outcome = removeShadow({ stubPath: row.stubPath, name });
          shadowResults.push({ stubPath: row.stubPath, ...outcome });
        }

        // ⑥ 清记账
        store.update((draft) => {
          draft.installs = draft.installs.filter((item) => item.name !== name);
          draft.exports = draft.exports.filter((item) => item.skill !== name);
          draft.shadows = draft.shadows.filter((item) => item.skill !== name);
          delete draft.checks[name];
        });

        logger('remove', { name, trash: trash.key, shadows: shadowResults.length });
        return { ok: true, name, trash: trash.key, removedLinks: cleaned, removedShadows: shadowResults };
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
        // REST 优先；限流时 readSnapshot 内部用 Atom + codeload 兜底
        const probe = await readSnapshot(
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
      // 短路：最常见的情况是「什么都没变」。先用 Atom 比 commit，一致就一次 REST 都不发。
      if (await remoteCommitUnchanged(subscription)) {
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
        // 与 readSnapshot 同一套语义：限流时 Atom/codeload 兜底，失败才逐个标 unknown
        // withCommit: false：判定只需要树，别为 check 多付一次 /commits 请求
        let probe;
        try {
          probe = await readSnapshot(subscription, { withCommit: false, persistRef: true, allowUnchanged: false });
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
        // 304 只说明「树没变」，它本身不含任何树内容，能不能沿用取决于**上次有没有结论**。
        // 上次是 unknown（更早一次探测失败留下的）时，沿用就等于把「待检查」永久粘住：
        // 用户点多少次刷新都还是 unknown。此时只能无视 ETag 完整读一次，才拿得到真判定。
        if (probe.notModified && groupInstalls.some((install) => !isSettledCheck(state().checks?.[install.name]))) {
          try {
            probe = await readSnapshot(subscription, {
              force: true,
              withCommit: false,
              persistRef: true,
              allowUnchanged: false,
            });
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
      // 与 checkUpdates 共用一套取数语义；计划必须拿到完整树，所以不允许 commit 相同就短路
      const probe = await readSnapshot(subscription, { force: true, allowUnchanged: false });
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
      await requireInstaller();
      return enqueue(`apply:${name}`, async () => {
        const plan = await this.planUpdate({ name });
        if (token && token !== plan.token) {
          throw new ServiceError('error.skills.stale-plan', '计划已失效（磁盘或上游被改动过），请重新检查');
        }
        const install = store.findInstall(name);
        if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
        if (plan.localModified && !overwrite) {
          throw new ServiceError('error.skills.locally-modified', '本地有改动，更新会覆盖它们；确认后带 overwrite 重试', {
            plan,
          });
        }

        const subscription = state().subscriptions.find((item) => item.id === install.subscriptionId);
        if (!subscription) throw new ServiceError('error.skills.no-subscription', '该技能不属于任何订阅，无法更新');

        let result;
        try {
          result = await installer.install({
            source: subscription.source,
            commit: plan.toCommit || null,
            ref: plan.toCommit || plan.ref || subscription.ref || null,
            subpath: subscription.subpath,
            names: [name],
            expectedEntries: plan.targetTreeSha ? [{ name, treeSha: plan.targetTreeSha }] : [],
            strict: true,
          });
        } catch (error) {
          logger('updates.apply.failed', { name, reason: error?.code || null });
          return {
            ok: false,
            code: 'error.skills.update-failed',
            message: '更新失败；安装器已回滚到操作前状态',
            detail: { reason: error?.code || null, status: error?.status ?? null },
            backup: null,
          };
        }

        const item = result.installed?.find((row) => row.name === name);
        if (!item) {
          // 理论不可达（names 已选中且 discovery 成功）；绝不把「没装上」报成成功
          logger('updates.apply.failed', { name, reason: 'missing-installed-item' });
          return {
            ok: false,
            code: 'error.skills.update-failed',
            message: '更新失败；安装器没有返回该技能的结果',
            detail: { reason: 'missing-installed-item' },
            backup: null,
          };
        }
        const installedHash = item.contentHash || contentHash(path.join(paths.canonical, name));
        store.update((draft) => {
          const row = draft.installs.find((entry) => entry.name === name);
          if (!row) return;
          row.commit = plan.toCommit || null;
          row.treeSha = item.treeSha || plan.targetTreeSha || null;
          row.installedHash = installedHash;
          row.updatedAt = nowIso();
          row.backup = item.backup
            ? {
                key: item.backup,
                hash: item.backupHash || null,
                treeSha: item.backupTreeSha || null,
                commit: install.commit || null,
              }
            : row.backup;
          draft.checks[name] = {
            name,
            status: 'current',
            detail: null,
            wouldCommit: null,
            checkedAt: nowIso(),
            installCommit: plan.toCommit || null,
          };
        });

        // 更新重建的是 canonical 目录：导出链按原目标复验补建；停用标记还在（它不在 canonical 里），
        // 但要刷新 hash —— 否则诊断会一直报「标记与真身对不上」。
        const relinked = exportSkill(name, exportTargetsFor(name));
        if (install.enabled === false) {
          const canonicalHash = fs.existsSync(path.join(paths.canonical, name)) ? contentHash(path.join(paths.canonical, name)) : null;
          store.update((draft) => {
            for (const row of draft.shadows) {
              if (row.skill === name) row.canonicalHash = canonicalHash;
            }
          });
        }
        logger('updates.apply', { name, from: plan.fromCommit, to: plan.toCommit, backup: item.backup || null });
        return {
          ok: true,
          name,
          fromCommit: plan.fromCommit,
          toCommit: plan.toCommit || null,
          backup: item.backup || null,
          relinked,
        };
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
        // 先读 lock 再动盘：lock 损坏时直接失败，避免只回滚一半
        const lockBefore = readLockFile(paths.lockFile);
        const lockEntry = lockBefore.data?.skills?.[name] || null;
        restoreBackup({ backup, toDir: canonicalPath });
        if (lockEntry) {
          updateLock({
            lockPath: paths.lockFile,
            expectedDigest: lockBefore.digest,
            mutate: (draft) => {
              const previous = draft.skills[name];
              if (!previous) return;
              draft.skills[name] = {
                ...previous,
                ...(install.backup.treeSha ? { skillFolderHash: install.backup.treeSha } : {}),
                ...(install.backup.commit ? { ref: install.backup.commit } : {}),
                updatedAt: nowIso(),
              };
            },
          });
        }
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


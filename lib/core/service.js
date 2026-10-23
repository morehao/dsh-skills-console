import fs from 'node:fs';
import path from 'node:path';
import { StateReadOnlyError } from './state.js';
import { contentHash } from './hash.js';
import { ensureLink, inspectTarget, removeLink } from './links.js';
import { buildLedger, readLock, scanCanonical } from './inventory.js';
import { createBackup, readBackup, restoreBackup, trashSkill } from './trash.js';
import {
  checkSkill,
  fetchTree,
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

  function state() {
    return store.state;
  }

  function assertWritable() {
    if (store.readOnly) throw new StateReadOnlyError(store.problem);
  }

  function detectedTargets() {
    return registry.detected();
  }

  function defaultTargets(current) {
    const targets = ['dsh-global'];
    // null = 老语义「所有探测到的 Agent」；数组 = 用户在「自动链接」里勾选的那些
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

  function recordLink(name, target, linkPath, mode, created) {
    if (store.readOnly) return;
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
      const capabilities = await cli.capabilities();
      if (!capabilities.usable) {
        throw new ServiceError('error.skills.cli-missing', 'skills CLI 不可用或不支持 --json/--full-depth，写操作已禁用', capabilities);
      }
      const names = (skills || []).filter(Boolean);
      if (names.length === 0) throw new ServiceError('error.skills.bad-request', 'skills 不能为空');

      return enqueue('install', async () => {
        const subscription = subscriptionId
          ? state().subscriptions.find((item) => item.id === subscriptionId)
          : null;
        if (subscriptionId && !subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
        const resolvedSource = subscription ? subscription.source : source;
        if (!parseSource(resolvedSource)) throw new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');

        const snapshot = subscription?.snapshot || null;
        const pin = commit || snapshot?.commit || subscription?.ref || null;
        const sourceArg = pin ? `${resolvedSource}#${pin}` : resolvedSource;

        const result = await cli.add({ source: sourceArg, skills: names });
        if (result.timedOut) throw new ServiceError('error.skills.cli-timeout', 'skills add 超时');
        if (result.code !== 0) {
          throw new ServiceError('error.skills.cli-failed', 'skills add 失败', {
            code: result.code,
            stderr: result.stderr.slice(-2000),
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
          if (expected?.treeSha && lockEntry?.skillFolderHash && lockEntry.skillFolderHash !== expected.treeSha) {
            warnings.push({
              name,
              warning: 'lock 的 skillFolderHash 与快照 treeSha 不一致（可能装到了别的 commit）',
              expected: expected.treeSha,
              actual: lockEntry.skillFolderHash,
            });
          }
          const installedHash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
          const record = {
            name,
            subscriptionId: subscription ? subscription.id : null,
            skillPath: lockEntry?.skillPath || expected?.skillPath || `${name}/SKILL.md`,
            ref: pin,
            commit: snapshot?.commit || null,
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
          installed.push({ name, lockHash: lockEntry?.skillFolderHash || null, installedHash });
        }

        const linkTargets = Array.isArray(targets) && targets.length > 0 ? targets : defaultTargets(state());
        const linkResult = { created: [], skipped: [], failed: [] };
        for (const item of installed) {
          const one = linkSkill(item.name, linkTargets, { scopeProjects });
          linkResult.created.push(...one.created);
          linkResult.skipped.push(...one.skipped);
          linkResult.failed.push(...one.failed);
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
            message: 'skills remove 失败；已断开本插件建的链接，真身可能仍在 canonical',
            detail: { code: result.code, stderr: result.stderr.slice(-2000) },
            trash: trash.key,
          };
        }
        return { ok: true, name, trash: trash.key, removedLinks: cleaned };
      });
    },

    async addSubscription({ source, ref, subpath, skills = '*' }) {
      assertWritable();
      const parsed = parseSource(source);
      if (!parsed) throw new ServiceError('error.skills.bad-source', '订阅只接受 owner/repo 或 GitHub URL');
      const id = snapshotId({ source, ref, subpath });
      const existing = state().subscriptions.find((item) => item.id === id);
      if (existing) return { ok: true, subscription: existing, existing: true };
      const record = {
        id,
        source: `${parsed.owner}/${parsed.repo}`,
        ref: ref || null,
        subpath: subpath || null,
        skills,
        lastCheck: null,
        snapshot: null,
      };
      store.update((draft) => {
        draft.subscriptions.push(record);
      });
      return { ok: true, subscription: record, ...(await this.refreshSubscription({ id, force: true })) };
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
      const ref = subscription.ref || 'main';
      const previous = subscription.snapshot?.etag || null;
      const result = await fetchTree({
        source: subscription.source,
        ref,
        etag: force ? null : previous,
        token: tokenOf,
        fetchImpl,
      });
      if (result.error) {
        store.update((draft) => {
          const row = draft.subscriptions.find((item) => item.id === id);
          if (row) row.lastCheck = { at: nowIso(), status: 'unknown', detail: result.error };
        });
        return { ok: false, code: 'error.skills.upstream-failed', message: result.error };
      }
      if (result.notModified) {
        store.update((draft) => {
          const row = draft.subscriptions.find((item) => item.id === id);
          // 304 只刷新时间，绝不把 entries 置空
          if (row) row.lastCheck = { ...(row.lastCheck || {}), at: nowIso(), status: 'unchanged' };
        });
        return { ok: true, notModified: true, subscription: state().subscriptions.find((item) => item.id === id) };
      }

      const entries = listSkillsFromTree({
        tree: result.tree,
        rootSha: result.rootSha,
        subpath: subscription.subpath,
        repoName: subscription.source.split('/').pop(),
      });
      const previousRoot = subscription.snapshot?.rootSha || null;
      const commit =
        previousRoot && previousRoot === result.rootSha && subscription.snapshot?.commit
          ? subscription.snapshot.commit
          : await resolveCommit({ source: subscription.source, ref, token: tokenOf, fetchImpl });

      const changed =
        !subscription.snapshot ||
        previousRoot !== result.rootSha ||
        JSON.stringify(entries) !== JSON.stringify(subscription.snapshot.entries);
      store.update((draft) => {
        const row = draft.subscriptions.find((item) => item.id === id);
        if (!row) return;
        row.snapshot = { commit, rootSha: result.rootSha, entries, fetchedAt: nowIso(), etag: result.etag };
        row.lastCheck = { at: nowIso(), commit, treeEtag: result.etag, status: changed ? 'changed' : 'unchanged' };
      });
      logger('subscription.refresh', { id, entries: entries.length, changed });
      return { ok: true, changed, subscription: state().subscriptions.find((item) => item.id === id) };
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
        const key = `${subscription.source}#${subscription.ref || 'main'}`;
        if (!groups.has(key)) groups.set(key, { subscription, installs: [] });
        groups.get(key).installs.push(install);
      }

      const results = [];
      for (const { subscription, installs: groupInstalls } of groups.values()) {
        const tree = await fetchTree({
          source: subscription.source,
          ref: subscription.ref || 'main',
          etag: subscription.snapshot?.etag || null,
          token: tokenOf,
          fetchImpl,
        });
        if (tree.error) {
          for (const install of groupInstalls) {
            results.push({ name: install.name, status: 'unknown', detail: tree.error, checkedAt: nowIso() });
          }
          continue;
        }
        if (tree.notModified) {
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
          const entry = tree.tree.some((item) => item.type === 'blob' && item.path === skillPath)
            ? { skillPath }
            : null;
          const verdict = checkSkill({
            lockHash: lock.skills?.[install.name]?.skillFolderHash || null,
            snapshotEntry: entry,
            tree: tree.tree,
            rootSha: tree.rootSha,
          });
          results.push({ name: install.name, ...verdict, checkedAt: nowIso() });
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
      const tree = await fetchTree({
        source: subscription.source,
        ref: subscription.ref || 'main',
        token: tokenOf,
        fetchImpl,
      });
      if (tree.error) throw new ServiceError('error.skills.upstream-failed', tree.error);
      const lock = readLock(paths);
      const skillPath = lock.skills?.[name]?.skillPath || install.skillPath;
      const entry = tree.tree.find((item) => item.type === 'blob' && item.path === skillPath);
      if (!entry) throw new ServiceError('error.skills.upstream-deleted', '上游已移除该技能');
      const targetTreeSha = skillTreeSha({ tree: tree.tree, skillPath, rootSha: tree.rootSha });
      const targetCommit = await resolveCommit({ source: subscription.source, ref: subscription.ref || 'main', token: tokenOf, fetchImpl });
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
        targetTreeSha,
        skillPath,
        localModified: Boolean(install.installedHash) && contentHash(path.join(paths.canonical, name)) !== install.installedHash,
      };
    },

    async applyUpdate({ name, token, overwrite = false }) {
      assertWritable();
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

        const sourceArg = plan.toCommit ? `${subscription.source}#${plan.toCommit}` : `${subscription.source}#${subscription.ref || 'main'}`;
        const result = await cli.add({ source: sourceArg, skills: [name] });
        const lock = readLock(paths);
        const lockHash = lock.skills?.[name]?.skillFolderHash || null;
        const verified = Boolean(lockHash) && lockHash === plan.targetTreeSha;
        const present = fs.existsSync(canonicalPath);

        if (result.code !== 0 || !present || !verified) {
          if (backup) restoreBackup({ backup, toDir: canonicalPath });
          logger('updates.apply.failed', { name, code: result.code, verified, present });
          return {
            ok: false,
            code: 'error.skills.update-failed',
            message: backup ? '更新失败，已回滚到上一版' : '更新失败，没有可回滚的备份',
            detail: { cliCode: result.code, verified, present, stderr: result.stderr.slice(-2000) },
            backup: backup?.key || null,
          };
        }

        const installedHash = contentHash(canonicalPath);
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (!row) return;
          row.commit = plan.toCommit;
          row.installedHash = installedHash;
          row.updatedAt = nowIso();
          row.backup = backup ? { key: backup.key, hash: install.installedHash || null } : row.backup;
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
          draft.checks[name] = { name, status: 'unknown', detail: '已回滚，需重新检查', checkedAt: nowIso() };
        });
        logger('updates.rollback', { name, backup: install.backup.key });
        return { ok: true, name, restoredFrom: install.backup.key, installedHash };
      });
    },
  };
}


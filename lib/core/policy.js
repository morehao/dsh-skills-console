import fs from 'node:fs';
import path from 'node:path';
import { findProjectRoot, listRoots, ROOT_RANKS, scanSkillRoot } from './roots.js';
import { readSkillDocument } from './skill-md.js';

/**
 * 本地策略 provider（v0.4.0 起替代「~/.dsh/skills 停用桩」）。
 *
 * 它只做一件事：把 `state.installs[].enabled === false` 的 canonical 技能报告成
 * 「同名、不可调用」的候选。enabled 技能完全不报告，交给宿主 `skill-filesystem`。
 *
 * 两个硬约束（P0b 已在真实宿主上验证，见设计文档 §3.6）：
 * 1. **必须注册在每个 live agent 自己的 scope 里**：agent scope 是 preset scope 的
 *    子层，注册表「最近层直接赢」；只注册 global 层会被 preset 层的文件系统候选盖住。
 * 2. **只在 canonical 是 native winner 时才发候选**：agent 层的候选会连项目/user-dsh
 *    的同名副本一起压掉（rank 跨层不参与裁决）。所以项目 100/200、user-dsh 400
 *    有副本时 provider 必须沉默，让副本继续可见。
 *
 * 失败策略是 fail-open：读不到 state / 单个 SKILL.md 解析失败只跳过，`list` 绝不
 * 抛错——provider 抛错会让宿主把整层标记为不完整，可能让所有技能消失。
 */

/** 同层兜底 rank：只用于「两个 policy provider 都在 agent 层」这类情况。 */
export const POLICY_RANK = ROOT_RANKS['user-agents'] - 2;
export const POLICY_PROVIDER = 'dsh-skills-console-policy';
export const DISABLED_DESCRIPTION = '（已停用）';
export const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function samePath(left, right) {
  if (!left || !right) return false;
  return path.resolve(left) === path.resolve(right);
}

/** `cwd` → 项目根；缺省时**不回退** `process.cwd()`（宿主这时也只扫 user 根）。 */
function projectRootFor(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  return findProjectRoot(cwd, fs.existsSync);
}

/**
 * 每个根的扫描结果按 frontmatter `name` 合并，rank 最小者就是宿主的 native winner。
 * 返回 `Map<name, {rank, path, skillFile, source, modelInvocable}>`。
 */
function nativeWinners({ paths: pathSet, projectRoot, logger, purpose }) {
  const winners = new Map();
  for (const root of listRoots({ paths: pathSet, projectRoot, customDirs: [] })) {
    if (!root.exists) continue;
    const scanned = scanSkillRoot(root.path, (error) => {
      logger('policy.scan.failed', { purpose, source: root.source, message: error?.message || String(error) });
    });
    for (const entry of scanned.entries) {
      const previous = winners.get(entry.name);
      if (previous && previous.rank <= root.rank) continue;
      winners.set(entry.name, {
        rank: root.rank,
        path: entry.path,
        skillFile: entry.skillFile,
        source: root.source,
        modelInvocable: entry.modelInvocable !== false,
      });
    }
  }
  return winners;
}

/**
 * @param {object} options
 * @param {object} options.paths     `createPaths()` 的结果
 * @param {Function} options.getState 返回当前 state（同步）
 * @param {Function} [options.logger]
 */
export function createPolicyProvider({ paths, getState, logger = () => {} }) {
  const stateOf = () => {
    try {
      return getState() || null;
    } catch (error) {
      logger('policy.state.failed', { message: error?.message || String(error) });
      return null;
    }
  };

  /**
   * 当前 cwd 下，该项目/用户根里有没有比 canonical 更靠前的同名副本。
   * 返回 `{ projectRoot, winners }`；`winners` 在 list/get 内复用，避免重复扫根。
   */
  function scanNative(cwd, purpose) {
    return nativeWinners({ paths, projectRoot: projectRootFor(cwd), logger, purpose });
  }

  function canonicalDirOf(installName) {
    return path.join(paths.canonical, installName);
  }

  /** disabled 且真的是 canonical 目录包的行（flat `.md` 本期不支持启停）。 */
  function disabledInstalls() {
    const state = stateOf();
    if (!state || !Array.isArray(state.installs)) return [];
    const rows = [];
    for (const install of state.installs) {
      if (!install || install.enabled !== false) continue;
      if (typeof install.name !== 'string' || !SKILL_NAME_PATTERN.test(install.name)) continue;
      if (!isDirectory(canonicalDirOf(install.name))) continue;
      rows.push(install);
    }
    return rows;
  }

  const provider = {
    name: POLICY_PROVIDER,

    async list(options = {}) {
      try {
        // canonical 不在扫描根里时，发候选等于「凭空造出一个本来不可见的技能」。
        if (!paths.canonicalScanned) return [];
        const installs = disabledInstalls();
        if (installs.length === 0) return [];
        const winners = scanNative(options.cwd, 'list');
        const candidates = [];
        for (const install of installs) {
          const dir = canonicalDirOf(install.name);
          const docPath = path.join(dir, 'SKILL.md');
          let doc;
          try {
            doc = readSkillDocument(docPath);
          } catch (error) {
            logger('policy.document.failed', { name: install.name, message: error?.message || String(error) });
            continue;
          }
          const name = doc.fields?.name;
          if (typeof name !== 'string' || !SKILL_NAME_PATTERN.test(name) || !doc.fields.description) {
            // 与宿主 / roots.js 同一口径：缺 name/description 的目录本来就不被当成技能，
            // 发候选等于凭空造一个。
            logger('policy.document.invalid', { name: install.name });
            continue;
          }
          const winner = winners.get(name);
          // 项目 / user-dsh 副本赢：保持沉默，副本继续可见（P0b）。
          if (winner && !samePath(winner.skillFile, docPath)) continue;
          candidates.push({
            name,
            description: doc.fields.description || DISABLED_DESCRIPTION,
            invocation: { modelInvocable: false, userInvocable: false },
            provider: POLICY_PROVIDER,
            source: 'user-agents',
            rank: POLICY_RANK,
            locator: { kind: 'canonical', installName: install.name, name, docPath, dir },
            resourceBase: { kind: 'directory', path: dir },
            path: docPath,
            metadata: { dshSkillsConsole: { disabled: true } },
          });
        }
        return candidates;
      } catch (error) {
        logger('policy.list.failed', { message: error?.message || String(error) });
        return [];
      }
    },

    async get(candidate, options = {}) {
      try {
        const name = candidate?.name;
        const installName = candidate?.locator?.installName;
        if (typeof name !== 'string' || !SKILL_NAME_PATTERN.test(name)) return undefined;
        if (typeof installName !== 'string' || !SKILL_NAME_PATTERN.test(installName)) return undefined;
        const dir = canonicalDirOf(installName);
        const docPath = path.join(dir, 'SKILL.md');
        // 不信任候选里的任意路径：只认 canonical/<installName>/SKILL.md
        if (!samePath(candidate?.locator?.docPath, docPath) || !isDirectory(dir)) return undefined;

        const state = stateOf();
        const install = state?.installs?.find((item) => item && item.name === installName) || null;
        if (!install || install.enabled !== false) return undefined;

        // 候选可能已经陈旧：重新算一遍 winner，副本赢了就不再压它。
        const winners = scanNative(options.cwd, 'get');
        const winner = winners.get(name);
        if (winner && !samePath(winner.skillFile, docPath)) return undefined;

        let doc;
        try {
          doc = readSkillDocument(docPath);
        } catch {
          return undefined;
        }
        if (doc.fields?.name !== name || !doc.fields.description) return undefined;
        return {
          name,
          description: doc.fields.description || DISABLED_DESCRIPTION,
          invocation: { modelInvocable: false, userInvocable: false },
          source: 'user-agents',
          provider: POLICY_PROVIDER,
          resourceBase: { kind: 'directory', path: dir },
          path: docPath,
          content: doc.body,
        };
      } catch (error) {
        logger('policy.get.failed', { message: error?.message || String(error) });
        return undefined;
      }
    },
  };

  return provider;
}

/**
 * 把同一个 provider 注册到**每个 live agent 自己的 skill registry**，并跟踪
 * `agent/created` / `agent/disposed`。返回 `{ invalidate, dispose, status }`。
 *
 * `status()`：
 * - `available`：宿主有没有全局 `skills.registerProvider`（没有时启停要 409，
 *   不能写一个「界面说停用、模型照样看见」的状态）；
 * - `liveAgents` / `registered`：当前 live agent 数与成功注册数；
 * - `errors[]`：注册失败的摘要（只有 agent id / 错误码，不写技能正文）。
 */
export function installPolicyProviders(ctx, { provider, logger = () => {} } = {}) {
  const errors = [];
  const registrations = new Map();
  const invalidators = new Set();
  const liveAgents = new Set();
  const unsubscribes = [];
  let disposed = false;

  const skillsOf = () => {
    try {
      return ctx?.get?.('skills') || null;
    } catch {
      return null;
    }
  };
  const available = () => typeof skillsOf()?.registerProvider === 'function';

  function recordError(agent, code, error) {
    const row = {
      agent: agent?.id ?? null,
      code,
      message: error?.message || String(error ?? ''),
    };
    errors.push(row);
    if (errors.length > 20) errors.shift();
    logger('policy.register.failed', { agent: row.agent, code, message: row.message });
  }

  function unregister(agent) {
    const id = agent?.id;
    if (id === undefined || id === null) return;
    liveAgents.delete(id);
    const entry = registrations.get(id);
    if (!entry) return;
    registrations.delete(id);
    for (const invalidate of entry.invalidators) invalidators.delete(invalidate);
    try {
      entry.dispose?.();
    } catch (error) {
      logger('policy.dispose.failed', { agent: id, message: error?.message || String(error) });
    }
  }

  function register(agent) {
    if (disposed || !agent || agent.id === undefined || agent.id === null) return;
    // 初始 list 与 agent/created 可能重复注册同一个 agent：先撤旧的。
    if (registrations.has(agent.id)) unregister(agent);
    liveAgents.add(agent.id);
    let skills;
    try {
      skills = agent.ctx?.get?.('skills') ?? agent.ctx?.skills;
    } catch (error) {
      recordError(agent, 'agent-ctx-failed', error);
      return;
    }
    if (typeof skills?.registerProvider !== 'function') {
      recordError(agent, 'no-register-provider', null);
      return;
    }
    const entry = { invalidators: new Set(), dispose: null };
    try {
      // factory 在 registerProvider 内同步调用；注册完就能拿到 control.invalidate。
      entry.dispose = skills.registerProvider((control = {}) => {
        const invalidate = control.invalidate;
        if (typeof invalidate === 'function') {
          entry.invalidators.add(invalidate);
          invalidators.add(invalidate);
          // 宿主的 provider 被单独回收时，别让失效集合继续抓着它的闭包。
          if (control.signal && typeof control.signal.addEventListener === 'function') {
            control.signal.addEventListener('abort', () => {
              entry.invalidators.delete(invalidate);
              invalidators.delete(invalidate);
            }, { once: true });
          }
        }
        return { ...provider };
      });
    } catch (error) {
      recordError(agent, 'register-failed', error);
      return;
    }
    registrations.set(agent.id, entry);
  }

  // 初始已有 agent（宿主先建 session 再装插件时不漏）
  try {
    const agentsService = ctx?.get?.('agents');
    const initial = typeof agentsService?.list === 'function' ? agentsService.list() : [];
    for (const agent of initial || []) register(agent);
  } catch (error) {
    recordError(null, 'agents-list-failed', error);
  }

  for (const [event, handler] of [
    ['agent/created', ({ agent } = {}) => register(agent)],
    ['agent/disposed', ({ agent } = {}) => unregister(agent)],
  ]) {
    try {
      const off = ctx?.on?.(event, handler);
      if (typeof off === 'function') unsubscribes.push(off);
    } catch (error) {
      recordError(null, `${event.replace('/', '-')}-subscribe-failed`, error);
    }
  }

  return {
    /** 启停写成功后调用：宿主下次 `list` 会重新收集，模型目录随之刷新。 */
    invalidate() {
      for (const invalidate of [...invalidators]) {
        try {
          invalidate();
        } catch (error) {
          logger('policy.invalidate.failed', { message: error?.message || String(error) });
        }
      }
    },
    /** 退订事件并释放所有 scope 注册；幂等。 */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of unsubscribes.splice(0)) {
        try {
          off();
        } catch {
          /* 已卸载 */
        }
      }
      for (const id of [...registrations.keys()]) {
        const entry = registrations.get(id);
        registrations.delete(id);
        for (const invalidate of entry?.invalidators || []) invalidators.delete(invalidate);
        try {
          entry?.dispose?.();
        } catch {
          /* 已卸载 */
        }
      }
      invalidators.clear();
      liveAgents.clear();
    },
    status() {
      return {
        available: available(),
        liveAgents: liveAgents.size,
        registered: registrations.size,
        errors: errors.map((item) => ({ ...item })),
      };
    },
  };
}

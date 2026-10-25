import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSkillsDir } from './paths.js';
import { dshScanRootPaths } from './roots.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const table = JSON.parse(fs.readFileSync(path.join(here, '..', 'agent-table.json'), 'utf8'));

/** CLI agent 表里拥有独立目录的条目（`.agents/skills` 型的 universal 条目已排除，见 F23）。 */
export const CLI_AGENT_DIRS = table.entries;

/**
 * 该 agent 是否**也**读 `~/.agents/skills`（共享根）。
 *
 * `'yes'` 表示「不必导出也看得见」；`'no'` 表示确实只读自己的目录；
 * `'unknown'` 表示没验证过。表里的条目都是「有私有目录」的，所以默认 `unknown` ——
 * 有私有目录**不等于**不读共享根：OpenCode / Cursor 都有私有目录，却也都读
 * `~/.agents/skills`，这正是 v1 判断错的地方。要改某一行，先给出可复现的依据。
 */
export const SHARED_HOME_VERIFIED = Object.freeze({
  // 权威来源是 `lib/agent-table.json` 的 `universal` 位（由 `npm run sync:agents`
  // 从上游 skills CLI 的 `skillsDir === '.agents/skills'` 生成），这张表只放
  // 表里没有、或需要人工推翻上游判断的条目。加条目时写清依据与日期。
});

const TABLE_BY_KEY = new Map(CLI_AGENT_DIRS.map((entry) => [entry.key, entry]));

export function sharedHomeOf(key, entry = {}) {
  if (entry.sharedHome === 'yes' || entry.sharedHome === 'no') return entry.sharedHome;
  // 上游把「自己也读 `.agents/skills`」的 agent 标成 universal：安装只进 canonical，
  // 不给它们建链。这一位就是「需不需要导出」的答案；调用方没带 entry 时回表里查。
  const source = typeof entry.universal === 'boolean' ? entry : TABLE_BY_KEY.get(key) || entry;
  if (source.universal === true) return 'yes';
  if (source.universal === false) return 'no';
  return SHARED_HOME_VERIFIED[key] || 'unknown';
}

export class UnknownTargetError extends Error {
  constructor(target) {
    super(`unknown target: ${target}`);
    this.code = 'error.skills.unknown-target';
    this.target = target;
  }
}

/**
 * 目标注册表：`dsh-global` / `project:<abs>` / `agent:<key>` / `custom:<id>`。
 * 发现只做 `lstat` 探测根目录是否存在，不递归；不接受调用方传路径（防穿越）。
 */
export function createRegistry({ paths, getState, existsSync = fs.existsSync }) {
  // 用户级 DSH 扫描根（项目级按 projectRoot 现算）。导出资格的唯一判据从这里派生，
  // 不再靠 `kind === 'dsh'` 之类的身份判断。
  const userScanRoots = new Set(dshScanRootPaths(paths));

  /**
   * 这个目录能不能作为导出目标？不能时给出原因（与 `exportSkills` 的 skip reason 同名）。
   *
   * - `shared-home`：目标就是 canonical 自己（多一层防御，表里已排除 universal 条目）；
   * - `dsh-native-root`：目标是 DSH 的扫描根。往这里建链是把可见性伪装成链接，
   *   而扫描根里本来就有真身（direct 模式）；导出在这里没有意义；
   * - `shared-root`：该 Agent 自己也读 `~/.agents/skills`，装好就看得见。
   */
  function exportBlockedFor(dir, { sharedHome = 'unknown', projectRoot = null } = {}) {
    const resolved = path.resolve(dir);
    if (resolved === path.resolve(paths.userAgentsSkills)) return 'shared-home';
    const scanRoots = projectRoot
      ? new Set(dshScanRootPaths(paths, { projectRoot }))
      : userScanRoots;
    if (scanRoots.has(resolved)) return 'dsh-native-root';
    if (sharedHome === 'yes') return 'shared-root';
    return null;
  }

  /** 给条目补上导出资格：`exportable` 给 UI/筛选直接用，`exportBlocked` 给导出器当原因。 */
  function withExport(entry, { projectRoot = null } = {}) {
    const exportBlocked = exportBlockedFor(entry.dir, {
      sharedHome: entry.sharedHome ?? 'unknown',
      projectRoot,
    });
    return { ...entry, exportBlocked, exportable: exportBlocked === null };
  }

  function customEntries() {
    const state = typeof getState === 'function' ? getState() : getState;
    return (state?.agents?.custom || []).filter((item) => item && item.id && item.dir);
  }

  function builtinEntries() {
    return [
      {
        target: 'dsh-global',
        kind: 'dsh',
        key: 'dsh-global',
        label: 'dsh（全局）',
        dir: paths.dshGlobalSkills,
        // DSH 在 direct 模式下必然读共享根（canonical 就是 rank 500）；canonical 被挪走时
        // 这一位退回 unknown —— 那种情况本插件不提供可见性兜底（见 /diagnostics 的 warning）。
        sharedHome: paths.canonicalScanned ? 'yes' : 'unknown',
      },
      ...CLI_AGENT_DIRS.map((entry) => ({
        target: `agent:${entry.key}`,
        kind: 'agent',
        key: entry.key,
        label: entry.name,
        dir: path.join(entry.base === 'config' ? paths.configHome : paths.home, entry.dir),
        sharedHome: sharedHomeOf(entry.key, entry),
      })),
      ...customEntries().map((entry) => ({
        target: `custom:${entry.id}`,
        kind: 'custom',
        key: entry.id,
        label: entry.label || entry.id,
        dir: entry.dir,
        sharedHome: 'unknown',
      })),
    ];
  }

  function projectEntry(projectRoot) {
    return withExport({
      target: `project:${projectRoot}`,
      kind: 'project',
      key: projectRoot,
      label: path.basename(projectRoot) || projectRoot,
      dir: projectSkillsDir(projectRoot),
    }, { projectRoot });
  }

  return {
    /** 全量注册表（含不存在的条目，供 UI 展示「可接入」）。 */
    all() {
      const seen = new Set();
      return builtinEntries()
        .filter((entry) => {
          // 去重：多个 agent 可能指向同一目录（如 `.agents/skills` 已排除，这里再兜一层）
          const key = `${entry.dir}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((entry) => withExport(entry))
        .map((entry) => ({ ...entry, exists: existsSync(entry.dir) }));
    },

    /** 已探测到的目录（存在即为"这个 agent 装了"）。 */
    detected() {
      return this.all().filter((entry) => entry.exists);
    },

    project(projectRoot) {
      const entry = projectEntry(projectRoot);
      return { ...entry, exists: existsSync(entry.dir) };
    },
    resolve(target) {
      if (!target || typeof target !== 'string') throw new UnknownTargetError(target);
      if (target === 'dsh-global') return withExists(this.all().find((e) => e.target === 'dsh-global'));
      if (target.startsWith('agent:')) {
        const key = target.slice('agent:'.length);
        const found = this.all().find((e) => e.target === `agent:${key}`);
        if (!found) throw new UnknownTargetError(target);
        return found;
      }
      if (target.startsWith('custom:')) {
        const id = target.slice('custom:'.length);
        const found = this.all().find((e) => e.target === `custom:${id}`);
        if (!found) throw new UnknownTargetError(target);
        return found;
      }
      if (target.startsWith('project:')) {
        const root = target.slice('project:'.length);
        if (!path.isAbsolute(root)) throw new UnknownTargetError(target);
        return this.project(root);
      }
      throw new UnknownTargetError(target);
    },
  };

  function withExists(entry) {
    if (!entry) throw new UnknownTargetError('dsh-global');
    return { ...entry, exists: existsSync(entry.dir) };
  }
}

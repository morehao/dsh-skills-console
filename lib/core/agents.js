import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSkillsDir } from './paths.js';

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
  // 官方文档明写：全局定义同时从 `~/.config/opencode/skills/*/SKILL.md`、
  // `~/.claude/skills/*/SKILL.md` 与 `~/.agents/skills/*/SKILL.md` 载入
  // （https://opencode.ai/docs/en/skills/ ，2026-10-21）。
  opencode: 'yes',
  // Cursor 读 `~/.cursor/skills/` 与 `~/.agents/skills/` 两处
  // （https://www.cubic.dev/blog/cursor-skills ，2026-10-14）。
  cursor: 'yes',
  // Claude Code 只从 `~/.claude/skills/`（user）与 `.claude/skills/`（project）解析；
  // 上游 skills CLI 把它列为「非 universal」条目
  // （https://github.com/vercel-labs/skills/issues/851 ，2026-05-06）。
  'claude-code': 'no',
});

export function sharedHomeOf(key, entry = {}) {
  if (entry.sharedHome === 'yes' || entry.sharedHome === 'no') return entry.sharedHome;
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
 * 目标注册表：`dsh-global` / `dsh-project:<abs>` / `agent:<key>` / `custom:<id>`。
 * 发现只做 `lstat` 探测根目录是否存在，不递归；不接受调用方传路径（防穿越）。
 */
export function createRegistry({ paths, getState, existsSync = fs.existsSync }) {
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
        required: true,
        sharedHome: 'unknown',
        note: '原生 user-dsh 根（rank 400）：停用标记落在这里',
      },
      ...CLI_AGENT_DIRS.map((entry) => ({
        target: `agent:${entry.key}`,
        kind: 'agent',
        key: entry.key,
        label: entry.name,
        dir: path.join(entry.base === 'config' ? paths.configHome : paths.home, entry.dir),
        required: false,
        sharedHome: sharedHomeOf(entry.key, entry),
      })),
      ...customEntries().map((entry) => ({
        target: `custom:${entry.id}`,
        kind: 'custom',
        key: entry.id,
        label: entry.label || entry.id,
        dir: entry.dir,
        required: false,
        sharedHome: 'unknown',
      })),
    ];
  }

  function projectEntry(projectRoot) {
    return {
      target: `project:${projectRoot}`,
      kind: 'project',
      key: projectRoot,
      label: path.basename(projectRoot) || projectRoot,
      dir: projectSkillsDir(projectRoot),
      required: false,
    };
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

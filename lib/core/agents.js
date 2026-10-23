import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSkillsDir } from './paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const table = JSON.parse(fs.readFileSync(path.join(here, '..', 'agent-table.json'), 'utf8'));

/** CLI agent 表里拥有独立目录的条目（`.agents/skills` 型的 universal 条目已排除，见 F23）。 */
export const CLI_AGENT_DIRS = table.entries;

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
        note: '原生 user-dsh 根（rank 400），装完必建',
      },
      ...CLI_AGENT_DIRS.map((entry) => ({
        target: `agent:${entry.key}`,
        kind: 'agent',
        key: entry.key,
        label: entry.name,
        dir: path.join(entry.base === 'config' ? paths.configHome : paths.home, entry.dir),
        required: false,
      })),
      ...customEntries().map((entry) => ({
        target: `custom:${entry.id}`,
        kind: 'custom',
        key: entry.id,
        label: entry.label || entry.id,
        dir: entry.dir,
        required: false,
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

import os from 'node:os';
import path from 'node:path';

/**
 * 所有路径集中在这里，任何模块都不许自己拼 `~`。
 * 覆盖顺序：显式 overrides（测试）> 环境变量 > 默认值。
 */
export function createPaths(env = process.env, overrides = {}) {
  const home = overrides.home ?? env.HOME ?? os.homedir();
  // 有些 agent 把全局技能放在 XDG config 下（opencode / amp / devin…）
  const configHome = overrides.configHome ?? env.XDG_CONFIG_HOME ?? path.join(home, '.config');
  const dshHome = overrides.dshHome ?? env.DSH_HOME ?? path.join(home, '.dsh');
  const stateDir =
    overrides.stateDir ?? env.DSH_SKILLS_CONSOLE_HOME ?? path.join(dshHome, 'skills-console');
  // 宿主 user-agents 扫描根。默认 `~/.agents`；DSH_AGENTS_HOME 指到别处时 canonical
  // 就不在宿主的扫描根里了 —— 这种环境本插件不提供可见性兜底（/diagnostics 会报
  // `canonical-not-scanned`），所以这个标志只用于如实告知，不再用来切换机制。
  const defaultAgentsHome = path.join(home, '.agents');
  const agentsHome = overrides.agentsHome ?? env.DSH_AGENTS_HOME ?? defaultAgentsHome;
  // 与 skills CLI 的 getSkillLockPath 对齐：设了 XDG_STATE_HOME 时 lock 在 XDG 下
  const lockFile = env.XDG_STATE_HOME
    ? path.join(env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
    : path.join(home, '.agents', '.skill-lock.json');

  return {
    home,
    configHome,
    dshHome,
    stateDir,
    /** 宿主 user-agents 扫描根（rank 500 的父目录） */
    agentsHome,
    /** 宿主 user-agents 技能根（rank 500）：`<agentsHome>/skills` */
    userAgentsSkills: path.join(agentsHome, 'skills'),
    /** canonical 真身：CLI 唯一的落点（F1） */
    canonical: path.join(home, '.agents', 'skills'),
    /** canonical 是否就是宿主的 user-agents 扫描根（否则本插件不保证 DSH 可见性） */
    canonicalScanned: path.resolve(agentsHome) === path.resolve(defaultAgentsHome),
    /** CLI 全局 lock（F4）；XDG_STATE_HOME 优先，与 CLI 一致 */
    lockFile,
    /** DSH 原生 user-dsh 根（rank 400） */
    dshGlobalSkills: path.join(dshHome, 'skills'),
    stateFile: path.join(stateDir, 'state.json'),
    /** 技能介绍缓存（模型生成、可丢；不进 state.json 的版本化结构） */
    introFile: path.join(stateDir, 'intros.json'),
    backupsDir: path.join(stateDir, 'backups'),
    /** state 迁移的备份与 manifest（v1 → v2），与技能备份分开存 */
    migrationsDir: path.join(stateDir, 'migrations'),
    trashDir: path.join(stateDir, 'trash'),
    logFile: path.join(stateDir, 'dsh-skills-console.log'),
  };
}

/** 原生 project-dsh 根（rank 100）：`<projectRoot>/.dsh/skills`。 */
export function projectSkillsDir(projectRoot) {
  return path.join(projectRoot, '.dsh', 'skills');
}

/** 项目根 = 最近含 `.git` 的祖先，无则返回 null（F28）。 */
export function findProjectRoot(startDir, existsSync) {
  let current = path.resolve(startDir || process.cwd());
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** a 是否等于 b 或位于 b 之下（路径包含校验，防穿越）。 */
export function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

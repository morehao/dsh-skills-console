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
    overrides.stateDir ?? env.DSH_SKILLS_MANAGER_HOME ?? path.join(dshHome, 'skills-manager');

  return {
    home,
    configHome,
    dshHome,
    stateDir,
    /** canonical 真身：CLI 唯一的落点（F1） */
    canonical: path.join(home, '.agents', 'skills'),
    /** CLI 全局 lock（F4） */
    lockFile: path.join(home, '.agents', '.skill-lock.json'),
    /** DSH 原生 user-dsh 根（rank 400） */
    dshGlobalSkills: path.join(dshHome, 'skills'),
    stateFile: path.join(stateDir, 'state.json'),
    backupsDir: path.join(stateDir, 'backups'),
    trashDir: path.join(stateDir, 'trash'),
    logFile: path.join(stateDir, 'dsh-skills-manager.log'),
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

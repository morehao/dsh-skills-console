import os from 'node:os';
import path from 'node:path';
import { resolveAgentsHome, resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import type { Paths } from '../contract/paths.js';

/**
 * 所有路径集中在这里，任何模块都不许自己拼 `~`。
 * 覆盖顺序：显式 overrides（测试）> 环境变量 > 默认值。
 *
 * 权威根（`DSH_HOME` / `DSH_AGENTS_HOME`）的最终归一交给 DSH 的
 * `@deepseek-ai/dsh-home-paths`（`resolveDshHome` / `resolveAgentsHome`）。
 * 这里额外保留一小段 `~` 展开与默认值派生，**只是为了离线测试能注入合成 HOME**：
 * DSH 的 `expandHomePath` 固定用进程真实 `os.homedir()`，无法通过 `env`/`overrides`
 * 改写，直接用它会让测试读到真实 `~/.dsh`、`~/.agents`。语义与 DSH 保持一致：
 * - 空白 / 仅空格的覆盖值视为未设置（不会被当成 `''` 拼成相对路径）；
 * - 裸 `~`、`~/x`、`~\x` 按当前 home 展开；
 * - 结果 `path.resolve` 成绝对路径。
 *
 * 另外按 DSH 的约定把「可丢缓存」和「权威状态」分开：
 * 状态 / 备份 / 回收站 / 日志在 `$DSH_HOME/skills-console`，
 * 模型生成的简介缓存（可丢）在 `$DSH_HOME/cache/skills-console`（对应 `dshCachePath`）。
 */

/** 环境变量里空白值等于没设置（与 DSH 的 resolveRoot 一致）。 */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? raw : undefined;
}

/** 只展开 DSH 支持的裸 `~` / `~/...` / `~\...`，其余原样返回。 */
function expandHomePath(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(home, value.slice(2));
  return value;
}

/** 解析一个用户数据根：显式覆盖 > 环境变量 > 默认值，再做展开与绝对化。 */
function resolveRoot(configured: string | undefined, envName: string, env: NodeJS.ProcessEnv, fallback: string, home: string): string {
  const chosen = configured ?? envValue(env, envName) ?? fallback;
  return path.resolve(expandHomePath(chosen, home));
}

export interface PathOverrides { home?: string; configHome?: string; dshHome?: string; stateDir?: string; cacheDir?: string; agentsHome?: string }

export function createPaths(env: NodeJS.ProcessEnv = process.env, overrides: PathOverrides = {}): Paths {
  const rawHome = overrides.home ?? envValue(env, 'HOME') ?? os.homedir();
  const home = path.resolve(expandHomePath(rawHome, os.homedir()));
  // 有些 agent 把全局技能放在 XDG config 下（opencode / amp / devin…）
  const configHome = resolveRoot(overrides.configHome, 'XDG_CONFIG_HOME', env, path.join(home, '.config'), home);
  const dshHome = resolveDshHome(
    resolveRoot(overrides.dshHome, 'DSH_HOME', env, path.join(home, '.dsh'), home),
    env,
  );
  const stateDir = resolveRoot(
    overrides.stateDir,
    'DSH_SKILLS_CONSOLE_HOME',
    env,
    path.join(dshHome, 'skills-console'),
    home,
  );
  // 技能简介是「可丢缓存」：按 DSH 的 dshCachePath 约定放 `$DSH_HOME/cache/<插件名>`，
  // 与 state.json / 备份 / 日志分家；单独给一个 env 便于实验时整体挪走。
  const cacheDir = resolveRoot(
    overrides.cacheDir,
    'DSH_SKILLS_CONSOLE_CACHE_HOME',
    env,
    path.join(dshHome, 'cache', 'skills-console'),
    home,
  );
  // 宿主 user-agents 扫描根。默认 `~/.agents`；DSH_AGENTS_HOME 指到别处时 canonical
  // 就不在宿主的扫描根里了 —— 这种环境本插件不提供可见性兜底（/diagnostics 会报
  // `canonical-not-scanned`），所以这个标志只用于如实告知，不再用来切换机制。
  const defaultAgentsHome = path.join(home, '.agents');
  const agentsHome = resolveAgentsHome(
    resolveRoot(overrides.agentsHome, 'DSH_AGENTS_HOME', env, defaultAgentsHome, home),
    env,
  );
  // 与 skills CLI 的 getSkillLockPath 对齐：设了 XDG_STATE_HOME 时 lock 在 XDG 下
  const xdgStateHome = envValue(env, 'XDG_STATE_HOME');
  const lockFile = xdgStateHome
    ? path.resolve(expandHomePath(xdgStateHome, home), 'skills', '.skill-lock.json')
    : path.join(home, '.agents', '.skill-lock.json');
  const introFile = path.join(cacheDir, 'intros.json');

  return {
    home,
    configHome,
    dshHome,
    stateDir,
    /** 可丢缓存的根（技能简介等），与 stateDir 分开 */
    cacheDir,
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
    introFile,
    /**
     * v0.5.8 及更早版本的简介缓存放在 stateDir 下；升级后只读回退用（读旧、写新），
     * 下一次生成就会自然迁到 introFile。
     */
    introLegacyFiles: [path.join(stateDir, 'intros.json')].filter((item) => item !== introFile),
    backupsDir: path.join(stateDir, 'backups'),
    /** state 迁移的备份与 manifest（v1 → v2），与技能备份分开存 */
    migrationsDir: path.join(stateDir, 'migrations'),
    trashDir: path.join(stateDir, 'trash'),
    logFile: path.join(stateDir, 'dsh-skills-console.log'),
  };
}

/** 原生 project-dsh 根（rank 100）：`<projectRoot>/.dsh/skills`。 */
export function projectSkillsDir(projectRoot: string): string {
  return path.join(projectRoot, '.dsh', 'skills');
}

/** 项目根 = 最近含 `.git` 的祖先，无则返回 null（F28）。 */
export function findProjectRoot(startDir: string, existsSync: (candidate: string) => boolean): string | null {
  let current = path.resolve(startDir || process.cwd());
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** a 是否等于 b 或位于 b 之下（路径包含校验，防穿越）。 */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

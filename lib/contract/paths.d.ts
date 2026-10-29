/** 路径与环境解析结果。锚点：lib/core/paths.js `createPaths()` 的返回对象。 */
export interface Paths {
  home: string;
  configHome: string;
  dshHome: string;
  stateDir: string;
  /** 可丢缓存根（技能简介等），与 stateDir 分开。 */
  cacheDir: string;
  /** 宿主 user-agents 扫描根（rank 500 的父目录）。 */
  agentsHome: string;
  /** 宿主 user-agents 技能根（rank 500）：`<agentsHome>/skills`。 */
  userAgentsSkills: string;
  /** canonical 真身：CLI 唯一落点。 */
  canonical: string;
  /** canonical 是否就是宿主的 user-agents 扫描根。 */
  canonicalScanned: boolean;
  /** CLI 全局 v3 lock。 */
  lockFile: string;
  /** DSH 原生 user-dsh 根（rank 400）。 */
  dshGlobalSkills: string;
  stateFile: string;
  introFile: string;
  /** 旧版简介缓存（只读回退用）。 */
  introLegacyFiles: string[];
  backupsDir: string;
  migrationsDir: string;
  trashDir: string;
  logFile: string;
}

/** 结构化日志函数。锚点：lib/core/log.js `createLogger()`。 */
export type Logger = (event: string, context?: Record<string, unknown>) => void;

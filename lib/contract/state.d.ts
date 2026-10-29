/**
 * state.json（v4）的形状。锚点：lib/core/state.js `emptyState()` / `validateV3()` / `validateV4()`。
 *
 * 注意：`InstallRecord` 等带 `[extra: string]: unknown` 是**刻意的**——state 的写入语义是
 * 「保留未知字段」，index signature 用来表达这一点，不表示可以随便塞类型。
 */
export type InvocationMode = 'auto' | 'manual' | 'hidden';

export interface ManualMeta {
  origin: 'plugin' | 'author';
  original: 'absent' | 'true' | 'false';
  appliedAt: string;
  drift?: string | null;
  [extra: string]: unknown;
}

export interface HiddenMeta {
  disabledFile: string;
  marker: string;
  previousMode: 'auto' | 'manual';
  canonicalHash?: string | null;
  at: string;
  [extra: string]: unknown;
}

export interface InstallRecord {
  name: string;
  source?: string | null;
  skillPath?: string | null;
  mode?: InvocationMode;
  enabled?: boolean;
  legacy?: 'dsh-off';
  manual?: ManualMeta | null;
  hidden?: HiddenMeta | null;
  [extra: string]: unknown;
}

export interface ExportRecord {
  skill: string;
  target: string;
  agentDir: string;
  linkPath: string;
  mode: string;
  at: string;
  [extra: string]: unknown;
}

export interface LegacyShadow {
  skill: string;
  stubPath: string;
  reason: string;
  at: string;
  [extra: string]: unknown;
}

export interface Subscription {
  id: string;
  source: string;
  [extra: string]: unknown;
}

export interface AutoCheckState {
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: unknown;
}

export interface Settings {
  exportTargets: string[];
  placement: string;
  autoCheck: AutoCheckState;
  [extra: string]: unknown;
}

export interface AgentsState {
  custom: unknown[];
  dismissed: unknown[];
}

export interface PersistedState {
  version: number;
  settings: Settings;
  agents: AgentsState;
  subscriptions: Subscription[];
  installs: InstallRecord[];
  exports: ExportRecord[];
  legacyShadows: LegacyShadow[];
  checks: Record<string, unknown>;
  migration: unknown | null;
}

/** 迁移入口只接受「任意历史形状」——不要给 v1/v2/v3 编具体类型。 */
export type UnknownState = unknown;

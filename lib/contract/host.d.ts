/**
 * 宿主 cordis `ctx` 的最小结构化类型。
 *
 * 只描述本插件实际用到的能力，避免为类型新增 peerDependency。若执行时发现
 * `@deepseek-ai/cordis` 的 `Context` 类型更好用（本地已有该包），可替换之。
 */
export interface HostContext {
  /** 按名取宿主服务；调用点各自断言成下面的窄接口。 */
  get(name: string): any;
  effect(fn: () => void | (() => void), label?: string): void;
  /** 注册一个 cordis 服务（可选能力；旧宿主可能没有）。 */
  provide?(name: string, value: unknown): void;
  webServer: {
    register(options: { kind: 'prefix'; path: string; handler: unknown }): unknown;
  };
}

export interface SkillSnapshotItem {
  name: string;
  description?: string | null;
  source?: string | null;
  provider?: string | null;
  path?: string | null;
  invocation?: unknown;
  [extra: string]: unknown;
}

export interface SkillsService {
  snapshot(options: { cwd?: string }): Promise<{ complete: boolean; skills: SkillSnapshotItem[] }>;
  registerProvider?(...args: any[]): unknown;
}

export interface TimerService {
  interval(fn: () => void, ms: number): unknown;
  timeout(fn: () => void, ms: number): unknown;
}

export interface WorkspaceEntry {
  id: string;
  title: string;
  path: string;
  status(): Promise<string>;
}

export interface WorkspaceRegistry {
  list(): WorkspaceEntry[];
}

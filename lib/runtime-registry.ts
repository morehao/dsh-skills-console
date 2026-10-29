/**
 * 进程级 runtime registry（跨插件公共 API 设计 §5.1）。
 *
 * 目的：同一宿主进程内，console 插件与「只 import 包」的消费方（dsh-commands）共享
 * 同一个 core service，避免两个 StateStore 各写各的，在长操作结束时 last-writer-wins
 * 互相覆盖（表现为「GUI 刚装的技能消失」或「commands 写的更新被冲掉」）。
 *
 * - `Symbol.for` 保证同一进程内不同物理副本（pnpm 嵌套依赖）拿到同一个 key。
 * - RUNTIME_KEY 字符串跨版本稳定，**不要拼包版本**；版本兼容只由 `apiVersion` 判定。
 * - 顶层只初始化一个 Map，不读 profile / state / 文件系统（import 无副作用）。
 */
export interface RuntimeEntry {
  /** 当前是 1；未来按 API 语义递增。 */
  apiVersion: number;
  /** 插件实际使用的 state.json，用于诊断与精确匹配。 */
  stateFile: string;
  /** 插件装配出的 PublicApi。 */
  api: any;
}

const RUNTIME_KEY = Symbol.for('@morehao/dsh-skills-console/runtime');

type RuntimeMap = Map<string, RuntimeEntry>;

const runtimeMap: RuntimeMap = (() => {
  const store = globalThis as any;
  const existing = store[RUNTIME_KEY];
  if (existing instanceof Map) return existing;
  const created: RuntimeMap = new Map();
  store[RUNTIME_KEY] = created;
  return created;
})();

/**
 * 登记一个 runtime，返回注销函数（交给 `ctx.effect`）。
 * 注销前比对 `entry.api === 自己` 的指纹（这里用整条 entry 身份），避免 HMR 新旧交替误删新实例。
 */
export function registerRuntime(entry: RuntimeEntry): () => void {
  runtimeMap.set(entry.stateFile, entry);
  return () => {
    if (runtimeMap.get(entry.stateFile) === entry) runtimeMap.delete(entry.stateFile);
  };
}

export function findRuntimeByStateFile(stateFile: string): RuntimeEntry | undefined {
  return runtimeMap.get(stateFile);
}

export function listRuntimes(): RuntimeEntry[] {
  return [...runtimeMap.values()];
}

/** 测试/诊断用：拿到底层 key（便于在用例里直接构造假条目）。 */
export function runtimeKey(): symbol {
  return RUNTIME_KEY;
}

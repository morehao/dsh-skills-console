/**
 * 账本行与诊断。锚点：lib/core/inventory.js `buildLedger()`、
 * lib/core/policy.js `installPolicyProviders().status()`。
 *
 * 行里的很多字段是「按扫描结果拼出来的视图」，字段名以 buildLedger 的返回字面量为准；
 * 这里只钉住跨模块真正被读取的那部分，其余用 index signature 兜住。
 */
export interface ExportRow {
  target: string;
  label: string;
  dir: string | null;
  linkPath: string | null;
  /** managed / managed-external / foreign-link / real */
  state: string;
  recorded: boolean;
  broken: boolean;
  [extra: string]: unknown;
}

export interface LedgerRow {
  name: string;
  description?: string | null;
  /** 目录包 / 平铺 */
  kind: string;
  path: string;
  install: unknown | null;
  locked: boolean;
  mode: string;
  enabled: boolean;
  visible: boolean;
  parked: boolean;
  invocation: unknown;
  exports: ExportRow[];
  [extra: string]: unknown;
}

export interface PolicyErrorRow {
  agent: string | null;
  code: string;
  message: string;
}

export interface PolicyStatus {
  available: boolean;
  liveAgents: number;
  registered: number;
  errors: PolicyErrorRow[];
}

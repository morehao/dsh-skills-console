/**
 * HTTP 接口契约（Host ⇄ Web Client）。
 *
 * 真实形状由 `lib/core/service.js` 各方法返回与 `lib/routes.js` 的 `dispatch()` 组装；
 * P5 把 service/routes 迁到 TS 时，这些别名会被收窄成具体 interface，client 侧
 * `apiCall<T>()` 直接复用。现在只钉「信封」与错误码，避免过早编造字段。
 */
export interface ApiError {
  ok: false;
  code: string;
  message: string;
  detail?: unknown;
}

/** 成功响应统一带 `ok: true`，其余字段随路由而定。 */
export type ApiOk = { ok: true; [extra: string]: unknown };

export interface PluginInfo {
  name: string;
  fullName: string;
  version: string | null;
  repository: string | null;
}

export type StateResponse = ApiOk & { plugin?: PluginInfo };
export type AgentsResponse = ApiOk & { all: unknown[]; detected: unknown[] };
export type UpdatePlan = ApiOk & { token?: string; actions?: unknown[] };
export type InvocationResponse = ApiOk & { mode?: string };

/** 单条写入路径的通用结果（install / remove / setMode / setInvocation …）。 */
export type MutationResponse = ApiOk;

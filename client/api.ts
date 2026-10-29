/** Host API：统一前缀、鉴权头、JSON 错误码。 */
export const API = '/api/morehao/skills-console';

/** 成功响应的通用形态：`ok: true` + 各路由自己的字段。 */
export type ApiResult = Record<string, any>;

export interface ApiFailure extends Error {
  code?: string;
  detail?: unknown;
}

export interface ApiCallOptions {
  signal?: AbortSignal;
}

export function short(sha: string | null | undefined): string {
  return sha ? String(sha).slice(0, 7) : '';
}

/**
 * 统一请求入口。
 * `options.signal` 用于可取消的请求（技能简介生成：关抽屉就中止模型调用）。
 */
export async function apiCall<T extends ApiResult = ApiResult>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiCallOptions = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dsh-skills-console': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    ...(options.signal ? { signal: options.signal } : {}),
  });
  let json: ApiResult = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  if (!response.ok || json.ok === false) {
    const error = new Error(json.message || `HTTP ${response.status}`) as ApiFailure;
    error.code = json.code;
    error.detail = json.detail;
    throw error;
  }
  return json as T;
}

export const GITHUB_URL = 'https://github.com/morehao/dsh-skills-console';

/** 插件自身版本检查（GET）。`fresh` 跳过 Host 端 5 分钟缓存。 */
export function checkPluginUpdate({ fresh = false }: { fresh?: boolean } = {}): Promise<ApiResult> {
  return apiCall('GET', `/plugin-update${fresh ? '?fresh=1' : ''}`);
}

/** 把本插件重装到最新版（POST）。不可自动更新时抛 error.plugin-update.manual，detail 是手动命令。 */
export function applyPluginUpdate(): Promise<ApiResult> {
  return apiCall('POST', '/plugin-update/apply', {});
}

/** 拉某版本的发布说明（GitHub Release 正文）。没有则返回 null。 */
export function fetchPluginRelease(version: string | null | undefined): Promise<ApiResult> {
  return apiCall('GET', `/plugin-update/release?version=${encodeURIComponent(version || '')}`);
}

/* ------------------------------------------------------------------ *
 * 共享领域类型：client 各视图 / hooks / actions 之间传递的数据形状。
 * 只描述「被读取的字段」，Host 端真实形状见 lib/core/inventory.ts（buildLedger）与
 * lib/core/service.ts（getState）。
 * ------------------------------------------------------------------ */

/** 逐技能的导出记录行（Host `buildLedger` 的 exports 子项）。 */
export interface ExportRow {
  target: string;
  label: string;
  dir: string | null;
  linkPath: string | null;
  state: string;
  recorded: boolean;
  broken: boolean;
  [extra: string]: unknown;
}

/** 可见性诊断视图（Host `buildLedger` 的 visibility 子对象）。 */
export interface VisibilityInfo {
  dsh?: boolean;
  shadowed?: boolean;
  winnerSource?: string | null;
  sources?: Record<string, string[]>;
  winnerPath?: string | null;
  winnerIsCanonical?: boolean;
  nameConflict?: boolean;
  shadowedBy?: string[];
  policyHidden?: boolean;
  selfHidden?: boolean;
  hiddenBy?: string[];
  shadowScopeMismatch?: boolean;
  [extra: string]: unknown;
}

/** A′ park 标记视图（Host `buildLedger` 的 park 子对象）。 */
export interface ParkInfo {
  parked?: boolean;
  recorded?: boolean;
  marker?: unknown;
  previousMode?: 'auto' | 'manual';
  disabledFile?: string;
  [extra: string]: unknown;
}

/**
 * 账本行（已安装技能）：`LedgerRow` 的可读字段 + 视图实际读取的按扫描结果拼出来的字段。
 * 不直接 `extends LedgerRow`：契约里的 `install/locked/parked/invocation` 是跨模块占位字段，
 * 客户端不读它们；这里按真实用法显式声明，避免被 `[extra: string]: unknown` 吞成 unknown。
 */
export interface SkillRow {
  name: string;
  kind: string;
  path: string;
  mode: string;
  enabled: boolean;
  visible: boolean;
  description?: string | null;
  status: string;
  source?: string | null;
  commit?: string | null;
  ref?: string | null;
  currentHash?: string | null;
  lockHash?: string | null;
  installedHash?: string | null;
  installedAt?: string | null;
  updatedAt?: string | null;
  skillPath?: string | null;
  subscriptionId?: string | null;
  origin?: string | null;
  legacy?: string | null;
  drift?: boolean;
  id?: string;
  exports: ExportRow[];
  visibility?: VisibilityInfo | null;
  park?: ParkInfo | null;
  [extra: string]: unknown;
}

/** 探测到的 agent / 导出目标（Host 注册表 registry.all()/detected()）。 */
export interface AgentTarget {
  target: string;
  label: string;
  /** 'dsh' | 'agent' | 'custom' | 'project' */
  kind: string;
  dir: string;
  exists?: boolean;
  exportable?: boolean;
  exportBlocked?: string | null;
  /** 'yes' | 'no' | 'unknown' */
  sharedHome?: string;
  [extra: string]: unknown;
}

/** 订阅快照里的单个技能条目（Host `listSkillsFromTree`）。 */
export interface SubscriptionEntry {
  name: string;
  description?: string | null;
  skillPath?: string | null;
  valid?: boolean;
  [extra: string]: unknown;
}

/** 订阅快照（Host `refreshSubscription` 写入的 snapshot）。 */
export interface SubscriptionSnapshot {
  commit: string;
  rootSha?: string | null;
  entries: SubscriptionEntry[];
  fetchedAt?: string | null;
  etag?: string | null;
  [extra: string]: unknown;
}

/** 仓库订阅（state.subscriptions 的一项）。 */
export interface Subscription {
  id: string;
  source: string;
  ref?: string | null;
  subpath?: string | null;
  skills?: string;
  lastCheck?: string | null;
  adopted?: boolean;
  snapshot?: SubscriptionSnapshot | null;
  [extra: string]: unknown;
}

/** 添加订阅表单（FormModal 提交的字段）。 */
export interface SkillForm {
  source: string;
  ref: string;
  subpath: string;
}

/** 只在 /state.visibleOnly 里出现的「别人装的 / 别的 root 的」技能。 */
export interface VisibleOnlyItem {
  name: string;
  source?: string | null;
  path?: string | null;
  hostOnly?: boolean;
  [extra: string]: unknown;
}

/** 技能简介（模型生成）能力描述（Host introCapability()）。 */
export interface IntroCapability {
  enabled?: boolean;
  available?: boolean;
  provider?: string | null;
  model?: string | null;
  timeoutMs?: number;
  [extra: string]: unknown;
}

/** 插件身份（Host package.json 注入）。 */
export interface PluginInfo {
  name: string;
  fullName: string;
  version: string | null;
  repository: string | null;
  [extra: string]: unknown;
}

/** /state.cli 兼容字段。 */
export interface CliCapabilities {
  usable?: boolean;
  source?: string;
  version?: string;
  [extra: string]: unknown;
}

/** `/state` 响应的可读视图（useSkillsData 持有的 data）。 */
export interface SkillsState {
  plugin?: PluginInfo | null;
  readOnly?: boolean;
  readOnlyReason?: string | null;
  cli?: CliCapabilities | null;
  agents?: { all?: AgentTarget[]; detected?: AgentTarget[] };
  settings?: { exportTargets?: string[]; placement?: string; [extra: string]: unknown };
  subscriptions?: Subscription[];
  installs?: SkillRow[];
  intro?: IntroCapability | null;
  visibleOnly?: VisibleOnlyItem[];
  [extra: string]: unknown;
}

/** 全局 toast。 */
export interface Toast {
  kind: string;
  text: string;
}

/** 删除冲突详情（error.skills.remove-conflict 的 detail.conflicts）。 */
export interface ConflictItem {
  label: string;
  linkPath: string;
  [extra: string]: unknown;
}

export interface ConflictDetail {
  conflicts?: ConflictItem[];
  [extra: string]: unknown;
}

/** 弹窗状态：`type` 决定 Modals 分发，`row` / `onConfirm` 供确认类弹窗用。 */
export interface ModalState {
  type: string;
  row?: SkillRow | null;
  detail?: ConflictDetail | null;
  message?: string;
  onConfirm?: () => void | Promise<void>;
  [extra: string]: unknown;
}

/** 页头设置浮层的摆位。 */
export interface SettingsPlacement {
  side: 'left' | 'right';
  width: number;
}

/** “+n” Agent 气泡的状态与定位。 */
export interface AgentTipState {
  anchor: Element;
  rowName: string;
  labels: string[];
  rect: { left: number; right: number; top: number; bottom: number };
}

export interface AgentTipPosition {
  left: number;
  top: number;
}

/** run() 的签名：包住 busy / reload / toast。 */
export type RunFn = <T>(
  label: string,
  task: () => Promise<T>,
  options?: { toastError?: boolean },
) => Promise<T>;

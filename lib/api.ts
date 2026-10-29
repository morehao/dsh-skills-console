/**
 * 跨插件公共 API `@morehao/dsh-skills-console/api`（设计 §3）。
 *
 * 两条入口：
 * - `createPublicApi(service)`：唯一实现，把已装配好的 core service 包成稳定契约；
 * - `createSkillsConsole(options)`：消费方（dsh-commands）唯一使用的工厂。先查进程级
 *   runtime registry（§5.1），命中就复用插件实例，否则创建 headless 的 paths / StateStore
 *   / installer / service。与 cordis 无关，**不在 import 时产生任何副作用**。
 *
 * 只暴露 `list / adopt / install / check / update` 的返回值形状，绝不透出 state.json 内部结构。
 */
import { createInstaller } from './core/installer.js';
import { createLogger } from './core/log.js';
import { createPaths } from './core/paths.js';
import { createRegistry } from './core/agents.js';
import { createService } from './core/service.js';
import { StateStore } from './core/state.js';
import { findRuntimeByStateFile, listRuntimes } from './runtime-registry.js';
import type { RuntimeEntry } from './runtime-registry.js';

/** 硬版本：破坏性变更才递增；新增方法/字段走 minor。 */
export const API_VERSION = 1;

/** 公共错误：消费方只应依赖 `code` 与 `detail`（跨副本不要用 instanceof）。 */
export class SkillsConsoleError extends Error {
  code: string;
  detail?: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'SkillsConsoleError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export type SkillMode = 'auto' | 'manual' | 'hidden' | 'off';

export interface InstalledSkill {
  name: string;
  /** 有效可用性：auto / manual（仅 /）/ hidden（A′ park）/ off（legacy dsh-off）。 */
  mode: SkillMode;
  commit: string | null;
  treeSha: string | null;
  installedAt: string | null;
  updatedAt: string | null;
  subscriptionId: string | null;
}

export interface AdoptResult {
  name: string;
  already: boolean;
  /** lock 里有可识别来源时才有；没有来源只能追踪本地改动，不能检测更新。 */
  subscriptionId: string | null;
  tracked: boolean;
}

export interface InstallInput {
  /** owner/repo 或 GitHub URL；必填。 */
  source: string;
  /** 要装的技能名；必填且非空，避免“装该源全部技能”的误操作。 */
  skills: string[];
  ref?: string | null;
  subpath?: string | null;
  /** 默认 true：已有订阅时先刷新到最新再装；false 表示沿用订阅快照。 */
  latest?: boolean;
  /** 导出目标；默认 []（不建任何链）。只有未传（undefined）时才回退 settings.exportTargets。 */
  targets?: string[];
}

export interface InstallResult {
  ok: true;
  source: string;
  subscriptionId: string;
  commit: string | null;
  installed: Array<{ name: string; treeSha: string | null }>;
  warnings: Array<{ name: string; warning: string }>;
}

export interface CheckResult {
  ok: boolean;
  checks: Array<{ name: string; status: string; detail: string | null; checkedAt: string }>;
}

export type UpdateStatus =
  | 'updated'
  | 'current'
  | 'locally-modified'
  | 'parked'
  | 'not-managed'
  | 'no-subscription'
  | 'failed';

export interface UpdateInput {
  /** 默认：全部已纳管技能。 */
  names?: string[];
  /** 默认 false；本地有改动时返回 locally-modified，不覆盖。 */
  overwrite?: boolean;
}

export interface UpdateResult {
  ok: boolean;
  results: Array<{
    name: string;
    status: UpdateStatus;
    fromCommit: string | null;
    toCommit: string | null;
    code?: string;
    message?: string;
  }>;
}

export interface SkillsConsoleApi {
  readonly apiVersion: 1;
  list(input?: { names?: string[] }): Promise<InstalledSkill[]>;
  adopt(input: { name: string }): Promise<AdoptResult>;
  install(input: InstallInput): Promise<InstallResult>;
  check(input?: { names?: string[] }): Promise<CheckResult>;
  update(input?: UpdateInput): Promise<UpdateResult>;
}

export interface SkillsConsoleOptions {
  /** 默认 process.env；测试可注入合成 HOME / DSH_HOME。 */
  env?: NodeJS.ProcessEnv;
  /** 显式覆盖路径（测试用；生产一般只给 env）。 */
  paths?: {
    home?: string;
    dshHome?: string;
    stateDir?: string;
    cacheDir?: string;
  };
  /** 默认 global fetch；测试注入 stub。 */
  fetch?: typeof fetch;
  /** 默认写 console 自己的 JSONL 事件日志；传 () => {} 可静默。 */
  logger?: (event: string, detail?: Record<string, unknown>) => void;
  /** 测试替身；生产不要传。 */
  installer?: unknown;
}

/** 本副本内 headless 实例缓存：同一 stateFile 重复调用不重复建 StateStore。 */
const headlessCache = new Map<string, SkillsConsoleApi>();

const firstLine = (error: any): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.split('\n')[0]?.trim() ?? '';
};

function normalizeMode(row: any): SkillMode {
  if (row?.mode === 'hidden') return 'hidden';
  if (row?.enabled === false) return 'off';
  if (row?.mode === 'manual') return 'manual';
  return 'auto';
}

function toInstalledSkill(row: any): InstalledSkill {
  return {
    name: String(row.name),
    mode: normalizeMode(row),
    commit: typeof row.commit === 'string' && row.commit ? row.commit : null,
    treeSha: typeof row.treeSha === 'string' && row.treeSha ? row.treeSha : null,
    installedAt: typeof row.installedAt === 'string' && row.installedAt ? row.installedAt : null,
    updatedAt: typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : null,
    subscriptionId: typeof row.subscriptionId === 'string' && row.subscriptionId ? row.subscriptionId : null,
  };
}

const SERVICE_CODE_MAP: Record<string, string> = {
  'error.skills.bad-source': 'bad-source',
  'error.skills.state-readonly': 'read-only',
  'error.skills.not-found': 'not-found',
  'error.skills.not-managed': 'not-managed',
  'error.skills.no-subscription': 'no-subscription',
  'error.skills.parked': 'parked',
  'error.skills.no-skills': 'install-failed',
  'error.skills.install-failed': 'install-failed',
  'error.skills.network': 'upstream-failed',
  'error.skills.upstream-failed': 'upstream-failed',
  'error.skills.rate-limited': 'upstream-failed',
  'error.skills.repo-not-found': 'upstream-failed',
  'error.skills.repo-forbidden': 'upstream-failed',
  'error.skills.installer-unavailable': 'internal',
};

/** 内部异常 → 公共错误（保留 serviceCode 便于排查）。 */
function mapError(error: any): SkillsConsoleError {
  if (error instanceof SkillsConsoleError) return error;
  const serviceCode = error?.code ?? null;
  const detail: Record<string, unknown> = { serviceCode };
  if (error?.detail !== undefined && error?.detail !== null) detail.detail = error.detail;
  if (error?.problem !== undefined && error?.problem !== null) detail.problem = error.problem;
  const publicCode = serviceCode ? SERVICE_CODE_MAP[serviceCode] ?? 'internal' : 'internal';
  return new SkillsConsoleError(publicCode, firstLine(error) || 'internal error', detail);
}

const readOnlyError = (store: any): SkillsConsoleError =>
  new SkillsConsoleError('read-only', '技能控制台状态不可读或版本未知', { problem: store?.problem ?? null });

/**
 * 唯一 API 实现：把已装配好的 core service 包成稳定契约。
 * 供插件 apply 与 headless 工厂共用；不读取 route / UI / cordis。
 */
export function createPublicApi(service: any): SkillsConsoleApi {
  const api: SkillsConsoleApi = {
    apiVersion: API_VERSION,

    async list(input) {
      service.reloadState();
      const store = service.store;
      if (store.readOnly) throw readOnlyError(store);
      const installs = Array.isArray(store.state?.installs) ? store.state.installs : [];
      const names = Array.isArray(input?.names) ? new Set(input!.names) : null;
      const rows = names ? installs.filter((row: any) => names.has(row.name)) : installs;
      return rows.map(toInstalledSkill);
    },

    async adopt(input) {
      const raw = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!raw) throw new SkillsConsoleError('invalid-input', 'adopt 需要非空的 name');
      service.reloadState();
      if (service.store.readOnly) throw readOnlyError(service.store);
      let result: any;
      try {
        result = await service.adopt({ name: raw });
      } catch (error) {
        throw mapError(error);
      }
      const record = service.store.findInstall(raw);
      const subscriptionId = result?.subscriptionId ?? record?.subscriptionId ?? null;
      return {
        name: raw,
        already: result?.already === true,
        subscriptionId: subscriptionId ?? null,
        tracked: result?.tracked === true || Boolean(subscriptionId),
      };
    },

    async install(input) {
      const source = typeof input?.source === 'string' ? input.source.trim() : '';
      const skills = Array.isArray(input?.skills)
        ? input!.skills.map((name) => (typeof name === 'string' ? name.trim() : '')).filter(Boolean)
        : [];
      if (!source) throw new SkillsConsoleError('invalid-input', 'install 需要非空的 source');
      if (skills.length === 0) throw new SkillsConsoleError('invalid-input', 'install 需要非空的 skills');
      service.reloadState();
      if (service.store.readOnly) throw readOnlyError(service.store);
      try {
        const added = await service.addSubscription({
          source,
          ref: input?.ref ?? null,
          subpath: input?.subpath ?? null,
        });
        const subscriptionId = added.subscription.id;
        // 已有订阅且 latest 未显式 false：先刷新快照到最新，再装
        if (input?.latest !== false && added.existing === true) {
          await service.refreshSubscription({ id: subscriptionId });
        }
        const targets = Array.isArray(input?.targets) ? input!.targets : [];
        const result = await service.install({ subscriptionId, skills, targets });
        const installed = Array.isArray(result?.installed) ? result.installed : [];
        const got = new Set(installed.map((item: any) => item.name));
        const missing = skills.filter((name) => !got.has(name));
        if (missing.length > 0) {
          throw new SkillsConsoleError(
            'install-failed',
            `以下技能未出现在安装结果里：${missing.join('、')}`,
            { missing, serviceCode: 'error.skills.install-failed' },
          );
        }
        const subscription = service.store.state.subscriptions.find((item: any) => item.id === subscriptionId);
        return {
          ok: true as const,
          source: subscription?.source ?? source,
          subscriptionId,
          commit: subscription?.snapshot?.commit ?? null,
          installed: installed.map((item: any) => ({ name: item.name, treeSha: item.treeSha ?? null })),
          warnings: (Array.isArray(result?.warnings) ? result.warnings : []).map((w: any) => ({
            name: w.name,
            warning: w.warning,
          })),
        };
      } catch (error) {
        throw mapError(error);
      }
    },

    async check(input) {
      service.reloadState();
      let result: any;
      try {
        result = await service.checkUpdates({ names: Array.isArray(input?.names) ? input!.names : undefined });
      } catch (error) {
        throw mapError(error);
      }
      const checks = (Array.isArray(result?.checks) ? result.checks : []).map((item: any) => ({
        name: item.name,
        status: String(item.status ?? 'unknown'),
        detail: item.detail ?? null,
        checkedAt: item.checkedAt,
      }));
      return { ok: result?.ok !== false, checks };
    },

    async update(input) {
      service.reloadState();
      const store = service.store;
      if (store.readOnly) throw readOnlyError(store);
      const installs = Array.isArray(store.state?.installs) ? store.state.installs : [];
      const all = installs.map((row: any) => row.name);
      const names = Array.isArray(input?.names) && input!.names.length > 0 ? input!.names : all;
      const results: UpdateResult['results'] = [];
      for (const name of names) {
        const install = store.findInstall(name);
        if (!install) {
          results.push({ name, status: 'not-managed', fromCommit: null, toCommit: null });
          continue;
        }
        const fromCommit = typeof install.commit === 'string' ? install.commit : null;
        if (install.mode === 'hidden') {
          results.push({ name, status: 'parked', fromCommit, toCommit: null });
          continue;
        }
        let plan: any;
        try {
          plan = await service.planUpdate({ name });
        } catch (error: any) {
          const code = error?.code;
          if (code === 'error.skills.not-managed') {
            results.push({ name, status: 'not-managed', fromCommit, toCommit: null });
          } else if (code === 'error.skills.no-subscription') {
            results.push({ name, status: 'no-subscription', fromCommit, toCommit: null });
          } else {
            results.push({
              name,
              status: 'failed',
              fromCommit,
              toCommit: null,
              code: 'upstream-failed',
              message: firstLine(error),
            });
          }
          continue;
        }
        const toCommit = typeof plan?.toCommit === 'string' ? plan.toCommit : null;
        if (plan?.localModified === true && input?.overwrite !== true) {
          results.push({ name, status: 'locally-modified', fromCommit, toCommit });
          continue;
        }
        // 同一棵树（commit 可能只是 rebase 变了）→ 无需下载
        if (install.treeSha && plan?.targetTreeSha && install.treeSha === plan.targetTreeSha) {
          results.push({ name, status: 'current', fromCommit, toCommit });
          continue;
        }
        try {
          const applied: any = await service.applyUpdate({
            name,
            token: plan?.token,
            overwrite: input?.overwrite === true,
          });
          if (!applied?.ok) {
            results.push({
              name,
              status: 'failed',
              fromCommit,
              toCommit: applied?.toCommit ?? toCommit,
              code: applied?.code ?? 'update-failed',
              message: applied?.message ?? null,
            });
            continue;
          }
          results.push({ name, status: 'updated', fromCommit, toCommit: applied?.toCommit ?? toCommit });
        } catch (error: any) {
          if (error?.code === 'error.skills.parked') {
            results.push({ name, status: 'parked', fromCommit, toCommit });
            continue;
          }
          results.push({
            name,
            status: 'failed',
            fromCommit,
            toCommit,
            code: SERVICE_CODE_MAP[error?.code] ?? 'update-failed',
            message: firstLine(error),
          });
        }
      }
      const ok = results.every((item) => item.status === 'updated' || item.status === 'current');
      return { ok, results };
    },
  };
  return api;
}

function reuseRuntime(entry: RuntimeEntry, stateFile: string): SkillsConsoleApi {
  if (entry.apiVersion !== API_VERSION) {
    throw new SkillsConsoleError(
      'incompatible-runtime',
      `技能控制台运行时 apiVersion=${entry.apiVersion} 与本包 ${API_VERSION} 不兼容，请升级对应一方`,
      { stateFile, runtimeApiVersion: entry.apiVersion },
    );
  }
  return entry.api as SkillsConsoleApi;
}

function createHeadless(
  options: SkillsConsoleOptions,
  env: NodeJS.ProcessEnv,
  paths: any,
  stateFile: string,
): SkillsConsoleApi {
  const cached = headlessCache.get(stateFile);
  if (cached) return cached;
  const logger = options.logger ?? createLogger(paths.logFile);
  const store = new StateStore(paths, logger);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const fetchImpl = options.fetch ?? fetch;
  const installer = options.installer ?? createInstaller({ paths, env, fetchImpl, logger });
  const service = createService({ paths, store, registry, installer, logger, env, fetchImpl });
  // load() 后重读一次：做 state 文件侧迁移与旧哈希重基线。**不**跑 reconcileInvocations（会改 SKILL.md）。
  service.reloadState();
  const api = createPublicApi(service);
  headlessCache.set(stateFile, api);
  return api;
}

/**
 * 工厂：先查进程级 runtime registry（§5.1），命中复用插件 PublicApi，未命中才创建 headless。
 * 解析顺序严格按设计 §5.1（精确匹配 → 唯一实例跟随 → 显式路径 headless → 空 registry headless → ambiguous）。
 */
export function createSkillsConsole(options: SkillsConsoleOptions = {}): SkillsConsoleApi {
  const env = options.env ?? process.env;
  const overrides = options.paths ?? {};
  const paths = createPaths(env, overrides);
  const stateFile = paths.stateFile;

  // ① 精确匹配
  const exact = findRuntimeByStateFile(stateFile);
  if (exact) return reuseRuntime(exact, stateFile);

  const all = listRuntimes();
  // ⑤ registry 为空 → headless
  if (all.length === 0) return createHeadless(options, env, paths, stateFile);

  const explicitPaths = Boolean(overrides.home || overrides.dshHome || overrides.stateDir);
  // ③ 无精确匹配、未显式指定路径、只有一个 console 实例 → 跟随插件（记日志）
  if (!explicitPaths && all.length === 1) {
    const only = all[0] as RuntimeEntry;
    const api = reuseRuntime(only, stateFile);
    const logger = options.logger ?? createLogger(paths.logFile);
    logger('api.runtime.stateDir-override', { requested: stateFile, runtime: only.stateFile });
    return api;
  }
  // ④ 无精确匹配、显式指定路径（测试/独立实例）→ headless
  if (explicitPaths) return createHeadless(options, env, paths, stateFile);

  // ⑥ 多实例且无法唯一确定 → 抛错，绝不创建第二个写者
  throw new SkillsConsoleError(
    'ambiguous-runtime',
    `进程内存在 ${all.length} 个技能控制台运行时，且无法按路径唯一匹配`,
    { candidates: all.map((entry) => entry.stateFile), requested: stateFile },
  );
}

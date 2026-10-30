/**
 * `createService` 装配层：构造 `ServiceCtx`（注入依赖 + 运行期共享状态），
 * 把各簇子模块的方法挂到对外对象上。方法名 / 参数 / 返回字段与拆分前逐字一致。
 *
 * 拆分前本函数体是 3,000+ 行的单文件闭包；现在只剩装配与对外方法表。
 */
import { DEFAULT_INTRO_CONFIG, normalizeIntroConfig } from '../intro.js';
import { createQueue } from './queue.js';
import {
  diagnostics,
  ensureMigrated,
  getState,
  reloadState,
} from './state-view.js';
import { adopt, rebaselineHashes } from './tracking.js';
import { reconcileInvocations, setInvocation, unpark } from './invocation.js';
import { setMode } from './mode.js';
import { setExports, setLinks, setSettings } from './settings.js';
import { install, remove } from './install.js';
import {
  addSubscription,
  probeSource,
  refreshSubscription,
  removeSubscription,
} from './subscriptions.js';
import { applyUpdate, checkUpdates, planUpdate, rollback, runAutoCheck } from './updates.js';
import {
  generateRemoteIntro,
  generateSkillIntro,
  getRemoteIntro,
  getSkillIntro,
  listSkillBody,
  listSkillFiles,
} from './intro.js';
import type { ServiceCtx } from '../../contract/service.js';

export function createService({
  paths,
  store,
  registry,
  installer = null,
  logger,
  env = process.env,
  fetchImpl = fetch,
  visibleProvider = async () => ({ skills: [], complete: true }),
  agentsVisibleProvider = async () => ({ available: false, skills: [], complete: false }),
  workspacesProvider = async () => [],
  /** 启停写完后让每个 live agent 的 policy provider 失效（宿主下次 list 重新收集）。 */
  invalidatePolicies = async () => {},
  /** `{ available, liveAgents, registered, errors[] }`；没有 provider 时启停必须 409。 */
  policyStatus = () => ({ available: false, liveAgents: 0, registered: 0, errors: [] }),
  /** 技能介绍缓存（可丢）；缺省时介绍接口返回 501，其余功能不受影响。 */
  introStore = null,
  /** 归一化后的介绍配置（provider/model 可空，空则用宿主默认模型）。 */
  introOptions = normalizeIntroConfig(DEFAULT_INTRO_CONFIG),
  /** 宿主 `llm` 服务（`ctx.get('llm')`）；按需取，不能要求它在插件加载时已就绪。 */
  getLlm = () => null,
  /** 宿主 `agentDefaultModel.currentSelection()`；返回 `{ provider, model }` 或 null。 */
  getDefaultModel = () => null,
}: any) {
  const runtime = {
    enqueue: createQueue(logger),
    tokenOf: (env.GITHUB_TOKEN || env.GH_TOKEN) || null,
    // 探测缓存：同一来源短时间内重复检测直接复用；并发的相同请求合并成一次（不重复烧 API 配额）
    probeCache: new Map<string, any>(),
    PROBE_TTL_MS: 60_000,
    PROBE_MAX: 50,
    // 技能介绍全局单飞占位；旧哈希口径重基线「每实例只跑一次」标记。
    introInFlight: null,
    hashBaselineChecked: false,
  };

  const ctx: ServiceCtx = {
    paths,
    store,
    registry,
    installer,
    logger,
    env,
    fetchImpl,
    visibleProvider,
    agentsVisibleProvider,
    workspacesProvider,
    invalidatePolicies,
    policyStatus,
    introStore,
    introOptions,
    getLlm,
    getDefaultModel,
    runtime,
  };

  return {
    paths,
    store,
    registry,

    /** 每次请求前从磁盘重读状态：别的进程（或手工编辑）改过也要立刻看见。 */
    reloadState: () => reloadState(ctx),

    /** 供插件 apply 时主动跑一次迁移（不必等到第一个请求）。 */
    ensureMigrated: () => ensureMigrated(ctx),

    /** 诊断/测试用：手动跑一次「仅手动」重放。 */
    reconcileInvocations: () => reconcileInvocations(ctx),

    /** 诊断/测试用：手动跑一次旧哈希口径的重基线（启动时已自动跑过一次）。 */
    rebaselineHashes: () => rebaselineHashes(ctx),

    getState: (args?: any) => getState(ctx, args),

    diagnostics: () => diagnostics(ctx),

    setSettings: (patch) => setSettings(ctx, patch),

    setExports: (args) => setExports(ctx, args),

    /** @deprecated v2 起叫 `setExports`；`/links` 路由别名仍指到这里 */
    setLinks: (args) => setLinks(ctx, args),

    listSkillBody: (args) => listSkillBody(ctx, args),

    getSkillIntro: (args?: any) => getSkillIntro(ctx, args),

    generateSkillIntro: (args?: any) => generateSkillIntro(ctx, args),

    getRemoteIntro: (args?: any) => getRemoteIntro(ctx, args),

    generateRemoteIntro: (args?: any) => generateRemoteIntro(ctx, args),

    listSkillFiles: (args) => listSkillFiles(ctx, args),

    adopt: (args) => adopt(ctx, args),

    setInvocation: (args) => setInvocation(ctx, args),

    unpark: (args) => unpark(ctx, args),

    setMode: (args) => setMode(ctx, args),

    install: (args) => install(ctx, args),

    remove: (args) => remove(ctx, args),

    probeSource: (args) => probeSource(ctx, args),

    addSubscription: (args) => addSubscription(ctx, args),

    removeSubscription: (args) => removeSubscription(ctx, args),

    refreshSubscription: (args) => refreshSubscription(ctx, args),

    checkUpdates: (args?: any) => checkUpdates(ctx, args),

    runAutoCheck: (args?: any) => runAutoCheck(ctx, args),

    planUpdate: (args) => planUpdate(ctx, args),

    applyUpdate: (args) => applyUpdate(ctx, args),

    rollback: (args) => rollback(ctx, args),
  };
}

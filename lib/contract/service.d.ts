/**
 * `lib/core/service/*` 子模块共享的显式上下文契约。
 *
 * 拆分前这些依赖都是 `createService({…})` 闭包捕获的变量与共享可变状态；
 * 拆分后由 `service/index.ts` 统一装配成 `ServiceCtx`，子模块只接 `ctx`，
 * 禁止再读外部闭包变量。等价性锚点：拆分前 `lib/core/service.ts` 的
 * `createService` 入参与闭包顶部若干 `const`。
 *
 * 说明：字段大多刻意用 `any`——本文件只用来「显式化依赖形状」，不追求把
 * state / installer / registry 的完整结构在这里再抄一遍（它们的锚点在各自模块）。
 */
import type { Paths } from './paths.js';

/** 运行期共享可变状态：必须单一实例，由 `index.ts` 创建后传给所有子模块。 */
export interface ServiceRuntime {
  /** 写操作全局单写者队列（`service/queue.ts` 的 `createQueue`）。 */
  enqueue: any;
  /** GitHub token（`env.GITHUB_TOKEN || env.GH_TOKEN || null`）。 */
  tokenOf: any;
  /** 探测缓存：同一来源短时间内复用 / 并发合并（可变，单一实例）。 */
  probeCache: Map<string, any>;
  /** 探测缓存 TTL（毫秒）。 */
  PROBE_TTL_MS: number;
  /** 探测缓存最大条数。 */
  PROBE_MAX: number;
  /**
   * 技能介绍全局单飞占位（可变，单一实例）：全局只允许一个生成在跑——辅助调用不进
   * agent 的重试/限流体系，并发越高越容易撞 429；在第一个 await 之前占位，避免两个请求同时通过检查。
   */
  introInFlight: any;
  /** 旧哈希口径重基线「每进程/每实例只跑一次」的标记（可变，单一实例）。 */
  hashBaselineChecked: boolean;
}

/** 一簇子模块需要的全部依赖：注入依赖 + 运行期共享状态。 */
export interface ServiceCtx {
  /** 路径解析（`lib/core/paths.ts`）。 */
  paths: Paths;
  /** `state.json` 读写 + readOnly 降级（`lib/core/state.ts` 的 `StateStore`）。 */
  store: any;
  /** 目标注册表（`lib/core/agents.ts`）。 */
  registry: any;
  /** native installer（`lib/core/installer.ts`），可缺省。 */
  installer: any;
  /** JSONL 事件日志。 */
  logger: (event: string, detail?: any) => void;
  /** 环境变量（token 等）。 */
  env: any;
  /** 可注入 fetch（测试 stub）。 */
  fetchImpl: any;
  /** 宿主可见技能快照。 */
  visibleProvider: (cwd?: any) => Promise<any>;
  /**
   * **仅诊断用**：DSH registry 各 live agent 的 snapshot 并集（`agent-skills.ts`）。
   * 只用于 `/diagnostics` 的 `dshRegistry` 盲区报告；**绝不参与** `visible` 计算
   * （`visible` 仍按 Agent Skills 扫描根合并，见 README「边界」）。
   */
  registrySkillsProvider: (cwd?: any) => Promise<any>;
  /** 宿主工作区列表。 */
  workspacesProvider: () => Promise<any[]>;
  /** 启停写完后让每个 live agent 的 policy provider 失效。 */
  invalidatePolicies: () => Promise<void>;
  /** `{ available, liveAgents, registered, errors[] }`；没有 provider 时启停必须 409。 */
  policyStatus: () => any;
  /** 技能介绍缓存（可丢）；缺省时介绍接口返回 501。 */
  introStore: any;
  /** 归一化后的介绍配置。 */
  introOptions: any;
  /** 宿主 `llm` 服务（按需取）。 */
  getLlm: () => any;
  /** 宿主默认模型 `{ provider, model } | null`。 */
  getDefaultModel: () => any;
  /** 运行期共享可变状态（单一实例）。 */
  runtime: ServiceRuntime;
  /** 跨簇调用注入位（当前实现未用到；保留以支持未来出现环时的注入方案）。 */
  services?: any;
}

/** `createService(options)` 的入参形状（全部可选、均可注入测试替身）。 */
export interface CreateServiceOptions {
  paths: Paths;
  store: any;
  registry: any;
  installer?: any;
  logger: (event: string, detail?: any) => void;
  env?: any;
  fetchImpl?: any;
  visibleProvider?: (cwd?: any) => Promise<any>;
  /** 仅诊断用：DSH registry 技能快照并集（不参与 visible）。 */
  registrySkillsProvider?: (cwd?: any) => Promise<any>;
  workspacesProvider?: () => Promise<any[]>;
  invalidatePolicies?: () => Promise<void>;
  policyStatus?: () => any;
  introStore?: any;
  introOptions?: any;
  getLlm?: () => any;
  getDefaultModel?: () => any;
}

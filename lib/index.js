import z from '@deepseek-ai/schemastery';
import { createInstaller } from './core/installer.js';
import { createLogger } from './core/log.js';
import { createPaths } from './core/paths.js';
import { createRegistry } from './core/agents.js';
import { createPolicyProvider, installPolicyProviders } from './core/policy.js';
import { createService } from './core/service.js';
import { normalizeIntroConfig } from './core/intro.js';
import { createIntroStore } from './core/intro-store.js';
import { createPluginUpdate } from './core/plugin-update.js';
import { StateStore } from './core/state.js';
import { createRoutes, ROUTE_PREFIX } from './routes.js';

/** cordis 插件 id：必须等于 `cordis.patch.yml` 的 `insert[0].id`（设计 §15.2）。 */
export const name = 'dsh-skills-console';

/**
 * 配置 schema：交给 cordis loader 校验/补默认值（DSH 插件惯例）。
 * 只声明本插件真正读的字段；`intro` 的边界/合法性仍由 `normalizeIntroConfig` 兜底。
 */
export const Config = z.object({
  stateDir: z.string(),
  cacheDir: z.string(),
  intro: z.object({
    enabled: z.boolean().default(true),
    provider: z.string(),
    model: z.string(),
    maxInputBytes: z.number(),
    maxOutputTokens: z.number(),
    timeoutMs: z.number(),
  }),
});

/** 硬依赖只有 HTTP 载体；skills 注册表按可选服务取（缺失时不影响清单与链接）。 */
export const inject = ['webServer'];

export function apply(ctx, config = {}) {
  const env = process.env;
  const pathOverrides = {};
  if (config.stateDir) pathOverrides.stateDir = config.stateDir;
  if (config.cacheDir) pathOverrides.cacheDir = config.cacheDir;
  const paths = createPaths(env, pathOverrides);
  const logger = createLogger(paths.logFile);

  const store = new StateStore(paths, logger);
  store.load();
  if (store.readOnly) logger('state.readonly', { problem: store.problem });

  const registry = createRegistry({ paths, getState: () => store.state });
  const installer = createInstaller({ paths, env, logger });

  /**
   * 本地策略 provider：只报告 `enabled === false` 的 canonical 技能，注册到**每个 live
   * agent 自己的 scope**（agent scope 是 preset scope 的子层，层序比 rank 更近）。
   * 必须在 service 之前建好：setMode 写完后要通过闭包调 `invalidate()`。
   */
  const policyProvider = createPolicyProvider({ paths, getState: () => store.state, logger });
  const policies = installPolicyProviders(ctx, { provider: policyProvider, logger });

  /**
   * 宿主的技能快照。**注意**：不传 `scope`，只能看到 global 层的 provider —— 文件系统
   * provider 挂在 agent preset 的 scope 层，所以这里拿到的多半只有 bundled/插件技能。
   * 可见性以 `roots.js` 的本地扫描为准，这个快照只作 rank 600 的垫底候选。
   * 等宿主提供可用的 scope 入口，再考虑把可见性整体委托给它（见 README「边界（明确不做）」）。
   */
  const visibleProvider = async (cwd) => {
    const skills = ctx.get('skills');
    if (!skills) return { skills: [], complete: false };
    const snapshot = await skills.snapshot({ cwd: cwd || undefined });
    return {
      complete: snapshot.complete,
      skills: snapshot.skills.map((item) => ({
        name: item.name,
        description: item.description,
        source: item.source,
        provider: item.provider,
        path: item.path || null,
        invocation: item.invocation,
      })),
    };
  };

  /**
   * 「作用范围」里可以直接勾 DSH 工作区，不必每次走系统目录选择器。
   * 只把目录还在的工作区列出来，避免把链接写进一个已经消失的路径。
   */
  const workspacesProvider = async () => {
    const workspaces = ctx.get('workspaceRegistry');
    if (!workspaces?.list) return [];
    const rows = [];
    for (const workspace of workspaces.list()) {
      try {
        if ((await workspace.status()) !== 'ok') continue;
      } catch {
        continue;
      }
      rows.push({ id: workspace.id, title: workspace.title, path: workspace.path });
    }
    return rows;
  };

  const service = createService({
    paths,
    store,
    registry,
    installer,
    logger,
    env,
    visibleProvider,
    workspacesProvider,
    invalidatePolicies: () => policies.invalidate(),
    policyStatus: () => policies.status(),
    // 技能介绍：走宿主已挂载的模型服务（可选服务，缺失时接口 501，其他功能不受影响）
    introStore: createIntroStore({ paths, logger }),
    introOptions: normalizeIntroConfig(config.intro || {}),
    getLlm: () => ctx.get('llm'),
    getDefaultModel: () => {
      const defaults = ctx.get('agentDefaultModel');
      if (!defaults?.currentSelection) return null;
      try {
        return defaults.currentSelection();
      } catch (error) {
        logger('intro.default-model.failed', { message: error?.message });
        return null;
      }
    },
  });

  // 迁移必须尽早跑：GUI 一打开就该是「停用 = 真不可见」，而不是等用户点到某一行才发现。
  // 失败只记日志：插件仍要能加载（读路径降级、写路径返回带原因的 409）。
  try {
    const migrated = service.ensureMigrated();
    if (migrated?.migrated) logger('plugin.migrate', { report: migrated.report });
  } catch (error) {
    logger('plugin.migrate.failed', { message: error?.message, code: error?.code });
  }

  /**
   * 插件自更新：检查 npm 最新版 / 一键重装自身。
   * `pluginManager` 是桌面端官方能力（installBundle），按可选服务取；拿不到时路由只报手动命令。
   */
  const pluginUpdate = createPluginUpdate({
    getPluginManager: () => ctx.get('pluginManager'),
    getProfileName: () => {
      const profile = ctx.get('profileContext');
      return typeof profile?.name === 'string' ? profile.name : null;
    },
  });

  const handler = createRoutes({ service, pluginUpdate, logger });
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }), 'dsh-skills-console:routes');
  ctx.effect(() => () => policies.dispose(), 'dsh-skills-console:policy');

  // 定时上游检测：复用宿主 timer 服务（`@deepseek-ai/cordis-plugin-timer`）。
  // 它是可选服务——宿主没装时静默降级为「只有手动检查」，其余功能不受影响。
  // `timer.interval` 内部走 ctx.effect，插件卸载时会自动 clearInterval，不会泄漏。
  const timer = ctx.get('timer');
  if (timer && typeof timer.interval === 'function') {
    const AUTO_CHECK_MS = 6 * 60 * 60 * 1000;
    ctx.effect(
      () => timer.interval(() => void service.runAutoCheck(), AUTO_CHECK_MS),
      'dsh-skills-console:auto-check',
    );
    // 启动后给一次延迟首检（避开启动高峰与迁移窗口），内部节流会兜住重复。
    ctx.effect(
      () => timer.timeout(() => void service.runAutoCheck(), 30 * 1000),
      'dsh-skills-console:auto-check-first',
    );
    logger('plugin.autoCheck', { intervalMs: AUTO_CHECK_MS });
  } else {
    logger('plugin.autoCheck.off', { reason: 'timer-service-missing' });
  }

  // 插件自身的版本检查：启动后延迟一次（有 timer 用它，没有就 setTimeout），只热身缓存不打扰用户。
  // 失败静默——真正的展示交给前端打开刷新按钮/弹窗时再查。
  const warmPluginUpdate = () => {
    void pluginUpdate.check().catch((error) => logger('plugin.update.warm.failed', { message: error?.message }));
  };
  if (timer && typeof timer.timeout === 'function') {
    ctx.effect(() => timer.timeout(warmPluginUpdate, 20 * 1000), 'dsh-skills-console:plugin-update-warm');
  } else {
    ctx.effect(() => {
      const handle = setTimeout(warmPluginUpdate, 20 * 1000);
      handle.unref?.();
      return () => clearTimeout(handle);
    }, 'dsh-skills-console:plugin-update-warm');
  }

  logger('plugin.apply', { stateDir: paths.stateDir, canonical: paths.canonical, readOnly: store.readOnly });
}

import { createInstaller } from './core/installer.js';
import { createLogger } from './core/log.js';
import { createPaths } from './core/paths.js';
import { createRegistry } from './core/agents.js';
import { createService } from './core/service.js';
import { StateStore } from './core/state.js';
import { createRoutes, ROUTE_PREFIX } from './routes.js';

/** cordis 插件 id：必须等于 `cordis.patch.yml` 的 `insert[0].id`（设计 §15.2）。 */
export const name = 'dsh-skills-console';

/** 硬依赖只有 HTTP 载体；skills 注册表按可选服务取（缺失时不影响清单与链接）。 */
export const inject = ['webServer'];

export function apply(ctx, config = {}) {
  const env = process.env;
  const paths = createPaths(env, config.stateDir ? { stateDir: config.stateDir } : {});
  const logger = createLogger(paths.logFile);

  const store = new StateStore(paths, logger);
  store.load();
  if (store.readOnly) logger('state.readonly', { problem: store.problem });

  const registry = createRegistry({ paths, getState: () => store.state });
  const installer = createInstaller({ paths, env, logger });

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
  });

  const handler = createRoutes({ service, logger });
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }), 'dsh-skills-console:routes');
  logger('plugin.apply', { stateDir: paths.stateDir, canonical: paths.canonical, readOnly: store.readOnly });
}

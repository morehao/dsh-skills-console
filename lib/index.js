import { createCli } from './core/cli.js';
import { createLogger } from './core/log.js';
import { createPaths } from './core/paths.js';
import { createRegistry } from './core/agents.js';
import { createService } from './core/service.js';
import { StateStore } from './core/state.js';
import { createRoutes, ROUTE_PREFIX } from './routes.js';

/** cordis 插件 id：必须等于 `cordis.patch.yml` 的 `insert[0].id`（设计 §15.2）。 */
export const name = 'dsh-skills-manager';

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
  const cli = createCli({ env, logger });

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

  const service = createService({
    paths,
    store,
    registry,
    cli,
    logger,
    env,
    visibleProvider,
  });

  const handler = createRoutes({ service, logger });
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }), 'dsh-skills-manager:routes');
  logger('plugin.apply', { stateDir: paths.stateDir, canonical: paths.canonical, readOnly: store.readOnly });
}

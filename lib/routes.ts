import { readFileSync } from 'node:fs';

import { HttpError, createRouteHandler } from '@morehao/dsh-plugin-kit/http';

import { ServiceError } from './core/service.js';
import { StateReadOnlyError } from './core/state.js';

export const ROUTE_PREFIX = '/api/morehao/skills-console';
const MAX_BODY = 256 * 1024;

/**
 * 插件身份：包名 + 版本，随 /state 下发。
 * - `name`：去掉 scope 的短名（兼容老前端）；
 * - `fullName`：带 scope 的真实包名，页头据此拼成可复制的安装标识 `@scope/name@version`。
 * 从 package.json 读一次 —— 前端别硬编码版本，否则两处漂移。
 */
export const PLUGIN_INFO = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const name = String(pkg.name || 'dsh-skills-console');
    return {
      name: name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name,
      fullName: name,
      version: pkg.version || null,
      repository: pkg.repository?.url || null,
    };
  } catch {
    return { name: 'dsh-skills-console', fullName: 'dsh-skills-console', version: null, repository: null };
  }
})();

function matchRoute(method, pathname) {
  const segments = pathname.split('/').filter(Boolean);
  // 前缀在 handler 之前已被剥掉：这里拿到的是 /state、/skills/:name 之类
  if (segments.length === 1 && segments[0] === 'state' && method === 'GET') return { name: 'state' };
  if (segments.length === 1 && segments[0] === 'agents' && method === 'GET') return { name: 'agents' };
  if (segments.length === 1 && segments[0] === 'settings' && method === 'POST') return { name: 'settings' };
  // `/links` 是 v1 名字，留一份 minor 的别名；新代码只认 `/exports`
  if (segments.length === 1 && segments[0] === 'exports' && method === 'POST') return { name: 'exports' };
  if (segments.length === 1 && segments[0] === 'links' && method === 'POST') return { name: 'links' };
  if (segments.length === 1 && segments[0] === 'install' && method === 'POST') return { name: 'install' };
  if (segments.length === 1 && segments[0] === 'probe' && method === 'POST') return { name: 'probe' };
  if (segments.length === 1 && segments[0] === 'diagnostics' && method === 'GET') return { name: 'diagnostics' };

  if (segments[0] === 'skills' && segments.length === 2 && method === 'GET') {
    return { name: 'skill.body', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'files' && method === 'GET') {
    return { name: 'skill.files', params: { name: decodeURIComponent(segments[1]) } };
  }
  // 技能介绍（模型生成）：GET 只读缓存，POST 才真正调模型
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'intro') {
    if (method === 'GET') return { name: 'skill.intro.get', params: { name: decodeURIComponent(segments[1]) } };
    if (method === 'POST') return { name: 'skill.intro.generate', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'adopt' && method === 'POST') {
    return { name: 'skill.adopt', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'mode' && method === 'POST') {
    return { name: 'skill.mode', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'invocation' && method === 'POST') {
    return { name: 'skill.invocation', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'unpark' && method === 'POST') {
    return { name: 'skill.unpark', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 2 && method === 'DELETE') {
    return { name: 'skill.remove', params: { name: decodeURIComponent(segments[1]) } };
  }

  if (segments[0] === 'subscriptions') {
    if (segments.length === 1 && method === 'POST') return { name: 'subscriptions.add' };
    if (segments.length === 2 && method === 'DELETE') {
      return { name: 'subscriptions.remove', params: { id: decodeURIComponent(segments[1]) } };
    }
    if (segments.length === 3 && segments[2] === 'refresh' && method === 'POST') {
      return { name: 'subscriptions.refresh', params: { id: decodeURIComponent(segments[1]) } };
    }
    // 订阅候选的介绍：路径由服务端按快照反查，客户端只给订阅 id + 条目名
    if (segments.length === 5 && segments[2] === 'entries' && segments[4] === 'intro') {
      const id = decodeURIComponent(segments[1]);
      const entryName = decodeURIComponent(segments[3]);
      if (method === 'GET') return { name: 'subscription.intro.get', params: { id, name: entryName } };
      if (method === 'POST') return { name: 'subscription.intro.generate', params: { id, name: entryName } };
    }
  }

  if (segments[0] === 'updates') {
    if (segments.length === 2 && segments[1] === 'check' && method === 'POST') return { name: 'updates.check' };
    if (segments.length === 2 && segments[1] === 'plan' && method === 'POST') return { name: 'updates.plan' };
    if (segments.length === 2 && segments[1] === 'apply' && method === 'POST') return { name: 'updates.apply' };
    if (segments.length === 2 && segments[1] === 'rollback' && method === 'POST') return { name: 'updates.rollback' };
  }

  // 插件自身版本检查 / 更新（与技能上游 updates.* 是两回事，见 core/plugin-update.js）
  if (segments.length === 1 && segments[0] === 'plugin-update' && method === 'GET') return { name: 'plugin.update.check' };
  if (segments.length === 2 && segments[0] === 'plugin-update' && segments[1] === 'apply' && method === 'POST') {
    return { name: 'plugin.update.apply' };
  }
  // 拉某版本的发布说明（GitHub Release 正文）：GET /plugin-update/release?version=x.y.z
  if (segments.length === 2 && segments[0] === 'plugin-update' && segments[1] === 'release' && method === 'GET') {
    return { name: 'plugin.update.release' };
  }

  return null;
}

/**
 * 统一路由外壳收敛到 kit `createRouteHandler`：鉴权头 / no-store JSON / 有上限 JSON body
 * / 错误兜底都在包里；本文件只保留 `matchRoute` + `dispatch` 业务，以及本仓的错误码翻译
 * （dispatcher 不做映射：错误码翻译留在插件侧）。
 *
 * 行为等价要点：
 * - 每请求 `service.reloadState()`（先于分发）；
 * - 生成类接口把 `AbortSignal` 传下去；客户端断开（关抽屉 / 关页面）就取消模型调用，
 *   fake req 没有 `on` 时按能力探测跳过；
 * - 错误映射：`StateReadOnlyError`→409、`ServiceError`→（status||400）、body 超限/非法 JSON
 *   →400、其余→500，错误码沿用 `error.skills.*`。
 */
export function createRoutes({ service, pluginUpdate = null, logger = () => {} }: any) {
  const handler = createRouteHandler({
    prefix: ROUTE_PREFIX,
    header: 'x-dsh-skills-console',
    maxBodyBytes: MAX_BODY,
    dispatch: async ({ request, url, method, pathname, body }: any) => {
      const route = matchRoute(method, pathname);
      if (!route) {
        // 404 交给 onError 统一出错误码（保持 `error.skills.no-route` 原样）
        throw new ServiceError('error.skills.no-route', `${method} ${pathname}`, null, 404);
      }
      service.reloadState();
      const query = Object.fromEntries(url.searchParams.entries());

      // 客户端断开就取消模型调用：摘要是一次性辅助请求，没必要跑完再丢。
      // 测试里的 fake req 没有 on/off，所以要按能力探测。
      const abort = new AbortController();
      const onClose = () => {
        if (!abort.signal.aborted) abort.abort();
      };
      const canListen = typeof request?.on === 'function';
      if (canListen) request.on('close', onClose);
      try {
        return await dispatch(route, { body, query, service, pluginUpdate, signal: abort.signal });
      } finally {
        if (canListen && typeof request?.off === 'function') request.off('close', onClose);
      }
    },
    onError: (error: any) => {
      if (error instanceof StateReadOnlyError) {
        return {
          status: 409,
          code: 'error.skills.state-readonly',
          message: '状态文件损坏，插件处于只读模式',
          extra: { detail: error.problem || null },
        };
      }
      if (error instanceof ServiceError) {
        // 默认 400；policy-unavailable / shadow-locked 等能力或状态冲突带 409。
        return {
          status: error.status || 400,
          code: error.code,
          message: error.message,
          extra: { detail: error.detail ?? null },
        };
      }
      // body 超限 / 非法 JSON 由 kit 的 readJsonBody 抛 HttpError，翻译回本仓的 error.skills.* 码。
      if (error instanceof HttpError) {
        const code = error.code === 'PAYLOAD_TOO_LARGE' ? 'error.skills.body-too-large' : 'error.skills.bad-json';
        return { status: 400, code, message: error.message };
      }
      logger('route.error', { message: error?.message, stack: String(error?.stack || '').slice(0, 800) });
      return {
        status: 500,
        code: 'error.skills.internal',
        message: error?.message || 'internal error',
      };
    },
    logger,
  });
  return handler;
}

async function dispatch(route: any, { body, query, service, pluginUpdate = null, signal = null }: any) {
  switch (route.name) {
    case 'state': {
      const state = await service.getState({ cwd: query.cwd || body.cwd, workspace: query.workspace });
      return { ...state, plugin: PLUGIN_INFO };
    }
    case 'agents':
      return { ok: true, all: service.registry.all(), detected: service.registry.detected() };
    case 'settings':
      return service.setSettings(body);
    case 'exports':
      return service.setExports(body);
    case 'links':
      return service.setExports(body);
    case 'install':
      return service.install(body);
    case 'probe':
      return service.probeSource(body);
    case 'diagnostics':
      return service.diagnostics();
    case 'skill.body':
      return service.listSkillBody({ name: route.params.name, path: query.path });
    case 'skill.files':
      return service.listSkillFiles({ name: route.params.name });
    case 'skill.intro.get':
      return service.getSkillIntro({ name: route.params.name, lang: query.lang });
    case 'subscription.intro.get':
      return service.getRemoteIntro({
        subscriptionId: route.params.id,
        name: route.params.name,
        lang: query.lang,
      });
    case 'subscription.intro.generate':
      return service.generateRemoteIntro({
        subscriptionId: route.params.id,
        name: route.params.name,
        lang: body.lang ?? query.lang,
        force: body.force === true,
        signal,
      });
    case 'skill.intro.generate':
      return service.generateSkillIntro({
        name: route.params.name,
        lang: body.lang ?? query.lang,
        force: body.force === true,
        signal,
      });
    case 'skill.adopt':
      return service.adopt({ name: route.params.name });
    case 'skill.mode':
      return service.setMode({
        name: route.params.name,
        mode: body.mode,
        scope: body.scope,
        projectRoot: body.projectRoot,
      });
    case 'skill.invocation':
      return service.setInvocation({ name: route.params.name, mode: body.mode });
    case 'skill.unpark':
      return service.unpark({ name: route.params.name, keep: body.keep || null });
    case 'skill.remove':
      return service.remove({ name: route.params.name });
    case 'subscriptions.add':
      return service.addSubscription(body);
    case 'subscriptions.remove':
      return service.removeSubscription({ id: route.params.id, keepInstalled: body.keepInstalled !== false });
    case 'subscriptions.refresh':
      return service.refreshSubscription({ id: route.params.id, force: Boolean(body.force) });
    case 'updates.check':
      return service.checkUpdates(body);
    case 'updates.plan':
      return service.planUpdate({ name: body.name });
    case 'updates.apply':
      return service.applyUpdate({ name: body.name, token: body.token, overwrite: Boolean(body.overwrite) });
    case 'updates.rollback':
      return service.rollback({ name: body.name });
    case 'plugin.update.check': {
      if (!pluginUpdate) throw new ServiceError('error.plugin-update.unavailable', '插件自更新不可用');
      return pluginUpdate.check({ fresh: query.fresh === '1' || body.fresh === true });
    }
    case 'plugin.update.apply': {
      if (!pluginUpdate) throw new ServiceError('error.plugin-update.unavailable', '插件自更新不可用');
      return pluginUpdate.apply();
    }
    case 'plugin.update.release': {
      if (!pluginUpdate) throw new ServiceError('error.plugin-update.unavailable', '插件自更新不可用');
      const version = query.version || body.version;
      return pluginUpdate.releaseNotes(version);
    }
    default:
      throw new ServiceError('error.skills.no-route', `unhandled route ${route.name}`);
  }
}

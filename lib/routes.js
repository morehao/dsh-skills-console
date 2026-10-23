import { readFileSync } from 'node:fs';
import { ServiceError } from './core/service.js';
import { StateReadOnlyError } from './core/state.js';

export const ROUTE_PREFIX = '/api/morehao/skills-console';
const MAX_BODY = 256 * 1024;

/**
 * 插件身份：包名（去掉 scope，页头显示 dsh-skills-console）+ 版本。
 * 从 package.json 读一次，随 /state 下发 —— 前端别硬编码版本，否则两处漂移。
 */
export const PLUGIN_INFO = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const name = String(pkg.name || 'dsh-skills-console');
    return {
      name: name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name,
      version: pkg.version || null,
      repository: pkg.repository?.url || null,
    };
  } catch {
    return { name: 'dsh-skills-console', version: null, repository: null };
  }
})();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      throw new ServiceError('error.skills.body-too-large', 'request body too large');
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ServiceError('error.skills.bad-json', 'request body is not JSON');
  }
}

function matchRoute(method, pathname) {
  const segments = pathname.split('/').filter(Boolean);
  // 前缀在 handler 之前已被剥掉：这里拿到的是 /state、/skills/:name 之类
  if (segments.length === 1 && segments[0] === 'state' && method === 'GET') return { name: 'state' };
  if (segments.length === 1 && segments[0] === 'agents' && method === 'GET') return { name: 'agents' };
  if (segments.length === 1 && segments[0] === 'settings' && method === 'POST') return { name: 'settings' };
  if (segments.length === 1 && segments[0] === 'links' && method === 'POST') return { name: 'links' };
  if (segments.length === 1 && segments[0] === 'install' && method === 'POST') return { name: 'install' };
  if (segments.length === 1 && segments[0] === 'diagnostics' && method === 'GET') return { name: 'diagnostics' };

  if (segments[0] === 'skills' && segments.length === 2 && method === 'GET') {
    return { name: 'skill.body', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'adopt' && method === 'POST') {
    return { name: 'skill.adopt', params: { name: decodeURIComponent(segments[1]) } };
  }
  if (segments[0] === 'skills' && segments.length === 3 && segments[2] === 'mode' && method === 'POST') {
    return { name: 'skill.mode', params: { name: decodeURIComponent(segments[1]) } };
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
  }

  if (segments[0] === 'updates') {
    if (segments.length === 2 && segments[1] === 'check' && method === 'POST') return { name: 'updates.check' };
    if (segments.length === 2 && segments[1] === 'plan' && method === 'POST') return { name: 'updates.plan' };
    if (segments.length === 2 && segments[1] === 'apply' && method === 'POST') return { name: 'updates.apply' };
    if (segments.length === 2 && segments[1] === 'rollback' && method === 'POST') return { name: 'updates.rollback' };
  }

  return null;
}

export function createRoutes({ service, logger }) {
  return async function handler(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname.startsWith(ROUTE_PREFIX)
      ? url.pathname.slice(ROUTE_PREFIX.length) || '/'
      : url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // 只认自己的页面：一律要求自定义头。跨源请求带自定义头会先触发预检，等于顺带挡住 CSRF。
    if (req.headers['x-dsh-skills-console'] !== '1') {
      sendJson(res, 403, { ok: false, code: 'error.skills.forbidden', message: 'missing x-dsh-skills-console header' });
      return;
    }

    const route = matchRoute(method, pathname);
    if (!route) {
      sendJson(res, 404, { ok: false, code: 'error.skills.no-route', message: `${method} ${pathname}` });
      return;
    }

    try {
      service.reloadState();
      const body = method === 'GET' ? {} : await readBody(req);
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await dispatch(route, { body, query, service });
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof StateReadOnlyError) {
        sendJson(res, 409, {
          ok: false,
          code: 'error.skills.state-readonly',
          message: '状态文件损坏，插件处于只读模式',
          detail: error.problem || null,
        });
        return;
      }
      if (error instanceof ServiceError) {
        sendJson(res, 400, { ok: false, code: error.code, message: error.message, detail: error.detail ?? null });
        return;
      }
      logger('route.error', { message: error?.message, stack: String(error?.stack || '').slice(0, 800) });
      sendJson(res, 500, { ok: false, code: 'error.skills.internal', message: error?.message || 'internal error' });
    }
  };
}

async function dispatch(route, { body, query, service }) {
  switch (route.name) {
    case 'state': {
      const state = await service.getState({ cwd: query.cwd || body.cwd, workspace: query.workspace });
      return { ...state, plugin: PLUGIN_INFO };
    }
    case 'agents':
      return { ok: true, all: service.registry.all(), detected: service.registry.detected() };
    case 'settings':
      return service.setSettings(body);
    case 'links':
      return service.setLinks(body);
    case 'install':
      return service.install(body);
    case 'diagnostics':
      return service.diagnostics();
    case 'skill.body':
      return service.listSkillBody({ name: route.params.name });
    case 'skill.adopt':
      return service.adopt({ name: route.params.name });
    case 'skill.mode':
      return service.setMode({ name: route.params.name, mode: body.mode });
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
    default:
      throw new ServiceError('error.skills.no-route', `unhandled route ${route.name}`);
  }
}

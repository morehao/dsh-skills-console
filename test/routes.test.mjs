import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRoutes, PLUGIN_INFO, ROUTE_PREFIX } from '../lib/routes.js';
import { ServiceError } from '../lib/core/service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

function fakeRes() {
  const out = { status: null, headers: null, body: null };
  return {
    out,
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers;
    },
    end(body) {
      out.body = body;
    },
  };
}

function makeHandler() {
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true, installs: [], settings: { placement: 'settings' } }),
  };
  return createRoutes({ service, logger: () => {} });
}

test('/state：下发插件身份（短名 + 带 scope 包名 + 版本），顺手保留原字段', async () => {
  const handler = makeHandler();
  const res = fakeRes();
  await handler(
    { url: `${ROUTE_PREFIX}/state`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } },
    res,
  );

  assert.equal(res.out.status, 200);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, true, '原字段不丢');
  assert.equal(body.plugin.name, 'dsh-skills-console', '短名保留给老前端');
  assert.equal(body.plugin.fullName, pkg.name, '带 scope 的包名用拼安装标识');
  assert.equal(body.plugin.version, pkg.version, '版本必须来自 package.json');
  assert.equal(res.out.headers['cache-control'], 'no-store');
});

test('PLUGIN_INFO 与 package.json 同源', () => {
  assert.equal(PLUGIN_INFO.name, pkg.name.replace(/^@[^/]+\//, ''));
  assert.equal(PLUGIN_INFO.fullName, pkg.name);
  assert.equal(PLUGIN_INFO.version, pkg.version);
});

test('/state：没有自定义鉴权头 → 403，且不返回 plugin', async () => {
  const handler = makeHandler();
  const res = fakeRes();
  await handler({ url: `${ROUTE_PREFIX}/state`, method: 'GET', headers: {} }, res);

  assert.equal(res.out.status, 403);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, false);
  assert.equal(body.plugin, undefined);
});

test('/subscriptions：service 抛错 → 400 + 错误码（客户端据此显示失败，而不是成功）', async () => {
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    addSubscription: async () => {
      throw new ServiceError('error.skills.upstream-failed', '读取 o/r@main 失败：HTTP 404');
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  const req = {
    url: `${ROUTE_PREFIX}/subscriptions`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {},
  };
  await handler(req, res);

  assert.equal(res.out.status, 400);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'error.skills.upstream-failed');
});

test('/skills/:name/mode：ServiceError.status=409 时按 409 返回（能力缺失/状态冲突）', async () => {
  const service = {
    reloadState() {},
    setMode: async () => {
      throw new ServiceError('error.skills.policy-unavailable', '宿主没有 provider', { available: false }, 409);
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/skills/demo/mode`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ mode: 'off' }));
    },
  }, res);
  assert.equal(res.out.status, 409);
  const body = JSON.parse(res.out.body);
  assert.equal(body.code, 'error.skills.policy-unavailable');
  assert.deepEqual(body.detail, { available: false });
});

test('/probe：透传探测结果（多选数据源）；GET 不放行', async () => {
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    probeSource: async (body) => ({
      ok: true,
      source: body.source,
      ref: 'master',
      skills: [{ name: 'huashu-design', skillPath: 'SKILL.md' }],
    }),
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/probe`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ source: 'alchaincyf/huashu-design' }));
    },
  }, res);

  assert.equal(res.out.status, 200);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, true);
  assert.equal(body.source, 'alchaincyf/huashu-design');
  assert.deepEqual(body.skills, [{ name: 'huashu-design', skillPath: 'SKILL.md' }]);

  const getRes = fakeRes();
  await handler({ url: `${ROUTE_PREFIX}/probe`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } }, getRes);
  assert.equal(getRes.out.status, 404, '探测只接受 POST');
});

test('/skills/:name：query.path 透传给 service（读技能内的其他文件）', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    listSkillBody: async (args) => {
      calls.push(args);
      return { ok: true, name: args.name, relPath: args.path, content: '# x\n' };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/skills/project-insight?path=references/grounding-guide.md`,
    method: 'GET',
    headers: { 'x-dsh-skills-console': '1' },
  }, res);

  assert.equal(res.out.status, 200);
  assert.deepEqual(calls, [{ name: 'project-insight', path: 'references/grounding-guide.md' }]);
});

test('/skills/:name/files：新读取路由，名字解码后交给 service', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    listSkillFiles: async (args) => {
      calls.push(args);
      return { ok: true, name: args.name, files: [{ path: 'SKILL.md', kind: 'file', size: 3 }] };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/skills/demo/files`,
    method: 'GET',
    headers: { 'x-dsh-skills-console': '1' },
  }, res);

  assert.equal(res.out.status, 200);
  assert.deepEqual(JSON.parse(res.out.body).files, [{ path: 'SKILL.md', kind: 'file', size: 3 }]);
  assert.deepEqual(calls, [{ name: 'demo' }]);

  const missing = fakeRes();
  await handler({ url: `${ROUTE_PREFIX}/skills/demo/files`, method: 'GET', headers: {} }, missing);
  assert.equal(missing.out.status, 403, '读接口同样要自定义鉴权头');
});

test('/skills/:name：读取层的错误码 → 400，客户端据此显示失败原因', async () => {
  const service = {
    reloadState() {},
    listSkillBody: async () => {
      throw new ServiceError('error.skills.bad-path', '文件路径不能越出技能目录');
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/skills/demo?path=../outside.md`,
    method: 'GET',
    headers: { 'x-dsh-skills-console': '1' },
  }, res);

  assert.equal(res.out.status, 400);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'error.skills.bad-path');
});

test('/skills/:name/invocation：三档 mode 透传给 service，409 原样返回', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    setInvocation: async (payload) => {
      calls.push(payload);
      if (payload.mode === 'hidden') {
        throw new ServiceError('error.skills.parked', '已完全停用', null, 409);
      }
      return { ok: true, mode: payload.mode };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler(
    {
      url: `${ROUTE_PREFIX}/skills/demo/invocation`,
      method: 'POST',
      headers: { 'x-dsh-skills-console': '1' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ mode: 'manual' }));
      },
    },
    res,
  );
  assert.equal(res.out.status, 200);
  assert.deepEqual(calls, [{ name: 'demo', mode: 'manual' }]);
  assert.equal(JSON.parse(res.out.body).mode, 'manual');

  const conflict = fakeRes();
  await handler(
    {
      url: `${ROUTE_PREFIX}/skills/demo/invocation`,
      method: 'POST',
      headers: { 'x-dsh-skills-console': '1' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ mode: 'hidden' }));
      },
    },
    conflict,
  );
  assert.equal(conflict.out.status, 409);
  assert.equal(JSON.parse(conflict.out.body).code, 'error.skills.parked');
});

test('/skills/:name/unpark：默认 keep=null，显式 keep 透传', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    unpark: async (payload) => {
      calls.push(payload);
      return { ok: true, mode: 'auto' };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  for (const body of [{}, { keep: 'parked' }]) {
    const res = fakeRes();
    await handler(
      {
        url: `${ROUTE_PREFIX}/skills/demo/unpark`,
        method: 'POST',
        headers: { 'x-dsh-skills-console': '1' },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(JSON.stringify(body));
        },
      },
      res,
    );
    assert.equal(res.out.status, 200);
  }
  assert.deepEqual(calls, [
    { name: 'demo', keep: null },
    { name: 'demo', keep: 'parked' },
  ]);
});

test('/skills/:name/intro：GET 只读缓存并把 lang 透给 service', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    getSkillIntro: async (args) => {
      calls.push(args);
      return { ok: true, name: args.name, lang: args.lang, intro: null, capability: { enabled: true, available: true } };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler(
    { url: `${ROUTE_PREFIX}/skills/demo/intro?lang=en`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } },
    res,
  );

  assert.equal(res.out.status, 200);
  assert.equal(JSON.parse(res.out.body).lang, 'en');
  assert.deepEqual(calls, [{ name: 'demo', lang: 'en' }]);
});

test('/skills/:name/intro：POST 才生成，force 与 signal 都传下去', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    generateSkillIntro: async (args) => {
      calls.push(args);
      return { ok: true, name: args.name, lang: args.lang, cached: false, intro: { text: 'x' } };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  const req = {
    url: `${ROUTE_PREFIX}/skills/demo/intro`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ lang: 'zh', force: true }));
    },
  };
  await handler(req, res);

  assert.equal(res.out.status, 200);
  assert.equal(JSON.parse(res.out.body).ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'demo');
  assert.equal(calls[0].lang, 'zh');
  assert.equal(calls[0].force, true);
  assert.ok(calls[0].signal instanceof AbortSignal, '要带取消信号给模型调用');
});

test('/skills/:name/intro：service 的错误码与 HTTP 语义原样透出', async () => {
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    generateSkillIntro: async () => {
      throw new ServiceError('error.skills.intro-rate-limit', '模型限流', { retryAfterMs: 1000 }, 429);
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  const req = {
    url: `${ROUTE_PREFIX}/skills/demo/intro`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{}');
    },
  };
  await handler(req, res);

  assert.equal(res.out.status, 429);
  const body = JSON.parse(res.out.body);
  assert.equal(body.code, 'error.skills.intro-rate-limit');
  assert.deepEqual(body.detail, { retryAfterMs: 1000 });
});

test('/subscriptions/:id/entries/:name/intro：GET 只读缓存，POST 才生成并透传 signal', async () => {
  const calls = [];
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    getRemoteIntro: async (args) => {
      calls.push({ kind: 'get', args });
      return { ok: true, intro: null, capability: { enabled: true, available: true } };
    },
    generateRemoteIntro: async (args) => {
      calls.push({ kind: 'post', args });
      return { ok: true, cached: false, intro: { text: 'x' } };
    },
  };
  const handler = createRoutes({ service, logger: () => {} });

  const res = fakeRes();
  await handler(
    { url: `${ROUTE_PREFIX}/subscriptions/sub-1/entries/alpha/intro?lang=en`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } },
    res,
  );
  assert.equal(res.out.status, 200);
  assert.deepEqual(calls[0], { kind: 'get', args: { subscriptionId: 'sub-1', name: 'alpha', lang: 'en' } });

  const post = fakeRes();
  const req = {
    url: `${ROUTE_PREFIX}/subscriptions/sub-1/entries/alpha/intro`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ lang: 'zh', force: true }));
    },
  };
  await handler(req, post);
  assert.equal(post.out.status, 200);
  assert.equal(calls[1].kind, 'post');
  assert.equal(calls[1].args.subscriptionId, 'sub-1');
  assert.equal(calls[1].args.name, 'alpha');
  assert.equal(calls[1].args.lang, 'zh');
  assert.equal(calls[1].args.force, true);
  assert.ok(calls[1].args.signal, 'signal 要传给 service');
});

test('/subscriptions/:id/entries/:name/intro：service 的 404 / 409 原样透出', async () => {
  const service = {
    reloadState() {},
    getState: async () => ({ ok: true }),
    getRemoteIntro: async () => {
      throw new ServiceError('error.skills.subscription-not-found', '订阅不存在', null, 404);
    },
  };
  const handler = createRoutes({ service, logger: () => {} });
  const res = fakeRes();
  await handler(
    { url: `${ROUTE_PREFIX}/subscriptions/nope/entries/alpha/intro`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } },
    res,
  );
  assert.equal(res.out.status, 404);
  assert.equal(JSON.parse(res.out.body).code, 'error.skills.subscription-not-found');
});

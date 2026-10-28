import assert from 'node:assert/strict';
import test from 'node:test';

import { createPluginUpdate, isNewerVersion } from '../lib/core/plugin-update.js';
import { createRoutes, ROUTE_PREFIX } from '../lib/routes.js';

const META = { name: '@demo/plugin', version: '1.2.3' };

/** 造一个只回 /latest 的假 fetch；`handler` 决定返回什么。 */
function fakeFetch(handler) {
  return async (url, init) => handler(url, init);
}

function jsonResponse(value, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => value };
}

test('isNewerVersion：core / 预发布 / 非法输入', () => {
  assert.equal(isNewerVersion('1.2.3', '1.2.4'), true);
  assert.equal(isNewerVersion('1.2.3', '1.10.0'), true);
  assert.equal(isNewerVersion('2.0.0', '1.9.9'), false);
  assert.equal(isNewerVersion('1.2.3', '1.2.3'), false);
  assert.equal(isNewerVersion('v1.2.3', '1.2.4'), true);
  // 预发布 < 正式
  assert.equal(isNewerVersion('1.2.3-beta.1', '1.2.3'), true);
  assert.equal(isNewerVersion('1.2.3', '1.2.4-beta.1'), true);
  assert.equal(isNewerVersion('1.2.3-beta.2', '1.2.3-beta.1'), false);
  // 非法输入宁可不更新
  assert.equal(isNewerVersion('garbage', '1.2.4'), false);
  assert.equal(isNewerVersion('1.2.3', 'not-a-version'), false);
});

test('check：落后时报告 updateAvailable 与手动命令', async () => {
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => null,
    getProfileName: () => 'desktop',
    fetchImpl: fakeFetch(async (url) => {
      assert.match(url, /registry\.npmjs\.org\/@demo%2Fplugin\/latest$/);
      return jsonResponse({ version: '1.3.0' });
    }),
  });
  const view = await update.check();
  assert.equal(view.currentVersion, '1.2.3');
  assert.equal(view.latestVersion, '1.3.0');
  assert.equal(view.updateAvailable, true);
  assert.equal(view.checkFailed, false);
  assert.equal(view.canAutoUpdate, false);
  assert.equal(view.manualCommand, 'dsh plugin --profile desktop add @demo/plugin@latest');
});

test('check：最新版与当前一致时不提示更新', async () => {
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({ installBundle() {} }),
    fetchImpl: fakeFetch(async () => jsonResponse({ version: '1.2.3' })),
  });
  const view = await update.check();
  assert.equal(view.updateAvailable, false);
  assert.equal(view.canAutoUpdate, true);
});

test('check：网络失败 / 非 2xx / 非法版本都标记 checkFailed，不抛', async () => {
  const thrower = createPluginUpdate({
    meta: META,
    fetchImpl: fakeFetch(async () => {
      throw new Error('ENOTFOUND');
    }),
  });
  assert.equal((await thrower.check()).checkFailed, true);

  const notOk = createPluginUpdate({
    meta: META,
    fetchImpl: fakeFetch(async () => jsonResponse({}, { ok: false, status: 500 })),
  });
  const v = await notOk.check();
  assert.equal(v.checkFailed, true);
  assert.equal(v.latestVersion, null);

  const bogus = createPluginUpdate({
    meta: META,
    fetchImpl: fakeFetch(async () => jsonResponse({ version: 'latest' })),
  });
  assert.equal((await bogus.check()).checkFailed, true);
});

test('check：结果在 TTL 内命中缓存，不再打网络', async () => {
  let calls = 0;
  const update = createPluginUpdate({
    meta: META,
    now: () => 1000,
    fetchImpl: fakeFetch(async () => {
      calls += 1;
      return jsonResponse({ version: '1.3.0' });
    }),
  });
  await update.check();
  await update.check();
  assert.equal(calls, 1);
  await update.check({ fresh: true });
  assert.equal(calls, 2);
});

test('check：优先问宿主 registries() 给的 registry（继承镜像/私有源），而非硬编码官方源', async () => {
  const asked = [];
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({
      installBundle() {},
      registries: async () => ({
        registry: 'https://registry.npmmirror.com/',
        fallbackRegistries: [],
        resolved: null,
      }),
    }),
    fetchImpl: fakeFetch(async (url) => {
      asked.push(url);
      return jsonResponse({ version: '1.3.0' });
    }),
  });
  const view = await update.check();
  assert.equal(view.latestVersion, '1.3.0');
  assert.deepEqual(asked, ['https://registry.npmmirror.com/@demo%2Fplugin/latest']);
});

test('check：resolved 优先于 registry；前一个 registry 不通则试下一个', async () => {
  const asked = [];
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({
      installBundle() {},
      registries: async () => ({
        registry: 'https://second.example/',
        fallbackRegistries: ['https://third.example/'],
        resolved: 'https://resolved.example/',
      }),
    }),
    fetchImpl: fakeFetch(async (url) => {
      asked.push(url);
      if (url.startsWith('https://resolved.example/')) throw new Error('ENOTFOUND');
      if (url.startsWith('https://second.example/')) return jsonResponse({ version: '2.0.0' });
      return jsonResponse({ version: '1.3.0' });
    }),
  });
  const view = await update.check();
  assert.equal(view.latestVersion, '2.0.0');
  assert.deepEqual(asked, [
    'https://resolved.example/@demo%2Fplugin/latest',
    'https://second.example/@demo%2Fplugin/latest',
  ]);
});

test('check：registries() 缺失或抛错时回退官方 registry', async () => {
  const boom = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({
      installBundle() {},
      registries: async () => { throw new Error('nope'); },
    }),
    fetchImpl: fakeFetch(async (url) => {
      assert.equal(url, 'https://registry.npmjs.org/@demo%2Fplugin/latest');
      return jsonResponse({ version: '1.3.0' });
    }),
  });
  assert.equal((await boom.check()).latestVersion, '1.3.0');
});

test('apply：把查到最新版的 registry 一并交给 installBundle', async () => {
  const calls = [];
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({
      registries: async () => ({ registry: 'https://registry.npmmirror.com/', fallbackRegistries: [], resolved: null }),
      installBundle: async (spec, options) => {
        calls.push({ spec, options });
        return { application: 'restart-required' };
      },
    }),
    fetchImpl: fakeFetch(async () => jsonResponse({ version: '1.3.0' })),
  });
  await update.apply();
  assert.deepEqual(calls, [{
    spec: '@demo/plugin@1.3.0',
    options: { registry: 'https://registry.npmmirror.com/' },
  }]);
});

test('apply：没有 pluginManager 时抛 manual，detail 是手动命令', async () => {
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => null,
    getProfileName: () => 'desktop',
    fetchImpl: fakeFetch(async () => jsonResponse({ version: '1.3.0' })),
  });
  await assert.rejects(() => update.apply(), (error) => {
    assert.equal(error.code, 'error.plugin-update.manual');
    assert.equal(error.detail, 'dsh plugin --profile desktop add @demo/plugin@latest');
    return true;
  });
});

test('apply：有 pluginManager 时调用 installBundle 并返回 restartRequired', async () => {
  const calls = [];
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({
      installBundle: async (spec) => {
        calls.push(spec);
        return { application: 'restart-required', version: '1.3.0' };
      },
    }),
    fetchImpl: fakeFetch(async () => jsonResponse({ version: '1.3.0' })),
  });
  const result = await update.apply();
  assert.deepEqual(calls, ['@demo/plugin@1.3.0']);
  assert.equal(result.updatedVersion, '1.3.0');
  assert.equal(result.restartRequired, true);
  assert.equal(result.updateAvailable, false);
});

test('apply：已是最新时不调用 installBundle', async () => {
  let called = false;
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({ installBundle: async () => { called = true; return { application: 'applied' }; } }),
    fetchImpl: fakeFetch(async () => jsonResponse({ version: '1.2.3' })),
  });
  const result = await update.apply();
  assert.equal(called, false);
  assert.equal(result.updatedVersion, null);
});

test('apply：installBundle 失败时抛 install-failed', async () => {
  const update = createPluginUpdate({
    meta: META,
    getPluginManager: () => ({ installBundle: async () => ({ application: 'failed', error: { code: 'E_INSTALL' } }) }),
    fetchImpl: fakeFetch(async () => jsonResponse({ version: '1.3.0' })),
  });
  await assert.rejects(() => update.apply(), (error) => {
    assert.equal(error.code, 'error.plugin-update.install-failed');
    return true;
  });
});

test('releaseNotes：按 v<version> 拉 GitHub Release 正文', async () => {
  const asked = [];
  const update = createPluginUpdate({
    meta: { name: '@demo/plugin', version: '1.2.3', repo: 'demo/plugin' },
    fetchImpl: fakeFetch(async (url) => {
      asked.push(url);
      return jsonResponse({ body: '## 1.3.0\n- 修复 bug', html_url: 'https://github.com/demo/plugin/releases/tag/v1.3.0', name: 'v1.3.0' });
    }),
  });
  const notes = await update.releaseNotes('1.3.0');
  assert.equal(asked[0], 'https://api.github.com/repos/demo/plugin/releases/tags/v1.3.0');
  assert.equal(notes.version, '1.3.0');
  assert.match(notes.body, /修复 bug/);
  assert.equal(notes.htmlUrl, 'https://github.com/demo/plugin/releases/tag/v1.3.0');
});

test('releaseNotes：无 repo / 非法版本直接返回 null，不发请求', async () => {
  let called = 0;
  const noRepo = createPluginUpdate({
    meta: { name: 'x', version: '1.2.3', repo: null },
    fetchImpl: fakeFetch(async () => { called += 1; return jsonResponse({}); }),
  });
  assert.equal(await noRepo.releaseNotes('1.3.0'), null);

  const badVersion = createPluginUpdate({
    meta: { name: 'x', version: '1.2.3', repo: 'a/b' },
    fetchImpl: fakeFetch(async () => { called += 1; return jsonResponse({}); }),
  });
  assert.equal(await badVersion.releaseNotes('latest'), null);
  assert.equal(called, 0);
});

test('releaseNotes：404 / 网络失败返回 null（不抛），并按版本缓存', async () => {
  let calls = 0;
  const update = createPluginUpdate({
    meta: { name: 'x', version: '1.2.3', repo: 'a/b' },
    fetchImpl: fakeFetch(async () => {
      calls += 1;
      throw new Error('ENOTFOUND');
    }),
  });
  assert.equal(await update.releaseNotes('1.3.0'), null);
  assert.equal(await update.releaseNotes('1.3.0'), null);
  assert.equal(calls, 1, '失败结果也缓存，不重复打网络');
});

// —— 路由层：走真实 handler，鉴权 + 分发 ——

function fakeRes() {
  const out = { status: null, body: null };
  return {
    out,
    writeHead(status) { out.status = status; },
    end(body) { out.body = body; },
  };
}

function pluginRoutes(pluginUpdate) {
  const service = { reloadState() {}, getState: async () => ({ ok: true }) };
  return createRoutes({ service, pluginUpdate, logger: () => {} });
}

test('路由 GET /plugin-update：返回检查视图；缺自定义头 403', async () => {
  const pluginUpdate = {
    check: async () => ({ currentVersion: '1.2.3', latestVersion: '1.3.0', updateAvailable: true }),
    apply: async () => ({}),
  };
  const handler = pluginRoutes(pluginUpdate);

  const ok = fakeRes();
  await handler({ url: `${ROUTE_PREFIX}/plugin-update`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } }, ok);
  assert.equal(ok.out.status, 200);
  assert.equal(JSON.parse(ok.out.body).updateAvailable, true);

  const denied = fakeRes();
  await handler({ url: `${ROUTE_PREFIX}/plugin-update`, method: 'GET', headers: {} }, denied);
  assert.equal(denied.out.status, 403);
});

test('路由 POST /plugin-update/apply：分发到 apply；manual 错误按 409 返回 detail', async () => {
  const pluginUpdate = {
    check: async () => ({}),
    apply: async () => ({ updatedVersion: '1.3.0', restartRequired: true }),
  };
  const handler = pluginRoutes(pluginUpdate);
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/plugin-update/apply`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {},
  }, res);
  assert.equal(res.out.status, 200);
  assert.equal(JSON.parse(res.out.body).updatedVersion, '1.3.0');

  // manual 抛错 → 409 + detail
  const { ServiceError } = await import('../lib/core/service.js');
  const manualHandler = pluginRoutes({
    check: async () => ({}),
    apply: async () => { throw new ServiceError('error.plugin-update.manual', '用命令', 'dsh plugin add x', 409); },
  });
  const res2 = fakeRes();
  await manualHandler({
    url: `${ROUTE_PREFIX}/plugin-update/apply`,
    method: 'POST',
    headers: { 'x-dsh-skills-console': '1' },
    async *[Symbol.asyncIterator]() {},
  }, res2);
  assert.equal(res2.out.status, 409);
  const body = JSON.parse(res2.out.body);
  assert.equal(body.code, 'error.plugin-update.manual');
  assert.equal(body.detail, 'dsh plugin add x');
});

test('路由 GET /plugin-update/release?version=：透传 version 与发布说明', async () => {
  let askedVersion = null;
  const handler = pluginRoutes({
    check: async () => ({}),
    apply: async () => ({}),
    releaseNotes: async (version) => {
      askedVersion = version;
      return { version, body: 'notes', htmlUrl: 'https://github.com/x/y/releases/tag/v1.3.0' };
    },
  });
  const res = fakeRes();
  await handler({
    url: `${ROUTE_PREFIX}/plugin-update/release?version=1.3.0`,
    method: 'GET',
    headers: { 'x-dsh-skills-console': '1' },
  }, res);
  assert.equal(res.out.status, 200);
  assert.equal(askedVersion, '1.3.0');
  assert.equal(JSON.parse(res.out.body).body, 'notes');
});

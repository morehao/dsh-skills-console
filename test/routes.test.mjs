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

test('/state：下发插件身份（包名去 scope + 版本），顺手保留原字段', async () => {
  const handler = makeHandler();
  const res = fakeRes();
  await handler(
    { url: `${ROUTE_PREFIX}/state`, method: 'GET', headers: { 'x-dsh-skills-console': '1' } },
    res,
  );

  assert.equal(res.out.status, 200);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, true, '原字段不丢');
  assert.equal(body.plugin.name, 'dsh-skills-console', '页头显示不带 scope 的包名');
  assert.equal(body.plugin.version, pkg.version, '版本必须来自 package.json');
  assert.equal(res.out.headers['cache-control'], 'no-store');
});

test('PLUGIN_INFO 与 package.json 同源', () => {
  assert.equal(PLUGIN_INFO.name, pkg.name.replace(/^@[^/]+\//, ''));
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

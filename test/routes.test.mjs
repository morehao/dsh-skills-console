import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRoutes, PLUGIN_INFO, ROUTE_PREFIX } from '../lib/routes.js';

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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../lib/core/paths.js';
import { StateStore, StateReadOnlyError, emptyState } from '../lib/core/state.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-state-'));
  const paths = createPaths({ HOME: path.join(root, 'home'), DSH_HOME: path.join(root, 'home', '.dsh') });
  return { root, paths };
}

test('缺失文件 → 空状态且可写', () => {
  const { root, paths } = sandbox();
  const store = new StateStore(paths);
  const state = store.load();
  assert.equal(store.readOnly, false);
  assert.deepEqual(state.installs, []);
  assert.equal(state.version, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('保存 → 读取 → 内容一致（原子写）', () => {
  const { root, paths } = sandbox();
  const store = new StateStore(paths);
  store.load();
  const next = emptyState();
  next.installs.push({ name: 'demo', mode: 'on', scopeProjects: [], installedHash: 'x' });
  store.save(next);
  const reloaded = new StateStore(paths);
  reloaded.load();
  assert.equal(reloaded.readOnly, false);
  assert.equal(reloaded.state.installs.length, 1);
  assert.equal(reloaded.state.installs[0].name, 'demo');
  assert.equal(fs.readdirSync(paths.stateDir).filter((name) => name.endsWith('.tmp')).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('installs[].treeSha 读写往返（新增字段不需要升 STATE_VERSION）', () => {
  const { root, paths } = sandbox();
  const store = new StateStore(paths);
  store.load();
  const next = emptyState();
  next.installs.push({
    name: 'handoff',
    mode: 'on',
    scopeProjects: [],
    installedHash: 'x',
    treeSha: 'a'.repeat(40),
  });
  next.installs.push({ name: 'legacy', mode: 'on', scopeProjects: [], installedHash: 'y' });
  store.save(next);

  const reloaded = new StateStore(paths);
  const state = reloaded.load();
  assert.equal(reloaded.readOnly, false);
  assert.equal(state.version, 1, '版本仍是 1');
  assert.equal(state.installs.find((item) => item.name === 'handoff').treeSha, 'a'.repeat(40));
  assert.equal(
    state.installs.find((item) => item.name === 'legacy').treeSha,
    undefined,
    '老记录没有该字段也不能被判成坏状态',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('坏 JSON → 只读降级，写入抛错', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.stateFile, '{ not json');
  const store = new StateStore(paths);
  store.load();
  assert.equal(store.readOnly, true);
  assert.match(store.problem, /state not JSON/);
  assert.throws(() => store.save(emptyState()), StateReadOnlyError);
  fs.rmSync(root, { recursive: true, force: true });
});

test('未来版本 → 只读（不猜结构）', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.stateFile, JSON.stringify({ version: 99, installs: [] }));
  const store = new StateStore(paths);
  store.load();
  assert.equal(store.readOnly, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('v1 的 autoLinkAgents 升级为 autoLinkTargets', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(
    paths.stateFile,
    JSON.stringify({ version: 1, settings: { autoLinkAgents: false }, installs: [], links: [], subscriptions: [] }),
  );
  const store = new StateStore(paths);
  const state = store.load();
  assert.equal(store.readOnly, false);
  assert.deepEqual(state.settings.autoLinkTargets, []);
  assert.equal('autoLinkAgents' in state.settings, false, '升级后删掉旧字段');

  fs.writeFileSync(
    paths.stateFile,
    JSON.stringify({ version: 1, settings: { autoLinkAgents: true }, installs: [], links: [], subscriptions: [] }),
  );
  const second = new StateStore(paths);
  assert.equal(second.load().settings.autoLinkTargets, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('缺字段但结构可信 → 补默认值继续用', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.stateFile, JSON.stringify({ version: 1, installs: [], links: [], subscriptions: [] }));
  const store = new StateStore(paths);
  const state = store.load();
  assert.equal(store.readOnly, false);
  assert.equal(state.settings.autoLinkTargets, null);
  assert.equal(state.settings.placement, 'settings', '默认入口在设置里');
  assert.deepEqual(state.agents.custom, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings.placement 只接受 settings / sidebar，非法值回退', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.stateDir, { recursive: true });
  const write = (placement) => {
    fs.writeFileSync(
      paths.stateFile,
      JSON.stringify({ version: 1, settings: { placement }, installs: [], links: [], subscriptions: [] }),
    );
    return new StateStore(paths).load();
  };
  assert.equal(write('sidebar').settings.placement, 'sidebar');
  assert.equal(write('bogus').settings.placement, 'settings');
  assert.equal(write(undefined).settings.placement, 'settings');
  fs.rmSync(root, { recursive: true, force: true });
});

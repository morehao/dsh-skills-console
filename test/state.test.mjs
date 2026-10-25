import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../lib/core/paths.js';
import { StateStore, StateReadOnlyError, emptyState, STATE_VERSION, upgradeStateV1 } from '../lib/core/state.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-state-'));
  const paths = createPaths({ HOME: path.join(root, 'home'), DSH_HOME: path.join(root, 'home', '.dsh') });
  return { root, paths };
}

function writeState(paths, value) {
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.stateFile, JSON.stringify(value, null, 2));
}

test('缺失文件 → 空状态且可写', () => {
  const { root, paths } = sandbox();
  const store = new StateStore(paths);
  const state = store.load();
  assert.equal(store.readOnly, false);
  assert.deepEqual(state.installs, []);
  assert.deepEqual(state.exports, []);
  assert.deepEqual(state.shadows, []);
  assert.equal(state.version, STATE_VERSION);
  assert.equal(state.migration, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('保存 → 读取 → 内容一致（原子写）', () => {
  const { root, paths } = sandbox();
  const store = new StateStore(paths);
  store.load();
  const next = emptyState();
  next.installs.push({ name: 'demo', enabled: true, installedHash: 'x' });
  store.save(next);
  const reloaded = new StateStore(paths);
  reloaded.load();
  assert.equal(reloaded.readOnly, false);
  assert.equal(reloaded.state.installs.length, 1);
  assert.equal(reloaded.state.installs[0].name, 'demo');
  assert.equal(reloaded.state.installs[0].enabled, true);
  assert.equal(fs.readdirSync(paths.stateDir).filter((name) => name.endsWith('.tmp')).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('installs[].treeSha 读写往返', () => {
  const { root, paths } = sandbox();
  const store = new StateStore(paths);
  store.load();
  const next = emptyState();
  next.installs.push({ name: 'handoff', enabled: true, installedHash: 'x', treeSha: 'a'.repeat(40) });
  next.installs.push({ name: 'legacy', enabled: true, installedHash: 'y' });
  store.save(next);

  const reloaded = new StateStore(paths);
  const state = reloaded.load();
  assert.equal(reloaded.readOnly, false);
  assert.equal(state.version, STATE_VERSION, '版本仍是 2');
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
  writeState(paths, { version: 99, installs: [] });
  const store = new StateStore(paths);
  store.load();
  assert.equal(store.readOnly, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('v1 → v2：mode 变 enabled，scopeProjects 挂到 legacy 上等迁移处理', () => {
  const { root, paths } = sandbox();
  writeState(paths, {
    version: 1,
    settings: { autoLinkTargets: null },
    installs: [
      { name: 'a', mode: 'off', scopeProjects: ['/repo'], installedHash: 'x' },
      { name: 'b', mode: 'on', scopeProjects: [], installedHash: 'y' },
    ],
    links: [],
    subscriptions: [],
  });
  const state = new StateStore(paths).load();
  const a = state.installs.find((item) => item.name === 'a');
  const b = state.installs.find((item) => item.name === 'b');
  assert.equal(a.enabled, false);
  assert.equal(b.enabled, true);
  assert.equal('mode' in a, false, 'mode 不再落盘');
  assert.deepEqual(a.legacyScopeProjects, ['/repo']);
  assert.equal('scopeProjects' in b, false, '空作用范围直接丢掉');

  fs.rmSync(root, { recursive: true, force: true });
});

test('v1 → v2：links 按目标拆成 exports 与待删清单', () => {
  const upgraded = upgradeStateV1(
    {
      version: 1,
      installs: [],
      links: [
        { skill: 'a', target: 'dsh-global', linkPath: '/h/.dsh/skills/a', agentDir: '/h/.dsh/skills', mode: 'relative' },
        { skill: 'a', target: 'agent:claude-code', linkPath: '/h/.claude/skills/a', agentDir: '/h/.claude/skills', mode: 'relative' },
        { skill: 'a', target: 'project:/repo', linkPath: '/repo/.dsh/skills/a', agentDir: '/repo/.dsh/skills', mode: 'relative' },
      ],
    },
    { now: '2026-01-01T00:00:00.000Z' },
  );
  assert.deepEqual(upgraded.exports.map((row) => row.target), ['agent:claude-code']);
  assert.deepEqual(upgraded.migration.legacyLinks.map((row) => row.target), ['dsh-global', 'project:/repo']);
  assert.equal(upgraded.migration.status, 'links-pending');
  assert.equal(upgraded.version, 2);
});

test('v1 迁移前留原文件副本，且只迁一次', () => {
  const { root, paths } = sandbox();
  writeState(paths, { version: 1, settings: { autoLinkAgents: false }, installs: [], links: [], subscriptions: [] });
  const first = new StateStore(paths);
  first.load();
  const backups = fs.readdirSync(paths.migrationsDir).filter((name) => name.startsWith('state-v1-'));
  assert.equal(backups.length, 1, '原文件副本落 migrations/');
  assert.equal(JSON.parse(fs.readFileSync(path.join(paths.migrationsDir, backups[0]), 'utf8')).version, 1, '副本是原始 v1');

  // 第二次读不该再复制一份（文件已经是 v2）
  const second = new StateStore(paths);
  second.load();
  assert.equal(fs.readdirSync(paths.migrationsDir).filter((name) => name.startsWith('state-v1-')).length, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('缺字段但结构可信 → 补默认值继续用', () => {
  const { root, paths } = sandbox();
  writeState(paths, { version: 1, installs: [], links: [], subscriptions: [] });
  const store = new StateStore(paths);
  const state = store.load();
  assert.equal(store.readOnly, false);
  assert.deepEqual(state.settings.exportTargets, [], 'v2 默认不导出任何 agent');
  assert.equal(state.settings.placement, 'settings', '默认入口在设置里');
  assert.deepEqual(state.agents.custom, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings.placement 只接受 settings / sidebar，非法值回退', () => {
  const { root, paths } = sandbox();
  const write = (placement) => {
    writeState(paths, { version: 2, settings: { exportTargets: [], placement }, installs: [], exports: [], shadows: [], subscriptions: [] });
    return new StateStore(paths).load();
  };
  assert.equal(write('sidebar').settings.placement, 'sidebar');
  assert.equal(write('bogus').settings.placement, 'settings');
  assert.equal(write(undefined).settings.placement, 'settings');
  fs.rmSync(root, { recursive: true, force: true });
});

test('v2 结构损坏 → 只读（exports 缺 target / shadows 缺 stubPath）', () => {
  const { root, paths } = sandbox();
  writeState(paths, { version: 2, settings: { exportTargets: [] }, installs: [], exports: [{ skill: 'a' }], shadows: [] });
  const store = new StateStore(paths);
  store.load();
  assert.equal(store.readOnly, true);
  assert.match(store.problem, /exports\[\] is missing target/);

  writeState(paths, { version: 2, settings: { exportTargets: [] }, installs: [], exports: [], shadows: [{ skill: 'a', scope: 'user' }] });
  const second = new StateStore(paths);
  second.load();
  assert.equal(second.readOnly, true);
  assert.match(second.problem, /shadows\[\] is missing stubPath/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings.exportTargets 只留 agent:* 形态', () => {
  const { root, paths } = sandbox();
  writeState(paths, {
    version: 2,
    settings: { exportTargets: ['agent:codex', 'dsh-global', 42, 'agent:codex'] },
    installs: [],
    exports: [],
    shadows: [],
    subscriptions: [],
  });
  const state = new StateStore(paths).load();
  assert.deepEqual(state.settings.exportTargets, ['agent:codex']);
  fs.rmSync(root, { recursive: true, force: true });
});

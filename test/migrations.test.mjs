import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../lib/core/paths.js';
import { StateStore } from '../lib/core/state.js';
import { ensureMigrated, pruneMigrationBackups } from '../lib/core/migrations.js';
import { inspectShadow } from '../lib/core/shadow.js';
import { resolveVisibility } from '../lib/core/visibility.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-migrate-'));
  const home = path.join(root, 'home');
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.mkdirSync(paths.canonical, { recursive: true });
  fs.mkdirSync(paths.dshGlobalSkills, { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  return { root, home, paths };
}

function skill(paths, name) {
  const dir = path.join(paths.canonical, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: real\n---\nbody\n`);
  return dir;
}

function writeV1(paths, state) {
  fs.writeFileSync(paths.stateFile, JSON.stringify({ version: 1, checks: {}, ...state }, null, 2));
}

const logger = () => {};

test('迁移：删历史 DSH 链、留外来链与真实目录、剪悬空导出、写 manifest', () => {
  const { root, home, paths } = sandbox();
  const canonical = skill(paths, 'demo');
  const dshLink = path.join(paths.dshGlobalSkills, 'demo');
  fs.symlinkSync(canonical, dshLink, 'dir');
  const claudeLink = path.join(home, '.claude', 'skills', 'demo');
  fs.symlinkSync(path.relative(path.dirname(claudeLink), canonical), claudeLink, 'dir');

  // 外部链（指向别处）与真实目录：都要原样留下
  const external = path.join(home, 'somewhere', 'other-skill');
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(path.join(external, 'SKILL.md'), '---\nname: other\n---\n');
  const externalLink = path.join(paths.dshGlobalSkills, 'other-skill');
  fs.symlinkSync(external, externalLink, 'dir');
  const realDir = path.join(paths.dshGlobalSkills, 'backup-copy');
  fs.mkdirSync(realDir, { recursive: true });
  fs.writeFileSync(path.join(realDir, 'SKILL.md'), '---\nname: backup-copy\n---\n');

  writeV1(paths, {
    settings: { autoLinkAgents: true },
    installs: [{ name: 'demo', mode: 'on', scopeProjects: [], installedHash: 'x' }],
    links: [
      { skill: 'demo', target: 'dsh-global', agentDir: paths.dshGlobalSkills, linkPath: dshLink, mode: 'relative' },
      { skill: 'demo', target: 'agent:claude-code', agentDir: path.join(home, '.claude', 'skills'), linkPath: claudeLink, mode: 'relative' },
      { skill: 'ghost', target: 'agent:cursor', agentDir: path.join(home, '.cursor', 'skills'), linkPath: path.join(home, '.cursor', 'skills', 'ghost'), mode: 'relative' },
    ],
    subscriptions: [],
  });

  const store = new StateStore(paths);
  store.load();
  const result = ensureMigrated({ paths, store, logger });
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);

  assert.equal(fs.existsSync(dshLink), false, 'rank 提升链要删掉');
  assert.ok(fs.lstatSync(claudeLink).isSymbolicLink(), '真正的导出链要留');
  assert.ok(fs.lstatSync(externalLink).isSymbolicLink(), '外来链一删用户就直接丢技能');
  assert.ok(fs.existsSync(realDir), '真实目录不动');

  assert.deepEqual(store.state.exports.map((row) => row.target), ['agent:claude-code'], '悬空记录被剪掉');
  assert.equal(store.state.migration.status, 'done');

  const manifests = fs.readdirSync(paths.migrationsDir).filter((name) => name.startsWith('v1-to-v2-'));
  assert.equal(manifests.length, 1, 'manifest 要留一份');
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.migrationsDir, manifests[0]), 'utf8'));
  assert.deepEqual(manifest.linksRemoved, [dshLink]);
  assert.equal(manifest.phase, 'done');
  assert.equal(manifest.exportsPruned.length, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('迁移：幂等——再跑一次不改盘、不再写 manifest', () => {
  const { root, paths } = sandbox();
  skill(paths, 'demo');
  writeV1(paths, {
    settings: {},
    installs: [{ name: 'demo', mode: 'on', scopeProjects: [], installedHash: 'x' }],
    links: [],
    subscriptions: [],
  });
  const store = new StateStore(paths);
  store.load();
  ensureMigrated({ paths, store, logger });
  const before = fs.readdirSync(paths.migrationsDir).length;
  const second = ensureMigrated({ paths, store, logger });
  assert.equal(second.migrated, false, 'status=done 之后是空操作');
  assert.equal(fs.readdirSync(paths.migrationsDir).length, before);
  fs.rmSync(root, { recursive: true, force: true });
});

test('迁移：v1 停用态补建标记，并把「看不见」变成事实', () => {
  const { root, paths } = sandbox();
  skill(paths, 'demo');
  writeV1(paths, {
    settings: {},
    installs: [{ name: 'demo', mode: 'off', scopeProjects: [], installedHash: 'x' }],
    links: [{ skill: 'demo', target: 'dsh-global', agentDir: paths.dshGlobalSkills, linkPath: path.join(paths.dshGlobalSkills, 'demo'), mode: 'relative' }],
    subscriptions: [],
  });
  // v1 的「停用」= 链已经不在了
  const store = new StateStore(paths);
  store.load();
  ensureMigrated({ paths, store, logger });

  const install = store.findInstall('demo');
  assert.equal(install.enabled, false);
  assert.equal(store.state.shadows.length, 1);
  const stub = store.state.shadows[0].stubPath;
  assert.equal(inspectShadow(stub, 'demo').state, 'ours');

  const { byName } = resolveVisibility({
    roots: [
      { source: 'user-dsh', rank: 400, path: paths.dshGlobalSkills, exists: true },
      { source: 'user-agents', rank: 500, path: paths.userAgentsSkills, exists: true },
    ],
    shadowPaths: new Set([stub]),
  });
  assert.equal(byName.get('demo').visible, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('迁移：停用位被外来链占用 → fail-open 改回启用，链原样保留', () => {
  const { root, home, paths } = sandbox();
  skill(paths, 'demo');
  const external = path.join(home, 'elsewhere', 'demo');
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(path.join(external, 'SKILL.md'), '---\nname: demo\n---\n');
  const occupied = path.join(paths.dshGlobalSkills, 'demo');
  fs.symlinkSync(external, occupied, 'dir');

  writeV1(paths, {
    settings: {},
    installs: [{ name: 'demo', mode: 'off', scopeProjects: [], installedHash: 'x' }],
    links: [],
    subscriptions: [],
  });
  const store = new StateStore(paths);
  store.load();
  const result = ensureMigrated({ paths, store, logger });

  assert.equal(store.findInstall('demo').enabled, true, '建不出标记就不能谎称已停用');
  assert.equal(result.report.shadowFailures.length, 1);
  assert.ok(fs.lstatSync(occupied).isSymbolicLink(), '外来链不许删');
  assert.equal(store.state.shadows.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('迁移：v1 的项目作用范围变成项目级标记', () => {
  const { root, home, paths } = sandbox();
  skill(paths, 'demo');
  const repo = path.join(home, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });

  writeV1(paths, {
    settings: {},
    installs: [{ name: 'demo', mode: 'off', scopeProjects: [repo], installedHash: 'x' }],
    links: [],
    subscriptions: [],
  });
  const store = new StateStore(paths);
  store.load();
  ensureMigrated({ paths, store, logger });

  const scopes = store.state.shadows.map((row) => row.scope).sort();
  assert.deepEqual(scopes, ['project:' + repo, 'user']);
  assert.equal(inspectShadow(path.join(repo, '.dsh', 'skills', 'demo'), 'demo').state, 'ours');
  assert.equal('legacyScopeProjects' in store.findInstall('demo'), false, '迁移完就不该再挂着 v1 字段');
  fs.rmSync(root, { recursive: true, force: true });
});

test('迁移：过期备份会被清理，7 天内的留着', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.migrationsDir, { recursive: true });
  const old = path.join(paths.migrationsDir, 'v1-to-v2-old.json');
  const fresh = path.join(paths.migrationsDir, 'v1-to-v2-new.json');
  fs.writeFileSync(old, '{}');
  fs.writeFileSync(fresh, '{}');
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);

  const removed = pruneMigrationBackups({ paths });
  assert.deepEqual(removed, ['v1-to-v2-old.json']);
  assert.ok(fs.existsSync(fresh));
  fs.rmSync(root, { recursive: true, force: true });
});

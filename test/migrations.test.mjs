import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../lib/core/paths.js';
import { StateStore } from '../lib/core/state.js';
import { ensureMigrated, pruneMigrationBackups } from '../lib/core/migrations.js';
import { createShadow, inspectShadow } from '../lib/core/shadow.js';

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

function writeState(paths, value) {
  fs.writeFileSync(paths.stateFile, JSON.stringify(value, null, 2));
}

function writeV1(paths, state) {
  writeState(paths, { version: 1, checks: {}, ...state });
}

const logger = () => {};

function v2Base(over = {}) {
  return {
    version: 2,
    settings: { exportTargets: [], placement: 'settings' },
    agents: { custom: [], dismissed: [] },
    subscriptions: [],
    installs: [],
    exports: [],
    shadows: [],
    checks: {},
    migration: null,
    ...over,
  };
}

test('v1→v3：删历史 DSH 链、留外来链与真实目录、剪悬空导出、写 manifest、不补桩', () => {
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
    installs: [
      { name: 'demo', mode: 'on', scopeProjects: [], installedHash: 'x' },
      { name: 'off-one', mode: 'off', scopeProjects: [], installedHash: 'y' },
    ],
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
  assert.equal(fs.existsSync(path.join(paths.dshGlobalSkills, 'off-one')), false, 'v1 停用态不再补桩');

  assert.deepEqual(store.state.exports.map((row) => row.target), ['agent:claude-code'], '悬空记录被剪掉');
  assert.equal(store.findInstall('off-one').enabled, false, '停用意图保留在 enabled，由 provider 执行');
  assert.equal(store.state.migration.status, 'done');
  assert.equal(store.state.migration.to, 3);

  const manifests = fs.readdirSync(paths.migrationsDir).filter((name) => name.startsWith('v1-to-v3-'));
  assert.equal(manifests.length, 1, 'manifest 要留一份');
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.migrationsDir, manifests[0]), 'utf8'));
  assert.deepEqual(manifest.linksRemoved, [dshLink]);
  assert.equal(manifest.phase, 'done');
  assert.equal(manifest.to, 3);
  assert.equal(manifest.exportsPruned.length, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('v1→v3：legacyScopeProjects 只记账后丢弃，不建项目级桩', () => {
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
  const result = ensureMigrated({ paths, store, logger });

  assert.equal(store.findInstall('demo').enabled, false);
  assert.equal('legacyScopeProjects' in store.findInstall('demo'), false, '迁移完就不该再挂着 v1 字段');
  assert.equal(result.report.legacyScopeProjectsDropped.length, 1);
  assert.equal(fs.existsSync(path.join(repo, '.dsh', 'skills', 'demo')), false, '不再有项目级桩');
  fs.rmSync(root, { recursive: true, force: true });
});

test('v2→v3：旧桩被删掉、legacyShadows 清空、enabled 保持停用、备份与 manifest 齐全', () => {
  const { root, paths } = sandbox();
  skill(paths, 'demo');
  const stub = path.join(paths.dshGlobalSkills, 'demo');
  createShadow({ stubPath: stub, name: 'demo', scope: 'user' });
  writeState(paths, v2Base({
    installs: [{ name: 'demo', enabled: true, installedHash: 'x' }],
    shadows: [{ skill: 'demo', scope: 'user', stubPath: stub, createdAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const store = new StateStore(paths);
  store.load();
  assert.equal(store.state.version, 3);
  assert.equal(store.findInstall('demo').enabled, false, 'user 级旧桩等价于停用');
  assert.deepEqual(store.state.legacyShadows.map((row) => row.reason), ['pending']);

  const backups = fs.readdirSync(paths.migrationsDir).filter((name) => name.startsWith('state-v2-'));
  assert.equal(backups.length, 1, '升级前留 v2 原文件副本');

  const result = ensureMigrated({ paths, store, logger });
  assert.equal(result.migrated, true);
  assert.equal(fs.existsSync(stub), false, '旧桩要被删掉');
  assert.deepEqual(store.state.legacyShadows, []);
  assert.equal(store.findInstall('demo').enabled, false);
  assert.equal(store.state.migration.status, 'done');

  const manifests = fs.readdirSync(paths.migrationsDir).filter((name) => name.startsWith('v2-to-v3-'));
  assert.equal(manifests.length, 1);
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.migrationsDir, manifests[0]), 'utf8'));
  assert.equal(manifest.legacyShadowsRemoved.length, 1);
  assert.deepEqual(manifest.legacyShadowsKept, []);
  assert.equal(manifest.phase, 'done');

  fs.rmSync(root, { recursive: true, force: true });
});

test('v2→v3：foreign / link / orphan 不删，如实留在 legacyShadows', () => {
  const { root, home, paths } = sandbox();
  skill(paths, 'kept');
  skill(paths, 'linked');
  // foreign：同名真实目录（不是本插件的桩）
  const foreign = path.join(paths.dshGlobalSkills, 'kept');
  fs.mkdirSync(foreign, { recursive: true });
  fs.writeFileSync(path.join(foreign, 'SKILL.md'), '---\nname: kept\ndescription: mine\n---\n');
  // link：同位置被别人放了软链
  const linked = path.join(paths.dshGlobalSkills, 'linked');
  fs.symlinkSync(path.join(paths.canonical, 'linked'), linked, 'dir');
  // orphan：账本里没有同名 install
  const orphan = path.join(paths.dshGlobalSkills, 'ghost');
  createShadow({ stubPath: orphan, name: 'ghost', scope: 'user' });

  writeState(paths, v2Base({
    installs: [
      { name: 'kept', enabled: true },
      { name: 'linked', enabled: true },
    ],
    shadows: [
      { skill: 'kept', scope: 'user', stubPath: foreign, createdAt: '2026-01-01T00:00:00.000Z' },
      { skill: 'linked', scope: 'user', stubPath: linked, createdAt: '2026-01-01T00:00:00.000Z' },
      { skill: 'ghost', scope: 'user', stubPath: orphan, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
  }));

  const store = new StateStore(paths);
  store.load();
  const result = ensureMigrated({ paths, store, logger });

  assert.equal(result.migrated, true);
  assert.ok(fs.lstatSync(foreign).isDirectory(), '外来真实目录不许删');
  assert.ok(fs.lstatSync(linked).isSymbolicLink(), '别人的软链不许拆');
  assert.equal(inspectShadow(orphan, 'ghost').state, 'ours', 'orphan 不删：删了会让原本隐藏的技能突然可见');
  assert.deepEqual(
    store.state.legacyShadows.map((row) => [row.skill, row.reason]),
    [['kept', 'foreign'], ['linked', 'link'], ['ghost', 'orphan']],
  );
  // 有旧桩的 install 仍按「停用」处理，orphan 不凭空造 install
  assert.equal(store.findInstall('kept').enabled, false);
  assert.equal(store.findInstall('linked').enabled, false);
  assert.equal(store.findInstall('ghost'), undefined);

  fs.rmSync(root, { recursive: true, force: true });
});

test('v2→v3：project 级旧桩只清理、不转全局停用', () => {
  const { root, home, paths } = sandbox();
  skill(paths, 'demo');
  const repo = path.join(home, 'repo');
  fs.mkdirSync(path.join(repo, '.dsh', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.git'), 'gitdir: x', 'utf8');
  const projectStub = path.join(repo, '.dsh', 'skills', 'demo');
  createShadow({ stubPath: projectStub, name: 'demo', scope: `project:${repo}` });

  writeState(paths, v2Base({
    installs: [{ name: 'demo', enabled: true }],
    shadows: [{ skill: 'demo', scope: `project:${repo}`, stubPath: projectStub, createdAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const store = new StateStore(paths);
  store.load();
  ensureMigrated({ paths, store, logger });

  assert.equal(store.findInstall('demo').enabled, true, '项目桩不能变成全局停用');
  assert.equal(fs.existsSync(projectStub), false, '桩还是要清掉');
  assert.deepEqual(store.state.legacyShadows, []);
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

test('迁移：过期清单会被清理，7 天内的留着（state 副本不在清理范围）', () => {
  const { root, paths } = sandbox();
  fs.mkdirSync(paths.migrationsDir, { recursive: true });
  const old = path.join(paths.migrationsDir, 'v1-to-v3-old.json');
  const fresh = path.join(paths.migrationsDir, 'v2-to-v3-new.json');
  const copy = path.join(paths.migrationsDir, 'state-v2-old.json');
  for (const file of [old, fresh, copy]) fs.writeFileSync(file, '{}');
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
  fs.utimesSync(copy, eightDaysAgo, eightDaysAgo);

  const removed = pruneMigrationBackups({ paths });
  assert.deepEqual(removed, ['v1-to-v3-old.json']);
  assert.ok(fs.existsSync(fresh));
  assert.ok(fs.existsSync(copy), '原始状态副本保留');
  fs.rmSync(root, { recursive: true, force: true });
});

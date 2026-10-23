import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCli } from '../lib/core/cli.js';
import { createPaths } from '../lib/core/paths.js';
import { createRegistry } from '../lib/core/agents.js';
import { createService } from '../lib/core/service.js';
import { StateStore } from '../lib/core/state.js';

const TREE_SHA = 'e'.repeat(40);
const COMMIT = 'f'.repeat(40);

// 模拟 skills CLI：add 会重建 canonical 目录并写 lock；remove 会删目录与 lock 条目
const STUB = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const home = process.env.TEST_HOME;
const canonical = path.join(home, '.agents', 'skills');
const lockPath = path.join(home, '.agents', '.skill-lock.json');
const readLock = () => { try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return { version: 3, skills: {} }; } };
const writeLock = (lock) => { fs.mkdirSync(path.dirname(lockPath), { recursive: true }); fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2)); };
const namesAfter = (flag) => {
  const out = [];
  const index = args.indexOf(flag);
  if (index < 0) return out;
  for (let i = index + 1; i < args.length && !args[i].startsWith('-'); i += 1) out.push(args[i]);
  return out;
};
if (args.includes('--version')) { console.log('1.7.4'); process.exit(0); }
if (args[0] === 'add' && args.includes('--help')) { console.log('--json --full-depth --skill'); process.exit(0); }
if (args[0] === 'list') { console.log('[]'); process.exit(0); }
if (args[0] === 'add') {
  const names = namesAfter('--skill');
  const lock = readLock();
  for (const name of names) {
    const dir = path.join(canonical, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\\nname: ' + name + '\\ndescription: demo\\n---\\nbody\\n');
    lock.skills[name] = {
      source: process.env.TEST_SOURCE || 'morehao/ai-kit',
      sourceType: 'github',
      sourceUrl: 'https://github.com/morehao/ai-kit.git',
      skillPath: 'skills/' + name + '/SKILL.md',
      skillFolderHash: process.env.TEST_TREE_SHA || '${TREE_SHA}',
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  lock.version = 3;
  writeLock(lock);
  console.log(JSON.stringify({ ok: true, installed: names }));
  process.exit(0);
}
if (args[0] === 'remove') {
  const names = namesAfter('-s');
  const lock = readLock();
  for (const name of names) {
    fs.rmSync(path.join(canonical, name), { recursive: true, force: true });
    delete lock.skills[name];
  }
  writeLock(lock);
  console.log('removed');
  process.exit(0);
}
process.exit(0);
`;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsm-service-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  const stub = path.join(root, 'stub.cjs');
  fs.writeFileSync(stub, STUB);
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const store = new StateStore(paths);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const env = {
    ...process.env,
    DSH_SKILLS_MANAGER_CLI: `${process.execPath} ${stub}`,
    TEST_HOME: home,
    TEST_TREE_SHA: TREE_SHA,
    PATH: '',
  };
  const logger = () => {};
  const cli = createCli({ env, logger });
  const service = createService({
    paths,
    store,
    registry,
    cli,
    logger,
    env,
    fetchImpl: async () => new Response('{}', { status: 500 }),
    visibleProvider: async () => ({ skills: [{ name: 'alpha', source: 'user-dsh' }], complete: true }),
  });
  return { root, home, paths, store, service, registry };
}

test('安装：canonical + lock 断言 + 默认建链 + 记账', async () => {
  const { root, home, paths, store, service } = setup();
  const result = await service.install({
    source: 'morehao/ai-kit',
    skills: ['alpha'],
    targets: ['dsh-global', 'agent:claude-code'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.installed.length, 1);

  const canonical = path.join(paths.canonical, 'alpha');
  assert.ok(fs.existsSync(path.join(canonical, 'SKILL.md')));
  const install = store.findInstall('alpha');
  assert.ok(install, '必须写 installs 记录');
  assert.match(install.installedHash, /^[0-9a-f]{64}$/);
  assert.equal(install.mode, 'on');

  assert.ok(fs.lstatSync(path.join(home, '.dsh', 'skills', 'alpha')).isSymbolicLink(), 'dsh 全局链必须建');
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(), '其他 Agent 按 targets 建');

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.equal(row.managed, true);
  assert.equal(row.visible, true, '可见列要能对上 canonical 条目');
  fs.rmSync(root, { recursive: true, force: true });
});

test('启停：off 只摘 DSH 侧链接，文件与其他 Agent 链接不动；on 按原作用范围重建', async () => {
  const { root, home, paths, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['dsh-global', 'agent:claude-code'] });

  await service.setMode({ name: 'alpha', mode: 'off' });
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false, 'DSH 侧链接应被摘掉');
  assert.ok(fs.existsSync(path.join(paths.canonical, 'alpha', 'SKILL.md')), '文件不能动');
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(), '其他 Agent 不动');

  await service.setMode({ name: 'alpha', mode: 'on' });
  assert.ok(fs.lstatSync(path.join(home, '.dsh', 'skills', 'alpha')).isSymbolicLink());
  fs.rmSync(root, { recursive: true, force: true });
});

test('删除：体检拦截真实目录；通过后进回收站并清记账', async () => {
  const { root, home, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['dsh-global', 'agent:claude-code'] });

  const claudeLink = path.join(home, '.claude', 'skills', 'alpha');
  fs.rmSync(claudeLink, { force: true });
  fs.mkdirSync(claudeLink);
  fs.writeFileSync(path.join(claudeLink, 'SKILL.md'), 'mine');

  await assert.rejects(
    () => service.remove({ name: 'alpha' }),
    (error) => {
      assert.equal(error.code, 'error.skills.remove-conflict');
      assert.match(error.message, /不是本插件创建/);
      return true;
    },
  );
  assert.ok(fs.existsSync(path.join(paths.canonical, 'alpha', 'SKILL.md')), '拦截时不能动真身');

  fs.rmSync(claudeLink, { recursive: true, force: true });
  const result = await service.remove({ name: 'alpha' });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  assert.ok(fs.existsSync(path.join(paths.trashDir, result.trash, 'content', 'SKILL.md')));
  assert.equal(store.findInstall('alpha'), undefined);
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动接管：CLI 已装好的技能在第一次读取时直接纳入追踪', async () => {
  const { root, home, paths, store, service } = setup();
  // 模拟"CLI 装好但本插件不知道"的状态
  const dir = path.join(paths.canonical, 'alpha');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: demo\n---\nbody\n');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.agents', '.skill-lock.json'),
    JSON.stringify({
      version: 3,
      skills: {
        alpha: {
          source: 'morehao/ai-kit',
          sourceType: 'github',
          skillPath: 'skills/alpha/SKILL.md',
          skillFolderHash: TREE_SHA,
        },
      },
    }),
  );
  fs.symlinkSync(path.join('..', '..', '.agents', 'skills', 'alpha'), path.join(home, '.dsh', 'skills', 'alpha'), 'dir');

  // 没有再点「接管」，第一次 GET /state 就该把账补上
  const before = await service.getState({});
  const row = before.installs.find((item) => item.name === 'alpha');
  assert.equal(row.managed, true);
  assert.notEqual(row.status, 'unmanaged');

  const install = store.findInstall('alpha');
  assert.ok(install.installedHash);
  assert.ok(install.subscriptionId, '有 lock 来源时自动建订阅');
  const subscription = store.state.subscriptions.find((item) => item.id === install.subscriptionId);
  assert.equal(subscription.source, 'morehao/ai-kit');
  assert.ok(row.links.some((link) => link.target === 'dsh-global' && link.state === 'managed'), '已存在的链接要记成自己的');

  const repeat = await service.getState({});
  assert.equal(store.state.installs.filter((item) => item.name === 'alpha').length, 1, '对账必须幂等');
  assert.equal(repeat.installs.find((item) => item.name === 'alpha').managed, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('接管：没有 lock 来源的技能也能纳入追踪，但无法检测更新', async () => {
  const { root, paths, store, service } = setup();
  const dir = path.join(paths.canonical, 'beta');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: beta\ndescription: demo\n---\nbody\n');

  const result = await service.adopt({ name: 'beta' });
  assert.equal(result.ok, true);
  assert.equal(result.tracked, false);
  assert.match(result.note, /没有可识别的远端来源/);
  const install = store.findInstall('beta');
  assert.ok(install);
  assert.equal(install.subscriptionId, null);

  const state = await service.getState({});
  assert.equal(state.installs.find((item) => item.name === 'beta').managed, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('只读状态下的写操作被拒绝，也不会自动接管', async () => {
  const { root, paths, store, service } = setup();
  const dir = path.join(paths.canonical, 'gamma');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: gamma\n---\nbody\n');
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.stateFile, 'broken');
  store.load();
  await assert.rejects(() => service.setSettings({ autoLinkAgents: false }), /read-only|state/i);

  const state = await service.getState({});
  assert.equal(state.readOnly, true);
  assert.equal(store.findInstall('gamma'), undefined, '只读时绝不对账写盘');
  assert.equal(state.installs.find((item) => item.name === 'gamma').status, 'unmanaged');
  fs.rmSync(root, { recursive: true, force: true });
});

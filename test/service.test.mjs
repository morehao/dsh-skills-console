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
import { snapshotId } from '../lib/core/updates.js';

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
  let names = namesAfter('--skill');
  // \`--skill '*'\` = 整仓全部；stub 固定回两个，方便断言"留空装全部"
  if (names.includes('*')) names = ['all-one', 'all-two'];
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
  console.log(JSON.stringify(names.map((name) => ({ name, status: 'installed' }))));
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

function setup(extra = {}, envExtra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-service-'));
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
    DSH_SKILLS_CONSOLE_CLI: `${process.execPath} ${stub}`,
    TEST_HOME: home,
    TEST_TREE_SHA: TREE_SHA,
    PATH: '',
    ...envExtra,
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
    ...extra,
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

test('安装：技能名留空 → CLI 按 --skill * 装全部，并按输出里的真实结果记账', async () => {
  const { root, home, paths, store, service } = setup();
  const result = await service.install({ source: 'https://github.com/alchaincyf/huashu-design', skills: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.installed.map((item) => item.name).sort(), ['all-one', 'all-two'], '以 CLI 输出为准');

  for (const name of ['all-one', 'all-two']) {
    assert.ok(fs.existsSync(path.join(paths.canonical, name, 'SKILL.md')), `${name} 要落进 canonical`);
    assert.ok(fs.lstatSync(path.join(home, '.dsh', 'skills', name)).isSymbolicLink(), `${name} 要接入 dsh`);
    assert.ok(store.findInstall(name), `${name} 要有 installs 记录`);
  }
  assert.equal(store.state.installs.length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('作用范围：/state 带出可选的 DSH 工作区', async () => {
  const workspace = { id: 'w1', title: 'my-project', path: '/tmp/my-project' };
  const { root, service } = setup({ workspacesProvider: async () => [workspace] });
  const state = await service.getState({});
  assert.deepEqual(state.workspaces, [workspace]);

  const broken = setup({ workspacesProvider: async () => { throw new Error('registry down'); } });
  const fallback = await broken.service.getState({});
  assert.deepEqual(fallback.workspaces, [], '工作区服务失败不影响清单');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(broken.root, { recursive: true, force: true });
});

test('自动接入：只接入勾选的已探测 Agent，dsh 全局必选', async () => {
  const { root, home, paths, store, service } = setup();
  fs.mkdirSync(path.join(home, '.codebuddy', 'skills'), { recursive: true });

  await service.setSettings({ autoLinkTargets: ['agent:claude-code', 'agent:not-detected', 'bad-target'] });
  assert.deepEqual(store.state.settings.autoLinkTargets, ['agent:claude-code'], '未知/未探测的 Agent 被过滤');

  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  assert.ok(fs.lstatSync(path.join(home, '.dsh', 'skills', 'alpha')).isSymbolicLink(), 'dsh 全局必建');
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(), '勾选的 Agent 要建');
  assert.equal(fs.existsSync(path.join(home, '.codebuddy', 'skills', 'alpha')), false, '没勾的不能建');

  await service.setSettings({ autoLinkTargets: [] });
  await service.install({ source: 'morehao/ai-kit', skills: ['beta'] });
  assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'beta')), false);

  await service.setSettings({ autoLinkTargets: null });
  await service.install({ source: 'morehao/ai-kit', skills: ['gamma'] });
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'gamma')).isSymbolicLink(), 'null = 所有探测到的 Agent');
  assert.ok(fs.lstatSync(path.join(home, '.codebuddy', 'skills', 'gamma')).isSymbolicLink());
  fs.rmSync(root, { recursive: true, force: true });
});

test('入口位置：settings / sidebar 持久化，非法值被忽略', async () => {
  const { root, store, service } = setup();
  assert.equal(store.state.settings.placement, 'settings');
  await service.setSettings({ placement: 'sidebar' });
  assert.equal(store.state.settings.placement, 'sidebar');
  await service.setSettings({ placement: 'bogus' });
  assert.equal(store.state.settings.placement, 'sidebar', '非法值不能把入口弄坏');
  await service.setSettings({ placement: 'settings' });
  assert.equal(store.state.settings.placement, 'settings');
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

test('Agent 目录被删：链接记录保留但清单忽略，自动接入不重建', async () => {
  const { root, home, store, service } = setup();
  await service.install({
    source: 'morehao/ai-kit',
    skills: ['alpha'],
    targets: ['dsh-global', 'agent:claude-code'],
  });
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'alpha')));
  fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.deepEqual(row.links.map((link) => link.target), ['dsh-global'], '断掉的 Agent 链接不进清单');
  assert.ok(
    store.state.links.some((link) => link.target === 'agent:claude-code'),
    '历史记录保留，Agent 重装后还能复用',
  );

  await service.install({ source: 'morehao/ai-kit', skills: ['beta'] });
  assert.equal(fs.existsSync(path.join(home, '.claude')), false, '自动接入不能凭空重建已删目录');
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
  await assert.rejects(() => service.setSettings({ autoLinkTargets: [] }), /read-only|state/i);

  const state = await service.getState({});
  assert.equal(state.readOnly, true);
  assert.equal(store.findInstall('gamma'), undefined, '只读时绝不对账写盘');
  assert.equal(state.installs.find((item) => item.name === 'gamma').status, 'unmanaged');
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- 订阅：添加/刷新必须以「拿到快照」为前提（失败不能留下空壳）----------------

const TREE_MAIN = [
  { path: 'skills', type: 'tree', sha: '1'.repeat(40) },
  { path: 'skills/alpha', type: 'tree', sha: '2'.repeat(40) },
  { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
];

function jsonBody(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', etag: 'W/"test"' },
  });
}

// 模拟 git：按 argv 输出固定内容，不联网。用于「探测/基线补录走 git」的用例。
const GIT_SHIM = `#!/bin/sh
echo "$@" >> "$SHIM_LOG"
case "$1" in
  --version)
    echo "git version 2.40.0"
    exit 0
    ;;
  ls-remote)
    printf 'ref: refs/heads/%s\\tHEAD\\n' "\${SHIM_BRANCH:-main}"
    printf '%s\\tHEAD\\n' "$SHIM_COMMIT"
    exit 0
    ;;
  clone)
    for last in "$@"; do :; done
    mkdir -p "$last"
    if [ "$SHIM_CLONE_FAIL" = "1" ]; then
      echo "fatal: could not read Username for 'https://github.com': terminal prompts disabled" >&2
      rm -rf "$last"
      exit 128
    fi
    exit 0
    ;;
  -C)
    shift
    shift
    cmd="$1"
    shift
    case "$cmd" in
      rev-parse)
        case "$*" in
          *'^{tree}'*) echo "$SHIM_ROOT_SHA" ;;
          *) echo "$SHIM_COMMIT" ;;
        esac
        exit 0
        ;;
      ls-tree)
        tr '\\n' '\\0' < "$SHIM_TREE_FILE"
        exit 0
        ;;
    esac
    ;;
esac
exit 0
`;

/** 临时 git shim 目录 + 环境变量（PATH 只含 shim，外加 /usr/bin:/bin 给 tr）。 */
function gitShim(root, { tree = [], commit = COMMIT, rootSha = TREE_SHA, extra = {} } = {}) {
  const bin = path.join(root, 'git-bin');
  fs.mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, 'git');
  fs.writeFileSync(shim, GIT_SHIM);
  fs.chmodSync(shim, 0o755);
  const log = path.join(root, 'git.log');
  fs.writeFileSync(log, '');
  const treeFile = path.join(root, 'tree.txt');
  fs.writeFileSync(
    treeFile,
    `${tree.map(([mode, type, sha, entryPath]) => `${mode} ${type} ${sha}\t${entryPath}`).join('\n')}\n`,
  );
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    SHIM_LOG: log,
    SHIM_TREE_FILE: treeFile,
    SHIM_COMMIT: commit,
    SHIM_ROOT_SHA: rootSha,
    SHIM_BRANCH: 'main',
    ...extra,
  };
  const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  return { env, calls, bin };
}

function gitSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-gitshim-'));
}

/** 可控的 GitHub stub：按路径分派 repo 元数据 / trees / commits，并记录调用。 */
function githubStub({ defaultBranch = 'main', tree = TREE_MAIN, commit = COMMIT, contents = {}, resetAt = 1_780_000_000 } = {}) {
  const control = { defaultBranch, tree, commit, contents, fail: null, resetAt };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (control.fail === 'network') throw new Error('ECONNRESET');
    // 探测会用 raw.githubusercontent.com 读 SKILL.md 补 frontmatter，不走 API 配额
    if (String(url).startsWith('https://raw.githubusercontent.com/')) {
      const parts = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const filePath = parts.slice(3).join('/');
      if (!(filePath in control.contents)) return new Response('not found', { status: 404 });
      return new Response(control.contents[filePath], { status: 200 });
    }
    const { pathname } = new URL(url);
    if (control.fail === 'rate-limit') {
      return new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(control.resetAt) },
      });
    }
    if (control.fail === 'forbidden') return new Response('{"message":"Forbidden"}', { status: 403 });
    if (control.fail === 'server') return new Response('{"message":"boom"}', { status: 502 });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(pathname)) {
      if (control.fail === 'metadata') return new Response('{"message":"Not Found"}', { status: 404 });
      return jsonBody({ default_branch: control.defaultBranch });
    }
    if (pathname.includes('/git/trees/')) {
      if (control.fail === 'tree') return new Response('{"message":"Not Found"}', { status: 404 });
      return jsonBody({ sha: TREE_SHA, tree: control.tree, truncated: false });
    }
    if (pathname.includes('/commits/')) return jsonBody({ sha: control.commit });
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { control, calls, fetchImpl };
}

test('添加订阅：上游报错时不落盘、接口抛错（回归：不能再出现空订阅）', async () => {
  const gh = githubStub();
  gh.control.fail = 'tree';
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  await assert.rejects(
    () => service.addSubscription({ source: 'alchaincyf/huashu-design' }),
    (error) => error.code === 'error.skills.upstream-failed' && /huashu-design/.test(error.message),
  );
  assert.equal(store.state.subscriptions.length, 0, 'state 里不能留下订阅');
  assert.equal(fs.existsSync(paths.stateFile), false, '没成功之前不写 state.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：ref 缺省时跟随仓库默认分支（master + 根级 SKILL.md）', async () => {
  const gh = githubStub({
    defaultBranch: 'master',
    tree: [{ path: 'SKILL.md', type: 'blob', sha: '4'.repeat(40) }],
  });
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.addSubscription({ source: 'https://github.com/alchaincyf/huashu-design' });
  assert.equal(result.ok, true);
  assert.equal(store.state.subscriptions.length, 1);

  const row = store.state.subscriptions[0];
  assert.equal(row.source, 'alchaincyf/huashu-design', '来源要归一成 owner/repo');
  assert.equal(row.ref, 'master', '缺省 ref 要落成仓库默认分支');
  assert.deepEqual(row.snapshot.entries.map((item) => item.name), ['huashu-design']);
  assert.equal(row.snapshot.entries[0].skillPath, 'SKILL.md');
  assert.equal(row.snapshot.entries[0].treeSha, TREE_SHA);
  assert.equal(row.snapshot.commit, COMMIT);
  assert.ok(gh.calls.some((url) => url.includes('/git/trees/master')), '必须按默认分支拉树');
  assert.ok(!gh.calls.some((url) => url.includes('/git/trees/main')), '不能硬套 main');
  fs.rmSync(root, { recursive: true, force: true });
});

test('刷新订阅：上游失败要抛错，但保留上次快照并记下 lastCheck', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  const id = added.subscription.id;
  const snapshot = structuredClone(store.state.subscriptions[0].snapshot);

  gh.control.fail = 'tree';
  await assert.rejects(
    () => service.refreshSubscription({ id }),
    (error) => error.code === 'error.skills.upstream-failed',
  );

  const row = store.state.subscriptions[0];
  assert.deepEqual(row.snapshot, snapshot, '失败不能清空已有快照');
  assert.equal(row.lastCheck.status, 'unknown');
  assert.match(row.lastCheck.detail, /404/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：同一来源重复添加幂等', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const first = await service.addSubscription({ source: 'morehao/ai-kit' });
  const second = await service.addSubscription({ source: 'morehao/ai-kit' });
  assert.equal(second.existing, true);
  assert.equal(second.subscription.id, first.subscription.id);
  assert.equal(store.state.subscriptions.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('限流安装（lock 写 64 位内容哈希）：无假警告，按记录的 tree SHA 判定更新（T2）', async () => {
  const CONTENT_HASH = 'a'.repeat(64);
  const ENTRY_TREE_SHA = '2'.repeat(40);
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl }, { TEST_TREE_SHA: CONTENT_HASH });

  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  const result = await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });

  assert.equal(result.ok, true);
  assert.equal(result.installed[0].lockHash, CONTENT_HASH, 'lockHash 保持 lock 原值');
  assert.equal(result.installed[0].lockHashShape, 'content', '形态要透出给诊断用');
  assert.deepEqual(result.warnings, [], '64 位内容哈希不能触发「哈希不一致」假警告');
  assert.equal(store.findInstall('alpha').treeSha, ENTRY_TREE_SHA, '安装时要记下快照里的 tree 基线');

  const checked = await service.checkUpdates({});
  assert.equal(checked.checks[0].status, 'current', '不再恒为 unknown，也不误报有更新');
  assert.equal(checked.checks[0].baseline, 'recorded');
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：老版本失败留下的空订阅会被补全，而不是继续留空壳', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  // 旧版本的 id 用原始 URL 计算，source 已归一；补全时要认得出是同一条
  const id = snapshotId({ source: 'https://github.com/morehao/ai-kit', ref: null, subpath: null });
  store.update((draft) => {
    draft.subscriptions.push({
      id,
      source: 'morehao/ai-kit',
      ref: null,
      subpath: null,
      skills: '*',
      lastCheck: null,
      snapshot: null,
    });
  });

  const result = await service.addSubscription({ source: 'https://github.com/morehao/ai-kit' });
  assert.equal(result.subscription.id, id);
  assert.equal(store.state.subscriptions.length, 1, '补全而不是新增一条');
  assert.equal(result.subscription.snapshot?.entries?.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：仓库里没有 SKILL.md 时按失败处理，不落空订阅', async () => {
  const gh = githubStub({ tree: [{ path: 'README.md', type: 'blob', sha: '9'.repeat(40) }] });
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  await assert.rejects(
    () => service.addSubscription({ source: 'morehao/empty-kit' }),
    (error) => error.code === 'error.skills.no-skills',
  );
  assert.equal(store.state.subscriptions.length, 0);
  assert.equal(fs.existsSync(paths.stateFile), false, '没成功之前不写 state.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：只读列出技能（多选数据源），不写 state、不建订阅', async () => {
  const gh = githubStub({
    defaultBranch: 'master',
    tree: [
      { path: 'skills/alpha/SKILL.md', type: 'blob', sha: 'a'.repeat(40) },
      { path: 'skills/beta/SKILL.md', type: 'blob', sha: 'b'.repeat(40) },
      { path: 'README.md', type: 'blob', sha: 'c'.repeat(40) },
    ],
  });
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.probeSource({ source: 'https://github.com/alchaincyf/huashu-design' });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'alchaincyf/huashu-design', '来源归一成 owner/repo');
  assert.equal(result.ref, 'master', '缺省 ref 跟随默认分支');
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta']);
  assert.deepEqual(
    result.skills.map((item) => item.skillPath),
    ['skills/alpha/SKILL.md', 'skills/beta/SKILL.md'],
  );
  assert.equal(store.state.subscriptions.length, 0, '探测不能建订阅');
  assert.equal(fs.existsSync(paths.stateFile), false, '探测不能写 state.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：用 frontmatter 的 name/description（CLI 按 name 安装），缺字段的跳过', async () => {
  const gh = githubStub({
    tree: [
      { path: 'skills/folder-a/SKILL.md', type: 'blob', sha: '1'.repeat(40) },
      { path: 'skills/folder-b/SKILL.md', type: 'blob', sha: '2'.repeat(40) },
      { path: 'skills/broken/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
    ],
    contents: {
      'skills/folder-a/SKILL.md': '---\nname: alpha\ndescription: 甲技能\n---\n\n# alpha\n',
      'skills/folder-b/SKILL.md': '---\nname: "beta"\ndescription: >\n  乙技能\n  跨行描述\n---\n',
      'skills/broken/SKILL.md': '---\nname: broken\n---\n',
    },
  });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta'], '用 frontmatter name，与 CLI 一致');
  assert.equal(result.skills[0].description, '甲技能');
  assert.equal(result.skills[1].description, '乙技能 跨行描述', '折叠块拼成一行');
  assert.equal(result.skipped, 1, '缺 description 的按 CLI 规则跳过');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：非法来源报 bad-source，不发请求', async () => {
  const { root, service } = setup();
  await assert.rejects(
    () => service.probeSource({ source: 'not a repo' }),
    (error) => error.code === 'error.skills.bad-source',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：并发与重复探测复用结果，不重复请求', async () => {
  const gh = githubStub({
    tree: [
      { path: 'SKILL.md', type: 'blob', sha: '5'.repeat(40) },
      { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '6'.repeat(40) },
    ],
  });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });

  const [first, second] = await Promise.all([
    service.probeSource({ source: 'morehao/agent-skills' }),
    service.probeSource({ source: 'https://github.com/morehao/agent-skills' }),
  ]);
  assert.deepEqual(first.skills, second.skills, '并发请求拿到同一份结果');
  const apiCalls = () => gh.calls.filter((url) => url.startsWith('https://api.github.com')).length;
  assert.equal(apiCalls(), 2, '元数据 + 文件树各一次，并发只探测一次');

  const totalCalls = gh.calls.length;
  const third = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(gh.calls.length, totalCalls, '60 秒内重复探测命中缓存，不再发请求');
  assert.deepEqual(third.skills, first.skills);
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：失败不进缓存，重试会重新请求', async () => {
  const gh = githubStub({ tree: [{ path: 'SKILL.md', type: 'blob', sha: '7'.repeat(40) }] });
  gh.control.fail = 'network';
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });

  await assert.rejects(
    () => service.probeSource({ source: 'morehao/agent-skills' }),
    (error) => error.code === 'error.skills.network',
  );
  const callsAfterFailure = gh.calls.length;
  gh.control.fail = null;
  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(result.ok, true, '重试能成功');
  assert.ok(gh.calls.length > callsAfterFailure, '失败没有留下缓存');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：四种上游失败分成四个错误码与四句不同文案（T1）', async () => {
  const cases = [
    ['rate-limit', 'error.skills.rate-limited', /已限流[\s\S]*后自动恢复[\s\S]*5000 次\/小时/],
    ['metadata', 'error.skills.repo-not-found', /仓库不存在或为私有/],
    ['forbidden', 'error.skills.repo-forbidden', /被拒绝（HTTP 403）/],
    ['server', 'error.skills.upstream-failed', /HTTP 502/],
    ['network', 'error.skills.network', /无法连接 GitHub/],
  ];
  const messages = new Set();
  for (const [fail, code, pattern] of cases) {
    const gh = githubStub();
    gh.control.fail = fail;
    const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
    await assert.rejects(
      () => service.probeSource({ source: 'morehao/agent-skills' }),
      (error) => {
        assert.equal(error.code, code, `${fail} 必须报 ${code}`);
        assert.match(error.message, pattern);
        messages.add(error.message);
        if (fail === 'rate-limit') {
          assert.match(error.message, /\d{2}:\d{2}/, '限流文案要带本机时区的重置时间');
          assert.equal(typeof error.detail.resetAt, 'number');
          assert.equal(error.detail.status, 403);
        }
        return true;
      },
    );
    assert.equal(store.state.subscriptions.length, 0, '失败不能留下订阅');
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(messages.size, cases.length, '四种失败必须是四句不同的话');
});

// ---- T3：探测优先走 git；T3.7 安装后补录 tree 基线 --------------------------

const SKILL_TREE = [
  ['040000', 'tree', '2'.repeat(40), 'skills/alpha'],
  ['100644', 'blob', '3'.repeat(40), 'skills/alpha/SKILL.md'],
  ['040000', 'tree', '4'.repeat(40), 'skills/beta'],
  ['100644', 'blob', '5'.repeat(40), 'skills/beta/SKILL.md'],
];
const SKILL_CONTENTS = {
  'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: 甲\n---\n',
  'skills/beta/SKILL.md': '---\nname: beta\ndescription: 乙\n---\n',
};

test('探测来源：git 可用时优先走 git，零 REST 调用（T3）', async () => {
  const shimRoot = gitSandbox();
  const shim = gitShim(shimRoot, { tree: SKILL_TREE });
  const gh = githubStub({ contents: SKILL_CONTENTS });
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl }, shim.env);

  const result = await service.probeSource({ source: 'https://github.com/morehao/agent-skills' });
  assert.equal(result.ok, true);
  assert.equal(result.via, 'git');
  assert.equal(result.ref, 'main', '默认分支来自 ls-remote --symref');
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta']);
  assert.equal(
    gh.calls.filter((url) => url.startsWith('https://api.github.com')).length,
    0,
    '走 git 时完全不碰 REST 配额',
  );
  assert.ok(gh.calls.some((url) => url.includes(`/${COMMIT}/`)), '描述按 commit 抓（不可变、可缓存）');
  assert.equal(fs.existsSync(paths.stateFile), false, '探测不能写 state');
  assert.equal(store.state.subscriptions.length, 0);
  assert.ok(shim.calls().some((line) => line.startsWith('clone')), '确实 clone 了一次');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(shimRoot, { recursive: true, force: true });
});

test('探测来源：DSH_SKILLS_CONSOLE_GIT=off 强制走 REST（T3 逃生开关）', async () => {
  const shimRoot = gitSandbox();
  const shim = gitShim(shimRoot, { tree: SKILL_TREE });
  const gh = githubStub({ contents: SKILL_CONTENTS });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl }, { ...shim.env, DSH_SKILLS_CONSOLE_GIT: 'off' });

  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(result.via, 'rest');
  assert.ok(gh.calls.some((url) => url.startsWith('https://api.github.com')), '关掉后走 REST');
  assert.deepEqual(shim.calls(), [], '关掉后连 git --version 都不该跑');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(shimRoot, { recursive: true, force: true });
});

test('探测来源：git 缺失 → 回退 REST（不新增故障面）', async () => {
  const gh = githubStub({
    contents: SKILL_CONTENTS,
    tree: [
      { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
      { path: 'skills/beta/SKILL.md', type: 'blob', sha: '5'.repeat(40) },
    ],
  });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });
  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(result.via, 'rest');
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：git 与 REST 都失败 → 报限流（T1 文案）', async () => {
  const shimRoot = gitSandbox();
  const shim = gitShim(shimRoot, { tree: SKILL_TREE, extra: { SHIM_CLONE_FAIL: '1' } });
  const gh = githubStub();
  gh.control.fail = 'rate-limit';
  const { root, service } = setup({ fetchImpl: gh.fetchImpl }, shim.env);

  await assert.rejects(
    () => service.probeSource({ source: 'morehao/agent-skills' }),
    (error) => error.code === 'error.skills.rate-limited' && /已限流/.test(error.message),
  );
  assert.ok(gh.calls.some((url) => url.startsWith('https://api.github.com')), 'git 失败后确实回退了 REST');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(shimRoot, { recursive: true, force: true });
});

test('安装后基线补录：64 位 lock + git 可用 → installs[].treeSha 写入（T3.7）', async () => {
  const shimRoot = gitSandbox();
  const shim = gitShim(shimRoot, { tree: SKILL_TREE });
  const { root, store, service } = setup(
    { fetchImpl: async () => new Response('{}', { status: 500 }) },
    { ...shim.env, TEST_TREE_SHA: 'c'.repeat(64) },
  );

  // 手填技能名安装：没有订阅、没有快照，lock 又是 64 位内容哈希
  const result = await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  assert.equal(result.ok, true);
  assert.equal(result.installed[0].lockHashShape, 'content');
  assert.equal(result.installed[0].treeSha, '2'.repeat(40), '接口要把补录结果带出来');
  assert.equal(store.findInstall('alpha').treeSha, '2'.repeat(40), 'state 里要落盘');
  assert.equal(shim.calls().filter((line) => line.startsWith('clone')).length, 1, '一次 clone 拿到基线');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(shimRoot, { recursive: true, force: true });
});

test('安装后基线补录：同一来源装两个技能只 clone 一次（T3.7）', async () => {
  const shimRoot = gitSandbox();
  const shim = gitShim(shimRoot, { tree: SKILL_TREE });
  const { root, store, service } = setup(
    { fetchImpl: async () => new Response('{}', { status: 500 }) },
    { ...shim.env, TEST_TREE_SHA: 'c'.repeat(64) },
  );

  await service.install({ source: 'morehao/ai-kit', skills: ['alpha', 'beta'] });
  assert.equal(store.findInstall('alpha').treeSha, '2'.repeat(40));
  assert.equal(store.findInstall('beta').treeSha, '4'.repeat(40));
  assert.equal(shim.calls().filter((line) => line.startsWith('clone')).length, 1, '共用进程内树缓存');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(shimRoot, { recursive: true, force: true });
});

test('安装后基线补录：没有 git 时安装照常成功，treeSha 保持 null（T3.7 降级）', async () => {
  const { root, store, service } = setup(undefined, { TEST_TREE_SHA: 'c'.repeat(64) });
  const result = await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  assert.equal(result.ok, true, '补录是 best effort，绝不影响安装结果');
  assert.equal(result.installed[0].lockHashShape, 'content');
  assert.equal(result.installed[0].treeSha, undefined);
  assert.equal(store.findInstall('alpha').treeSha, null);
  fs.rmSync(root, { recursive: true, force: true });
});

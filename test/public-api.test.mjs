import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { createPublicApi, createSkillsConsole } from '../dist/api.js';
import { createRegistry } from '../dist/core/agents.js';
import { contentHash } from '../dist/core/hash.js';
import { createPaths } from '../dist/core/paths.js';
import { createService } from '../dist/core/service.js';
import { StateStore } from '../dist/core/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = '2026-10-29T00:00:00.000Z';
const ROOT_SHA = '1'.repeat(40);
const COMMIT = 'f'.repeat(40);
const OLD_COMMIT = 'a'.repeat(40);
const ALPHA_TREE = '2'.repeat(40);
const BETA_TREE = '4'.repeat(40);
const GAMMA_TREE = '6'.repeat(40);
const OLD_TREE = '0'.repeat(40);

const TREE = [
  { path: 'skills', type: 'tree', sha: '9'.repeat(40) },
  { path: 'skills/alpha', type: 'tree', sha: ALPHA_TREE },
  { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
  { path: 'skills/beta', type: 'tree', sha: BETA_TREE },
  { path: 'skills/beta/SKILL.md', type: 'blob', sha: '5'.repeat(40) },
  { path: 'skills/gamma', type: 'tree', sha: GAMMA_TREE },
  { path: 'skills/gamma/SKILL.md', type: 'blob', sha: '7'.repeat(40) },
];

/** 最小 GitHub stub：默认分支 + 文件树 + commit（安装/更新计划够用，不下载 tarball）。 */
function githubStub() {
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith('https://raw.githubusercontent.com/')) return new Response('nope', { status: 404 });
    if (target.startsWith('https://github.com/') && target.endsWith('.atom')) {
      return new Response(`<feed><entry><id>tag:github.com,2008:Grit::Commit/${COMMIT}</id></entry></feed>`, { status: 200 });
    }
    const { pathname } = new URL(target);
    if (/^\/repos\/[^/]+\/[^/]+$/.test(pathname)) return Response.json({ default_branch: 'main' });
    if (pathname.includes('/git/trees/')) return Response.json({ sha: ROOT_SHA, tree: TREE, truncated: false });
    if (pathname.includes('/commits/')) return Response.json({ sha: COMMIT });
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { calls, fetchImpl };
}

/** fake installer：只模拟 canonical + lock 契约（真实下载/解压在 installer.test 覆盖）。 */
function createFakeInstaller({ paths, env = {} }) {
  const readLockFile = () => {
    try { return JSON.parse(fs.readFileSync(paths.lockFile, 'utf8')); } catch { return { version: 3, skills: {} }; }
  };
  const writeLockFile = (lock) => {
    fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
    fs.writeFileSync(paths.lockFile, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  };
  return {
    readiness: () => ({ usable: true, source: 'native', version: null, json: true, fullDepth: true, problem: null }),
    async install({ source, names = [], ref = null }) {
      const selected = names.length > 0 ? names : ['all-one', 'all-two'];
      const hash = env.TEST_TREE_SHA || 'e'.repeat(40);
      const lock = readLockFile();
      const installed = [];
      for (const name of selected) {
        const dir = path.join(paths.canonical, name);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: demo\n---\nbody\n`);
        const src = source || 'morehao/agent-skills';
        const entry = {
          source: src, sourceType: 'github', sourceUrl: `https://github.com/${src}.git`,
          skillPath: `skills/${name}/SKILL.md`, skillFolderHash: hash,
          installedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        if (ref) entry.ref = ref;
        lock.skills[name] = entry;
        installed.push({ name, skillPath: entry.skillPath, lockHash: hash, treeSha: hash, contentHash: contentHash(dir), backup: null });
      }
      lock.version = 3;
      writeLockFile(lock);
      return { installed, warnings: [] };
    },
    async remove({ name }) {
      fs.rmSync(path.join(paths.canonical, name), { recursive: true, force: true });
      const lock = readLockFile();
      delete lock.skills[name];
      writeLockFile(lock);
      return { removed: true };
    },
  };
}

function makeHome(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  return { root, home, dshHome: path.join(home, '.dsh') };
}

/** headless 工厂路径：只经 createSkillsConsole() 使用，验证「只装 commands」时的行为。 */
function headlessConsole({ installer } = {}) {
  const base = makeHome('dshsc-papi-');
  const env = { HOME: base.home, DSH_HOME: base.dshHome };
  const paths = createPaths(env);
  const gh = githubStub();
  const api = createSkillsConsole({
    env,
    paths: { home: base.home, dshHome: base.dshHome },
    fetch: gh.fetchImpl,
    installer: installer ?? createFakeInstaller({ paths, env }),
    logger: () => {},
  });
  return { ...base, env, paths, api, gh };
}

/** 直接装配 service + createPublicApi：便于预置 state 覆盖 update 的七个分支。 */
function setupServiceApi() {
  const base = makeHome('dshsc-papi-svc-');
  const paths = createPaths({ HOME: base.home, DSH_HOME: base.dshHome });
  const store = new StateStore(paths);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const gh = githubStub();
  const env = { HOME: base.home, DSH_HOME: base.dshHome };
  const installer = createFakeInstaller({ paths, env });
  const service = createService({ paths, store, registry, installer, logger: () => {}, env, fetchImpl: gh.fetchImpl });
  const api = createPublicApi(service);
  return { ...base, paths, store, service, api, gh };
}

test('list：空 state 返回 []（不扫盘、不联网）', async () => {
  const ctx = headlessConsole();
  try {
    assert.deepEqual(await ctx.api.list(), []);
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('install：headless 工厂写入 canonical + state v4 + 订阅，默认不导出、不写 ~/.dsh/skills', async () => {
  const ctx = headlessConsole();
  try {
    const result = await ctx.api.install({ source: 'morehao/agent-skills', skills: ['alpha'] });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'morehao/agent-skills');
    assert.equal(result.commit, COMMIT);
    assert.equal(result.installed[0].name, 'alpha');

    const canonical = path.join(ctx.paths.canonical, 'alpha', 'SKILL.md');
    assert.ok(fs.existsSync(canonical), 'canonical 里应有 alpha');
    assert.equal(fs.existsSync(path.join(ctx.home, '.dsh', 'skills', 'alpha')), false, '不应写 ~/.dsh/skills');

    const state = JSON.parse(fs.readFileSync(ctx.paths.stateFile, 'utf8'));
    const record = state.installs.find((row) => row.name === 'alpha');
    assert.ok(record, 'state 里应有安装记录');
    assert.equal(record.subscriptionId, state.subscriptions[0].id);
    assert.equal(state.exports.length, 0, '默认 targets: [] 不建任何导出链');

    const list = await ctx.api.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].mode, 'auto');
    assert.deepEqual(
      Object.keys(list[0]).sort(),
      ['commit', 'installedAt', 'mode', 'name', 'subscriptionId', 'treeSha', 'updatedAt'],
      '不得暴露 installedHash / enabled / backups 等内部字段',
    );
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('install：第二次同源 latest:false 复用订阅快照，不再联网', async () => {
  const ctx = headlessConsole();
  try {
    await ctx.api.install({ source: 'morehao/agent-skills', skills: ['alpha'] });
    const callsAfterFirst = ctx.gh.calls.length;
    const second = await ctx.api.install({ source: 'morehao/agent-skills', skills: ['alpha'], latest: false });
    assert.equal(second.ok, true);
    assert.equal(ctx.gh.calls.length, callsAfterFirst, 'latest:false 应复用快照，不重新联网');
    const state = JSON.parse(fs.readFileSync(ctx.paths.stateFile, 'utf8'));
    assert.equal(state.subscriptions.length, 1, '同一来源只应有一条订阅');
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('adopt：只补记账不碰文件；已纳管 already；缺失 not-found', async () => {
  const ctx = headlessConsole();
  try {
    const dir = path.join(ctx.paths.canonical, 'alpha');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: x\n---\n');

    const first = await ctx.api.adopt({ name: 'alpha' });
    assert.equal(first.already, false);
    assert.equal(first.subscriptionId, null, '无 lock 来源时不该有订阅');
    assert.equal(first.tracked, false);

    const again = await ctx.api.adopt({ name: 'alpha' });
    assert.equal(again.already, true);

    await assert.rejects(ctx.api.adopt({ name: 'does-not-exist' }), (error) => error.code === 'not-found');
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('update：current / updated / locally-modified / parked / no-subscription / failed / not-managed 七分支', async () => {
  const ctx = setupServiceApi();
  try {
    // canonical 内容与 state 记录的哈希对齐，避免误判本地改动
    for (const name of ['alpha', 'beta']) {
      const dir = path.join(ctx.paths.canonical, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: demo\n---\nbody\n`);
    }
    const alphaHash = contentHash(path.join(ctx.paths.canonical, 'alpha'));
    const betaHash = contentHash(path.join(ctx.paths.canonical, 'beta'));
    const SUB = 'sub-1';

    ctx.store.update((draft) => {
      draft.subscriptions.push({
        id: SUB, source: 'morehao/agent-skills', ref: 'main', subpath: null, skills: '*',
        snapshot: { commit: COMMIT, rootSha: ROOT_SHA, entries: [
          { name: 'alpha', skillPath: 'skills/alpha/SKILL.md', treeSha: ALPHA_TREE },
          { name: 'beta', skillPath: 'skills/beta/SKILL.md', treeSha: BETA_TREE },
          { name: 'gammaLocal', skillPath: 'skills/gamma/SKILL.md', treeSha: GAMMA_TREE },
        ] },
        lastCheck: null,
      });
      draft.installs.push(
        // current：treeSha 与目标一致，installedHash 与磁盘一致
        { name: 'alpha', subscriptionId: SUB, skillPath: 'skills/alpha/SKILL.md', commit: COMMIT, treeSha: ALPHA_TREE, installedHash: alphaHash, installedAt: NOW, updatedAt: NOW, enabled: true, mode: 'auto', backup: null },
        // updated：treeSha 落后
        { name: 'beta', subscriptionId: SUB, skillPath: 'skills/beta/SKILL.md', commit: OLD_COMMIT, treeSha: OLD_TREE, installedHash: betaHash, installedAt: NOW, updatedAt: NOW, enabled: true, mode: 'auto', backup: null },
        // locally-modified：记录的哈希与磁盘不符
        { name: 'gammaLocal', subscriptionId: SUB, skillPath: 'skills/gamma/SKILL.md', commit: OLD_COMMIT, treeSha: OLD_TREE, installedHash: 'd'.repeat(64), installedAt: NOW, updatedAt: NOW, enabled: true, mode: 'auto', backup: null },
        // failed：上游整树里找不到该 skillPath
        { name: 'ghost', subscriptionId: SUB, skillPath: 'skills/ghost/SKILL.md', commit: OLD_COMMIT, treeSha: OLD_TREE, installedHash: 'd'.repeat(64), installedAt: NOW, updatedAt: NOW, enabled: true, mode: 'auto', backup: null },
        // no-subscription：没有订阅
        { name: 'offSub', subscriptionId: null, skillPath: 'skills/offSub/SKILL.md', commit: null, treeSha: null, installedHash: null, installedAt: NOW, updatedAt: NOW, enabled: true, mode: 'auto', backup: null },
        // parked：完全停用（A′）
        { name: 'parked', subscriptionId: SUB, skillPath: 'skills/alpha/SKILL.md', commit: COMMIT, treeSha: ALPHA_TREE, installedHash: alphaHash, installedAt: NOW, updatedAt: NOW, enabled: true, mode: 'hidden', hidden: { previousMode: 'auto' }, backup: null },
      );
    });

    const result = await ctx.api.update({
      names: ['alpha', 'beta', 'gammaLocal', 'ghost', 'offSub', 'parked', 'nothere'],
    });
    const byName = new Map(result.results.map((item) => [item.name, item.status]));
    assert.equal(byName.get('alpha'), 'current');
    assert.equal(byName.get('beta'), 'updated');
    assert.equal(byName.get('gammaLocal'), 'locally-modified');
    assert.equal(byName.get('ghost'), 'failed');
    assert.equal(byName.get('offSub'), 'no-subscription');
    assert.equal(byName.get('parked'), 'parked');
    assert.equal(byName.get('nothere'), 'not-managed');
    assert.equal(result.ok, false, '存在非 updated/current 结果时 ok=false');

    const betaRecord = ctx.store.findInstall('beta');
    assert.equal(betaRecord.commit, COMMIT, 'beta 应已更新到最新 commit');

    // locally-modified 只有在 overwrite 后才会真的更新
    const forced = await ctx.api.update({ names: ['gammaLocal'], overwrite: true });
    assert.equal(forced.results[0].status, 'updated');
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('read-only：state 损坏时 list / 写方法抛 read-only（detail 带 problem）', async () => {
  const base = makeHome('dshsc-papi-ro-');
  try {
    const env = { HOME: base.home, DSH_HOME: base.dshHome };
    const paths = createPaths(env);
    fs.mkdirSync(paths.stateDir, { recursive: true });
    fs.writeFileSync(paths.stateFile, '{ this is not json');
    const api = createSkillsConsole({ env, paths: { home: base.home, dshHome: base.dshHome }, logger: () => {} });

    await assert.rejects(api.list(), (error) => error.code === 'read-only' && Boolean(error.detail?.problem));
    await assert.rejects(
      api.install({ source: 'morehao/agent-skills', skills: ['alpha'] }),
      (error) => error.code === 'read-only',
    );
  } finally {
    fs.rmSync(base.root, { recursive: true, force: true });
  }
});

test('invalid-input：install 缺 source / 空 skills 直接报错', async () => {
  const ctx = headlessConsole();
  try {
    await assert.rejects(ctx.api.install({ source: '', skills: ['a'] }), (error) => error.code === 'invalid-input');
    await assert.rejects(ctx.api.install({ source: 'morehao/agent-skills', skills: [] }), (error) => error.code === 'invalid-input');
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('import 无副作用：未调用工厂时临时 HOME 下不出现 skills-console 目录', () => {
  const base = makeHome('dshsc-papi-import-');
  try {
    const url = pathToFileURL(path.join(ROOT, 'dist', 'api.js')).href;
    const dir = path.join(base.dshHome, 'skills-console');
    const code = `
      import fs from 'node:fs';
      await import(${JSON.stringify(url)});
      process.stdout.write(fs.existsSync(${JSON.stringify(dir)}) ? 'EXISTS' : 'ABSENT');
    `;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: ROOT,
      env: { ...process.env, HOME: base.home, DSH_HOME: base.dshHome },
      encoding: 'utf8',
    });
    assert.equal(out, 'ABSENT', 'import 本身不应创建 skills-console 状态目录');
  } finally {
    fs.rmSync(base.root, { recursive: true, force: true });
  }
});

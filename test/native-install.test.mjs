import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRegistry } from '../dist/core/agents.js';
import { gitTreeSha } from '../dist/core/git-tree.js';
import { createInstaller } from '../dist/core/installer.js';
import { createPaths } from '../dist/core/paths.js';
import { createService } from '../dist/core/service.js';
import { StateStore } from '../dist/core/state.js';
import { contentHash } from '../dist/core/hash.js';
import { writeTarFixture } from './helpers/tar-fixture.mjs';

const COMMIT = 'c'.repeat(40);

function tarballFor(root, files) {
  const entries = [{ name: 'repo-main', type: 'dir' }];
  const dirs = new Set();
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    for (let index = 1; index < parts.length; index += 1) dirs.add(parts.slice(0, index).join('/'));
  }
  for (const dir of [...dirs].sort()) entries.push({ name: `repo-main/${dir}`, type: 'dir' });
  for (const [filePath, content] of Object.entries(files)) {
    entries.push({ name: `repo-main/${filePath}`, content });
  }
  return writeTarFixture(root, entries, { name: 'repo.tar.gz' });
}

function githubStub({ tarball, tree }) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://codeload.github.com/')) {
      const body = fs.readFileSync(tarball);
      return new Response(body, {
        status: 200,
        headers: { 'content-length': String(body.length), 'content-type': 'application/gzip' },
      });
    }
    const { pathname } = new URL(url);
    if (/^\/repos\/[^/]+\/[^/]+$/.test(pathname)) {
      return Response.json({ default_branch: 'main' });
    }
    if (pathname.includes('/git/trees/')) {
      return Response.json({ sha: '1'.repeat(40), tree, truncated: false });
    }
    if (pathname.includes('/commits/')) return Response.json({ sha: COMMIT });
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { calls, fetchImpl };
}

test('Service + 真实 installer：REST 解析 → codeload 下载 → canonical/lock/state/链接 → remove', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-native-service-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });

  const files = {
    'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: native alpha\n---\nbody\n',
    'skills/alpha/scripts/run.sh': '#!/bin/sh\necho alpha\n',
    'skills/beta/SKILL.md': '---\nname: beta\ndescription: beta\n---\n',
  };
  const sourceDir = path.join(root, 'source');
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(sourceDir, name)), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, name), content);
  }
  const alphaTree = gitTreeSha(path.join(sourceDir, 'skills/alpha'));
  const betaTree = gitTreeSha(path.join(sourceDir, 'skills/beta'));
  const tree = [
    { path: 'skills', type: 'tree', sha: '1'.repeat(40) },
    { path: 'skills/alpha', type: 'tree', sha: alphaTree },
    { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '2'.repeat(40) },
    { path: 'skills/alpha/scripts', type: 'tree', sha: '3'.repeat(40) },
    { path: 'skills/alpha/scripts/run.sh', type: 'blob', sha: '4'.repeat(40) },
    { path: 'skills/beta', type: 'tree', sha: betaTree },
    { path: 'skills/beta/SKILL.md', type: 'blob', sha: '5'.repeat(40) },
  ];
  const tarball = tarballFor(root, files);
  const gh = githubStub({ tarball, tree });

  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const store = new StateStore(paths);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const installer = createInstaller({ paths, fetchImpl: gh.fetchImpl, env: {} });
  const service = createService({
    paths,
    store,
    registry,
    installer,
    logger: () => {},
    env: {},
    fetchImpl: gh.fetchImpl,
    visibleProvider: async () => ({ skills: [], complete: true }),
  });

  const result = await service.install({
    source: 'morehao/integration-kit',
    skills: ['alpha'],
    targets: ['agent:claude-code'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, `morehao/integration-kit#${COMMIT}`);
  assert.deepEqual(result.warnings, [], '快照 treeSha 与本地计算应一致');
  assert.equal(result.installed[0].lockHash, alphaTree);
  assert.equal(result.installed[0].lockHashShape, 'tree');
  assert.equal(result.installed[0].installedHash, contentHash(path.join(paths.canonical, 'alpha')));

  assert.ok(fs.existsSync(path.join(paths.canonical, 'alpha', 'scripts', 'run.sh')));
  assert.equal(fs.existsSync(path.join(paths.canonical, 'beta')), false, '只装选中的技能');
  // 可见性来自 canonical 本身（rank 500），`~/.dsh/skills` 不再建链
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false);
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink());

  const lock = JSON.parse(fs.readFileSync(paths.lockFile, 'utf8'));
  assert.equal(lock.version, 3);
  assert.equal(lock.skills.alpha.skillFolderHash, alphaTree);
  assert.equal(lock.skills.alpha.ref, COMMIT);
  const row = store.findInstall('alpha');
  assert.equal(row.commit, COMMIT);
  assert.equal(row.treeSha, alphaTree);
  assert.equal(row.exports?.length ?? 0, 0, 'exports 在 state.exports 里，不在 install 行内');
  assert.ok(store.state.exports.some((link) => link.skill === 'alpha' && link.target === 'agent:claude-code'));

  const state = await service.getState({});
  assert.equal(state.cli.usable, true);
  assert.equal(state.cli.source, 'native');
  assert.equal(state.installs.find((item) => item.name === 'alpha').managed, true);

  const removed = await service.remove({ name: 'alpha' });
  assert.equal(removed.ok, true);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  assert.ok(fs.existsSync(path.join(paths.trashDir, removed.trash, 'content', 'SKILL.md')));
  assert.equal(JSON.parse(fs.readFileSync(paths.lockFile, 'utf8')).skills.alpha, undefined);
  assert.equal(store.findInstall('alpha'), undefined);
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false);

  assert.ok(gh.calls.some((url) => url.endsWith(`/tar.gz/${COMMIT}`)));
  fs.rmSync(root, { recursive: true, force: true });
});

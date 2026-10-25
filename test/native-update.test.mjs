import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRegistry } from '../lib/core/agents.js';
import { gitTreeSha } from '../lib/core/git-tree.js';
import { createInstaller } from '../lib/core/installer.js';
import { createPaths } from '../lib/core/paths.js';
import { createService } from '../lib/core/service.js';
import { StateStore } from '../lib/core/state.js';
import { writeTarFixture } from './helpers/tar-fixture.mjs';

const OLD_COMMIT = 'a'.repeat(40);
const NEW_COMMIT = 'b'.repeat(40);
const OLD_ROOT = '1'.repeat(40);
const NEW_ROOT = '2'.repeat(40);

function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
}

function tarballFor(root, commit, files) {
  const entries = [{ name: `repo-${commit}`, type: 'dir' }];
  const dirs = new Set();
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    for (let index = 1; index < parts.length; index += 1) dirs.add(parts.slice(0, index).join('/'));
  }
  for (const dir of [...dirs].sort()) entries.push({ name: `repo-${commit}/${dir}`, type: 'dir' });
  for (const [filePath, content] of Object.entries(files)) {
    entries.push({ name: `repo-${commit}/${filePath}`, content });
  }
  return writeTarFixture(root, entries, { name: `repo-${commit}.tar.gz` });
}

function treeFor(alphaTree) {
  return [
    { path: 'skills', type: 'tree', sha: '3'.repeat(40) },
    { path: 'skills/alpha', type: 'tree', sha: alphaTree },
    { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '4'.repeat(40) },
    { path: 'skills/alpha/scripts', type: 'tree', sha: '5'.repeat(40) },
    { path: 'skills/alpha/scripts/run.sh', type: 'blob', sha: '6'.repeat(40) },
  ];
}

function updateStub({ tarballs, trees, commits }) {
  const control = { fail: null, atomCommit: OLD_COMMIT, tree: trees.old, commit: commits.old, root: OLD_ROOT };
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith('https://github.com/') && target.endsWith('.atom')) {
      return new Response(
        `<?xml version="1.0"?><feed><entry><id>tag:github.com,2008:Grit::Commit/${control.atomCommit}</id></entry></feed>`,
        { status: 200 },
      );
    }
    if (target.startsWith('https://codeload.github.com/')) {
      const commit = target.split('/').pop();
      const file = tarballs[commit];
      if (!file) return new Response('not found', { status: 404 });
      const body = fs.readFileSync(file);
      return new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
    }
    const { pathname } = new URL(target);
    if (control.fail === 'rate-limit') {
      return new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1780000000' },
      });
    }
    if (/^\/repos\/[^/]+\/[^/]+$/.test(pathname)) return Response.json({ default_branch: 'main' });
    if (pathname.includes('/git/trees/')) {
      return Response.json({ sha: control.root, tree: control.tree, truncated: false });
    }
    if (pathname.includes('/commits/')) return Response.json({ sha: control.commit });
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { control, calls, fetchImpl };
}

test('Service + 真实 installer：限流下更新 → lock/state/备份 → 回滚', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-native-update-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });

  const oldFiles = {
    'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: alpha old\n---\nbody old\n',
    'skills/alpha/scripts/run.sh': '#!/bin/sh\necho old\n',
  };
  const newFiles = {
    'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: alpha new\n---\nbody new\n',
    'skills/alpha/scripts/run.sh': '#!/bin/sh\necho new\n',
  };
  const oldSource = path.join(root, 'old');
  const newSource = path.join(root, 'new');
  writeFiles(oldSource, oldFiles);
  writeFiles(newSource, newFiles);
  const oldTree = gitTreeSha(path.join(oldSource, 'skills/alpha'));
  const newTree = gitTreeSha(path.join(newSource, 'skills/alpha'));
  const oldTar = tarballFor(root, OLD_COMMIT, oldFiles);
  const newTar = tarballFor(root, NEW_COMMIT, newFiles);
  const gh = updateStub({
    tarballs: { [OLD_COMMIT]: oldTar, [NEW_COMMIT]: newTar },
    trees: { old: treeFor(oldTree), new: treeFor(newTree) },
    commits: { old: OLD_COMMIT, new: NEW_COMMIT },
  });

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

  const added = await service.addSubscription({ source: 'morehao/update-kit' });
  const installed = await service.install({
    subscriptionId: added.subscription.id,
    skills: ['alpha'],
    targets: ['agent:claude-code'],
  });
  assert.equal(installed.ok, true);
  assert.equal(store.findInstall('alpha').commit, OLD_COMMIT);
  assert.equal(store.findInstall('alpha').treeSha, oldTree);
  assert.match(fs.readFileSync(path.join(paths.canonical, 'alpha', 'SKILL.md'), 'utf8'), /body old/);

  // 限流 + Atom 指向新 commit，codeload 提供新 tarball
  gh.control.fail = 'rate-limit';
  gh.control.atomCommit = NEW_COMMIT;
  gh.control.tree = treeFor(newTree);
  gh.control.commit = NEW_COMMIT;
  gh.control.root = NEW_ROOT;

  const refreshed = await service.refreshSubscription({ id: added.subscription.id });
  assert.equal(refreshed.via, 'codeload');
  assert.equal(store.state.subscriptions[0].snapshot.commit, NEW_COMMIT);
  assert.equal(store.state.subscriptions[0].snapshot.entries[0].treeSha, newTree);

  const checked = await service.checkUpdates({});
  assert.equal(checked.checks[0].status, 'update-available');
  assert.equal(checked.checks[0].via, 'codeload');
  assert.equal(checked.checks[0].targetTreeSha, newTree);

  const plan = await service.planUpdate({ name: 'alpha' });
  assert.equal(plan.ok, true);
  assert.equal(plan.toCommit, NEW_COMMIT);
  assert.equal(plan.targetTreeSha, newTree);
  assert.equal(plan.localModified, false);

  const applied = await service.applyUpdate({ name: 'alpha', token: plan.token });
  assert.equal(applied.ok, true);
  assert.equal(applied.fromCommit, OLD_COMMIT);
  assert.equal(applied.toCommit, NEW_COMMIT);
  assert.ok(applied.backup, '更新必须留下旧版备份');

  const lockAfter = JSON.parse(fs.readFileSync(paths.lockFile, 'utf8'));
  assert.equal(lockAfter.skills.alpha.skillFolderHash, newTree);
  assert.equal(lockAfter.skills.alpha.ref, NEW_COMMIT);
  assert.match(fs.readFileSync(path.join(paths.canonical, 'alpha', 'SKILL.md'), 'utf8'), /body new/);
  assert.ok(
    fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(),
    '更新重建的是 canonical 目录，导出链仍在',
  );

  const stateAfter = store.findInstall('alpha');
  assert.equal(stateAfter.commit, NEW_COMMIT);
  assert.equal(stateAfter.treeSha, newTree);
  assert.equal(stateAfter.backup.key, applied.backup);
  assert.equal(stateAfter.backup.treeSha, oldTree);
  assert.equal(stateAfter.backup.commit, OLD_COMMIT);
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false, 'direct 模式不建 DSH 链');

  const rolled = await service.rollback({ name: 'alpha' });
  assert.equal(rolled.ok, true);
  assert.match(fs.readFileSync(path.join(paths.canonical, 'alpha', 'SKILL.md'), 'utf8'), /body old/);
  const lockRolled = JSON.parse(fs.readFileSync(paths.lockFile, 'utf8'));
  assert.equal(lockRolled.skills.alpha.skillFolderHash, oldTree, '回滚必须把 lock 基线一起退回去');
  assert.equal(lockRolled.skills.alpha.ref, OLD_COMMIT);
  const stateRolled = store.findInstall('alpha');
  assert.equal(stateRolled.commit, null);
  assert.equal(stateRolled.treeSha, oldTree);
  assert.equal(stateRolled.installedHash, (await import('../lib/core/hash.js')).contentHash(path.join(paths.canonical, 'alpha')));

  assert.ok(gh.calls.some((url) => url.includes('.atom')));
  assert.ok(gh.calls.some((url) => url.includes(`/tar.gz/${NEW_COMMIT}`)));
  fs.rmSync(root, { recursive: true, force: true });
});

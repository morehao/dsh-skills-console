import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createInstaller } from '../lib/core/installer.js';
import { createPaths } from '../lib/core/paths.js';
import { readLockFile, updateLock } from '../lib/core/lock.js';
import { gitTreeSha } from '../lib/core/git-tree.js';
import { writeTarFixture } from './helpers/tar-fixture.mjs';

const COMMIT = 'a'.repeat(40);

function tarballFor(root, files, { gzip = true, name = 'repo.tar.gz' } = {}) {
  const entries = [{ name: 'repo-main', type: 'dir' }];
  const dirs = new Set();
  for (const [filePath, content] of Object.entries(files)) {
    const parts = filePath.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      dirs.add(parts.slice(0, index).join('/'));
    }
  }
  for (const dir of [...dirs].sort()) entries.push({ name: `repo-main/${dir}`, type: 'dir' });
  for (const [filePath, content] of Object.entries(files)) {
    entries.push({ name: `repo-main/${filePath}`, content });
  }
  return writeTarFixture(root, entries, { gzip, name });
}

function codeloadStub(tarball) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (!String(url).startsWith('https://codeload.github.com/')) {
      return new Response('not found', { status: 404 });
    }
    const body = fs.readFileSync(tarball);
    return new Response(body, {
      status: 200,
      headers: { 'content-length': String(body.length), 'content-type': 'application/gzip' },
    });
  };
  return { calls, fetchImpl };
}

function setup({ files, gzip = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-installer-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const tarball = tarballFor(root, files, { gzip });
  const stub = codeloadStub(tarball);
  const installer = createInstaller({ paths, fetchImpl: stub.fetchImpl, env: {} });
  return { root, home, paths, tarball, stub, installer };
}

const BASIC = {
  'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: A\n---\nbody\n',
  'skills/alpha/scripts/run.sh': '#!/bin/sh\necho hi\n',
  'skills/beta/SKILL.md': '---\nname: beta\n---\nbeta\n',
};

test('install：下载→解压→发现→canonical→一次写 lock', async () => {
  const { root, paths, stub, installer } = setup({ files: BASIC });
  const result = await installer.install({ source: 'morehao/ai-kit', commit: COMMIT });

  assert.deepEqual(result.installed.map((item) => item.name), ['alpha', 'beta']);
  assert.deepEqual(result.warnings, []);
  for (const item of result.installed) {
    assert.match(item.treeSha, /^[0-9a-f]{40}$/);
    assert.match(item.contentHash, /^[0-9a-f]{64}$/);
    assert.ok(fs.existsSync(path.join(paths.canonical, item.name, 'SKILL.md')));
    assert.equal(item.treeSha, gitTreeSha(path.join(paths.canonical, item.name)), 'lock 的 tree SHA 必须来自落盘内容');
  }
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha', 'scripts', 'run.sh')), true);

  const lock = readLockFile(paths.lockFile);
  assert.equal(lock.data.version, 3);
  assert.deepEqual(Object.keys(lock.data.skills).sort(), ['alpha', 'beta']);
  for (const name of ['alpha', 'beta']) {
    const entry = lock.data.skills[name];
    assert.equal(entry.source, 'morehao/ai-kit');
    assert.equal(entry.sourceUrl, 'https://github.com/morehao/ai-kit.git');
    assert.equal(entry.ref, COMMIT);
    assert.equal(entry.skillPath, `skills/${name}/SKILL.md`);
    assert.match(entry.skillFolderHash, /^[0-9a-f]{40}$/);
  }
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0], `https://codeload.github.com/morehao/ai-kit/tar.gz/${COMMIT}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：显式选技能只装选中的；重装保留 installedAt 并生成备份', async () => {
  const { root, paths, installer } = setup({ files: BASIC });
  await installer.install({ source: 'morehao/ai-kit', commit: COMMIT, names: ['alpha'] });
  assert.ok(fs.existsSync(path.join(paths.canonical, 'alpha')));
  assert.equal(fs.existsSync(path.join(paths.canonical, 'beta')), false);

  const first = readLockFile(paths.lockFile).data.skills.alpha;
  const again = await installer.install({ source: 'morehao/ai-kit', commit: COMMIT, names: ['alpha'] });
  const second = readLockFile(paths.lockFile).data.skills.alpha;
  assert.equal(second.installedAt, first.installedAt, '重装不能刷新 installedAt');
  assert.ok(Date.parse(second.updatedAt) >= Date.parse(first.updatedAt));
  assert.ok(again.installed[0].backup, '覆盖既有 canonical 必须留备份');
  const backupDir = path.join(paths.backupsDir, again.installed[0].backup, 'content');
  assert.ok(fs.existsSync(path.join(backupDir, 'SKILL.md')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：根级 SKILL.md 用 frontmatter 名字；lock skillPath 为根路径', async () => {
  const { root, paths, installer } = setup({
    files: { 'SKILL.md': '---\nname: root-skill\ndescription: root\n---\n' },
  });
  const result = await installer.install({ source: 'morehao/root-kit', commit: COMMIT });
  assert.deepEqual(result.installed.map((item) => item.name), ['root-skill']);
  assert.ok(fs.existsSync(path.join(paths.canonical, 'root-skill', 'SKILL.md')));
  assert.equal(readLockFile(paths.lockFile).data.skills['root-skill'].skillPath, 'SKILL.md');
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：subpath 过滤；请求不存在的技能不动 canonical/lock', async () => {
  const { root, paths, installer } = setup({
    files: {
      'packages/one/SKILL.md': '---\nname: one\n---\n',
      'packages/two/SKILL.md': '---\nname: two\n---\n',
      'other/SKILL.md': '---\nname: other\n---\n',
    },
  });
  const result = await installer.install({ source: 'morehao/mono', commit: COMMIT, subpath: 'packages' });
  assert.deepEqual(result.installed.map((item) => item.name), ['one', 'two']);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'other')), false);

  const lockBefore = fs.readFileSync(paths.lockFile, 'utf8');
  await assert.rejects(
    () => installer.install({ source: 'morehao/mono', commit: COMMIT, subpath: 'packages', names: ['missing'] }),
    (error) => error.code === 'skill-not-found',
  );
  assert.equal(fs.readFileSync(paths.lockFile, 'utf8'), lockBefore, '失败不能改 lock');
  assert.equal(fs.existsSync(path.join(paths.canonical, 'missing')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：lock 里有未知字段时合并保留；dismissed 不丢', async () => {
  const { root, paths, installer } = setup({ files: BASIC });
  updateLock({
    lockPath: paths.lockFile,
    mutate: (draft) => {
      draft.dismissed = { alpha: { reason: 'later' } };
      draft.skills.alpha = {
        source: 'old/kit',
        sourceType: 'github',
        sourceUrl: 'https://github.com/old/kit.git',
        skillPath: 'skills/alpha/SKILL.md',
        skillFolderHash: 'b'.repeat(40),
        installedAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        future: { keep: true },
      };
    },
  });

  await installer.install({ source: 'morehao/ai-kit', commit: COMMIT, names: ['alpha'] });
  const lock = readLockFile(paths.lockFile).data;
  assert.deepEqual(lock.dismissed, { alpha: { reason: 'later' } });
  assert.equal(lock.skills.alpha.future.keep, true, '旧条目未知字段必须保留');
  assert.equal(lock.skills.alpha.source, 'morehao/ai-kit');
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：危险 tar（symlink）失败且不落 canonical/lock', async () => {
  const { root, paths, installer } = setup({
    files: { 'skills/alpha/SKILL.md': '---\nname: alpha\n---\n' },
  });
  // 换一份带 symlink 的 tar 覆盖原 fixture 内容：同一个 codeload stub 读的是这个文件
  const malicious = writeTarFixture(
    root,
    [
      { name: 'repo-main', type: 'dir' },
      { name: 'repo-main/skills/alpha', type: 'dir' },
      { name: 'repo-main/skills/alpha/SKILL.md', content: '---\nname: alpha\n---\n' },
      { name: 'repo-main/skills/alpha/evil', type: 'symlink', linkname: '/etc/passwd' },
    ],
    { name: 'repo.tar.gz' },
  );
  assert.equal(malicious, path.join(root, 'repo.tar.gz'));

  await assert.rejects(
    () => installer.install({ source: 'morehao/ai-kit', commit: COMMIT }),
    (error) => ['symlink-entry', 'archive-invalid', 'unsafe-entry'].includes(error.code) || /symlink/i.test(error.message),
  );
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  assert.equal(fs.existsSync(paths.lockFile), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('remove：删 canonical 与 lock 条目，其他条目保留', async () => {
  const { root, paths, installer } = setup({ files: BASIC });
  await installer.install({ source: 'morehao/ai-kit', commit: COMMIT });
  const result = installer.remove({ name: 'alpha' });
  assert.equal(result.removed, true);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'beta')), true);
  assert.deepEqual(Object.keys(readLockFile(paths.lockFile).data.skills), ['beta']);

  assert.throws(
    () => installer.remove({ name: '../escape' }),
    (error) => error.code === 'invalid-name',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('readiness：lock 缺失/正常可用，损坏或版本过高不可用', async () => {
  const { root, paths, installer } = setup({ files: BASIC });
  assert.equal(installer.readiness().usable, true);
  assert.equal(installer.readiness().source, 'native');

  fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
  fs.writeFileSync(paths.lockFile, '{not json');
  const corrupt = installer.readiness();
  assert.equal(corrupt.usable, false);
  assert.equal(corrupt.problem, 'lock-corrupt');

  fs.writeFileSync(paths.lockFile, JSON.stringify({ version: 4, skills: {} }));
  const future = installer.readiness();
  assert.equal(future.usable, false);
  assert.equal(future.problem, 'lock-unsupported');

  // 不可写时 install 在下载前就失败，不会碰 canonical
  await assert.rejects(
    () => installer.install({ source: 'morehao/ai-kit', commit: COMMIT }),
    (error) => error.code === 'lock-unsupported',
  );
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：lock 写失败 → 回滚已替换的 canonical，旧 lock 保持原样', async (t) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('root 会忽略目录权限，无法模拟写失败');
    return;
  }
  const { root, paths, tarball, stub } = setup({ files: BASIC });
  const oldDir = path.join(paths.canonical, 'alpha');
  fs.mkdirSync(oldDir, { recursive: true });
  fs.writeFileSync(path.join(oldDir, 'SKILL.md'), '---\nname: alpha\n---\nOLD\n');
  const oldHash = gitTreeSha(oldDir);
  updateLock({
    lockPath: paths.lockFile,
    mutate: (draft) => {
      draft.skills.alpha = {
        source: 'morehao/ai-kit',
        sourceType: 'github',
        sourceUrl: 'https://github.com/morehao/ai-kit.git',
        skillPath: 'skills/alpha/SKILL.md',
        skillFolderHash: oldHash,
        installedAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      };
    },
  });
  const lockBefore = fs.readFileSync(paths.lockFile, 'utf8');

  let releaseFetch;
  let markStarted;
  const fetchStarted = new Promise((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const gatedFetch = async (url) => {
    markStarted();
    await gate;
    return stub.fetchImpl(url);
  };
  const installer = createInstaller({ paths, fetchImpl: gatedFetch, env: {} });
  const pending = installer.install({ source: 'morehao/ai-kit', commit: COMMIT, names: ['alpha'] });
  const rejected = assert.rejects(pending, (error) => error.code === 'lock-write-failed');

  await fetchStarted;
  const lockDir = path.dirname(paths.lockFile);
  fs.chmodSync(lockDir, 0o555);
  releaseFetch();
  try {
    await rejected;
  } finally {
    fs.chmodSync(lockDir, 0o755);
  }

  assert.match(fs.readFileSync(path.join(oldDir, 'SKILL.md'), 'utf8'), /OLD/, '旧 canonical 必须恢复');
  assert.equal(fs.readFileSync(paths.lockFile, 'utf8'), lockBefore, 'lock 不能半写');
  const leftovers = fs.readdirSync(paths.canonical).filter((name) => name.startsWith('.dshsc-staging'));
  assert.deepEqual(leftovers, [], 'staging 临时目录要清干净');
  fs.rmSync(root, { recursive: true, force: true });
});

test('install：strict 模式目标 tree 不一致时拒绝，不落 canonical/lock', async () => {
  const { root, paths, installer } = setup({ files: BASIC });
  await assert.rejects(
    () =>
      installer.install({
        source: 'morehao/ai-kit',
        commit: COMMIT,
        names: ['alpha'],
        expectedEntries: [{ name: 'alpha', treeSha: 'f'.repeat(40) }],
        strict: true,
      }),
    (error) => error.code === 'tree-mismatch' && error.mismatched?.[0]?.name === 'alpha',
  );
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  assert.equal(fs.existsSync(paths.lockFile), false);
  fs.rmSync(root, { recursive: true, force: true });
});

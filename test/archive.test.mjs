import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ArchiveError, extractTarball } from '../lib/core/archive.js';
import { writeTarFixture } from './helpers/tar-fixture.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-archive-'));
}

function safeEntries() {
  return [
    { name: 'repo-main', type: 'dir' },
    { name: 'repo-main/SKILL.md', content: '---\nname: demo\n---\n' },
    { name: 'repo-main/scripts', type: 'dir' },
    { name: 'repo-main/scripts/run.sh', content: '#!/bin/sh\necho hi\n', mode: 0o755 },
    { name: 'repo-main/sub/a.txt', content: 'a' },
  ];
}

async function expectArchiveError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ArchiveError, `预期 ArchiveError，实际 ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return true;
  });
}

test('extractTarball 剥掉顶层目录、保留可执行位、统计文件数', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, safeEntries());
    const dest = path.join(root, 'out');
    const result = await extractTarball({ tarball, dest });
    assert.equal(result.root, 'repo-main');
    assert.equal(result.files, 3);
    const expectedBytes = safeEntries()
      .filter((entry) => entry.type !== 'dir')
      .reduce((sum, entry) => sum + Buffer.byteLength(entry.content || ''), 0);
    assert.equal(result.bytes, expectedBytes);
    assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), '---\nname: demo\n---\n');
    assert.equal(fs.readFileSync(path.join(dest, 'sub', 'a.txt'), 'utf8'), 'a');
    if (process.platform !== 'win32') {
      assert.ok(fs.statSync(path.join(dest, 'scripts', 'run.sh')).mode & 0o100, '可执行位应保留');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractTarball 支持未压缩 tar', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, safeEntries(), { gzip: false, name: 'fixture.tar' });
    const dest = path.join(root, 'out');
    const result = await extractTarball({ tarball, dest });
    assert.equal(result.files, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const UNSAFE_CASES = [
  ['路径穿越 ../', { name: 'repo-main/../evil.txt', content: 'x' }],
  ['绝对路径', { name: '/evil.txt', content: 'x' }],
  ['Windows 盘符', { name: 'C:/evil.txt', content: 'x' }],
  ['反斜杠', { name: 'repo-main\\evil.txt', content: 'x' }],
  ['点段', { name: 'repo-main/./evil.txt', content: 'x' }],
  ['空段', { name: 'repo-main//evil.txt', content: 'x' }],
  ['symlink', { name: 'repo-main/link', type: 'symlink', linkname: '/etc/passwd' }],
  ['hardlink', { name: 'repo-main/hard', type: 'hardlink', linkname: 'repo-main/SKILL.md' }],
  ['FIFO', { name: 'repo-main/fifo', type: 'fifo' }],
];

for (const [label, bad] of UNSAFE_CASES) {
  test(`extractTarball 拒绝危险条目：${label}`, async () => {
    const root = tempDir();
    try {
      const tarball = writeTarFixture(root, [{ name: 'repo-main', type: 'dir' }, bad]);
      const dest = path.join(root, 'out');
      await expectArchiveError(extractTarball({ tarball, dest }), 'unsafe-entry');
      assert.ok(!fs.existsSync(dest) || fs.readdirSync(dest).length === 0, '被拒绝时不应落盘');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('extractTarball 拒绝多个顶层目录', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, [
      { name: 'repo-main', type: 'dir' },
      { name: 'repo-main/a.txt', content: 'a' },
      { name: 'other/b.txt', content: 'b' },
    ]);
    await expectArchiveError(extractTarball({ tarball, dest: path.join(root, 'out') }), 'unsafe-entry');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractTarball 拒绝顶层非目录条目', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, [{ name: 'repo-main', content: 'not a dir' }]);
    await expectArchiveError(extractTarball({ tarball, dest: path.join(root, 'out') }), 'unsafe-entry');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractTarball 文件数超限时拒绝', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, safeEntries());
    await expectArchiveError(
      extractTarball({ tarball, dest: path.join(root, 'out'), maxFiles: 2 }),
      'too-many-files',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractTarball 解压总量超限时拒绝', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, safeEntries());
    await expectArchiveError(
      extractTarball({ tarball, dest: path.join(root, 'out'), maxBytes: 8 }),
      'archive-too-large',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractTarball 拒绝非空 staging 与坏归档', async () => {
  const root = tempDir();
  try {
    const tarball = writeTarFixture(root, safeEntries());
    const dest = path.join(root, 'out');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'leftover'), 'x');
    await expectArchiveError(extractTarball({ tarball, dest }), 'dest-not-empty');

    const junk = path.join(root, 'junk.tar.gz');
    fs.writeFileSync(junk, Buffer.alloc(1024, 0xff));
    await expectArchiveError(extractTarball({ tarball: junk, dest: path.join(root, 'out2') }), 'invalid-archive');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractTarball 拒绝空归档', async () => {
  const root = tempDir();
  try {
    const onlyDirs = writeTarFixture(root, [{ name: 'repo-main', type: 'dir' }], { name: 'dirs.tar.gz' });
    await expectArchiveError(extractTarball({ tarball: onlyDirs, dest: path.join(root, 'out') }), 'empty-archive');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EMPTY_TREE_SHA, GitTreeError, gitTreeSha } from '../lib/core/git-tree.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-gittree-'));
}

function writeFiles(root, files) {
  for (const [rel, spec] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (typeof spec === 'string') {
      fs.writeFileSync(full, spec);
      continue;
    }
    fs.writeFileSync(full, spec.content);
    if (spec.exec) fs.chmodSync(full, 0o755);
  }
}

/**
 * 期望值由真实 git 算出来（一次性，写死在测试里）：
 *   git init && git add -A && git write-tree
 * fixture 本身在测试里重新造，不依赖仓库外的文件。
 */
const MIXED_FIXTURE = {
  'SKILL.md': '---\nname: demo\n---\nhello\n',
  'references/guide.md': 'guide\n',
  'scripts/run.sh': { content: '#!/bin/sh\necho hi\n', exec: true },
  'scripts/helper.txt': 'helper',
  'a.b': 'dot',
  'a/x.txt': 'x',
};
const MIXED_TREE_SHA = 'c51986be74c5d32b8cf7ce6a562e191599838f50';
const ROOT_ONLY_TREE_SHA = '3c25500bce1dc83063899992917a1367ba3f919c';

test('gitTreeSha 与 git write-tree 一致（嵌套目录 / 可执行位 / 名字排序）', () => {
  const dir = tempDir();
  try {
    writeFiles(dir, MIXED_FIXTURE);
    // 空目录在 git 里不存在，不应影响 tree SHA
    fs.mkdirSync(path.join(dir, 'empty'));
    fs.mkdirSync(path.join(dir, 'empty', 'deeper'));
    assert.equal(gitTreeSha(dir), MIXED_TREE_SHA);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gitTreeSha 支持根级 SKILL.md，且空目录返回空 tree', () => {
  const root = tempDir();
  const empty = tempDir();
  try {
    writeFiles(root, { 'SKILL.md': '---\nname: demo\n---\nhello\n' });
    assert.equal(gitTreeSha(root), ROOT_ONLY_TREE_SHA);
    assert.equal(gitTreeSha(empty), EMPTY_TREE_SHA);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('gitTreeSha 对内容与可执行位敏感', () => {
  const base = tempDir();
  const changed = tempDir();
  const exec = tempDir();
  try {
    writeFiles(base, { 'SKILL.md': 'v1\n' });
    writeFiles(changed, { 'SKILL.md': 'v2\n' });
    writeFiles(exec, { 'SKILL.md': { content: 'v1\n', exec: true } });
    assert.notEqual(gitTreeSha(base), gitTreeSha(changed));
    assert.notEqual(gitTreeSha(base), gitTreeSha(exec));
  } finally {
    for (const dir of [base, changed, exec]) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gitTreeSha 拒绝符号链接，不做内容 hash 冒充', () => {
  const dir = tempDir();
  try {
    writeFiles(dir, { 'SKILL.md': 'x\n' });
    fs.symlinkSync('SKILL.md', path.join(dir, 'link.md'));
    assert.throws(
      () => gitTreeSha(dir),
      (error) => error instanceof GitTreeError && error.code === 'unsupported-entry',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gitTreeSha 拒绝 FIFO（非普通文件）', { skip: process.platform === 'win32' }, (t) => {
  const dir = tempDir();
  try {
    writeFiles(dir, { 'SKILL.md': 'x\n' });
    try {
      execFileSync('mkfifo', [path.join(dir, 'pipe')], { stdio: 'ignore' });
    } catch {
      t.skip('当前环境没有 mkfifo');
      return;
    }
    assert.throws(
      () => gitTreeSha(dir),
      (error) => error instanceof GitTreeError && error.code === 'unsupported-entry',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gitTreeSha 对不存在/非目录路径报错', () => {
  assert.throws(
    () => gitTreeSha(path.join(os.tmpdir(), 'dshsc-not-exist-xyz')),
    (error) => error instanceof GitTreeError && error.code === 'read-failed',
  );
  assert.throws(
    () => gitTreeSha(''),
    (error) => error instanceof GitTreeError && error.code === 'invalid-path',
  );
});

/**
 * 与 CLI 已知 hash 对拍（设计 §关键假设 A1）。默认跳过：需要本机的 agent-skills 仓库，
 * 保持 `npm test` 离线、不依赖外部 checkout。
 *   DSH_SKILLS_PARITY_REPO=/path/to/agent-skills npm test
 */
test(
  'git-kit tree SHA 与 CLI lock 的 0e96f95... 对拍',
  { skip: !process.env.DSH_SKILLS_PARITY_REPO && '设置 DSH_SKILLS_PARITY_REPO 指向 agent-skills 仓库' },
  () => {
    const dir = path.join(process.env.DSH_SKILLS_PARITY_REPO, 'skills', 'git-kit');
    assert.equal(gitTreeSha(dir), '0e96f95ca66e0d38a69f76d288d78198332aed8f');
  },
);

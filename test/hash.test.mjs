import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { contentHash } from '../lib/core/hash.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-hash-'));
}

test('contentHash 稳定、与文件顺序无关', () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'hello\n');
  fs.writeFileSync(path.join(dir, 'sub', 'a.txt'), 'a');
  const first = contentHash(dir);
  const second = contentHash(dir);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('contentHash 跳过 .git / node_modules，且内容变化会改变结果', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'v1');
  const base = contentHash(dir);
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: x');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'x.js'), 'nope');
  assert.equal(contentHash(dir), base, '被跳过的目录不应影响哈希');
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'v2');
  assert.notEqual(contentHash(dir), base);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('contentHash 对路径大小写/排序一致', () => {
  const a = tempDir();
  const b = tempDir();
  for (const dir of [a, b]) {
    fs.writeFileSync(path.join(dir, 'b.txt'), '2');
    fs.writeFileSync(path.join(dir, 'a.txt'), '1');
  }
  assert.equal(contentHash(a), contentHash(b));
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureLink, inspectTarget, removeLink } from '../dist/core/links.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-links-'));
  const canonical = path.join(root, '.agents', 'skills', 'demo');
  fs.mkdirSync(canonical, { recursive: true });
  fs.writeFileSync(path.join(canonical, 'SKILL.md'), '---\nname: demo\ndescription: d\n---\n');
  const dshDir = path.join(root, '.dsh', 'skills');
  fs.mkdirSync(dshDir, { recursive: true });
  return { root, canonical, dshDir, linkPath: path.join(dshDir, 'demo') };
}

test('absent → 建链 → managed-external；相对路径可解析', () => {
  const { root, canonical, linkPath } = sandbox();
  assert.equal(inspectTarget({ linkPath, canonicalPath: canonical }).state, 'absent');
  const created = ensureLink({ linkPath, canonicalPath: canonical });
  assert.equal(created.created, true);
  const live = inspectTarget({ linkPath, canonicalPath: canonical });
  assert.equal(live.state, 'managed-external');
  assert.ok(fs.readlinkSync(linkPath).startsWith('..'), '应使用相对链接');
  fs.rmSync(root, { recursive: true, force: true });
});

test('重复建链幂等：第二次不创建', () => {
  const { root, canonical, linkPath } = sandbox();
  ensureLink({ linkPath, canonicalPath: canonical });
  const again = ensureLink({ linkPath, canonicalPath: canonical });
  assert.equal(again.created, false);
  assert.equal(again.state, 'managed-external');
  fs.rmSync(root, { recursive: true, force: true });
});

test('真实目录不覆盖（real），外部链接不动（foreign-link）', () => {
  const { root, canonical, linkPath } = sandbox();
  fs.mkdirSync(linkPath);
  fs.writeFileSync(path.join(linkPath, 'SKILL.md'), 'local');
  assert.equal(inspectTarget({ linkPath, canonicalPath: canonical }).state, 'real');
  const attempt = ensureLink({ linkPath, canonicalPath: canonical });
  assert.equal(attempt.created, false);
  assert.equal(attempt.skipped, true);
  assert.ok(fs.existsSync(path.join(linkPath, 'SKILL.md')), '本地实体必须原样保留');
  fs.rmSync(linkPath, { recursive: true, force: true });

  const elsewhere = path.join(root, 'elsewhere');
  fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, linkPath, 'dir');
  assert.equal(inspectTarget({ linkPath, canonicalPath: canonical }).state, 'foreign-link');
  assert.equal(ensureLink({ linkPath, canonicalPath: canonical }).created, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('removeLink 默认只删指向 canonical 的链接', () => {
  const { root, canonical, linkPath } = sandbox();
  ensureLink({ linkPath, canonicalPath: canonical });
  assert.equal(removeLink({ linkPath, canonicalPath: canonical }).removed, true);
  assert.equal(fs.existsSync(linkPath), false);

  const elsewhere = path.join(root, 'elsewhere2');
  fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, linkPath, 'dir');
  assert.equal(removeLink({ linkPath, canonicalPath: canonical }).removed, false);
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), '外部链接不该被删');
  fs.rmSync(root, { recursive: true, force: true });
});

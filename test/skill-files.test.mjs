import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MAX_FILE_BYTES,
  MAX_TREE_ENTRIES,
  normalizeRelPath,
  readSkillFile,
  readSkillTree,
  resolveSkillRoot,
  SkillFileError,
} from '../lib/core/skill-files.js';

/** 每个用例一份临时 canonical；结束时删掉。真目录、真 HOME 一律不碰。 */
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-files-'));
  const canonical = path.join(root, 'skills');
  fs.mkdirSync(canonical, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = { canonical };
  const write = (rel, content) => {
    const target = path.join(canonical, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  return { root, canonical, paths, write };
}

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof SkillFileError, `应抛 SkillFileError，实际 ${error?.name || error}`);
    return error.code;
  }
  return null;
}

async function asyncCodeOf(fn) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof SkillFileError, `应抛 SkillFileError，实际 ${error?.name || error}`);
    return error.code;
  }
  return null;
}

test('目录包：默认读 SKILL.md，读 references 子文件，路径都在根内', async (t) => {
  const { paths, write } = setup(t);
  write('demo/SKILL.md', '---\nname: demo\ndescription: 演示\n---\n正文\n');
  write('demo/references/guide.md', '# 指南\n');

  const root = await resolveSkillRoot(paths, 'demo');
  assert.equal(root.kind, 'dir');
  assert.equal(root.body, 'SKILL.md');

  const body = await readSkillFile({ root: root.root, kind: root.kind });
  assert.equal(body.relPath, 'SKILL.md');
  assert.match(body.content, /正文/);
  assert.equal(body.truncated, false);
  assert.equal(body.size, Buffer.byteLength(body.content));
  assert.match(body.mtime, /^\d{4}-\d{2}-\d{2}T/);

  const guide = await readSkillFile({ root: root.root, kind: root.kind, relPath: 'references/guide.md' });
  assert.equal(guide.relPath, 'references/guide.md');
  assert.match(guide.content, /指南/);
});

test('平铺技能：只有 <name>.md 一个文件，读别的路径直接拒绝', async (t) => {
  const { paths, write } = setup(t);
  write('flat.md', '# 平铺\n');

  const root = await resolveSkillRoot(paths, 'flat');
  assert.equal(root.kind, 'file');
  assert.equal(root.body, 'flat.md');

  const body = await readSkillFile({ root: root.root, kind: root.kind });
  assert.equal(body.relPath, 'flat.md');
  assert.match(body.content, /平铺/);
  assert.equal(await asyncCodeOf(() => readSkillFile({ root: root.root, kind: root.kind, relPath: 'other.md' })), 'error.skills.bad-path');

  const tree = await readSkillTree({ root: root.root, kind: root.kind });
  assert.equal(tree.kind, 'file');
  assert.equal(tree.files.length, 1);
  assert.equal(tree.files[0].path, 'flat.md');
  assert.equal(tree.hasSkillMd, true);
});

test('根不存在 / 根是符号链接 → not-found / bad-path', async (t) => {
  const { paths, canonical, write } = setup(t);
  assert.equal(await asyncCodeOf(() => resolveSkillRoot(paths, 'ghost')), 'error.skills.not-found');

  const outside = path.join(canonical, '..', 'outside-skill');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'SKILL.md'), 'x');
  fs.symlinkSync(outside, path.join(canonical, 'linked'));
  assert.equal(await asyncCodeOf(() => resolveSkillRoot(paths, 'linked')), 'error.skills.bad-path');

  // 平铺形态的链接同样拒绝
  write('target.md', '# target\n');
  fs.symlinkSync(path.join(canonical, 'target.md'), path.join(canonical, 'linkedflat.md'));
  assert.equal(await asyncCodeOf(() => resolveSkillRoot(paths, 'linkedflat')), 'error.skills.bad-path');
});

test('相对路径校验：穿越 / 绝对 / 反斜杠 / NUL / 盘符 全部拒绝', async (t) => {
  const { paths, write } = setup(t);
  write('demo/SKILL.md', 'body\n');
  const root = await resolveSkillRoot(paths, 'demo');
  const bad = ['../outside.md', 'a/../../b', '/etc/passwd', 'a\\b', 'a\u0000b', 'C:/win.md', '..'];
  for (const relPath of bad) {
    const code = await asyncCodeOf(() => readSkillFile({ root: root.root, kind: root.kind, relPath }));
    assert.equal(code, 'error.skills.bad-path', `${JSON.stringify(relPath)} 必须拒绝`);
  }
});

test('normalizeRelPath：归一化与空值语义', () => {
  assert.equal(normalizeRelPath('a//b.md'), 'a/b.md');
  assert.equal(normalizeRelPath('./a.md'), 'a.md');
  assert.deepEqual(codeOf(() => normalizeRelPath('', {})), 'error.skills.bad-path');
  assert.equal(normalizeRelPath('', { allowEmpty: true }), '');
  assert.equal(normalizeRelPath(undefined, { allowEmpty: true }), '');
  assert.deepEqual(codeOf(() => normalizeRelPath('x'.repeat(400))), 'error.skills.bad-path');
  assert.deepEqual(codeOf(() => normalizeRelPath('a\\b')), 'error.skills.bad-path');
});

test('符号链接：根内的链接文件也不跟随（根外 / 根内各一条）', async (t) => {
  const { paths, write, root: tmp } = setup(t);
  write('demo/SKILL.md', 'body\n');
  write('demo/references/real.md', '# real\n');
  const secret = path.join(tmp, 'secret.md');
  fs.writeFileSync(secret, '# secret\n');
  fs.symlinkSync(secret, path.join(tmp, 'skills', 'demo', 'references', 'outside.md'));
  fs.symlinkSync(path.join(tmp, 'skills', 'demo', 'references', 'real.md'), path.join(tmp, 'skills', 'demo', 'references', 'inside.md'));

  const root = await resolveSkillRoot(paths, 'demo');
  for (const relPath of ['references/outside.md', 'references/inside.md']) {
    const code = await asyncCodeOf(() => readSkillFile({ root: root.root, kind: root.kind, relPath }));
    assert.equal(code, 'error.skills.bad-path', `${relPath} 是符号链接，必须拒绝`);
  }
});

test('二进制 / 非文本扩展名 / 缺 SKILL.md', async (t) => {
  const { paths, write } = setup(t);
  write('demo/SKILL.md', 'body\n');
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'image.md'), Buffer.from([0x23, 0x20, 0x00, 0x01]));
  write('demo/script.rb', 'puts 1\n');
  write('demo/LICENSE', 'MIT\n');
  write('demo/page.html', '<h1>hi</h1>\n');
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'latin.md'), Buffer.from([0x23, 0x20, 0xe9, 0x74, 0xe9]));

  const root = await resolveSkillRoot(paths, 'demo');
  assert.equal(
    await asyncCodeOf(() => readSkillFile({ root: root.root, kind: root.kind, relPath: 'image.md' })),
    'error.skills.binary',
    '含 NUL 视为二进制',
  );
  // 能按 UTF-8 解码就当源码显示：不再用扩展名白名单卡 .rb / .html / 无扩展名文件
  for (const relPath of ['script.rb', 'LICENSE', 'page.html']) {
    const file = await readSkillFile({ root: root.root, kind: root.kind, relPath });
    assert.ok(file.content.length > 0, `${relPath} 应作为文本读出来`);
  }
  for (const relPath of ['photo.png', 'latin.md']) {
    assert.equal(
      await asyncCodeOf(() => readSkillFile({ root: root.root, kind: root.kind, relPath })),
      'error.skills.binary',
      `${relPath} 暂不支持预览`,
    );
  }
  assert.equal(
    await asyncCodeOf(() => readSkillFile({ root: root.root, kind: root.kind, relPath: 'nope.md' })),
    'error.skills.file-not-found',
  );

  write('noskill/notes.md', '# notes\n');
  const noskill = await resolveSkillRoot(paths, 'noskill');
  assert.equal(
    await asyncCodeOf(() => readSkillFile({ root: noskill.root, kind: noskill.kind })),
    'error.skills.no-skill-md',
    '目录存在但没有 SKILL.md',
  );
  const tree = await readSkillTree({ root: noskill.root, kind: noskill.kind });
  assert.equal(tree.hasSkillMd, false);
  assert.equal(tree.body, null);
});

test('超大文件：只读前 256KB 并标记 truncated，size 仍是真实大小', async (t) => {
  const { paths, write } = setup(t);
  const big = `${'a'.repeat(MAX_FILE_BYTES)}trailing`;
  write('demo/SKILL.md', 'body\n');
  write('demo/references/big.md', big);

  const root = await resolveSkillRoot(paths, 'demo');
  const file = await readSkillFile({ root: root.root, kind: root.kind, relPath: 'references/big.md' });
  assert.equal(file.truncated, true);
  assert.equal(file.content.length, MAX_FILE_BYTES);
  assert.equal(file.size, Buffer.byteLength(big));
});

test('文件树：目录在前按名排序、跳过点文件 / node_modules / 符号链接', async (t) => {
  const { paths, write, root: tmp } = setup(t);
  write('demo/SKILL.md', '# demo\n');
  write('demo/references/b.md', 'b\n');
  write('demo/references/a.md', 'a\n');
  write('demo/scripts/run.mjs', 'export {};\n');
  write('demo/.hidden/secret.md', 'no\n');
  write('demo/.hidden.md', 'no\n');
  write('demo/node_modules/pkg/index.js', 'no\n');
  write('demo/.git/config', 'no\n');
  fs.symlinkSync(path.join(tmp, 'secret.md'), path.join(tmp, 'skills', 'demo', 'links.md'));

  const root = await resolveSkillRoot(paths, 'demo');
  const tree = await readSkillTree({ root: root.root, kind: root.kind });
  assert.equal(tree.hasSkillMd, true);
  assert.equal(tree.body, 'SKILL.md');
  assert.equal(tree.truncated, false);
  assert.deepEqual(tree.files.map((entry) => `${entry.kind}:${entry.path}`), [
    'dir:references',
    'file:references/a.md',
    'file:references/b.md',
    'dir:scripts',
    'file:scripts/run.mjs',
    'file:SKILL.md',
  ]);
  assert.equal(tree.totalBytes, [2, 2, 11, 7].reduce((sum, size) => sum + size, 0));
  assert.ok(!tree.files.some((entry) => entry.path.includes('node_modules')), '不扫 node_modules');
  assert.ok(!tree.files.some((entry) => entry.path.includes('.hidden')), '不扫点文件');
  assert.ok(!tree.files.some((entry) => entry.path === 'links.md'), '不跟随符号链接');
});

test('文件树：超过 500 条时截断并标记', async (t) => {
  const { paths, write } = setup(t);
  write('big/SKILL.md', '# big\n');
  for (let index = 0; index < MAX_TREE_ENTRIES + 20; index += 1) {
    write(`big/files/f${String(index).padStart(4, '0')}.md`, 'x\n');
  }
  const root = await resolveSkillRoot(paths, 'big');
  const tree = await readSkillTree({ root: root.root, kind: root.kind });
  assert.equal(tree.truncated, true);
  assert.equal(tree.files.length, MAX_TREE_ENTRIES);
});

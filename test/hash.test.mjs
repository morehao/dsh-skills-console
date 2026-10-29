import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { contentHash, contentHashWith, localeComparator } from '../dist/core/hash.js';
import { matchesLegacyHash } from '../dist/core/invocation.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-hash-'));
}

/** 文件名跨 collation 会换位：en 下 `script.md` 在前，zh 下汉字在前。 */
function mixedNameDir() {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'script.md'), 'script');
  fs.writeFileSync(path.join(dir, '什么是token.html'), 'html');
  return dir;
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

test('contentHash 的排序与进程 locale 无关', (t) => {
  const dir = mixedNameDir();
  // 旧口径（locale collation）在同一目录上必须能算出不同结果，否则这条用例没意义
  const legacyEn = contentHashWith(dir, null, localeComparator('en'));
  const legacyZh = contentHashWith(dir, null, localeComparator('zh'));
  if (legacyEn === legacyZh) {
    t.skip('当前 ICU 的 en / zh collation 排这几个文件名结果相同，无法构造 locale 差异');
    return;
  }
  const moduleUrl = new URL('../dist/core/hash.js', import.meta.url).href;
  const script = `import { contentHash } from ${JSON.stringify(moduleUrl)};
console.log(contentHash(${JSON.stringify(dir)}));`;
  const under = (lang) => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, LANG: lang, LC_ALL: lang },
  }).trim();
  const en = under('en_US.UTF-8');
  const zh = under('zh_CN.UTF-8');
  assert.equal(en, zh, '换 locale 不能再改变哈希');
  assert.equal(en, contentHash(dir));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('matchesLegacyHash 认得旧口径基线，认不出新口径以外的值', (t) => {
  const dir = mixedNameDir();
  const legacyEn = contentHashWith(dir, null, localeComparator('en'));
  const legacyZh = contentHashWith(dir, null, localeComparator('zh'));
  const current = contentHash(dir);
  if (legacyEn === current && legacyZh === current) {
    t.skip('当前 ICU 的 collation 与 code unit 序完全一致，无法构造差异');
    return;
  }
  assert.equal(matchesLegacyHash(dir, null, legacyEn), true);
  assert.equal(matchesLegacyHash(dir, null, legacyZh), true);
  assert.equal(matchesLegacyHash(dir, null, 'f'.repeat(64)), false);
  assert.equal(matchesLegacyHash(dir, null, null), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

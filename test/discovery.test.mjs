import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DiscoveryError, discoverSkills } from '../dist/core/discovery.js';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-discovery-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

test('发现：嵌套技能取 frontmatter 名字，根级取仓库名，skillPath 为 POSIX 相对路径', () => {
  const root = repo({
    'SKILL.md': '---\nname: root-skill\ndescription: root\n---\n',
    'skills/alpha/SKILL.md': '---\nname: alpha-renamed\ndescription: A\n---\n',
    'skills/beta/SKILL.md': 'no frontmatter\n',
    'skills/beta/nested/notes.txt': 'x',
  });

  const found = discoverSkills({ dir: root, repoName: 'my-repo' });
  assert.deepEqual(
    found.map((item) => [item.name, item.skillPath]),
    [
      ['alpha-renamed', 'skills/alpha/SKILL.md'],
      ['beta', 'skills/beta/SKILL.md'],
      ['root-skill', 'SKILL.md'],
    ],
  );
  assert.equal(found[0].description, 'A');
  assert.equal(found[2].description, 'root');
  fs.rmSync(root, { recursive: true, force: true });
});

test('发现：subpath 只扫描该前缀，根级回退到 subpath 目录名', () => {
  const root = repo({
    'packages/one/SKILL.md': '---\nname: one\n---\n',
    'packages/two/SKILL.md': '---\nname: two\n---\n',
    'other/SKILL.md': '---\nname: other\n---\n',
  });

  const found = discoverSkills({ dir: root, subpath: 'packages', repoName: 'repo' });
  assert.deepEqual(found.map((item) => item.name), ['one', 'two']);

  const onlyOne = discoverSkills({ dir: root, subpath: 'packages/one', repoName: 'repo' });
  assert.deepEqual(onlyOne.map((item) => [item.name, item.skillPath]), [['one', 'packages/one/SKILL.md']]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('发现：subpath 不存在或含穿越段报错', () => {
  const root = repo({ 'skills/alpha/SKILL.md': '---\nname: alpha\n---\n' });
  assert.throws(
    () => discoverSkills({ dir: root, subpath: 'missing' }),
    (error) => error instanceof DiscoveryError && error.code === 'subpath-not-found',
  );
  assert.throws(
    () => discoverSkills({ dir: root, subpath: '../etc' }),
    (error) => error instanceof DiscoveryError && error.code === 'invalid-subpath',
  );
  assert.throws(
    () => discoverSkills({ dir: root, subpath: 'skills\\alpha' }),
    (error) => error instanceof DiscoveryError && error.code === 'invalid-subpath',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('发现：frontmatter 重名报错，不静默择一', () => {
  const root = repo({
    'a/SKILL.md': '---\nname: same\n---\n',
    'b/SKILL.md': '---\nname: same\n---\n',
  });
  assert.throws(
    () => discoverSkills({ dir: root, repoName: 'repo' }),
    (error) =>
      error instanceof DiscoveryError &&
      error.code === 'duplicate-name' &&
      error.name === 'same' &&
      error.paths.length === 2 &&
      /a\/SKILL\.md/.test(error.paths[0]) &&
      /b\/SKILL\.md/.test(error.paths[1]),
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('发现：frontmatter 名字含路径分隔符/穿越段/控制字符报错', () => {
  for (const bad of ['../evil', 'a/b', 'a\\b', 'bad\u0000name']) {
    const root = repo({ 'alpha/SKILL.md': `---\nname: ${JSON.stringify(bad)}\n---\n` });
    assert.throws(
      () => discoverSkills({ dir: root, repoName: 'repo' }),
      (error) => error instanceof DiscoveryError && error.code === 'invalid-name',
      `应当拒绝 ${JSON.stringify(bad)}`,
    );
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('发现：frontmatter 解析失败回退目录名；忽略隐藏目录与 node_modules', () => {
  const root = repo({
    'skills/alpha/SKILL.md': '---\nname\n---\n',
    '.github/SKILL.md': '---\nname: hidden\n---\n',
    'node_modules/pkg/SKILL.md': '---\nname: dependency\n---\n',
  });
  const found = discoverSkills({ dir: root, repoName: 'repo' });
  assert.deepEqual(found.map((item) => item.name), ['alpha']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('发现：没有 SKILL.md 返回空数组', () => {
  const root = repo({ 'README.md': 'hello' });
  assert.deepEqual(discoverSkills({ dir: root, repoName: 'repo' }), []);
  fs.rmSync(root, { recursive: true, force: true });
});

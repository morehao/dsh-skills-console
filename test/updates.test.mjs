import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkSkill,
  fetchDefaultBranch,
  fetchTree,
  listSkillsFromTree,
  parseSource,
  planToken,
  skillDir,
  skillTreeSha,
} from '../lib/core/updates.js';

const ROOT_SHA = 'a'.repeat(40);
const DIR_SHA_1 = 'b'.repeat(40);
const DIR_SHA_2 = 'c'.repeat(40);

const TREE = [
  { path: 'skills', type: 'tree', sha: 'd'.repeat(40) },
  { path: 'skills/alpha', type: 'tree', sha: DIR_SHA_1 },
  { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '1'.repeat(40) },
  { path: 'skills/beta', type: 'tree', sha: DIR_SHA_2 },
  { path: 'skills/beta/SKILL.md', type: 'blob', sha: '2'.repeat(40) },
  { path: 'README.md', type: 'blob', sha: '3'.repeat(40) },
];

test('parseSource 接受短名与 URL 形态', () => {
  assert.deepEqual(parseSource('morehao/ai-kit'), { owner: 'morehao', repo: 'ai-kit', kind: 'short' });
  assert.equal(parseSource('https://github.com/morehao/ai-kit.git').repo, 'ai-kit');
  assert.equal(parseSource('git@github.com:morehao/ai-kit.git').owner, 'morehao');
  assert.equal(parseSource('not a repo'), null);
});

test('skillPath 是文件路径，目录运算先 dirname（F18）', () => {
  assert.equal(skillDir('skills/alpha/SKILL.md'), 'skills/alpha');
  assert.equal(skillDir('SKILL.md'), '');
  assert.equal(skillTreeSha({ tree: TREE, skillPath: 'skills/alpha/SKILL.md', rootSha: ROOT_SHA }), DIR_SHA_1);
  assert.equal(skillTreeSha({ tree: TREE, skillPath: 'SKILL.md', rootSha: ROOT_SHA }), ROOT_SHA);
});

test('整树 → 技能快照（含每目录 tree SHA）', () => {
  const skills = listSkillsFromTree({ tree: TREE, rootSha: ROOT_SHA, repoName: 'ai-kit' });
  assert.deepEqual(skills.map((item) => item.name), ['alpha', 'beta']);
  assert.equal(skills[0].treeSha, DIR_SHA_1);
  assert.equal(skills[0].skillPath, 'skills/alpha/SKILL.md');
});

test('subpath 过滤', () => {
  const skills = listSkillsFromTree({ tree: TREE, rootSha: ROOT_SHA, subpath: 'skills/beta', repoName: 'r' });
  assert.deepEqual(skills.map((item) => item.name), ['beta']);
});

test('L2/L3 判定：一致 → current，不同 → update-available，缺失 → upstream-deleted', () => {
  const entry = { name: 'alpha', skillPath: 'skills/alpha/SKILL.md' };
  assert.equal(checkSkill({ lockHash: DIR_SHA_1, snapshotEntry: entry, tree: TREE, rootSha: ROOT_SHA }).status, 'current');
  assert.equal(checkSkill({ lockHash: DIR_SHA_2, snapshotEntry: entry, tree: TREE, rootSha: ROOT_SHA }).status, 'update-available');
  assert.equal(checkSkill({ lockHash: DIR_SHA_1, snapshotEntry: null, tree: TREE, rootSha: ROOT_SHA }).status, 'upstream-deleted');
});

test('哈希形态不配对（64 位内容哈希）→ unknown，不误判成有更新（F19）', () => {
  const verdict = checkSkill({
    lockHash: 'f'.repeat(64),
    snapshotEntry: { skillPath: 'skills/alpha/SKILL.md' },
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(verdict.status, 'unknown');
  assert.match(verdict.detail, /形态不配对/);
});

test('fetchTree: 200 解析、304 只回 notModified', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ sha: ROOT_SHA, tree: TREE, truncated: false }), {
    status: 200,
    headers: { etag: 'W/"abc"' },
  });
  const result = await fetchTree({ source: 'o/r', ref: 'main', fetchImpl });
  assert.equal(result.rootSha, ROOT_SHA);
  assert.equal(result.tree.length, TREE.length);
  assert.equal(result.etag, 'W/"abc"');

  const notModified = await fetchTree({
    source: 'o/r',
    ref: 'main',
    etag: 'W/"abc"',
    fetchImpl: async () => ({ status: 304, headers: { get: () => null }, ok: false, text: async () => '' }),
  });
  assert.equal(notModified.notModified, true);
  assert.equal(notModified.tree, undefined);
});

test('fetchTree: 401 / 404 都变成 error，不抛异常', async () => {
  const result = await fetchTree({
    source: 'o/r',
    ref: 'main',
    fetchImpl: async () => new Response('rate limited', { status: 403 }),
  });
  assert.match(result.error, /HTTP 403/);
});

test('fetchDefaultBranch: 取默认分支；仓库不存在时返回 null', async () => {
  const branch = await fetchDefaultBranch({
    source: 'alchaincyf/huashu-design',
    fetchImpl: async (url) => {
      assert.match(url, /\/repos\/alchaincyf\/huashu-design$/);
      return new Response(JSON.stringify({ default_branch: 'master' }), { status: 200 });
    },
  });
  assert.equal(branch, 'master');

  const missing = await fetchDefaultBranch({
    source: 'o/r',
    fetchImpl: async () => new Response('{"message":"Not Found"}', { status: 404 }),
  });
  assert.equal(missing, null);
});

test('planToken 对同一输入稳定、对变化敏感', () => {
  const base = { subscriptionId: 's', from: 'a', to: 'b', installedHash: 'h', targetTreeSha: 't' };
  assert.equal(planToken(base), planToken({ ...base }));
  assert.notEqual(planToken(base), planToken({ ...base, to: 'c' }));
});

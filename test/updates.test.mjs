import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkSkill,
  fetchDefaultBranch,
  fetchTree,
  hashShape,
  listSkillsFromTree,
  parseSource,
  planToken,
  resolveCommitTree,
  skillDir,
  skillTreeSha,
} from '../lib/core/updates.js';
import { treeShaFromEntries } from '../lib/core/git-tree.js';

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

test('哈希形态不配对（64 位内容哈希）+ 无安装基线 → unknown，不误判成有更新（F19）', () => {
  const verdict = checkSkill({
    lockHash: 'f'.repeat(64),
    recordedTreeSha: null,
    snapshotEntry: { skillPath: 'skills/alpha/SKILL.md' },
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(verdict.status, 'unknown');
  assert.match(verdict.detail, /未记录/);
});

test('哈希形态：40 位 = tree，64 位/其他 = content，缺失 = missing', () => {
  assert.equal(hashShape(DIR_SHA_1), 'tree');
  assert.equal(hashShape('f'.repeat(64)), 'content');
  assert.equal(hashShape('nope'), 'content');
  assert.equal(hashShape(null), 'missing');
  assert.equal(hashShape(undefined), 'missing');
});

test('lock 是 64 位内容哈希时，用安装时记录的 tree SHA 当基线（T2 主用例）', () => {
  const entry = { skillPath: 'skills/alpha/SKILL.md' };
  const current = checkSkill({
    lockHash: 'f'.repeat(64),
    recordedTreeSha: DIR_SHA_1,
    snapshotEntry: entry,
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(current.status, 'current');
  assert.equal(current.baseline, 'recorded');
  assert.match(current.detail, /安装时记录/);

  const drifted = checkSkill({
    lockHash: 'f'.repeat(64),
    recordedTreeSha: DIR_SHA_2,
    snapshotEntry: entry,
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(drifted.status, 'update-available');
  assert.equal(drifted.baseline, 'recorded');
  assert.equal(drifted.targetTreeSha, DIR_SHA_1);
  assert.match(drifted.detail, /基线来自 recorded/);
});

test('lock 缺失时同样可以按记录的基线判定', () => {
  const verdict = checkSkill({
    lockHash: null,
    recordedTreeSha: DIR_SHA_1,
    snapshotEntry: { skillPath: 'skills/alpha/SKILL.md' },
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(verdict.status, 'current');

  const stillUnknown = checkSkill({
    lockHash: null,
    recordedTreeSha: null,
    snapshotEntry: { skillPath: 'skills/alpha/SKILL.md' },
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(stillUnknown.status, 'unknown');
});

test('lock 与 recorded 同时存在时以 lock 为准（CLI 才是真身）', () => {
  const verdict = checkSkill({
    lockHash: DIR_SHA_2,
    recordedTreeSha: DIR_SHA_1,
    snapshotEntry: { skillPath: 'skills/alpha/SKILL.md' },
    tree: TREE,
    rootSha: ROOT_SHA,
  });
  assert.equal(verdict.status, 'update-available', 'lock 说 B，上游是 A → 有更新');
  assert.equal(verdict.baseline, 'lock');
});

test('fetchTree: 200 解析、304 只回 notModified；rootSha 由条目重建而非 ref 的 commit SHA', async () => {
  // 回归：GitHub 在 ref 为分支/commit 时，顶层 sha 是 commit SHA，不是根 tree SHA。
  const refSha = 'f'.repeat(40);
  const fetchImpl = async () => new Response(JSON.stringify({ sha: refSha, tree: TREE, truncated: false }), {
    status: 200,
    headers: { etag: 'W/"abc"' },
  });
  const result = await fetchTree({ source: 'o/r', ref: 'main', fetchImpl });
  assert.equal(result.refSha, refSha, '顶层 sha 只能当 ref SHA 留作诊断');
  assert.equal(result.rootSha, treeShaFromEntries(TREE), '根 tree SHA 必须由扁平条目重建');
  assert.notEqual(result.rootSha, refSha, '绝不能把 commit SHA 当根 tree SHA');
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

test('fetchTree: 条目被截断时不猜 rootSha（置 null 交给调用方兜底）', async () => {
  const result = await fetchTree({
    source: 'o/r',
    ref: 'main',
    fetchImpl: async () =>
      new Response(JSON.stringify({ sha: 'f'.repeat(40), tree: TREE, truncated: true }), {
        status: 200,
        headers: { etag: 'W/"abc"' },
      }),
  });
  assert.equal(result.truncated, true);
  assert.equal(result.rootSha, null);
});

test('resolveCommitTree: 一次请求拿 commit 与提交树 SHA', async () => {
  const treeSha = 'd'.repeat(40);
  let called = '';
  const resolved = await resolveCommitTree({
    source: 'o/r',
    ref: 'master',
    fetchImpl: async (url) => {
      called = String(url);
      return new Response(JSON.stringify({ sha: 'e'.repeat(40), tree: { sha: treeSha } }), { status: 200 });
    },
  });
  assert.equal(resolved.commit, 'e'.repeat(40));
  assert.equal(resolved.treeSha, treeSha);
  assert.match(called, /\/commits\/master$/);
});

test('fetchTree: 401 / 404 都变成 error，不抛异常', async () => {
  const result = await fetchTree({
    source: 'o/r',
    ref: 'main',
    fetchImpl: async () => new Response('rate limited', { status: 403 }),
  });
  assert.match(result.error, /HTTP 403/);
});

test('fetchTree: 403 + remaining=0 要标出 rateLimited（供 T4 决定是否转 git）', async () => {
  const result = await fetchTree({
    source: 'o/r',
    ref: 'main',
    fetchImpl: async () =>
      new Response('rate limited', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1780000000' },
      }),
  });
  assert.equal(result.rateLimited, true);
  assert.equal(result.resetAt, 1_780_000_000_000);
});

test('fetchDefaultBranch: 200 → 分支名，结构里带 status', async () => {
  const result = await fetchDefaultBranch({
    source: 'alchaincyf/huashu-design',
    fetchImpl: async (url) => {
      assert.match(url, /\/repos\/alchaincyf\/huashu-design$/);
      return new Response(JSON.stringify({ default_branch: 'master' }), { status: 200 });
    },
  });
  assert.equal(result.branch, 'master');
  assert.equal(result.status, 200);
  assert.equal(result.rateLimited, false);
  assert.equal(result.resetAt, null);
});

test('fetchDefaultBranch: 403 + remaining=0 → rateLimited 且带重置时间', async () => {
  const resetAt = 1_780_000_000; // 秒
  const result = await fetchDefaultBranch({
    source: 'o/r',
    fetchImpl: async () =>
      new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetAt) },
      }),
  });
  assert.equal(result.branch, null);
  assert.equal(result.status, 403);
  assert.equal(result.rateLimited, true);
  assert.equal(result.resetAt, resetAt * 1000, 'reset 是秒，统一换成毫秒');
  assert.match(result.error, /HTTP 403/);
});

test('fetchDefaultBranch: 429 也算限流，404 不是', async () => {
  const tooMany = await fetchDefaultBranch({
    source: 'o/r',
    fetchImpl: async () => new Response('slow down', { status: 429 }),
  });
  assert.equal(tooMany.rateLimited, true);

  const missing = await fetchDefaultBranch({
    source: 'o/r',
    fetchImpl: async () => new Response('{"message":"Not Found"}', { status: 404 }),
  });
  assert.equal(missing.branch, null);
  assert.equal(missing.status, 404);
  assert.equal(missing.rateLimited, false);
});

test('fetchDefaultBranch: 网络异常 → 无 status、error 非空', async () => {
  const result = await fetchDefaultBranch({
    source: 'o/r',
    fetchImpl: async () => {
      throw new Error('ECONNRESET');
    },
  });
  assert.equal(result.branch, null);
  assert.equal(result.status, null);
  assert.equal(result.rateLimited, false);
  assert.match(result.error, /ECONNRESET/);
});

test('planToken 对同一输入稳定、对变化敏感', () => {
  const base = { subscriptionId: 's', from: 'a', to: 'b', installedHash: 'h', targetTreeSha: 't' };
  assert.equal(planToken(base), planToken({ ...base }));
  assert.notEqual(planToken(base), planToken({ ...base, to: 'c' }));
});

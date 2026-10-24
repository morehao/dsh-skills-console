import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGit, gitAvailable, lsRemote, lsTree, parseTreeEntries, repoUrl } from '../lib/core/git.js';

const COMMIT = 'a'.repeat(40);
const ROOT_SHA = 'b'.repeat(40);

// 按 argv 分派的 git shim：只输出固定文本，绝不联网。PATH 里只放它（外加 /usr/bin:/bin 给 tr）。
const SHIM = `#!/bin/sh
echo "$@" >> "$SHIM_LOG"
case "$1" in
  --version)
    echo "git version 2.40.0"
    exit 0
    ;;
  ls-remote)
    if [ -n "$SHIM_BRANCH" ]; then
      printf 'ref: refs/heads/%s\\tHEAD\\n' "$SHIM_BRANCH"
    fi
    printf '%s\\tHEAD\\n' "$SHIM_COMMIT"
    exit 0
    ;;
  clone)
    for last in "$@"; do :; done
    mkdir -p "$last"
    if [ "$SHIM_CLONE_FAIL" = "1" ]; then
      echo "fatal: repository '$2' not found" >&2
      rm -rf "$last"
      exit 128
    fi
    if [ "$SHIM_SLEEP" = "1" ]; then
      sleep 5
      exit 0
    fi
    if [ "$SHIM_FILTER_UNSUPPORTED" = "1" ]; then
      case "$*" in
        *--filter*)
          echo "error: unknown option filter" >&2
          rm -rf "$last"
          exit 129
          ;;
      esac
    fi
    exit 0
    ;;
  -C)
    shift
    shift
    cmd="$1"
    shift
    case "$cmd" in
      rev-parse)
        case "$*" in
          *'^{tree}'*) echo "$SHIM_ROOT_SHA" ;;
          *) echo "$SHIM_COMMIT" ;;
        esac
        exit 0
        ;;
      ls-tree)
        tr '\\n' '\\0' < "$SHIM_TREE_FILE"
        exit 0
        ;;
      fetch)
        exit 0
        ;;
    esac
    ;;
esac
exit 0
`;

/** 每条记录用真实 tab 分隔：`<mode> <type> <sha>\t<path>`。 */
function treeFile(dir, records) {
  const file = path.join(dir, 'tree.txt');
  fs.writeFileSync(
    file,
    `${records.map(([mode, type, sha, entryPath]) => `${mode} ${type} ${sha}\t${entryPath}`).join('\n')}\n`,
  );
  return file;
}

function shimSandbox(extraEnv = {}, records = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-git-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const shim = path.join(bin, 'git');
  fs.writeFileSync(shim, SHIM);
  fs.chmodSync(shim, 0o755);
  const log = path.join(root, 'calls.log');
  fs.writeFileSync(log, '');
  const tree = treeFile(
    root,
    records || [
      ['040000', 'tree', 'c'.repeat(40), 'skills'],
      ['040000', 'tree', ROOT_SHA, 'skills/git kit'],
      ['100644', 'blob', 'd'.repeat(40), 'skills/git kit/SKILL.md'],
      ['040000', 'tree', 'e'.repeat(40), '技能/中文目录'],
      ['100644', 'blob', 'f'.repeat(40), '技能/中文目录/SKILL.md'],
    ],
  );
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    SHIM_LOG: log,
    SHIM_TREE_FILE: tree,
    SHIM_COMMIT: COMMIT,
    SHIM_ROOT_SHA: ROOT_SHA,
    SHIM_BRANCH: 'main',
    HOME: root,
    ...extraEnv,
  };
  const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  return { root, env, calls, shim };
}

/** 每个用例自己的临时目录根：不扫全局 /tmp，避免与其他测试文件并行时互相看见。 */
function tmpRootFor(root) {
  return path.join(root, 'tmp');
}

/** 该用例的临时目录根里是否还残留仓库。 */
function leftovers(tmpRoot) {
  try {
    return fs.readdirSync(tmpRoot);
  } catch {
    return [];
  }
}

test('repoUrl 只认 owner/repo，重建 https URL 并拒绝不安全形态', () => {
  assert.equal(repoUrl('morehao/agent-skills'), 'https://github.com/morehao/agent-skills.git');
  assert.equal(repoUrl('morehao/agent-skills.git'), 'https://github.com/morehao/agent-skills.git');
  assert.throws(() => repoUrl('https://evil.com/a/b'), (error) => error.kind === 'invalid-url');
  assert.throws(() => repoUrl('a/b/c'), (error) => error.kind === 'invalid-url');
  assert.throws(() => repoUrl('--upload-pack=rm -rf /'), (error) => error.kind === 'invalid-url');
});

test('lsRemote 解析 --symref 输出：默认分支 + HEAD commit', async () => {
  const { root, env } = shimSandbox();
  const result = await lsRemote({ url: repoUrl('morehao/agent-skills'), env, timeoutMs: 5000 });
  assert.equal(result.branch, 'main');
  assert.equal(result.commit, COMMIT);

  const detached = await lsRemote({
    url: repoUrl('morehao/agent-skills'),
    env: { ...env, SHIM_BRANCH: '' },
    timeoutMs: 5000,
  });
  assert.equal(detached.branch, null, '没有 symref 时分支为 null，由上层决定默认值');
  assert.equal(detached.commit, COMMIT);
  fs.rmSync(root, { recursive: true, force: true });
});

test('lsTree 解析 -z 输出：路径含空格 / 中文、根级 SKILL.md 都不切错', async () => {
  const { root, env } = shimSandbox({}, [
    ['100644', 'blob', '1'.repeat(40), 'SKILL.md'],
    ['040000', 'tree', '2'.repeat(40), 'skills/a b'],
    ['100644', 'blob', '3'.repeat(40), 'skills/a b/SKILL.md'],
    ['040000', 'tree', '4'.repeat(40), '技能/中文'],
    ['100644', 'blob', '5'.repeat(40), '技能/中文/SKILL.md'],
    ['160000', 'commit', '6'.repeat(40), 'vendor/sub'],
  ]);
  const tmpRoot = tmpRootFor(root);
  const result = await lsTree({ url: repoUrl('morehao/agent-skills'), ref: 'main', env, timeoutMs: 5000, tmpRoot });
  assert.equal(result.commit, COMMIT);
  assert.equal(result.rootSha, ROOT_SHA);
  assert.deepEqual(
    result.entries.map((entry) => entry.path),
    ['SKILL.md', 'skills/a b', 'skills/a b/SKILL.md', '技能/中文', '技能/中文/SKILL.md'],
    'submodule（commit 类型）跳过，路径原样保留',
  );
  assert.deepEqual(result.entries[2], { type: 'blob', path: 'skills/a b/SKILL.md', sha: '3'.repeat(40) });

  assert.deepEqual(leftovers(tmpRoot), [], '临时仓库必须清理干净');
  fs.rmSync(root, { recursive: true, force: true });
});

test('lsTree: git < 2.19 不认 --filter 时去掉重试一次', async () => {
  const { root, env, calls } = shimSandbox({ SHIM_FILTER_UNSUPPORTED: '1' });
  const result = await lsTree({ url: repoUrl('morehao/agent-skills'), ref: 'main', env, timeoutMs: 5000 });
  assert.equal(result.commit, COMMIT, '降级重试后仍然成功');
  const clones = calls().filter((line) => line.startsWith('clone'));
  assert.equal(clones.length, 2, '第一次带 --filter 失败，第二次不带');
  assert.match(clones[0], /--filter=blob:none/);
  assert.doesNotMatch(clones[1], /--filter/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('lsTree: 超时被 SIGKILL，返回 git-timeout（临时目录照样清理）', async () => {
  const { root, env } = shimSandbox({ SHIM_SLEEP: '1' });
  const tmpRoot = tmpRootFor(root);
  const startedAt = Date.now();
  await assert.rejects(
    () => lsTree({ url: repoUrl('morehao/agent-skills'), ref: 'main', env, timeoutMs: 300, tmpRoot }),
    (error) => error.kind === 'git-timeout',
  );
  assert.ok(Date.now() - startedAt < 3000, '必须硬超时，不能等 shim 睡完');
  assert.deepEqual(leftovers(tmpRoot), [], '超时也要清理临时目录');
  fs.rmSync(root, { recursive: true, force: true });
});

test('lsTree: 仓库不存在/私有 → auth，供上层回退 REST', async () => {
  const { root, env } = shimSandbox({ SHIM_CLONE_FAIL: '1' });
  await assert.rejects(
    () => lsTree({ url: repoUrl('morehao/private-kit'), ref: 'main', env, timeoutMs: 5000 }),
    (error) => error.kind === 'auth',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('lsTree: 拒绝任意 URL 与形似选项的 ref', async () => {
  await assert.rejects(
    () => lsTree({ url: 'https://evil.com/a/b.git', ref: 'main' }),
    (error) => error.kind === 'invalid-url',
  );
  await assert.rejects(
    () => lsTree({ url: repoUrl('a/b'), ref: '--upload-pack=rm -rf /' }),
    (error) => error.kind === 'invalid-url',
  );
});

test('gitAvailable: PATH 里没有 git → false；有 → true', async () => {
  assert.equal(await gitAvailable({ env: { PATH: '' }, timeoutMs: 2000 }), false);
  const { root, env } = shimSandbox();
  assert.equal(await gitAvailable({ env, timeoutMs: 2000 }), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('parseTreeEntries: 空输出与畸形行都被忽略', () => {
  assert.deepEqual(parseTreeEntries(''), []);
  assert.deepEqual(parseTreeEntries('garbage\0tree abc\0'), []);
});

test('createGit: DSH_SKILLS_CONSOLE_GIT=off 直接停用；同一 (url, ref) 只 clone 一次', async () => {
  const { root, env, calls } = shimSandbox();
  const git = createGit({ env });
  assert.equal(git.enabled(), true);
  assert.equal(await git.isAvailable(), true);

  const url = repoUrl('morehao/agent-skills');
  await git.tree({ url, ref: 'main' });
  await git.tree({ url, ref: 'main' });
  assert.equal(calls().filter((line) => line.startsWith('clone')).length, 1, '缓存命中不再 clone');

  const off = createGit({ env: { ...env, DSH_SKILLS_CONSOLE_GIT: 'off' } });
  assert.equal(off.enabled(), false);
  assert.equal(await off.isAvailable(), false, '关掉后不再探 git');
  fs.rmSync(root, { recursive: true, force: true });
});

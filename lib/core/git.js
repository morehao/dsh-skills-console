import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 只读 git 通道：`ls-remote` 拿默认分支与 HEAD，`clone --filter=blob:none --no-checkout` +
 * `ls-tree` 拿整树。**不占 GitHub REST 配额**，也不需要 token / gh —— 这是「出口 IP 被
 * 匿名配额打死」时唯一还通的路。
 *
 * 硬约束（见 AGENTS.md「数据边界」）：
 * - 只读：只在 `os.tmpdir()` 里建临时仓库，`finally` 必删；不碰 canonical、不碰 lock；
 * - 不接受任意 URL：只认 `https://github.com/<owner>/<repo>.git`（由 `repoUrl` 从
 *   `parseSource` 的产物重建），拒绝以 `-` 开头的 ref（防 argv 注入成选项）；
 * - 零依赖：只用 node:child_process / node:fs / node:os / node:path。
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const VERSION_TIMEOUT_MS = 10_000;
const MAX_STDOUT = 8 * 1024 * 1024;
const MAX_STDERR = 64 * 1024;
const TMP_PREFIX = 'dsh-skills-git-';
const REPO_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
// 分支/tag 名：足够覆盖真实用法，同时排除以 `-` 开头（会被 git 当成选项）
const REF_RE = /^[\w][\w./-]{0,254}$/;

/** `kind` 供上层决定是否回退 REST：`git-missing` / `git-timeout` / `auth` / `clone-failed` / `invalid-url`。 */
export class GitError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.name = 'GitError';
    this.kind = kind;
    this.detail = detail || null;
  }
}

/** 从 `owner/repo`（`parseSource` 的产物）重建 URL，再做一次白名单断言。 */
export function repoUrl(source) {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(String(source || '').trim());
  if (!match) throw new GitError('invalid-url', `不是 owner/repo 形态：${source}`);
  const repo = match[2].replace(/\.git$/, '');
  const url = `https://github.com/${match[1]}/${repo}.git`;
  if (!REPO_URL_RE.test(url)) throw new GitError('invalid-url', `拒绝不安全的仓库地址：${url}`);
  return url;
}

function assertUrl(url) {
  if (typeof url !== 'string' || !REPO_URL_RE.test(url)) {
    throw new GitError('invalid-url', `拒绝不安全的仓库地址：${url}`);
  }
}

function assertRef(ref) {
  if (typeof ref !== 'string' || !(REF_RE.test(ref) || COMMIT_RE.test(ref))) {
    throw new GitError('invalid-url', `拒绝不安全的 ref：${ref}`);
  }
}

function withDefaults(env) {
  return {
    ...env,
    // 私有仓库 / 需要凭据时立刻失败，绝不卡在交互提示上
    GIT_TERMINAL_PROMPT: '0',
    GIT_HTTP_LOW_SPEED_LIMIT: '1',
    GIT_HTTP_LOW_SPEED_TIME: '30',
    LC_ALL: 'C',
  };
}

/** 子进程封装：无 shell、argv 直传、硬超时 SIGKILL、stdout 上限。永不 reject。 */
function runGit(args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn('git', args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: withDefaults(env),
      });
    } catch (error) {
      finish({ spawnError: error, code: null, stdout: '', stderr: '', timedOut: false, args });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      // 孙进程（git-remote-https 之类）可能还握着管道：不等它们退出，直接判超时
      child.stdout?.destroy();
      child.stderr?.destroy();
      finish({ code: null, stdout, stderr, timedOut: true, args });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length >= MAX_STDOUT) return;
      stdout += chunk.toString('utf8').slice(0, MAX_STDOUT - stdout.length);
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ spawnError: error, code: null, stdout, stderr, timedOut, args });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ code, stdout, stderr, timedOut, args });
    });
  });
}

/** 退出码非 0 → 分类。`auth` 涵盖「私有仓库 / 凭据不对 / 仓库不存在」这几种 git 都只说一句话的情况。 */
function toGitError(result, fallbackMessage = 'git 失败') {
  if (result.spawnError) {
    return new GitError('git-missing', result.spawnError.message, { code: result.spawnError.code || null });
  }
  if (result.timedOut) {
    return new GitError('git-timeout', `git ${result.args?.[0] || ''} 超时`, { args: result.args || [] });
  }
  const stderr = String(result.stderr || '').trim();
  if (
    /authentication failed|could not read username|terminal prompts disabled|permission denied|repository[^\n]*not found|invalid username or password|access denied/i.test(
      stderr,
    )
  ) {
    return new GitError('auth', stderr.slice(-400) || '认证失败', { code: result.code ?? null });
  }
  return new GitError('clone-failed', (stderr || fallbackMessage).slice(-400), { code: result.code ?? null });
}

/** `git --version` 探测。没有 git 的环境本来也装不了技能，回退 REST 即可。 */
export async function gitAvailable({ env = process.env, timeoutMs = VERSION_TIMEOUT_MS } = {}) {
  const result = await runGit(['--version'], { env, timeoutMs });
  if (result.spawnError || result.timedOut || result.code !== 0) return false;
  return /git version \d+/.test(result.stdout);
}

/** `git ls-remote --symref <url> HEAD` → `{ branch, commit }`。零配额拿默认分支 + HEAD。 */
export async function lsRemote({ url, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  assertUrl(url);
  const result = await runGit(['ls-remote', '--symref', url, 'HEAD'], { env, timeoutMs });
  if (result.spawnError || result.timedOut || result.code !== 0) throw toGitError(result, 'ls-remote 失败');
  let branch = null;
  let commit = null;
  for (const raw of result.stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('ref:')) {
      const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line);
      if (symref) branch = symref[1];
      continue;
    }
    const head = /^([0-9a-f]{40})\s+HEAD$/.exec(line);
    if (head) commit = head[1];
  }
  if (!commit) throw new GitError('clone-failed', 'ls-remote 没有返回 HEAD 指向的 commit');
  return { branch, commit };
}

/** `git ls-tree -r -t -z` 的输出 → `[{ type, path, sha }]`，与 Trees API 同形。 */
export function parseTreeEntries(stdout) {
  const entries = [];
  for (const record of String(stdout || '').split('\0')) {
    if (!record) continue;
    // 默认格式：`<mode> <type> <sha>\t<path>`；路径里的空格/中文都靠 tab 定位，不会被切错
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const meta = record.slice(0, tab).split(' ');
    const type = meta[1];
    if (type !== 'blob' && type !== 'tree') continue;
    entries.push({ type, path: record.slice(tab + 1), sha: meta[2] });
  }
  return entries;
}

/**
 * `git clone --depth 1 --filter=blob:none --no-checkout` + `ls-tree` → `{ entries, rootSha, commit }`。
 * 临时目录用完必删；容器型 `<ref>`（commit SHA）走 fetch，分支/tag 走 `--branch`。
 * `tmpRoot` 只是给测试一个隔离的临时目录根，生产走 `os.tmpdir()`。
 */
export async function lsTree({ url, ref = 'HEAD', env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, tmpRoot = os.tmpdir() } = {}) {
  assertUrl(url);
  assertRef(ref);
  const isCommit = COMMIT_RE.test(ref);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, TMP_PREFIX));
  const base = ['clone', '--depth', '1', '--no-checkout', '--quiet'];
  const cloneArgs = [...base, '--filter=blob:none'];
  if (!isCommit) cloneArgs.push('--branch', ref);
  cloneArgs.push(url, dir);

  try {
    let cloned = await runGit(cloneArgs, { env, timeoutMs });
    // 老 git（< 2.19）不认 --filter：去掉再试一次（慢一点，但能用）
    if ((cloned.spawnError || cloned.timedOut || cloned.code !== 0) && /filter/i.test(cloned.stderr || '')) {
      const retry = [...base];
      if (!isCommit) retry.push('--branch', ref);
      retry.push(url, dir);
      cloned = await runGit(retry, { env, timeoutMs });
    }
    if (cloned.spawnError || cloned.timedOut || cloned.code !== 0) throw toGitError(cloned, 'clone 失败');

    // HEAD 对应的 commit：分支/tag 克隆时是 HEAD，commit 形态直接用它自己
    const revTarget = isCommit ? `${ref}^{commit}` : 'HEAD^{commit}';
    let rev = await runGit(['-C', dir, 'rev-parse', '--verify', revTarget], { env, timeoutMs });
    if (rev.code !== 0 && isCommit) {
      // 默认分支的浅克隆里可能没有这个 commit：单独取一次
      await runGit(['-C', dir, 'fetch', '--depth', '1', '--quiet', url, ref], { env, timeoutMs });
      rev = await runGit(['-C', dir, 'rev-parse', '--verify', revTarget], { env, timeoutMs });
    }
    const commit = rev.code === 0 ? rev.stdout.trim() : '';
    if (!COMMIT_RE.test(commit)) throw toGitError(rev, 'rev-parse 拿不到 commit');

    const treeRev = await runGit(['-C', dir, 'rev-parse', '--verify', `${commit}^{tree}`], { env, timeoutMs });
    const rootSha = treeRev.code === 0 ? treeRev.stdout.trim() : '';
    if (!COMMIT_RE.test(rootSha)) throw toGitError(treeRev, 'rev-parse 拿不到根 tree');

    const listed = await runGit(['-C', dir, 'ls-tree', '-r', '-t', '-z', commit], { env, timeoutMs });
    if (listed.code !== 0) throw toGitError(listed, 'ls-tree 失败');
    return { entries: parseTreeEntries(listed.stdout), rootSha, commit };
  } finally {
    if (dir.includes(TMP_PREFIX)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 服务实例用的封装：进程内缓存 `git --version` 结论与 `(url, ref)` 的整树
 * （一个仓库装多个技能时只 clone 一次），并统一读 `DSH_SKILLS_CONSOLE_GIT*`。
 */
export function createGit({ env = process.env, logger = () => {} } = {}) {
  const TREE_TTL_MS = 60_000;
  const TREE_MAX = 20;
  const trees = new Map();
  let available = null;

  const enabled = () => String(env.DSH_SKILLS_CONSOLE_GIT || '').trim().toLowerCase() !== 'off';
  const timeoutMs = () => {
    const value = Number(env.DSH_SKILLS_CONSOLE_GIT_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
  };

  async function isAvailable() {
    if (!enabled()) return false;
    if (available === null) available = await gitAvailable({ env, timeoutMs: Math.min(timeoutMs(), VERSION_TIMEOUT_MS) });
    if (!available) logger('git.missing');
    return available;
  }

  async function tree({ url, ref }) {
    const key = `${url}@${ref}`;
    const cached = trees.get(key);
    if (cached && Date.now() - cached.at < TREE_TTL_MS) return cached.value;
    const value = await lsTree({ url, ref, env, timeoutMs: timeoutMs() });
    trees.set(key, { value, at: Date.now() });
    for (const oldest of trees.keys()) {
      if (trees.size <= TREE_MAX) break;
      trees.delete(oldest);
    }
    return value;
  }

  return {
    enabled,
    isAvailable,
    timeoutMs,
    url: repoUrl,
    lsRemote: (options = {}) => lsRemote({ ...options, env, timeoutMs: options.timeoutMs || timeoutMs() }),
    tree,
    clearCache() {
      trees.clear();
    },
  };
}

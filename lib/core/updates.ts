import crypto from 'node:crypto';
import { treeShaFromEntries } from './git-tree.js';

const API = 'https://api.github.com';

/** `owner/repo`、`https://github.com/owner/repo(.git)`、`git@github.com:owner/repo.git` 都能认。 */
export function parseSource(source) {
  if (!source || typeof source !== 'string') return null;
  const trimmed = source.trim();
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) return { owner: short[1], repo: short[2].replace(/\.git$/, ''), kind: 'short' };
  const url = trimmed.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/);
  if (url) return { owner: url[1], repo: url[2], kind: 'url' };
  return null;
}

export function snapshotId({ source, ref, subpath }) {
  return crypto
    .createHash('sha256')
    .update(`${source}\n${ref || ''}\n${subpath || ''}`)
    .digest('hex')
    .slice(0, 16);
}

export function githubToken(env = process.env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || null;
}

/**
 * 限流相关响应头。GitHub 对匿名请求按**出口 IP** 记 60 次/小时，403 时这三个头是
 * 用户唯一能拿到的可执行信息（还剩多少、什么时候恢复、要不要等）。
 */
function rateLimitOf(response) {
  const read = (name) => {
    const value = response?.headers?.get?.(name);
    return value === null || value === undefined || value === '' ? null : String(value);
  };
  const reset = read('x-ratelimit-reset');
  const retryAfter = read('retry-after');
  const resetAt = reset && /^\d+$/.test(reset) ? Number(reset) * 1000 : null;
  return { remaining: read('x-ratelimit-remaining'), resetAt, retryAfter };
}

/** 403 + 剩余 0，或 429 —— 与上游判定一致（blob.ts:147-152）。 */
export function isRateLimited(status, rateLimit) {
  if (status === 429) return true;
  return status === 403 && rateLimit?.remaining === '0';
}

async function callJson(url, { token, etag, fetchImpl = fetch }: any = {}) {
  const headers: any = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-skills-console',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (etag) headers['if-none-match'] = etag;
  const response = await fetchImpl(url, { headers });
  const rateLimit = rateLimitOf(response);
  if (response.status === 304) return { status: 304, notModified: true, etag, rateLimit };
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { status: response.status, error: `HTTP ${response.status} ${text.slice(0, 200)}`, rateLimit };
  }
  const body = await response.json();
  return { status: response.status, body, etag: response.headers.get('etag'), rateLimit };
}

/**
 * 一次 Trees 请求取整树（F8）。`ref` 可以是分支 / tag / commit —— Trees API 两种都收。
 * ETag 是**整响应级**，缓存键是 `(repo, ref, commit)`；304 时只能复用上次数据，绝不把 entries 置空。
 *
 * 注意 `rootSha`：GitHub 在 `ref` 是分支/commit 时，响应顶层 `sha` 返回的是 **commit SHA**，
 * 不是根 tree SHA（只有直接传 tree SHA 才会回 tree SHA）。所以这里一律由扁平条目本地重建
 * 根 tree SHA；条目被截断时无法重建，置 null，交给调用方按需补一次 commits 请求。
 */
export async function fetchTree({ source, ref = 'main', etag, token, fetchImpl }: any = {}) {
  const parsed = parseSource(source);
  if (!parsed) return { error: 'invalid-source' };
  const url = `${API}/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const result = await callJson(url, { token, etag, fetchImpl });
  if (result.notModified) return { notModified: true, etag: result.etag };
  if (result.error) {
    return {
      error: result.error,
      status: result.status,
      rateLimited: isRateLimited(result.status, result.rateLimit),
      resetAt: result.rateLimit?.resetAt ?? null,
      rateLimit: result.rateLimit,
    };
  }
  const tree = Array.isArray(result.body?.tree) ? result.body.tree : [];
  const truncated = Boolean(result.body?.truncated);
  let rootSha: any = null;
  if (!truncated) {
    try {
      rootSha = treeShaFromEntries(tree);
    } catch {
      // 条目形态异常时宁可让调用方走兜底，也不写一个猜出来的根 tree SHA。
      rootSha = null;
    }
  }
  return {
    tree,
    rootSha,
    // 仅用于诊断：ref 查询下它通常是 commit SHA，绝不能当 tree SHA 用。
    refSha: result.body?.sha || null,
    truncated,
    etag: result.etag,
    repo: `${parsed.owner}/${parsed.repo}`,
  };
}

/**
 * 仓库默认分支。`ref` 缺省时以它为准：不少技能仓库默认是 `master`，
 * 硬套 `main` 只会得到 404（例如 alchaincyf/huashu-design）。
 *
 * 返回结构化结果而不是 `string | null`：调用方要靠 `status` / `rateLimited` / `resetAt`
 * 把「仓库不存在」「被限流」「网络不通」拆成三句不同的话（T1）。
 */
export async function fetchDefaultBranch({ source, token, fetchImpl }: any = {}) {
  const parsed = parseSource(source);
  if (!parsed) {
    return { branch: null, status: null, rateLimited: false, resetAt: null, error: 'invalid-source' };
  }
  let result;
  try {
    result = await callJson(`${API}/repos/${parsed.owner}/${parsed.repo}`, { token, fetchImpl });
  } catch (error) {
    return { branch: null, status: null, rateLimited: false, resetAt: null, error: error?.message || String(error) };
  }
  const rateLimit = result.rateLimit || {};
  const rateLimited = isRateLimited(result.status, rateLimit);
  const base = { status: result.status ?? null, rateLimited, resetAt: rateLimit.resetAt ?? null };
  if (result.error) return { ...base, branch: null, error: result.error };
  const branch = result.body?.default_branch;
  if (!branch) return { ...base, branch: null, error: 'response has no default_branch' };
  return { ...base, branch, error: null };
}

/** 解析 ref 对应的 commit（只在安装/计划时需要，检测阶段不付这笔成本）。 */
export async function resolveCommit({ source, ref = 'main', token, fetchImpl }: any = {}) {
  const resolved = await resolveCommitTree({ source, ref, token, fetchImpl });
  return resolved?.commit ?? null;
}

/**
 * 解析 ref 对应的 commit 及其**提交树 SHA**（一次请求拿两样）。
 * 用于条目被截断、无法由扁平列表重建根 tree SHA 的兜底；`tree.sha` 才是真正的根 tree SHA。
 */
export async function resolveCommitTree({ source, ref = 'main', token, fetchImpl }: any = {}) {
  const parsed = parseSource(source);
  if (!parsed) return null;
  const result = await callJson(`${API}/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(ref)}`, {
    token,
    fetchImpl,
  });
  if (result.error || !result.body?.sha) return null;
  return { commit: result.body.sha, treeSha: result.body?.tree?.sha || null };
}

const TREE_SHA_RE = /^[0-9a-f]{40}$/;

/**
 * lock 的 `skillFolderHash` 形态。CLI 取不到树时（限流）会把 64 位内容哈希写进同一个字段
 * （`add.ts:2254`），所以形态取决于**安装那一刻 API 通不通**，不是取决于来源类型。
 * `tree` = 40 位 git tree SHA；`content` = 64 位内容哈希；`missing` = 没有这个字段。
 */
export function hashShape(value) {
  if (!value || typeof value !== 'string') return 'missing';
  return TREE_SHA_RE.test(value) ? 'tree' : 'content';
}

/** `KEY` + `/dir/SKILL.md` → `dir`（F18：`skillPath` 是文件路径，目录运算先 dirname）。 */
export function skillDir(skillPath) {
  const parts = String(skillPath).split('/');
  parts.pop();
  return parts.join('/');
}

export function skillTreeSha({ tree, skillPath, rootSha }) {
  const dir = skillDir(skillPath);
  if (!dir) return rootSha;
  const entry = tree.find((item) => item.type === 'tree' && item.path === dir);
  return entry ? entry.sha : null;
}

/**
 * 快照 = 仓库里所有 `SKILL.md` 的目录条目。
 * 名字取目录名；根级 `SKILL.md` 用仓库名（读不到 frontmatter，名字只能是近似值，装完以 canonical 为准）。
 */
export function listSkillsFromTree({ tree, rootSha, subpath, repoName }) {
  const prefix = subpath ? `${subpath.replace(/\/+$/, '')}/` : '';
  const byName = new Map();
  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    if (entry.path !== 'SKILL.md' && !entry.path.endsWith('/SKILL.md')) continue;
    if (prefix && !entry.path.startsWith(prefix)) continue;
    const dir = skillDir(entry.path);
    const name = dir ? dir.split('/').pop() : repoName || 'root';
    if (byName.has(name)) continue;
    byName.set(name, {
      name,
      skillPath: entry.path,
      treeSha: skillTreeSha({ tree, skillPath: entry.path, rootSha }),
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 单技能判定（L2/L3）。
 *
 * 基线取「第一个 40 位 tree SHA」：优先 lock 的 `skillFolderHash`，其次安装时记下的
 * `state.installs[].treeSha`。CLI 在限流时会退化成 64 位内容哈希（`add.ts:2236`/`2254`），
 * 那玩意儿与上游 tree SHA 不同源，直接比必然不等 —— 既不能判 `current`，也不该判
 * `update-available`，此时改用手边记下的基线；两样都没有才给 `unknown`（老状态，行为与以前一致）。
 */
export function checkSkill({ lockHash, recordedTreeSha, snapshotEntry, tree, rootSha }) {
  if (!snapshotEntry) return { status: 'upstream-deleted', detail: '上游整树里已找不到这个 skillPath' };
  const baseline = TREE_SHA_RE.test(String(lockHash || ''))
    ? { sha: lockHash, from: 'lock' }
    : TREE_SHA_RE.test(String(recordedTreeSha || ''))
      ? { sha: recordedTreeSha, from: 'recorded' }
      : null;
  if (!baseline) {
    return {
      status: 'unknown',
      detail: 'lock 里没有 40 位 tree SHA，安装时也未记录基线，无法按 tree 比对',
    };
  }
  const target = skillTreeSha({ tree, skillPath: snapshotEntry.skillPath, rootSha });
  if (!target) return { status: 'unknown', detail: '整树里找不到该目录的 tree 条目' };
  if (target === baseline.sha) {
    return {
      status: 'current',
      detail: baseline.from === 'lock' ? '与安装时的 tree SHA 一致' : '与安装时记录的 tree SHA 一致',
      baseline: baseline.from,
    };
  }
  return {
    status: 'update-available',
    detail: `tree SHA 已变化（基线来自 ${baseline.from}）`,
    targetTreeSha: target,
    baseline: baseline.from,
  };
}

/** 计划 → 应用的防换手 token：磁盘或上游在"计划"之后被改动就拒绝（设计 §7.4③）。 */
export function planToken(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

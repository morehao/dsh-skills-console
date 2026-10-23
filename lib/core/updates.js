import crypto from 'node:crypto';

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

async function callJson(url, { token, etag, fetchImpl = fetch } = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-skills-console',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (etag) headers['if-none-match'] = etag;
  const response = await fetchImpl(url, { headers });
  if (response.status === 304) return { status: 304, notModified: true, etag };
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { status: response.status, error: `HTTP ${response.status} ${text.slice(0, 200)}` };
  }
  const body = await response.json();
  return { status: response.status, body, etag: response.headers.get('etag') };
}

/**
 * 一次 Trees 请求取整树（F8）。`ref` 可以是分支 / tag / commit —— Trees API 两种都收。
 * ETag 是**整响应级**，缓存键是 `(repo, ref, commit)`；304 时只能复用上次数据，绝不把 entries 置空。
 */
export async function fetchTree({ source, ref = 'main', etag, token, fetchImpl } = {}) {
  const parsed = parseSource(source);
  if (!parsed) return { error: 'invalid-source' };
  const url = `${API}/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const result = await callJson(url, { token, etag, fetchImpl });
  if (result.notModified) return { notModified: true, etag: result.etag };
  if (result.error) return { error: result.error, status: result.status };
  const tree = Array.isArray(result.body?.tree) ? result.body.tree : [];
  return {
    tree,
    rootSha: result.body?.sha || null,
    truncated: Boolean(result.body?.truncated),
    etag: result.etag,
    repo: `${parsed.owner}/${parsed.repo}`,
  };
}

/**
 * 仓库默认分支。`ref` 缺省时以它为准：不少技能仓库默认是 `master`，
 * 硬套 `main` 只会得到 404（例如 alchaincyf/huashu-design）。
 */
export async function fetchDefaultBranch({ source, token, fetchImpl } = {}) {
  const parsed = parseSource(source);
  if (!parsed) return null;
  const result = await callJson(`${API}/repos/${parsed.owner}/${parsed.repo}`, { token, fetchImpl });
  if (result.error || !result.body?.default_branch) return null;
  return result.body.default_branch;
}

/** 解析 ref 对应的 commit（只在安装/计划时需要，检测阶段不付这笔成本）。 */
export async function resolveCommit({ source, ref = 'main', token, fetchImpl } = {}) {
  const parsed = parseSource(source);
  if (!parsed) return null;
  const result = await callJson(`${API}/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(ref)}`, {
    token,
    fetchImpl,
  });
  if (result.error || !result.body?.sha) return null;
  return result.body.sha;
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

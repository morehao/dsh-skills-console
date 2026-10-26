import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTarball } from './archive.js';
import { discoverSkills } from './discovery.js';
import { gitTreeSha } from './git-tree.js';
import { parseSource } from './updates.js';

/**
 * 远端通道：codeload tarball、Atom commit feed、限流时的快照扫描。
 *
 * 安全边界（与设计文档 §安全一致）：
 * - 只接受 HTTPS，只允许 GitHub 的 host；重定向手动跟随，跨 host 一律拒绝并剥离 Authorization。
 * - token 只进 header，绝不拼进 URL、错误消息或日志。
 * - 响应 `content-length` 与流式累计双重限额，超限立即中止并删掉半截文件。
 * - 默认 60s 超时；超时/中止都抛 RemoteError，不留下半写文件。
 */

// 上游仓库可能带设计素材（如 tt-a1i/archify 解压后 ~100MB），50MB 会误伤；
// 解压侧另有 200MB / 10000 文件的上限兜底。
export const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;
const ALLOWED_HOSTS = new Set([
  'codeload.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
]);

export class RemoteError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'RemoteError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** commit（40 位）或分支/tag；分支里的 `/` 是合法的，但 `..`/空白/反斜杠不行。 */
export function assertRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0 || ref.length > 200) {
    throw new RemoteError('invalid-ref', 'ref 必须是非空字符串');
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..') || ref.startsWith('/') || ref.endsWith('/')) {
    throw new RemoteError('invalid-ref', `ref 含非法字符: ${ref}`);
  }
  return ref;
}

export function codeloadUrl({ source, ref }) {
  const parsed = parseSource(source);
  if (!parsed) throw new RemoteError('invalid-source', `不是 GitHub 来源: ${source}`);
  assertRef(ref);
  return `https://codeload.github.com/${parsed.owner}/${parsed.repo}/tar.gz/${ref}`;
}

function assertAllowedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteError('redirect-rejected', `重定向目标不是合法 URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new RemoteError('redirect-rejected', `只允许 HTTPS: ${url}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new RemoteError('redirect-rejected', `不允许的 host: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password) {
    throw new RemoteError('redirect-rejected', '重定向目标不能带 userinfo');
  }
  return parsed;
}

function tooLarge(maxBytes, bytes) {
  return new RemoteError('tarball-too-large', `tarball 超过 ${maxBytes} 字节上限（已收到 ${bytes}）`, {
    maxBytes,
    bytes,
  });
}

const ATOM_ID_RE = /<id>tag:github\.com,2008:Grit::Commit\/([0-9a-f]{40})<\/id>/i;
const ATOM_LINK_RE = /https:\/\/github\.com\/[^"<\s]+\/commit\/([0-9a-f]{40})/i;

/** 从 GitHub 的 commits Atom feed 里取第一条 commit（feed 按时间倒序）。 */
export function parseAtomCommit(text) {
  const body = String(text || '');
  const match = ATOM_ID_RE.exec(body) || ATOM_LINK_RE.exec(body);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Atom commit feed：`/commits/<ref>.atom`（不带 ref 即默认分支）。
 * 不占 REST 配额，也不需要 `--json` / git；失败抛 RemoteError，由调用方决定是否降级。
 */
export async function fetchAtomCommit({
  source,
  ref = null,
  token = null,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const parsed = parseSource(source);
  if (!parsed) throw new RemoteError('bad-source', `只接受 owner/repo 或 GitHub URL: ${source}`);
  if (ref !== null) assertRef(ref);
  const refPath = ref ? `/${ref.split('/').map(encodeURIComponent).join('/')}` : '';
  const url = `https://github.com/${parsed.owner}/${parsed.repo}/commits${refPath}.atom`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();
  try {
    const headers = { accept: 'application/atom+xml', 'user-agent': 'dsh-skills-console' };
    if (token) headers.authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetchImpl(url, { headers, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new RemoteError('timeout', `读取 Atom 超时（${timeoutMs}ms）`, { cause: error });
      throw new RemoteError('network', `读取 Atom 失败: ${error.message}`, { cause: error });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new RemoteError('http-error', `HTTP ${response.status}: ${text.slice(0, 200)}`, {
        status: response.status,
      });
    }
    const commit = parseAtomCommit(await response.text());
    if (!commit) throw new RemoteError('atom-empty', 'Atom feed 里没有 commit');
    return { commit, url, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

function skillDirOf(skillPath) {
  const index = skillPath.lastIndexOf('/');
  return index < 0 ? '' : skillPath.slice(0, index);
}

/**
 * 用 codeload tarball 组装一份与 REST 同形的快照（限流兜底）。
 * 只在临时目录里解压/扫描；rootSha 与每个 skill 的 treeSha 都在本地算。
 */
export async function snapshotFromTarball({
  source,
  commit,
  ref = null,
  subpath = null,
  token = null,
  fetchImpl = fetch,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const parsed = parseSource(source);
  if (!parsed) throw new RemoteError('bad-source', `只接受 owner/repo 或 GitHub URL: ${source}`);
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new RemoteError('missing-commit', 'codeload 快照需要 40 位 commit');
  }
  const repo = `${parsed.owner}/${parsed.repo}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-scan-'));
  try {
    const tarball = path.join(work, 'repo.tar.gz');
    await downloadTarball({ source: repo, ref: commit, dest: tarball, token, fetchImpl, maxBytes, timeoutMs });
    const extracted = await extractTarball({ tarball, dest: path.join(work, 'stage') });
    let skills;
    try {
      skills = discoverSkills({ dir: extracted.dir, subpath, repoName: parsed.repo });
    } catch (error) {
      throw new RemoteError('scan-failed', `扫描快照失败: ${error.message}`, { cause: error, code: error.code });
    }
    let rootSha;
    try {
      rootSha = gitTreeSha(extracted.dir);
    } catch (error) {
      throw new RemoteError('scan-failed', `计算 root tree 失败: ${error.message}`, { cause: error });
    }
    const entries = [];
    const tree = [];
    const seenDirs = new Set();
    for (const skill of skills) {
      let treeSha;
      try {
        treeSha = gitTreeSha(skill.dirPath);
      } catch (error) {
        throw new RemoteError('scan-failed', `计算 ${skill.name} tree 失败: ${error.message}`, { cause: error });
      }
      entries.push({
        name: skill.name,
        skillPath: skill.skillPath,
        treeSha,
        // 订阅条目在界面上还要用一行原文描述帮用户决定装不装：只是 frontmatter 里作者自己的话，
        // 不调模型、也不进提示词；截断避免 state.json 被超长描述撑大。
        description: typeof skill.description === 'string' ? skill.description.slice(0, 600) : '',
      });
      const dir = skillDirOf(skill.skillPath);
      if (dir && !seenDirs.has(dir)) {
        seenDirs.add(dir);
        tree.push({ path: dir, type: 'tree', sha: treeSha });
      }
      // blob 条目只用于判定「skillPath 是否还在」；真正比对用目录 treeSha
      tree.push({ path: skill.skillPath, type: 'blob' });
    }
    return {
      branch: ref || null,
      via: 'codeload',
      tree,
      rootSha,
      snapshot: {
        commit: commit.toLowerCase(),
        rootSha,
        entries,
        fetchedAt: new Date().toISOString(),
        etag: null,
      },
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * 把 codeload tarball 下载到 `dest`。`dest` 的父目录必须已存在。
 * 成功返回 `{ file, bytes, url }`；任何失败都会删除 `dest` 并抛 RemoteError。
 */
export async function downloadTarball({
  source,
  ref,
  token,
  dest,
  fetchImpl = fetch,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal: externalSignal,
} = {}) {
  if (typeof dest !== 'string' || dest.length === 0) {
    throw new RemoteError('invalid-dest', 'downloadTarball 需要 dest 文件路径');
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new RemoteError('invalid-limit', 'maxBytes 必须是正数');
  }

  const initialUrl = codeloadUrl({ source, ref });

  const controller = new AbortController();
  let timedOut = false;
  const timer =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
  const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;

  let url = initialUrl;
  const authHost = new URL(initialUrl).hostname;
  let handle = null;
  let declared = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers = {
        accept: 'application/x-gzip',
        'user-agent': 'dsh-skills-console',
      };
      // token 只发给最初那个 host；跨 host 重定向一律剥离，避免泄漏到 CDN/第三方。
      const currentHost = new URL(url).hostname;
      if (token && currentHost === authHost) headers.authorization = `Bearer ${token}`;

      let response;
      try {
        response = await fetchImpl(url, { headers, redirect: 'manual', signal });
      } catch (error) {
        if (timedOut) throw new RemoteError('timeout', `下载超时（${timeoutMs}ms）`, { cause: error });
        if (signal.aborted) throw new RemoteError('aborted', '下载已中止', { cause: error });
        throw new RemoteError('download-failed', `下载失败: ${error.message}`, { cause: error });
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location) throw new RemoteError('redirect-rejected', `HTTP ${response.status} 缺少 Location`);
        if (hop === MAX_REDIRECTS) {
          throw new RemoteError('redirect-rejected', `重定向超过 ${MAX_REDIRECTS} 次`);
        }
        const next = assertAllowedUrl(new URL(location, url).toString());
        // 跨 host 时不沿用上一跳的 Authorization：下一轮按新 host 重新决定。
        url = next.toString();
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new RemoteError('http-error', `HTTP ${response.status}: ${text.slice(0, 200)}`, {
          status: response.status,
        });
      }

      const lengthHeader = response.headers.get('content-length');
      declared = lengthHeader === null ? null : Number(lengthHeader);
      if (declared !== null && Number.isFinite(declared) && declared > maxBytes) {
        throw tooLarge(maxBytes, declared);
      }
      if (!response.body) throw new RemoteError('download-failed', '响应没有 body');

      handle = await fs.promises.open(dest, 'w');
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) throw tooLarge(maxBytes, bytes);
        let offset = 0;
        while (offset < chunk.byteLength) {
          const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
          offset += bytesWritten;
        }
      }
      if (bytes === 0) throw new RemoteError('download-failed', '响应为空');
      if (declared !== null && Number.isFinite(declared) && bytes !== declared) {
        throw new RemoteError('truncated-download', `下载不完整：声明 ${declared} 字节，实际 ${bytes} 字节`);
      }
      await handle.close();
      handle = null;
      return { file: dest, bytes, url };
    }
    // 循环正常结束只可能是重定向用尽，上面的 hop 判断已抛错。
    throw new RemoteError('redirect-rejected', '重定向次数过多');
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.unlink(dest).catch(() => {});
    if (error instanceof RemoteError) throw error;
    if (timedOut) throw new RemoteError('timeout', `下载超时（${timeoutMs}ms）`, { cause: error });
    throw new RemoteError('download-failed', `下载失败: ${error.message}`, { cause: error });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- 订阅候选的 SKILL.md（AI 介绍用） -------------------------------------
// 只读单个文件、只允许 raw.githubusercontent.com；按 commit 读取，避免分支移动导致内容漂移。

export const REMOTE_SKILL_MD_MAX_BYTES = 512 * 1024;
export const REMOTE_SKILL_MD_TIMEOUT_MS = 20_000;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

/** 技能文件路径校验：快照里的 skillPath 也不盲信，逐段拒绝越界与特殊字符。 */
function assertSkillFilePath(skillPath) {
  if (typeof skillPath !== 'string' || skillPath.length === 0 || skillPath.length > 400) {
    throw new RemoteError('intro-source-failed', '技能路径非法');
  }
  if (skillPath.startsWith('/') || skillPath.includes('\\') || /^[A-Za-z]:/.test(skillPath)) {
    throw new RemoteError('intro-source-failed', `技能路径不是仓库内相对路径: ${skillPath}`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(skillPath)) {
    throw new RemoteError('intro-source-failed', '技能路径含控制字符');
  }
  const segments = skillPath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new RemoteError('intro-source-failed', `技能路径含非法段: ${skillPath}`);
  }
  return segments.map(encodeURIComponent).join('/');
}

/**
 * 读订阅快照里某个技能的 `SKILL.md`（用于按需生成能力介绍）。
 *
 * - `ref` 必须是快照里的 40 位 commit：订阅页的「介绍」要可复现，不能读会移动的分支；
 * - 只允许 GitHub 的 raw host，路径由服务端从快照反查后传入，不接受客户端拼路径；
 * - 大小 / 超时都有上限，超限抛 RemoteError，由 Service 转成 4xx/5xx。
 *
 * @returns {Promise<{ text: string, bytes: number, source: string, ref: string, skillPath: string }>}
 */
export async function fetchRemoteSkillMd({
  source,
  ref,
  skillPath,
  token = null,
  fetchImpl = fetch,
  maxBytes = REMOTE_SKILL_MD_MAX_BYTES,
  timeoutMs = REMOTE_SKILL_MD_TIMEOUT_MS,
}) {
  const parsed = parseSource(source);
  if (!parsed) throw new RemoteError('invalid-source', `不是 GitHub 来源: ${source}`);
  if (typeof ref !== 'string' || !COMMIT_SHA.test(ref)) {
    throw new RemoteError('invalid-ref', '订阅介绍必须按 40 位 commit 读取');
  }
  const repo = `${parsed.owner}/${parsed.repo}`;
  const relPath = assertSkillFilePath(skillPath);
  const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${ref.toLowerCase()}/${relPath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        'user-agent': 'dsh-skills-console',
        accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response?.ok) {
      throw new RemoteError(
        'intro-source-failed',
        `读不到 ${repo}@${ref.slice(0, 7)} 的 ${skillPath}（HTTP ${response?.status ?? '?'}）`,
        { status: response?.status ?? null },
      );
    }
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) {
      throw new RemoteError(
        'intro-source-too-large',
        `${repo}@${ref.slice(0, 7)} 的 ${skillPath} 太大（${bytes} 字节），无法作为介绍素材`,
        { bytes, maxBytes },
      );
    }
    if (!text.trim()) throw new RemoteError('intro-source-failed', `${repo} 的 ${skillPath} 是空文件`);
    return { text, bytes, source: repo, ref: ref.toLowerCase(), skillPath };
  } catch (error) {
    if (error instanceof RemoteError) throw error;
    if (controller.signal.aborted) {
      throw new RemoteError('intro-source-timeout', `读取 ${repo} 的 SKILL.md 超时（${timeoutMs}ms）`, { cause: error });
    }
    throw new RemoteError('intro-source-failed', `读取 ${repo} 的 SKILL.md 失败：${error?.message || '网络错误'}`, {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

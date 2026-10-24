import fs from 'node:fs';
import { parseSource } from './updates.js';

/**
 * codeload 下载通道。P0 只有 tarball 下载；P2 会在这里补 Atom commit feed 与限流兜底。
 *
 * 安全边界（与设计文档 §安全一致）：
 * - 只接受 HTTPS，只允许 GitHub 的 host；重定向手动跟随，跨 host 一律拒绝并剥离 Authorization。
 * - token 只进 header，绝不拼进 URL、错误消息或日志。
 * - 响应 `content-length` 与流式累计双重限额，超限立即中止并删掉半截文件。
 * - 默认 60s 超时；超时/中止都抛 RemoteError，不留下半写文件。
 */

export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
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

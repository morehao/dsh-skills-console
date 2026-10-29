import fs from 'node:fs';
import path from 'node:path';
import * as tar from 'tar';

/**
 * 安全解压 codeload tarball。分两遍：**先全量校验，再解压**。
 *
 * 为什么不在解压时用 filter 跳过坏条目：filter 返回 false 只是“不落盘”，进程仍然算成功，
 * 恶意归档会被静默忽略而不是拒绝。安装器需要 fail closed，所以先 list 一遍：
 * - 只接受普通文件与目录；symlink/hardlink/设备/FIFO/未知类型直接拒绝。
 * - 拒绝绝对路径、盘符、反斜杠、`.` / `..` / 空段。
 * - 整个归档必须只有一个顶层目录（codeload 的 `repo-ref/`），用 strip:1 剥掉。
 * - 文件数 ≤ maxFiles、解压总量 ≤ maxBytes；超限立即中止。
 *
 * 解压后再扫一遍目录，确认没有符号链接或特殊文件落盘（防御性复核）。
 * 所有失败抛 ArchiveError，调用方负责清理 staging。
 */

export const DEFAULT_MAX_FILES = 10_000;
export const DEFAULT_MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;

export class ArchiveError extends Error {
  code: string;
  [key: string]: any;
  constructor(code: string, message: string, extra: Record<string, any> = {}) {
    super(message);
    this.name = 'ArchiveError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function isGzipFile(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(2);
    const read = fs.readSync(fd, head, 0, 2, 0);
    return read === 2 && head[0] === 0x1f && head[1] === 0x8b;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 归一化并校验一个 tar 条目路径。返回 `{ value, segments }`：
 * - `value` 去掉末尾 `/` 后的 POSIX 路径；
 * - 根目录条目（`repo-ref/`）的 segments 为 `['repo-ref']`。
 */
function parseEntryPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ArchiveError('unsafe-entry', `条目路径为空或不是字符串: ${String(raw)}`);
  }
  if (raw.includes('\0')) throw new ArchiveError('unsafe-entry', '条目路径含 NUL');
  if (raw.includes('\\')) {
    throw new ArchiveError('unsafe-entry', `条目路径含反斜杠: ${JSON.stringify(raw)}`);
  }
  if (raw.startsWith('/')) throw new ArchiveError('unsafe-entry', `条目是绝对路径: ${raw}`);
  if (/^[A-Za-z]:/.test(raw)) throw new ArchiveError('unsafe-entry', `条目带盘符: ${raw}`);

  let value = raw;
  while (value.endsWith('/')) value = value.slice(0, -1);

  const segments = value.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new ArchiveError('unsafe-entry', `条目路径含非法段: ${JSON.stringify(raw)}`);
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(segment)) {
      throw new ArchiveError('unsafe-entry', `条目路径含控制字符: ${JSON.stringify(raw)}`);
    }
  }
  return { raw, value, segments };
}

/** 扫一遍 tar 头，全部合法才允许进入解压。 */
async function scanArchive({ tarball, gzip, maxFiles, maxBytes }) {
  let root: any = null;
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  let failure: any = null;
  const warnings: any[] = [];

  // 注意：tar 把 onReadEntry 里的异常当同步异常抛到事件循环，不会 reject list 的 Promise。
  // 所以这里先记下第一个校验错误，扫完再抛；有错误时后续条目直接跳过。
  const onReadEntry = (entry) => {
    if (failure) return;
    try {
      const pathInfo = parseEntryPath(entry.path);
      const [top] = pathInfo.segments;
      if (root === null) root = top;
      if (top !== root) {
        throw new ArchiveError('unsafe-entry', `归档里有多个顶层目录: ${root} / ${top}`);
      }

      if (pathInfo.value === root) {
        // 顶层目录本身；codeload 里它总是 Directory。
        if (entry.type !== 'Directory') {
          throw new ArchiveError('unsafe-entry', `顶层条目不是目录: ${entry.path}`);
        }
        dirs += 1;
        return;
      }

      if (entry.type === 'File') {
        if (!Number.isFinite(entry.size) || entry.size < 0) {
          throw new ArchiveError('invalid-archive', `条目 size 非法: ${entry.path}`);
        }
        files += 1;
        bytes += entry.size;
        if (files > maxFiles) {
          throw new ArchiveError('too-many-files', `文件数超过 ${maxFiles} 上限`, { maxFiles });
        }
        if (bytes > maxBytes) {
          throw new ArchiveError('archive-too-large', `解压总量超过 ${maxBytes} 字节上限`, {
            maxBytes,
            bytes,
          });
        }
        return;
      }

      if (entry.type === 'Directory') {
        dirs += 1;
        return;
      }

      throw new ArchiveError('unsafe-entry', `拒绝的条目类型 ${entry.type}: ${entry.path}`, {
        entryType: entry.type,
        entryPath: entry.path,
      });
    } catch (error) {
      failure = error;
    }
  };

  const onwarn = (code) => {
    // 校验和失败 / 无法识别的归档 / 解压比例异常都说明归档不完整或伪造。
    if (code === 'TAR_BAD_ARCHIVE' || code === 'TAR_ENTRY_INVALID' || code === 'TAR_ABORT') {
      warnings.push(code);
    }
  };

  try {
    await tar.list({ file: tarball, gzip, onReadEntry, onwarn });
  } catch (error) {
    if (failure) throw failure;
    throw new ArchiveError('invalid-archive', `不是合法的 tar 归档: ${error.message}`, { cause: error });
  }
  if (failure) throw failure;
  if (warnings.length > 0) {
    throw new ArchiveError('invalid-archive', `归档有损坏条目: ${warnings[0]}`, { warnings });
  }

  if (root === null) throw new ArchiveError('empty-archive', '归档里没有任何条目');
  if (files === 0) throw new ArchiveError('empty-archive', '归档里没有普通文件');
  return { root, files, dirs, bytes };
}

/** 解压后复核：不允许任何 symlink / 设备 / FIFO 落盘。 */
function verifyExtracted(dest) {
  let files = 0;
  let dirs = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        throw new ArchiveError('unsafe-entry', `解压后出现符号链接: ${full}`);
      }
      if (stat.isDirectory()) {
        dirs += 1;
        walk(full);
        continue;
      }
      if (stat.isFile()) {
        files += 1;
        continue;
      }
      throw new ArchiveError('unsafe-entry', `解压后出现特殊文件: ${full}`);
    }
  };
  walk(dest);
  return { files, dirs };
}

/**
 * 解压 tarball 到 `dest`。`dest` 必须是空目录或不存在（不存在会自动创建）。
 * 成功返回 `{ dir, root, files, dirs, bytes }`；失败抛 ArchiveError，由调用方清理。
 */
export interface ExtractTarballOptions {
  tarball?: string;
  dest?: string;
  maxFiles?: number;
  maxBytes?: number;
  gzip?: boolean;
}

export async function extractTarball({
  tarball,
  dest,
  maxFiles = DEFAULT_MAX_FILES,
  maxBytes = DEFAULT_MAX_EXTRACTED_BYTES,
  gzip,
}: ExtractTarballOptions = {}) {
  if (typeof tarball !== 'string' || typeof dest !== 'string') {
    throw new ArchiveError('invalid-argument', 'extractTarball 需要 tarball 与 dest 路径');
  }
  if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
    throw new ArchiveError('invalid-argument', 'maxFiles 必须是正整数');
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new ArchiveError('invalid-argument', 'maxBytes 必须是正数');
  }
  let stat;
  try {
    stat = fs.statSync(tarball);
  } catch (error) {
    throw new ArchiveError('invalid-archive', `tarball 不存在: ${tarball}`, { cause: error });
  }
  if (!stat.isFile()) throw new ArchiveError('invalid-archive', `tarball 不是文件: ${tarball}`);

  fs.mkdirSync(dest, { recursive: true });
  const destStat = fs.lstatSync(dest);
  if (destStat.isSymbolicLink() || !destStat.isDirectory()) {
    throw new ArchiveError('invalid-dest', `staging 必须是真实目录: ${dest}`);
  }
  if (fs.readdirSync(dest).length > 0) {
    throw new ArchiveError('dest-not-empty', `staging 目录必须为空: ${dest}`);
  }

  const compressed = gzip === undefined ? isGzipFile(tarball) : Boolean(gzip);
  const scanned = await scanArchive({ tarball, gzip: compressed, maxFiles, maxBytes });

  try {
    await tar.extract({
      file: tarball,
      cwd: dest,
      strip: 1,
      gzip: compressed,
      preservePaths: false,
    });
  } catch (error) {
    throw new ArchiveError('extract-failed', `解压失败: ${error.message}`, { cause: error });
  }

  const verified = verifyExtracted(dest);
  return {
    dir: dest,
    root: scanned.root,
    files: verified.files,
    dirs: verified.dirs,
    bytes: scanned.bytes,
  };
}

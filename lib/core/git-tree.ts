import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 本地计算 Git tree SHA（40 位），与 `git write-tree` / GitHub Trees API 的 `sha` 同一算法。
 *
 * 用途：native installer 落盘后算技能目录的 `skillFolderHash`，与旧 CLI lock 的 40 位基线对齐。
 * 语义边界（与 git 一致）：
 * - 文件 mode 只区分 `100644` / `100755`，目录 `40000`；不保留其他权限位。
 * - 目录名排序按 git 的 `base_name_compare`：目录视作名字末尾多一个 `/` 再按字节比较。
 * - 空目录不进 tree（git 根本不跟踪空目录），否则会与上游 tree SHA 对不上。
 * - symlink、hardlink、设备、FIFO 等无法用普通 blob/tree 表示的类型**直接拒绝**，
 *   绝不用内容 hash 冒充，避免写进 lock 的基线是猜的。
 *
 * 纯函数：只读传入目录，不写任何东西；失败抛 GitTreeError。
 */

export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const MODE_FILE = '100644';
const MODE_EXEC = '100755';
const MODE_DIR = '40000';

export class GitTreeError extends Error {
  code: string;
  [key: string]: any;
  constructor(code: string, message: string, extra: Record<string, any> = {}) {
    super(message);
    this.name = 'GitTreeError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function blobSha(content) {
  const header = Buffer.from(`blob ${content.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(content).digest();
}

function treeShaOf(payload) {
  const header = Buffer.from(`tree ${payload.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(payload).digest();
}

/** git 的 tree 排序：目录名末尾补 `/` 后按字节比较。 */
function compareEntries(left, right) {
  const a = Buffer.from(left.dir ? `${left.name}/` : left.name, 'utf8');
  const b = Buffer.from(right.dir ? `${right.name}/` : right.name, 'utf8');
  return Buffer.compare(a, b);
}

function modeOf(stat) {
  return (stat.mode & 0o111) !== 0 ? MODE_EXEC : MODE_FILE;
}

/**
 * 递归读取目录，返回 `{ sha: Buffer, empty: boolean }`。
 * `empty` 表示这个目录在 git 意义上是空的（没有文件，或只有空子目录）。
 */
function hashDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new GitTreeError('read-failed', `无法读取目录 ${dir}: ${error.message}`, { cause: error });
  }

  const items: any[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (error) {
      throw new GitTreeError('read-failed', `无法读取 ${full}: ${error.message}`, { cause: error });
    }

    if (stat.isSymbolicLink()) {
      throw new GitTreeError('unsupported-entry', `符号链接无法进 git tree: ${full}`, { path: full });
    }
    if (stat.isDirectory()) {
      const nested = hashDir(full);
      if (!nested.empty) items.push({ name: entry.name, dir: true, sha: nested.sha });
      continue;
    }
    if (stat.isFile()) {
      let content;
      try {
        content = fs.readFileSync(full);
      } catch (error) {
        throw new GitTreeError('read-failed', `无法读取 ${full}: ${error.message}`, { cause: error });
      }
      items.push({ name: entry.name, dir: false, mode: modeOf(stat), sha: blobSha(content) });
      continue;
    }
    // FIFO / socket / 块设备 / 字符设备：git 里都不是普通条目，直接拒绝。
    throw new GitTreeError('unsupported-entry', `不支持的文件类型，无法进 git tree: ${full}`, {
      path: full,
    });
  }

  items.sort(compareEntries);

  const chunks: any[] = [];
  for (const item of items) {
    chunks.push(Buffer.from(`${item.mode || MODE_DIR} ${item.name}\0`, 'utf8'), item.sha);
  }
  const payload = Buffer.concat(chunks);
  return { sha: treeShaOf(payload), empty: items.length === 0 };
}

const SHA_HEX_RE = /^[0-9a-f]{40}$/i;

/** GitHub 树条目的 mode → git tree 里的 mode。目录统一 `40000`，gitlink 为 `160000`。 */
function normalizeEntryMode(entry) {
  if (entry.type === 'tree') return MODE_DIR;
  if (entry.type === 'commit') return '160000';
  const mode = String(entry.mode || '');
  if (mode === '100755' || mode === '120000' || mode === '100644') return mode;
  // GitHub 对普通文件报 `100644`；缺失/未知时按普通文件处理，与本地 hashDir 一致。
  return MODE_FILE;
}

/**
 * 由**扁平条目表**重建目录 tree SHA（40 位小写 hex）。
 *
 * 场景：GitHub 的 `GET /git/trees/{ref}?recursive=1` 只给一张扁平列表
 * （每个条目带 `path` / `type` / `mode` / `sha`），并且**传分支或 commit 作为 ref 时，
 * 响应顶层的 `sha` 是 commit SHA，不是根 tree SHA**。要拿到真正的根 tree SHA，
 * 既不能信顶层 `sha`，也不值得为它多发一次请求 —— 直接按 git 的算法把列表重建成树即可。
 *
 * 与 `gitTreeSha` 同一套语义（mode 只分 100644/100755、git 的目录名排序、空目录不进树）；
 * 区别只是数据来自 API 条目而不是磁盘。
 *
 * @param {Array<{path:string,type:string,mode?:string,sha:string}>} entries
 * @returns {string} 根 tree SHA
 */
export function treeShaFromEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new GitTreeError('invalid-entries', 'treeShaFromEntries 需要条目数组');
  }
  // dir → 直接子条目（dir 为空串代表仓库根）
  const childrenOf = new Map<string, any[]>();
  const allDirs = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || entry.path.length === 0) continue;
    if (entry.type === 'tree') allDirs.add(entry.path);
    const parts = entry.path.split('/');
    for (let index = 1; index < parts.length; index += 1) allDirs.add(parts.slice(0, index).join('/'));
    const slash = entry.path.lastIndexOf('/');
    const dir = slash < 0 ? '' : entry.path.slice(0, slash);
    const name = slash < 0 ? entry.path : entry.path.slice(slash + 1);
    if (!name) continue;
    if (!childrenOf.has(dir)) childrenOf.set(dir, []);
    childrenOf.get(dir)!.push({ name, entry });
  }
  // 递归树正常会给每个目录条目，但不能依赖它：缺失时按路径把目录补回去，
  // 否则父 tree 会漏掉整个子目录，根 SHA 就错了。
  for (const dir of [...allDirs].sort()) {
    if (!dir) continue;
    const slash = dir.lastIndexOf('/');
    const parent = slash < 0 ? '' : dir.slice(0, slash);
    const name = slash < 0 ? dir : dir.slice(slash + 1);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    if (!childrenOf.get(parent)!.some((child) => child.name === name)) {
      childrenOf.get(parent)!.push({ name, entry: { path: dir, type: 'tree' } });
    }
  }

  const cache = new Map<string, string>();
  const dirSha = (dir: string): string => {
    if (cache.has(dir)) return cache.get(dir)!;
    const items: any[] = [];
    for (const { name, entry } of childrenOf.get(dir) || []) {
      if (entry.type === 'tree') {
        items.push({ name, dir: true, mode: MODE_DIR, sha: Buffer.from(dirSha(entry.path), 'hex') });
        continue;
      }
      const sha = String(entry.sha || '');
      if (!SHA_HEX_RE.test(sha)) {
        throw new GitTreeError('invalid-entry', `条目 ${entry.path} 的 sha 不是 40 位 hex: ${sha}`, {
          path: entry.path,
        });
      }
      items.push({ name, dir: false, mode: normalizeEntryMode(entry), sha: Buffer.from(sha, 'hex') });
    }
    items.sort(compareEntries);
    const chunks: any[] = [];
    for (const item of items) {
      chunks.push(Buffer.from(`${item.mode} ${item.name}\0`, 'utf8'), item.sha);
    }
    const sha = treeShaOf(Buffer.concat(chunks)).toString('hex');
    cache.set(dir, sha);
    return sha;
  };

  return dirSha('');
}

/**
 * 计算目录的 Git tree SHA（40 位小写 hex）。
 * 目录不存在 / 不可读 / 含不可表示条目时抛 GitTreeError，调用方不得写 lock。
 */
export function gitTreeSha(dir) {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new GitTreeError('invalid-path', 'gitTreeSha 需要非空目录路径');
  }
  let stat;
  try {
    stat = fs.lstatSync(dir);
  } catch (error) {
    throw new GitTreeError('read-failed', `目录不存在或不可读 ${dir}: ${error.message}`, { cause: error });
  }
  if (stat.isSymbolicLink()) {
    throw new GitTreeError('unsupported-entry', `技能目录本身是符号链接: ${dir}`, { path: dir });
  }
  if (!stat.isDirectory()) {
    throw new GitTreeError('invalid-path', `不是目录: ${dir}`);
  }
  return hashDir(dir).sha.toString('hex');
}

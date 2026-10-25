import fs from 'node:fs';
import path from 'node:path';

import { isInside } from './paths.js';

/**
 * 技能正文/文件的只读读取层：只做文件系统，不依赖 service，避免循环引用。
 *
 * 安全边界（与 AGENTS.md「不接收任意路径」一致）：
 * - 根只从 canonical 反查：`<canonical>/<name>/` 或 `<canonical>/<name>.md`，不接受外部路径；
 * - 相对路径逐段校验，拒绝绝对路径 / 盘符 / 反斜杠 / NUL / `..`；
 * - lexic 包含判断 + realpath 包含判断双保险，符号链接一律不跟随（`lstat` + `O_NOFOLLOW` + `fstat`）；
 * - 只读：本模块从不写 canonical / lock。
 *
 * 错误一律抛 SkillFileError，由 Service 包成 ServiceError（HTTP 400）。
 */

/** 单文件读取上限：超出只读前 256KB，并置 `truncated`。 */
export const MAX_FILE_BYTES = 256 * 1024;
/** 文件树条目上限，超过置 `truncated`。 */
export const MAX_TREE_ENTRIES = 500;
/** 文件树递归深度上限。 */
export const MAX_TREE_DEPTH = 8;
/** 相对路径长度上限。 */
export const MAX_REL_PATH = 300;
/** 二进制嗅探窗口：前 8KB 出现 NUL 即视为二进制。 */
const SNIFF_BYTES = 8 * 1024;

/** 可预览的文本扩展名（小写比较）。 */
export const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.mjs', '.js', '.ts', '.sh', '.py', '.toml', '.csv',
]);

/** 文件树里永不进入的目录名。 */
const SKIP_DIRS = new Set(['node_modules', '.git']);

export class SkillFileError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'SkillFileError';
    this.code = code;
    this.detail = detail ?? null;
  }
}

function badPath(message, detail) {
  return new SkillFileError('error.skills.bad-path', message, detail);
}

async function lstatOrNull(target) {
  try {
    return await fs.promises.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw new SkillFileError('error.skills.file-unreadable', `无法读取 ${target}`, error?.code || null);
  }
}

/**
 * 相对路径归一化：只接受技能根内的 POSIX 相对路径。
 * `allowEmpty` 用于「默认读 SKILL.md」。
 */
export function normalizeRelPath(relPath, { allowEmpty = false } = {}) {
  if (relPath === undefined || relPath === null) {
    if (allowEmpty) return '';
    throw badPath('缺少文件路径');
  }
  if (typeof relPath !== 'string') throw badPath('文件路径必须是字符串');
  if (relPath.length === 0) {
    if (allowEmpty) return '';
    throw badPath('文件路径不能为空');
  }
  if (relPath.length > MAX_REL_PATH) throw badPath('文件路径过长');
  if (relPath.includes('\u0000')) throw badPath('文件路径不能包含 NUL');
  if (relPath.includes('\\')) throw badPath('文件路径不能包含反斜杠');
  if (/^[A-Za-z]:/.test(relPath)) throw badPath('不接受绝对路径');
  if (path.posix.isAbsolute(relPath)) throw badPath('不接受绝对路径');

  const segments = relPath.split('/');
  if (segments.some((segment) => segment === '..')) throw badPath('文件路径不能越出技能目录');

  // 归一化后再检查一次：`a//b`、`./a` 之类的变体归一后仍必须留在根内
  const normalized = path.posix.normalize(relPath);
  if (normalized === '.') return allowEmpty ? '' : badPath('文件路径不能为空');
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw badPath('文件路径不能越出技能目录');
  }
  if (normalized.split('/').includes('..')) throw badPath('文件路径不能越出技能目录');
  return normalized;
}

/**
 * 反查技能根：目录包（`<canonical>/<name>/`）或平铺（`<canonical>/<name>.md`）。
 * 根自身是符号链接时直接拒绝（v1 不跟随根链）；两种形态都不存在 → not-found。
 */
export async function resolveSkillRoot(paths, name) {
  const canonical = path.resolve(paths.canonical);
  const dirPath = path.join(canonical, name);
  const filePath = path.join(canonical, `${name}.md`);

  const dirStat = await lstatOrNull(dirPath);
  if (dirStat) {
    if (dirStat.isSymbolicLink()) throw badPath(`${name} 在 canonical 里是符号链接，拒绝读取`);
    if (dirStat.isDirectory()) {
      return { name, kind: 'dir', root: dirPath, body: 'SKILL.md', canonical };
    }
  }

  const fileStat = await lstatOrNull(filePath);
  if (fileStat) {
    if (fileStat.isSymbolicLink()) throw badPath(`${name}.md 是符号链接，拒绝读取`);
    if (fileStat.isFile()) {
      return { name, kind: 'file', root: filePath, body: path.basename(filePath), canonical };
    }
  }

  throw new SkillFileError('error.skills.not-found', `${name} 不在 canonical 里`);
}

/** 把相对路径解析成受控的绝对路径；lexic 检查通过后再用 realpath 复核。 */
async function resolveInside(root, relPath) {
  const target = path.resolve(root, relPath);
  if (!isInside(root, target)) throw badPath('文件路径越出技能目录', { relPath });
  // realpath 复核：中间层目录可能是符号链接，lexic 判断看不出越界
  let realRoot;
  let realTarget;
  try {
    realRoot = await fs.promises.realpath(root);
    realTarget = await fs.promises.realpath(target);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new SkillFileError('error.skills.file-not-found', `${relPath} 不存在`);
    if (error?.code === 'ELOOP') throw badPath('文件路径经过符号链接，拒绝读取');
    throw new SkillFileError('error.skills.file-unreadable', `无法读取 ${relPath}`, error?.code || null);
  }
  if (!isInside(realRoot, realTarget)) throw badPath('文件路径越出技能目录', { relPath });
  return target;
}

function assertTextExtension(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new SkillFileError('error.skills.binary', `${relPath} 不在可预览的文本类型里`, { ext: ext || null });
  }
}

function assertNotBinary(buffer, relPath) {
  const window = buffer.subarray(0, Math.min(buffer.length, SNIFF_BYTES));
  if (window.includes(0)) {
    throw new SkillFileError('error.skills.binary', `${relPath} 看起来是二进制文件`);
  }
}

/**
 * 读单个文件。返回 `{ relPath, path, content, size, truncated, mtime }`，`size` 是真实大小。
 * 平铺技能只允许读它自己那一个文件。
 */
export async function readSkillFile({ root, kind = 'dir', relPath }) {
  const relative = normalizeRelPath(relPath, { allowEmpty: true });
  let target;
  let effective;

  if (kind === 'file') {
    const base = path.basename(root);
    if (relative !== '' && relative !== base) {
      throw badPath('平铺技能只有一个文件', { relPath: relative });
    }
    effective = base;
    target = root;
  } else {
    effective = relative === '' ? 'SKILL.md' : relative;
    try {
      target = await resolveInside(root, effective);
    } catch (error) {
      // 目录包缺 SKILL.md 是最常见的状态，单独给一个码，前端据此提示「DSH 读不到这个技能」
      if (error?.code === 'error.skills.file-not-found' && effective === 'SKILL.md') {
        throw new SkillFileError('error.skills.no-skill-md', '这个技能目录里没有 SKILL.md');
      }
      throw error;
    }
  }

  assertTextExtension(effective);

  const stat = await lstatOrNull(target);
  if (!stat) {
    if (kind === 'dir' && effective === 'SKILL.md') {
      throw new SkillFileError('error.skills.no-skill-md', '这个技能目录里没有 SKILL.md');
    }
    throw new SkillFileError('error.skills.file-not-found', `${effective} 不存在`);
  }
  if (stat.isSymbolicLink()) throw badPath(`${effective} 是符号链接，拒绝读取`);
  if (!stat.isFile()) throw new SkillFileError('error.skills.not-a-file', `${effective} 不是普通文件`);

  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  let handle;
  try {
    handle = await fs.promises.open(target, flags);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new SkillFileError('error.skills.file-not-found', `${effective} 不存在`);
    if (error?.code === 'ELOOP') throw badPath(`${effective} 是符号链接，拒绝读取`);
    if (error?.code === 'EISDIR') throw new SkillFileError('error.skills.not-a-file', `${effective} 不是普通文件`);
    throw new SkillFileError('error.skills.file-unreadable', `无法读取 ${effective}`, error?.code || null);
  }

  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new SkillFileError('error.skills.not-a-file', `${effective} 不是普通文件`);
    const size = opened.size;
    const truncated = size > MAX_FILE_BYTES;
    const length = Math.min(size, MAX_FILE_BYTES);
    const buffer = Buffer.alloc(length);
    if (length > 0) await handle.read(buffer, 0, length, 0);
    assertNotBinary(buffer, effective);
    const decoded = buffer.toString('utf8');
    return {
      relPath: effective,
      path: target,
      content: decoded.startsWith('\uFEFF') ? decoded.slice(1) : decoded,
      size,
      truncated,
      mtime: opened.mtime.toISOString(),
    };
  } finally {
    await handle.close().catch(() => {});
  }
}

/**
 * 列技能目录的文件树：递归、深度 ≤ 8、条目 ≤ 500。
 * 跳过符号链接、点文件、`node_modules`、`.git`；目录在前、文件在后，各自按名称排序。
 * 平铺技能返回单文件树。
 */
export async function readSkillTree({ root, kind = 'dir' }) {
  if (kind === 'file') {
    const stat = await lstatOrNull(root);
    if (!stat) throw new SkillFileError('error.skills.file-not-found', `${path.basename(root)} 不存在`);
    if (stat.isSymbolicLink()) throw badPath(`${path.basename(root)} 是符号链接，拒绝读取`);
    const name = path.basename(root);
    const size = stat.size;
    return {
      root,
      kind: 'file',
      body: name,
      hasSkillMd: true,
      files: [{ path: name, kind: 'file', size }],
      totalBytes: size,
      truncated: false,
    };
  }

  const files = [];
  let totalBytes = 0;
  let truncated = false;

  async function walk(dir, prefix, depth) {
    if (truncated) return;
    if (depth > MAX_TREE_DEPTH) {
      truncated = true;
      return;
    }
    let dirents;
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = [];
    const plain = [];
    for (const dirent of dirents) {
      const name = dirent.name;
      if (!name || name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      if (dirent.isSymbolicLink()) continue;
      if (dirent.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        dirs.push({ name, rel });
        continue;
      }
      if (!dirent.isFile()) continue;
      plain.push({ name, rel });
    }
    dirs.sort((left, right) => left.name.localeCompare(right.name));
    plain.sort((left, right) => left.name.localeCompare(right.name));

    // 目录在前、文件在后：目录条目也占用上限名额，先占位再递归
    for (const entry of dirs) {
      if (files.length >= MAX_TREE_ENTRIES) {
        truncated = true;
        return;
      }
      files.push({ path: entry.rel, kind: 'dir' });
      await walk(path.join(dir, entry.name), entry.rel, depth + 1);
      if (truncated) return;
    }

    for (const entry of plain) {
      if (files.length >= MAX_TREE_ENTRIES) {
        truncated = true;
        return;
      }
      let size = 0;
      try {
        const stat = await fs.promises.lstat(path.join(dir, entry.name));
        if (!stat.isFile()) continue;
        size = stat.size;
      } catch {
        continue;
      }
      totalBytes += size;
      files.push({ path: entry.rel, kind: 'file', size });
    }
  }

  await walk(root, '', 0);

  const hasSkillMd = files.some((entry) => entry.kind === 'file' && entry.path === 'SKILL.md');
  return {
    root,
    kind: 'dir',
    body: hasSkillMd ? 'SKILL.md' : null,
    hasSkillMd,
    files,
    totalBytes,
    truncated,
  };
}

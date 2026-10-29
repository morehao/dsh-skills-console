import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * 同步原子整文件替换（`open('wx') → write → fsync → rename → fsync dir`）。
 *
 * 说明：DSH 提供 `@deepseek-ai/dsh-atomic-write` 的 `writeFileAtomic`，但它是
 * `fs/promises` 异步 API；插件的状态/锁是同步热路径（`StateStore.save` 被大量同步
 * 调用），无法直接 await。为消除本仓原先 4 份各写各的（fsync 有的有、有的没有）
 * 的重复实现，这里收敛为**唯一**一份同步实现，语义对齐 DSH：写前 fsync、rename
 * 后对父目录 fsync（POSIX），并在 Windows 对瞬时 rename 错误做有界重试。
 *
 * @param {string} file 目标文件绝对/相对路径
 * @param {string} content 完整新内容
 * @param {{ mode?: number }} [options] 目标权限位；省略时沿用已有文件权限，新文件用 0o644
 */
export interface WriteFileAtomicOptions { mode?: number }

export function writeFileAtomicSync(file: string, content: string, options: WriteFileAtomicOptions = {}): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const mode = options.mode ?? existingMode(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`);
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, 'wx', mode);
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    renameWithRetrySync(tmp, file);
    fsyncDirSync(dir);
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw error;
  }
}

function existingMode(file: string): number {
  try {
    return fs.statSync(file).mode & 0o777;
  } catch {
    return 0o644;
  }
}

const WINDOWS_TRANSIENT_RENAME = new Set(['EACCES', 'EBUSY', 'EPERM']);
const RENAME_RETRY_DELAYS_MS = [20, 40, 80, 160, 200, 200, 200, 200];

/** Windows 上 rename 可能被占用进程短暂阻塞，做有界重试（POSIX 一次成功）。 */
function renameWithRetrySync(from: string, to: string): void {
  if (process.platform !== 'win32') {
    fs.renameSync(from, to);
    return;
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (!code || !WINDOWS_TRANSIENT_RENAME.has(code) || attempt >= RENAME_RETRY_DELAYS_MS.length) throw error;
      sleepSync(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** fsync 目录项（POSIX）；Windows 不支持打开目录句柄，跳过。 */
function fsyncDirSync(dir: string): void {
  if (process.platform === 'win32') return;
  try {
    const dirFd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch {
    /* 个别平台不支持目录 fsync；rename 已完成 */
  }
}

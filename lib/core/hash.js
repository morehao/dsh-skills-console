import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

function collectFiles(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (entry.isFile()) out.push(full);
    // 符号链接 / 设备文件不计入：与 CLI 的 collectFiles 只收普通文件一致（F6）
  }
  return out;
}

/**
 * 逐字复刻 skills CLI 的内容哈希（F6）：
 * 只收普通文件 → 跳过 `.git` / `node_modules` → 相对路径 `/` 归一 → localeCompare 排序
 * → 先 update(路径) 再 update(内容) → sha256。
 *
 * 用途只有一个：进 L1「本地有没有被改过」的基线，绝不与上游 tree SHA 混用。
 */
export function contentHash(dir) {
  const files = collectFiles(dir, []).map((file) =>
    path.relative(dir, file).split(path.sep).join('/'),
  );
  files.sort((a, b) => a.localeCompare(b));
  const hash = crypto.createHash('sha256');
  for (const rel of files) {
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(dir, rel)));
  }
  return hash.digest('hex');
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

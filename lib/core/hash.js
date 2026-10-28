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
 * 排序口径：UTF-16 code unit 序（等价 `Array#sort()` 默认序），**与进程 locale 无关**。
 *
 * 绝不能用 `localeCompare`：它按默认 locale 的 collation 比较，同一个目录在不同
 * LANG / ICU 版本下会排出不同顺序，同一份内容就能算出两个哈希。真实案例：
 * `script.md` 与 `什么是token.html` 在 en 下 script 在前、在 zh 下汉字在前，
 * 于是「安装时 en、读时 zh」的技能被误报成「本地已改」。
 */
export function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 旧口径（v0.6.x 之前）：进程 / 显式 locale 的 collation。
 * 只用于识别历史基线（`matchesLegacyHash`），不得用于写新基线。
 */
export function localeComparator(locale) {
  return (a, b) => a.localeCompare(b, locale);
}

/**
 * 目录内容哈希（F6）：
 * 只收普通文件 → 跳过 `.git` / `node_modules` → 相对路径 `/` 归一 → code unit 排序
 * → 先 update(路径) 再 update(内容) → sha256。
 *
 * 用途只有一个：进 L1「本地有没有被改过」的基线，绝不与上游 tree SHA 混用。
 */
export function contentHash(dir) {
  return contentHashWith(dir);
}

/**
 * 同 `contentHash`，但允许按相对路径改写文件内容后再参与哈希。
 * `transform(rel, buffer)` 返回 Buffer；返回 `null` 表示无法归一化（调用方保守处理）。
 * 用于「仅手动」：把插件写入的 frontmatter 行按 state 还原后再与基线比较。
 * `compare` 只给历史基线识别用，正常路径保持默认的 locale 无关排序。
 */
export function contentHashWith(dir, transform = null, compare = comparePaths) {
  const files = collectFiles(dir, []).map((file) =>
    path.relative(dir, file).split(path.sep).join('/'),
  );
  files.sort(compare);
  const hash = crypto.createHash('sha256');
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(dir, rel));
    const buffer = transform ? transform(rel, raw) : raw;
    if (buffer === null) return null;
    hash.update(rel);
    hash.update(buffer);
  }
  return hash.digest('hex');
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

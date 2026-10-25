import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { contentHashWith } from './hash.js';

/**
 * 「自动 / 仅手动 / 完全停用」的落盘层。
 *
 * - 仅手动：只改 canonical `SKILL.md` 的 frontmatter，插入 / 替换 / 移除
 *   `disable-model-invocation` 一行；保留 BOM、CRLF、注释与其它字段。
 * - 完全停用：A′ park —— `SKILL.md` → `SKILL.md.disabled`，目录里留
 *   `.dsh-skills-console.park.json`；内容一个字节都不改，恢复就是改名回来。
 * - 归一化哈希：把插件写入的那一行（或改回 `false`）从 `SKILL.md` 里去掉再算目录哈希，
 *   这样 manual 不会被误判成「本地有改动」，和更新计划的基线对得上。
 *
 * 这里不碰 state / 路由：文件事务与回滚由调用方（service）编排。
 */

export const INVOCATION_KEY = 'disable-model-invocation';
export const PARK_MARKER = '.dsh-skills-console.park.json';
export const PARK_DISABLED = 'SKILL.md.disabled';
export const PARK_BY = 'dsh-skills-console';
export const PARK_VERSION = 1;
export const PARK_KEEP = 5;

const TOP_KEY = /^([A-Za-z0-9_-]+)\s*:/;

export class InvocationError extends Error {
  constructor(code, message, detail = null, status = 400) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

function unsupported(message, detail = null) {
  return new InvocationError('error.skills.unsupported', message, detail, 400);
}

function notWritable(message, detail = null) {
  return new InvocationError('error.skills.not-writable', message, detail, 409);
}

function drift(message, detail = null) {
  return new InvocationError('error.skills.drift', message, detail, 409);
}

function splitLines(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const crlf = body.includes('\r\n');
  const eol = crlf ? '\r\n' : '\n';
  return { bom, eol, lines: body.split(eol) };
}

function splitValue(raw) {
  let quote = null;
  let commentAt = -1;
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index];
    if (quote) {
      if (ch === quote && raw[index - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (index === 0 || /\s/.test(raw[index - 1]))) {
      commentAt = index;
      break;
    }
  }
  return {
    raw: (commentAt >= 0 ? raw.slice(0, commentAt) : raw).trim(),
    comment: commentAt >= 0 ? raw.slice(commentAt).trimEnd() : '',
  };
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function valueKind(raw) {
  const { raw: value } = splitValue(raw);
  if (value === '') return 'empty';
  const plain = unquote(value);
  if (plain === 'true' || plain === 'True' || plain === 'TRUE') return 'true';
  if (plain === 'false' || plain === 'False' || plain === 'FALSE') return 'false';
  return 'other';
}

function renderLine(line, kind) {
  const colon = line.indexOf(':');
  const { comment } = splitValue(line.slice(colon + 1));
  return `${line.slice(0, colon + 1)} ${kind}${comment ? ` ${comment}` : ''}`;
}

function checkFrontmatter(lines) {
  if (lines.length === 0 || lines[0].trim() !== '---') {
    throw unsupported('SKILL.md 没有 frontmatter', { reason: 'no-frontmatter' });
  }
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      closing = index;
      break;
    }
  }
  if (closing < 0) throw unsupported('SKILL.md 的 frontmatter 没有闭合的 ---', { reason: 'no-closing' });
  return closing;
}

/**
 * 解析 SKILL.md 的 frontmatter 结构（不做 YAML 全量解析）。
 * 返回 `keyIndex` / `value`（'true' | 'false' | 'other' | 'absent'）。
 */
export function parseInvocation(text) {
  const { bom, eol, lines } = splitLines(String(text ?? ''));
  const closing = checkFrontmatter(lines);
  const hits = [];
  for (let index = 1; index < closing; index += 1) {
    const line = lines[index];
    if (!line || /^\s/.test(line)) continue;
    const match = TOP_KEY.exec(line);
    if (!match || match[1] !== INVOCATION_KEY) continue;
    hits.push(index);
  }
  if (hits.length > 1) {
    throw unsupported(`SKILL.md 里有重复的 ${INVOCATION_KEY}`, { reason: 'duplicate-key' });
  }
  const keyIndex = hits.length === 1 ? hits[0] : -1;
  return {
    bom,
    eol,
    lines,
    closing,
    keyIndex,
    value: keyIndex < 0 ? 'absent' : valueKind(lines[keyIndex].slice(lines[keyIndex].indexOf(':') + 1)),
    keyLine: keyIndex < 0 ? null : lines[keyIndex],
  };
}

function descriptionBlockEnd(lines, start, closing) {
  let index = start;
  while (index + 1 < closing) {
    const next = lines[index + 1];
    if (next === '' || /^\s/.test(next)) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function insertIndexFor(parsed) {
  const { lines, closing } = parsed;
  const descriptions = [];
  for (let index = 1; index < closing; index += 1) {
    const line = lines[index];
    if (!line || /^\s/.test(line)) continue;
    const match = TOP_KEY.exec(line);
    if (match && match[1] === 'description') descriptions.push(index);
  }
  if (descriptions.length === 0) return closing;
  const description = descriptions[0];
  const raw = lines[description].slice(lines[description].indexOf(':') + 1);
  const { raw: value } = splitValue(raw);
  if (/^[|>][+-]?$/.test(value)) return descriptionBlockEnd(lines, description, closing) + 1;
  return description + 1;
}

function join(parsed, lines) {
  return `${parsed.bom ? '\uFEFF' : ''}${lines.join(parsed.eol)}`;
}

/**
 * 写「仅手动」的计划。返回 `{ changed, author, original, nextText }`：
 * - 已有 true：作者声明，不写（author=true，original='true'）；
 * - 已有 false：替换成 true，original='false'；
 * - 不存在：在 description 之后插入，original='absent'。
 */
export function planManualWrite(text) {
  const parsed = parseInvocation(text);
  if (parsed.value === 'true') {
    return { changed: false, author: true, original: 'true', nextText: text };
  }
  if (parsed.value === 'false') {
    const lines = [...parsed.lines];
    lines[parsed.keyIndex] = renderLine(lines[parsed.keyIndex], 'true');
    return { changed: true, author: false, original: 'false', nextText: join(parsed, lines) };
  }
  if (parsed.value !== 'absent') {
    throw unsupported(`SKILL.md 的 ${INVOCATION_KEY} 不是布尔值`, { reason: 'non-boolean' });
  }
  const lines = [...parsed.lines];
  const at = insertIndexFor(parsed);
  lines.splice(at, 0, `${INVOCATION_KEY}: true`);
  return { changed: true, author: false, original: 'absent', nextText: join(parsed, lines) };
}

/**
 * 写「自动」的恢复计划。`original` 来自 state：
 * - absent：移除插件插入的行；
 * - false：把 true 改回 false；
 * - 当前值不是 true / 行被删掉 / 重复 key：抛 drift，由调用方把 origin 标成 author 并报告；
 * - origin='author'：调用方在进来之前就该拒绝。
 */
export function planManualRestore(text, original) {
  const parsed = parseInvocation(text);
  if (original === 'true') {
    throw new InvocationError(
      'error.skills.author',
      '这个技能由作者声明了仅手动，插件不能替你改回自动；请编辑 SKILL.md',
      { reason: 'author' },
      409,
    );
  }
  if (parsed.value === 'absent') {
    if (original === 'absent') return { changed: false, nextText: text };
    throw drift('SKILL.md 里的标记已被外部移除，状态与文件不一致', { reason: 'missing' });
  }
  if (parsed.value !== 'true') {
    throw drift('SKILL.md 里的标记被改过，可能出自作者；请先检查文件', {
      reason: 'value-changed',
      value: parsed.value,
    });
  }
  const lines = [...parsed.lines];
  if (original === 'absent') {
    lines.splice(parsed.keyIndex, 1);
  } else {
    lines[parsed.keyIndex] = renderLine(lines[parsed.keyIndex], 'false');
  }
  return { changed: true, nextText: join(parsed, lines) };
}

/** 只读一份 SKILL.md；文件不存在/读不到抛 not-writable，由 service 转成 409。 */
export function readSkillText(skillDir) {
  const file = path.join(skillDir, 'SKILL.md');
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw notWritable(`${file} 不存在`);
  }
  if (stat.isSymbolicLink()) throw notWritable('SKILL.md 是符号链接，拒绝编辑', { reason: 'symlink' });
  if (!stat.isFile()) throw notWritable('SKILL.md 不是普通文件', { reason: 'not-file' });
  return fs.readFileSync(file, 'utf8');
}

/** 原子写：同目录临时文件 → fsync → rename；保留原文件权限。 */
export function writeFileAtomic(file, content) {
  const dir = path.dirname(file);
  const stat = fs.statSync(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w', stat.mode & 0o777);
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
    try {
      const dirFd = fs.openSync(dir, 'r');
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch {
      /* 目录 fsync 在部分平台不可用；rename 已完成 */
    }
  } catch (error) {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw notWritable(`写 SKILL.md 失败：${error.message}`, { reason: 'write-failed' });
  }
}

function safeName(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
}

/**
 * 写前备份到插件备份目录（与安装备份分开放，避免把更新备份挤出保留窗口）。
 * 每个技能最多留 PARK_KEEP 份。
 */
export function backupInvocation({ backupDir, name, content }) {
  const dir = path.join(backupDir, 'invocation');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${safeName(name)}-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
  const file = path.join(dir, `${key}.md`);
  const at = new Date().toISOString();
  fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(`${file}.json`, `${JSON.stringify({ key, name, file, at }, null, 2)}\n`, 'utf8');
  try {
    const keep = fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith('.md') && entry.startsWith(`${safeName(name)}-`))
      .sort()
      .reverse();
    for (const stale of keep.slice(PARK_KEEP)) {
      fs.rmSync(path.join(dir, stale), { force: true });
      fs.rmSync(path.join(dir, `${stale}.json`), { force: true });
    }
  } catch {
    /* 清理失败不影响主流程 */
  }
  return { key, file, at };
}

function isRealDir(dir) {
  try {
    const stat = fs.lstatSync(dir);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isRegularFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sameBytes(a, b) {
  try {
    return sha256File(a) === sha256File(b);
  } catch {
    return false;
  }
}

function fsyncDir(dir) {
  try {
    const fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch {
    /* 部分平台不支持目录 fsync */
  }
}

function writeJsonAtomic(file, value) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, file);
    fsyncDir(dir);
  } catch (error) {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/** 读 park marker；只认本插件写的、结构完整的。 */
export function readParkMarker(skillDir) {
  const file = path.join(skillDir, PARK_MARKER);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || parsed.by !== PARK_BY || parsed.version !== PARK_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function inspectPark(skillDir) {
  const marker = readParkMarker(skillDir);
  const hasSkill = isRegularFile(path.join(skillDir, 'SKILL.md'));
  const hasDisabled = isRegularFile(path.join(skillDir, PARK_DISABLED));
  // marker 在、文件没改名（崩在 rename 前）：实际仍是可用状态，不算 parked；
  // 反过来说，disabled 在就算 parked，即使 marker 被外部删了也能恢复。
  return { parked: Boolean(hasDisabled || (marker && !hasSkill)), marker, hasSkill, hasDisabled, dir: skillDir };
}

/**
 * A′ park：marker-first。先把 marker 落盘，再 rename SKILL.md。
 * 崩在 rename 前：marker + SKILL.md（启动按「未 park」收敛）；
 * 崩在 rename 后：marker + disabled（正常 parked）。
 * 内容哈希在写 marker 之前算，恢复后用它核对内容没被改过。
 */
export function parkSkill({ dir, name, previousMode = 'auto' }) {
  if (!isRealDir(dir)) throw notWritable('只有真实目录型技能可以完全停用', { reason: 'not-dir' });
  const skillFile = path.join(dir, 'SKILL.md');
  const disabledFile = path.join(dir, PARK_DISABLED);
  if (!isRegularFile(skillFile)) {
    if (isRegularFile(disabledFile)) return { already: true, marker: readParkMarker(dir) };
    throw notWritable('canonical 里没有 SKILL.md，无法完全停用', { reason: 'no-skill-file' });
  }
  if (isRegularFile(disabledFile)) {
    throw new InvocationError(
      'error.skills.park-conflict',
      '目录里已经有一个 SKILL.md.disabled；请先处理它再完全停用',
      { reason: 'disabled-exists' },
      409,
    );
  }
  const existing = readParkMarker(dir);
  if (existing) throw new InvocationError('error.skills.park-conflict', '这个技能已经有停用标记', { reason: 'marker-exists' }, 409);

  const canonicalHash = contentHashWith(dir);
  const marker = {
    by: PARK_BY,
    version: PARK_VERSION,
    name,
    disabledFile: PARK_DISABLED,
    previousMode: previousMode === 'manual' ? 'manual' : 'auto',
    canonicalHash,
    at: new Date().toISOString(),
  };
  writeJsonAtomic(path.join(dir, PARK_MARKER), marker);
  try {
    fs.renameSync(skillFile, disabledFile);
    fsyncDir(dir);
  } catch (error) {
    try {
      fs.rmSync(path.join(dir, PARK_MARKER), { force: true });
    } catch {
      /* ignore */
    }
    throw notWritable(`停用失败：${error.message}`, { reason: 'rename-failed' });
  }
  return { marker, canonicalHash };
}

/**
 * A′ unpark。允许 state 丢失（marker 仍在）时 best-effort 恢复；`fallbackMode`
 * 由调用方按 state 提供。
 *
 * 半状态：
 * - 两份都在且内容相同 → 删 disabled，收敛；
 * - 两份都在且内容不同 → 默认 409；`keep='current'` 保留当前 SKILL.md，
 *   `keep='parked'` 把当前另存为 SKILL.md.conflict-* 后恢复 parked 版本。
 */
export function unparkSkill({ dir, name, fallbackMode = 'auto', keep = null }) {
  if (!isRealDir(dir)) throw notWritable('只有真实目录型技能可以恢复', { reason: 'not-dir' });
  const skillFile = path.join(dir, 'SKILL.md');
  const disabledFile = path.join(dir, PARK_DISABLED);
  const markerFile = path.join(dir, PARK_MARKER);
  const marker = readParkMarker(dir);
  const hasSkill = isRegularFile(skillFile);
  const hasDisabled = isRegularFile(disabledFile);
  if (!hasSkill && !hasDisabled) {
    throw new InvocationError(
      'error.skills.park-broken',
      'SKILL.md 和 SKILL.md.disabled 都不在；内容可能已被删除，无法恢复',
      { name, reason: 'both-missing' },
      409,
    );
  }

  let kept = null;
  let removed = null;
  if (hasSkill && hasDisabled) {
    if (sameBytes(skillFile, disabledFile)) {
      fs.rmSync(disabledFile, { force: true });
      removed = 'duplicate-disabled';
    } else if (keep === 'current') {
      const conflict = path.join(dir, `${PARK_DISABLED}.conflict-${Date.now()}`);
      fs.renameSync(disabledFile, conflict);
      kept = conflict;
      removed = 'parked-copy';
    } else if (keep === 'parked') {
      const conflict = path.join(dir, `SKILL.md.conflict-${Date.now()}`);
      fs.renameSync(skillFile, conflict);
      fs.renameSync(disabledFile, skillFile);
      kept = conflict;
      removed = 'current-copy';
    } else {
      throw new InvocationError(
        'error.skills.park-conflict',
        '停用期间外部又写回了 SKILL.md，两份内容不同；请选择保留当前文件还是停用前的版本',
        { reason: 'both-present', current: sha256File(skillFile), parked: sha256File(disabledFile) },
        409,
      );
    }
  } else if (hasDisabled) {
    fs.renameSync(disabledFile, skillFile);
  } else {
    // 只有 SKILL.md：可能外部已经手动恢复，或崩在 rename 前；清掉 marker 收敛。
    removed = 'marker-stale';
  }
  fs.rmSync(markerFile, { force: true });
  fsyncDir(dir);

  let hashMismatch = false;
  if (marker?.canonicalHash) {
    const current = contentHashWith(dir);
    hashMismatch = current !== null && current !== marker.canonicalHash;
  }
  const previousMode = (marker?.previousMode === 'manual' || marker?.previousMode === 'auto')
    ? marker.previousMode
    : fallbackMode;
  return {
    name,
    mode: previousMode === 'manual' ? 'manual' : 'auto',
    previousMode,
    hashMismatch,
    kept,
    removed,
    marker,
  };
}

/**
 * 归一化哈希：把插件写入的 `disable-model-invocation: true` 按 state 还原后再算目录哈希。
 * 只有 origin='plugin' 才归一化；author 声明属于上游内容，必须原样计入。
 * 解析失败 / 当前值不是 true 时返回 null —— 调用方保守判为「本地有改动」。
 */
export function hashWithoutInvocation(dir, manual) {
  if (!manual || manual.origin !== 'plugin') return contentHashWith(dir);
  const expected = manual.original;
  if (expected !== 'absent' && expected !== 'false') return null;
  return contentHashWith(dir, (relative, buffer) => {
    if (relative !== 'SKILL.md') return buffer;
    let parsed;
    try {
      parsed = parseInvocation(buffer.toString('utf8'));
    } catch {
      return null;
    }
    if (parsed.value !== 'true') return null;
    const lines = [...parsed.lines];
    if (expected === 'absent') lines.splice(parsed.keyIndex, 1);
    else lines[parsed.keyIndex] = renderLine(lines[parsed.keyIndex], 'false');
    return Buffer.from(join(parsed, lines), 'utf8');
  });
}

/** 供 Host 层判断「这行到底是不是被 park 了」，不读 state。 */
export function parkedName(skillDir) {
  const marker = readParkMarker(skillDir);
  const disabled = isRegularFile(path.join(skillDir, PARK_DISABLED));
  if (marker) return { parked: true, marker, recorded: true };
  if (disabled) return { parked: true, marker: null, recorded: false };
  return { parked: false, marker: null, recorded: false };
}

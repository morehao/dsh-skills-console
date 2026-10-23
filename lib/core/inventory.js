import fs from 'node:fs';
import path from 'node:path';
import { contentHash } from './hash.js';
import { inspectTarget } from './links.js';

/**
 * CLI 全局 lock（v3）。读不到、版本不认识、结构损坏都返回空账 ——
 * CLI 自己也会在 `version` 缺失或过低时丢弃整个文件（:3755/:3761-3771），这里保持一致。
 */
export function readLock(paths) {
  let raw;
  try {
    raw = fs.readFileSync(paths.lockFile, 'utf8');
  } catch {
    return { present: false, version: null, skills: {}, problem: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
      return { present: true, version: null, skills: {}, problem: 'lock.version missing' };
    }
    if (parsed.version < 3) {
      return { present: true, version: parsed.version, skills: {}, problem: `lock.version ${parsed.version} too old` };
    }
    const skills = parsed.skills && typeof parsed.skills === 'object' ? parsed.skills : {};
    return { present: true, version: parsed.version, skills, problem: null };
  } catch (error) {
    return { present: true, version: null, skills: {}, problem: `lock not JSON: ${error.message}` };
  }
}

/** canonical 扫描：`<name>/SKILL.md` 目录包，或 `<name>.md` 平铺（原生刻意不支持嵌套）。 */
export function scanCanonical(paths) {
  const dir = paths.canonical;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {
        out.push({ name: entry.name, path: full, kind: 'broken', hasSkillFile: false });
        continue;
      }
    }
    if (isDir) {
      const hasSkill = fs.existsSync(path.join(full, 'SKILL.md'));
      out.push({ name: entry.name, path: full, kind: 'dir', hasSkillFile: hasSkill });
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push({ name: entry.name.slice(0, -3), path: full, kind: 'file', hasSkillFile: true });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function readFrontmatterDescription(skillPath) {
  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const line = match[1].split('\n').find((item) => item.trim().startsWith('description:'));
    if (!line) return null;
    return line.slice(line.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '') || null;
  } catch {
    return null;
  }
}

function statusOf({ install, check, locallyModified, brokenLinks }) {
  if (!install) return 'unmanaged';
  if (locallyModified && check?.status === 'update-available') return 'conflict';
  if (locallyModified) return 'locally-modified';
  if (check?.status === 'upstream-deleted') return 'upstream-deleted';
  if (check?.status === 'update-available') return 'update-available';
  if (brokenLinks.length > 0) return 'broken-link';
  if (check?.status === 'current') return 'current';
  return 'unknown';
}

/**
 * 右栏账本：canonical + installs + links。左栏（模型可见）由调用方从 `ctx.skills.snapshot` 取。
 * 两侧差异本身就是诊断数据，不做自动修复。
 */
export function buildLedger({ paths, state, registry, lock, visibleNames = new Map() }) {
  const scanned = scanCanonical(paths);
  const targets = registry.detected();
  const installs = new Map(state.installs.map((item) => [item.name, item]));

  const rows = scanned.map((entry) => {
    const install = installs.get(entry.name);
    const lockEntry = lock.skills?.[entry.name] || null;
    const recordLinks = state.links.filter((link) => link.skill === entry.name);

    // 期望接入矩阵：已有记录 + 各探测目录的现场状态
    const links = [];
    for (const target of targets) {
      const linkPath = path.join(target.dir, entry.name);
      const live = inspectTarget({ linkPath, canonicalPath: entry.path });
      if (live.state === 'absent') continue;
      const recorded = recordLinks.find((link) => link.target === target.target);
      const stateName =
        live.state === 'managed-external' && recorded ? 'managed' : live.state;
      links.push({
        target: target.target,
        label: target.label,
        linkPath,
        state: stateName,
        recorded: Boolean(recorded),
        broken: Boolean(live.broken),
      });
    }

    const brokenLinks = links.filter((link) => link.broken);
    let currentHash = null;
    let locallyModified = false;
    if (install && entry.kind === 'dir') {
      currentHash = contentHash(entry.path);
      locallyModified = Boolean(install.installedHash) && currentHash !== install.installedHash;
    }

    const check = state.checks?.[entry.name] || null;
    const visibleSource = visibleNames.get(entry.name);
    return {
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      hasSkillFile: entry.hasSkillFile,
      description: entry.hasSkillFile
        ? readFrontmatterDescription(entry.kind === 'file' ? entry.path : path.join(entry.path, 'SKILL.md'))
        : null,
      managed: Boolean(install),
      subscriptionId: install?.subscriptionId ?? null,
      source: lockEntry?.source ?? install?.source ?? null,
      sourceUrl: lockEntry?.sourceUrl ?? null,
      sourceType: lockEntry?.sourceType ?? null,
      ref: lockEntry?.ref ?? install?.ref ?? null,
      skillPath: lockEntry?.skillPath ?? install?.skillPath ?? null,
      commit: install?.commit ?? null,
      lockHash: lockEntry?.skillFolderHash ?? null,
      installedHash: install?.installedHash ?? null,
      currentHash,
      installedAt: install?.installedAt ?? null,
      updatedAt: install?.updatedAt ?? null,
      mode: install?.mode ?? 'on',
      scopeProjects: install?.scopeProjects ?? [],
      backup: install?.backup ?? null,
      links,
      brokenLinks: brokenLinks.length,
      status: statusOf({ install, check, locallyModified, brokenLinks }),
      check,
      visible: visibleNames.has(entry.name),
      visibleSource: visibleSource ?? null,
      note: entry.kind === 'broken' ? 'canonical 里是一个悬空链接' : entry.hasSkillFile ? null : '缺少 SKILL.md，DSH 无法解析',
    };
  });

  // 左栏有、右栏无：别人装的 / 别的 root 里的
  const visibleOnly = [];
  for (const [name, source] of visibleNames.entries()) {
    if (rows.some((row) => row.name === name)) continue;
    visibleOnly.push({ name, source });
  }

  return { rows, visibleOnly, scannedAt: new Date().toISOString() };
}

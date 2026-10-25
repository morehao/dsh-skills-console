import fs from 'node:fs';
import path from 'node:path';
import { contentHash } from './hash.js';
import { agentPresence } from './exporter.js';

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

function statusOf({ install, check, locallyModified, brokenExports, subscribed }) {
  if (!install) return 'unmanaged';
  if (locallyModified && check?.status === 'update-available') return 'conflict';
  if (locallyModified) return 'locally-modified';
  if (check?.status === 'upstream-deleted') return 'upstream-deleted';
  if (check?.status === 'update-available') return 'update-available';
  if (brokenExports.length > 0) return 'broken-link';
  if (check?.status === 'current') return 'current';
  // 没有可用的上游订阅 = 永远拿不到更新结论（检查更新只覆盖有订阅的技能）。
  // 这跟「这次没判定出来」是两件事，混进 unknown 会让待检查计数永远降不下来。
  if (!subscribed) return 'no-upstream';
  return 'unknown';
}

/**
 * 右栏账本：canonical + installs + exports + shadows。
 * 左栏（模型可见）由 `visibility.js` 扫根得出，两侧差异就是诊断数据，不做自动修复。
 */
export function buildLedger({ paths, state, registry, lock, visibility, now = new Date().toISOString() }) {
  const scanned = scanCanonical(paths);
  const installs = new Map(state.installs.map((item) => [item.name, item]));
  const subscriptions = new Set((state.subscriptions || []).map((item) => item.id));
  const shadowPaths = new Set((state.shadows || []).map((item) => item.stubPath));
  void shadowPaths;
  const exportsBySkill = new Map();
  for (const row of state.exports || []) {
    const list = exportsBySkill.get(row.skill);
    if (list) list.push(row);
    else exportsBySkill.set(row.skill, [row]);
  }
  const shadowsBySkill = new Map();
  for (const row of state.shadows || []) {
    const list = shadowsBySkill.get(row.skill);
    if (list) list.push(row);
    else shadowsBySkill.set(row.skill, [row]);
  }

  const rows = scanned.map((entry) => {
    const install = installs.get(entry.name);
    const lockEntry = lock.skills?.[entry.name] || null;
    const recordExports = exportsBySkill.get(entry.name) || [];
    const presence = agentPresence({ paths, registry, name: entry.name });
    const presenceByTarget = new Map(presence.map((item) => [item.target, item]));

    // 导出矩阵：账本里的记录 + 各 agent 目录的现场状态（没记账但有链也算「现场有」）
    const exportsRows = [];
    for (const item of presence) {
      const recorded = recordExports.find((row) => row.target === item.target) || null;
      const live = item.shared ? 'shared' : item.state;
      // 只列「现场真的存在」的导出；账上有、磁盘上没有的那类漂移交给 diagnostics.drift
      if (live === 'absent') continue;
      exportsRows.push({
        target: item.target,
        label: item.label,
        dir: item.dir,
        linkPath: item.linkPath,
        state: recorded && live === 'managed-external' ? 'managed' : live,
        recorded: Boolean(recorded),
        shared: item.shared,
        broken: Boolean(item.broken),
      });
    }

    const brokenExports = exportsRows.filter((item) => item.broken);
    let currentHash = null;
    let locallyModified = false;
    if (install && entry.kind === 'dir') {
      currentHash = contentHash(entry.path);
      locallyModified = Boolean(install.installedHash) && currentHash !== install.installedHash;
    }

    const check = state.checks?.[entry.name] || null;
    const visible = visibility?.byName?.get(entry.name) || null;
    const subscribed = Boolean(install?.subscriptionId) && subscriptions.has(install.subscriptionId);
    const shadows = shadowsBySkill.get(entry.name) || [];
    const enabled = install ? install.enabled !== false : true;
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
      enabled,
      /** @deprecated v2 起用 `enabled`；留着只为一份 minor 内的缓存客户端不白屏 */
      mode: enabled ? 'on' : 'off',
      exports: exportsRows,
      brokenExports: brokenExports.length,
      shadows,
      status: statusOf({ install, check, locallyModified, brokenExports, subscribed }),
      check,
      visible: Boolean(visible?.visible),
      visibleSource: visible?.winnerSource ?? null,
      visibility: {
        dsh: Boolean(visible?.visible),
        shadowed: Boolean(visible?.shadowed),
        winnerSource: visible?.winnerSource ?? null,
        sources: visible?.sources ?? {},
        // user 级标记（400）盖不住项目自带副本（100/200）：这条差异必须让 UI 说得出来
        shadowScopeMismatch: Boolean(
          visible?.visible &&
            shadows.some((item) => item.scope === 'user') &&
            String(visible?.winnerSource || '').startsWith('project-'),
        ),
      },
      note: entry.kind === 'broken'
        ? 'canonical 里是一个悬空链接'
        : entry.hasSkillFile
          ? null
          : '缺少 SKILL.md，DSH 无法解析',
      scannedAt: now,
    };
  });

  // 左栏有、右栏无：别人装的 / 别的 root 里的
  const visibleOnly = [];
  for (const [name, item] of visibility?.byName || []) {
    if (!item.visible) continue;
    if (rows.some((row) => row.name === name)) continue;
    visibleOnly.push({ name, source: item.winnerSource, path: item.path, hostOnly: item.hostOnly });
  }

  return { rows, visibleOnly, scannedAt: now };
}

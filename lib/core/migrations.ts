import fs from 'node:fs';
import path from 'node:path';
import { removeLink } from './links.js';
import { reapShadowLeftovers, removeShadow } from './shadow.js';

/**
 * 状态迁移的**文件侧**执行。结构改写已经在 `state.upgradeStateV1` / `upgradeStateV2`
 * 做完并落盘，这里只按 migration / legacyShadows 做幂等收尾：
 *
 * 1. v1 遗留：删掉历史上为了「提升 rank」而建的 DSH 侧链接，剪掉悬空导出记录；
 *    **不再补建停用桩**（v0.4.0 起启停是 policy provider 的事）。
 * 2. v2→v3：逐条清理 `legacyShadows[]` 里的旧停用桩。删不掉（foreign / link / locked）
 *    的保留并写原因；`orphan` 不删（删了会让原本隐藏的技能突然可见）；`project:*`
 *    只清理桩，不转成全局停用。
 * 3. 写 manifest（`v1-to-v3-*` / `v2-to-v3-*`，planned → done），7 天后清理。
 *
 * 不做的事：不删外来链、不删真实目录、不动 canonical、不动 v3 lock。
 */

const MANIFEST_VERSION = 2;
const BACKUP_KEEP_DAYS = 7;

/** orphan 与「删失败」的行会留在 legacyShadows，等用户手动处理或启用时再清。 */
function manifestName(migration, now) {
  const prefix = migration?.from === 1 ? 'v1-to-v3' : 'v2-to-v3';
  return `${prefix}-${now.replace(/[:.]/g, '-')}.json`;
}

function writeManifest(paths, file, payload) {
  try {
    fs.mkdirSync(paths.migrationsDir, { recursive: true });
    fs.writeFileSync(path.join(paths.migrationsDir, file), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return path.join(paths.migrationsDir, file);
  } catch {
    return null;
  }
}

function isMigrationManifest(name) {
  return name.startsWith('v1-to-') || name.startsWith('v2-to-');
}

/** 清理过期的迁移清单（默认 7 天）。state-v<n> 的原始状态副本不在清理范围内。 */
export function pruneMigrationBackups({ paths, now = Date.now() }) {
  let entries;
  try {
    entries = fs.readdirSync(paths.migrationsDir);
  } catch {
    return [];
  }
  const removed: any[] = [];
  for (const name of entries) {
    if (!isMigrationManifest(name)) continue;
    const file = path.join(paths.migrationsDir, name);
    try {
      const stat = fs.statSync(file);
      if (now - stat.mtimeMs > BACKUP_KEEP_DAYS * 24 * 3600 * 1000) {
        fs.rmSync(file, { force: true });
        removed.push(name);
      }
    } catch {
      /* 忽略 */
    }
  }
  return removed;
}

/** 旧桩删除结果 → legacyShadows 里保留的原因。 */
function keepReason(outcome) {
  if (!outcome) return 'locked';
  if (outcome.reason === 'not-managed') return 'foreign';
  if (outcome.reason === 'absent') return 'absent';
  return outcome.reason || 'locked';
}

/**
 * 执行（或继续执行）迁移。返回 `{ ok, migrated, report }`。
 * 任何一步失败都不回滚已完成的步骤——每一步本身是幂等的，下次启动接着做。
 */
export function ensureMigrated({ paths, store, logger = () => {} }: any) {
  const migration = store.state.migration;
  if (!migration || migration.status === 'done') return { ok: true, migrated: false };
  if (store.readOnly) return { ok: false, migrated: false, reason: 'state-readonly' };

  const now = new Date().toISOString();
  const report: any = {
    version: MANIFEST_VERSION,
    at: now,
    from: migration.from ?? 2,
    to: 3,
    phase: 'planned',
    linksRemoved: [],
    linksKept: [],
    exportsPruned: [],
    legacyScopeProjectsDropped: [],
    legacyShadowsRemoved: [],
    legacyShadowsKept: [],
    legacyShadowsOrphans: [],
  };
  const manifest = manifestName(migration, now);
  writeManifest(paths, manifest, report);

  // ① v1 遗留：删历史 DSH 侧链接：只删「指向 canonical 的同名链」，外来链/真实目录一律放过
  for (const link of migration.legacyLinks || []) {
    if (!link || typeof link.linkPath !== 'string') continue;
    const canonicalPath = path.join(paths.canonical, link.skill);
    const result = removeLink({ linkPath: link.linkPath, canonicalPath, force: false });
    if (result.removed) report.linksRemoved.push(link.linkPath);
    else report.linksKept.push({ linkPath: link.linkPath, skill: link.skill, reason: result.reason });
  }

  // ② 剪悬空导出记录：磁盘上没有这条链，就不要留在账上
  const aliveExports: any[] = [];
  for (const row of store.state.exports || []) {
    if (row.linkPath && fs.existsSync(row.linkPath)) aliveExports.push(row);
    else report.exportsPruned.push(row.linkPath || `${row.target}:${row.skill}`);
  }

  // ③ v1 遗留的 legacyScopeProjects 只记账后丢弃：项目级启停已移除（设计 §4.4.1）
  const installs = (store.state.installs || []).map((install) => {
    const next = { ...install };
    if (Array.isArray(next.legacyScopeProjects) && next.legacyScopeProjects.length > 0) {
      report.legacyScopeProjectsDropped.push({ name: next.name, roots: [...next.legacyScopeProjects] });
    }
    delete next.legacyScopeProjects;
    return next;
  });

  // ④ v2→v3：清理旧停用桩（成功就消失，失败/orphan 留在 legacyShadows）
  const legacyShadows: any[] = [];
  for (const row of store.state.legacyShadows || []) {
    if (row.reason === 'orphan') {
      legacyShadows.push(row);
      report.legacyShadowsOrphans.push({ skill: row.skill, stubPath: row.stubPath });
      continue;
    }
    const outcome = removeShadow({ stubPath: row.stubPath, name: row.skill });
    if (outcome.removed || outcome.reason === 'absent') {
      report.legacyShadowsRemoved.push({ skill: row.skill, stubPath: row.stubPath, via: outcome.reason || 'removed' });
      continue;
    }
    const kept = { ...row, reason: keepReason(outcome) };
    legacyShadows.push(kept);
    report.legacyShadowsKept.push({ skill: row.skill, stubPath: row.stubPath, reason: kept.reason });
    logger('migration.legacy-shadow.kept', { skill: row.skill, stubPath: row.stubPath, reason: kept.reason });
  }

  (store as any).update((draft: any) => {
    draft.installs = installs;
    draft.exports = aliveExports;
    draft.legacyShadows = legacyShadows;
    draft.migration = {
      ...(draft.migration || {}),
      from: migration.from ?? 2,
      to: 3,
      status: 'done',
      completedAt: now,
    };
  });

  report.phase = 'done';
  report.completedAt = now;
  writeManifest(paths, manifest, report);
  pruneMigrationBackups({ paths });
  // 以前中断留下的 `.shadow-*` 残骸，顺手清掉
  reapShadowLeftovers(paths.dshGlobalSkills);
  logger('state.migrated', {
    from: report.from,
    linksRemoved: report.linksRemoved.length,
    linksKept: report.linksKept.length,
    exports: aliveExports.length,
    exportsPruned: report.exportsPruned.length,
    legacyShadowsRemoved: report.legacyShadowsRemoved.length,
    legacyShadowsKept: report.legacyShadowsKept.length,
    legacyShadowsOrphans: report.legacyShadowsOrphans.length,
  });
  return { ok: true, migrated: true, report };
}

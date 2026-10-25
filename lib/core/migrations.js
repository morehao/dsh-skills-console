import fs from 'node:fs';
import path from 'node:path';
import { removeLink } from './links.js';
import { createShadow, inspectShadow, reapShadowLeftovers } from './shadow.js';
import { projectSkillsDir } from './paths.js';

/**
 * v1 → v2 的**文件侧**迁移。结构改写已经在 `state.upgradeStateV1` 做完并落盘，
 * 这里只按 manifest 做三件事，全部幂等：
 *
 * 1. 删掉历史上为了「提升 rank」而建的 DSH 侧链接（`dsh-global` / 项目链）；
 * 2. 剪掉指向已不存在 agent 目录的导出记录（账本向磁盘看齐）；
 * 3. 给 `enabled: false` 的技能补建停用标记（fail-open：建不出来就改回启用并记录）。
 *
 * 不做的事：不删外来链、不删真实目录、不动 canonical、不动 v3 lock。
 */

const MANIFEST_VERSION = 1;
const BACKUP_KEEP_DAYS = 7;

function manifestName(now) {
  return `v1-to-v2-${now.replace(/[:.]/g, '-')}.json`;
}

function writeManifest(paths, now, payload) {
  try {
    fs.mkdirSync(paths.migrationsDir, { recursive: true });
    const file = path.join(paths.migrationsDir, manifestName(now));
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return file;
  } catch {
    return null;
  }
}

/** 清理过期的迁移备份（默认 7 天）。 */
export function pruneMigrationBackups({ paths, now = Date.now() }) {
  let entries;
  try {
    entries = fs.readdirSync(paths.migrationsDir);
  } catch {
    return [];
  }
  const removed = [];
  for (const name of entries) {
    if (!name.startsWith('v1-to-v2-')) continue;
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

/**
 * 执行（或继续执行）迁移。返回 `{ ok, migrated, report }`。
 * 任何一步失败都不回滚已完成的步骤——每一步本身是幂等的，下次启动接着做。
 */
export function ensureMigrated({ paths, store, logger = () => {} }) {
  const migration = store.state.migration;
  if (!migration || migration.status === 'done') return { ok: true, migrated: false };
  if (store.readOnly) return { ok: false, migrated: false, reason: 'state-readonly' };

  const now = new Date().toISOString();
  const report = {
    version: MANIFEST_VERSION,
    at: now,
    from: migration.from ?? 1,
    to: 2,
    phase: 'planned',
    linksRemoved: [],
    linksKept: [],
    exportsPruned: [],
    shadowsCreated: [],
    shadowFailures: [],
    legacyScopeProjectsDropped: [],
  };

  writeManifest(paths, now, report);

  // ① 删历史 DSH 侧链接：只删「指向 canonical 的同名链」，外来链/真实目录一律放过
  for (const link of migration.legacyLinks || []) {
    if (!link || typeof link.linkPath !== 'string') continue;
    const canonicalPath = path.join(paths.canonical, link.skill);
    const result = removeLink({ linkPath: link.linkPath, canonicalPath, force: false });
    if (result.removed) report.linksRemoved.push(link.linkPath);
    else report.linksKept.push({ linkPath: link.linkPath, skill: link.skill, reason: result.reason });
  }

  // ② 剪悬空导出记录：磁盘上没有这条链，就不要留在账上
  const aliveExports = [];
  for (const row of store.state.exports || []) {
    if (row.linkPath && fs.existsSync(row.linkPath)) aliveExports.push(row);
    else report.exportsPruned.push(row.linkPath || `${row.target}:${row.skill}`);
  }

  // ③ 停用态补建标记（含 v1 的项目作用范围）
  const shadows = [];
  const remaining = [];
  for (const install of store.state.installs || []) {
    const next = { ...install };
    const legacyRoots = Array.isArray(next.legacyScopeProjects) ? [...next.legacyScopeProjects] : [];
    if (legacyRoots.length > 0) {
      report.legacyScopeProjectsDropped.push({ name: next.name, roots: legacyRoots });
      delete next.legacyScopeProjects;
    }
    if (next.enabled === false) {
      // v1 的「仅项目安装」等价物：项目根里的标记。先建更具体的，再建 user 级。
      for (const root of legacyRoots) {
        if (typeof root !== 'string' || !path.isAbsolute(root)) continue;
        if (!fs.existsSync(path.join(root, '.git'))) {
          report.shadowFailures.push({ name: next.name, scope: `project:${root}`, reason: 'not-a-project-root' });
          continue;
        }
        const built = materializeShadow({
          paths,
          stubPath: projectShadowPath(root, next.name),
          name: next.name,
          scope: `project:${root}`,
          canonicalPath: path.join(paths.canonical, next.name),
          report,
          logger,
        });
        if (built) shadows.push(built);
      }
      const stubPath = path.join(paths.dshGlobalSkills, next.name);
      const built = materializeShadow({ paths, stubPath, name: next.name, scope: 'user', canonicalPath: path.join(paths.canonical, next.name), report, logger });
      if (built) {
        shadows.push(built);
      } else {
        // fail-open：建不出标记就改回启用，绝不留「界面说停用、模型照样看见」
        next.enabled = true;
        report.shadowFailures.push({ name: next.name, scope: 'user' });
      }
    }
    remaining.push(next);
  }

  store.update((draft) => {
    draft.installs = remaining;
    draft.exports = aliveExports;
    draft.shadows = shadows;
    draft.migration = { ...(draft.migration || {}), status: 'done', completedAt: now };
  });

  report.phase = 'done';
  report.completedAt = now;
  writeManifest(paths, now, report);
  pruneMigrationBackups({ paths });
  // 以前中断留下的 `.shadow-*` 残骸，顺手清掉
  reapShadowLeftovers(paths.dshGlobalSkills);
  logger('state.migrated', {
    linksRemoved: report.linksRemoved.length,
    linksKept: report.linksKept.length,
    exports: aliveExports.length,
    exportsPruned: report.exportsPruned.length,
    shadows: shadows.length,
    shadowFailures: report.shadowFailures.length,
  });
  return { ok: true, migrated: true, report };
}

/** 建一个停用标记；已存在占位物时按类型处理（链先摘，别的就报冲突）。 */
function materializeShadow({ paths, stubPath, name, scope, canonicalPath, report, logger }) {
  const current = inspectShadow(stubPath, name);
  if (current.state === 'ours') return { skill: name, scope, stubPath, createdAt: new Date().toISOString(), canonicalHash: null };
  if (current.state === 'link') {
    const removed = removeLink({ linkPath: stubPath, canonicalPath, force: false });
    if (!removed.removed) {
      logger('migration.shadow.link-kept', { name, reason: removed.reason });
      return null;
    }
  } else if (current.state !== 'absent') {
    logger('migration.shadow.conflict', { name, state: current.state, reason: current.reason || null });
    return null;
  }
  try {
    const created = createShadow({ stubPath, name, scope, canonicalHash: null });
    report.shadowsCreated.push(stubPath);
    return { skill: name, scope, stubPath, createdAt: new Date().toISOString(), canonicalHash: null, created: created.created };
  } catch (error) {
    logger('migration.shadow.failed', { name, message: error.message });
    return null;
  }
}

/** 项目级停用标记的路径（迁移与运行时共用）。 */
export function projectShadowPath(projectRoot, name) {
  return path.join(projectSkillsDir(projectRoot), name);
}

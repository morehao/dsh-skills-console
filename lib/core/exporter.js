import fs from 'node:fs';
import path from 'node:path';
import { ensureLink, inspectTarget, removeLink } from './links.js';

/**
 * 导出（export）= 把 canonical 里的技能显式暴露给**不读共享根**的其他 agent。
 *
 * 与 v1 的「接入/链接」的区别只有三条，但每条都改变行为：
 * - 默认不导出任何 agent（`settings.exportTargets` 默认 `[]`）；
 * - DSH 自己的扫描根不参与导出（`~/.dsh/skills` 是停用桩的位置，不是可见性通道）；
 * - 只有「建链真的成功/已受管」才记账；删链失败不清账。
 */

/** 建链失败的统一形状：由调用方决定是 400 还是只记 warning。 */
function failure(target, reason, extra = {}) {
  return { target, reason, ...extra };
}

/**
 * 逐 agent 导出。`record` 只在本次真的存在一条指向 canonical 的链时被调用
 * （新建的、或此前已受管但没记账的「接管」场景），避免账本里出现不存在的链。
 */
export function exportSkills({ paths, registry, name, targets = [], record = () => {} }) {
  const canonicalPath = path.join(paths.canonical, name);
  const result = { created: [], skipped: [], failed: [] };
  if (!fs.existsSync(canonicalPath)) {
    result.failed.push(failure('*', 'not-installed'));
    return result;
  }

  const seen = new Set();
  for (const target of targets) {
    if (!target || seen.has(target)) continue;
    seen.add(target);

    let resolved;
    try {
      resolved = registry.resolve(target);
    } catch {
      result.failed.push(failure(target, 'unknown-target'));
      continue;
    }
    // 导出资格由注册表统一算好（扫描根 / 共享根 / 共享 home 三种原因），
    // 这里不再按 kind 判断身份 —— 以后宿主多一个扫描根，只需要改 roots 一张表。
    if (resolved.exportBlocked) {
      result.skipped.push({ target, reason: resolved.exportBlocked });
      continue;
    }
    if (!resolved.exists) {
      result.failed.push(failure(target, 'target-missing', { dir: resolved.dir }));
      continue;
    }

    const linkPath = path.join(resolved.dir, name);
    const outcome = ensureLink({ linkPath, canonicalPath });
    if (outcome.created) {
      result.created.push({ target, linkPath, mode: outcome.mode || 'relative' });
      record({ target, agentDir: resolved.dir, linkPath, mode: outcome.mode || 'relative', created: true });
      continue;
    }
    if (outcome.state === 'managed' || outcome.state === 'managed-external') {
      result.skipped.push({ target, reason: outcome.state, linkPath });
      record({ target, agentDir: resolved.dir, linkPath, mode: outcome.mode || 'relative', created: false });
      continue;
    }
    result.skipped.push({ target, reason: outcome.state, linkPath });
  }
  return result;
}

/**
 * 摘掉一条导出链。默认只摘「指向 canonical」的；`allowDangling` 用于 canonical
 * 已经不在时回收自家悬空链——此时用链名兜底，绝不按 `force` 整片删。
 */
export function unexportSkill({ linkPath, canonicalPath, name, allowDangling = false }) {
  if (!linkPath) return { removed: false, reason: 'no-path' };
  const direct = removeLink({ linkPath, canonicalPath, force: false });
  if (direct.removed) return { removed: true, linkPath };
  if (direct.reason !== 'not-managed' || !canonicalPath) return { ...direct, linkPath };

  if (!allowDangling) return { ...direct, linkPath };
  const dangling = isOurDanglingLink(linkPath, name);
  if (!dangling) return { removed: false, reason: 'not-managed', linkPath };
  const forced = removeLink({ linkPath, canonicalPath, force: true });
  return { ...forced, linkPath, dangling: true };
}

/** 链还在、但目标已经不存在，且链名对得上 —— 只在这种情况下允许强制回收。 */
export function isOurDanglingLink(linkPath, name) {
  let st;
  try {
    st = fs.lstatSync(linkPath);
  } catch {
    return false;
  }
  if (!st.isSymbolicLink()) return false;
  let raw;
  try {
    raw = fs.readlinkSync(linkPath);
  } catch {
    return false;
  }
  const normalized = raw.split(path.sep).join('/');
  return normalized.endsWith(`/skills/${name}`) || path.basename(normalized) === name;
}

/**
 * 汇总一条技能在各 agent 目录里的**导出**现场（`/state` 的 `installs[].exports`）。
 *
 * 只认「指向 canonical 的链接」：`foreign-link` 指向别的副本、`real` 是本地实体目录，
 * 都不代表这份技能被导出过去。读共享根的 Agent 也不需要导出链——它们装好即见，
 * 现场残留的链（历史版本或手工建的）同样不列。
 */
export function agentPresence({ paths, registry, name }) {
  const canonicalPath = path.join(paths.canonical, name);
  const rows = [];
  for (const entry of registry.detected()) {
    // DSH 的扫描根没有「导出态」：那里要么是真身、要么是停用桩，不列进 Agent 现场
    if (entry.exportBlocked === 'dsh-native-root') continue;
    // 读共享根的 Agent 不走导出这条路；把它的链算成导出会误导「为什么它在导出清单里」
    if (entry.exportBlocked === 'shared-root') continue;
    const linkPath = path.join(entry.dir, name);
    const live = inspectTarget({ linkPath, canonicalPath });
    // 只有真的指向 canonical 的链才算导出（未记账的 managed-external 仍保留：
    // 它是「现场有、可接管」的导出，不是别人的东西）
    if (live.state !== 'managed' && live.state !== 'managed-external') continue;
    rows.push({
      target: entry.target,
      label: entry.label,
      dir: entry.dir,
      linkPath,
      state: live.state,
      broken: Boolean(live.broken),
    });
  }
  return rows;
}

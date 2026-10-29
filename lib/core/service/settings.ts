/**
 * 设置 / 导出增删：setSettings / setExports / setLinks。
 * 拆分前是 `createService` 返回对象里的同名方法，现在接 `ctx`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { unexportSkill } from '../exporter.js';
import { assertSafeSkillName } from './shared.js';
import { assertWritable, state } from './guards.js';
import { detectedTargets, exportSkill, needsExport } from './exports.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

export async function setSettings(ctx: ServiceCtx, patch) {
  const store = ctx.store;
  assertWritable(ctx);
  // 读共享根的 agent 不进设置：存下来也永远不会建链（exporter 会跳过），
  // 留着只会让「新安装时自动导出 · N」数出一个人人都看不见的 1。
  const detected = new Set(detectedTargets(ctx).filter((target) => needsExport(target)).map((target) => target.target));
  const onlyDetected = (list) => [
    ...new Set((Array.isArray(list) ? list : []).filter((target) => typeof target === 'string' && detected.has(target))),
  ];
  store.update((draft) => {
    if (patch.exportTargets === null) {
      draft.settings.exportTargets = [];
    } else if (Array.isArray(patch.exportTargets)) {
      draft.settings.exportTargets = onlyDetected(patch.exportTargets);
    } else if (patch.autoLinkTargets === null) {
      // v1 客户端兼容：`null` 原本表示「所有探测到的 Agent」，语义照搬成显式全导出
      draft.settings.exportTargets = onlyDetected(detectedTargets(ctx).map((item) => item.target));
    } else if (Array.isArray(patch.autoLinkTargets)) {
      draft.settings.exportTargets = onlyDetected(patch.autoLinkTargets);
    } else if (typeof patch.autoLinkAgents === 'boolean') {
      draft.settings.exportTargets = patch.autoLinkAgents
        ? onlyDetected(detectedTargets(ctx).map((item) => item.target))
        : [];
    }
    if (patch.placement === 'settings' || patch.placement === 'sidebar') {
      draft.settings.placement = patch.placement;
    }
  });
  return { ok: true, settings: state(ctx).settings };
}

export async function setExports(ctx: ServiceCtx, { skill, targets = [], action = 'add' }: any) {
  const { store, paths, logger } = ctx;
  assertSafeSkillName(skill);
  assertWritable(ctx);
  const canonicalPath = path.join(paths.canonical, skill);
  const exists = fs.existsSync(canonicalPath);
  if (action === 'remove') {
    const rows = state(ctx).exports.filter(
      (item) => item.skill === skill && (targets.length === 0 || targets.includes(item.target)),
    );
    const removed: any[] = [];
    const failed: any[] = [];
    for (const row of rows) {
      const outcome = unexportSkill({ linkPath: row.linkPath, canonicalPath, name: skill, allowDangling: !exists });
      if (outcome.removed || outcome.reason === 'absent') removed.push(row.target);
      else failed.push({ target: row.target, reason: outcome.reason || null, linkPath: row.linkPath });
    }
    // 只清「真的删掉 / 本来就不存在」的记录：删链失败仍记账会把漂移重新长出来
    store.update((draft) => {
      draft.exports = draft.exports.filter((item) => !(item.skill === skill && removed.includes(item.target)));
    });
    logger('exports.remove', { skill, removed, failed: failed.length });
    return { ok: true, action: 'remove', removed, failed };
  }
  if (!exists) throw new ServiceError('error.skills.not-installed', `${skill} 不在 canonical 里`);
  const result = exportSkill(ctx, skill, targets);
  logger('exports.add', { skill, created: result.created.length, skipped: result.skipped.length, failed: result.failed.length });
  return { ok: true, action: 'add', ...result };
}

/** @deprecated v2 起叫 `setExports`；`/links` 路由别名仍指到这里 */
export async function setLinks(ctx: ServiceCtx, args) {
  return setExports(ctx, args);
}

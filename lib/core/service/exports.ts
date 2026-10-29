/**
 * 导出链记账与目标选择：给不读共享根的 Agent 建链（`exporter.ts`），并把结果记账。
 * 拆分前是 `createService` 闭包里的 detectedTargets / needsExport / exportTargetList
 * / exportTargetsFor / exportSkill / recordExport，现在接 `ctx`。
 */
import { exportSkills } from '../exporter.js';
import { state } from './guards.js';
import { nowIso } from './shared.js';
import type { ServiceCtx } from '../../contract/service.js';

export function detectedTargets(ctx: ServiceCtx) {
  return ctx.registry.detected();
}

/**
 * 新安装/更新时默认导出的目标。v2 起默认空：导出是逐 agent 的显式动作，
 * 「装完就到处建链」正是 v1 那套「链接 = 可见性」的残留。
 */
/**
 * 这个 agent 需要导出吗？判据由注册表算好（`exportable`）：读共享根的不需要、
 * DSH 自己的扫描根也不需要。`unknown` 仍然算「需要」——没验证过就按需要处理。
 */
export function needsExport(entry) {
  return entry.exportable === true;
}

export function exportTargetList(ctx: ServiceCtx, current) {
  const selected = Array.isArray(current.settings.exportTargets) ? current.settings.exportTargets : [];
  if (selected.length === 0) return [];
  const detected = new Set(
    detectedTargets(ctx)
      .filter((item) => needsExport(item))
      .map((item) => item.target),
  );
  return selected.filter((target) => detected.has(target));
}

/** 某条技能已记账的导出目标（更新后复验用；不看 settings，导出是逐技能的） */
export function exportTargetsFor(ctx: ServiceCtx, skill) {
  return [...new Set(state(ctx).exports.filter((item) => item.skill === skill).map((item) => item.target))];
}

/** 导出（建链）：逐条幂等，冲突跳过不覆盖，失败收集原因继续。 */
export function exportSkill(ctx: ServiceCtx, name, targets, { record = true }: any = {}) {
  return exportSkills({
    paths: ctx.paths,
    registry: ctx.registry,
    name,
    targets,
    record: record ? (row) => recordExport(ctx, name, row) : () => {},
  });
}

/**
 * 记账：只在链**确实存在且指向 canonical** 时写。
 * `created: false` 但没记账 = 链是上一次运行/别人建的、我们刚接管，也要补记。
 */
export function recordExport(ctx: ServiceCtx, name, { target, agentDir, linkPath, mode }) {
  if (ctx.store.readOnly) return;
  if (state(ctx).exports.some((item) => item.skill === name && item.target === target)) return;
  ctx.store.update((draft) => {
    if (draft.exports.some((item) => item.skill === name && item.target === target)) return;
    draft.exports.push({
      skill: name,
      target,
      agentDir,
      linkPath,
      mode: mode === 'junction' ? 'junction' : 'relative',
      createdAt: nowIso(),
    });
  });
}

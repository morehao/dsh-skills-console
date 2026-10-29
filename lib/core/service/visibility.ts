/**
 * 可见性视图：扫根 + 合并宿主 snapshot 的 global 层 + 本地策略隐藏。
 * 拆分前是 `createService` 闭包里的 projectRootOf / policyHiddenPathsOf / visibilityFor
 * / visibleSkills / workspaceList，现在接 `ctx`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { findProjectRoot } from '../paths.js';
import { listRoots } from '../roots.js';
import { resolveVisibility } from '../visibility.js';
import { state } from './guards.js';
import type { ServiceCtx } from '../../contract/service.js';

/** cwd → 项目根（最近含 .git 的祖先）。拿不到就返回 null：不能凭空造 project 扫描根。 */
export function projectRootOf(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  const start = path.resolve(cwd);
  if (!fs.existsSync(start)) return null;
  return findProjectRoot(start, fs.existsSync);
}

/**
 * 本地策略隐藏的 canonical 目录：`enabled === false` 且目录真实存在。
 * 与 provider 的条件发候选对齐——只有 canonical 是 native winner 时才会命中。
 */
export function policyHiddenPathsOf(ctx: ServiceCtx) {
  const hidden = new Set<any>();
  if (!ctx.paths.canonicalScanned) return hidden;
  for (const install of state(ctx).installs || []) {
    if (!install || install.enabled !== false) continue;
    const dir = path.join(ctx.paths.canonical, install.name);
    try {
      if (fs.statSync(dir).isDirectory()) hidden.add(dir);
    } catch {
      /* 真身不在：不隐藏（provider 也不会发候选） */
    }
  }
  return hidden;
}

/** 组装一次可见性视图：扫根 + 合并宿主 snapshot 的 global 层 + 本地策略。 */
export async function visibilityFor(ctx: ServiceCtx, cwd, { withHost = true }: any = {}) {
  const projectRoot = projectRootOf(cwd);
  const roots = listRoots({ paths: ctx.paths, projectRoot });
  const host = withHost ? await visibleSkills(ctx, cwd) : { skills: [], complete: true };
  const resolved = resolveVisibility({
    roots,
    hostSkills: host.skills,
    policyHiddenPaths: policyHiddenPathsOf(ctx),
  });
  return { ...resolved, hostComplete: host.complete !== false, projectRoot };
}

export async function visibleSkills(ctx: ServiceCtx, cwd) {
  try {
    const snapshot = await ctx.visibleProvider(cwd);
    return snapshot;
  } catch (error) {
    ctx.logger('visible.failed', { error: error.message });
    return { skills: [], complete: false, error: error.message };
  }
}

export async function workspaceList(ctx: ServiceCtx) {
  try {
    return await ctx.workspacesProvider();
  } catch (error) {
    ctx.logger('workspaces.failed', { error: error.message });
    return [];
  }
}

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

/**
 * 组装一次可见性视图。
 *
 * 合并权优先交给宿主：`agentsVisibleProvider` 取每个 live agent 的 `skills.snapshot()`，
 * 那是该 agent 真正看到的合并结果（含 customSkillDirs / bundled / policy provider）。
 * - 拿到（`available === true` 且非不完整）→ 作为 `scopedSkills` 权威，本地扫描只补诊断。
 * - 拿不到（无 live agent / 全部失败 / 不完整）→ 回退：本地扫描 + 根 context snapshot 的
 *   global 层（bundled），即旧行为，保证刚打开设置、还没会话时也有结果。
 */
export async function visibilityFor(ctx: ServiceCtx, cwd, { withHost = true }: any = {}) {
  const projectRoot = projectRootOf(cwd);
  const roots = listRoots({ paths: ctx.paths, projectRoot });

  const scoped = withHost && typeof ctx.agentsVisibleProvider === 'function'
    ? await agentsVisibleSkills(ctx, cwd)
    : { available: false, skills: [], complete: false };

  const useScoped = scoped.available === true && scoped.complete !== false;
  const host = useScoped || !withHost
    ? { skills: [], complete: scoped.complete !== false }
    : await visibleSkills(ctx, cwd);

  const resolved = resolveVisibility({
    roots,
    hostSkills: host.skills,
    scopedSkills: useScoped ? scoped.skills : null,
    policyHiddenPaths: policyHiddenPathsOf(ctx),
  });
  const hostComplete = useScoped ? scoped.complete !== false : host.complete !== false;
  return { ...resolved, hostComplete, projectRoot, visibilitySource: useScoped ? 'agent-scope' : 'local-fallback' };
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

/** 每个 live agent 的 `skills.snapshot()` 并集；失败只记日志，交回退路径处理。 */
export async function agentsVisibleSkills(ctx: ServiceCtx, cwd) {
  try {
    const result = await ctx.agentsVisibleProvider(cwd);
    return result || { available: false, skills: [], complete: false };
  } catch (error) {
    ctx.logger('visible.agents.failed', { error: error.message });
    return { available: false, skills: [], complete: false, error: error.message };
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

/**
 * 跨机器迁移：导出「已安装 + 已订阅」名单，以及在另一台机器上按名单增量合并。
 *
 * 设计要点（与 README「不做跨机器同步」的边界不冲突）：
 * - **只搬名单，不搬技能本体**。本体由 `install()` 从 GitHub 重新下载——订阅只是调度载体。
 * - 导出：以 `buildLedger` 账本行（`source` 来自 lock / install）为准，同仓库的技能聚成一组；
 *   `ref` **取订阅的分支名**（`main`/`master`），而不是 lock 里的 commit（commit 会被 install
 *   当分支解析而失败）。没有分支时留 `null`，由 install 现场解析默认分支。
 * - 订阅**全量**带出（含「只订未装」的仓库），使新机器订阅清单与老机器一致。
 * - 无上游技能（`source` 不可解析）单列 `noUpstream`，导入时不自动处理，只如实提示。
 * - 导入：先补齐订阅，再按组 `install()`；**默认跳过本机已装同名技能**（`force` 才覆盖）。
 *   `dryRun=true` 只返回计划、不落任何改动。
 */
import { buildLedger, readLock } from '../inventory.js';
import { ServiceError } from './errors.js';
import { assertWritable, state } from './guards.js';
import { install } from './install.js';
import { addSubscription } from './subscriptions.js';
import type { ServiceCtx } from '../../contract/service.js';

/** 名单格式版本：破坏性变更才递增。 */
export const MANIFEST_VERSION = 1;

/**
 * 导出名单。
 * 返回：
 * - `version` / `exportedAt`
 * - `sources[]`：`{ source, ref, skills[] }`，同仓库（同 ref）的已装技能聚组；`ref` 是分支名或 null
 * - `subscriptions[]`：`{ source, ref, subpath }`，state 里全部订阅（含只订未装的）
 * - `installed[]`：`{ name, source|null }`，本机全部已装技能（含无上游）
 * - `noUpstream[]`：无上游、无法按仓库重装的技能名
 */
export async function exportManifest(ctx: ServiceCtx) {
  const current = state(ctx);
  const ledger = buildLedger({
    paths: ctx.paths,
    state: current,
    registry: ctx.registry,
    lock: readLock(ctx.paths),
    visibility: { byName: new Map() },
  });

  // subscriptionId → 分支名（ref 来自订阅，是 main/master 这类分支，不是 commit）
  const refBySub = new Map<string, string | null>();
  for (const sub of current.subscriptions || []) refBySub.set(sub.id, sub.ref ?? null);

  const groups = new Map<string, { source: string; ref: string | null; skills: Set<string> }>();
  const installed: { name: string; source: string | null }[] = [];
  const noUpstream: string[] = [];

  for (const row of ledger.rows) {
    const name = row.name;
    const source = typeof row.source === 'string' && row.source ? row.source : null;
    if (!source) {
      installed.push({ name, source: null });
      noUpstream.push(name);
      continue;
    }
    // 分支名只从订阅取；无订阅（如 lock 有 source 但没建订阅）留 null，由 install 解析默认分支
    const ref = row.subscriptionId ? refBySub.get(row.subscriptionId) ?? null : null;
    installed.push({ name, source });
    const key = `${source}@${ref || ''}`;
    if (!groups.has(key)) groups.set(key, { source, ref, skills: new Set() });
    groups.get(key)!.skills.add(name);
  }

  const sources = [...groups.values()]
    .map((g) => ({ source: g.source, ref: g.ref, skills: [...g.skills].sort() }))
    .sort((a, b) => (a.source === b.source ? String(a.ref).localeCompare(String(b.ref)) : a.source.localeCompare(b.source)));

  const subscriptions = (current.subscriptions || []).map((sub: any) => ({
    source: sub.source,
    ref: sub.ref ?? null,
    subpath: sub.subpath ?? null,
  }));

  return {
    version: MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    sources,
    subscriptions,
    installed,
    noUpstream: noUpstream.sort(),
  };
}

/**
 * 导入名单：按名单增量合并到本机。
 *
 * 步骤：
 * 1. 校验名单结构；
 * 2. 汇总 `plan`：每组要装 / 要跳过（已装）的技能；
 * 3. `dryRun` 直接返回 plan，不做任何写操作；
 * 4. 否则先 `addSubscription` 补齐订阅（幂等），再逐组 `install()`，最后汇总结果。
 *
 * 不覆盖已装：默认跳过；`force=true` 才把已装名字也纳入安装。
 */
export async function importManifest(
  ctx: ServiceCtx,
  { manifest, dryRun = false, force = false }: any = {},
) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.sources)) {
    throw new ServiceError('error.skills.bad-manifest', '名单格式不正确：缺少 sources 数组');
  }
  assertWritable(ctx);

  // 本机已装名字：以 state.installs 为准（足够判断「同名已存在」）。
  const installedNames = new Set((state(ctx).installs || []).map((i: any) => i.name));

  const plan: any[] = [];
  let planInstallCount = 0;
  for (const group of manifest.sources) {
    if (!group || typeof group.source !== 'string' || !Array.isArray(group.skills)) continue;
    const ref = typeof group.ref === 'string' && group.ref ? group.ref : null;
    const all = group.skills.filter((n: any) => typeof n === 'string' && n);
    const toInstall = force ? all : all.filter((n: string) => !installedNames.has(n));
    const skip = force ? [] : all.filter((n: string) => installedNames.has(n));
    planInstallCount += toInstall.length;
    plan.push({ source: group.source, ref, install: toInstall, skip });
  }

  // 订阅：state 里没有的才补（按 source+ref+subpath 判重）。
  const haveSub = new Set(
    (state(ctx).subscriptions || []).map(
      (s: any) => `${s.source}@${s.ref || ''}#${s.subpath || ''}`,
    ),
  );
  const subQueue: any[] = [];
  for (const sub of Array.isArray(manifest.subscriptions) ? manifest.subscriptions : []) {
    if (!sub || typeof sub.source !== 'string') continue;
    const ref = sub.ref ?? null;
    const subpath = sub.subpath ?? null;
    const key = `${sub.source}@${ref || ''}#${subpath || ''}`;
    if (haveSub.has(key)) continue;
    haveSub.add(key);
    subQueue.push({ source: sub.source, ref, subpath });
  }

  const result = {
    ok: true,
    dryRun: Boolean(dryRun),
    plan,
    planInstallCount,
    subscriptionsToAdd: subQueue.map((s) => ({ source: s.source, ref: s.ref, subpath: s.subpath })),
    noUpstream: Array.isArray(manifest.noUpstream) ? manifest.noUpstream : [],
    addedSubscriptions: [] as any[],
    installed: [] as any[],
    skipped: [] as string[],
    failed: [] as any[],
  };

  if (dryRun) return result;

  // 1) 补订阅（幂等；已有快照的 addSubscription 会直接返回 existing）。
  for (const s of subQueue) {
    try {
      const r = await addSubscription(ctx, { source: s.source, ref: s.ref, subpath: s.subpath });
      result.addedSubscriptions.push({ source: s.source, ref: s.ref, existing: Boolean(r?.existing) });
    } catch (error: any) {
      // 订阅补齐失败不阻断；技能安装时若来源仍可解析会自行建订阅。
      ctx.logger?.('manifest.subscription.failed', { source: s.source, message: error?.message });
      result.failed.push({ stage: 'subscription', source: s.source, message: error?.message || String(error) });
    }
  }

  // 2) 逐组安装。先按 (source, ref) 确保订阅存在，用其 id 调 install —— 这样分支才正确
  //    （install 只在传 subscriptionId 时沿用订阅的 ref；否则现场解析默认分支，可能不是 main）。
  for (const row of plan) {
    for (const n of row.skip) result.skipped.push(n);
    if (!row.install.length) continue;
    try {
      let subscriptionId: string | null = null;
      if (row.ref) {
        const sub = await addSubscription(ctx, { source: row.source, ref: row.ref, subpath: null });
        subscriptionId = sub?.subscription?.id ?? null;
      }
      const r = await install(ctx, { source: row.source, subscriptionId: subscriptionId || undefined, skills: row.install, commit: null, targets: undefined });
      for (const item of r?.installed || []) result.installed.push({ name: item.name, source: row.source });
    } catch (error: any) {
      result.failed.push({ stage: 'install', source: row.source, skills: row.install, message: error?.message || String(error) });
    }
  }

  result.ok = result.failed.length === 0;
  return result;
}

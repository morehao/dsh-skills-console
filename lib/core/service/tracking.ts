/**
 * 记账 / 接管：把 canonical 里存在但账本里没有的技能补齐（不碰文件），
 * 以及旧哈希口径的一次性重基线。
 * 拆分前是 `createService` 闭包里的 adoptionRecord / applyAdoptions / reconcileTracking
 * / rebaselineHashes / ensureHashBaseline + 对外方法 `adopt`，现在接 `ctx`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentHash } from '../hash.js';
import { readLock, scanCanonical } from '../inventory.js';
import { inspectPark, hashWithoutInvocation, matchesLegacyHash } from '../invocation.js';
import { parseSource, snapshotId } from '../updates.js';
import { assertWritable, state } from './guards.js';
import { canonicalDir, nowIso } from './shared.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

/**
 * 一条「接管」记录：只算数据，不写盘。canonical 里没有来源也能接管，
 * 只是没有订阅、检测不到更新（等于仅能启停 / 接入 / 删除）。
 */
export function adoptionRecord(ctx: ServiceCtx, name, lockEntry) {
  const canonicalPath = path.join(ctx.paths.canonical, name);
  const parsed = lockEntry?.source ? parseSource(lockEntry.source) : null;
  const source = parsed ? `${parsed.owner}/${parsed.repo}` : null;
  const ref = lockEntry?.ref || null;
  const subscriptionId = source ? snapshotId({ source, ref, subpath: null }) : null;
  const installedHash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
  return {
    name,
    subscriptionId,
    source,
    ref,
    skillPath: lockEntry?.skillPath || `${name}/SKILL.md`,
    installedHash,
  };
}

export function applyAdoptions(draft, records) {
  for (const record of records) {
    if (record.subscriptionId && !draft.subscriptions.some((item) => item.id === record.subscriptionId)) {
      draft.subscriptions.push({
        id: record.subscriptionId,
        source: record.source,
        ref: record.ref,
        subpath: null,
        skills: '*',
        lastCheck: null,
        snapshot: null,
        adopted: true,
      });
    }
    if (!draft.installs.some((item) => item.name === record.name)) {
      draft.installs.push({
        name: record.name,
        subscriptionId: record.subscriptionId,
        skillPath: record.skillPath,
        ref: record.ref,
        commit: null,
        treeSha: null,
        installedHash: record.installedHash,
        installedAt: nowIso(),
        updatedAt: nowIso(),
        enabled: true,
        backup: null,
        adopted: true,
      });
    }
  }
}

/**
 * 自动接管：canonical 里存在、账本里还没有的技能，一次补齐。
 *
 * canonical 本身就是"已安装"的权威来源；装的时候不一定经过本插件（终端里跑 CLI、
 * 升级前的老数据），要求用户逐个点「接管」没有意义。这里只补记账，不碰任何文件。
 * 有 lock 来源的顺带建订阅，之后更新检测就能工作。
 */
export function reconcileTracking(ctx: ServiceCtx, lock) {
  if (ctx.store.readOnly || ctx.runtime.enqueue.pending() > 0) return [];
  const known = new Set(state(ctx).installs.map((item) => item.name));
  const records: any[] = [];
  for (const entry of scanCanonical(ctx.paths)) {
    // 只对目录型技能记账：平铺 .md / 悬空链接无法按目录建链与启停
    if (entry.kind !== 'dir' || known.has(entry.name)) continue;
    records.push(adoptionRecord(ctx, entry.name, lock.skills?.[entry.name] || null));
  }
  if (records.length === 0) return [];
  ctx.store.update((draft) => applyAdoptions(draft, records));
  ctx.logger('skills.reconcile', { adopted: records.map((item) => item.name) });
  return records;
}

/**
 * 一次性重基线：v0.6.x 之前的内容哈希按进程 locale 的 collation 排序，换启动环境
 * （或 Node / ICU 版本）后同一份内容会算出不同 digest，被误报成「本地已改」。
 *
 * 只改写**能证明没被改过**的基线：新口径对不上，但某个旧 collation 能精确复现
 * 记录值。内容真的动过的技能一条都不碰 —— 继续按「本地已改」让用户确认覆盖。
 * 停用（parked）期间的技能也跳过：那时 SKILL.md 已改名、目录里多了 marker，
 * 基线由 unpark 重放。
 */
export function rebaselineHashes(ctx: ServiceCtx) {
  const store = ctx.store;
  const rebaselined: any[] = [];
  const unresolved: any[] = [];
  if (store.readOnly) return { rebaselined, unresolved, skipped: 'read-only' };
  for (const install of state(ctx).installs) {
    if (typeof install.installedHash !== 'string' || !install.installedHash) continue;
    const dir = canonicalDir(ctx, install.name);
    let stat;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (inspectPark(dir).parked) continue;
    const current = hashWithoutInvocation(dir, install.manual);
    if (!current || current === install.installedHash) continue;
    if (matchesLegacyHash(dir, install.manual, install.installedHash)) {
      rebaselined.push({ name: install.name, from: install.installedHash, to: current });
    } else {
      unresolved.push(install.name);
    }
  }
  if (rebaselined.length > 0) {
    const next = new Map(rebaselined.map((item) => [item.name, item.to]));
    store.update((draft) => {
      for (const row of draft.installs) {
        if (next.has(row.name)) row.installedHash = next.get(row.name);
      }
    });
    ctx.logger('state.hash-order.rebaseline', {
      names: rebaselined.map((item) => item.name),
      count: rebaselined.length,
    });
  }
  return { rebaselined, unresolved };
}

// 每个进程只跑一次：写盘后新基线自洽，不必（也不该）每次请求都试旧口径。
export function ensureHashBaseline(ctx: ServiceCtx) {
  if (ctx.runtime.hashBaselineChecked || ctx.store.readOnly || ctx.runtime.enqueue.pending() > 0) return;
  ctx.runtime.hashBaselineChecked = true;
  try {
    rebaselineHashes(ctx);
  } catch (error) {
    ctx.logger('state.hash-order.rebaseline.failed', { message: error?.message || String(error) });
  }
}

/**
 * 接管：把 CLI/别人装的技能纳入追踪（补一条 installs 记录）。
 * 有 lock 来源时顺带建/复用一个订阅，否则这个技能永远不会出现在更新检测里。
 */
export async function adopt(ctx: ServiceCtx, { name }) {
  assertWritable(ctx);
  const canonicalPath = path.join(ctx.paths.canonical, name);
  if (!fs.existsSync(canonicalPath)) {
    throw new ServiceError('error.skills.not-found', `${name} 不在 canonical 里`);
  }
  if (ctx.store.findInstall(name)) return { ok: true, name, already: true };
  const lock = readLock(ctx.paths);
  const lockEntry = lock.skills?.[name] || null;
  const record = adoptionRecord(ctx, name, lockEntry);
  ctx.store.update((draft) => applyAdoptions(draft, [record]));
  ctx.logger('skill.adopt', { name, subscriptionId: record.subscriptionId, lockSource: lockEntry?.source || null });
  return {
    ok: true,
    name,
    subscriptionId: record.subscriptionId,
    tracked: Boolean(record.subscriptionId),
    installedHash: record.installedHash,
    note: record.subscriptionId ? null : '没有可识别的远端来源，只能追踪本地改动，不能检测更新',
  };
}

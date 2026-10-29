/**
 * 更新检测 / 计划 / 应用 / 回滚：checkUpdates / runAutoCheck / planUpdate / applyUpdate / rollback。
 * 拆分前是 `createService` 返回对象里的同名方法，现在接 `ctx`。
 */
import path from 'node:path';
import { checkSkill, planToken, skillTreeSha } from '../updates.js';
import { readLock } from '../inventory.js';
import { readLockFile, updateLock } from '../lock.js';
import { contentHash } from '../hash.js';
import { inspectPark, hashWithoutInvocation } from '../invocation.js';
import { readBackup, restoreBackup } from '../trash.js';
import { readSnapshot } from './snapshots.js';
import { exportSkill, exportTargetsFor } from './exports.js';
import { assertNotParked, reapplyInvocation } from './invocation.js';
import { assertWritable, requireInstaller, state } from './guards.js';
import { isSettledCheck, nowIso } from './shared.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

export async function checkUpdates(ctx: ServiceCtx, { names, subscriptionId }: any = {}) {
  const { store, paths, logger } = ctx;
  const installs = state(ctx).installs.filter((install) => {
    if (names && names.length > 0 && !names.includes(install.name)) return false;
    if (subscriptionId && install.subscriptionId !== subscriptionId) return false;
    return true;
  });
  const lock = readLock(paths);
  const groups = new Map<string, any>();
  for (const install of installs) {
    const subscription = state(ctx).subscriptions.find((item) => item.id === install.subscriptionId);
    if (!subscription) continue;
    // 按订阅（id 已含 source/ref/subpath）分组：不能用 `ref || 'main'` 当键，否则 null-ref 与 main 会撞车
    if (!groups.has(subscription.id)) groups.set(subscription.id, { subscription, installs: [] });
    groups.get(subscription.id).installs.push(install);
  }

  const results: any[] = [];
  for (const { subscription, installs: groupInstalls } of groups.values()) {
    // 与 readSnapshot 同一套语义：限流时 Atom/codeload 兜底，失败才逐个标 unknown
    // withCommit: false：判定只需要树，别为 check 多付一次 /commits 请求
    let probe;
    try {
      probe = await readSnapshot(ctx, subscription, { withCommit: false, persistRef: true, allowUnchanged: false });
    } catch (error) {
      for (const install of groupInstalls) {
        results.push({
          name: install.name,
          status: 'unknown',
          detail: error.message,
          code: error.code || null,
          checkedAt: nowIso(),
        });
      }
      continue;
    }
    // 304 只说明「树没变」，它本身不含任何树内容，能不能沿用取决于**上次有没有结论**。
    // 上次是 unknown（更早一次探测失败留下的）时，沿用就等于把「待检查」永久粘住：
    // 用户点多少次刷新都还是 unknown。此时只能无视 ETag 完整读一次，才拿得到真判定。
    if (probe.notModified && groupInstalls.some((install) => !isSettledCheck(state(ctx).checks?.[install.name]))) {
      try {
        probe = await readSnapshot(ctx, subscription, {
          force: true,
          withCommit: false,
          persistRef: true,
          allowUnchanged: false,
        });
      } catch (error) {
        for (const install of groupInstalls) {
          results.push({
            name: install.name,
            status: 'unknown',
            detail: error.message,
            code: error.code || null,
            checkedAt: nowIso(),
          });
        }
        continue;
      }
    }
    if (probe.notModified) {
      for (const install of groupInstalls) {
        const previousCheck = state(ctx).checks?.[install.name];
        results.push({
          name: install.name,
          status: previousCheck?.status || 'current',
          detail: 'ETag 未变，沿用上次结论',
          checkedAt: nowIso(),
        });
      }
      continue;
    }
    for (const install of groupInstalls) {
      const skillPath = lock.skills?.[install.name]?.skillPath || install.skillPath;
      const entry = probe.tree.some((item) => item.type === 'blob' && item.path === skillPath)
        ? { skillPath }
        : null;
      const verdict = checkSkill({
        lockHash: lock.skills?.[install.name]?.skillFolderHash || null,
        recordedTreeSha: install.treeSha ?? null,
        snapshotEntry: entry,
        tree: probe.tree,
        rootSha: probe.rootSha,
      });
      results.push({ name: install.name, ...verdict, via: probe.via, checkedAt: nowIso() });
    }
  }

  if (!store.readOnly) {
    store.update((draft) => {
      for (const item of results) {
        const install = draft.installs.find((row) => row.name === item.name);
        draft.checks[item.name] = {
          name: item.name,
          status: item.status,
          detail: item.detail || null,
          wouldCommit: null,
          checkedAt: item.checkedAt,
          installCommit: install?.commit || null,
        };
      }
    });
  }
  logger('updates.check', { count: results.length });
  return { ok: true, checks: results };
}

/**
 * 定时上游检测（由 lib/index.js 的 timer 服务按固定间隔调用）。
 * 只做判定，把结论写进 state.checks；绝不自动安装。
 * 全程 fail-open：任何异常只记日志，不向定时器抛。
 */
export async function runAutoCheck(ctx: ServiceCtx, { now = Date.now() }: any = {}) {
  const { store, logger } = ctx;
  const AUTO_CHECK_MIN_INTERVAL_MS = 5 * 60 * 60 * 1000; // 6h 周期，容 1h 抖动
  try {
    if (store.readOnly) return { ok: true, skipped: 'readonly' };
    const settings = state(ctx).settings || {};
    const auto = settings.autoCheck || {};
    if (auto.enabled === false) return { ok: true, skipped: 'disabled' };
    const installs = Array.isArray(state(ctx).installs) ? state(ctx).installs : [];
    const subscriptions = Array.isArray(state(ctx).subscriptions) ? state(ctx).subscriptions : [];
    if (installs.length === 0 || subscriptions.length === 0) return { ok: true, skipped: 'empty' };
    if (ctx.runtime.enqueue.pending() > 0) return { ok: true, skipped: 'busy' };
    const last = auto.lastRunAt ? Date.parse(auto.lastRunAt) : NaN;
    if (Number.isFinite(last) && now - last < AUTO_CHECK_MIN_INTERVAL_MS) {
      return { ok: true, skipped: 'throttled' };
    }
    const result = await checkUpdates(ctx, {});
    const checks = Array.isArray(result?.checks) ? result.checks : [];
    const updatable = checks.filter((item) => item.status === 'update-available').length;
    const at = nowIso();
    if (!store.readOnly) {
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        const prev = draft.settings.autoCheck || {};
        draft.settings.autoCheck = {
          enabled: prev.enabled !== false,
          lastRunAt: at,
          lastResult: { count: checks.length, updatable, at },
        };
      });
    }
    logger('auto.check', { count: checks.length, updatable });
    return { ok: true, count: checks.length, updatable, lastRunAt: at };
  } catch (error) {
    logger('auto.check.failed', { message: error?.message, code: error?.code || null });
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function planUpdate(ctx: ServiceCtx, { name }) {
  const { store, paths, logger } = ctx;
  const install = store.findInstall(name);
  if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
  const subscription = state(ctx).subscriptions.find((item) => item.id === install.subscriptionId);
  if (!subscription) throw new ServiceError('error.skills.no-subscription', '该技能不属于任何订阅，无法生成更新计划');
  // 与 checkUpdates 共用一套取数语义；计划必须拿到完整树，所以不允许 commit 相同就短路
  const probe = await readSnapshot(ctx, subscription, { force: true, allowUnchanged: false });
  const ref = probe.branch;
  const lock = readLock(paths);
  const skillPath = lock.skills?.[name]?.skillPath || install.skillPath;
  const entry = probe.tree.find((item) => item.type === 'blob' && item.path === skillPath);
  if (!entry) throw new ServiceError('error.skills.upstream-deleted', '上游已移除该技能');
  const targetTreeSha = skillTreeSha({ tree: probe.tree, skillPath, rootSha: probe.rootSha });
  const targetCommit = probe.snapshot?.commit ?? null;
  const token = planToken({
    subscriptionId: subscription.id,
    from: install.commit || null,
    to: targetCommit,
    installedHash: install.installedHash || null,
    targetTreeSha,
  });
  logger('updates.plan', { name, targetCommit, targetTreeSha });
  return {
    ok: true,
    name,
    token,
    fromCommit: install.commit || null,
    toCommit: targetCommit,
    ref,
    targetTreeSha,
    skillPath,
    // 归一化哈希：manual 的插件行不算本地改动，否则每次更新都被自己的标记挡住
    localModified: (() => {
      if (install.mode === 'hidden' || inspectPark(path.join(paths.canonical, name)).parked) return false;
      const current = hashWithoutInvocation(path.join(paths.canonical, name), install.manual);
      return Boolean(install.installedHash) && (current === null || current !== install.installedHash);
    })(),
  };
}

export async function applyUpdate(ctx: ServiceCtx, { name, token, overwrite = false }) {
  const { store, paths, logger, installer } = ctx;
  const enqueue = ctx.runtime.enqueue;
  assertWritable(ctx);
  await requireInstaller(ctx);
  return enqueue(`apply:${name}`, async () => {
    assertNotParked(ctx, name, '更新');
    const plan = await planUpdate(ctx, { name });
    if (token && token !== plan.token) {
      throw new ServiceError('error.skills.stale-plan', '计划已失效（磁盘或上游被改动过），请重新检查');
    }
    const install = store.findInstall(name);
    if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
    if (plan.localModified && !overwrite) {
      throw new ServiceError('error.skills.locally-modified', '本地有改动，更新会覆盖它们；确认后带 overwrite 重试', {
        plan,
      });
    }

    const subscription = state(ctx).subscriptions.find((item) => item.id === install.subscriptionId);
    if (!subscription) throw new ServiceError('error.skills.no-subscription', '该技能不属于任何订阅，无法更新');

    let result;
    try {
      result = await installer.install({
        source: subscription.source,
        commit: plan.toCommit || null,
        ref: plan.toCommit || plan.ref || subscription.ref || null,
        subpath: subscription.subpath,
        names: [name],
        expectedEntries: plan.targetTreeSha ? [{ name, treeSha: plan.targetTreeSha }] : [],
        strict: true,
      });
    } catch (error) {
      logger('updates.apply.failed', { name, reason: error?.code || null });
      return {
        ok: false,
        code: 'error.skills.update-failed',
        message: '更新失败；安装器已回滚到操作前状态',
        detail: { reason: error?.code || null, status: error?.status ?? null },
        backup: null,
      };
    }

    const item = result.installed?.find((row) => row.name === name);
    if (!item) {
      // 理论不可达（names 已选中且 discovery 成功）；绝不把「没装上」报成成功
      logger('updates.apply.failed', { name, reason: 'missing-installed-item' });
      return {
        ok: false,
        code: 'error.skills.update-failed',
        message: '更新失败；安装器没有返回该技能的结果',
        detail: { reason: 'missing-installed-item' },
        backup: null,
      };
    }
    const installedHash = item.contentHash || contentHash(path.join(paths.canonical, name));
    store.update((draft) => {
      const row = draft.installs.find((entry) => entry.name === name);
      if (!row) return;
      row.commit = plan.toCommit || null;
      row.treeSha = item.treeSha || plan.targetTreeSha || null;
      row.installedHash = installedHash;
      row.updatedAt = nowIso();
      row.backup = item.backup
        ? {
            key: item.backup,
            hash: item.backupHash || null,
            treeSha: item.backupTreeSha || null,
            commit: install.commit || null,
          }
        : row.backup;
      draft.checks[name] = {
        name,
        status: 'current',
        detail: null,
        wouldCommit: null,
        checkedAt: nowIso(),
        installCommit: plan.toCommit || null,
      };
    });

    // 更新重建的是 canonical 目录：导出链按原目标复验补建。`enabled` 保持不变——
    // 停用期间更新，模型仍然看不到新正文，直到启用（不再需要刷新任何桩的 hash）。
    const relinked = exportSkill(ctx, name, exportTargetsFor(ctx, name));
    // 新内容默认没有插件行；仍 manual 就重放，失败只标 drift，不回滚已成功的更新
    const invocation = reapplyInvocation(ctx, name);
    if (!invocation.ok) logger('invocation.reapply.failed', { name, message: invocation.message });
    logger('updates.apply', { name, from: plan.fromCommit, to: plan.toCommit, backup: item.backup || null });
    return {
      ok: true,
      name,
      fromCommit: plan.fromCommit,
      toCommit: plan.toCommit || null,
      backup: item.backup || null,
      relinked,
      invocation,
    };
  });
}

export async function rollback(ctx: ServiceCtx, { name }) {
  const { store, paths, logger } = ctx;
  const enqueue = ctx.runtime.enqueue;
  assertWritable(ctx);
  return enqueue(`rollback:${name}`, async () => {
    assertNotParked(ctx, name, '回滚');
    const install = store.findInstall(name);
    if (!install?.backup?.key) throw new ServiceError('error.skills.no-backup', `${name} 没有可回滚的备份`);
    const backup = readBackup({ paths, key: install.backup.key });
    if (!backup) throw new ServiceError('error.skills.no-backup', '备份目录已不存在');
    const canonicalPath = path.join(paths.canonical, name);
    // 先读 lock 再动盘：lock 损坏时直接失败，避免只回滚一半
    const lockBefore = readLockFile(paths.lockFile);
    const lockEntry = lockBefore.data?.skills?.[name] || null;
    restoreBackup({ backup, toDir: canonicalPath });
    if (lockEntry) {
      updateLock({
        lockPath: paths.lockFile,
        expectedDigest: lockBefore.digest,
        mutate: (draft) => {
          const previous = draft.skills[name];
          if (!previous) return;
          draft.skills[name] = {
            ...previous,
            ...(install.backup.treeSha ? { skillFolderHash: install.backup.treeSha } : {}),
            ...(install.backup.commit ? { ref: install.backup.commit } : {}),
            updatedAt: nowIso(),
          };
        },
      });
    }
    // 备份可能带着插件写的 frontmatter 行；基线统一用归一化哈希
    const installedHash = hashWithoutInvocation(canonicalPath, install.manual) || contentHash(canonicalPath);
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row) return;
      row.installedHash = installedHash;
      row.updatedAt = nowIso();
      row.commit = null;
      // 回滚回去的是备份那一刻的内容，tree 基线也得跟着退回去（不知道就置空，绝不沿用新版）
      row.treeSha = install.backup.treeSha ?? null;
      draft.checks[name] = { name, status: 'unknown', detail: '已回滚，需重新检查', checkedAt: nowIso() };
    });
    const invocation = reapplyInvocation(ctx, name);
    logger('updates.rollback', { name, backup: install.backup.key });
    return { ok: true, name, restoredFrom: install.backup.key, installedHash, invocation };
  });
}

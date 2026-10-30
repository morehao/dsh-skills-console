/**
 * 状态视图 / 诊断：reloadState / ensureMigrated / getState / diagnostics。
 * 拆分前是 `createService` 返回对象里的同名方法，现在接 `ctx`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLedger, readLock } from '../inventory.js';
import { ensureMigrated as runMigrations } from '../migrations.js';
import { nativeCapabilities, state } from './guards.js';
import { ensureHashBaseline, reconcileTracking } from './tracking.js';
import { visibilityFor, workspaceList } from './visibility.js';
import { reconcileInvocations } from './invocation.js';
import { detectedTargets } from './exports.js';
import { introCapability } from './intro.js';
import type { ServiceCtx } from '../../contract/service.js';

/**
 * 客户端覆盖能力表：只承诺已确认的客户端，不写成「所有 Agent 都生效」。
 * 读不到就返回空表（UI 只显示通用提示），不影响写路径。
 */
const INVOCATION_SUPPORT = (() => {
  try {
    const raw = fs.readFileSync(new URL('../../invocation-support.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw);
    return { generatedAt: parsed.generatedAt || null, note: parsed.note || null, clients: Array.isArray(parsed.clients) ? parsed.clients : [] };
  } catch {
    return { generatedAt: null, note: null, clients: [] };
  }
})();

/** 每次请求前从磁盘重读状态：别的进程（或手工编辑）改过也要立刻看见。 */
export function reloadState(ctx: ServiceCtx) {
  const store = ctx.store;
  // 有写操作在跑时不要重读：否则会把队列里刚写完但尚未落盘的状态冲掉
  if (ctx.runtime.enqueue.pending() > 0) return store.state;
  store.load();
  // v1 → v2 的文件侧迁移（删历史 DSH 链 / 剪悬空导出 / 补停用标记）。
  // 幂等且带 manifest：中断后下次 load 接着做。
  if (!store.readOnly && store.state.migration && store.state.migration.status !== 'done') {
    try {
      runMigrations({ paths: ctx.paths, store, logger: ctx.logger });
    } catch (error) {
      ctx.logger('state.migrate.failed', { message: error.message });
    }
  }
  // 旧版内容哈希按 locale 排序，升级后先做一次性重基线，别把「排序变了」显示成「本地已改」
  ensureHashBaseline(ctx);
  return store.state;
}

/** 供插件 apply 时主动跑一次迁移（不必等到第一个请求）。 */
export function ensureMigrated(ctx: ServiceCtx) {
  const current = reloadState(ctx);
  try {
    reconcileInvocations(ctx);
  } catch (error) {
    ctx.logger('invocation.reconcile.failed', { message: error?.message });
  }
  return current;
}

export async function getState(ctx: ServiceCtx, { cwd, workspace }: any = {}) {
  const { paths, store, registry } = ctx;
  const lock = readLock(paths);
  reconcileTracking(ctx, lock);
  const visible = await visibilityFor(ctx, cwd);
  const ledger = buildLedger({ paths, state: state(ctx), registry, lock, visibility: visible });
  const capabilities = nativeCapabilities(ctx);
  const rowByName = new Map(ledger.rows.map((row) => [row.name, row]));
  const visibleList: any[] = [];
  for (const [name, item] of visible.byName) {
    if (!item.visible) continue;
    const row = rowByName.get(name);
    visibleList.push({
      name,
      description: row?.description ?? null,
      source: item.winnerSource,
      provider: item.hostOnly ? 'host' : 'filesystem',
      path: item.path,
      nameConflict: Boolean(item.nameConflict),
      shadowedBy: item.shadowedBy || [],
    });
  }
  return {
    ok: true,
    readOnly: store.readOnly,
    readOnlyReason: store.problem,
    // direct：canonical 就是 rank 500 的扫描根，装完即可见；
    // unscanned：canonical 被挪到扫描根之外，本插件不提供可见性兜底（/diagnostics 会报出来）
    mode: paths.canonicalScanned ? 'direct' : 'unscanned',
    settings: state(ctx).settings,
    invocation: {
      support: INVOCATION_SUPPORT,
      modes: ['auto', 'manual', 'hidden'],
    },
    // 技能介绍（模型生成）：前端据此决定按钮显隐；可用 ≠ 已登录，失败会在生成时如实报错
    intro: introCapability(ctx),
    agents: { all: registry.all(), detected: detectedTargets(ctx) },
    subscriptions: state(ctx).subscriptions,
    workspaces: await workspaceList(ctx),
    installs: ledger.rows,
    exports: state(ctx).exports,
    legacyShadows: state(ctx).legacyShadows,
    roots: visible.roots,
    visible: visibleList,
    visibleComplete: visible.hostComplete && visible.complete,
    visibleErrors: visible.errors,
    visibilitySource: visible.visibilitySource,
    visibleOnly: ledger.visibleOnly,
    checks: state(ctx).checks,
    cli: capabilities,
    paths: {
      canonical: paths.canonical,
      lock: paths.lockFile,
      dshGlobal: paths.dshGlobalSkills,
      userAgents: paths.userAgentsSkills,
      state: paths.stateFile,
    },
    cwd: cwd || null,
    projectRoot: visible.projectRoot,
    workspace: workspace || null,
    scannedAt: ledger.scannedAt,
  };
}

export async function diagnostics(ctx: ServiceCtx) {
  const { paths } = ctx;
  const capabilities = nativeCapabilities(ctx);
  const lock = readLock(paths);
  reconcileTracking(ctx, lock);
  // 诊断不传 cwd：只看 user 两个根，避免把某个项目目录的副本算成全局事实
  const visible = await visibilityFor(ctx, null);
  const visibleSource = visible.visibilitySource;
  const rows = buildLedger({ paths, state: state(ctx), registry: ctx.registry, lock, visibility: visible }).rows;
  const mismatched = rows
    .filter((row) => row.managed && row.lockHash)
    .map((row) => ({
      name: row.name,
      sourceType: row.sourceType,
      hash: row.lockHash,
      paired: row.sourceType === 'github' ? /^[0-9a-f]{40}$/.test(row.lockHash) : true,
    }))
    .filter((item) => !item.paired);

  const legacyShadows = state(ctx).legacyShadows || [];
  const exportsRows = state(ctx).exports || [];
  const policy = ctx.policyStatus() || {};
  const drift = {
    /** 账上有链、磁盘上没有（迁移会收缩，运行期只报告） */
    exportsMissing: exportsRows.filter((row) => !row.linkPath || !fs.existsSync(row.linkPath)),
    /** 迁移删不掉的旧停用桩；用户可手动处理，或在控制台点启用时再试 */
    legacyShadows,
    /** 说不该出现的组合：界面停用、模型仍可见（更靠前的同名副本赢了） */
    disabledButVisible: state(ctx).installs.filter((item) => item.enabled === false && visible.byName.get(item.name)?.visible),
    /** 界面启用、模型不可见（真身缺失，或同名停用技能排在前面）；自己声明 manual-only 的不算异常 */
    enabledButHidden: state(ctx).installs.filter((item) => {
      if (item.enabled === false || item.mode === 'hidden') return false;
      const view = visible.byName.get(item.name);
      if (view?.visible) return false;
      const canonical = path.join(paths.canonical, item.name);
      const selfHidden = Boolean(view?.foreignHidden && view.winnerPath
        && path.resolve(view.winnerPath) === path.resolve(canonical));
      return !selfHidden;
    }),
  };

  return {
    ok: true,
    cli: capabilities,
    mode: paths.canonicalScanned ? 'direct' : 'unscanned',
    lock: { present: lock.present, version: lock.version, entries: Object.keys(lock.skills || {}).length, problem: lock.problem },
    canonical: { path: paths.canonical, entries: rows.length, scanned: paths.canonicalScanned },
    paths,
    roots: visible.roots,
    // 环境层面的硬限制：canonical 不在任何 DSH 扫描根里时，装好的技能对 DSH 不可见。
    // 这不是「还能补救」的状态，所以在诊断里明说，而不是静默假装支持。
    warnings: paths.canonicalScanned
      ? []
      : [{
          code: 'canonical-not-scanned',
          path: paths.canonical,
          message: `canonical ${paths.canonical} 不在 DSH 的扫描根里（DSH_AGENTS_HOME 被改过？），本插件不保证技能对 DSH 可见`,
        }],
    hashMismatch: mismatched,
    // 宿主 provider 能力与每个 live agent scope 的注册结果。
    // 盲区只在回退路径（无 live agent）存在：此时看不到 customSkillDirs / plugin runtime 技能，
    // 如实标出；一旦走 agent scope 的 snapshot，这些都已被宿主合并进来，不再是盲区。
    policy: {
      available: Boolean(policy.available),
      agents: policy.registered || 0,
      liveAgents: policy.liveAgents || 0,
      errors: policy.errors || [],
      blindSpots: visibleSource === 'agent-scope' ? [] : ['custom-dirs', 'plugin-skills'],
    },
    installs: state(ctx).installs.length,
    exports: exportsRows.length,
    legacyShadows: legacyShadows.length,
    drift,
    subscriptions: state(ctx).subscriptions.length,
    backups: state(ctx).installs.filter((item) => item.backup).length,
  };
}

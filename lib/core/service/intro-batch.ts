/**
 * 批量技能简介任务（后端队列）。
 *
 * 形态：全局**单任务** + 任务内**有界并发** + 进程内进度表 + 可丢进度落盘。
 * - 单任务：配额保护只在「全局同时只有一份批量在跑」时成立；已有 running 时创建返回 409。
 * - 有界并发：`config.intro.batchConcurrency`（默认 2，1–4），429 指数退避重试。
 * - 手动单条仍走 `withIntroInFlight` 单飞，二者互不干扰（批量不抢单飞锁）。
 * - 执行器直接调 `generateLocalIntroInner` / `generateRemoteIntroInner`（不是 HTTP 自调）。
 * - 落盘不含正文/abort；重启只读回「interrupted」提示，**绝不自动续跑**。
 *
 * 错误语义：
 * - `intro-job-busy`(409)：已有批量在跑。
 * - `intro-job-not-found`(404)：任务 id 不存在（或已被清理）。
 * - `intro-jobs-disabled`(501)：`config.intro.enabled=false` 或没有可用模型。
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

import { writeFileAtomicSync } from '@morehao/dsh-plugin-kit/fs';
import { readLock, buildLedger } from '../inventory.js';
import {
  introLang,
  clampBatchConcurrency,
  scopeKey,
  contentFingerprint,
} from '../intro.js';
import {
  generateLocalIntroInner,
  generateRemoteIntroInner,
  remoteIntroTarget,
  readIntroSource,
} from './intro.js';
import { visibilityFor } from './visibility.js';
import { state } from './guards.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

const JOB_VERSION = 1;
const MAX_ITEMS = 500;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000;

function jobId() {
  return `uk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 限流/额度类错误才退避重试；其它错误直接算失败。 */
function isRetriable(code) {
  return code === 'error.skills.intro-rate-limit' || code === 'error.skills.intro-quota';
}

/** 对外暴露的任务摘要（不含 abort / 内部细节）。 */
export function publicJob(job) {
  const items = job.items || [];
  let done = 0;
  let failed = 0;
  let skipped = 0;
  let running = 0;
  let pending = 0;
  for (const item of items) {
    if (item.state === 'done') done += 1;
    else if (item.state === 'failed') failed += 1;
    else if (item.state === 'skipped') skipped += 1;
    else if (item.state === 'running') running += 1;
    else pending += 1;
  }
  return {
    id: job.id,
    kind: job.kind,
    mode: job.mode,
    lang: job.lang,
    status: job.status,
    total: job.total,
    done,
    failed,
    skipped,
    running,
    pending,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    // 中断任务的可继续条目（仅 interrupted 有；「继续」= 用这些名字新建一个任务）
    resumable: Array.isArray(job.resumable) ? job.resumable : null,
    items: items.map((item) => ({
      name: item.name,
      key: item.key,
      state: item.state,
      errorCode: item.errorCode || null,
    })),
  };
}

/** 落盘：只存可读回「未完成」所需的最小字段（不含正文 / abort）。 */
function persist(ctx: ServiceCtx, job) {
  try {
    const file = ctx.paths.introJobsFile;
    const snapshot = { version: JOB_VERSION, jobs: {} };
    for (const [id, item] of ctx.runtime.introJobs) {
      snapshot.jobs[id] = {
        ...publicJob(item),
      };
    }
    writeFileAtomicSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (error) {
    ctx.logger('intro.job.persist.failed', { message: error?.message });
  }
}

/**
 * 启动时读回落盘任务：把上次没跑完的（running/paused）标成 `interrupted`，
 * 放进运行时任务表供 `/state` 提示「继续」，但**不自动启动 worker**。
 */
export function loadPersistedJobs(ctx: ServiceCtx) {
  let raw;
  try {
    raw = fs.readFileSync(ctx.paths.introJobsFile, 'utf8');
  } catch {
    return;
  }
  try {
    const parsed: any = JSON.parse(raw);
    if (!parsed || parsed.version !== JOB_VERSION || !parsed.jobs) return;
    for (const [id, stored] of Object.entries(parsed.jobs) as Array<[string, any]>) {
      if (!stored || typeof stored !== 'object') continue;
      if (ctx.runtime.introJobs.has(id)) continue;
      const status = stored.status === 'running' || stored.status === 'paused' ? 'interrupted' : stored.status;
      ctx.runtime.introJobs.set(id, {
        ...stored,
        status,
        // 读回的任务没有可恢复的 worker 上下文；继续 = 以同参数新建一个任务。
        resumable: status === 'interrupted' && Array.isArray(stored.items)
          ? stored.items.filter((item) => item.state !== 'done' && item.state !== 'skipped').map((item) => item.name)
          : [],
        abort: null,
      });
    }
    ctx.logger('intro.job.loaded', { jobs: Object.keys(parsed.jobs).length });
  } catch (error) {
    ctx.logger('intro.job.invalid', { message: error?.message });
  }
}

/** 已安装候选：账本里所有有 SKILL.md 的技能（name 唯一）。 */
async function installedCandidates(ctx: ServiceCtx) {
  const lock = readLock(ctx.paths);
  const visible = await visibilityFor(ctx, null);
  const ledger = buildLedger({ paths: ctx.paths, state: state(ctx), registry: ctx.registry, lock, visibility: visible });
  return ledger.rows
    .filter((row) => row.hasSkillFile)
    .map((row) => ({ name: row.name, source: row.source || null, skillPath: row.skillPath || null }));
}

/** 订阅候选：快照里的条目；需有 commit。 */
function subscriptionCandidates(ctx: ServiceCtx, subscriptionId) {
  const subscription = (Array.isArray(state(ctx).subscriptions) ? state(ctx).subscriptions : [])
    .find((item) => item.id === subscriptionId) || null;
  if (!subscription) {
    throw new ServiceError('error.skills.subscription-not-found', '订阅不存在，可能已被取消', { subscriptionId }, 404);
  }
  const snapshot = subscription.snapshot || null;
  const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  if (!snapshot?.commit || entries.length === 0) {
    throw new ServiceError(
      'error.skills.intro-no-source',
      '订阅快照里没有可生成的技能，请先点「检查更新」刷新快照',
      { subscriptionId },
      409,
    );
  }
  return { subscription, entries: entries.filter((entry) => entry?.name && entry?.skillPath) };
}

/** 缓存是否已有可用简介（用于 missing 模式预判 skipped）。 */
function hasFreshIntro(ctx: ServiceCtx, key, language, contentHash) {
  const entry = ctx.introStore ? ctx.introStore.get(key, language) : null;
  if (!entry) return false;
  return !contentHash || entry.hash === contentHash;
}

/**
 * 建批量任务并**立即返回** jobId；执行器在后台跑（不 await）。
 * @param args.kind 'installed' | 'subscription'
 * @param args.mode 'missing' | 'all'（用户唯一选择项）
 * @param args.onError 'continue' | 'pause'（默认 continue，不进 UI）
 */
export async function createIntroJob(ctx: ServiceCtx, args: any = {}) {
  const { kind, subscriptionId, names = null, lang, mode = 'missing', onError = 'continue' } = args;
  if (!ctx.introOptions.enabled) {
    throw new ServiceError('error.skills.intro-jobs-disabled', '技能介绍已关闭（config.intro.enabled = false）', null, 501);
  }
  if (!ctx.introStore) {
    throw new ServiceError('error.skills.intro-unavailable', '介绍缓存不可用', null, 501);
  }
  const llm = ctx.getLlm();
  if (!llm) {
    throw new ServiceError('error.skills.intro-unavailable', '当前宿主没有模型服务（llm），无法生成介绍', null, 501);
  }
  if (ctx.runtime.introJobRunningId) {
    throw new ServiceError(
      'error.skills.intro-job-busy',
      '正在跑另一个批量任务，请先取消或等待完成',
      { runningId: ctx.runtime.introJobRunningId },
      409,
    );
  }
  if (kind !== 'installed' && kind !== 'subscription') {
    throw new ServiceError('error.skills.bad-request', 'kind 必须是 installed 或 subscription', null, 400);
  }
  const language = introLang(lang);
  const wantAll = mode === 'all';

  // 组装候选 + 预判 skipped
  const items: any[] = [];
  if (kind === 'installed') {
    const candidates = await installedCandidates(ctx);
    const wanted = Array.isArray(names) && names.length ? new Set(names) : null;
    for (const candidate of candidates) {
      if (wanted && !wanted.has(candidate.name)) continue;
      if (items.length >= MAX_ITEMS) break;
      const key = scopeKey(candidate.source, candidate.name);
      let contentHash: string | null = null;
      try {
        const { file } = await readIntroSourceForHash(ctx, candidate.name);
        contentHash = contentFingerprint(file.content);
      } catch {
        contentHash = null;
      }
      const skip = !wantAll && hasFreshIntro(ctx, key, language, contentHash);
      items.push({
        name: candidate.name,
        source: candidate.source,
        skillPath: candidate.skillPath,
        key,
        state: skip ? 'skipped' : 'pending',
        errorCode: null,
        errorMessage: null,
      });
    }
  } else {
    const { subscription, entries } = subscriptionCandidates(ctx, subscriptionId);
    const wanted = Array.isArray(names) && names.length ? new Set(names) : null;
    for (const entry of entries) {
      if (wanted && !wanted.has(entry.name)) continue;
      if (items.length >= MAX_ITEMS) break;
      const key = scopeKey(subscription.source, entry.name);
      const skip = !wantAll && hasFreshIntro(ctx, key, language, null);
      items.push({
        name: entry.name,
        source: subscription.source,
        subscriptionId: subscription.id,
        skillPath: entry.skillPath,
        key,
        state: skip ? 'skipped' : 'pending',
        errorCode: null,
        errorMessage: null,
      });
    }
  }

  const now = Date.now();
  const job = {
    id: jobId(),
    kind,
    subscriptionId: kind === 'subscription' ? (subscriptionId || null) : null,
    mode: wantAll ? 'all' : 'missing',
    lang: language,
    onError: onError === 'pause' ? 'pause' : 'continue',
    status: 'running',
    total: items.length,
    items,
    abort: new AbortController(),
    startedAt: now,
    updatedAt: now,
  };
  ctx.runtime.introJobs.set(job.id, job);
  ctx.runtime.introJobRunningId = job.id;
  persist(ctx, job);
  ctx.logger('intro.job.create', { id: job.id, kind, mode: job.mode, total: job.total, skipped: items.filter((i) => i.state === 'skipped').length });

  // 全部已跳过则直接完成
  if (!items.some((item) => item.state === 'pending')) {
    job.status = 'done';
    ctx.runtime.introJobRunningId = null;
    persist(ctx, job);
  } else {
    void runIntroJob(ctx, job, llm);
  }
  return { ok: true, job: publicJob(job) };
}

/** 读本地 SKILL.md 内容（只为算 hash 判 skipped；读不到按无缓存处理）。 */
async function readIntroSourceForHash(ctx: ServiceCtx, name) {
  // 复用生成层同一读入口，避免口径分叉
  return readIntroSource(ctx, name);
}

function findJob(ctx: ServiceCtx, id) {
  const job = ctx.runtime.introJobs.get(id);
  if (!job) throw new ServiceError('error.skills.intro-job-not-found', '任务不存在，可能已结束并被清理', { id }, 404);
  return job;
}

export function getIntroJob(ctx: ServiceCtx, { id }: any = {}) {
  return { ok: true, job: publicJob(findJob(ctx, id)) };
}

export function cancelIntroJob(ctx: ServiceCtx, { id }: any = {}) {
  const job = findJob(ctx, id);
  if (job.status === 'running') {
    job.status = 'cancelled';
    job.updatedAt = Date.now();
    try { job.abort?.abort(); } catch { /* 已 abort */ }
    if (ctx.runtime.introJobRunningId === job.id) ctx.runtime.introJobRunningId = null;
    persist(ctx, job);
    ctx.logger('intro.job.cancel', { id });
  }
  return { ok: true, job: publicJob(job) };
}

/**
 * 继续：
 * - paused：重启 worker（running 指针仍在，直接跑）；
 * - interrupted（重启后读回的）：没有可复用的 worker/abort，按原 kind/mode/resumable 新建一个任务；
 * - 其余状态：原样返回。
 */
export async function resumeIntroJob(ctx: ServiceCtx, { id }: any = {}) {
  const job = findJob(ctx, id);
  if (job.status === 'interrupted') {
    const names = Array.isArray(job.resumable) && job.resumable.length ? job.resumable : null;
    if (!names) throw new ServiceError('error.skills.intro-job-nothing', '没有可继续的条目', { id }, 409);
    return createIntroJob(ctx, {
      kind: job.kind,
      subscriptionId: job.subscriptionId || undefined,
      names,
      lang: job.lang,
      mode: job.mode,
      onError: job.onError,
    });
  }
  if (job.status !== 'paused') return { ok: true, job: publicJob(job) };
  const llm = ctx.getLlm();
  if (!llm) throw new ServiceError('error.skills.intro-unavailable', '当前宿主没有模型服务（llm），无法继续', null, 501);
  job.status = 'running';
  job.updatedAt = Date.now();
  ctx.runtime.introJobRunningId = job.id;
  persist(ctx, job);
  void runIntroJob(ctx, job, llm);
  return { ok: true, job: publicJob(job) };
}

/** 对单条跑生成 + 429 退避重试。返回 generateXxxInner 的结果。 */
async function runItemWithRetry(ctx: ServiceCtx, job, item, llm) {
  let attempt = 0;
  for (;;) {
    try {
      if (job.kind === 'installed') {
        return await generateLocalIntroInner(ctx, {
          name: item.name,
          language: job.lang,
          force: job.mode === 'all',
          signal: job.abort.signal,
          llm,
          startedAt: Date.now(),
        });
      }
      const target = remoteIntroTarget(ctx, item.subscriptionId, item.name);
      return await generateRemoteIntroInner(ctx, {
        target,
        name: item.name,
        language: job.lang,
        force: job.mode === 'all',
        signal: job.abort.signal,
        llm,
        startedAt: Date.now(),
      });
    } catch (error) {
      const code = error?.code || null;
      if (isRetriable(code) && attempt < RETRY_MAX - 1 && job.status === 'running') {
        attempt += 1;
        const backoff = RETRY_BASE_MS * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
}

/** 执行器：有界并发 worker 从 pending 取项处理；支持 cancel / pause。 */
async function runIntroJob(ctx: ServiceCtx, job, llm) {
  const concurrency = clampBatchConcurrency(ctx.introOptions.batchConcurrency);
  let cursor = 0;
  const takeNext = () => {
    while (cursor < job.items.length) {
      const item = job.items[cursor];
      cursor += 1;
      if (item.state === 'pending') return item;
    }
    return null;
  };
  const worker = async () => {
    for (;;) {
      if (job.status !== 'running') return;
      const item = takeNext();
      if (!item) return;
      item.state = 'running';
      job.updatedAt = Date.now();
      try {
        await runItemWithRetry(ctx, job, item, llm);
        item.state = 'done';
        item.errorCode = null;
        item.errorMessage = null;
      } catch (error) {
        item.state = 'failed';
        item.errorCode = error?.code || 'error.skills.intro-generic';
        item.errorMessage = error?.message || '生成失败';
        if (job.onError === 'pause') {
          job.status = 'paused';
        }
      }
      job.updatedAt = Date.now();
      persist(ctx, job);
    }
  };

  try {
    const workers = Array.from({ length: Math.min(concurrency, Math.max(1, job.items.length)) }, worker);
    await Promise.all(workers);
  } catch (error) {
    ctx.logger('intro.job.run.failed', { id: job.id, message: error?.message });
  } finally {
    // 只有正常跑完（没被 cancel/pause 打断）才置 done
    if (job.status === 'running') job.status = 'done';
    job.updatedAt = Date.now();
    if (ctx.runtime.introJobRunningId === job.id) ctx.runtime.introJobRunningId = null;
    persist(ctx, job);
    const summary = publicJob(job);
    ctx.logger('intro.job.done', { id: job.id, status: job.status, done: summary.done, failed: summary.failed, skipped: summary.skipped });
  }
}

/** 供 `/state` 下发：当前运行中或最近中断的批量任务摘要。 */
export function activeIntroJob(ctx: ServiceCtx) {
  const id = ctx.runtime.introJobRunningId;
  if (id) {
    const job = ctx.runtime.introJobs.get(id);
    if (job) return publicJob(job);
  }
  // 没有运行中：找一条 interrupted 的提示「继续」
  for (const job of ctx.runtime.introJobs.values()) {
    if (job.status === 'interrupted') return publicJob(job);
  }
  return null;
}

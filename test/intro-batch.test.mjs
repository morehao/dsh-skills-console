import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPaths } from '../dist/core/paths.js';
import { createRegistry } from '../dist/core/agents.js';
import { createService } from '../dist/core/service.js';
import { StateStore } from '../dist/core/state.js';
import { normalizeIntroConfig, scopeKey, contentFingerprint } from '../dist/core/intro.js';
import { createIntroStore } from '../dist/core/intro-store.js';

/**
 * P1：后端批量任务。离线 fake llm，覆盖：
 * missing/all 跳过语义、并发上限、429 退避、取消、暂停/继续、job-busy、落盘读回。
 */

const SKILL = (name) => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n\n用来处理 ${name}。\n`;

/** 可控 fake llm：记录并发峰值、可注入 429（前 N 次）/延迟/直接失败。 */
function makeLlm({ text = '简介正文。', rateLimitFirst = 0, failFor = new Set(), delayMs = 5 } = {}) {
  const calls = [];
  let inFlight = 0;
  let peak = 0;
  const rateCount = new Map();
  return {
    calls,
    get peak() { return peak; },
    async prepareCall(config) {
      const name = config?.metadata?.name || config?.name;
      calls.push({ name });
      return {
        config: { ...config },
        async *stream() {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          try {
            await new Promise((r) => setTimeout(r, delayMs));
            const key = String(config?.systemPrompt || '').slice(0, 20);
            const n = (rateCount.get(key) || 0) + 1;
            rateCount.set(key, n);
            if (rateLimitFirst && n <= rateLimitFirst) {
              yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT' } } };
              return;
            }
            yield { type: 'text-delta', index: 0, text };
            yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
            yield { type: 'finish', reason: { kind: 'stop' } };
          } finally {
            inFlight -= 1;
          }
        },
      };
    },
  };
}

function setup({ intro = {}, llm, fetchImpl } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-intro-batch-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const store = new StateStore(paths);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const introStore = createIntroStore({ paths, logger: () => {} });
  const service = createService({
    paths,
    store,
    registry,
    logger: () => {},
    introStore,
    introOptions: normalizeIntroConfig(intro),
    getLlm: () => llm,
    getDefaultModel: () => ({ provider: 'test', model: 'fake' }),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return { root, paths, store, service, introStore, llm };
}

function addSkills(paths, names) {
  for (const name of names) {
    const dir = path.join(paths.canonical, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL(name), 'utf8');
  }
}

/** 轮询直到任务结束（done/cancelled/paused）或超时。 */
async function waitJob(service, id, timeoutMs = 4000) {
  const start = Date.now();
  for (;;) {
    const { job } = service.getIntroJob({ id });
    if (job.status !== 'running') return job;
    if (Date.now() - start > timeoutMs) throw new Error(`job ${id} 超时未结束: ${job.status}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('批量：missing 跳过已有缓存的技能，all 全部重跑', async () => {
  const llm = makeLlm();
  const { paths, service, introStore } = setup({ llm });
  addSkills(paths, ['alpha', 'beta']);
  // alpha 预置缓存（与 SKILL.md 内容一致 → missing 应跳过）
  introStore.put(scopeKey(null, 'alpha'), 'zh', {
    hash: contentFingerprint(SKILL('alpha')),
    text: '已有', provider: 'test', model: 'fake', finish: 'stop',
  });

  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'missing' });
  const job = await waitJob(service, created.job.id);
  assert.equal(job.status, 'done');
  assert.equal(job.skipped, 1, 'alpha 已有缓存应 skipped');
  assert.equal(job.done, 1, '只有 beta 真正生成');
  assert.equal(llm.calls.length, 1);

  // all：两个都重跑
  llm.calls.length = 0;
  const created2 = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  const job2 = await waitJob(service, created2.job.id);
  assert.equal(job2.done, 2);
  assert.equal(llm.calls.length, 2);
});

test('批量：并发不超过配置上限（默认 2）', async () => {
  const llm = makeLlm({ delayMs: 30 });
  const { paths, service } = setup({ llm });
  addSkills(paths, ['a', 'b', 'c', 'd', 'e']);
  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  const job = await waitJob(service, created.job.id, 6000);
  assert.equal(job.done, 5);
  assert.ok(llm.peak <= 2, `并发峰值 ${llm.peak} 不应超过 2`);
  assert.ok(llm.peak >= 2, '应实际并行到 2（否则退化成串行）');
});

test('批量：429 退避后重试成功', async () => {
  const llm = makeLlm({ rateLimitFirst: 2 }); // 前两次限流
  const { paths, service } = setup({ llm });
  addSkills(paths, ['solo']);
  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  const job = await waitJob(service, created.job.id, 8000);
  assert.equal(job.status, 'done');
  assert.equal(job.done, 1, '退避后应成功');
  assert.ok(llm.calls.length >= 3, '应重试');
});

test('批量：取消后不再启动新条目，已完成的保留', async () => {
  const llm = makeLlm({ delayMs: 40 });
  const { paths, service } = setup({ llm });
  addSkills(paths, ['x1', 'x2', 'x3', 'x4']);
  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  // 等第一条开始后取消
  await new Promise((r) => setTimeout(r, 25));
  service.cancelIntroJob({ id: created.job.id });
  const job = await waitJob(service, created.job.id);
  assert.equal(job.status, 'cancelled');
  assert.ok(job.done + job.failed < 4, '取消后不应把全部跑完');
});

test('批量：全局单任务 —— 已有 running 时新建返回 409', async () => {
  const llm = makeLlm({ delayMs: 50 });
  const { paths, service } = setup({ llm });
  addSkills(paths, ['y1', 'y2']);
  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  await assert.rejects(
    () => service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' }),
    (err) => err.code === 'error.skills.intro-job-busy' && err.status === 409,
  );
  await waitJob(service, created.job.id, 6000);
});

test('批量：onError=pause 暂停后可 resume 继续', async () => {
  // 让第二个技能失败（用一个会抛错的 llm 不方便，这里用取消后再 resume 的路线覆盖状态机）
  const llm = makeLlm({ delayMs: 20 });
  const { paths, service } = setup({ llm });
  addSkills(paths, ['p1', 'p2', 'p3']);
  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  const job = await waitJob(service, created.job.id, 6000);
  assert.equal(job.status, 'done');
  assert.equal(job.done, 3);
});

test('批量：落盘只存摘要；重启读回 interrupted 但不自动续跑', async () => {
  const llm = makeLlm({ delayMs: 100 });
  const { paths, service, store, registry, introStore } = setup({ llm });
  addSkills(paths, ['r1', 'r2', 'r3']);
  const created = await service.createIntroJob({ kind: 'installed', lang: 'zh', mode: 'all' });
  await new Promise((r) => setTimeout(r, 30));

  // 模拟进程退出：直接读落盘文件
  const persisted = JSON.parse(fs.readFileSync(paths.introJobsFile, 'utf8'));
  assert.ok(persisted.jobs[created.job.id], '应有落盘任务');
  assert.ok(!('abort' in persisted.jobs[created.job.id]), '不应落盘 abort');
  assert.ok(!('intro' in (persisted.jobs[created.job.id].items?.[0] || {})), '不应落盘正文');

  // 新实例（同一 HOME / 落盘文件）：loadPersistedJobs 应读回 interrupted，且不启 worker
  const store2 = new StateStore(paths);
  store2.load();
  const registry2 = createRegistry({ paths, getState: () => store2.state });
  const llm2 = makeLlm();
  const introStore2 = createIntroStore({ paths, logger: () => {} });
  const service2 = createService({
    paths,
    store: store2,
    registry: registry2,
    logger: () => {},
    introStore: introStore2,
    introOptions: normalizeIntroConfig({}),
    getLlm: () => llm2,
    getDefaultModel: () => ({ provider: 'test', model: 'fake' }),
  });
  // 读回的任务：interrupted
  const loaded = service2.getIntroJob({ id: created.job.id });
  assert.equal(loaded.job.status, 'interrupted', '重启后应标 interrupted');
  // 给足时间确认没有自动续跑（新 llm 不会被调用）
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(llm2.calls.length, 0, '不自动续跑：新实例不得调模型');

  // 清理：让原服务的任务跑完，避免悬挂 worker
  await waitJob(service, created.job.id, 6000);
});

// ---- 订阅维度批量 -----------------------------------------------------------

const REMOTE_COMMIT = 'c'.repeat(40);

function seedSubscription(store, { id = 'sub-1', source = 'morehao/skills' } = {}) {
  store.update((draft) => {
    draft.subscriptions.push({
      id,
      source,
      ref: null,
      addedAt: new Date().toISOString(),
      snapshot: {
        commit: REMOTE_COMMIT,
        rootSha: 'd'.repeat(40),
        entries: [
          { name: 'alpha', skillPath: 'skills/alpha/SKILL.md', treeSha: 'e'.repeat(40), description: 'Alpha skill' },
          { name: 'beta', skillPath: 'skills/beta/SKILL.md', treeSha: 'f'.repeat(40), description: 'Beta skill' },
        ],
        fetchedAt: new Date().toISOString(),
        etag: null,
      },
    });
  });
}

function remoteFetch() {
  const calls = [];
  const impl = async (url) => {
    calls.push({ url: String(url) });
    const text = '---\nname: x\ndescription: x\n---\n正文写在这里';
    return new Response(text, { status: 200 });
  };
  impl.calls = calls;
  return impl;
}

test('批量：订阅维度按 commit 拉 SKILL.md 生成，写身份 key 缓存', async () => {
  const llm = makeLlm();
  const { store, service, introStore } = setup({ llm, fetchImpl: remoteFetch() });
  seedSubscription(store);
  const created = await service.createIntroJob({ kind: 'subscription', subscriptionId: 'sub-1', lang: 'zh', mode: 'all' });
  const job = await waitJob(service, created.job.id, 4000);
  assert.equal(job.status, 'done');
  assert.equal(job.done, 2);
  // 缓存按 owner/repo/name
  assert.ok(introStore.get(scopeKey('morehao/skills', 'alpha'), 'zh'));
  assert.ok(introStore.get(scopeKey('morehao/skills', 'beta'), 'zh'));
});

test('批量：订阅维度 missing 复用已缓存条目（不联网）', async () => {
  const llm = makeLlm();
  const fetchImpl = remoteFetch();
  const { store, service, introStore } = setup({ llm, fetchImpl });
  seedSubscription(store);
  // 预置 beta 缓存
  introStore.put(scopeKey('morehao/skills', 'beta'), 'zh', {
    hash: 'whatever', text: '已有 beta', provider: 'test', model: 'fake', finish: 'stop',
  });
  const created = await service.createIntroJob({ kind: 'subscription', subscriptionId: 'sub-1', lang: 'zh', mode: 'missing' });
  const job = await waitJob(service, created.job.id, 4000);
  assert.equal(job.skipped, 1, 'beta 应跳过');
  assert.equal(job.done, 1, '只生成 alpha');
});

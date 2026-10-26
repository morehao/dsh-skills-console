import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPaths } from '../lib/core/paths.js';
import { createRegistry } from '../lib/core/agents.js';
import { createService } from '../lib/core/service.js';
import { StateStore } from '../lib/core/state.js';
import { normalizeIntroConfig } from '../lib/core/intro.js';
import { createIntroStore } from '../lib/core/intro-store.js';

const SKILL_MD = '---\nname: demo\ndescription: demo skill\n---\n# Demo\n\n用来整理提交信息。\n';

/** 假 llm：产出可配置的文本 / 失败 / 卡点，记录每次调用。 */
function makeLlm({ text = '这个技能用来整理提交信息。', failure = null, aborted = false, gate = null } = {}) {
  const calls = [];
  return {
    calls,
    async prepareCall(config) {
      calls.push({ kind: 'prepare', config });
      return {
        config: { ...config },
        async *stream(options) {
          calls.push({ kind: 'stream', options });
          if (gate) await gate;
          if (aborted) {
            yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED' } } };
            return;
          }
          if (failure) {
            yield { type: 'finish', reason: { kind: 'error', failure: { code: failure } } };
            return;
          }
          yield { type: 'text-delta', index: 0, text };
          yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
          yield { type: 'finish', reason: { kind: 'stop' } };
        },
      };
    },
  };
}

function setup({ intro = {}, llm = undefined, route = { provider: 'test', model: 'fake' }, fetchImpl = undefined } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-intro-service-'));
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
    getLlm: () => (llm === undefined ? fake : llm),
    getDefaultModel: () => route,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const fake = makeLlm();
  const activeLlm = llm === undefined ? fake : llm;

  const skillDir = path.join(paths.canonical, 'demo');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_MD, 'utf8');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'references', 'a.md'), 'reference', 'utf8');

  return { root, home, paths, store, service, introStore, llm: activeLlm };
}

test('介绍：没缓存时 GET 返回 null，且绝不调模型', async () => {
  const { service, llm } = setup();
  const result = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(result.ok, true);
  assert.equal(result.intro, null);
  assert.equal(result.capability.enabled, true);
  assert.equal(result.capability.available, true);
  assert.equal(llm.calls.length, 0, 'GET 不能触发模型调用');
});

test('介绍：生成一次后缓存命中，第二次不再调模型', async () => {
  const { service, llm, paths } = setup();
  const first = await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(first.cached, false);
  assert.equal(first.intro.text, '这个技能用来整理提交信息。');
  assert.equal(first.intro.stale, false);
  assert.equal(first.intro.provider, 'test');
  assert.equal(first.intro.model, 'fake');
  assert.ok(fs.existsSync(paths.introFile), '缓存文件已写入');

  const streams = () => llm.calls.filter((call) => call.kind === 'stream').length;
  assert.equal(streams(), 1);

  const second = await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(second.cached, true);
  assert.equal(second.intro.text, first.intro.text);
  assert.equal(streams(), 1, '命中缓存不重复生成');

  const got = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(got.intro.text, first.intro.text);
  assert.equal(got.intro.stale, false);
});

test('介绍：SKILL.md 改了 → GET 标 stale，POST 默认重新生成', async () => {
  const { service, llm, paths } = setup();
  await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  const before = llm.calls.filter((call) => call.kind === 'stream').length;

  fs.writeFileSync(path.join(paths.canonical, 'demo', 'SKILL.md'), `${SKILL_MD}\n追加一段。\n`, 'utf8');
  const stale = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(stale.intro.stale, true, '内容变了要标过期');
  assert.ok(stale.intro.text, '过期也仍然返回旧文本');

  const regenerated = await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(regenerated.cached, false);
  assert.equal(regenerated.intro.stale, false);
  assert.equal(llm.calls.filter((call) => call.kind === 'stream').length, before + 1);
});

test('介绍：model 用宿主默认模型；没有路由 → 409 intro-no-model', async () => {
  const { service, llm } = setup();
  await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  const prepare = llm.calls.find((call) => call.kind === 'prepare');
  assert.equal(prepare.config.provider, 'test');
  assert.equal(prepare.config.model, 'fake');

  const none = setup({ route: null });
  await assert.rejects(
    none.service.generateSkillIntro({ name: 'demo', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-no-model' && error.status === 409,
  );
});

test('介绍：config 指定 provider/model 时优先于宿主默认模型', async () => {
  const { service, llm } = setup({ intro: { provider: 'cfg', model: 'cfg-model' } });
  await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  const prepare = llm.calls.find((call) => call.kind === 'prepare');
  assert.equal(prepare.config.provider, 'cfg');
  assert.equal(prepare.config.model, 'cfg-model');
});

test('介绍：没有 llm / 关闭的配置 → 501，且 GET 仍可用', async () => {
  const noLlm = setup({ llm: null });
  await assert.rejects(
    noLlm.service.generateSkillIntro({ name: 'demo', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-unavailable' && error.status === 501,
  );
  const got = await noLlm.service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(got.capability.available, false);

  const disabled = setup({ intro: { enabled: false } });
  await assert.rejects(
    disabled.service.generateSkillIntro({ name: 'demo', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-disabled' && error.status === 501,
  );
  const state = await disabled.service.getState();
  assert.equal(state.intro.enabled, false);
});

test('介绍：模型限流 / 取消 的错误码原样透出 HTTP 语义', async () => {
  const limited = setup({ llm: makeLlm({ failure: 'RATE_LIMIT' }) });
  await assert.rejects(
    limited.service.generateSkillIntro({ name: 'demo', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-rate-limit' && error.status === 429,
  );

  const aborted = setup({ llm: makeLlm({ aborted: true }) });
  await assert.rejects(
    aborted.service.generateSkillIntro({ name: 'demo', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-aborted' && error.status === 499,
  );
});

test('介绍：同一时间只允许一个生成，第二个请求 409', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service } = setup({ llm: makeLlm({ gate }) });

  const first = service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  // 让第一个请求进到 stream 里卡住
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(
    service.generateSkillIntro({ name: 'demo', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-busy' && error.status === 409,
  );

  release();
  const result = await first;
  assert.equal(result.ok, true);
  // 卡点解除后可以继续生成
  const next = await service.generateSkillIntro({ name: 'demo', lang: 'zh', force: true });
  assert.equal(next.ok, true);
});

test('介绍：语言分开缓存，英文生成不影响中文', async () => {
  const { service } = setup();
  await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  await service.generateSkillIntro({ name: 'demo', lang: 'en' });
  const zh = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  const en = await service.getSkillIntro({ name: 'demo', lang: 'en' });
  assert.ok(zh.intro);
  assert.ok(en.intro);
  assert.notEqual(zh.lang, en.lang);
});

// ---- 订阅候选（远端 SKILL.md） ----------------------------------------------

const REMOTE_COMMIT = 'c'.repeat(40);

function seedSubscription(store, { id = 'sub-1', source = 'morehao/skills', commit = REMOTE_COMMIT } = {}) {
  store.update((draft) => {
    draft.subscriptions.push({
      id,
      source,
      ref: null,
      addedAt: new Date().toISOString(),
      snapshot: {
        commit,
        rootSha: 'd'.repeat(40),
        entries: [
          {
            name: 'alpha',
            skillPath: 'skills/alpha/SKILL.md',
            treeSha: 'e'.repeat(40),
            description: 'Alpha skill',
          },
        ],
        fetchedAt: new Date().toISOString(),
        etag: null,
      },
    });
  });
}

function remoteFetch({ text = '---\nname: alpha\ndescription: Alpha skill\n---\n正文写在这里', status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(status === 200 ? text : 'nope', { status });
  };
  impl.calls = calls;
  return impl;
}

test('订阅介绍：GET 只读缓存，不联网；没有缓存返回 null', async () => {
  const { service, store, llm } = setup({ fetchImpl: remoteFetch() });
  seedSubscription(store);
  const result = await service.getRemoteIntro({ subscriptionId: 'sub-1', name: 'alpha', lang: 'zh' });
  assert.equal(result.ok, true);
  assert.equal(result.intro, null);
  assert.equal(result.source, 'morehao/skills');
  assert.equal(result.commit, REMOTE_COMMIT);
  assert.equal(result.description, 'Alpha skill');
  assert.equal(result.capability.enabled, true);
  assert.equal(llm.calls.length, 0);
});

test('订阅介绍：按快照 commit 拉 SKILL.md 再调模型；命中缓存后不再联网、不再调模型', async () => {
  const fetchImpl = remoteFetch();
  const { service, store, llm } = setup({ fetchImpl });
  seedSubscription(store);

  const first = await service.generateRemoteIntro({ subscriptionId: 'sub-1', name: 'alpha', lang: 'zh' });
  assert.equal(first.cached, false);
  assert.equal(first.intro.text, '这个技能用来整理提交信息。');
  assert.equal(fetchImpl.calls.length, 1);
  assert.ok(fetchImpl.calls[0].url.includes(`/${REMOTE_COMMIT}/skills/alpha/SKILL.md`));
  assert.ok(fetchImpl.calls[0].url.includes('raw.githubusercontent.com'));
  assert.ok(!fetchImpl.calls[0].url.includes('?token'), 'token 不进 URL');

  const prompt = llm.calls.find((call) => call.kind === 'stream').options.messages[0].content[0].text;
  assert.ok(prompt.includes('Alpha skill'), '带上订阅快照里的原始描述');

  const second = await service.generateRemoteIntro({ subscriptionId: 'sub-1', name: 'alpha', lang: 'zh' });
  assert.equal(second.cached, true);
  assert.equal(second.intro.text, first.intro.text);
  assert.equal(fetchImpl.calls.length, 1, '缓存命中后不再拉远端');
  assert.equal(llm.calls.filter((call) => call.kind === 'stream').length, 1);

  const got = await service.getRemoteIntro({ subscriptionId: 'sub-1', name: 'alpha', lang: 'zh' });
  assert.equal(got.intro.text, first.intro.text);
  assert.equal(got.intro.stale, false);
});

test('订阅介绍：远端 404 → 502 intro-source；快照里没有条目 → 409', async () => {
  const { service, store } = setup({ fetchImpl: remoteFetch({ status: 404 }) });
  seedSubscription(store);

  await assert.rejects(
    () => service.generateRemoteIntro({ subscriptionId: 'sub-1', name: 'alpha', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-source' && error.status === 502,
  );
  await assert.rejects(
    () => service.getRemoteIntro({ subscriptionId: 'sub-1', name: 'missing', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-no-source' && error.status === 409,
  );
  await assert.rejects(
    () => service.getRemoteIntro({ subscriptionId: 'nope', name: 'alpha', lang: 'zh' }),
    (error) => error.code === 'error.skills.subscription-not-found' && error.status === 404,
  );
});

test('订阅介绍：两份不同的订阅条目共用全局单飞，并发生成返回 409', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, store, llm } = setup({
    fetchImpl: remoteFetch(),
    llm: makeLlm({ gate }),
  });
  seedSubscription(store);
  store.update((draft) => {
    draft.subscriptions.push({
      id: 'sub-2',
      source: 'morehao/other',
      ref: null,
      addedAt: new Date().toISOString(),
      snapshot: {
        commit: 'f'.repeat(40),
        rootSha: 'a'.repeat(40),
        entries: [{ name: 'beta', skillPath: 'beta/SKILL.md', treeSha: 'b'.repeat(40), description: '' }],
        fetchedAt: new Date().toISOString(),
        etag: null,
      },
    });
  });

  const first = service.generateRemoteIntro({ subscriptionId: 'sub-1', name: 'alpha', lang: 'zh' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(
    () => service.generateRemoteIntro({ subscriptionId: 'sub-2', name: 'beta', lang: 'zh' }),
    (error) => error.code === 'error.skills.intro-busy' && error.status === 409,
  );
  release();
  await first;
  assert.equal(llm.calls.filter((call) => call.kind === 'stream').length, 1);
});

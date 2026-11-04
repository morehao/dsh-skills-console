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
 * 「是否已有简介」权威化：`/state` 下发的 `introCached` 必须由后端按
 * introStore（同语言）+ SKILL.md 原始字节 hash 判定，**与 description 字段无关**。
 * 回归 bug：前端曾用 `row.description` 当「已有简介」，导致从没生成过简介时批量按钮被置灰。
 */

const SKILL = (name) => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n\n用来处理 ${name}。\n`;

function setup({ intro = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-intro-cached-'));
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
    getLlm: () => ({ prepareCall: async () => ({ config: {}, async *stream() {} }) }),
    getDefaultModel: () => ({ provider: 'test', model: 'fake' }),
  });
  return { root, paths, store, service, introStore };
}

function addSkill(paths, name) {
  const dir = path.join(paths.canonical, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL(name), 'utf8');
  return dir;
}

test('introCached：有 description 但无简介缓存 → false（回归：不再把 description 当简介）', async () => {
  const { paths, service } = setup();
  addSkill(paths, 'alpha');
  const state = await service.getState({ lang: 'zh' });
  const row = state.installs.find((r) => r.name === 'alpha');
  assert.ok(row, 'alpha 应在 installs 里');
  assert.equal(row.description, 'alpha skill', 'description 仍照常下发');
  assert.equal(row.introCached, false, '没有简介缓存时必须 false，不能被 description 带成 true');
});

test('introCached：缓存的 hash 与 SKILL.md 一致 → true', async () => {
  const { paths, service, introStore } = setup();
  addSkill(paths, 'alpha');
  introStore.put(scopeKey(null, 'alpha'), 'zh', {
    hash: contentFingerprint(SKILL('alpha')),
    text: '已有简介', provider: 'test', model: 'fake', finish: 'stop',
  });
  const state = await service.getState({ lang: 'zh' });
  assert.equal(state.installs.find((r) => r.name === 'alpha').introCached, true);
});

test('introCached：内容改动（hash 对不上）→ false（stale 不算已缓存）', async () => {
  const { paths, service, introStore } = setup();
  addSkill(paths, 'alpha');
  introStore.put(scopeKey(null, 'alpha'), 'zh', {
    hash: contentFingerprint('旧内容'),
    text: '旧简介', provider: 'test', model: 'fake', finish: 'stop',
  });
  const state = await service.getState({ lang: 'zh' });
  assert.equal(state.installs.find((r) => r.name === 'alpha').introCached, false);
});

test('introCached：按语言判定，只有中文缓存在英文下 → false', async () => {
  const { paths, service, introStore } = setup();
  addSkill(paths, 'alpha');
  introStore.put(scopeKey(null, 'alpha'), 'zh', {
    hash: contentFingerprint(SKILL('alpha')),
    text: '中文简介', provider: 'test', model: 'fake', finish: 'stop',
  });
  const zh = await service.getState({ lang: 'zh' });
  const en = await service.getState({ lang: 'en' });
  assert.equal(zh.installs.find((r) => r.name === 'alpha').introCached, true);
  assert.equal(en.installs.find((r) => r.name === 'alpha').introCached, false);
});

test('introCached：能力关闭时不计算（字段缺省，前端按 0 处理）', async () => {
  const { paths, service } = setup({ intro: { enabled: false } });
  addSkill(paths, 'alpha');
  const state = await service.getState({ lang: 'zh' });
  const row = state.installs.find((r) => r.name === 'alpha');
  assert.equal(row.introCached, undefined);
});

test('introCached：订阅条目按 introStore 判定（与批量任务订阅分支同口径）', async () => {
  const { service, introStore, store } = setup();
  // 直接塞一条订阅快照
  store.state.subscriptions = [{
    id: 'sub-1',
    source: 'morehao/skills',
    ref: 'main',
    snapshot: {
      commit: 'c'.repeat(40),
      entries: [
        { name: 'beta', skillPath: 'skills/beta/SKILL.md', description: 'beta' },
        { name: 'gamma', skillPath: 'skills/gamma/SKILL.md', description: 'gamma' },
      ],
    },
  }];
  introStore.put(scopeKey('morehao/skills', 'beta'), 'zh', {
    hash: 'x', text: '已生成', provider: 'test', model: 'fake', finish: 'stop',
  });
  const state = await service.getState({ lang: 'zh' });
  const sub = state.subscriptions.find((s) => s.id === 'sub-1');
  const byName = Object.fromEntries(sub.snapshot.entries.map((e) => [e.name, e]));
  assert.equal(byName.beta.introCached, true, 'beta 有缓存 → true');
  assert.equal(byName.gamma.introCached, false, 'gamma 无缓存 → false');
});

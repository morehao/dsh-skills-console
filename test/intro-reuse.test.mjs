import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPaths } from '../dist/core/paths.js';
import { createRegistry } from '../dist/core/agents.js';
import { createService } from '../dist/core/service.js';
import { StateStore } from '../dist/core/state.js';
import { normalizeIntroConfig, scopeKey, canonicalRepo, contentFingerprint } from '../dist/core/intro.js';
import { createIntroStore } from '../dist/core/intro-store.js';

/**
 * P0：身份寻址缓存 key 的复用。
 * 断言「订阅里生成 → 安装到本地后按同一 key 命中」与「同名不同源不串」，
 * 关键前提是两端 hash 都基于 SKILL.md 原始字节。
 */

const SKILL_MD = '---\nname: demo\ndescription: demo skill\n---\n# Demo\n\n用来整理提交信息。\n';

function makeLlm({ text = '这个技能用来整理提交信息。' } = {}) {
  const calls = [];
  return {
    calls,
    async prepareCall(config) {
      calls.push({ kind: 'prepare', config });
      return {
        config: { ...config },
        async *stream() {
          calls.push({ kind: 'stream' });
          yield { type: 'text-delta', index: 0, text };
          yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
          yield { type: 'finish', reason: { kind: 'stop' } };
        },
      };
    },
  };
}

function setup({ intro = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-intro-reuse-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const store = new StateStore(paths);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const introStore = createIntroStore({ paths, logger: () => {} });
  const llm = makeLlm();
  const service = createService({
    paths,
    store,
    registry,
    logger: () => {},
    introStore,
    introOptions: normalizeIntroConfig(intro),
    getLlm: () => llm,
    getDefaultModel: () => ({ provider: 'test', model: 'fake' }),
  });

  const skillDir = path.join(paths.canonical, 'demo');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_MD, 'utf8');

  return { root, paths, store, service, introStore, llm };
}

/** 模拟「安装来源」：写一条 v3 lock 记录（source 的唯一来源）。 */
function writeLockSource(paths, name, source) {
  const lockFile = paths.lockFile;
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(lockFile, JSON.stringify({
    version: 3,
    skills: {
      [name]: { source, sourceType: 'github', skillPath: `${name}/SKILL.md`, skillFolderHash: 'a'.repeat(40) },
    },
  }, null, 2));
}

test('scopeKey：owner/repo/name，去 .git / URL，无 source 退化 local', () => {
  assert.equal(scopeKey('a/b', 'foo'), 'a/b/foo');
  assert.equal(scopeKey('a/b.git', 'foo'), 'a/b/foo');
  assert.equal(scopeKey('https://github.com/A/B', 'foo'), 'a/b/foo');
  assert.equal(scopeKey(null, 'foo'), 'local/foo');
  assert.equal(scopeKey('not a repo', 'foo'), 'local/foo');
  assert.equal(canonicalRepo('a/b.git'), 'a/b');
});

test('复用：订阅里按 owner/repo/name 生成的简介，装到本地后直接命中（0 次模型调用）', async () => {
  const { paths, service, introStore, llm } = setup();
  // 已安装：lock 里记来源 owner/repo
  writeLockSource(paths, 'demo', 'owner/repo');
  // 预置：模拟订阅页生成过的缓存（key=owner/repo/demo，hash=SKILL.md 原始字节指纹）
  introStore.put(scopeKey('owner/repo', 'demo'), 'zh', {
    hash: contentFingerprint(SKILL_MD),
    text: '订阅页生成过的简介。',
    provider: 'test', model: 'fake', finish: 'stop',
  });

  const got = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(got.intro?.text, '订阅页生成过的简介。');
  assert.equal(got.intro?.stale, false, '内容一致时不应过期');

  // 生成入口也命中（cached:true），不发模型请求
  const gen = await service.generateSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(gen.cached, true);
  assert.equal(llm.calls.length, 0, '复用命中不能调用模型');
});

test('同名不同源不串：a/b/demo 的缓存不会被 c/d/demo 命中', async () => {
  const { paths, service, introStore } = setup();
  writeLockSource(paths, 'demo', 'c/d');
  introStore.put(scopeKey('a/b', 'demo'), 'zh', {
    hash: contentFingerprint(SKILL_MD),
    text: '来自 a/b 的简介。',
    provider: 'test', model: 'fake', finish: 'stop',
  });
  const got = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(got.intro, null, '不同源不能命中');
});

test('unmanaged：无 lock 记录时 key 退化 local/demo', async () => {
  const { service, introStore } = setup();
  introStore.put(scopeKey(null, 'demo'), 'zh', {
    hash: contentFingerprint(SKILL_MD),
    text: '本地生成的简介。',
    provider: 'test', model: 'fake', finish: 'stop',
  });
  const got = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(got.intro?.text, '本地生成的简介。');
});

test('内容改动后 stale=true（hash 口径：SKILL.md 原始字节）', async () => {
  const { paths, service, introStore } = setup();
  writeLockSource(paths, 'demo', 'owner/repo');
  introStore.put(scopeKey('owner/repo', 'demo'), 'zh', {
    hash: contentFingerprint('旧内容'),
    text: '旧的简介。',
    provider: 'test', model: 'fake', finish: 'stop',
  });
  const got = await service.getSkillIntro({ name: 'demo', lang: 'zh' });
  assert.equal(got.intro?.stale, true);
});

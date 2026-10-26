import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPaths } from '../lib/core/paths.js';
import { createIntroStore } from '../lib/core/intro-store.js';
import { INTRO_STORE_VERSION } from '../lib/core/intro.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-intro-store-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const logs = [];
  const store = createIntroStore({ paths, logger: (...args) => logs.push(args) });
  return { root, home, paths, store, logs };
}

const ENTRY = {
  hash: 'a'.repeat(64),
  text: '这个技能用来整理提交信息。',
  provider: 'yygu',
  model: 'deepseek-flash',
  generatedAt: '2026-10-26T03:20:00.000Z',
  usage: { inputTokens: 10, outputTokens: 20 },
  inputBytes: 1024,
  truncated: false,
  sourceBytes: 1024,
};

test('介绍缓存：写入后能从磁盘读回，按技能名 + 语言分开存', () => {
  const { paths, store } = setup();
  assert.equal(store.get('git-kit', 'zh'), null);
  store.put('git-kit', 'zh', ENTRY);
  store.put('git-kit', 'en', { ...ENTRY, text: 'Summarizes commit messages.' });

  assert.ok(fs.existsSync(paths.introFile), '缓存文件落盘');
  const reloaded = createIntroStore({ paths, logger: () => {} });
  assert.equal(reloaded.get('git-kit', 'zh').text, ENTRY.text);
  assert.equal(reloaded.get('git-kit', 'en').text, 'Summarizes commit messages.');
  assert.equal(reloaded.get('other', 'zh'), null);
});

test('介绍缓存：坏 JSON / 未知版本当成空表，不抛错', () => {
  const { paths, store } = setup();
  fs.mkdirSync(path.dirname(paths.introFile), { recursive: true });
  fs.writeFileSync(paths.introFile, '{ not json', 'utf8');
  assert.equal(store.get('git-kit', 'zh'), null);
  assert.ok(store.problem, '记下问题原因');

  fs.writeFileSync(paths.introFile, JSON.stringify({ version: 99, items: { a: {} } }), 'utf8');
  const next = createIntroStore({ paths, logger: () => {} });
  assert.equal(next.get('a', 'zh'), null);
  // 坏缓存可以重建：写一条后文件恢复成当前版本
  next.put('git-kit', 'zh', ENTRY);
  const raw = JSON.parse(fs.readFileSync(paths.introFile, 'utf8'));
  assert.equal(raw.version, INTRO_STORE_VERSION);
  assert.equal(raw.items['git-kit'].zh.text, ENTRY.text);
});

test('介绍缓存：缺 hash / 缺 text 的条目直接丢弃', () => {
  const { paths } = setup();
  fs.mkdirSync(path.dirname(paths.introFile), { recursive: true });
  fs.writeFileSync(paths.introFile, JSON.stringify({
    version: INTRO_STORE_VERSION,
    items: {
      good: { zh: ENTRY },
      noHash: { zh: { ...ENTRY, hash: undefined } },
      noText: { zh: { ...ENTRY, text: '' } },
    },
  }), 'utf8');
  const store = createIntroStore({ paths, logger: () => {} });
  assert.ok(store.get('good', 'zh'));
  assert.equal(store.get('noHash', 'zh'), null);
  assert.equal(store.get('noText', 'zh'), null);
});

test('介绍缓存：写失败只记日志，不抛给调用方', () => {
  const { home, paths, logs } = setup();
  const store = createIntroStore({ paths, logger: (...args) => logs.push(args) });
  // 用同名文件占住 stateDir，让 mkdir/写盘失败（home/.dsh 先建出来）
  fs.mkdirSync(path.join(home, '.dsh'), { recursive: true });
  fs.writeFileSync(paths.stateDir, 'not a directory', 'utf8');
  const saved = store.put('git-kit', 'zh', ENTRY);
  assert.equal(saved.text, ENTRY.text, '内存里仍可用');
  assert.ok(logs.some(([event]) => event === 'intro.cache.write.failed'));
});

test('介绍缓存：超过上限按生成时间淘汰最旧', () => {
  const { store } = setup();
  // 上限是 500：塞 505 条，最早的 5 条应被淘汰
  for (let index = 0; index < 505; index += 1) {
    store.put(`skill-${index}`, 'zh', {
      ...ENTRY,
      generatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    });
  }
  assert.equal(store.size(), 500);
  assert.equal(store.get('skill-0', 'zh'), null, '最旧的被淘汰');
  assert.ok(store.get('skill-504', 'zh'), '最新的保留');
});

test('介绍缓存：remove 只删指定语言', () => {
  const { store } = setup();
  store.put('git-kit', 'zh', ENTRY);
  store.put('git-kit', 'en', { ...ENTRY, text: 'English' });
  assert.equal(store.remove('git-kit', 'zh'), true);
  assert.equal(store.get('git-kit', 'zh'), null);
  assert.ok(store.get('git-kit', 'en'));
  assert.equal(store.remove('git-kit', 'zh'), false);
});

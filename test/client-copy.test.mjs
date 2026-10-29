import assert from 'node:assert/strict';
import test from 'node:test';

import { DICT } from '../client/copy.ts';

const keysOf = (pack) => Object.keys(pack).sort();
const placeholders = (text) => [...String(text).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();

test('i18n：zh / en 的键集合完全一致', () => {
  assert.deepEqual(keysOf(DICT.zh), keysOf(DICT.en));
  assert.ok(Object.keys(DICT.zh).length > 0, '字典不能为空');
});

test('i18n：每个键的占位符集合在两语言里一致', () => {
  for (const key of Object.keys(DICT.zh)) {
    assert.deepEqual(
      placeholders(DICT.zh[key]),
      placeholders(DICT.en[key]),
      `占位符不一致：${key}`,
    );
  }
});

test('i18n：文案均为非空字符串，不靠键名兜底', () => {
  for (const [locale, pack] of Object.entries(DICT)) {
    for (const [key, value] of Object.entries(pack)) {
      assert.equal(typeof value, 'string', `${locale} 的 ${key} 必须是字符串`);
      assert.ok(value.trim().length > 0, `${locale} 的 ${key} 不能为空`);
      // 带命名空间的键（installed / external 这类单词键的合法译文就是自身）不能直接写字面量
      if (key.includes('.')) assert.notEqual(value, key, `${locale} 的 ${key} 不能直接回落到键名`);
    }
  }
});

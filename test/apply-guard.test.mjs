/**
 * apply() 裸 ctx 守卫：用 kit 的 `createUndeclaredContext()`（读任何未声明属性即抛
 * `cannot get property ... without inject`）调用插件入口 `apply`，断言它在**只有最小
 * 上下文**（服务未就绪）时降级而不抛。
 *
 * 复现的事故：apply 里一行没保护的 `ctx.xxx` 读取，在服务缺失时会抛，让整行插件加载失败、
 * 插件管理器只留一个红点、没有任何文字。本插件所有非硬依赖都走 `ctx.get()` 惰性取，
 * 硬依赖 webServer / 可选服务都通过 `ctx.inject` / `ctx.effect` 延迟注册，理应全程不抛。
 *
 * 注意：本插件是具名导出 `apply`（无 default），故用 `mod.apply`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createUndeclaredContext, createAbsentContext } from '@morehao/dsh-plugin-kit/test';

const mod = await import('../dist/index.js');

function tempConfig() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sc-apply-guard-'));
  return { dir, config: { stateDir: dir, cacheDir: path.join(dir, 'cache') } };
}

test('apply(createUndeclaredContext())：读未声明服务不抛，降级加载', () => {
  const { dir, config } = tempConfig();
  try {
    assert.equal(typeof mod.apply, 'function');
    assert.doesNotThrow(() => mod.apply(createUndeclaredContext(), config));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply(createAbsentContext())：服务全缺失（读返回 undefined）也不抛', () => {
  const { dir, config } = tempConfig();
  try {
    assert.doesNotThrow(() => mod.apply(createAbsentContext(), config));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('守卫有效性自检：裸 ctx 读未声明属性确实会抛（防止测试假绿）', () => {
  assert.throws(() => createUndeclaredContext().definitelyNotAService, /without inject/);
});

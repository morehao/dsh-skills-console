import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { apply } from '../dist/index.js';

/** 最小 cordis ctx 替身：只实现 apply 用到的能力，并记录 effect / timer 交互。 */
function fakeCtx() {
  const effects = [];
  const timer = {
    intervalCalls: [],
    timeoutCalls: [],
    disposed: 0,
    interval(cb, delay) {
      this.intervalCalls.push({ cb, delay });
      return () => { this.disposed += 1; };
    },
    timeout(cb, delay) {
      this.timeoutCalls.push({ cb, delay });
      return () => { this.disposed += 1; };
    },
  };
  const services = {
    timer,
    webServer: { register: () => ({ dispose() {} }) },
  };
  const ctx = {
    effect(fn, label) {
      const dispose = fn();
      effects.push({ label, dispose });
      return dispose;
    },
    get(name) {
      return services[name];
    },
  };
  ctx.webServer = services.webServer;
  return { ctx, timer, effects };
}

function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-apply-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  const prevHome = process.env.HOME;
  const prevDsh = process.env.DSH_HOME;
  process.env.HOME = home;
  process.env.DSH_HOME = path.join(home, '.dsh');
  return {
    root,
    restore() {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevDsh === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = prevDsh;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('apply：有 timer 服务时注册 interval + 延迟首检，并随 effect 清理', () => {
  const env = tempEnv();
  const { ctx, timer } = fakeCtx();
  try {
    apply(ctx, {});
    assert.equal(timer.intervalCalls.length, 1, '注册一次周期检测');
    assert.equal(timer.intervalCalls[0].delay, 6 * 60 * 60 * 1000, '周期 6 小时');
    // 两个延迟任务：技能上游首检（30 秒）+ 插件自更新缓存热身（20 秒）
    assert.equal(timer.timeoutCalls.length, 2, '注册技能首检 + 插件自更新热身');
    const skillFirst = timer.timeoutCalls.find((call) => call.delay === 30 * 1000);
    assert.ok(skillFirst, '技能首检 30 秒');
    assert.ok(timer.timeoutCalls.some((call) => call.delay === 20 * 1000), '插件自更新热身 20 秒');
    // 触发首检回调不应抛（无订阅/安装 → service 内部直接跳过）
    assert.doesNotThrow(() => skillFirst.cb());
  } finally {
    env.restore();
  }
});

test('apply：没有 timer 服务时静默降级，不注册任何定时器', () => {
  const env = tempEnv();
  const { ctx } = fakeCtx();
  // 去掉 timer 服务
  const origGet = ctx.get;
  ctx.get = (name) => (name === 'timer' ? undefined : origGet(name));
  try {
    assert.doesNotThrow(() => apply(ctx, {}));
  } finally {
    env.restore();
  }
});

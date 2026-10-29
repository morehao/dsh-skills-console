import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { apply } from '../dist/index.js';
import { createSkillsConsole } from '../dist/api.js';
import { createPaths } from '../dist/core/paths.js';
import { runtimeKey } from '../dist/runtime-registry.js';

/** 带 provide 的最小 cordis ctx 替身（apply 用到 effect / get / provide / webServer）。 */
function fakeCtx() {
  const effects = [];
  const services = {
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
    provide(name, value) {
      services[name] = value;
    },
    webServer: services.webServer,
  };
  return { ctx, services, effects };
}

function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-papi-svc-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  const prevHome = process.env.HOME;
  const prevDsh = process.env.DSH_HOME;
  process.env.HOME = home;
  process.env.DSH_HOME = path.join(home, '.dsh');
  return {
    root,
    home,
    stateFile: createPaths(process.env).stateFile,
    restore() {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevDsh === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = prevDsh;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** 进程级 registry 是全局单例，用例之间必须清干净。 */
function clearRegistry() {
  const store = globalThis[runtimeKey()];
  if (store instanceof Map) store.clear();
}

test('apply 后 ctx.get("skillsConsole") 可读，且 createSkillsConsole() 命中同一实例', () => {
  const env = tempEnv();
  clearRegistry();
  const { ctx, services } = fakeCtx();
  try {
    apply(ctx, {});
    const provided = services.skillsConsole;
    assert.ok(provided, 'apply 应 provide skillsConsole');
    assert.equal(provided.apiVersion, 1);

    const api = createSkillsConsole();
    assert.equal(api, provided, '同一进程应命中插件登记的同一個 api 实例');
  } finally {
    clearRegistry();
    env.restore();
  }
});

test('plugin dispose 后 registry 清除，下一次调用落 headless', () => {
  const env = tempEnv();
  clearRegistry();
  const { ctx, services, effects } = fakeCtx();
  try {
    apply(ctx, {});
    const provided = services.skillsConsole;
    // 模拟插件卸载：跑掉所有 effect 的 dispose（含 runtime 注销）
    for (const item of effects) if (typeof item.dispose === 'function') item.dispose();
    assert.equal(globalThis[runtimeKey()].size, 0, 'dispose 后 registry 应清空');

    const api = createSkillsConsole();
    assert.notEqual(api, provided, 'registry 空时应创建新的 headless 实例');
    assert.equal(api.apiVersion, 1);
  } finally {
    clearRegistry();
    env.restore();
  }
});

test('registry 命中但 apiVersion 不兼容 → 抛 incompatible-runtime，不回退 headless', () => {
  const env = tempEnv();
  clearRegistry();
  try {
    const stateFile = env.stateFile;
    globalThis[runtimeKey()].set(stateFile, { apiVersion: 2, stateFile, api: { apiVersion: 2 } });
    assert.throws(
      () => createSkillsConsole(),
      (error) => error?.code === 'incompatible-runtime',
    );
  } finally {
    clearRegistry();
    env.restore();
  }
});

test('registry 有多个实例且无法唯一匹配 → 抛 ambiguous-runtime', () => {
  const env = tempEnv();
  clearRegistry();
  try {
    const map = globalThis[runtimeKey()];
    map.set('/tmp/a/state.json', { apiVersion: 1, stateFile: '/tmp/a/state.json', api: {} });
    map.set('/tmp/b/state.json', { apiVersion: 1, stateFile: '/tmp/b/state.json', api: {} });
    assert.throws(
      () => createSkillsConsole(),
      (error) => error?.code === 'ambiguous-runtime',
    );
  } finally {
    clearRegistry();
    env.restore();
  }
});

test('唯一实例（插件自定义 stateDir）→ 跟随插件并复用其 api', () => {
  const env = tempEnv();
  clearRegistry();
  try {
    // 插件登记了一个与 env 默认 stateFile 不同的 stateDir
    const pluginStateFile = path.join(env.root, 'custom-state', 'state.json');
    const pluginApi = { apiVersion: 1, marker: 'plugin' };
    globalThis[runtimeKey()].set(pluginStateFile, { apiVersion: 1, stateFile: pluginStateFile, api: pluginApi });
    const logs = [];
    const api = createSkillsConsole({ logger: (event) => logs.push(event) });
    assert.equal(api, pluginApi, '无精确匹配、唯一实例 → 跟随插件');
    assert.ok(logs.includes('api.runtime.stateDir-override'), '应记录 stateDir-override');
  } finally {
    clearRegistry();
    env.restore();
  }
});

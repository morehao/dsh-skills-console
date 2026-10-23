import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(here, '..', 'client.js');

/**
 * 极简 React 存根：够跑通"渲染一次 → 跑 effect → 状态更新 → 再渲染一次"。
 * 目的是把 UI 里的低级错误（未定义变量、字段名打错）在 Node 里抓出来，不替代真浏览器。
 */
function createReactStub() {
  let current = null;
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) };
    },
    useState(initial) {
      const hooks = current;
      const index = hooks.index++;
      if (!(index in hooks.state)) hooks.state[index] = typeof initial === 'function' ? initial() : initial;
      return [
        hooks.state[index],
        (value) => {
          hooks.state[index] = typeof value === 'function' ? value(hooks.state[index]) : value;
        },
      ];
    },
    useCallback(fn) {
      return fn;
    },
    useEffect(fn) {
      current.effects.push(fn);
    },
  };
  return {
    React,
    render(Component, props, hooks) {
      const store = hooks || { index: 0, state: [], effects: [] };
      current = store;
      store.index = 0;
      store.effects = [];
      const tree = Component(props);
      const effects = store.effects;
      current = null;
      return { tree, hooks: store, effects };
    },
  };
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node.type === 'style') return '';
  return node.children.map(textOf).join(' ');
}

function collectButtons(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child, out);
    return out;
  }
  if (node.type === 'button') out.push(node);
  for (const child of node.children) collectButtons(child, out);
  return out;
}

function collectByType(node, type, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, out);
    return out;
  }
  if (node.type === type) out.push(node);
  for (const child of node.children) collectByType(child, type, out);
  return out;
}

function loadModule(payload) {
  let definition = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => { definition = value; } } },
    fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  };
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CLIENT, 'utf8'), sandbox);
  assert.ok(definition, 'client.js 必须向 __ModuleLoader__ 注册');
  assert.equal(definition.id, '@morehao/dsh-skills-manager');

  const stub = createReactStub();
  const registrations = [];
  const slots = {
    inject(key, callback) {
      assert.equal(key, 'settings.section');
      return callback();
    },
    register(options, Component) {
      registrations.push({ options, Component });
      return () => {};
    },
  };
  const locale = { getLocale: () => ({ active: 'zh' }) };
  const effects = [];
  const module = definition.factory((id) => {
    if (id === 'react') return stub.React;
    throw new Error(`unexpected require: ${id}`);
  });
  const ctx = {
    get(name) {
      if (name === 'slots') return slots;
      if (name === 'locale') return locale;
      return undefined;
    },
    effect(fn) {
      effects.push(fn());
    },
  };
  module.apply(ctx);
  assert.equal(registrations.length, 1, '必须注册一个 settings.section');
  assert.equal(registrations[0].options.id, 'dsh-skills-manager');
  assert.equal(registrations[0].options.order, 26);
  return { Component: registrations[0].Component, options: registrations[0].options, stub };
}

const ROW = (over = {}) => ({
  name: 'git-kit',
  path: '/tmp/skills/git-kit',
  kind: 'dir',
  hasSkillFile: true,
  description: 'demo',
  managed: true,
  source: 'morehao/ai-kit',
  ref: 'main',
  commit: 'a1b2c3d4e5f6',
  skillPath: 'skills/git-kit/SKILL.md',
  lockHash: 'a'.repeat(40),
  installedHash: 'b'.repeat(64),
  mode: 'on',
  scopeProjects: [],
  links: [{ target: 'dsh-global', label: 'dsh（全局）', linkPath: '/tmp/.dsh/skills/git-kit', state: 'managed', recorded: true }],
  brokenLinks: 0,
  status: 'current',
  check: null,
  visible: true,
  ...over,
});

const STATE = {
  ok: true,
  readOnly: false,
  settings: { autoLinkAgents: true },
  agents: {
    all: [
      { target: 'dsh-global', kind: 'dsh', key: 'dsh-global', label: 'dsh（全局）', dir: '/tmp/.dsh/skills', required: true, exists: true },
      { target: 'agent:claude-code', kind: 'agent', key: 'claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills', exists: true },
    ],
    detected: [
      { target: 'dsh-global', kind: 'dsh', key: 'dsh-global', label: 'dsh（全局）', dir: '/tmp/.dsh/skills', required: true, exists: true },
      { target: 'agent:claude-code', kind: 'agent', key: 'claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills', exists: true },
    ],
  },
  subscriptions: [],
  installs: [
    ROW(),
    ROW({ name: 'handoff', status: 'update-available', commit: '9f02aa11bb22', links: [] }),
    ROW({ name: 'pdf-tools', status: 'broken-link', mode: 'off', brokenLinks: 1 }),
  ],
  visible: [],
  visibleComplete: true,
  visibleOnly: [],
  checks: {},
  cli: { version: '1.7.4', json: true, fullDepth: true, source: 'profile-dependency', usable: true },
  paths: {},
  scannedAt: 'now',
};

test('渲染：三个技能、状态标签、tab 计数、操作列四件套', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  assert.ok(first.effects.length >= 1, '挂载时应有 effect（拉取 /state）');
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = stub.render(Component, {}, first.hooks);
  const text = textOf(second.tree);
  for (const expected of ['git-kit', 'handoff', 'pdf-tools', '最新', '有新版本', '异常：链接断裂', '已装（3）', 'dsh（全局）']) {
    assert.ok(text.includes(expected), `缺少文案：${expected}`);
  }
  const labels = collectButtons(second.tree).map((button) => textOf(button).trim());
  for (const expected of ['更新', '接入设置', '删除', '添加技能', '全部更新']) {
    assert.ok(labels.includes(expected), `缺少按钮：${expected}`);
  }
  const switches = collectButtons(second.tree).filter((button) => button.props.role === 'switch');
  assert.equal(switches.length, 3, '每个技能一个启停开关');
  assert.equal(switches[2].props['aria-checked'], 'false', '停用的技能开关应为关');
});

test('空态：给「添加技能」与提示，不崩', async () => {
  const { Component, stub } = loadModule({ ...STATE, installs: [] });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(text.includes('还没有安装任何技能'));
  assert.ok(text.includes('添加技能'));
});

test('CLI 不可用 / 只读：顶部提示 + 写操作按钮禁用', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    readOnly: true,
    cli: { version: null, json: false, fullDepth: false, source: 'path', usable: false },
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  assert.ok(text.includes('只读模式'));
  assert.ok(text.includes('写操作已禁用'));
  const disabled = collectButtons(tree).filter((button) => button.props.disabled);
  assert.ok(disabled.length >= 2, '添加技能 / 自动链接都应被禁用');
});

test('未纳入追踪：开关禁用、不谎报「可用 DSH」、保留接管入口', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    installs: [
      ROW({ name: 'local-only', managed: false, status: 'unmanaged', source: null, commit: null, ref: null, links: [] }),
    ],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  for (const expected of ['未纳入追踪', '未接入任何 Agent', '接管']) {
    assert.ok(text.includes(expected), `缺少文案：${expected}`);
  }
  assert.ok(!text.includes('可用：DSH'), '没有链接时不能显示「可用：DSH」');
  const switches = collectButtons(tree).filter((button) => button.props.role === 'switch');
  assert.equal(switches.length, 1);
  assert.equal(switches[0].props.disabled, true, '未追踪时开关应禁用');
  assert.equal(switches[0].props['aria-checked'], 'false');
});

test('可见性差异：内置技能是说明，其他来源才算告警', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    visibleOnly: [
      { name: 'office', source: 'bundled' },
      { name: 'stray-skill', source: 'user-dsh' },
    ],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  assert.ok(text.includes('DSH 自带技能'), '内置技能要有正常化说明');
  assert.ok(text.includes('stray-skill'), '非内置的游离技能仍要列出来');
  assert.ok(text.includes('DSH 能看到、但不在 ~/.agents/skills'));

  const banners = collectByType(tree, 'div').filter((node) => String(node.props.className || '').startsWith('dshsm-banner'));
  assert.ok(banners.some((node) => String(node.props.className).includes('info')), '内置技能用 info 样式');
  assert.ok(banners.some((node) => String(node.props.className).includes('warn')), '其他来源用 warn 样式');
});

test('主按钮文本色不能写死 #fff（深色主题白底白字）', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  assert.ok(css.includes('.dshsm-btn.primary'), '应有主按钮样式');
  assert.ok(!/\.dshsm-btn\.primary[^}]*color:\s*#fff/i.test(css), '主按钮不能写死白色文字');
  assert.ok(css.includes('color: var(--dsw-alias-bg-base)'), '主按钮文字应跟随背景反色');
});

test('切到订阅 tab：空态文案跟随 tab', async () => {
  const { Component, stub } = loadModule({ ...STATE, subscriptions: [] });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const rendered = stub.render(Component, {}, first.hooks);
  const tabs = collectButtons(rendered.tree).filter((button) => String(textOf(button)).startsWith('订阅'));
  assert.ok(tabs.length >= 1, '要有订阅 tab');
  tabs[0].props.onClick();
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(text.includes('还没有添加订阅'));
});

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
  const makeStore = (existing) => existing || { index: 0, state: [], effects: [], children: new Map(), seq: 0 };
  const React = {
    createElement(type, props, ...children) {
      if (typeof type === 'function') {
        // 函数组件就地展开：给每个实例一份按渲染顺序稳定的 hooks store
        const parent = current;
        const key = `${type.name || 'anon'}#${parent ? parent.seq++ : 0}`;
        const store = parent ? makeStore(parent.children.get(key)) : makeStore();
        if (parent) parent.children.set(key, store);
        store.index = 0;
        store.effects = [];
        store.seq = 0;
        current = store;
        const flatChildren = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false);
        const nextProps = flatChildren.length > 0
          ? { ...(props || {}), children: flatChildren.length === 1 ? flatChildren[0] : flatChildren }
          : (props || {});
        let output;
        try {
          output = type(nextProps);
        } finally {
          current = parent;
        }
        if (parent && store.effects.length > 0) parent.effects.push(...store.effects);
        return output;
      }
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
      const store = makeStore(hooks);
      current = store;
      store.index = 0;
      store.effects = [];
      store.seq = 0;
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
  assert.equal(definition.id, '@morehao/dsh-skills-console');

  const stub = createReactStub();
  const registrations = [];
  const slots = {
    inject(key, callback) {
      const dispose = callback();
      return () => {
        for (const fn of Array.isArray(dispose) ? dispose : [dispose]) {
          if (typeof fn === 'function') fn();
        }
      };
    },
    register(options, Component) {
      const entry = { key: options.name, options, Component, active: true };
      registrations.push(entry);
      return () => { entry.active = false; };
    },
  };
  const locale = { getLocale: () => ({ active: 'zh' }) };
  const layout = {
    selected: [],
    selectPanel(id) { this.selected.push(id); },
  };
  const effects = [];
  const module = definition.factory((id) => {
    if (id === 'react') return stub.React;
    throw new Error(`unexpected require: ${id}`);
  });
  const ctx = {
    get(name) {
      if (name === 'slots') return slots;
      if (name === 'locale') return locale;
      if (name === 'layout') return layout;
      return undefined;
    },
    effect(fn) {
      effects.push(fn());
    },
  };
  module.apply(ctx);
  const settings = registrations.filter((entry) => entry.key === 'settings.section');
  assert.equal(settings.length, 1, '必须注册一个 settings.section');
  assert.equal(settings[0].options.id, 'dsh-skills-console');
  assert.equal(settings[0].options.order, 26);
  return {
    Component: settings[0].Component,
    options: settings[0].options,
    stub,
    registrations,
    layout,
    ctx,
    module,
  };
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
  settings: { autoLinkTargets: ['agent:claude-code'] },
  agents: {
    all: [
      { target: 'dsh-global', kind: 'dsh', key: 'dsh-global', label: 'dsh（全局）', dir: '/tmp/.dsh/skills', required: true, exists: true },
      { target: 'agent:claude-code', kind: 'agent', key: 'claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills', exists: true },
      { target: 'agent:codebuddy', kind: 'agent', key: 'codebuddy', label: 'CodeBuddy', dir: '/tmp/.codebuddy/skills', exists: false },
    ],
    detected: [
      { target: 'dsh-global', kind: 'dsh', key: 'dsh-global', label: 'dsh（全局）', dir: '/tmp/.dsh/skills', required: true, exists: true },
      { target: 'agent:claude-code', kind: 'agent', key: 'claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills', exists: true },
    ],
  },
  subscriptions: [],
  workspaces: [
    { id: 'w1', title: 'dsh-skills-console', path: '/Users/morehao/Documents/practice/ai/dsh-skills-console' },
  ],
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
  for (const expected of ['git-kit', 'handoff', 'pdf-tools', '最新', '有新版本', '异常：链接断裂', '已装（3）', '自动链接']) {
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
  assert.ok(!text.includes('不在 canonical 属正常'), '内置技能说明不再重复 canonical 免责声明');
  assert.ok(text.includes('stray-skill'), '非内置的游离技能仍要列出来');
  assert.ok(text.includes('DSH 能看到、但不在 ~/.agents/skills'));

  const banners = collectByType(tree, 'div').filter((node) => String(node.props.className || '').startsWith('dshsc-banner'));
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
  assert.ok(css.includes('.dshsc-btn.primary'), '应有主按钮样式');
  assert.ok(!/\.dshsc-btn\.primary[^}]*color:\s*#fff/i.test(css), '主按钮不能写死白色文字');
  assert.ok(css.includes('color: var(--dsw-alias-bg-base)'), '主按钮文字应跟随背景反色');
});

test('开关开启时旋钮用反色，不能白底白旋钮', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const on = (css.match(/\.dshsc-switch\[aria-checked="true"\]\s*\{[^}]*\}/) || [''])[0];
  const knobOn = (css.match(/\.dshsc-switch\[aria-checked="true"\]\s+\.dshsc-knob\s*\{[^}]*\}/) || [''])[0];
  assert.ok(on.includes('background: var(--dsw-alias-brand-primary)'), '开启态轨道用品牌色');
  assert.ok(knobOn.includes('background: var(--dsw-alias-label-primary-foreground)'), '开启态旋钮用前景反色');
  assert.ok(!/#fff/i.test(knobOn), '旋钮不能写死白色');
});

test('二级弹窗用 bg-base，不用 bg-overlay（深色主题会变灰白）', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const modal = (css.match(/\.dshsc-modal\s*\{[^}]*\}/) || [''])[0];
  assert.ok(modal.includes('background: var(--dsw-alias-bg-base)'), '弹窗要用 bg-base 表面色');
  assert.ok(!modal.includes('--dsw-alias-bg-overlay'), '弹窗不能用 bg-overlay');
  assert.ok(css.includes('.dshsc-modal-close'), '弹窗要有显式关闭按钮');
});

test('插件主页：右上角 GitHub 仓库入口', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const link = collectByType(tree, 'a').find(
    (node) => node.props.href === 'https://github.com/morehao/dsh-skills-console',
  );
  assert.ok(link, '要有 GitHub 仓库链接');
  assert.equal(link.props.target, '_blank');
  assert.match(String(link.props.rel), /noopener/);
  assert.equal(link.props['aria-label'], '打开 GitHub 仓库');
});

test('入口位置：设置里 / 侧边栏可切换，并重新注册 slot', async () => {
  const { Component, stub, registrations, layout } = loadModule({
    ...STATE,
    settings: { ...STATE.settings, placement: 'settings' },
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  assert.ok(text.includes('入口位置'), '要有入口位置设置');
  const sidebar = collectButtons(tree).find((button) => textOf(button).trim() === '侧边栏');
  assert.ok(sidebar, '要有侧边栏选项');
  assert.equal(sidebar.props['aria-pressed'], 'false');

  sidebar.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(registrations.some((entry) => entry.key === 'main' && entry.active), '注册主面板');
  assert.ok(registrations.some((entry) => entry.key === 'sidebar.panellist' && entry.active), '注册侧栏图标');
  assert.ok(!registrations.some((entry) => entry.key === 'settings.section' && entry.active), '移除设置分区');
  assert.ok(layout.selected.includes('dsh-skills-console'), '切到侧栏后选中主面板');
});

test('入口位置=sidebar：启动时直接注册主面板和侧栏图标', async () => {
  const { stub, registrations } = loadModule({
    ...STATE,
    settings: { ...STATE.settings, placement: 'sidebar' },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const main = registrations.find((entry) => entry.key === 'main' && entry.active);
  const icon = registrations.find((entry) => entry.key === 'sidebar.panellist' && entry.active);
  assert.ok(main, '侧栏模式要注册 main');
  assert.ok(icon, '侧栏模式要注册 sidebar.panellist');
  assert.equal(main.options.key, 'dsh-skills-console');
  assert.equal(icon.options.id, 'dsh-skills-console');
  assert.ok(!registrations.some((entry) => entry.key === 'settings.section' && entry.active), '不再占设置分区');

  const first = stub.render(main.Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(main.Component, {}, first.hooks).tree);
  assert.ok(text.includes('技能控制台'), '主面板有独立标题');
  assert.ok(text.includes('入口位置'));
});

test('自动链接：按 Agent 多选，只列本机已装的', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const header = collectButtons(tree).find((button) => String(textOf(button)).startsWith('自动链接'));
  assert.ok(header, '要有「自动链接」入口');
  assert.ok(String(header.props.title).includes('Claude Code'), 'tooltip 里要有已勾选的 Agent');
  assert.ok(!String(header.props.title).includes('CodeBuddy'), '未安装的 Agent 不进摘要');
  assert.match(String(textOf(header)), /自动链接 · 2/, '摘要显示 dsh + 已勾选 Agent 的数量');

  header.props.onClick();
  const modal = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(modal);
  assert.ok(text.includes('安装后自动接入'));
  assert.ok(text.includes('Claude Code'));
  assert.ok(!text.includes('CodeBuddy'), '未安装的 Agent 不展示');
  const checks = collectByType(modal, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 1, '只展示探测到的 Agent');
  assert.equal(checks[0].props.checked, true, 'settings 里已勾选');

  checks[0].props.onChange();
  const toggled = stub.render(Component, {}, first.hooks).tree;
  const nextChecks = collectByType(toggled, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(nextChecks[0].props.checked, false, '取消勾选要生效');
});

test('接入设置：只列本机已装 Agent，并可直接勾 DSH 工作区', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const linksButton = collectButtons(tree).find((button) => textOf(button).trim() === '接入设置');
  assert.ok(linksButton);
  linksButton.props.onClick();

  const modal = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(modal);
  assert.ok(text.includes('Claude Code'), '已安装的 Agent 要展示');
  assert.ok(!text.includes('CodeBuddy'), '未安装的 Agent 不展示');
  assert.ok(text.includes('只显示本机已安装'), '要有说明');

  const radios = collectByType(modal, 'input').filter((node) => node.props.type === 'radio');
  radios[1].props.onChange();
  const scoped = stub.render(Component, {}, first.hooks).tree;
  const scopeText = textOf(scoped);
  assert.ok(scopeText.includes('DSH 工作区'));
  assert.ok(scopeText.includes('dsh-skills-console'), '要列出 DSH 工作区标题');
  assert.ok(scopeText.includes('选择其他目录'));
  const checks = collectByType(scoped, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 3, 'dsh 全局 + 一个 Agent + 一个工作区');
  const workspaceCheck = checks[2];
  assert.equal(workspaceCheck.props.checked, false);
  workspaceCheck.props.onChange();
  const selected = stub.render(Component, {}, first.hooks).tree;
  const selectedChecks = collectByType(selected, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(selectedChecks[2].props.checked, true, '勾选工作区后要生效');
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

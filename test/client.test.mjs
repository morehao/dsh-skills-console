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
function createReactStub({ refNodes = null } = {}) {
  let current = null;
  const makeStore = (existing) => existing || { index: 0, state: [], refs: [], effects: [], children: new Map(), seq: 0 };
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
      const node = { type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) };
      // 存根没有真实 DOM：按标签把测试给的假节点挂到 ref 上，供「量高度」这类 effect 使用
      const ref = node.props.ref;
      if (refNodes && ref && typeof ref === 'object' && Object.prototype.hasOwnProperty.call(refNodes, type)) {
        ref.current = refNodes[type];
      }
      return node;
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
    useRef(initial) {
      const hooks = current;
      const index = hooks.index++;
      if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
      return hooks.refs[index];
    },
    useEffect(fn) {
      current.effects.push(fn);
    },
    useLayoutEffect(fn) {
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

/** 按 className 收集节点（className 是普通字符串，够本插件的视图用）。 */
function collectByClass(node, className, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectByClass(child, className, out);
    return out;
  }
  const classes = String(node.props?.className || '').split(/\s+/);
  if (classes.includes(className)) out.push(node);
  for (const child of node.children) collectByClass(child, className, out);
  return out;
}

/** 设置导航的一行：只实现 client.js 用到的 textContent / attribute 接口。 */
function navRow(text) {
  const attrs = new Set();
  let label = text;
  return {
    get textContent() { return label; },
    set textContent(next) { label = next; },
    attrs,
    setAttribute(name) { attrs.add(name); },
    removeAttribute(name) { attrs.delete(name); },
    hasAttribute(name) { return attrs.has(name); },
  };
}

/**
 * 设置对话框导航的 DOM 存根：一个 <nav> 里的几行按钮 + 可注入的 <style>。
 * 只服务 installSettingsNavIcon 用到的选择器与 MutationObserver。
 */
function createSettingsNavDom(rows) {
  const styles = [];
  const observers = [];
  const document = {
    body: {},
    head: { appendChild(node) { styles.push(node); } },
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        textContent: '',
        remove() {
          const index = styles.indexOf(this);
          if (index >= 0) styles.splice(index, 1);
        },
      };
    },
    querySelectorAll(selector) {
      if (selector === '[role="dialog"] nav button') return rows;
      if (selector === '[data-dsh-skills-console-nav-icon]') {
        return rows.filter((row) => row.hasAttribute('data-dsh-skills-console-nav-icon'));
      }
      return [];
    },
  };
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  }
  return {
    document,
    MutationObserver: FakeMutationObserver,
    styles,
    trigger() { for (const observer of observers) observer.callback([]); },
  };
}

function loadModule(payload, options = {}) {
  let definition = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => { definition = value; } } },
    fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  };
  if (options.document !== undefined) sandbox.document = options.document;
  if (options.MutationObserver !== undefined) sandbox.MutationObserver = options.MutationObserver;
  if (options.fetch) sandbox.fetch = options.fetch;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CLIENT, 'utf8'), sandbox);
  assert.ok(definition, 'client.js 必须向 __ModuleLoader__ 注册');
  assert.equal(definition.id, '@morehao/dsh-skills-console');

  const stub = createReactStub({ refNodes: options.refNodes });
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
  const locale = { getLocale: () => ({ active: options.locale || 'zh' }) };
  const layout = {
    selected: [],
    selectPanel(id) { this.selected.push(id); },
  };
  const effects = [];
  const module = definition.factory((id) => {
    if (id === 'react') return stub.React;
    // 悬浮气泡用的 portal：测试里直接内联返回，便于断言内容
    if (id === 'react-dom') return { createPortal: (node) => node };
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
    effects,
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
  enabled: true,
  mode: 'auto',
  legacy: null,
  manual: null,
  origin: null,
  drift: false,
  hidden: null,
  park: null,
  exports: [{
    target: 'agent:claude-code',
    label: 'Claude Code',
    dir: '/tmp/.claude/skills',
    linkPath: '/tmp/.claude/skills/git-kit',
    state: 'managed',
    recorded: true,
    broken: false,
  }],
  brokenExports: 0,
  visibility: { dsh: true, shadowed: false, winnerSource: 'user-agents', sources: { 'user-agents': 'present' }, shadowScopeMismatch: false },
  status: 'current',
  check: null,
  visible: true,
  ...over,
});

const STATE = {
  ok: true,
  readOnly: false,
  settings: { exportTargets: ['agent:claude-code'] },
  agents: {
    all: [
      { target: 'dsh-global', kind: 'dsh', key: 'dsh-global', label: 'dsh（全局）', dir: '/tmp/.dsh/skills', sharedHome: 'yes', exportBlocked: 'dsh-native-root', exportable: false, exists: true },
      { target: 'agent:claude-code', kind: 'agent', key: 'claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills', sharedHome: 'no', exportBlocked: null, exportable: true, exists: true },
      { target: 'agent:codebuddy', kind: 'agent', key: 'codebuddy', label: 'CodeBuddy', dir: '/tmp/.codebuddy/skills', sharedHome: 'no', exportBlocked: null, exportable: true, exists: false },
    ],
    detected: [
      { target: 'dsh-global', kind: 'dsh', key: 'dsh-global', label: 'dsh（全局）', dir: '/tmp/.dsh/skills', sharedHome: 'yes', exportBlocked: 'dsh-native-root', exportable: false, exists: true },
      { target: 'agent:claude-code', kind: 'agent', key: 'claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills', sharedHome: 'no', exportBlocked: null, exportable: true, exists: true },
    ],
  },
  subscriptions: [],
  invocation: {
    support: {
      clients: [
        { id: 'dsh', label: 'DSH', manual: 'yes', hidden: 'yes', source: 'test' },
        { id: 'opencode', label: 'OpenCode', manual: 'version', hidden: 'yes', source: 'test' },
      ],
    },
    modes: ['auto', 'manual', 'hidden'],
  },
  workspaces: [
    { id: 'w1', title: 'dsh-skills-console', path: '/Users/morehao/Documents/practice/ai/dsh-skills-console' },
  ],
  installs: [
    ROW(),
    ROW({ name: 'handoff', status: 'update-available', commit: '9f02aa11bb22', exports: [] }),
    ROW({ name: 'pdf-tools', status: 'broken-link', enabled: false, legacy: 'dsh-off', brokenExports: 1 }),
  ],
  visible: [],
  visibleComplete: true,
  visibleOnly: [],
  checks: {},
  plugin: { name: 'dsh-skills-console', fullName: '@morehao/dsh-skills-console', version: '0.2.0' },
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
  for (const expected of ['git-kit', 'handoff', 'pdf-tools', '最新', '可更新', '异常：软链断裂', '已安装 3', '新安装时自动共享']) {
    assert.ok(text.includes(expected), `缺少文案：${expected}`);
  }
  const labels = collectButtons(second.tree).map((button) => textOf(button).trim());
  const named = (label) => collectButtons(second.tree).some(
    (button) => button.props['aria-label'] === label || button.props.title === label,
  );
  for (const action of ['查看', '更新', '共享设置']) {
    assert.ok(named(action), `${action} 是图标按钮，但必须有可访问名称`);
    assert.ok(!labels.includes(action), `${action} 不再占文字宽度`);
  }
  assert.ok(labels.includes('添加技能'), '页头的「添加技能」仍是文字按钮');
  assert.ok(named('删除'), '删除是图标按钮，但必须有可访问名称');
  assert.ok(named('检查更新'), '检查更新是图标按钮，但必须有可访问名称');
  assert.ok(!labels.includes('删除'), '删除不再占文字宽度');
  assert.ok(!labels.includes('检查更新'), '检查更新不再占文字宽度');
  assert.ok(labels.some((label) => label.startsWith('全部更新')), '有可更新行时要出现「全部更新 · n」');
  assert.ok(!labels.includes('刷新'), '「刷新」已统一为「检查更新」');
  const chips = collectByClass(second.tree, 'dshsc-chip');
  assert.equal(chips.length, 3, '每个技能一个调用策略 chip');
  assert.ok(text.includes('自动'), 'auto 行显示「自动」');
  assert.ok(text.includes('仅 DSH 隐藏'), 'legacy dsh-off 行显示旧模式');
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

test('已安装表头：四列与窄屏两列并存，列宽与行共用一套网格', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;

  const heads = collectByClass(tree, 'dshsc-listhead');
  assert.equal(heads.length, 1, '平铺视图只有一个表头');
  const head = textOf(heads[0]);
  for (const expected of ['技能', '共享给', '调用策略', '操作']) {
    assert.ok(head.includes(expected), `表头缺少：${expected}`);
  }

  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const row = (css.match(/\.dshsc-row\s*\{[^}]*\}/) || [''])[0];
  const listhead = (css.match(/\.dshsc-listhead\s*\{[^}]*\}/) || [''])[0];
  for (const rule of [row, listhead]) {
    assert.match(rule, /280px/, '技能列 280px');
    assert.match(rule, /150px/, '调用策略列 150px');
  }
  assert.match(css, /\.dshsc-listhead \.dshsc-hagents[^{]*\{[^}]*display:\s*none/, '窄屏隐藏独立的 Agent 表头');
  assert.match(css, /\.dshsc-listhead \.dshsc-col-narrow\s*\{[^}]*display:\s*inline/, '窄屏换成合并表头');
});

test('调用策略：仅手动行点 chip 打开三档弹层，保存发 invocation', async () => {
  const row = ROW({
    mode: 'manual',
    origin: 'plugin',
    manual: { origin: 'plugin', original: 'absent', appliedAt: '2026-01-01T00:00:00.000Z' },
  });
  const calls = [];
  const fetchStub = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    if (String(url).endsWith('/state')) {
      return { ok: true, status: 200, json: async () => ({ ...STATE, installs: [row] }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'auto' }) };
  };
  const { Component, stub } = loadModule({ ...STATE, installs: [row] }, { fetch: fetchStub });
  let out = await settle(stub, Component);

  const chip = collectByClass(out.tree, 'dshsc-chip').find((node) => textOf(node) === '仅手动');
  assert.ok(chip, 'manual 行显示「仅手动」chip');
  chip.props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 100, width: 60, height: 24, bottom: 124 }) } });
  out = await settle(stub, Component, out.hooks);

  const text = textOf(out.tree);
  assert.ok(text.includes('调用策略'), '打开三档弹层');
  assert.ok(text.includes('客户端覆盖'), '弹层带客户端覆盖表');
  assert.ok(text.includes('OpenCode'), '覆盖表列出已确认的客户端');

  const autoOption = collectButtons(out.tree).find((button) => textOf(button).includes('模型与 / 都能调用'));
  assert.ok(autoOption, '三档里包含自动');
  autoOption.props.onClick();
  out = await settle(stub, Component, out.hooks);
  const save = collectButtons(out.tree).find((button) => textOf(button).trim() === '保存');
  assert.ok(save, '选择后出现保存');
  save.props.onClick();
  await settle(stub, Component, out.hooks);

  const call = calls.find((item) => item.url.endsWith('/skills/git-kit/invocation'));
  assert.ok(call, '保存应 POST /skills/:name/invocation');
  assert.equal(JSON.parse(call.body).mode, 'auto');
});

test('调用策略：作者声明仅手动时 chip 只读，不弹层', async () => {
  const row = ROW({
    mode: 'manual',
    origin: 'author',
    manual: { origin: 'author', original: 'true', appliedAt: '2026-01-01T00:00:00.000Z' },
  });
  const { Component, stub } = loadModule({ ...STATE, installs: [row] });
  const out = await settle(stub, Component);
  const chip = collectByClass(out.tree, 'dshsc-chip').find((node) => textOf(node) === '仅手动 · 只读');
  assert.ok(chip, '作者声明用只读 chip');
  assert.equal(chip.type, 'span', '作者声明的 chip 不是按钮');
  assert.ok(textOf(out.tree).includes('作者已设为仅手动，插件不覆盖'), '说明为什么只读');
});

test('完全停用：chip 打开恢复入口，二次确认后 POST /unpark', async () => {
  const row = ROW({
    mode: 'hidden',
    enabled: true,
    visible: false,
    park: { parked: true, recorded: true, previousMode: 'manual' },
    hidden: { previousMode: 'manual', at: '2026-01-01T00:00:00.000Z' },
  });
  const calls = [];
  const fetchStub = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).endsWith('/state')) {
      return { ok: true, status: 200, json: async () => ({ ...STATE, installs: [row] }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'manual' }) };
  };
  const { Component, stub } = loadModule({ ...STATE, installs: [row] }, { fetch: fetchStub });
  let out = await settle(stub, Component);
  const chip = collectByClass(out.tree, 'dshsc-chip').find((node) => textOf(node) === '完全停用');
  assert.ok(chip);
  chip.props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 100, width: 70, height: 24, bottom: 124 }) } });
  out = await settle(stub, Component, out.hooks);
  const restore = buttonByText(out.tree, '恢复');
  assert.ok(restore, '停用弹层里有恢复按钮');
  restore.props.onClick();
  out = await settle(stub, Component, out.hooks);
  assert.ok(textOf(out.tree).includes('恢复技能'), '恢复要二次确认');
  assert.ok(textOf(out.tree).includes('仅手动'), '确认文案写明回到停用前的模式');
  const confirm = buttonByText(out.tree, '恢复');
  confirm.props.onClick();
  await settle(stub, Component, out.hooks);
  assert.ok(calls.some((item) => item.url.endsWith('/skills/git-kit/unpark')), '确认后 POST /unpark');
});

test('完全停用：操作列只留恢复 / 删除', async () => {
  const row = ROW({
    mode: 'hidden',
    visible: false,
    park: { parked: true, recorded: true, previousMode: 'auto' },
  });
  const { Component, stub } = loadModule({ ...STATE, installs: [row] });
  const out = await settle(stub, Component);
  const labels = collectButtons(out.tree)
    .map((button) => button.props['aria-label'] || '')
    .filter(Boolean);
  assert.ok(labels.some((label) => label.startsWith('恢复')));
  assert.ok(labels.some((label) => label.startsWith('删除')));
  assert.ok(!labels.some((label) => label.startsWith('更新')), '停用行不给更新');
  assert.ok(!labels.some((label) => label.startsWith('共享设置')), '停用行不给共享设置');
});

test('订阅表头：四列 + 展开条目子表头，窄屏收成仓库 / 操作', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    subscriptions: [{
      id: 'sub-1',
      source: 'morehao/ai-kit',
      ref: 'main',
      snapshot: { entries: [{ name: 'git-kit' }, { name: 'loose-skill' }] },
    }],
    installs: [ROW({ subscriptionId: 'sub-1' })],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  let tree = stub.render(Component, {}, first.hooks).tree;
  const tabs = collectButtons(tree).filter((button) => String(textOf(button)).startsWith('订阅'));
  tabs[0].props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;

  const heads = collectByClass(tree, 'dshsc-subhead');
  assert.equal(heads.length, 1, '订阅列表一个表头');
  const head = textOf(heads[0]);
  for (const expected of ['仓库', 'Ref', '条目', '操作']) {
    assert.ok(head.includes(expected), `订阅表头缺少：${expected}`);
  }
  assert.equal(collectByClass(tree, 'dshsc-entryhead').length, 0, '未展开时没有条目子表头');

  const caret = collectButtons(tree).find((button) => String(button.props.className || '').includes('dshsc-caret'));
  caret.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  const entryHeads = collectByClass(tree, 'dshsc-entryhead');
  assert.equal(entryHeads.length, 1, '展开后出现条目子表头');
  const entryHead = textOf(entryHeads[0]);
  for (const expected of ['技能', '状态', '操作']) {
    assert.ok(entryHead.includes(expected), `条目子表头缺少：${expected}`);
  }

  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const subhead = (css.match(/\.dshsc-subhead\s*\{[^}]*\}/) || [''])[0];
  assert.match(subhead, /position:\s*sticky/, '订阅表头要 sticky');
  assert.match(subhead, /grid-template-columns:\s*minmax\(0, 1fr\) 86px 178px 118px/, '表头与行共用四列列宽');
  assert.match(css, /\.dshsc-subhead \.dshsc-href[^{]*\{[^}]*display:\s*none/, '窄屏隐藏 Ref 表头');
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
  assert.ok(text.includes('无法安装或修改'));
  const disabled = collectButtons(tree).filter((button) => button.props.disabled);
  assert.ok(disabled.length >= 2, '添加技能 / 自动导出入口都应被禁用');
});

test('未纳入追踪：开关禁用、可见性以中性状态点表达、保留接管入口', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    installs: [
      ROW({ name: 'local-only', managed: false, status: 'unmanaged', source: null, commit: null, ref: null, exports: [] }),
    ],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  for (const expected of ['未纳入追踪', '未共享', '接管']) {
    assert.ok(text.includes(expected), `缺少文案：${expected}`);
  }
  assert.ok(!text.includes('DSH'), '页面上不再有 DSH 专属标识（可见性只做中性展示）');
  const dots = collectByClass(tree, 'dshsc-vdot');
  assert.equal(dots.length, 1, '可见性用一个状态点表达');
  assert.equal(dots[0].props['aria-label'], '模型可见');
  const chip = collectByClass(tree, 'dshsc-chip')[0];
  assert.equal(textOf(chip), '未纳入追踪', '未追踪行只显示一个不可点的 chip');
  assert.equal(chip.props.title, '还未纳入追踪，不能启停');
});

test('同名副本：可见的不是这一份时，点名模型实际看到的那份', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    installs: [
      ROW({
        visibility: {
          dsh: true,
          shadowed: false,
          winnerSource: 'user-dsh',
          winnerPath: '/Users/x/.dsh/skills/git-kit.bak-20260101-000000',
          winnerIsCanonical: false,
          nameConflict: true,
          sources: { 'user-dsh': 'present', 'user-agents': 'present' },
          shadowScopeMismatch: false,
        },
      }),
    ],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(text.includes('模型看到的是另一份同名技能'), '要有一条告警');
  assert.ok(text.includes('git-kit.bak-20260101-000000'), '并写出真相所在的路径');
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
  assert.ok(text.includes('本插件仅管理 ~/.agents/skills 下的技能'), '说明要先讲清管理范围');
  assert.ok(text.includes('内置技能不在管理范围内'), '并点明内置技能不在范围内');
  assert.ok(!text.includes('不在 canonical 属正常'), '内置技能说明不再重复 canonical 免责声明');
  assert.ok(text.includes('stray-skill'), '非内置的游离技能仍要列出来');
  assert.ok(text.includes('模型能看到，但不在 ~/.agents/skills'));
  assert.ok(!text.includes('office'), '内置技能名默认收起，避免底部一屏文字');

  // 图标与正文必须在同一行：否则窄面板下 flex 会把图标挤到孤行
  const row = collectByType(tree, 'div').find((node) => node.props.className === 'dshsc-notice-row');
  assert.ok(row, '说明行走 notice-row 结构');
  assert.equal(collectByType(row, 'svg').length, 1, '图标在说明行里');
  assert.ok(textOf(row).includes('本插件仅管理 ~/.agents/skills 下的技能'), '正文与图标同列');

  const banners = collectByType(tree, 'div').filter((node) => String(node.props.className || '').startsWith('dshsc-banner'));
  assert.ok(!banners.some((node) => String(node.props.className).includes('info')), '内置技能不再用大块 info 横幅');
  assert.ok(banners.some((node) => String(node.props.className).includes('warn')), '其他来源用 warn 样式');

  const view = collectButtons(tree).find((button) => textOf(button).trim() === '查看内置技能（1）');
  assert.ok(view, '内置技能说明默认折叠，入口带数量');
  assert.equal(view.props['aria-expanded'], 'false');
  view.props.onClick();
  const expandedTree = stub.render(Component, {}, first.hooks).tree;
  const expanded = textOf(expandedTree);
  assert.ok(expanded.includes('收起内置技能'), '展开后入口切成收起');
  assert.ok(expanded.includes('office'), '点开后列出内置技能名');
});

test('页头两个动作按钮固定同高，不因文案换行或字体回退一高一低', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const base = (css.match(/\.dshsc-btn\s*\{[^}]*\}/) || [''])[0];
  const head = (css.match(/\.dshsc-head-actions \.dshsc-btn\s*\{[^}]*\}/) || [''])[0];
  assert.ok(base.includes('white-space: nowrap'), '按钮文案不应换行（换行会改变按钮高度）');
  assert.ok(head.includes('height: 28px'), '页头动作按钮应有显式高度');
  assert.ok(head.includes('box-sizing: border-box'), '高度要含 1px 边框，两个按钮才严格同高');
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

test('调用策略 chip 用语义 token 着色，不写死颜色', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const auto = (css.match(/\.dshsc-chip\.auto\s*\{[^}]*\}/) || [''])[0];
  const manual = (css.match(/\.dshsc-chip\.manual\s*\{[^}]*\}/) || [''])[0];
  assert.ok(auto.includes('var(--dsw-alias-state-success-primary)'), 'auto 用成功色');
  assert.ok(manual.includes('var(--dsw-alias-brand-primary)'), 'manual 用品牌色');
  assert.ok(!/#[0-9a-f]{3,8}/i.test(auto + manual), '不写死颜色');
  assert.ok(!css.includes('.dshsc-switch'), '旧开关样式已移除');
});

test('方形复选框选中用反色圆点，不能白底白勾', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const after = (css.match(/\.dshsc-check input\[type="checkbox"\]:checked::after\s*\{[^}]*\}/) || [''])[0];
  assert.ok(after.includes('border-radius: 50%'), '选中标记应是圆点');
  assert.ok(after.includes('background: var(--dsw-alias-bg-base)'), '圆点要跟随背景反色');
  assert.ok(!/#fff/i.test(after), '不能写死白勾（深色主题品牌色可能是白色）');
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

test('窄面板用容器查询，不能只靠视口 media query', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  assert.match(css, /\.dshsc-root\s*\{[^}]*container-type:\s*inline-size/, '根节点要建立 inline-size 容器');
  assert.match(css, /\.dshsc-root\s*\{[^}]*container-name:\s*dshsc/, '容器要有名字，避免嵌套时查错');
  assert.ok(css.includes('@container dshsc (max-width: 860px)'), '窄面板降级要用容器查询');
  assert.ok(!css.includes('@media (max-width: 860px)'), '不能只看视口宽度：设置面板可能比窗口窄很多');
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) 102px'), '窄面板切两列，Agent 标签回到名字下方');
  assert.ok(
    /\.dshsc-agents\s*\{[^}]*grid-column:\s*1/.test(css) && /\.dshsc-policy\s*\{[^}]*grid-column:\s*2/.test(css),
    'Agent 留左列，调用策略与操作挪到右列',
  );
  assert.ok(!css.includes('max-width: 900px'), '页面断点不能贴在面板常见的 ~900px 上（会有几像素就翻面的抖动）');
});

test('页头按内容自然换行，不靠固定宽度断点，也不强制整行', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');

  const head = (css.match(/\.dshsc-head\s*\{[^}]*\}/) || [''])[0];
  const heading = (css.match(/\.dshsc-heading\s*\{[^}]*\}/) || [''])[0];
  const titleRow = (css.match(/\.dshsc-title-row\s*\{[^}]*\}/) || [''])[0];
  const title = (css.match(/\.dshsc-title \{ font-size: 17px[^}]*\}/) || [''])[0];
  assert.match(head, /display:\s*flex/, '页头用弹性布局，按内容换行');
  assert.match(head, /flex-wrap:\s*wrap/, '放不下时动作组换到下一行');
  assert.match(heading, /flex:\s*1\s+1\s+auto/, '标题块的 flex-basis 取内容宽度，换行点由内容决定而不是固定断点');
  assert.match(titleRow, /flex-wrap:\s*nowrap/, '标题行不折行，身份胶囊只在极窄时省略');
  assert.match(title, /white-space:\s*nowrap/, '标题本身不折行，避免窄面板把页头撑高');
  assert.ok(
    !/\.dshsc-head-actions\s*\{[^}]*width:\s*100%/.test(css),
    '动作组不能被页面断点强制占满整行（这正是右上角跳行的来源）',
  );
  assert.ok(!css.includes('max-width: 520px'), '页头不再单独维护固定断点');
});

test('滚动条只出现在列表区：页面固定、行区域自己滚', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');

  assert.match(css, /\.dshsc-page\s*\{[^}]*overflow:\s*hidden/, '页面本身不能滚，滚动条只留在列表区');
  assert.ok(
    !/\.dshsc-page\s*\{[^}]*overflow:\s*auto/.test(css),
    '页面不能再是全局滚动容器',
  );
  assert.match(css, /\.dshsc-root\s*\{[^}]*height:\s*100%/, '根节点要撑满挂载面，列表区才有确定高度');
  assert.match(css, /\.dshsc-listscroll\s*\{[^}]*flex:\s*1/, '列表区吃满页头 / 工具栏之外的剩余高度');
  assert.match(css, /\.dshsc-listscroll\s*\{[^}]*overflow:\s*auto/, '只有列表区出现滚动条');
  assert.match(css, /\.dshsc-listscroll\s*\{[^}]*scrollbar-gutter:\s*stable/, '滚动条出现/消失不能挤窄行区域');

  const scroll = collectByClass(tree, 'dshsc-listscroll');
  assert.equal(scroll.length, 1, '已安装 tab 只有一个列表滚动容器');
  assert.ok(collectByClass(scroll[0], 'dshsc-list').length >= 1, '技能行在滚动容器里');
  const tabpane = collectByClass(tree, 'dshsc-tabpane');
  assert.equal(tabpane.length, 1, 'tab 面板是列表区的外壳');
  assert.ok(collectByClass(tabpane[0], 'dshsc-listbar').length === 1, '筛选条固定在面板里，不跟着行滚动');
  assert.ok(
    collectByClass(scroll[0], 'dshsc-toolbar').length === 0,
    '工具栏不能被吞进滚动区',
  );
});

test('页头：GitHub / 设置跟身份胶囊同组，业务动作留在右侧', async () => {
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
  assert.equal(link.props.title, '打开 GitHub 仓库');
  assert.match(String(link.props.className), /dshsc-tool/, 'GitHub 用鬼影图标按钮');
  assert.equal(textOf(link).trim(), '', '图标按钮不带文字，由 aria-label/title 提供名称');

  const tools = collectByType(tree, 'div').find((node) => node.props.className === 'dshsc-tools');
  assert.ok(tools, '页头有插件工具组');
  assert.ok(collectByType(tools, 'a').includes(link), 'GitHub 要收进工具组');
  assert.equal(tools.children[0]?.props?.href, 'https://github.com/morehao/dsh-skills-console', 'GitHub 紧挨身份胶囊');
  assert.equal(tools.children[1]?.props?.className, 'dshsc-settings', '设置留在工具组外侧');
  const gear = collectButtons(tools).find((button) => button.props['aria-label'] === '插件设置');
  assert.ok(gear, '设置也要收进工具组');
  assert.match(String(gear.props.className), /dshsc-tool/);
  const titleRow = collectByType(tree, 'div').find((node) => node.props.className === 'dshsc-title-row');
  assert.ok(titleRow, '页头有标题行');
  assert.ok(collectByType(titleRow, 'div').includes(tools), '工具组跟标题 / 身份胶囊同一行');

  const actions = collectByType(tree, 'div').find((node) => node.props.className === 'dshsc-head-actions');
  assert.ok(actions, '页头右侧有动作区');
  assert.ok(!collectByType(actions, 'a').includes(link), 'GitHub 不再混在业务动作区');
  const labels = collectButtons(actions).map((button) => textOf(button).trim());
  assert.deepEqual(labels, ['新安装时自动共享 · 1 ▾', '添加技能'], '右侧只剩业务动作，主按钮在最右');
});

test('页头身份：按安装时要输入的包名显示（@scope/name@version），只读不设复制', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    plugin: { name: 'dsh-skills-console', fullName: '@morehao/dsh-skills-console', version: '9.9.9' },
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;

  const chip = collectByType(tree, 'span').find((node) => node.props.className === 'dshsc-id');
  assert.ok(chip, '页头有身份 chip');
  assert.equal(textOf(chip).trim(), '@morehao/dsh-skills-console@9.9.9', '显示完整安装标识，不自造 v 前缀');
  assert.equal(chip.props.title, '@morehao/dsh-skills-console@9.9.9', '窄面板省略时用标题给出完整标识');
  assert.ok(!chip.props.onClick, '身份 chip 是纯展示，不挂点击');
  assert.ok(
    !collectButtons(tree).some((button) => String(button.props.className).split(' ').includes('dshsc-id')),
    '身份 chip 不是按钮，不提供复制操作',
  );

  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const idCss = (css.match(/\.dshsc-id\s*\{[^}]*\}/) || [''])[0];
  assert.ok(idCss.includes('monospace'), '安装标识用等宽字体，像命令行里输入的那段');
  assert.ok(!/(^|[\s;])border(-[a-z]+)?\s*:/.test(idCss), '不描边，直接融进标题行');
  assert.ok(!/(^|[\s;])background(-[a-z]+)?\s*:/.test(idCss), '不加底色，避免在小面板里像一枚按钮');
  assert.ok(!idCss.includes('cursor: pointer'), '只读展示不用手型光标');
  assert.ok(!css.includes('.dshsc-idcopy'), '不再有复制图标样式');
});

test('页头身份：只有短名时退回短名，不硬编码 scope', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    plugin: { name: 'dsh-skills-console', version: '9.9.9' },
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(text.includes('dsh-skills-console@9.9.9'), '缺 fullName 时只拼短名');
  assert.ok(!text.includes('@morehao/'), 'scope 只能来自 Host，不在前端硬编码');
});

test('页头副标题：讲清本地技能与跨 Agent 复用，不出现技术名词', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const zh = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(zh.includes('统一管理本地技能的安装、更新、删除与共享'), '中文副标题要保留定稿措辞');
  assert.ok(zh.includes('让同一份技能在多个 Agent 间复用'), '中文副标题要说明跨 Agent 复用');
  assert.ok(!zh.includes('canonical'), '中文副标题不出现 canonical');
  assert.ok(!zh.includes('skills CLI'), '中文副标题不出现 skills CLI');

  const en = loadModule(STATE, { locale: 'en' });
  const enFirst = en.stub.render(en.Component, {});
  enFirst.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const enText = textOf(en.stub.render(en.Component, {}, enFirst.hooks).tree);
  assert.ok(enText.includes('Manage local skills in one place'), '英文副标题与中文同义');
  assert.ok(enText.includes('reused across agents'), '英文副标题保留跨 Agent 复用');
  assert.ok(!enText.includes('canonical'), '英文副标题不出现 canonical');
});

test('页头身份：Host 没下发 plugin 时不渲染包名/版本，也不崩', async () => {
  const { Component, stub } = loadModule({ ...STATE, plugin: null });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(text.includes('技能控制台'), '标题照常渲染');
  assert.ok(!text.includes('dsh-skills-console@'), '没有 plugin 就不画身份 chip');
});

test('侧边栏入口：一个开关（不是文字按钮），切换后重新注册 slot', async () => {
  const { Component, stub, registrations, layout } = loadModule({
    ...STATE,
    settings: { ...STATE.settings, placement: 'settings' },
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const closed = stub.render(Component, {}, first.hooks).tree;
  const pill = collectButtons(closed).find((button) => button.props['aria-label'] === '插件设置');
  assert.ok(pill, '标题旁要有「插件设置」图标按钮');
  assert.equal(pill.props['aria-expanded'], 'false');
  assert.ok(!textOf(closed).includes('侧边栏入口'), '面板收起时不渲染侧边栏入口');

  pill.props.onClick();
  const opened = stub.render(Component, {}, first.hooks).tree;
  assert.ok(textOf(opened).includes('侧边栏入口'), '面板里要有「侧边栏入口」');
  assert.ok(!textOf(opened).includes('设置页'), '不再用「设置页 / 侧边栏」两段文字按钮');
  const toggle = collectButtons(opened).find((button) => button.props.role === 'switch' && button.props['aria-label']?.includes('侧边栏入口'));
  assert.ok(toggle, '要有一个 role=switch 的开关');
  assert.equal(textOf(toggle).trim(), '', '开关本身不带文字');
  assert.equal(toggle.props['aria-checked'], 'false', '当前在设置页 → 关');

  toggle.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(registrations.some((entry) => entry.key === 'main' && entry.active), '注册主面板');
  assert.ok(registrations.some((entry) => entry.key === 'sidebar.panellist' && entry.active), '注册侧栏图标');
  assert.ok(!registrations.some((entry) => entry.key === 'settings.section' && entry.active), '移除设置分区');
  assert.ok(layout.selected.includes('dsh-skills-console'), '切到侧栏后选中主面板');

  const after = stub.render(Component, {}, first.hooks).tree;
  const reopened = collectButtons(after).find((button) => button.props['aria-label'] === '插件设置');
  reopened.props.onClick();
  const openedAgain = stub.render(Component, {}, first.hooks).tree;
  const onToggle = collectButtons(openedAgain).find((button) => button.props.role === 'switch' && button.props['aria-label']?.includes('侧边栏入口'));
  assert.equal(onToggle.props['aria-checked'], 'true', '切到侧栏后开关应为开');
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
  const panel = stub.render(main.Component, {}, first.hooks).tree;
  assert.ok(textOf(panel).includes('技能控制台'), '主面板有独立标题');
  const pill = collectButtons(panel).find((button) => button.props['aria-label'] === '插件设置');
  assert.ok(pill, '主面板也要有「插件设置」图标按钮');
  pill.props.onClick();
  assert.ok(textOf(stub.render(main.Component, {}, first.hooks).tree).includes('侧边栏入口'));
});

test('设置导航：只把自己那一行从齿轮换成本插件图标，卸载时还原', async () => {
  const rows = [navRow('通用设置'), navRow('技能控制台'), navRow('插件市场')];
  const dom = createSettingsNavDom(rows);
  const { effects } = loadModule(STATE, { document: dom.document, MutationObserver: dom.MutationObserver });
  const marker = 'data-dsh-skills-console-nav-icon';

  assert.equal(dom.styles.length, 1, '注入一份导航图标样式');
  assert.equal(dom.styles[0].dataset.plugin, '@morehao/dsh-skills-console');
  assert.match(dom.styles[0].textContent, /mask-image/, '用 mask 画标记');
  assert.ok(rows[1].hasAttribute(marker), '「技能控制台」那一行换成自己的图标');
  assert.ok(!rows[0].hasAttribute(marker), '「通用设置」的齿轮保持原样');
  assert.ok(!rows[2].hasAttribute(marker), '「插件市场」的图标保持原样');

  // 语言切换后行文案会变：观察器要按新标题重新认领
  rows[1].textContent = 'Skills Console';
  dom.trigger();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(!rows[1].hasAttribute(marker), '文案不匹配时不能继续占用');
  rows[1].textContent = '技能控制台';
  dom.trigger();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(rows[1].hasAttribute(marker), '改回中文后重新认领');

  for (const dispose of effects) if (typeof dispose === 'function') dispose();
  assert.ok(!rows[1].hasAttribute(marker), '卸载时移除标记');
  assert.equal(dom.styles.length, 0, '卸载时移除样式');
});

test('自动导出：只列本机已装的 Agent，默认不勾任何目标', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const header = collectButtons(tree).find((button) => String(textOf(button)).startsWith('新安装时自动共享'));
  assert.ok(header, '要有「新安装时自动共享」入口');
  assert.ok(String(header.props.title).includes('Claude Code'), 'tooltip 里要有已勾选的 Agent');
  assert.ok(!String(header.props.title).includes('CodeBuddy'), '未安装的 Agent 不进摘要');
  assert.match(String(textOf(header)), /新安装时自动共享 · 1/, '摘要只数真正会被导出的 Agent');

  header.props.onClick();
  const modal = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(modal);
  assert.ok(text.includes('装完后默认共享给'));
  assert.ok(text.includes('Claude Code'));
  assert.ok(!text.includes('CodeBuddy'), '未安装的 Agent 不展示');
  assert.ok(!text.includes('dsh（全局）'), 'DSH 读共享根，不参与导出');
  const checks = collectByType(modal, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 1, '只列探测到的 Agent');
  assert.equal(checks[0].props.checked, true, 'settings 里已勾选');

  checks[0].props.onChange();
  const toggled = stub.render(Component, {}, first.hooks).tree;
  const nextChecks = collectByType(toggled, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(nextChecks[0].props.checked, false, '取消勾选要生效');
});

test('自动导出：读共享根的 Agent 不进列表，也不再单独解释', async () => {
  const payload = {
    ...STATE,
    settings: { exportTargets: ['agent:opencode'] },
    agents: {
      all: [
        ...STATE.agents.all,
        { target: 'agent:opencode', kind: 'agent', key: 'opencode', label: 'OpenCode', dir: '/tmp/.config/opencode/skills', exists: true, sharedHome: 'yes', exportBlocked: 'shared-root', exportable: false },
      ],
      detected: [
        ...STATE.agents.detected,
        { target: 'agent:opencode', kind: 'agent', key: 'opencode', label: 'OpenCode', dir: '/tmp/.config/opencode/skills', exists: true, sharedHome: 'yes', exportBlocked: 'shared-root', exportable: false },
      ],
    },
  };
  const { Component, stub } = loadModule(payload);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const header = collectButtons(tree).find((button) => String(textOf(button)).startsWith('新安装时自动共享'));
  assert.ok(header, '要有入口');
  assert.match(String(textOf(header)), /新安装时自动共享 · 0/, 'v1 残留的 opencode 不该再计数');

  header.props.onClick();
  const modal = stub.render(Component, {}, first.hooks).tree;
  // 弹窗叠在列表之上：只断言弹窗自己
  const dialog = collectByClass(modal, 'dshsc-modal')[0];
  assert.ok(dialog, '共享设置弹窗要在');
  const text = textOf(dialog);
  const checks = collectByType(modal, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 1, '只剩 Claude Code 一个可选目标');
  assert.ok(!checks.some((node) => node.props.checked), 'opencode 的不该出现「已勾选」');
  assert.ok(!text.includes('读共享根'), '两段「读共享根，不在此列」已删除');
  assert.ok(!text.includes('不在此列'));
  assert.ok(!text.includes('OpenCode'), '不再把不可导出的 Agent 当说明');
  assert.ok(!text.includes('/tmp/.config/opencode/skills'), '不该给出它的目录让人去勾');
});

test('自动导出：一个 Agent 都没探测到时，列表为空并说明原因', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    settings: { exportTargets: [] },
    agents: { all: STATE.agents.all, detected: [STATE.agents.detected[0]] },
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const header = collectButtons(tree).find((button) => String(textOf(button)).startsWith('新安装时自动共享'));
  assert.match(String(textOf(header)), /新安装时自动共享 · 0/, '没有目标时计数为 0');
  header.props.onClick();
  const modal = stub.render(Component, {}, first.hooks).tree;
  const checks = collectByType(modal, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 0, '一个可导出的目标都没有');
  assert.ok(textOf(modal).includes('本机没有需要共享的 Agent'));
});

test('共享设置：只列本机已装 Agent，不再有作用范围', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const exportButton = buttonByText(tree, '共享设置');
  assert.ok(exportButton);
  exportButton.props.onClick();

  const modal = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(modal);
  assert.ok(text.includes('Claude Code'), '已安装的 Agent 要展示');
  assert.ok(!text.includes('CodeBuddy'), '未安装的 Agent 不展示');
  assert.ok(text.includes('只列出本机已安装'), '要有说明');
  assert.ok(text.includes('~/.agents/skills/git-kit'), '要标出技能本体所在');
  assert.ok(text.includes('/tmp/.claude/skills'), 'Agent 的导出目录仍要展示');
  assert.ok(!text.includes('dsh（全局）'), 'DSH 自己的根不是导出目标');
  assert.ok(!text.includes('DSH 工作区'), '作用范围已取消：可见性由本地策略决定');
  assert.ok(!text.includes('读共享根'), '导出弹窗不再解释共享根');
  assert.ok(!text.includes('不在此列'));

  assert.equal(collectByType(modal, 'input').filter((node) => node.props.type === 'radio').length, 0, '没有作用范围单选');
  const checks = collectByType(modal, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 1, '只有探测到的那个 Agent');
  assert.equal(checks[0].props.checked, true, '已共享的要勾上');
  checks[0].props.onChange();
  const toggled = stub.render(Component, {}, first.hooks).tree;
  const nextChecks = collectByType(toggled, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(nextChecks[0].props.checked, false, '取消勾选后要保存为新状态');
});

test('添加技能：先探测再勾选，仓库有多个技能时可多选', async () => {
  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith('/probe')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          source: 'morehao/agent-skills',
          ref: 'main',
          skipped: 1,
          skills: [
            { name: 'git-kit', description: 'Git 工作流辅助工具包', skillPath: 'skills/git-kit/SKILL.md' },
            { name: 'handoff', description: '把会话压成续跑提示', skillPath: 'skills/handoff/SKILL.md' },
          ],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ...STATE, ok: true }) };
  };
  const { Component, stub } = loadModule(STATE, { fetch: fetchStub });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  let tree = stub.render(Component, {}, first.hooks).tree;

  const add = collectButtons(tree).find((button) => textOf(button).trim() === '添加技能');
  assert.ok(add, '页头要有添加技能');
  add.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  assert.ok(textOf(tree).includes('检测技能'), '弹窗先给检测入口');

  const input = collectByType(tree, 'input').find((node) => node.props.placeholder === '例如 morehao/ai-kit');
  assert.ok(input, '来源输入框');
  input.props.onChange({ target: { value: 'https://github.com/morehao/agent-skills' } });
  tree = stub.render(Component, {}, first.hooks).tree;

  const probe = collectButtons(tree).find((button) => textOf(button).trim() === '检测技能');
  assert.equal(probe.props.disabled, false, '填了来源就能检测');
  probe.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 10));
  tree = stub.render(Component, {}, first.hooks).tree;

  assert.ok(textOf(tree).includes('检测到 2 个技能'), '多技能要提示数量');
  assert.ok(textOf(tree).includes('Git 工作流辅助工具包'), '列表里要带每个技能的描述');
  assert.ok(textOf(tree).includes('另有 1 个技能缺少名称或描述'), '缺 name/description 的要提示已跳过');
  let checks = collectByType(tree, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks.length, 2, '每个技能一个复选框');
  assert.ok(checks.every((node) => node.props.checked), '默认全选');

  checks[0].props.onChange();
  tree = stub.render(Component, {}, first.hooks).tree;
  checks = collectByType(tree, 'input').filter((node) => node.props.type === 'checkbox');
  assert.equal(checks[0].props.checked, false, '取消勾选生效');

  const save = collectButtons(tree).find((button) => textOf(button).trim() === '保存');
  assert.equal(save.props.disabled, false, '至少选一个就能保存');
  save.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 10));

  const install = calls.find((call) => call.url.endsWith('/install'));
  assert.ok(install, '保存要调安装接口');
  assert.equal(install.body.source, 'https://github.com/morehao/agent-skills');
  assert.deepEqual(install.body.skills, ['handoff'], '只装勾选的那个');
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

test('搜索：按技能名 / 来源 / Agent 过滤，空结果给清除入口', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  let tree = stub.render(Component, {}, first.hooks).tree;

  const search = collectByType(tree, 'input').find((node) => node.props.type === 'search');
  assert.ok(search, '工具栏要有搜索框');
  assert.equal(search.props.value, '');
  search.props.onChange({ target: { value: 'git' } });
  tree = stub.render(Component, {}, first.hooks).tree;
  let text = textOf(tree);
  assert.ok(text.includes('git-kit'), '匹配技能名');
  assert.ok(!text.includes('handoff'), '不匹配的行隐藏');

  const searchAgain = collectByType(tree, 'input').find((node) => node.props.type === 'search');
  searchAgain.props.onChange({ target: { value: 'morehao' } });
  tree = stub.render(Component, {}, first.hooks).tree;
  assert.ok(textOf(tree).includes('git-kit') && textOf(tree).includes('handoff'), '按来源命中');

  searchAgain.props.onChange({ target: { value: 'zzzz' } });
  tree = stub.render(Component, {}, first.hooks).tree;
  assert.ok(textOf(tree).includes('没有匹配的技能'));
  const clearButton = collectButtons(tree).find((button) => textOf(button).trim() === '清除');
  assert.ok(clearButton, '空结果要有清除入口');
  clearButton.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  assert.ok(textOf(tree).includes('handoff'), '清除后恢复全部行');

  const claude = loadModule({
    ...STATE,
    installs: [
      ROW({
        name: 'claude-user',
        exports: [{
          target: 'agent:claude-code', label: 'Claude Code', dir: '/tmp/.claude/skills',
          linkPath: '/tmp/x', state: 'managed', recorded: true, broken: false,
        }],
      }),
      ROW({ name: 'plain', exports: [] }),
    ],
  });
  const claudeFirst = claude.stub.render(claude.Component, {});
  claudeFirst.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const claudeTree = claude.stub.render(claude.Component, {}, claudeFirst.hooks).tree;
  const claudeSearch = collectByType(claudeTree, 'input').find((node) => node.props.type === 'search');
  claudeSearch.props.onChange({ target: { value: 'claude' } });
  const searched = claude.stub.render(claude.Component, {}, claudeFirst.hooks).tree;
  assert.ok(textOf(searched).includes('claude-user'), '按 Agent 标签命中');
  assert.ok(!textOf(searched).includes('plain'), '未接入该 Agent 的行不出现');
});

test('Agent 溢出：+n 悬浮列出全部 Agent，而不是只靠 title', async () => {
  const labels = ['Claude Code', 'OpenCode', 'Cursor', 'GitHub Copilot', 'CodeBuddy', 'Windsurf'];
  // 全来自导出：DSH 可见性不再是 Agent chip（它有自己的状态点）
  const exports = labels.map((label, index) => ({
    target: `agent:a${index}`,
    label,
    dir: `/tmp/agent-${index}`,
    linkPath: `/tmp/agent-${index}/many`,
    state: 'managed',
    recorded: true,
    broken: false,
  }));
  const { Component, stub } = loadModule({ ...STATE, installs: [ROW({ name: 'many', exports })] });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;

  assert.ok(textOf(tree).includes('+3'), '超过 3 个折成 +3');
  const more = collectButtons(tree).find((button) => String(textOf(button)).trim() === '+3');
  assert.ok(more, '+3 是可聚焦的按钮');
  assert.equal(more.props['aria-expanded'], 'false');
  assert.equal(more.props['aria-describedby'], undefined);
  assert.ok(String(more.props['aria-label']).includes('Windsurf'), '无悬浮时读屏也能拿到全部 Agent');

  const rect = { left: 100, top: 100, right: 140, bottom: 120, width: 40, height: 20 };
  more.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rect } });
  const shown = stub.render(Component, {}, first.hooks).tree;
  const tip = collectByType(shown, 'div').find((node) => node.props.className === 'dshsc-agenttip');
  assert.ok(tip, '悬浮后出现气泡');
  assert.equal(tip.props.role, 'tooltip');
  const tipText = textOf(tip);
  assert.ok(tipText.includes('已共享的 Agent'), '气泡有标题');
  for (const label of labels) assert.ok(tipText.includes(label), `气泡要列出 ${label}`);
  const openMore = collectButtons(shown).find((button) => String(textOf(button)).trim() === '+3');
  assert.equal(openMore.props['aria-expanded'], 'true');
  assert.equal(openMore.props['aria-describedby'], 'dshsc-agenttip');

  openMore.props.onMouseLeave();
  const hidden = stub.render(Component, {}, first.hooks).tree;
  assert.ok(
    !collectByType(hidden, 'div').some((node) => node.props.className === 'dshsc-agenttip'),
    '移出后气泡收起',
  );
});

const OPENCODE = {
  target: 'agent:opencode',
  kind: 'agent',
  key: 'opencode',
  label: 'OpenCode',
  dir: '/tmp/.config/opencode/skills',
  exists: true,
  sharedHome: 'yes',
  exportBlocked: 'shared-root',
  exportable: false,
};

test('共享根：行内只显示显式导出，不逐个列直读共享根的 Agent', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    agents: {
      all: [...STATE.agents.all, OPENCODE],
      detected: [...STATE.agents.detected, OPENCODE],
    },
    installs: [ROW({ name: 'handoff', exports: [] })],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  let tree = stub.render(Component, {}, first.hooks).tree;

  const text = textOf(tree);
  assert.ok(!text.includes('OpenCode'), '共享根 Agent 不进行内 Agent 列');
  assert.ok(!text.includes('未共享到任何 Agent'), '不再说「未共享到任何 Agent」');
  const none = collectByClass(tree, 'dshsc-unlinked')[0];
  assert.ok(none, '没有导出链时给出「未共享」占位');
  assert.equal(textOf(none).trim(), '未共享');
  assert.ok(String(none.props.title).includes('~/.agents/skills'), '悬停解释共享根 Agent 无需导出');

  // 按 Agent 视图：没有导出的共享根 Agent 不成组
  const agentView = collectButtons(tree).find((button) => String(textOf(button)).trim() === '按 Agent');
  agentView.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  const heads = collectByClass(tree, 'dshsc-group-head').map((node) => textOf(node));
  assert.ok(!heads.some((head) => head.includes('OpenCode')), '没导出的 Agent 不单独成组');
});

test('Agent 列只显示显式导出；旧数据里的共享根链也不显示', async () => {
  const claudeExport = ROW().exports[0];
  // 旧 Host / 历史数据可能仍把 OpenCode 的链塞在 row.exports 里
  const staleOpencodeExport = {
    target: 'agent:opencode',
    label: 'OpenCode',
    dir: OPENCODE.dir,
    linkPath: '/tmp/.config/opencode/skills/git-kit',
    state: 'foreign-link',
    recorded: false,
    broken: false,
  };
  const { Component, stub } = loadModule({
    ...STATE,
    agents: {
      all: [...STATE.agents.all, OPENCODE],
      detected: [...STATE.agents.detected, OPENCODE],
    },
    installs: [ROW({ exports: [claudeExport, staleOpencodeExport] })],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const chips = collectByClass(tree, 'dshsc-agent');
  assert.deepEqual(chips.map((node) => textOf(node).trim()), ['Claude Code'], '只留真正建了链的导出');
  assert.ok(!textOf(tree).includes('OpenCode'), '共享根 Agent 不出现');
});

test('状态筛选：计数来自全量，点选后只留对应行', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  let tree = stub.render(Component, {}, first.hooks).tree;

  const chip = (prefix) => collectButtons(tree).find((button) => String(textOf(button)).trim().startsWith(prefix));
  assert.ok(String(textOf(chip('全部'))).includes('3'), '全部计数');
  assert.ok(String(textOf(chip('可更新'))).includes('1'), '可更新计数');
  assert.ok(String(textOf(chip('已停用'))).includes('1'), '已停用计数');

  chip('可更新').props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  let text = textOf(tree);
  assert.ok(text.includes('handoff'), '只剩可更新行');
  assert.ok(!text.includes('git-kit'), 'current 行被筛掉');
  assert.ok(String(textOf(collectButtons(tree).find((button) => String(textOf(button)).trim().startsWith('可更新')))).includes('1'),
    '筛选后计数仍按全量显示');

  chip('已停用').props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  text = textOf(tree);
  assert.ok(text.includes('pdf-tools'), '已停用行');
  assert.ok(!text.includes('handoff'), '其它状态被筛掉');
  assert.ok(text.includes('旧版 DSH-only 停用'), '旧模式用用户语言说明');
  assert.ok(!text.includes('扫描根里有停用标记'));
});

test('可见性：技能自己声明 manual-only 时给手动调用说明，不报「扫描目录里没有它」', async () => {
  const manual = ROW({
    name: 'handoff',
    visible: false,
    status: 'current',
    exports: [],
    visibility: {
      dsh: false,
      shadowed: true,
      winnerSource: 'user-agents',
      sources: { 'user-agents': 'shadowed' },
      winnerPath: '/tmp/skills/handoff',
      winnerIsCanonical: true,
      selfHidden: true,
      shadowScopeMismatch: false,
    },
  });
  const { Component, stub } = loadModule({ ...STATE, installs: [manual], visible: [] });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(text.includes('仅手动'), '用名字旁的标志告诉用户模型不可见');
  assert.ok(!text.includes('扫描目录里没有它'), '不能把 manual-only 说成技能丢了');
  assert.ok(!text.includes('disable-model-invocation'), '不再占一行警告，细节放 tooltip');
});

test('删除冲突弹窗：只留一个「关闭」，不再出现两个取消', async () => {
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') return { ok: true, status: 200, json: async () => STATE };
    if (method === 'DELETE') {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          code: 'error.skills.remove-conflict',
          message: 'Claude Code 里的 git-kit 不是本插件创建的，删除已停下；先处理它再重试',
          detail: { conflicts: [{ label: 'Claude Code', linkPath: '/tmp/.claude/skills/git-kit' }] },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const { Component, stub } = loadModule(STATE, { fetch });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));

  let tree = stub.render(Component, {}, first.hooks).tree;
  const del = collectButtons(tree).find((button) => String(button.props['aria-label'] || '').startsWith('删除'));
  assert.ok(del, '行内删除按钮');
  del.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  const confirm = collectButtons(tree).find((button) => String(textOf(button)).trim() === '删除'
    && String(button.props.className || '').includes('danger'));
  assert.ok(confirm, '确认删除主按钮应叫「删除」而不是「保存」');
  confirm.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 20));

  tree = stub.render(Component, {}, first.hooks).tree;
  const labels = collectButtons(tree).map((button) => String(textOf(button)).trim());
  assert.ok(labels.includes('关闭'), '冲突弹窗有唯一关闭按钮');
  assert.equal(labels.filter((label) => label === '取消').length, 0, '不再出现两个取消');
  assert.ok(textOf(tree).includes('删除被拦截'));
  assert.ok(textOf(tree).includes('/tmp/.claude/skills/git-kit'), '仍然说清冲突路径');
});

test('未检查：只在筛选计数里提示，不在行内/底部重复', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    installs: [ROW(), ROW({ name: 'mystery', status: 'unknown', exports: [] })],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const text = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(!text.includes('待检查\n'), '行内不再出现「待检查」标签');
  assert.ok(!text.includes('还有 1 个技能未检查更新。'), '不再在列表底部重复聚合提示');
  const chip = collectButtons(stub.render(Component, {}, first.hooks).tree)
    .find((button) => String(textOf(button)).trim().startsWith('待检查'));
  assert.ok(chip && String(textOf(chip)).includes('1'), '顶部筛选计数保留');
  assert.ok(String(chip.props.title).includes('1 个技能未检查更新'), '计数 chip 用 tooltip 解释');
});

test('无上游：没有订阅来源的行不算待检查，有来源时用标签说明原因', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    installs: [
      ROW(),
      ROW({ name: 'local-only', status: 'no-upstream', source: null, ref: null, exports: [] }),
      ROW({ name: 'lost-sub', status: 'no-upstream', exports: [] }),
    ],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  const chip = collectButtons(stub.render(Component, {}, first.hooks).tree)
    .find((button) => String(textOf(button)).trim().startsWith('待检查'));
  assert.ok(chip && String(textOf(chip)).includes('0'), '无上游不混进待检查计数');
  assert.ok(!text.includes('还有 1 个技能未检查更新。'), '也不该出现待检查提示');
  // 没有来源时由来源行写「无远端来源」，有来源（订阅被删）才补一枚「无上游」标签
  const tags = collectByType(tree, 'span')
    .filter((node) => textOf(node) === '无上游' && String(node.props?.title || '').includes('无法检查更新'));
  assert.equal(tags.length, 1, '只给有来源的那一行加标签');
  assert.ok(String(tags[0].props.title).includes('无法检查更新'), '标签用 tooltip 解释原因');
});

test('订阅：检查更新 / 取消订阅都直接可见，安装入口只给未装条目', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    subscriptions: [{
      id: 'sub-1',
      source: 'morehao/ai-kit',
      ref: 'main',
      snapshot: { entries: [{ name: 'git-kit' }, { name: 'loose-skill' }] },
    }],
    installs: [ROW({ subscriptionId: 'sub-1' })],
  });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tabs = collectButtons(stub.render(Component, {}, first.hooks).tree)
    .filter((button) => String(textOf(button)).startsWith('订阅'));
  tabs[0].props.onClick();
  let tree = stub.render(Component, {}, first.hooks).tree;
  let labels = collectButtons(tree).map((button) => textOf(button).trim());
  const named = (label) => collectButtons(tree).some(
    (button) => button.props['aria-label'] === label || button.props.title === label,
  );
  assert.ok(named('检查更新'), '订阅行要有「检查更新」图标按钮');
  assert.ok(labels.includes('取消订阅'), '订阅行要有「取消订阅」');
  assert.ok(textOf(tree).includes('已安装'), '「已装」统一为「已安装」');
  assert.ok(!labels.includes('⋯'), '不使用折叠菜单');

  const caret = collectButtons(tree).find((button) => String(button.props.className || '').includes('dshsc-caret'));
  assert.ok(caret, '订阅行要有展开箭头');
  caret.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  labels = collectButtons(tree).map((button) => textOf(button).trim());
  assert.ok(labels.filter((label) => label === '安装').length === 1, '只有未装条目给安装按钮');
});

// ---------- 查看技能内容（抽屉 / 整页 / 文件 / 信息） ----------

const READER_BODY = {
  ok: true,
  name: 'git-kit',
  kind: 'dir',
  relPath: 'SKILL.md',
  path: '/tmp/skills/git-kit/SKILL.md',
  content: '---\nname: git-kit\ndescription: demo\n---\n# 标题一\n\n正文 **粗** 与 `code`\n\n## 小节二\n\n- 一\n- 二\n',
  meta: { name: 'git-kit', description: 'demo' },
  size: 120,
  truncated: false,
  mtime: '2026-10-23T10:57:23.136Z',
};

const READER_FILES = {
  ok: true,
  name: 'git-kit',
  root: '/tmp/skills/git-kit',
  kind: 'dir',
  body: 'SKILL.md',
  hasSkillMd: true,
  files: [
    { path: 'references', kind: 'dir' },
    { path: 'references/guide.md', kind: 'file', size: 2048 },
    { path: 'SKILL.md', kind: 'file', size: 120 },
  ],
  totalBytes: 2168,
  truncated: false,
};

/** 按 URL 分派的 fetch 存根：state / 正文 / 文件树 / 单文件各走一条。 */
function skillFetch({
  body = READER_BODY,
  bodyError = null,
  files = READER_FILES,
  state = STATE,
  fileError = null,
  fileContent = 'guide 第一行\n第二行\n',
} = {}) {
  const calls = [];
  const fetchStub = async (url) => {
    const target = String(url);
    calls.push(target);
    const respond = (payload, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => payload });
    if (target.includes('/skills/') && target.endsWith('/files')) return respond(files);
    if (target.includes('?path=')) {
      const relPath = decodeURIComponent(target.split('?path=')[1]);
      if (fileError) return respond({ ok: false, code: fileError.code, message: fileError.message }, false);
      return respond({ ok: true, name: 'git-kit', relPath, content: fileContent, size: 20, truncated: false });
    }
    if (target.includes('/skills/')) {
      if (bodyError) return respond({ ok: false, code: bodyError.code, message: bodyError.message }, false);
      return respond(body);
    }
    return respond(state);
  };
  fetchStub.calls = calls;
  return fetchStub;
}

/** 渲染 → 跑 effect → 等微任务 → 再渲染，来回几轮把异步数据落进组件。 */
async function settle(stub, Component, hooks, rounds = 5) {
  let out = stub.render(Component, {}, hooks);
  for (let round = 0; round < rounds; round += 1) {
    for (const effect of out.effects || []) {
      try {
        effect();
      } catch {
        // 存根里没有真实 DOM：交互 effect 的清理函数可能拿不到节点
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    out = stub.render(Component, {}, out.hooks);
  }
  return out;
}

function buttonByText(node, label) {
  return collectButtons(node).find((button) => textOf(button).trim() === label)
    || collectButtons(node).find((button) => button.props['aria-label'] === label || button.props.title === label);
}

async function openDrawer(options = {}) {
  const fetchStub = skillFetch(options);
  const { Component, stub } = loadModule(options.state || STATE, { fetch: fetchStub, refNodes: options.refNodes });
  let out = await settle(stub, Component);
  const view = buttonByText(out.tree, '查看');
  assert.ok(view, '已安装行要有「查看」入口');
  view.props.onClick();
  out = await settle(stub, Component, out.hooks);
  const drawer = collectByType(out.tree, 'aside').find((node) => node.props.role === 'dialog');
  assert.ok(drawer, '点「查看」应打开抽屉');
  return { out, stub, Component, fetchStub, drawer };
}

test('查看：抽屉里有标题、描述、正文与三个 tab，正文按 markdown 渲染', async () => {
  const { drawer, fetchStub } = await openDrawer();
  const text = textOf(drawer);
  assert.ok(text.includes('git-kit'), '标题是技能名');
  assert.ok(text.includes('demo'), '描述进标题区');
  assert.ok(text.includes('标题一'), '正文标题渲染出来了');
  for (const label of ['正文', '文件', '信息']) {
    assert.ok(collectButtons(drawer).some((button) => textOf(button).trim().startsWith(label)), `缺少 tab：${label}`);
  }
  assert.equal(drawer.props['aria-modal'], 'true');
  assert.ok(collectByType(drawer, 'h1').length >= 1, '# 标题渲染成 h1');
  assert.ok(collectByType(drawer, 'strong').length >= 1, '粗体渲染成 strong');
  const reads = fetchStub.calls.filter((url) => url.includes('/skills/git-kit'));
  assert.ok(reads.some((url) => url.endsWith('/files')), '打开时并行拉文件树');
  assert.ok(reads.some((url) => url.endsWith('/skills/git-kit')), '打开时拉正文');
});

test('查看：描述被截断时给「展开」，展开后去掉行数限制、还能收起', async () => {
  // 存根没有布局：用一个「滚动高度 > 可见高度」的假节点模拟被 line-clamp 截断的描述
  const { out, stub, Component } = await openDrawer({ refNodes: { p: { scrollHeight: 78, clientHeight: 39 } } });
  const more = buttonByText(out.tree, '展开');
  assert.ok(more, '描述超出行数时有「展开」');
  assert.equal(more.props['aria-expanded'], 'false');
  assert.equal(more.props['aria-controls'], 'dshsc-reader-desc');

  more.props.onClick();
  let next = await settle(stub, Component, out.hooks);
  const descOf = (tree) => collectByType(tree, 'p').find(
    (node) => String(node.props.className || '').includes('dshsc-reader-desc'),
  );
  assert.ok(String(descOf(next.tree).props.className).includes('expanded'), '展开后不再按行数截断');
  const collapse = buttonByText(next.tree, '收起');
  assert.ok(collapse, '展开后按钮变成「收起」');
  assert.equal(collapse.props['aria-expanded'], 'true');

  collapse.props.onClick();
  next = await settle(stub, Component, next.hooks);
  assert.ok(!String(descOf(next.tree).props.className).includes('expanded'), '收起后恢复截断');
  assert.ok(buttonByText(next.tree, '展开'), '收起后还能再展开');

  // 描述本来就没超出：量不到溢出时不出现按钮
  const plain = await openDrawer();
  assert.equal(buttonByText(plain.out.tree, '展开'), undefined, '不需要展开时不出现按钮');
});

test('查看：技能名本身也是入口，点开同一个抽屉', async () => {
  const fetchStub = skillFetch();
  const { Component, stub } = loadModule(STATE, { fetch: fetchStub });
  let out = await settle(stub, Component);
  const nameButton = collectButtons(out.tree).find(
    (button) => String(button.props.className || '').includes('dshsc-namebtn') && textOf(button).trim() === 'git-kit',
  );
  assert.ok(nameButton, '技能名要是 button');
  assert.equal(nameButton.props['aria-haspopup'], 'dialog');
  nameButton.props.onClick();
  out = await settle(stub, Component, out.hooks);
  assert.ok(collectByType(out.tree, 'aside').some((node) => node.props.role === 'dialog'), '名字可点开抽屉');
});

test('查看：切「原文」显示带 frontmatter 的原文，切「信息」显示来源与本地信息', async () => {
  const { out, stub, Component, drawer } = await openDrawer();
  const raw = buttonByText(drawer, '原文');
  assert.ok(raw, '正文 tab 要有渲染 / 原文切换');
  raw.props.onClick();
  const afterRaw = await settle(stub, Component, out.hooks);
  const pres = collectByType(afterRaw.tree, 'pre');
  assert.ok(pres.some((node) => textOf(node).includes('name: git-kit')), '原文包含 frontmatter');

  const info = buttonByText(afterRaw.tree, '信息');
  info.props.onClick();
  const afterInfo = await settle(stub, Component, afterRaw.hooks);
  const text = textOf(afterInfo.tree);
  assert.ok(text.includes('仓库'), '信息 tab 有来源段');
  assert.ok(text.includes('morehao/ai-kit'), '来源来自 row');
  assert.ok(text.includes('本地路径'), '信息 tab 有本地路径');
  assert.ok(text.includes('安装'), '信息 tab 有安装时间');
});

test('查看信息：只列已共享的 Agent，不列共享根可见', async () => {
  const state = {
    ...STATE,
    agents: {
      all: [...STATE.agents.all, OPENCODE],
      detected: [...STATE.agents.detected, OPENCODE],
    },
    installs: [ROW({ exports: [] })],
  };
  const { out, stub, Component, drawer } = await openDrawer({ state });
  const info = buttonByText(drawer, '信息');
  info.props.onClick();
  const after = await settle(stub, Component, out.hooks);
  const infoNode = collectByClass(after.tree, 'dshsc-reader-info')[0];
  assert.ok(infoNode, '信息 tab 要渲染出信息面板');
  const text = textOf(infoNode);
  assert.ok(text.includes('已共享'), '保留导出行');
  assert.ok(!text.includes('OpenCode'), '不列共享根可见的 Agent');
  assert.ok(!text.includes('共享根可见'), '共享根行已移除');
});

test('查看：文件 tab 列出目录与文件，点文件读到内容；二进制给占位', async () => {
  const { out, stub, Component } = await openDrawer();
  const filesTab = buttonByText(out.tree, '文件 3') || collectButtons(out.tree).find(
    (button) => textOf(button).trim().startsWith('文件'),
  );
  assert.ok(filesTab, '有文件 tab');
  filesTab.props.onClick();
  let tree = await settle(stub, Component, out.hooks);
  assert.ok(textOf(tree.tree).includes('references/'), '目录节点带斜杠');
  const fileItem = collectButtons(tree.tree).find(
    (button) => String(button.props.className || '').includes('dshsc-reader-titem')
      && textOf(button).includes('guide.md'),
  );
  assert.ok(fileItem, '文件树里能点文件');
  fileItem.props.onClick();
  tree = await settle(stub, Component, tree.hooks);
  assert.ok(textOf(tree.tree).includes('guide 第一行'), '点文件后预览内容');

  const binary = await openDrawer({ fileError: { code: 'error.skills.binary', message: '暂不支持预览' } });
  const binaryTab = collectButtons(binary.out.tree).find((button) => textOf(button).trim().startsWith('文件'));
  binaryTab.props.onClick();
  let binaryTree = await settle(binary.stub, binary.Component, binary.out.hooks);
  const binaryItem = collectButtons(binaryTree.tree).find(
    (button) => String(button.props.className || '').includes('dshsc-reader-titem') && textOf(button).includes('guide.md'),
  );
  binaryItem.props.onClick();
  binaryTree = await settle(binary.stub, binary.Component, binaryTree.hooks);
  const binaryText = textOf(binaryTree.tree);
  assert.ok(binaryText.includes('暂不支持预览'), '二进制给明确占位，不报错');
  assert.ok(binaryText.includes('只显示文件名与大小'), '占位里说明为什么看不了');
});

test('查看：缺少 SKILL.md 时给提示，文件 tab 仍可用', async () => {
  const { drawer } = await openDrawer({
    bodyError: { code: 'error.skills.no-skill-md', message: '这个技能目录里没有 SKILL.md' },
    files: { ...READER_FILES, body: null, hasSkillMd: false, files: [{ path: 'notes.md', kind: 'file', size: 12 }] },
  });
  const text = textOf(drawer);
  assert.ok(text.includes('没有 SKILL.md'), '正文区提示缺 SKILL.md');
  assert.ok(text.includes('其他文件'), '提示里说明仍能看文件');
});

test('查看：关闭按钮收起抽屉；Esc 与遮罩同样关掉', async () => {
  const { out, stub, Component } = await openDrawer();
  const close = buttonByText(out.tree, '关闭');
  assert.ok(close, '有可访问名称的关闭按钮');
  close.props.onClick();
  const closed = await settle(stub, Component, out.hooks);
  assert.equal(collectByType(closed.tree, 'aside').filter((node) => node.props.role === 'dialog').length, 0, '抽屉应消失');

  const again = await openDrawer();
  const scrim = collectByType(again.out.tree, 'div').find(
    (node) => String(node.props.className || '').includes('dshsc-drawer-scrim'),
  );
  assert.ok(scrim, '有遮罩');
  scrim.props.onClick();
  const away = await settle(again.stub, again.Component, again.out.hooks);
  assert.equal(collectByType(away.tree, 'aside').filter((node) => node.props.role === 'dialog').length, 0);
});

test('查看：在整页打开 → 返回条 + 目录；返回回到列表', async () => {
  const { out, stub, Component } = await openDrawer();
  const openPage = buttonByText(out.tree, '在整页打开');
  assert.ok(openPage, '抽屉底部有「在整页打开」');
  openPage.props.onClick();
  const page = await settle(stub, Component, out.hooks);
  const text = textOf(page.tree);
  assert.ok(text.includes('返回列表'), '整页有返回条');
  assert.ok(text.includes('目录'), '整页有目录');
  assert.equal(collectByType(page.tree, 'aside').filter((node) => node.props.role === 'dialog').length, 0, '整页不再有抽屉');

  const back = buttonByText(page.tree, '返回列表');
  back.props.onClick();
  const list = await settle(stub, Component, page.hooks);
  assert.ok(textOf(list.tree).includes('已安装 3'), '返回后回到列表');
  assert.equal(collectByType(list.tree, 'aside').length, 0);

  // 页面本身固定后，整页阅读器要自己撑满：顶栏固定，正文列内部滚
  const css = collectByType(page.tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  assert.match(css, /\.dshsc-reader-page\s*\{[^}]*flex:\s*1/, '整页阅读器吃满列表页面高度');
  assert.match(css, /\.dshsc-reader-layout\s*\{[^}]*flex:\s*1/, '正文布局区自己占满剩余高度');
  assert.match(css, /\.dshsc-reader-body\s*\{[^}]*overflow:\s*auto/, '长正文在正文列内部滚动，返回条不跟着滚走');
});

test('查看：整页切到文件 / 信息 tab 后正文列仍占满，不被目录轨挤成一条', async () => {
  const { out, stub, Component } = await openDrawer();
  buttonByText(out.tree, '在整页打开').props.onClick();
  let page = await settle(stub, Component, out.hooks);

  const docLayout = collectByClass(page.tree, 'dshsc-reader-layout');
  assert.equal(docLayout.length, 1, '整页有正文布局区');
  assert.ok(String(docLayout[0].props.className).includes('has-toc'), '正文 tab 有目录时才开两轨');

  const filesTab = collectButtons(page.tree).find((button) => textOf(button).trim().startsWith('文件'));
  filesTab.props.onClick();
  page = await settle(stub, Component, page.hooks);

  const filesLayout = collectByClass(page.tree, 'dshsc-reader-layout');
  assert.equal(filesLayout.length, 1);
  assert.ok(
    !String(filesLayout[0].props.className).includes('has-toc'),
    '没有目录时布局只剩一轨——否则唯一的正文列会被摆进 180px 的目录轨',
  );
  assert.equal(collectByClass(page.tree, 'dshsc-reader-toc').length, 0, '文件 tab 不渲染目录');

  const css = collectByType(page.tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  assert.match(
    css,
    /\.dshsc-reader-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    '布局区默认只有一轨，目录轨只在 .has-toc 上',
  );
  assert.match(css, /\.dshsc-reader-layout\.has-toc\s*\{[^}]*180px/, '两轨只挂在 has-toc 上');
  assert.match(
    css,
    /\.dshsc-reader-page \.dshsc-reader-files\s*\{[^}]*minmax\(200px,\s*240px\)/,
    '整页文件 tab 左树右预览',
  );
  assert.match(
    css,
    /@container dshsc \(max-width: 860px\)[\s\S]*?\.dshsc-reader-page \.dshsc-reader-files\s*\{[^}]*minmax\(0,\s*1fr\)/,
    '窄容器里文件 tab 回到上下排',
  );

  const infoTab = collectButtons(page.tree).find((button) => textOf(button).trim() === '信息');
  infoTab.props.onClick();
  page = await settle(stub, Component, page.hooks);
  assert.ok(
    !String(collectByClass(page.tree, 'dshsc-reader-layout')[0]?.props?.className || '').includes('has-toc'),
    '信息 tab 同样不排目录轨',
  );
});

test('查看：readOnly（state 损坏）时仍能查看，管理动作禁用', async () => {
  const { drawer } = await openDrawer({ state: { ...STATE, readOnly: true } });
  assert.ok(textOf(drawer).includes('标题一'), '只读也能读正文');
  const update = collectButtons(drawer).find((button) => textOf(button).trim() === '更新');
  assert.ok(update, '仍显示更新按钮');
  assert.equal(update.props.disabled, true, '只读时禁用更新');
});

test('查看：文件 tab 里的 markdown 默认渲染，可切回原文', async () => {
  const { out, stub, Component } = await openDrawer({ fileContent: '# 指南标题\n\n正文 **粗体** 一段\n' });
  const filesTab = collectButtons(out.tree).find((button) => textOf(button).trim().startsWith('文件'));
  filesTab.props.onClick();
  let tree = await settle(stub, Component, out.hooks);
  const fileItem = collectButtons(tree.tree).find(
    (button) => String(button.props.className || '').includes('dshsc-reader-titem') && textOf(button).includes('guide.md'),
  );
  fileItem.props.onClick();
  tree = await settle(stub, Component, tree.hooks);

  const rendered = collectByType(tree.tree, 'h1');
  assert.ok(rendered.some((node) => textOf(node).includes('指南标题')), 'markdown 文件直接渲染，而不是给源码');
  assert.ok(collectByType(tree.tree, 'strong').some((node) => textOf(node).includes('粗体')), '行内语法也渲染');

  const raw = buttonByText(tree.tree, '原文');
  assert.ok(raw, '预览头有渲染 / 原文切换');
  raw.props.onClick();
  const afterRaw = await settle(stub, Component, tree.hooks);
  assert.ok(
    collectByType(afterRaw.tree, 'pre').some((node) => textOf(node).includes('# 指南标题')),
    '切原文后看到源码',
  );
});


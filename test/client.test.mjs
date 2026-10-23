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
  const locale = { getLocale: () => ({ active: options.locale || 'zh' }) };
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
  plugin: { name: 'dsh-skills-console', version: '0.2.0' },
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
  for (const expected of ['git-kit', 'handoff', 'pdf-tools', '最新', '可更新', '异常：链接断裂', '已安装 3', '自动链接']) {
    assert.ok(text.includes(expected), `缺少文案：${expected}`);
  }
  const labels = collectButtons(second.tree).map((button) => textOf(button).trim());
  for (const expected of ['更新', '接入设置', '添加技能']) {
    assert.ok(labels.includes(expected), `缺少按钮：${expected}`);
  }
  const named = (label) => collectButtons(second.tree).some(
    (button) => button.props['aria-label'] === label || button.props.title === label,
  );
  assert.ok(named('删除'), '删除是图标按钮，但必须有可访问名称');
  assert.ok(named('检查更新'), '检查更新是图标按钮，但必须有可访问名称');
  assert.ok(!labels.includes('删除'), '删除不再占文字宽度');
  assert.ok(!labels.includes('检查更新'), '检查更新不再占文字宽度');
  assert.ok(labels.some((label) => label.startsWith('全部更新')), '有可更新行时要出现「全部更新 · n」');
  assert.ok(!labels.includes('刷新'), '「刷新」已改名为「检查更新」');
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
  assert.ok(text.includes('无法安装或修改'));
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
  assert.ok(text.includes('DSH 能看到，但不在本地技能库'));
  assert.ok(!text.includes('office'), '内置技能名默认收起，避免底部一屏文字');

  const banners = collectByType(tree, 'div').filter((node) => String(node.props.className || '').startsWith('dshsc-banner'));
  assert.ok(!banners.some((node) => String(node.props.className).includes('info')), '内置技能不再用大块 info 横幅');
  assert.ok(banners.some((node) => String(node.props.className).includes('warn')), '其他来源用 warn 样式');

  const view = collectButtons(tree).find((button) => textOf(button).trim() === '查看');
  assert.ok(view, '内置技能说明默认折叠，但要给查看入口');
  view.props.onClick();
  const expanded = textOf(stub.render(Component, {}, first.hooks).tree);
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
  assert.ok(css.includes('@container dshsc (max-width: 900px)'), '窄面板降级要用容器查询');
  assert.ok(!css.includes('@media (max-width: 900px)'), '不能只看视口宽度：设置面板可能比窗口窄很多');
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) 196px'), '窄面板切两列，Agent 标签回到名字下方');
  assert.ok(css.includes('grid-row: 1 / span 2'), '操作列跨两行，避免和标签挤在一起');
});

test('页头：GitHub 是右侧图标按钮，带可访问名称', async () => {
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
  const actions = collectByType(tree, 'div').find((node) => node.props.className === 'dshsc-head-actions');
  assert.ok(actions, '页头右侧有动作区');
  assert.ok(collectByType(actions, 'a').includes(link), 'GitHub 要右对齐到动作区');
  assert.match(String(link.props.className), /dshsc-pill/, 'GitHub 用胶囊样式');
  assert.match(String(link.props.className), /\bsq\b/, 'GitHub 是方形图标按钮');
  assert.equal(textOf(link).trim(), '', '图标按钮不带文字，由 aria-label/title 提供名称');
  const addSkill = collectButtons(tree).find((button) => textOf(button).trim() === '添加技能');
  assert.ok(addSkill, '业务动作仍保留「添加技能」');
  assert.ok(collectByType(actions, 'button').includes(addSkill), '添加技能也在右侧动作区');
});

test('页头身份：包名与版本来自 Host 注入的 plugin 字段', async () => {
  const { Component, stub } = loadModule({ ...STATE, plugin: { name: 'dsh-skills-console', version: '9.9.9' } });
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const tree = stub.render(Component, {}, first.hooks).tree;
  const text = textOf(tree);
  assert.ok(text.includes('dsh-skills-console'), '页头要显示包名');
  assert.ok(text.includes('v9.9.9'), '页头要显示版本');
  const css = collectByType(tree, 'style').map((node) => String(node.children[0] || '')).join('\n');
  const ver = (css.match(/\.dshsc-ver\s*\{[^}]*\}/) || [''])[0];
  assert.ok(ver.includes('tabular-nums'), '版本数字等宽');
  assert.ok(!ver.includes('border'), '版本用普通灰字，不加描边');
});

test('页头副标题：讲清本地技能与跨 Agent 复用，不出现技术名词', async () => {
  const { Component, stub } = loadModule(STATE);
  const first = stub.render(Component, {});
  first.effects.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 20));
  const zh = textOf(stub.render(Component, {}, first.hooks).tree);
  assert.ok(zh.includes('统一管理本地技能的安装、更新、删除与接入'), '中文副标题要保留定稿措辞');
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
  assert.ok(!text.includes('v0.2.0'), '没有版本就不画版本徽标');
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
  assert.ok(text.includes('~/.agents/skills/git-kit'), '要标出技能本体所在');
  assert.ok(text.includes('/tmp/.dsh/skills'), 'Agent 的接入目录仍要展示');

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
      ROW({ name: 'claude-user', links: [{ target: 'agent:claude-code', label: 'Claude Code', linkPath: '/tmp/x', state: 'managed', recorded: true }] }),
      ROW({ name: 'plain', links: [] }),
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
});

test('未检查：只在筛选计数里提示，不在行内/底部重复', async () => {
  const { Component, stub } = loadModule({
    ...STATE,
    installs: [ROW(), ROW({ name: 'mystery', status: 'unknown', links: [] })],
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
  assert.ok(textOf(tree).includes('已安装'), '「已装」统一改名为「已安装」');
  assert.ok(!labels.includes('⋯'), '不使用折叠菜单');

  const caret = collectButtons(tree).find((button) => String(button.props.className || '').includes('dshsc-caret'));
  assert.ok(caret, '订阅行要有展开箭头');
  caret.props.onClick();
  tree = stub.render(Component, {}, first.hooks).tree;
  labels = collectButtons(tree).map((button) => textOf(button).trim());
  assert.ok(labels.filter((label) => label === '安装').length === 1, '只有未装条目给安装按钮');
});

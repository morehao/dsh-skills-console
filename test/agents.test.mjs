import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLI_AGENT_DIRS, SHARED_HOME_VERIFIED, createRegistry, sharedHomeOf } from '../lib/core/agents.js';
import { createPaths } from '../lib/core/paths.js';
import { dshScanRootPaths, listRoots } from '../lib/core/roots.js';
import { emptyState } from '../lib/core/state.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-agents-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, 'custom', 'skills'), { recursive: true });
  const paths = createPaths({ HOME: home });
  return { root, home, paths };
}

test('注册表排除 universal 的 .agents/skills 伪目录（F23）', () => {
  assert.ok(CLI_AGENT_DIRS.length > 10);
  const universals = CLI_AGENT_DIRS.filter(
    (entry) => (entry.base || 'home') === 'home' && entry.dir === '.agents/skills',
  );
  assert.equal(universals.length, 0);
  assert.deepEqual(
    CLI_AGENT_DIRS.find((entry) => entry.key === 'opencode'),
    { key: 'opencode', name: 'OpenCode', dir: 'opencode/skills', base: 'config', universal: true },
  );
});

test('XDG config 下的 agent（OpenCode）用 configHome 解析并被探测', () => {
  const { root, home, paths } = sandbox();
  fs.mkdirSync(path.join(home, '.config', 'opencode', 'skills'), { recursive: true });
  const state = emptyState();
  const registry = createRegistry({ paths, getState: () => state });
  const entry = registry.detected().find((item) => item.target === 'agent:opencode');
  assert.ok(entry, '~/.config/opencode/skills 存在时应探测到 OpenCode');
  assert.equal(entry.dir, path.join(home, '.config', 'opencode', 'skills'));

  const xdg = path.join(root, 'xdg');
  fs.mkdirSync(path.join(xdg, 'opencode', 'skills'), { recursive: true });
  const xdgPaths = createPaths({ HOME: home, XDG_CONFIG_HOME: xdg });
  const xdgRegistry = createRegistry({ paths: xdgPaths, getState: () => state });
  const xdgEntry = xdgRegistry.detected().find((item) => item.target === 'agent:opencode');
  assert.ok(xdgEntry, 'XDG_CONFIG_HOME 应覆盖默认 ~/.config');
  assert.equal(xdgEntry.dir, path.join(xdg, 'opencode', 'skills'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('Agent 目录后续被删：不再被探测，历史 target 仍可解析', () => {
  const { root, home, paths } = sandbox();
  const registry = createRegistry({ paths, getState: () => emptyState() });
  assert.ok(registry.detected().some((entry) => entry.target === 'agent:claude-code'));
  fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });
  assert.ok(!registry.detected().some((entry) => entry.target === 'agent:claude-code'));
  const resolved = registry.resolve('agent:claude-code');
  assert.equal(resolved.dir, path.join(home, '.claude', 'skills'));
  assert.equal(resolved.exists, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('只有存在的目录才算探测到；未知目标抛错', () => {
  const { root, home, paths } = sandbox();
  const state = emptyState();
  state.agents.custom.push({ id: 'mine', dir: path.join(home, 'custom', 'skills'), label: 'Mine' });
  const registry = createRegistry({ paths, getState: () => state });

  const detected = registry.detected();
  const targets = detected.map((entry) => entry.target);
  assert.ok(targets.includes('dsh-global'));
  assert.ok(targets.includes('agent:claude-code'));
  assert.ok(targets.includes('custom:mine'));
  assert.ok(!targets.includes('agent:codex'), '不存在的目录不该出现');

  assert.throws(() => registry.resolve('agent:nope-not-real'), /unknown target/);
  assert.throws(() => registry.resolve('project:relative/path'), /unknown target/);

  const project = registry.resolve(`project:${root}`);
  assert.equal(project.dir, path.join(root, '.dsh', 'skills'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('共享根：由 agent 表的 universal 位决定，不再靠手写猜测', () => {
  // 上游 `skillsDir === '.agents/skills'` 的条目自己也读共享根，装进 canonical 就能看见
  assert.equal(sharedHomeOf('opencode'), 'yes', 'OpenCode 官方文档也明写读 ~/.agents/skills');
  assert.equal(sharedHomeOf('cursor'), 'yes', 'Cursor 读 ~/.agents/skills 与 ~/.cursor/skills');
  assert.equal(sharedHomeOf('claude-code'), 'no', 'Claude Code 只解析 ~/.claude/skills');
  assert.equal(sharedHomeOf('goose'), 'no', '非 universal 条目需要导出');
  assert.equal(sharedHomeOf('not-a-real-key'), 'unknown', '表里没有的键不许猜');

  // 表里自带的 sharedHome 优先于 universal；显式值优先于一切
  assert.equal(sharedHomeOf('goose', { sharedHome: 'yes' }), 'yes');
  assert.equal(sharedHomeOf('opencode', { sharedHome: 'no' }), 'no');
  assert.equal(sharedHomeOf('goose', { universal: true }), 'yes');
  assert.equal(sharedHomeOf('claude-code', { universal: false }), 'no');

  // 表本身：每条都要有 universal 布尔位，否则「需不需要导出」又回到猜
  for (const entry of CLI_AGENT_DIRS) {
    assert.equal(typeof entry.universal, 'boolean', `${entry.key} 缺 universal 位`);
  }
  assert.ok(CLI_AGENT_DIRS.some((entry) => entry.universal), '至少要有一个读共享根的条目');
  assert.ok(CLI_AGENT_DIRS.some((entry) => !entry.universal), '至少要有一个需要导出的条目');

  // 出处可追溯：表是从上游 skills 的产物生成的，别让人以为是手抄的
  const table = JSON.parse(fs.readFileSync(path.join(here, '..', 'lib', 'agent-table.json'), 'utf8'));
  assert.equal(table.upstream?.name, 'skills', '要记录上游包名');
  assert.match(table.upstream?.version || '', /^\d+\.\d+\.\d+/, '要记录上游版本');
  assert.ok(['dist/cli.mjs', 'src/agents.ts'].includes(table.upstream?.from), '要记录是从哪个文件读的');

  const { root, paths } = sandbox();
  const registry = createRegistry({ paths, getState: () => emptyState() });
  const byKey = (key) => registry.all().find((entry) => entry.target === `agent:${key}`);
  assert.equal(byKey('claude-code').sharedHome, 'no');
  assert.equal(byKey('opencode').sharedHome, 'yes');
  // DSH 在 direct 模式下必然读共享根（canonical 就是 rank 500 扫描根）
  assert.equal(registry.all().find((entry) => entry.target === 'dsh-global').sharedHome, 'yes');

  // 导出资格收敛到一条判据：dsh 的扫描根 / 读共享根 / canonical 自己都不导出
  const dsh = registry.all().find((entry) => entry.target === 'dsh-global');
  assert.equal(dsh.exportBlocked, 'dsh-native-root');
  assert.equal(dsh.exportable, false);
  assert.equal(byKey('opencode').exportBlocked, 'shared-root');
  assert.equal(byKey('claude-code').exportable, true);
  assert.equal(byKey('claude-code').exportBlocked, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('扫描根表：dshScanRootPaths 与 listRoots 的本地根一致（防两处漂移）', () => {
  const { root, paths } = sandbox();
  const projectRoot = path.join(root, 'repo');
  fs.mkdirSync(path.join(projectRoot, '.git'), { recursive: true });

  const fromList = listRoots({ paths, projectRoot })
    .map((item) => path.resolve(item.path))
    .sort();
  const fromScan = dshScanRootPaths(paths, { projectRoot }).sort();
  assert.deepEqual(fromScan, fromList, '两张表必须描述同一组扫描根');

  // 项目级：`<项目>/.dsh/skills` 也是扫描根，project 目标因此不可导出
  const registry = createRegistry({ paths, getState: () => emptyState() });
  const project = registry.resolve(`project:${projectRoot}`);
  assert.equal(project.exportBlocked, 'dsh-native-root');
  assert.equal(project.exportable, false);
  fs.rmSync(root, { recursive: true, force: true });
});

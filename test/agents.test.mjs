import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CLI_AGENT_DIRS, createRegistry } from '../lib/core/agents.js';
import { createPaths } from '../lib/core/paths.js';
import { emptyState } from '../lib/core/state.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsm-agents-'));
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
    { key: 'opencode', name: 'OpenCode', dir: 'opencode/skills', base: 'config' },
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

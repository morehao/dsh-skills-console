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
  const universals = CLI_AGENT_DIRS.filter((entry) => entry.dir === '.agents/skills' || entry.dir === 'agents/skills');
  assert.equal(universals.length, 0);
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

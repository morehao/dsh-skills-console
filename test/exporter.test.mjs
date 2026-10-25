import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../lib/core/paths.js';
import { createRegistry } from '../lib/core/agents.js';
import { emptyState } from '../lib/core/state.js';
import { exportSkills } from '../lib/core/exporter.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-exporter-'));
  const home = path.join(root, 'home');
  const paths = createPaths({ HOME: home });
  fs.mkdirSync(path.join(paths.canonical, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(paths.canonical, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: demo\n---\nbody\n');
  // 只读自己目录的 agent：Claude Code
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  // 同时读共享根的 agent：OpenCode（`~/.agents/skills` 就是 canonical）
  fs.mkdirSync(path.join(home, '.config', 'opencode', 'skills'), { recursive: true });
  const registry = createRegistry({ paths, getState: () => emptyState() });
  return { root, home, paths, registry };
}

test('导出：不给读共享根的 Agent 建链', () => {
  const { root, home, paths, registry } = sandbox();
  const created = [];
  const result = exportSkills({
    paths,
    registry,
    name: 'alpha',
    targets: ['agent:opencode', 'agent:claude-code'],
    record: (row) => created.push(row),
  });

  const skipped = result.skipped.find((item) => item.target === 'agent:opencode');
  assert.equal(skipped?.reason, 'shared-root', 'OpenCode 读共享根，导出是多余的');
  assert.ok(
    !fs.existsSync(path.join(home, '.config', 'opencode', 'skills', 'alpha')),
    '不该在它的目录里留下链',
  );
  assert.ok(created.every((row) => row.target !== 'agent:opencode'), '也不该记账');

  assert.equal(result.created.length, 1, 'Claude Code 才需要导出');
  assert.equal(result.created[0].target, 'agent:claude-code');
  const link = path.join(home, '.claude', 'skills', 'alpha');
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(paths.canonical, 'alpha')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('导出：未知目标仍按失败处理，不会被共享根规则吞掉', () => {
  const { root, paths, registry } = sandbox();
  const result = exportSkills({ paths, registry, name: 'alpha', targets: ['agent:nope'] });
  assert.equal(result.failed.find((item) => item.target === 'agent:nope')?.reason, 'unknown-target');
  fs.rmSync(root, { recursive: true, force: true });
});

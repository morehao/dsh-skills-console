import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../lib/core/paths.js';
import { createRegistry } from '../lib/core/agents.js';
import { emptyState } from '../lib/core/state.js';
import { exportSkills, agentPresence } from '../lib/core/exporter.js';

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

test('导出：DSH 自己的扫描根不是导出目标（不建链、不记账）', () => {
  const { root, home, paths, registry } = sandbox();
  const recorded = [];
  const result = exportSkills({
    paths,
    registry,
    name: 'alpha',
    targets: ['dsh-global'],
    record: (row) => recorded.push(row),
  });

  assert.equal(result.created.length, 0);
  assert.equal(recorded.length, 0, '跳过的不记账');
  assert.equal(
    result.skipped.find((item) => item.target === 'dsh-global')?.reason,
    'dsh-native-root',
    '理由是「目标是 DSH 的扫描根」，不是身份判断',
  );
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Agent 现场：只算指向 canonical 的链，外来链与共享根不冒充导出', () => {
  const { root, home, paths, registry } = sandbox();
  const canonical = path.join(paths.canonical, 'alpha');
  const claudeLink = path.join(home, '.claude', 'skills', 'alpha');
  const opencodeLink = path.join(home, '.config', 'opencode', 'skills', 'alpha');

  // 用户自己的副本 + 跑在 OpenCode 目录里的链：指向别处，不是这份技能的导出
  const otherRepo = path.join(home, 'other-repo', 'alpha');
  fs.mkdirSync(otherRepo, { recursive: true });
  fs.symlinkSync(otherRepo, claudeLink, 'dir');
  // OpenCode 读共享根，即使链指向 canonical 也不需要、不算导出
  fs.symlinkSync(canonical, opencodeLink, 'dir');

  let rows = agentPresence({ paths, registry, name: 'alpha' });
  assert.deepEqual(rows, [], 'foreign-link 与共享根 Agent 都不进导出清单');

  // 换成指向 canonical 的链：未记账也算「现场有」（managed-external，可被接管）
  fs.unlinkSync(claudeLink);
  fs.symlinkSync(canonical, claudeLink, 'dir');
  rows = agentPresence({ paths, registry, name: 'alpha' });
  assert.deepEqual(
    rows.map((row) => [row.target, row.state]),
    [['agent:claude-code', 'managed-external']],
    '只有 Claude Code 这一条真导出',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveVisibility } from '../lib/core/visibility.js';
import { scanSkillRoot } from '../lib/core/roots.js';

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-visibility-'));
}

function skill(dir, name, extra = '') {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} copy\n${extra}---\nbody\n`,
    'utf8',
  );
  return dir;
}

function roots({ home, project = null }) {
  const list = [];
  if (project) {
    list.push({ source: 'project-dsh', rank: 100, path: path.join(project, '.dsh', 'skills'), exists: true });
    list.push({ source: 'project-agents', rank: 200, path: path.join(project, '.agents', 'skills'), exists: true });
  }
  list.push({ source: 'user-dsh', rank: 400, path: path.join(home, '.dsh', 'skills'), exists: true });
  list.push({ source: 'user-agents', rank: 500, path: path.join(home, '.agents', 'skills'), exists: true });
  return list;
}

test('可见性：canonical 被本地策略隐藏 → visible=false，hiddenBy 说明是 policy', () => {
  const root = sandbox();
  const home = path.join(root, 'home');
  const canonical = skill(path.join(home, '.agents', 'skills', 'demo'), 'demo');
  const { byName } = resolveVisibility({
    roots: roots({ home }),
    policyHiddenPaths: new Set([canonical]),
  });
  const item = byName.get('demo');
  assert.equal(item.visible, false);
  assert.equal(item.shadowed, true);
  assert.equal(item.policyHidden, true);
  assert.equal(item.foreignHidden, false);
  assert.deepEqual(item.hiddenBy, [{ kind: 'policy', path: canonical }]);
  assert.equal(item.sources['user-agents'], 'shadowed');
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：策略隐藏 canonical 但项目副本存在 → 项目副本继续可见', () => {
  const root = sandbox();
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const canonical = skill(path.join(home, '.agents', 'skills', 'demo'), 'demo');
  const copy = skill(path.join(project, '.dsh', 'skills', 'demo'), 'demo');
  const { byName } = resolveVisibility({
    roots: roots({ home, project }),
    policyHiddenPaths: new Set([canonical]),
  });
  const item = byName.get('demo');
  assert.equal(item.visible, true, '项目副本 rank 100 赢');
  assert.equal(item.winnerSource, 'project-dsh');
  assert.equal(item.winnerPath, copy);
  assert.equal(item.sources['project-dsh'], 'present');
  assert.equal(item.sources['user-agents'], 'shadowed', 'canonical 那一份仍是隐藏的');
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：更靠前的 disable-model-invocation 技能（外来桩）也视为不可见', () => {
  const root = sandbox();
  const home = path.join(root, 'home');
  skill(path.join(home, '.agents', 'skills', 'demo'), 'demo');
  const stub = skill(path.join(home, '.dsh', 'skills', 'demo'), 'demo', 'disable-model-invocation: true\nuser-invocable: false\n');
  const { byName } = resolveVisibility({ roots: roots({ home }) });
  const item = byName.get('demo');
  assert.equal(item.visible, false);
  assert.equal(item.policyHidden, false);
  assert.equal(item.foreignHidden, true);
  assert.deepEqual(item.hiddenBy, [{ kind: 'foreign', path: stub }]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：policyHiddenPaths 只影响命中的那一份，不影响同名其他目录', () => {
  const root = sandbox();
  const home = path.join(root, 'home');
  const canonical = skill(path.join(home, '.agents', 'skills', 'demo'), 'demo');
  skill(path.join(home, '.agents', 'skills', 'other'), 'other');
  const { byName } = resolveVisibility({
    roots: roots({ home }),
    policyHiddenPaths: new Set([canonical]),
  });
  assert.equal(byName.get('other').visible, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('scanSkillRoot：解析 disable-model-invocation / user-invocable（缺省都算可调用）', () => {
  const root = sandbox();
  skill(path.join(root, 'normal'), 'normal');
  skill(path.join(root, 'off'), 'off', 'disable-model-invocation: true\nuser-invocable: false\n');
  skill(path.join(root, 'slash-only'), 'slash-only', 'user-invocable: false\n');
  const { entries } = scanSkillRoot(root);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  assert.equal(byName.get('normal').modelInvocable, true);
  assert.equal(byName.get('normal').userInvocable, true);
  assert.equal(byName.get('off').modelInvocable, false);
  assert.equal(byName.get('off').userInvocable, false);
  assert.equal(byName.get('slash-only').modelInvocable, true, '只关掉 / 调用不隐藏模型可见性');
  assert.equal(byName.get('slash-only').userInvocable, false);
  fs.rmSync(root, { recursive: true, force: true });
});

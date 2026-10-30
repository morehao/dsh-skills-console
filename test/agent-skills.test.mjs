import assert from 'node:assert/strict';
import test from 'node:test';
import { collectAgentSkills } from '../dist/core/agent-skills.js';

/** 伪造一个 live agent：`ctx.get('skills').snapshot()` 返回给定结果。 */
function fakeAgent(id, snapshot) {
  return {
    id,
    ctx: {
      get(service) {
        if (service !== 'skills') return undefined;
        return { snapshot: typeof snapshot === 'function' ? snapshot : async () => snapshot };
      },
    },
  };
}

test('collectAgentSkills：无 live agent → available=false', async () => {
  const r = await collectAgentSkills({ list: () => [] });
  assert.equal(r.available, false);
  assert.deepEqual(r.skills, []);
});

test('collectAgentSkills：agents 服务缺失 → available=false', async () => {
  const r = await collectAgentSkills(undefined);
  assert.equal(r.available, false);
});

test('collectAgentSkills：多个 agent 按名并集，同名取先出现者，complete 取与', async () => {
  const agentsService = {
    list: () => [
      fakeAgent('a', { complete: true, skills: [{ name: 'alpha', path: '/x/a/SKILL.md' }, { name: 'shared', path: '/x/shared-a/SKILL.md' }] }),
      fakeAgent('b', { complete: false, skills: [{ name: 'beta', path: '/x/b/SKILL.md' }, { name: 'shared', path: '/x/shared-b/SKILL.md' }] }),
    ],
  };
  const r = await collectAgentSkills(agentsService);
  assert.equal(r.available, true);
  assert.equal(r.agents, 2);
  assert.equal(r.complete, false, '任一 agent 不完整 → 整体不完整');
  assert.deepEqual(r.skills.map((s) => s.name).sort(), ['alpha', 'beta', 'shared']);
  assert.equal(r.skills.find((s) => s.name === 'shared').path, '/x/shared-a/SKILL.md', '同名取先出现者');
});

test('collectAgentSkills：单个 agent 抛错 → 记错误、其余仍可用', async () => {
  const agentsService = {
    list: () => [
      fakeAgent('bad', async () => { throw new Error('boom'); }),
      fakeAgent('good', { complete: true, skills: [{ name: 'alpha' }] }),
    ],
  };
  const r = await collectAgentSkills(agentsService);
  assert.equal(r.available, true);
  assert.equal(r.agents, 1);
  assert.equal(r.complete, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].agent, 'bad');
  assert.deepEqual(r.skills.map((s) => s.name), ['alpha']);
});

test('collectAgentSkills：有 agent 但没有 skills 服务 → 跳过，不误判 available', async () => {
  const r = await collectAgentSkills({ list: () => [{ id: 'x', ctx: { get: () => undefined } }] });
  assert.equal(r.available, false);
});

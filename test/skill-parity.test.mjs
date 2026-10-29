import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { scanSkillRoot } from '../dist/core/roots.js';

/**
 * 契约测试：插件自己的扫描（`scanSkillRoot`）与 DSH 宿主的
 * `FileSystemSkillProvider` 对同一目录必须给出同一批技能与同样的调用策略。
 * 只要 DSH 改了名规则 / frontmatter 语义，这条会先红。
 */

function writeSkill(dir, frontmatter) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\nbody\n`, 'utf8');
}

async function providerScan(root) {
  const ctx = { logger: { warn() {}, info() {} }, get: () => undefined };
  const control = { signal: new AbortController().signal, invalidate() {} };
  const provider = new FileSystemSkillProvider(ctx, control, {
    includeDefaultRoots: false,
    customSkillDirs: [root],
    watch: false,
    providerName: 'parity',
  });
  const out = await provider.list({ cwd: undefined });
  const list = Array.isArray(out) ? out : out.candidates;
  await provider.dispose();
  return new Map(list.map((c) => [c.name, c.invocation]));
}

test('scanSkillRoot 与宿主 FileSystemSkillProvider 的名/调用策略一致', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-parity-'));
  writeSkill(path.join(root, 'normal'), 'name: normal\ndescription: d');
  writeSkill(path.join(root, 'off'), 'name: off\ndescription: d\ndisable-model-invocation: true\nuser-invocable: false');
  writeSkill(path.join(root, 'slash-only'), 'name: slash-only\ndescription: d\nuser-invocable: false');
  // YAML 1.1 风格布尔：宿主 frontmatterBoolean 会当成 true
  writeSkill(path.join(root, 'yes-off'), 'name: yes-off\ndescription: d\ndisable-model-invocation: yes');
  // 宿主会忽略：非 kebab 名、旧字段名
  writeSkill(path.join(root, 'bad-name'), 'name: My_Skill\ndescription: d');
  writeSkill(path.join(root, 'legacy'), 'name: legacy\ndescription: d\ndisableModelInvocation: true');

  const { entries } = scanSkillRoot(root);
  const ours = new Map(entries.map((entry) => [entry.name, {
    modelInvocable: entry.modelInvocable,
    userInvocable: entry.userInvocable,
  }]));
  const host = await providerScan(root);

  assert.deepEqual([...ours.keys()].sort(), [...host.keys()].sort(), '技能集合一致');
  for (const [name, invocation] of host) {
    assert.deepEqual(ours.get(name), {
      modelInvocable: invocation.modelInvocable,
      userInvocable: invocation.userInvocable,
    }, `调用策略一致: ${name}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

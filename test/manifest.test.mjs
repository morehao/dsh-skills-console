/**
 * 迁移名单（manifest）离线测试：只覆盖**不联网、不碰真实目录**的部分。
 * - exportManifest：读 state/lock 合成名单（source 来自 lock、ref 取订阅分支、无上游单列）。
 * - importManifest：结构校验 + dryRun 计划（跳过已装、补订阅），不做任何写操作。
 * 真实安装链路（download → canonical → lock）由 native-install.test.mjs 覆盖。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPaths } from '../dist/core/paths.js';
import { createRegistry } from '../dist/core/agents.js';
import { createService } from '../dist/core/service.js';
import { StateStore } from '../dist/core/state.js';
import { exportManifest, importManifest } from '../dist/core/service/manifest.js';

const SKILL_MD = (name) => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n`;

/** 造一个临时 HOME，canonical 里放几个技能目录，并写入 state / lock。 */
function setup({ installs = [], subscriptions = [], lockSkills = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-manifest-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  fs.mkdirSync(paths.canonical, { recursive: true });

  // canonical 目录（账本扫描需要真实目录 + SKILL.md）：installs 与 lock 里出现的名字并集
  const dirNames = new Set([...installs.map((i) => i.name), ...Object.keys(lockSkills)]);
  for (const name of dirNames) {
    const dir = path.join(paths.canonical, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL_MD(name), 'utf8');
  }

  // lock（source 来源）
  const lock = { version: 3, skills: lockSkills };
  fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
  fs.writeFileSync(paths.lockFile, JSON.stringify(lock, null, 2), 'utf8');

  const store = new StateStore(paths);
  store.load();
  store.update((draft) => {
    draft.installs = installs;
    draft.subscriptions = subscriptions;
  });

  const registry = createRegistry({ paths, getState: () => store.state });
  const service = createService({ paths, store, registry, logger: () => {} });
  return { root, paths, store, service };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('exportManifest：source 来自 lock，ref 取订阅分支，无上游单列', async () => {
  const { root, paths, store, service } = setup({
    installs: [
      { name: 'git-kit', subscriptionId: 'sub-a', mode: 'auto' },
      { name: 'disk-cleanup', subscriptionId: 'sub-a', mode: 'auto' },
      { name: 'solo', subscriptionId: null, mode: 'auto' }, // lock 有 source，无订阅 → ref null
      { name: 'orphan', subscriptionId: null, mode: 'auto' }, // lock 无 source → 无上游
    ],
    subscriptions: [
      { id: 'sub-a', source: 'morehao/agent-skills', ref: 'main', subpath: null, skills: '*' },
      { id: 'sub-b', source: 'x/y', ref: 'master', subpath: null, skills: '*' }, // 只订未装
    ],
    lockSkills: {
      'git-kit': { source: 'morehao/agent-skills', ref: 'deadbeef', skillPath: 'skills/git-kit/SKILL.md' },
      'disk-cleanup': { source: 'morehao/agent-skills', ref: 'deadbeef', skillPath: 'skills/disk-cleanup/SKILL.md' },
      solo: { source: 'me/solo', ref: 'cafebabe', skillPath: 'SKILL.md' },
      // orphan 没有 lock 条目
    },
  });
  try {
    const m = await service.exportManifest();
    assert.equal(m.version, 1);
    // morehao/agent-skills 组：ref 取订阅的 main（不是 lock 的 commit），含两个技能
    const group = m.sources.find((g) => g.source === 'morehao/agent-skills');
    assert.ok(group, '有 agent-skills 组');
    assert.equal(group.ref, 'main', 'ref 用订阅分支而不是 lock commit');
    assert.deepEqual(group.skills, ['disk-cleanup', 'git-kit']);
    // solo：lock 有 source 无订阅 → ref null
    const solo = m.sources.find((g) => g.source === 'me/solo');
    assert.ok(solo, 'solo 有 source 能分组');
    assert.equal(solo.ref, null, '无订阅时 ref 为 null 交给 install 解析默认分支');
    // 订阅全量带出（含只订未装的 x/y）
    assert.ok(m.subscriptions.some((s) => s.source === 'x/y' && s.ref === 'master'), '只订未装也带出');
    // 无上游只 orphan 一个
    assert.deepEqual(m.noUpstream, ['orphan']);
    // installed 含全部 4 个（含无上游）
    assert.equal(m.installed.length, 4);
  } finally {
    cleanup(root);
  }
});

test('importManifest：结构不合法直接报错', async () => {
  const { root, service } = setup();
  try {
    await assert.rejects(() => service.importManifest({ manifest: {} }), /sources|名单格式/);
    await assert.rejects(() => service.importManifest({ manifest: null }), /名单格式/);
  } finally {
    cleanup(root);
  }
});

test('importManifest：dryRun 跳过已装、列出待装与待补订阅，且不写任何东西', async () => {
  const { root, store, service } = setup({
    installs: [{ name: 'git-kit', subscriptionId: 'sub-a', mode: 'auto' }],
    subscriptions: [{ id: 'sub-a', source: 'morehao/agent-skills', ref: 'main', subpath: null, skills: '*' }],
    lockSkills: { 'git-kit': { source: 'morehao/agent-skills', ref: 'x', skillPath: 'skills/git-kit/SKILL.md' } },
  });
  try {
    const before = JSON.stringify(store.state);
    const res = await service.importManifest({
      dryRun: true,
      manifest: {
        version: 1,
        sources: [
          { source: 'morehao/agent-skills', ref: 'main', skills: ['git-kit', 'handoff', 'tech-design'] },
          { source: 'tt-a1i/archify', ref: 'main', skills: ['archify'] },
        ],
        subscriptions: [
          { source: 'morehao/agent-skills', ref: 'main', subpath: null }, // 已有 → 不补
          { source: 'tt-a1i/archify', ref: 'main', subpath: null }, // 缺 → 补
        ],
        noUpstream: ['weather-query'],
      },
    });
    assert.equal(res.dryRun, true);
    assert.equal(res.ok, true);
    // 已装的 git-kit 进 skip；handoff/tech-design/archify 待装
    const agentGroup = res.plan.find((p) => p.source === 'morehao/agent-skills');
    assert.deepEqual(agentGroup.skip, ['git-kit']);
    assert.deepEqual(agentGroup.install, ['handoff', 'tech-design']);
    assert.equal(res.planInstallCount, 3);
    // 只补 archify 一条订阅
    assert.deepEqual(res.subscriptionsToAdd.map((s) => s.source), ['tt-a1i/archify']);
    assert.deepEqual(res.noUpstream, ['weather-query']);
    // 未落任何改动
    assert.equal(JSON.stringify(store.state), before, 'dryRun 不能改 state');
  } finally {
    cleanup(root);
  }
});

test('importManifest：force=true 时不跳过已装', async () => {
  const { root, store, service } = setup({
    installs: [{ name: 'git-kit', subscriptionId: 'sub-a', mode: 'auto' }],
    subscriptions: [{ id: 'sub-a', source: 'morehao/agent-skills', ref: 'main', subpath: null, skills: '*' }],
    lockSkills: { 'git-kit': { source: 'morehao/agent-skills', ref: 'x', skillPath: 'skills/git-kit/SKILL.md' } },
  });
  try {
    const res = await service.importManifest({
      dryRun: true,
      force: true,
      manifest: {
        version: 1,
        sources: [{ source: 'morehao/agent-skills', ref: 'main', skills: ['git-kit', 'handoff'] }],
        subscriptions: [],
      },
    });
    const g = res.plan[0];
    assert.deepEqual(g.skip, []);
    assert.deepEqual(g.install, ['git-kit', 'handoff']);
  } finally {
    cleanup(root);
  }
});

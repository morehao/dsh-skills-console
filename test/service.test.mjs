import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaths } from '../dist/core/paths.js';
import { createRegistry } from '../dist/core/agents.js';
import { createService, ServiceError } from '../dist/core/service.js';
import { contentHash, contentHashWith, localeComparator } from '../dist/core/hash.js';
import { hashWithoutInvocation } from '../dist/core/invocation.js';
import { gitTreeSha, treeShaFromEntries } from '../dist/core/git-tree.js';
import { StateStore } from '../dist/core/state.js';
import { createShadow } from '../dist/core/shadow.js';
import { snapshotId } from '../dist/core/updates.js';
import { writeTarFixture } from './helpers/tar-fixture.mjs';

const TREE_SHA = 'e'.repeat(40);
const COMMIT = 'f'.repeat(40);

/**
 * Service 测试替身：只模拟 installer 的对外契约（canonical + lock），
 * 真实下载/解压/tree SHA 在 test/installer.test.mjs 覆盖。
 */
function createFakeInstaller({ paths, env, usable = true }) {
  const flags = { usable };
  const readLockFile = () => {
    try {
      return JSON.parse(fs.readFileSync(paths.lockFile, 'utf8'));
    } catch {
      return { version: 3, skills: {} };
    }
  };
  const writeLockFile = (lock) => {
    fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
    fs.writeFileSync(paths.lockFile, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  };

  return {
    readiness: () => ({
      usable: flags.usable,
      source: 'native',
      version: null,
      json: true,
      fullDepth: true,
      problem: flags.usable ? null : 'lock-unsupported',
    }),
    setUsable(value) {
      flags.usable = value;
    },
    async install({ source, names = [], ref = null }) {
      // 留空时模拟「整仓全部」：固定两个技能，方便断言按安装结果记账
      const selected = names.length > 0 ? names : ['all-one', 'all-two'];
      const hash = env.TEST_TREE_SHA || TREE_SHA;
      const lock = readLockFile();
      const installed = [];
      for (const name of selected) {
        const dir = path.join(paths.canonical, name);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: demo\n---\nbody\n`);
        const src = source || env.TEST_SOURCE || 'morehao/ai-kit';
        const entry = {
          source: src,
          sourceType: 'github',
          sourceUrl: `https://github.com/${src}.git`,
          skillPath: `skills/${name}/SKILL.md`,
          skillFolderHash: hash,
          installedAt: lock.skills[name]?.installedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (ref) entry.ref = ref;
        lock.skills[name] = entry;
        installed.push({
          name,
          skillPath: entry.skillPath,
          lockHash: hash,
          treeSha: /^[0-9a-f]{40}$/.test(hash) ? hash : null,
          contentHash: contentHash(dir),
          backup: null,
        });
      }
      lock.version = 3;
      writeLockFile(lock);
      return { installed, warnings: [] };
    },
    async remove({ name }) {
      fs.rmSync(path.join(paths.canonical, name), { recursive: true, force: true });
      const lock = readLockFile();
      delete lock.skills[name];
      writeLockFile(lock);
      return { removed: true };
    },
  };
}

function setup(extra = {}, envExtra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-service-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.dsh', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  const paths = createPaths({ HOME: home, DSH_HOME: path.join(home, '.dsh') });
  const store = new StateStore(paths);
  store.load();
  const registry = createRegistry({ paths, getState: () => store.state });
  const env = { ...process.env, TEST_TREE_SHA: TREE_SHA, ...envExtra };
  const logger = () => {};
  const defaultGh = githubStub({ tree: DEFAULT_TREE });
  const installer = extra.installer || createFakeInstaller({ paths, env, usable: extra.installerUsable !== false });
  const service = createService({
    paths,
    store,
    registry,
    installer,
    logger,
    env,
    fetchImpl: defaultGh.fetchImpl,
    visibleProvider: async () => ({ skills: [{ name: 'alpha', source: 'user-dsh' }], complete: true }),
    // policy provider 的替身：默认「有 provider、一个 live agent 注册成功」，
    // 这样 setMode 不会被 409 拦住；需要测失败路径的用例显式覆盖。
    policyStatus: () => ({ available: true, liveAgents: 1, registered: 1, errors: [] }),
    invalidatePolicies: async () => {},
    ...extra,
  });
  return { root, home, paths, store, service, registry, installer, gh: defaultGh };
}

test('安装：canonical + lock 断言 + 默认不导出 + 记账', async () => {
  const { root, home, paths, store, service } = setup();
  const result = await service.install({
    source: 'morehao/ai-kit',
    skills: ['alpha'],
    targets: ['agent:claude-code'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.installed.length, 1);

  const canonical = path.join(paths.canonical, 'alpha');
  assert.ok(fs.existsSync(path.join(canonical, 'SKILL.md')));
  const install = store.findInstall('alpha');
  assert.ok(install, '必须写 installs 记录');
  assert.match(install.installedHash, /^[0-9a-f]{64}$/);
  assert.equal(install.enabled, true);
  assert.equal('mode' in install, false, 'v2 不再落盘 mode');

  // direct 模式：canonical 就是 rank 500 的扫描根，`~/.dsh/skills` 那条链没有任何可见性收益
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false, '不再建 rank 提升链');
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(), '点名的 Agent 才建链');
  assert.equal(store.state.exports.filter((row) => row.skill === 'alpha').length, 1);

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.equal(row.managed, true);
  assert.equal(row.visible, true, 'canonical 在 user-agents 根里，模型可见');
  assert.equal(row.visibleSource, 'user-agents');
  assert.deepEqual(row.exports.map((item) => item.target), ['agent:claude-code']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('安装：技能名留空 → installer 装全部，并按实际发现结果记账', async () => {
  const { root, paths, store, service } = setup();
  const result = await service.install({ source: 'https://github.com/alchaincyf/huashu-design', skills: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.installed.map((item) => item.name).sort(), ['all-one', 'all-two'], '以 CLI 输出为准');

  for (const name of ['all-one', 'all-two']) {
    assert.ok(fs.existsSync(path.join(paths.canonical, name, 'SKILL.md')), `${name} 要落进 canonical`);
    assert.ok(store.findInstall(name), `${name} 要有 installs 记录`);
  }
  assert.equal(store.state.installs.length, 2);
  assert.equal(store.state.exports.length, 0, '默认一个 agent 都不导出');
  fs.rmSync(root, { recursive: true, force: true });
});

test('作用范围：/state 带出可选的 DSH 工作区', async () => {
  const workspace = { id: 'w1', title: 'my-project', path: '/tmp/my-project' };
  const { root, service } = setup({ workspacesProvider: async () => [workspace] });
  const state = await service.getState({});
  assert.deepEqual(state.workspaces, [workspace]);

  const broken = setup({ workspacesProvider: async () => { throw new Error('registry down'); } });
  const fallback = await broken.service.getState({});
  assert.deepEqual(fallback.workspaces, [], '工作区服务失败不影响清单');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(broken.root, { recursive: true, force: true });
});

test('导出：默认不导出；勾选 exportTargets 后新装技能才建链', async () => {
  const { root, home, store, service } = setup();
  fs.mkdirSync(path.join(home, '.codebuddy', 'skills'), { recursive: true });

  await service.setSettings({ exportTargets: ['agent:claude-code', 'agent:not-detected', 'bad-target', 'dsh-global'] });
  assert.deepEqual(
    store.state.settings.exportTargets,
    ['agent:claude-code'],
    '未知/未探测的 Agent 与非 agent 目标被过滤',
  );

  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(), '勾选的 Agent 要建');
  assert.equal(fs.existsSync(path.join(home, '.codebuddy', 'skills', 'alpha')), false, '没勾的不能建');
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false, 'DSH 自己的根永远不进导出');

  await service.setSettings({ exportTargets: [] });
  await service.install({ source: 'morehao/ai-kit', skills: ['beta'] });
  assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'beta')), false, '清空后不导出');

  // v1 客户端别名：`null` 原本表示「所有探测到的 Agent」，语义照搬
  await service.setSettings({ autoLinkTargets: null });
  await service.install({ source: 'morehao/ai-kit', skills: ['gamma'] });
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'gamma')).isSymbolicLink());
  assert.ok(fs.lstatSync(path.join(home, '.codebuddy', 'skills', 'gamma')).isSymbolicLink());
  fs.rmSync(root, { recursive: true, force: true });
});

test('入口位置：settings / sidebar 持久化，非法值被忽略', async () => {
  const { root, store, service } = setup();
  assert.equal(store.state.settings.placement, 'settings');
  await service.setSettings({ placement: 'sidebar' });
  assert.equal(store.state.settings.placement, 'sidebar');
  await service.setSettings({ placement: 'bogus' });
  assert.equal(store.state.settings.placement, 'sidebar', '非法值不能把入口弄坏');
  await service.setSettings({ placement: 'settings' });
  assert.equal(store.state.settings.placement, 'settings');
  fs.rmSync(root, { recursive: true, force: true });
});

test('启停：off 只写 enabled（不写 ~/.dsh/skills、不动真身与其他 Agent）；on 恢复可见', async () => {
  let invalidated = 0;
  const { root, home, paths, service, store } = setup({ invalidatePolicies: async () => { invalidated += 1; } });
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['agent:claude-code'] });

  const before = await service.getState({});
  assert.equal(before.installs.find((item) => item.name === 'alpha').visible, true);
  const canonicalMd = path.join(paths.canonical, 'alpha', 'SKILL.md');
  const hashBefore = contentHash(path.join(paths.canonical, 'alpha'));
  const lockBefore = fs.readFileSync(paths.lockFile, 'utf8');

  const off = await service.setMode({ name: 'alpha', mode: 'off' });
  assert.equal(off.enabled, false);
  assert.equal(off.policy, 'provider');
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false, '停用不写扫描根');
  assert.equal(contentHash(path.join(paths.canonical, 'alpha')), hashBefore, 'canonical 内容不变');
  assert.equal(fs.readFileSync(paths.lockFile, 'utf8'), lockBefore, 'lock 不变');
  assert.ok(fs.existsSync(canonicalMd), '真身不能动');
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'skills', 'alpha')).isSymbolicLink(), '其他 Agent 不动');
  assert.equal(store.findInstall('alpha').enabled, false);
  assert.equal(invalidated, 1, '写完 state 要让每个 live agent 的 provider 失效');

  const afterOff = await service.getState({});
  const hidden = afterOff.installs.find((item) => item.name === 'alpha');
  assert.equal(hidden.visible, false, '停用后模型不可见（canonical 是 native winner）');
  assert.equal(hidden.visibility.policyHidden, true);
  assert.equal(hidden.visibility.shadowed, true);
  assert.equal(hidden.enabled, false);

  const again = await service.setMode({ name: 'alpha', mode: 'off' });
  assert.equal(again.already, true, '幂等');
  assert.equal(invalidated, 1, '幂等时不重复 invalidate');

  const on = await service.setMode({ name: 'alpha', mode: 'on' });
  assert.equal(on.enabled, true);
  assert.equal(invalidated, 2);
  const afterOn = await service.getState({});
  assert.equal(afterOn.installs.find((item) => item.name === 'alpha').visible, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('启停：项目 scope 已移除 → 400；宿主没有 provider / 全部注册失败 → 409 且不写 enabled', async () => {
  const noProvider = setup({ policyStatus: () => ({ available: false, liveAgents: 0, registered: 0, errors: [] }) });
  await noProvider.service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await assert.rejects(
    () => noProvider.service.setMode({ name: 'alpha', mode: 'off' }),
    (error) => {
      assert.equal(error.code, 'error.skills.policy-unavailable');
      assert.equal(error.status, 409);
      return true;
    },
  );
  assert.equal(noProvider.store.findInstall('alpha').enabled, true, '不能写假的停用状态');
  fs.rmSync(noProvider.root, { recursive: true, force: true });

  const allFailed = setup({ policyStatus: () => ({ available: true, liveAgents: 2, registered: 0, errors: [{ agent: 'a' }] }) });
  await allFailed.service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await assert.rejects(
    () => allFailed.service.setMode({ name: 'alpha', mode: 'off' }),
    (error) => error.code === 'error.skills.policy-unavailable' && error.status === 409,
  );
  assert.equal(allFailed.store.findInstall('alpha').enabled, true);
  fs.rmSync(allFailed.root, { recursive: true, force: true });

  const scoped = setup();
  await scoped.service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await assert.rejects(
    () => scoped.service.setMode({ name: 'alpha', mode: 'off', scope: 'project:/repo' }),
    (error) => error.code === 'error.skills.scope-unsupported' && error.status === 400,
  );
  assert.equal(scoped.store.findInstall('alpha').enabled, true);
  fs.rmSync(scoped.root, { recursive: true, force: true });
});

test('启停：flat .md 技能 → 400 unsupported，不写 enabled', async () => {
  const { root, paths, service, store } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  fs.rmSync(path.join(paths.canonical, 'alpha'), { recursive: true, force: true });
  fs.writeFileSync(path.join(paths.canonical, 'alpha.md'), '---\nname: alpha\ndescription: flat\n---\n');

  await assert.rejects(
    () => service.setMode({ name: 'alpha', mode: 'off' }),
    (error) => error.code === 'error.skills.unsupported' && error.status === 400,
  );
  assert.equal(store.findInstall('alpha').enabled, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('启停：on 时旧桩删不掉 → 409 shadow-locked，且不改 enabled', async () => {
  const { root, paths, service, store } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await service.setMode({ name: 'alpha', mode: 'off' });
  // 迁移删不掉的 foreign 旧桩：账本里有，但实际目录不是我们的
  const stub = path.join(paths.dshGlobalSkills, 'alpha');
  fs.mkdirSync(stub, { recursive: true });
  fs.writeFileSync(path.join(stub, 'SKILL.md'), '---\nname: alpha\ndescription: mine\n---\n');
  store.update((draft) => {
    draft.legacyShadows.push({ skill: 'alpha', stubPath: stub, reason: 'foreign', at: new Date().toISOString() });
  });

  await assert.rejects(
    () => service.setMode({ name: 'alpha', mode: 'on' }),
    (error) => error.code === 'error.skills.shadow-locked' && error.status === 409,
  );
  assert.equal(store.findInstall('alpha').enabled, false, '删不掉旧桩就不改 enabled');
  assert.ok(fs.existsSync(stub), '别人的目录不能删');
  fs.rmSync(root, { recursive: true, force: true });
});

test('启停：on 会清掉能删的 legacy 桩并移出 legacyShadows', async () => {
  const { root, paths, service, store } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await service.setMode({ name: 'alpha', mode: 'off' });
  const stub = path.join(paths.dshGlobalSkills, 'alpha');
  createShadow({ stubPath: stub, name: 'alpha', scope: 'user' });
  store.update((draft) => {
    draft.legacyShadows.push({ skill: 'alpha', stubPath: stub, reason: 'pending', at: new Date().toISOString() });
  });

  const on = await service.setMode({ name: 'alpha', mode: 'on' });
  assert.equal(on.enabled, true);
  assert.equal(fs.existsSync(stub), false, '旧桩要清掉');
  assert.deepEqual(store.state.legacyShadows, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('调试诊断：policy 能力/注册数可见，legacyShadows 进 drift，旧 shadow 键退休', async () => {
  const { root, paths, service, store } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const stub = path.join(paths.dshGlobalSkills, 'legacy-demo');
  store.update((draft) => {
    draft.legacyShadows.push({ skill: 'legacy-demo', stubPath: stub, reason: 'orphan', at: new Date().toISOString() });
  });

  const report = await service.diagnostics();
  assert.deepEqual(report.policy, {
    available: true,
    agents: 1,
    liveAgents: 1,
    errors: [],
    blindSpots: ['custom-dirs', 'plugin-skills'],
  });
  assert.equal(report.legacyShadows, 1);
  assert.equal(report.drift.legacyShadows.length, 1);
  assert.equal(report.drift.legacyShadows[0].reason, 'orphan');
  assert.equal('shadowOrphans' in report.drift, false);
  assert.equal('shadowBroken' in report.drift, false);
  assert.equal('shadowUnrecorded' in report.drift, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('同名副本：模型看到的是更小 rank 的那份，账本要说出来', async () => {
  const { root, home, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['dsh-global'] });

  // 模拟用户手工留在 ~/.dsh/skills 的一份旧备份：目录名不同，frontmatter 却叫 alpha
  const bak = path.join(home, '.dsh', 'skills', 'alpha.bak-20260101-000000');
  fs.mkdirSync(bak, { recursive: true });
  fs.writeFileSync(path.join(bak, 'SKILL.md'), '---\nname: alpha\ndescription: 旧备份\n---\nbody\n');

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.equal(row.visible, true);
  assert.equal(row.visibility.winnerSource, 'user-dsh', '400 盖住 500');
  assert.equal(row.visibility.winnerIsCanonical, false, '可见的不是 canonical 这一份');
  assert.equal(row.visibility.nameConflict, true);
  assert.equal(row.visibility.winnerPath, bak);
  // 被盖住的候选包括 canonical（500）与宿主 snapshot（600）
  assert.deepEqual(row.visibility.shadowedBy.map((item) => item.source).sort(), ['bundled', 'user-agents']);
  // 备份目录不能自己变成一个可见技能名
  assert.equal(state.visible.some((item) => item.name === 'alpha.bak-20260101-000000'), false);
  assert.deepEqual(store.state.legacyShadows, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('删除：体检拦截真实目录；通过后进回收站并清记账', async () => {
  const { root, home, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['dsh-global', 'agent:claude-code'] });

  const claudeLink = path.join(home, '.claude', 'skills', 'alpha');
  fs.rmSync(claudeLink, { force: true });
  fs.mkdirSync(claudeLink);
  fs.writeFileSync(path.join(claudeLink, 'SKILL.md'), 'mine');

  await assert.rejects(
    () => service.remove({ name: 'alpha' }),
    (error) => {
      assert.equal(error.code, 'error.skills.remove-conflict');
      assert.match(error.message, /不是本插件创建/);
      return true;
    },
  );
  assert.ok(fs.existsSync(path.join(paths.canonical, 'alpha', 'SKILL.md')), '拦截时不能动真身');

  await assert.rejects(
    () => service.remove({ name: '../escape' }),
    (error) => error.code === 'error.skills.not-found',
  );

  fs.rmSync(claudeLink, { recursive: true, force: true });
  const result = await service.remove({ name: 'alpha' });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  assert.ok(fs.existsSync(path.join(paths.trashDir, result.trash, 'content', 'SKILL.md')));
  assert.equal(store.findInstall('alpha'), undefined);
  assert.equal(fs.existsSync(path.join(home, '.dsh', 'skills', 'alpha')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('删除：别的 Agent 指向别处的同名链不阻塞，也不动它', async () => {
  const { root, home, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['dsh-global'] });

  // OpenCode 自己把 handoff/alpha 链到另一个仓库——与 canonical、与本插件记账都无关
  const opencode = path.join(home, '.config', 'opencode', 'skills');
  const elsewhere = path.join(home, 'other-source', 'alpha');
  fs.mkdirSync(opencode, { recursive: true });
  fs.mkdirSync(elsewhere, { recursive: true });
  fs.symlinkSync(elsewhere, path.join(opencode, 'alpha'), 'dir');

  const result = await service.remove({ name: 'alpha' });
  assert.equal(result.ok, true, '不在导出记账里的同名路径不能拦删除');
  assert.ok(fs.existsSync(path.join(opencode, 'alpha')), '别人的链原样保留');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'alpha')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：技能自己声明 disable-model-invocation，说明「只能手动调用」且不算诊断异常', async () => {
  const { root, paths, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const doc = path.join(paths.canonical, 'alpha', 'SKILL.md');
  fs.writeFileSync(doc, '---\nname: alpha\ndescription: demo\ndisable-model-invocation: true\n---\nbody\n');

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.equal(row.visible, false, '模型不可见');
  assert.equal(row.visibility.winnerIsCanonical, true, '但赢的就是 canonical 这份');
  assert.equal(row.visibility.selfHidden, true, '原因是技能自己的 frontmatter');
  assert.equal(row.visibility.policyHidden, false, '不是本地策略停用');

  const report = await service.diagnostics();
  assert.deepEqual(report.drift.enabledButHidden, [], 'manual-only 不该被当成「启用却消失」');
  fs.rmSync(root, { recursive: true, force: true });
});

test('删除：legacy 停用桩不被当成「真实目录」拦下，随删除一并清掉', async () => {
  const { root, paths, service, store } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['agent:claude-code'] });
  const stub = path.join(paths.dshGlobalSkills, 'alpha');
  createShadow({ stubPath: stub, name: 'alpha', scope: 'user' });
  store.update((draft) => {
    draft.legacyShadows.push({ skill: 'alpha', stubPath: stub, reason: 'pending', at: new Date().toISOString() });
  });

  const result = await service.remove({ name: 'alpha' });
  assert.equal(result.ok, true, '自家旧桩不算 remove-conflict');
  assert.equal(fs.existsSync(stub), false, '旧桩随删除清掉');
  assert.deepEqual(store.state.legacyShadows, []);
  assert.equal(fs.existsSync(path.join(paths.canonical, 'alpha')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Agent 目录被删：导出记录保留但清单忽略，也不会被凭空重建', async () => {
  const { root, home, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: ['agent:claude-code'] });
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'alpha')));
  fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.deepEqual(row.exports, [], '断掉的 Agent 链接不进清单');
  assert.ok(
    store.state.exports.some((item) => item.target === 'agent:claude-code'),
    '历史记录保留，Agent 重装后还能复用',
  );

  await service.setSettings({ exportTargets: ['agent:claude-code'] });
  await service.install({ source: 'morehao/ai-kit', skills: ['beta'] });
  assert.equal(fs.existsSync(path.join(home, '.claude')), false, '导出不能凭空重建已删目录');
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动接管：CLI 已装好的技能在第一次读取时直接纳入追踪', async () => {
  const { root, home, paths, store, service } = setup();
  // 模拟"CLI 装好但本插件不知道"的状态
  const dir = path.join(paths.canonical, 'alpha');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: demo\n---\nbody\n');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.agents', '.skill-lock.json'),
    JSON.stringify({
      version: 3,
      skills: {
        alpha: {
          source: 'morehao/ai-kit',
          sourceType: 'github',
          skillPath: 'skills/alpha/SKILL.md',
          skillFolderHash: TREE_SHA,
        },
      },
    }),
  );
  // 没有再点「接管」，第一次 GET /state 就该把账补上
  const before = await service.getState({});
  const row = before.installs.find((item) => item.name === 'alpha');
  assert.equal(row.managed, true);
  assert.notEqual(row.status, 'unmanaged');

  const install = store.findInstall('alpha');
  assert.ok(install.installedHash);
  assert.ok(install.subscriptionId, '有 lock 来源时自动建订阅');
  const subscription = store.state.subscriptions.find((item) => item.id === install.subscriptionId);
  assert.equal(subscription.source, 'morehao/ai-kit');
  assert.equal(row.visible, true, 'canonical 在 user-agents 根里，本来就能被模型看见');
  assert.equal(row.visibleSource, 'user-agents');

  const repeat = await service.getState({});
  assert.equal(store.state.installs.filter((item) => item.name === 'alpha').length, 1, '对账必须幂等');
  assert.equal(repeat.installs.find((item) => item.name === 'alpha').managed, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('接管：没有 lock 来源的技能也能纳入追踪，但无法检测更新', async () => {
  const { root, paths, store, service } = setup();
  const dir = path.join(paths.canonical, 'beta');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: beta\ndescription: demo\n---\nbody\n');

  const result = await service.adopt({ name: 'beta' });
  assert.equal(result.ok, true);
  assert.equal(result.tracked, false);
  assert.match(result.note, /没有可识别的远端来源/);
  const install = store.findInstall('beta');
  assert.ok(install);
  assert.equal(install.subscriptionId, null);

  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'beta');
  assert.equal(row.managed, true);
  assert.equal(row.status, 'no-upstream', '没有订阅来源 → 无上游，不该混进「待检查」');
  fs.rmSync(root, { recursive: true, force: true });
});

test('删除订阅但保留技能：清单标成「无上游」，不再永久挂在待检查里', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });

  // keepInstalled 默认 true：技能留着，订阅记录没了 → 检查更新永远轮不到它
  await service.removeSubscription({ id: added.subscription.id });
  assert.ok(store.findInstall('alpha').subscriptionId, '保留安装时仍指向旧订阅 id');

  const after = await service.getState({});
  const row = after.installs.find((item) => item.name === 'alpha');
  assert.equal(row.status, 'no-upstream');
  assert.equal(after.installs.filter((item) => item.status === 'unknown').length, 0, '无上游不算待检查');
  fs.rmSync(root, { recursive: true, force: true });
});

test('只读状态下的写操作被拒绝，也不会自动接管', async () => {
  const { root, paths, store, service } = setup();
  const dir = path.join(paths.canonical, 'gamma');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: gamma\n---\nbody\n');
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.stateFile, 'broken');
  store.load();
  await assert.rejects(() => service.setSettings({ autoLinkTargets: [] }), /read-only|state/i);

  const state = await service.getState({});
  assert.equal(state.readOnly, true);
  assert.equal(store.findInstall('gamma'), undefined, '只读时绝不对账写盘');
  assert.equal(state.installs.find((item) => item.name === 'gamma').status, 'unmanaged');
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- 订阅：添加/刷新必须以「拿到快照」为前提（失败不能留下空壳）----------------

const TREE_MAIN = [
  { path: 'skills', type: 'tree', sha: '1'.repeat(40) },
  { path: 'skills/alpha', type: 'tree', sha: '2'.repeat(40) },
  { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
];

/** setup 默认树：alpha/beta/gamma 三个技能，覆盖大多数安装/链接用例，且不抢 TREE_MAIN 的语义。 */
const DEFAULT_TREE = [
  { path: 'skills', type: 'tree', sha: '1'.repeat(40) },
  { path: 'skills/alpha', type: 'tree', sha: '2'.repeat(40) },
  { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
  { path: 'skills/beta', type: 'tree', sha: '4'.repeat(40) },
  { path: 'skills/beta/SKILL.md', type: 'blob', sha: '5'.repeat(40) },
  { path: 'skills/gamma', type: 'tree', sha: '6'.repeat(40) },
  { path: 'skills/gamma/SKILL.md', type: 'blob', sha: '7'.repeat(40) },
];

function jsonBody(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', etag: 'W/"test"' },
  });
}

/** 可控的 GitHub stub：REST / Atom / codeload 全走同一个 fetchImpl。 */
function githubStub({
  defaultBranch = 'main',
  tree = TREE_MAIN,
  commit = COMMIT,
  contents = {},
  resetAt = 1_780_000_000,
  atomCommit = commit,
  tarball = null,
} = {}) {
  const control = {
    defaultBranch, tree, commit, contents, fail: null, resetAt, atomCommit, tarball, atomFail: null, tarFail: null,
    // 模拟 ETag 命中：树请求带 If-None-Match 时只回 304，不返回任何树内容
    etag304: false,
    failWithoutEtag: false,
    treeRequests: [],
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    const target = String(url);
    // 探测会用 raw.githubusercontent.com 读 SKILL.md 补 frontmatter，不走 API 配额
    if (target.startsWith('https://raw.githubusercontent.com/')) {
      const parts = new URL(target).pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const filePath = parts.slice(3).join('/');
      if (!(filePath in control.contents)) return new Response('not found', { status: 404 });
      return new Response(control.contents[filePath], { status: 200 });
    }
    // Atom 与 codeload 不受 REST 限流影响（这也是兜底能成立的前提）
    if (target.startsWith('https://github.com/') && target.endsWith('.atom')) {
      if (control.atomFail) return new Response('atom fail', { status: control.atomFail });
      const xml = `<?xml version="1.0"?><feed><entry><id>tag:github.com,2008:Grit::Commit/${control.atomCommit}</id></entry></feed>`;
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/atom+xml' } });
    }
    if (target.startsWith('https://codeload.github.com/')) {
      if (control.tarFail) return new Response('tar fail', { status: control.tarFail });
      if (!control.tarball) return new Response('not found', { status: 404 });
      const body = typeof control.tarball === 'string' ? fs.readFileSync(control.tarball) : control.tarball;
      return new Response(body, {
        status: 200,
        headers: { 'content-length': String(body.length) },
      });
    }
    if (control.fail === 'network') throw new Error('ECONNRESET');
    const { pathname } = new URL(target);
    if (control.fail === 'rate-limit') {
      return new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(control.resetAt) },
      });
    }
    if (control.fail === 'forbidden') return new Response('{"message":"Forbidden"}', { status: 403 });
    if (control.fail === 'server') return new Response('{"message":"boom"}', { status: 502 });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(pathname)) {
      if (control.fail === 'metadata') return new Response('{"message":"Not Found"}', { status: 404 });
      return jsonBody({ default_branch: control.defaultBranch });
    }
    if (pathname.includes('/git/trees/')) {
      if (control.fail === 'tree') return new Response('{"message":"Not Found"}', { status: 404 });
      const ifNoneMatch = init.headers?.['if-none-match'] ?? null;
      control.treeRequests.push({ ifNoneMatch });
      if (control.etag304 && ifNoneMatch) return new Response(null, { status: 304, headers: { etag: ifNoneMatch } });
      // 只让「无视 ETag 的完整读」失败：用来测 304 后重读失败仍要留原因
      if (control.failWithoutEtag && !ifNoneMatch) return new Response('{"message":"Not Found"}', { status: 404 });
      // 真实 API 在 ref 查询下返回的顶层 sha 是 commit SHA，不是根 tree SHA。
      return jsonBody({ sha: control.commit, tree: control.tree, truncated: false });
    }
    if (pathname.includes('/commits/')) return jsonBody({ sha: control.commit });
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { control, calls, fetchImpl };
}

/** 生成一份带 alpha/beta 的仓库 tarball，并算出本地 tree SHA（供兜底断言）。 */
function snapshotFixture(root, { commit, alpha = 'v1', beta = 'v1' } = {}) {
  const files = {
    'skills/alpha/SKILL.md': `---\nname: alpha\ndescription: alpha ${alpha}\n---\nbody ${alpha}\n`,
    'skills/alpha/scripts/run.sh': `#!/bin/sh\necho ${alpha}\n`,
    'skills/beta/SKILL.md': `---\nname: beta\ndescription: beta ${beta}\n---\n`,
  };
  const sourceDir = path.join(root, `fixture-${commit.slice(0, 8)}`);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(sourceDir, name)), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, name), content);
  }
  const alphaTree = gitTreeSha(path.join(sourceDir, 'skills/alpha'));
  const betaTree = gitTreeSha(path.join(sourceDir, 'skills/beta'));
  const entries = [{ name: `repo-${commit}`, type: 'dir' }];
  const dirs = new Set();
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    for (let index = 1; index < parts.length; index += 1) dirs.add(parts.slice(0, index).join('/'));
  }
  for (const dir of [...dirs].sort()) entries.push({ name: `repo-${commit}/${dir}`, type: 'dir' });
  for (const [filePath, content] of Object.entries(files)) {
    entries.push({ name: `repo-${commit}/${filePath}`, content });
  }
  const tarball = writeTarFixture(root, entries, { name: `repo-${commit}.tar.gz` });
  return { tarball, alphaTree, betaTree, contents: files };
}

test('添加订阅：上游报错时不落盘、接口抛错（回归：不能再出现空订阅）', async () => {
  const gh = githubStub();
  gh.control.fail = 'tree';
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  await assert.rejects(
    () => service.addSubscription({ source: 'alchaincyf/huashu-design' }),
    (error) => error.code === 'error.skills.upstream-failed' && /huashu-design/.test(error.message),
  );
  assert.equal(store.state.subscriptions.length, 0, 'state 里不能留下订阅');
  assert.equal(fs.existsSync(paths.stateFile), false, '没成功之前不写 state.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：ref 缺省时跟随仓库默认分支（master + 根级 SKILL.md）', async () => {
  const gh = githubStub({
    defaultBranch: 'master',
    tree: [{ path: 'SKILL.md', type: 'blob', sha: '4'.repeat(40) }],
  });
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.addSubscription({ source: 'https://github.com/alchaincyf/huashu-design' });
  assert.equal(result.ok, true);
  assert.equal(store.state.subscriptions.length, 1);

  const row = store.state.subscriptions[0];
  assert.equal(row.source, 'alchaincyf/huashu-design', '来源要归一成 owner/repo');
  assert.equal(row.ref, 'master', '缺省 ref 要落成仓库默认分支');
  assert.deepEqual(row.snapshot.entries.map((item) => item.name), ['huashu-design']);
  assert.equal(row.snapshot.entries[0].skillPath, 'SKILL.md');
  // 根级技能的 tree 基线必须是真实的根 tree SHA（由条目重建），不能是 API 回给 ref 的 commit SHA。
  const expectedRootSha = treeShaFromEntries([{ path: 'SKILL.md', type: 'blob', mode: '100644', sha: '4'.repeat(40) }]);
  assert.equal(row.snapshot.entries[0].treeSha, expectedRootSha);
  assert.equal(row.snapshot.rootSha, expectedRootSha);
  assert.notEqual(row.snapshot.entries[0].treeSha, COMMIT, '不能把 commit SHA 记成 tree 基线');
  assert.equal(row.snapshot.commit, COMMIT);
  assert.ok(gh.calls.some((url) => url.includes('/git/trees/master')), '必须按默认分支拉树');
  assert.ok(!gh.calls.some((url) => url.includes('/git/trees/main')), '不能硬套 main');
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * 造一个「CLI 已装好」的根级技能：canonical 有内容、lock 记真实根 tree 基线、state 有记账行。
 * 根级技能专指仓库根部就是 `SKILL.md`（skillPath 无 `/`），是本次 bug 的触发场景。
 */
function seedRootLevelInstall({ paths, store, subscriptionId, rootTreeSha }) {
  const canonicalDir = path.join(paths.canonical, 'huashu-design');
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.writeFileSync(path.join(canonicalDir, 'SKILL.md'), '---\nname: huashu-design\n---\nbody\n');
  const installedHash = contentHash(canonicalDir);
  const at = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
  fs.writeFileSync(
    paths.lockFile,
    JSON.stringify(
      {
        version: 3,
        skills: {
          'huashu-design': {
            source: 'alchaincyf/huashu-design',
            sourceType: 'github',
            sourceUrl: 'https://github.com/alchaincyf/huashu-design.git',
            ref: COMMIT,
            skillPath: 'SKILL.md',
            skillFolderHash: rootTreeSha,
            installedAt: at,
            updatedAt: at,
          },
        },
      },
      null,
      2,
    ),
  );
  store.update((draft) => {
    draft.installs.push({
      name: 'huashu-design',
      subscriptionId,
      skillPath: 'SKILL.md',
      ref: COMMIT,
      commit: COMMIT,
      treeSha: rootTreeSha,
      installedHash,
      installedAt: at,
      updatedAt: at,
      enabled: true,
      mode: 'auto',
      manual: null,
      hidden: null,
      backup: null,
    });
  });
  return { installedHash, at };
}

test('根级 SKILL.md：API 顶层 sha 是 commit SHA 时，检测与更新计划仍按真实根 tree SHA（回归）', async () => {
  const blobSha = '4'.repeat(40);
  const rootTreeSha = treeShaFromEntries([{ path: 'SKILL.md', type: 'blob', mode: '100644', sha: blobSha }]);
  assert.notEqual(rootTreeSha, COMMIT);
  const gh = githubStub({ defaultBranch: 'master', tree: [{ path: 'SKILL.md', type: 'blob', sha: blobSha }], commit: COMMIT });
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const added = await service.addSubscription({ source: 'alchaincyf/huashu-design' });
  seedRootLevelInstall({ paths, store, subscriptionId: added.subscription.id, rootTreeSha });

  const checked = await service.checkUpdates({});
  const verdict = checked.checks.find((item) => item.name === 'huashu-design');
  assert.equal(verdict.status, 'current', '与安装基线一致时不能误报有更新');
  assert.equal(verdict.baseline, 'lock');

  const plan = await service.planUpdate({ name: 'huashu-design' });
  assert.equal(plan.targetTreeSha, rootTreeSha, '计划的目标必须是真实根 tree SHA');
  assert.notEqual(plan.targetTreeSha, COMMIT, '绝不能把 commit SHA 当目标 tree');

  fs.rmSync(root, { recursive: true, force: true });
});

test('根级坏快照（rootSha=commit）：忽略 ETag 完整重读，刷新后快照被修回真实根 tree SHA', async () => {
  const blobSha = '5'.repeat(40);
  const rootTreeSha = treeShaFromEntries([{ path: 'SKILL.md', type: 'blob', mode: '100644', sha: blobSha }]);
  const gh = githubStub({ defaultBranch: 'master', tree: [{ path: 'SKILL.md', type: 'blob', sha: blobSha }], commit: COMMIT });
  // 若仍带着旧 ETag 请求，服务端会回 304 —— 用它证明坏快照没走 304 快路。
  gh.control.etag304 = true;
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const added = await service.addSubscription({ source: 'alchaincyf/huashu-design' });
  const subscriptionId = added.subscription.id;
  seedRootLevelInstall({ paths, store, subscriptionId, rootTreeSha });

  const at = new Date().toISOString();
  store.update((draft) => {
    const row = draft.subscriptions.find((item) => item.id === subscriptionId);
    // 旧 bug 的形态：根级技能的 rootSha / entry.treeSha 都被写成了 commit SHA。
    row.snapshot = {
      commit: COMMIT,
      rootSha: COMMIT,
      etag: 'W/"stale"',
      fetchedAt: at,
      entries: [{ name: 'huashu-design', skillPath: 'SKILL.md', treeSha: COMMIT }],
    };
    draft.checks['huashu-design'] = {
      name: 'huashu-design',
      status: 'update-available',
      detail: 'phantom',
      wouldCommit: null,
      checkedAt: at,
      installCommit: COMMIT,
    };
  });

  gh.control.treeRequests.length = 0;
  const checked = await service.checkUpdates({});
  const verdict = checked.checks.find((item) => item.name === 'huashu-design');
  assert.equal(verdict.status, 'current', '坏快照不能把 phantom 更新粘住');
  assert.ok(
    gh.control.treeRequests.every((request) => !request.ifNoneMatch),
    '坏快照必须无视 ETag 完整重读',
  );

  const refreshed = await service.refreshSubscription({ id: subscriptionId });
  assert.equal(refreshed.ok, true);
  assert.notEqual(refreshed.notModified, true, '坏快照不能被 Atom 短路');
  const snapshot = store.state.subscriptions.find((item) => item.id === subscriptionId).snapshot;
  assert.equal(snapshot.rootSha, rootTreeSha, '快照 rootSha 要修回真实根 tree SHA');
  assert.equal(snapshot.entries[0].treeSha, rootTreeSha);
  assert.notEqual(snapshot.rootSha, COMMIT);

  fs.rmSync(root, { recursive: true, force: true });
});

test('刷新订阅：上游失败要抛错，但保留上次快照并记下 lastCheck', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  const id = added.subscription.id;
  const snapshot = structuredClone(store.state.subscriptions[0].snapshot);

  gh.control.fail = 'tree';
  gh.control.atomCommit = NEW_COMMIT;
  await assert.rejects(
    () => service.refreshSubscription({ id }),
    (error) => error.code === 'error.skills.upstream-failed',
  );

  const row = store.state.subscriptions[0];
  assert.deepEqual(row.snapshot, snapshot, '失败不能清空已有快照');
  assert.equal(row.lastCheck.status, 'unknown');
  assert.match(row.lastCheck.detail, /404/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：同一来源重复添加幂等', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const first = await service.addSubscription({ source: 'morehao/ai-kit' });
  const second = await service.addSubscription({ source: 'morehao/ai-kit' });
  assert.equal(second.existing, true);
  assert.equal(second.subscription.id, first.subscription.id);
  assert.equal(store.state.subscriptions.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('限流安装（lock 写 64 位内容哈希）：无假警告，按记录的 tree SHA 判定更新（T2）', async () => {
  const CONTENT_HASH = 'a'.repeat(64);
  const ENTRY_TREE_SHA = '2'.repeat(40);
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl }, { TEST_TREE_SHA: CONTENT_HASH });

  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  const result = await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });

  assert.equal(result.ok, true);
  assert.equal(result.installed[0].lockHash, CONTENT_HASH, 'lockHash 保持 lock 原值');
  assert.equal(result.installed[0].lockHashShape, 'content', '形态要透出给诊断用');
  assert.deepEqual(result.warnings, [], '64 位内容哈希不能触发「哈希不一致」假警告');
  assert.equal(store.findInstall('alpha').treeSha, ENTRY_TREE_SHA, '安装时要记下快照里的 tree 基线');

  const checked = await service.checkUpdates({});
  assert.equal(checked.checks[0].status, 'current', '不再恒为 unknown，也不误报有更新');
  assert.equal(checked.checks[0].baseline, 'recorded');
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：老版本失败留下的空订阅会被补全，而不是继续留空壳', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  // 旧版本的 id 用原始 URL 计算，source 已归一；补全时要认得出是同一条
  const id = snapshotId({ source: 'https://github.com/morehao/ai-kit', ref: null, subpath: null });
  store.update((draft) => {
    draft.subscriptions.push({
      id,
      source: 'morehao/ai-kit',
      ref: null,
      subpath: null,
      skills: '*',
      lastCheck: null,
      snapshot: null,
    });
  });

  const result = await service.addSubscription({ source: 'https://github.com/morehao/ai-kit' });
  assert.equal(result.subscription.id, id);
  assert.equal(store.state.subscriptions.length, 1, '补全而不是新增一条');
  assert.equal(result.subscription.snapshot?.entries?.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('添加订阅：仓库里没有 SKILL.md 时按失败处理，不落空订阅', async () => {
  const gh = githubStub({ tree: [{ path: 'README.md', type: 'blob', sha: '9'.repeat(40) }] });
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  await assert.rejects(
    () => service.addSubscription({ source: 'morehao/empty-kit' }),
    (error) => error.code === 'error.skills.no-skills',
  );
  assert.equal(store.state.subscriptions.length, 0);
  assert.equal(fs.existsSync(paths.stateFile), false, '没成功之前不写 state.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：只读列出技能（多选数据源），不写 state、不建订阅', async () => {
  const gh = githubStub({
    defaultBranch: 'master',
    tree: [
      { path: 'skills/alpha/SKILL.md', type: 'blob', sha: 'a'.repeat(40) },
      { path: 'skills/beta/SKILL.md', type: 'blob', sha: 'b'.repeat(40) },
      { path: 'README.md', type: 'blob', sha: 'c'.repeat(40) },
    ],
  });
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.probeSource({ source: 'https://github.com/alchaincyf/huashu-design' });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'alchaincyf/huashu-design', '来源归一成 owner/repo');
  assert.equal(result.ref, 'master', '缺省 ref 跟随默认分支');
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta']);
  assert.deepEqual(
    result.skills.map((item) => item.skillPath),
    ['skills/alpha/SKILL.md', 'skills/beta/SKILL.md'],
  );
  assert.equal(store.state.subscriptions.length, 0, '探测不能建订阅');
  assert.equal(fs.existsSync(paths.stateFile), false, '探测不能写 state.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：用 frontmatter 的 name/description（CLI 按 name 安装），缺字段的跳过', async () => {
  const gh = githubStub({
    tree: [
      { path: 'skills/folder-a/SKILL.md', type: 'blob', sha: '1'.repeat(40) },
      { path: 'skills/folder-b/SKILL.md', type: 'blob', sha: '2'.repeat(40) },
      { path: 'skills/broken/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
    ],
    contents: {
      'skills/folder-a/SKILL.md': '---\nname: alpha\ndescription: 甲技能\n---\n\n# alpha\n',
      'skills/folder-b/SKILL.md': '---\nname: "beta"\ndescription: >\n  乙技能\n  跨行描述\n---\n',
      'skills/broken/SKILL.md': '---\nname: broken\n---\n',
    },
  });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta'], '用 frontmatter name，与 CLI 一致');
  assert.equal(result.skills[0].description, '甲技能');
  assert.equal(result.skills[1].description, '乙技能 跨行描述', '折叠块拼成一行');
  assert.equal(result.skipped, 1, '缺 description 的按 CLI 规则跳过');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：非法来源报 bad-source，不发请求', async () => {
  const { root, service } = setup();
  await assert.rejects(
    () => service.probeSource({ source: 'not a repo' }),
    (error) => error.code === 'error.skills.bad-source',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：并发与重复探测复用结果，不重复请求', async () => {
  const gh = githubStub({
    tree: [
      { path: 'SKILL.md', type: 'blob', sha: '5'.repeat(40) },
      { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '6'.repeat(40) },
    ],
  });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });

  const [first, second] = await Promise.all([
    service.probeSource({ source: 'morehao/agent-skills' }),
    service.probeSource({ source: 'https://github.com/morehao/agent-skills' }),
  ]);
  assert.deepEqual(first.skills, second.skills, '并发请求拿到同一份结果');
  const apiCalls = () => gh.calls.filter((url) => url.startsWith('https://api.github.com')).length;
  assert.equal(apiCalls(), 2, '元数据 + 文件树各一次，并发只探测一次');

  const totalCalls = gh.calls.length;
  const third = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(gh.calls.length, totalCalls, '60 秒内重复探测命中缓存，不再发请求');
  assert.deepEqual(third.skills, first.skills);
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：失败不进缓存，重试会重新请求', async () => {
  const gh = githubStub({ tree: [{ path: 'SKILL.md', type: 'blob', sha: '7'.repeat(40) }] });
  gh.control.fail = 'network';
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });

  await assert.rejects(
    () => service.probeSource({ source: 'morehao/agent-skills' }),
    (error) => error.code === 'error.skills.network',
  );
  const callsAfterFailure = gh.calls.length;
  gh.control.fail = null;
  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(result.ok, true, '重试能成功');
  assert.ok(gh.calls.length > callsAfterFailure, '失败没有留下缓存');
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：四种上游失败分成四个错误码与四句不同文案（T1）', async () => {
  const cases = [
    ['rate-limit', 'error.skills.rate-limited', /已限流[\s\S]*后自动恢复[\s\S]*5000 次\/小时/],
    ['metadata', 'error.skills.repo-not-found', /仓库不存在或为私有/],
    ['forbidden', 'error.skills.repo-forbidden', /被拒绝（HTTP 403）/],
    ['server', 'error.skills.upstream-failed', /HTTP 502/],
    ['network', 'error.skills.network', /无法连接 GitHub/],
  ];
  const messages = new Set();
  for (const [fail, code, pattern] of cases) {
    const gh = githubStub();
    gh.control.fail = fail;
    const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
    await assert.rejects(
      () => service.probeSource({ source: 'morehao/agent-skills' }),
      (error) => {
        assert.equal(error.code, code, `${fail} 必须报 ${code}`);
        assert.match(error.message, pattern);
        messages.add(error.message);
        if (fail === 'rate-limit') {
          assert.match(error.message, /\d{2}:\d{2}/, '限流文案要带本机时区的重置时间');
          assert.equal(typeof error.detail.resetAt, 'number');
          assert.equal(error.detail.status, 403);
        }
        return true;
      },
    );
    assert.equal(store.state.subscriptions.length, 0, '失败不能留下订阅');
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(messages.size, cases.length, '四种失败必须是四句不同的话');
});

test('探测来源：REST 正常时走 REST，不再依赖 git', async () => {
  const gh = githubStub({
    contents: {
      'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: 甲\n---\n',
      'skills/beta/SKILL.md': '---\nname: beta\ndescription: 乙\n---\n',
    },
    tree: [
      { path: 'skills/alpha', type: 'tree', sha: '2'.repeat(40) },
      { path: 'skills/alpha/SKILL.md', type: 'blob', sha: '3'.repeat(40) },
      { path: 'skills/beta', type: 'tree', sha: '4'.repeat(40) },
      { path: 'skills/beta/SKILL.md', type: 'blob', sha: '5'.repeat(40) },
    ],
  });
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });
  const result = await service.probeSource({ source: 'morehao/agent-skills' });
  assert.equal(result.via, 'rest');
  assert.equal(result.ref, 'main');
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('探测来源：REST 限流 → Atom + codeload 兜底，按本地 tree 扫描', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-fixture-'));
  const fixture = snapshotFixture(fixtureRoot, { commit: NEW_COMMIT });
  const gh = githubStub({
    atomCommit: NEW_COMMIT,
    tarball: fixture.tarball,
    contents: fixture.contents,
  });
  gh.control.fail = 'rate-limit';
  const { root, paths, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const result = await service.probeSource({ source: 'https://github.com/morehao/agent-skills' });
  assert.equal(result.ok, true);
  assert.equal(result.via, 'codeload');
  assert.deepEqual(result.skills.map((item) => item.name), ['alpha', 'beta']);
  assert.equal(result.skills[0].description, 'alpha v1', '描述按 Atom 的 commit 从 raw 拉取');
  assert.ok(gh.calls.some((url) => url.includes('/commits.atom')), '必须走 Atom 取 commit');
  assert.ok(gh.calls.some((url) => url.includes('/tar.gz/')), '必须走 codeload 下载');
  assert.equal(fs.existsSync(paths.stateFile), false, '探测不能写 state');
  assert.equal(store.state.subscriptions.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('探测来源：REST 与 Atom/codeload 都失败 → 报限流（T1 文案）', async () => {
  const gh = githubStub();
  gh.control.fail = 'rate-limit';
  gh.control.atomFail = 404;
  const { root, service } = setup({ fetchImpl: gh.fetchImpl });
  await assert.rejects(
    () => service.probeSource({ source: 'morehao/agent-skills' }),
    (error) => error.code === 'error.skills.rate-limited' && /已限流/.test(error.message),
  );
  assert.ok(gh.calls.some((url) => url.startsWith('https://api.github.com')), 'REST 确实试过');
  assert.ok(gh.calls.some((url) => url.includes('.atom')), 'Atom 也试过');
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- P2：Atom/codeload 兜底与更新 -------------------------------------------------

const NEW_COMMIT = 'd'.repeat(40);

test('添加订阅：首次就限流 → Atom + codeload 仍能建订阅', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-fixture-'));
  const fixture = snapshotFixture(fixtureRoot, { commit: NEW_COMMIT });
  const gh = githubStub({ atomCommit: NEW_COMMIT, tarball: fixture.tarball });
  gh.control.fail = 'rate-limit';
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });

  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  assert.equal(added.ok, true);
  assert.equal(store.state.subscriptions.length, 1);
  const row = store.state.subscriptions[0];
  assert.equal(row.snapshot.commit, NEW_COMMIT);
  assert.deepEqual(row.snapshot.entries.map((item) => item.name), ['alpha', 'beta']);
  assert.equal(row.lastCheck.status, 'changed');
  assert.ok(gh.calls.some((url) => url.includes('.atom')));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('刷新订阅：Atom 显示 commit 未变 → 不消耗任何 REST（短路）', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  const callsAfterAdd = gh.calls.length;

  const result = await service.refreshSubscription({ id: added.subscription.id });
  assert.equal(result.notModified, true);
  assert.equal(result.changed, false);
  assert.equal(result.via, 'atom');
  const restCalls = gh.calls.slice(callsAfterAdd).filter((url) => url.startsWith('https://api.github.com'));
  assert.equal(restCalls.length, 0, '未变更时只读 Atom，不再消耗 REST');
  const row = store.state.subscriptions[0];
  assert.equal(row.lastCheck.status, 'unchanged');
  assert.equal(row.snapshot.commit, COMMIT, '短路时绝不能把快照置空');
  assert.equal(row.snapshot.entries.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('刷新订阅：REST 限流 → Atom + codeload 快照', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-fixture-'));
  const fixture = snapshotFixture(fixtureRoot, { commit: NEW_COMMIT, alpha: 'v2' });
  const gh = githubStub({});
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  assert.equal(store.state.subscriptions[0].snapshot.commit, COMMIT, '先由 REST 建了快照');

  gh.control.fail = 'rate-limit';
  gh.control.atomCommit = NEW_COMMIT;
  gh.control.tarball = fixture.tarball;
  const result = await service.refreshSubscription({ id: added.subscription.id });
  assert.equal(result.ok, true);
  assert.equal(result.via, 'codeload');
  const row = store.state.subscriptions[0];
  assert.equal(row.snapshot.commit, NEW_COMMIT, 'commit 来自 Atom');
  assert.equal(row.snapshot.etag, null, 'codeload 快照不带 ETag，下次会完整读一次');
  assert.equal(row.lastCheck.status, 'changed');
  assert.equal(row.snapshot.entries.find((item) => item.name === 'alpha').treeSha, fixture.alphaTree);
  assert.ok(gh.calls.some((url) => url.startsWith('https://api.github.com')), '确实先撞了 REST 403');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('刷新订阅：Atom 变了但 REST 正常 → 仍用 REST 结果', async () => {
  const gh = githubStub({ atomCommit: NEW_COMMIT });
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });

  const result = await service.refreshSubscription({ id: added.subscription.id });
  assert.equal(result.ok, true);
  assert.equal(result.via, 'rest', 'REST 能通就用 REST（带 ETag）');
  assert.equal(store.state.subscriptions[0].snapshot.commit, COMMIT);
  assert.equal(store.state.subscriptions[0].lastCheck.treeEtag, 'W/"test"');
  fs.rmSync(root, { recursive: true, force: true });
});

test('刷新订阅：REST 与兜底都失败 → 报限流并留痕', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });

  gh.control.fail = 'rate-limit';
  gh.control.atomFail = 404;
  await assert.rejects(
    () => service.refreshSubscription({ id: added.subscription.id }),
    (error) => error.code === 'error.skills.rate-limited',
  );
  assert.equal(store.state.subscriptions[0].lastCheck.status, 'unknown');
  assert.equal(store.state.subscriptions[0].snapshot.commit, COMMIT, '失败不能清空上次快照');
  fs.rmSync(root, { recursive: true, force: true });
});

test('检查更新：配额耗尽时用 codeload 兜底，判定仍然有效（T2）', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-fixture-'));
  const fixture = snapshotFixture(fixtureRoot, { commit: NEW_COMMIT });
  const gh = githubStub({});
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl }, { TEST_TREE_SHA: fixture.alphaTree });

  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  assert.equal(store.findInstall('alpha').treeSha, fixture.alphaTree);

  gh.control.fail = 'rate-limit';
  gh.control.atomCommit = NEW_COMMIT;
  gh.control.tarball = fixture.tarball;
  const checked = await service.checkUpdates({});
  assert.equal(checked.checks.length, 1);
  assert.equal(checked.checks[0].status, 'current', '不再是 unknown，也不误报有更新');
  assert.equal(checked.checks[0].via, 'codeload');
  assert.ok(gh.calls.some((url) => url.startsWith('https://api.github.com')), 'REST 确实试过并被限流');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('检查更新：所有通道都不可用 → 每个技能一条带错误码的 unknown', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });

  gh.control.fail = 'rate-limit';
  gh.control.atomFail = 404;
  const checked = await service.checkUpdates({});
  assert.equal(checked.checks[0].status, 'unknown');
  assert.equal(checked.checks[0].code, 'error.skills.rate-limited');
  assert.match(checked.checks[0].detail, /已限流/);
  assert.equal(store.state.checks.alpha.status, 'unknown');
  fs.rmSync(root, { recursive: true, force: true });
});

test('检查更新：ETag 304 但上次没结论 → 无视 ETag 重读整树（待检查不能永久粘住）', async () => {
  const gh = githubStub();
  // lock 里的 tree SHA 与 TREE_MAIN 的 skills/alpha 一致 → 重读后应判 current
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl }, { TEST_TREE_SHA: '2'.repeat(40) });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  // 更早一次探测失败留下的 unknown —— 用户在「待检查」里看到的就是它
  store.update((draft) => {
    draft.checks.alpha = { name: 'alpha', status: 'unknown', detail: '读取失败', checkedAt: new Date().toISOString() };
  });
  gh.control.etag304 = true;
  gh.control.treeRequests.length = 0;

  const first = await service.checkUpdates({});
  assert.equal(first.checks[0].status, 'current', '304 不足以判定，必须重读后拿到真结论');
  assert.equal(gh.control.treeRequests.length, 2, '304 之后要再完整读一次整树');
  assert.notEqual(gh.control.treeRequests[0].ifNoneMatch, null, '第一次照常带 ETag');
  assert.equal(gh.control.treeRequests[1].ifNoneMatch, null, '强制读不能带 ETag，否则又撞 304');
  assert.equal(store.state.checks.alpha.status, 'current');

  const second = await service.checkUpdates({});
  assert.equal(second.checks[0].status, 'current');
  assert.equal(second.checks[0].detail, 'ETag 未变，沿用上次结论');
  assert.equal(gh.control.treeRequests.length, 3, '已有结论时 304 直接沿用，不再多读整树');
  fs.rmSync(root, { recursive: true, force: true });
});

test('检查更新：304 重读仍失败 → 保留 unknown 并写明原因（不假装检查过）', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  store.update((draft) => {
    draft.checks.alpha = { name: 'alpha', status: 'unknown', detail: '读取失败', checkedAt: new Date().toISOString() };
  });
  gh.control.etag304 = true;
  // 强制重读那一次拿不到树（404 不是限流，不会走 Atom 兜底）
  gh.control.failWithoutEtag = true;

  const checked = await service.checkUpdates({});
  assert.equal(checked.checks[0].status, 'unknown');
  assert.match(checked.checks[0].detail, /404/);
  assert.equal(store.state.checks.alpha.status, 'unknown');
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- 安装器不可用 / 更新失败 ------------------------------------------------

test('安装器不可用：/state cli.usable=false，清单仍可读；install 返回 400 且不动 canonical', async () => {
  const { root, paths, service } = setup({ installerUsable: false });
  const dir = path.join(paths.canonical, 'alpha');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: demo\n---\nbody\n');

  const state = await service.getState({});
  assert.equal(state.ok, true);
  assert.equal(state.cli.usable, false);
  assert.equal(state.cli.source, 'native');
  assert.equal(state.cli.problem, 'lock-unsupported');
  assert.ok(state.installs.some((item) => item.name === 'alpha'), '清单不能因为安装器不可用而消失');

  await assert.rejects(
    () => service.install({ source: 'morehao/ai-kit', skills: ['alpha'] }),
    (error) => error.code === 'error.skills.installer-unavailable',
  );
  assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')), '拒绝时不能动真身');
  fs.rmSync(root, { recursive: true, force: true });
});

test('安装器不可用：remove 在回收站快照之前拒绝；applyUpdate 在排队之前拒绝', async () => {
  const { root, paths, service } = setup({ installerUsable: false });
  const dir = path.join(paths.canonical, 'alpha');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: demo\n---\nbody\n');

  await assert.rejects(
    () => service.remove({ name: 'alpha' }),
    (error) => error.code === 'error.skills.installer-unavailable',
  );
  assert.equal(fs.existsSync(paths.trashDir), false, '拒绝时不能留下孤儿 trash');
  assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')), '拒绝时不能动真身');

  await assert.rejects(
    () => service.applyUpdate({ name: 'alpha' }),
    (error) => error.code === 'error.skills.installer-unavailable',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('applyUpdate：installer 失败 → update-failed，canonical 不变', async () => {
  const gh = githubStub();
  const { root, paths, store, service, installer } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  const before = fs.readFileSync(path.join(paths.canonical, 'alpha', 'SKILL.md'), 'utf8');

  installer.install = async () => {
    throw Object.assign(new Error('tree mismatch'), { code: 'tree-mismatch' });
  };
  const result = await service.applyUpdate({ name: 'alpha' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'error.skills.update-failed');
  assert.equal(result.detail.reason, 'tree-mismatch');
  assert.equal(fs.readFileSync(path.join(paths.canonical, 'alpha', 'SKILL.md'), 'utf8'), before);
  assert.equal(store.findInstall('alpha').commit, COMMIT, 'state 基线不能前进');
  fs.rmSync(root, { recursive: true, force: true });
});

test('更新计划：配额耗尽时用 codeload 出计划，不出现「查得到更不了」', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-fixture-'));
  const fixture = snapshotFixture(fixtureRoot, { commit: NEW_COMMIT, alpha: 'v2' });
  const gh = githubStub({});
  const { root, service } = setup({ fetchImpl: gh.fetchImpl }, { TEST_TREE_SHA: fixture.alphaTree });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });

  gh.control.fail = 'rate-limit';
  gh.control.atomCommit = NEW_COMMIT;
  gh.control.tarball = fixture.tarball;
  const plan = await service.planUpdate({ name: 'alpha' });
  assert.equal(plan.ok, true);
  assert.equal(plan.toCommit, NEW_COMMIT, 'commit 来自 Atom');
  assert.equal(plan.targetTreeSha, fixture.alphaTree);
  assert.equal(plan.ref, 'main');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('查看：目录包正文带 meta；平铺技能同样可读', async () => {
  const { root, paths, service } = setup();
  fs.mkdirSync(path.join(paths.canonical, 'demo', 'references'), { recursive: true });
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'SKILL.md'), '---\nname: demo\ndescription: 演示技能\n---\n# 正文\n');
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'references', 'guide.md'), '# 指南\n');
  fs.writeFileSync(path.join(paths.canonical, 'flat.md'), '---\nname: flat\ndescription: 平铺\n---\n内容\n');

  const body = await service.listSkillBody({ name: 'demo' });
  assert.equal(body.ok, true);
  assert.equal(body.relPath, 'SKILL.md');
  assert.equal(body.kind, 'dir');
  assert.equal(body.meta.name, 'demo');
  assert.equal(body.meta.description, '演示技能');
  assert.match(body.content, /^---\nname: demo/, 'content 保留 frontmatter，原文视图要用');
  assert.equal(body.truncated, false);
  assert.ok(body.path.endsWith(path.join('demo', 'SKILL.md')), 'path 仍是绝对路径');

  const file = await service.listSkillBody({ name: 'demo', path: 'references/guide.md' });
  assert.equal(file.relPath, 'references/guide.md');
  assert.match(file.content, /指南/);
  assert.deepEqual(file.meta, {}, '子文件没有 frontmatter 时 meta 为空对象');

  const flat = await service.listSkillBody({ name: 'flat' });
  assert.equal(flat.kind, 'file');
  assert.equal(flat.relPath, 'flat.md');
  assert.equal(flat.meta.description, '平铺');
  fs.rmSync(root, { recursive: true, force: true });
});

test('查看：文件树带 hasSkillMd / body / totalBytes', async () => {
  const { root, paths, service } = setup();
  fs.mkdirSync(path.join(paths.canonical, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'SKILL.md'), '# demo\n');
  fs.mkdirSync(path.join(paths.canonical, 'noskill'), { recursive: true });
  fs.writeFileSync(path.join(paths.canonical, 'noskill', 'notes.md'), '# notes\n');

  const tree = await service.listSkillFiles({ name: 'demo' });
  assert.equal(tree.ok, true);
  assert.equal(tree.kind, 'dir');
  assert.equal(tree.body, 'SKILL.md');
  assert.equal(tree.hasSkillMd, true);
  assert.deepEqual(tree.files.map((entry) => entry.path), ['SKILL.md']);
  assert.equal(tree.totalBytes, Buffer.byteLength('# demo\n'));

  const noskill = await service.listSkillFiles({ name: 'noskill' });
  assert.equal(noskill.hasSkillMd, false);
  assert.equal(noskill.body, null);

  await assert.rejects(
    () => service.listSkillFiles({ name: 'ghost' }),
    (error) => error instanceof ServiceError && error.code === 'error.skills.not-found',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('查看：非法技能名与越界路径在 service 层被拒（补上原先缺的校验）', async () => {
  const { root, paths, service } = setup();
  fs.mkdirSync(path.join(paths.canonical, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(paths.canonical, 'demo', 'SKILL.md'), '# demo\n');
  fs.writeFileSync(path.join(paths.home, 'outside.md'), '# outside\n');

  for (const name of ['../outside', 'a/b', 'a\\b', '..', 'x\u0000y']) {
    await assert.rejects(
      () => service.listSkillBody({ name }),
      (error) => error instanceof ServiceError && error.code === 'error.skills.not-found',
      `${JSON.stringify(name)} 必须在拼路径之前被拒`,
    );
  }

  for (const relPath of ['../outside.md', '/etc/passwd', 'a/../../b', 'a\\b']) {
    await assert.rejects(
      () => service.listSkillBody({ name: 'demo', path: relPath }),
      (error) => error instanceof ServiceError && error.code === 'error.skills.bad-path',
      `${JSON.stringify(relPath)} 必须 400`,
    );
  }

  await assert.rejects(
    () => service.listSkillBody({ name: 'demo', path: 'missing.md' }),
    (error) => error instanceof ServiceError && error.code === 'error.skills.file-not-found',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings：读共享根的 Agent 存不进 exportTargets', async () => {
  const { root, home, service, store } = setup();
  // OpenCode 读共享根（sharedHome=yes），Reasonix 没验证过（unknown）
  fs.mkdirSync(path.join(home, '.config', 'opencode', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.reasonix', 'skills'), { recursive: true });

  await service.setSettings({ exportTargets: ['agent:opencode', 'agent:reasonix'] });
  assert.deepEqual(
    store.state.settings.exportTargets,
    ['agent:reasonix'],
    '读共享根的目标不该被持久化：存下来也不会建链，只会让摘要数出一个看不见的 1',
  );

  // 显式全导出（v1 兼容分支）同样要挡掉共享根
  await service.setSettings({ autoLinkTargets: null });
  assert.ok(!store.state.settings.exportTargets.includes('agent:opencode'));
  assert.ok(store.state.settings.exportTargets.includes('agent:reasonix'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('调用策略：仅手动写 frontmatter，自动恢复，归一化哈希不被误判', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const file = path.join(paths.canonical, 'alpha', 'SKILL.md');
  const before = fs.readFileSync(file, 'utf8');

  const manual = await service.setInvocation({ name: 'alpha', mode: 'manual' });
  assert.equal(manual.mode, 'manual');
  assert.match(fs.readFileSync(file, 'utf8'), /disable-model-invocation: true/);
  let install = store.findInstall('alpha');
  assert.equal(install.mode, 'manual');
  assert.deepEqual(
    { origin: install.manual.origin, original: install.manual.original },
    { origin: 'plugin', original: 'absent' },
  );
  assert.equal(
    hashWithoutInvocation(path.join(paths.canonical, 'alpha'), install.manual),
    install.installedHash,
    '插件写的行不能算成本地改动',
  );

  const auto = await service.setInvocation({ name: 'alpha', mode: 'auto' });
  assert.equal(auto.mode, 'auto');
  assert.equal(fs.readFileSync(file, 'utf8'), before, '恢复原文');
  install = store.findInstall('alpha');
  assert.equal(install.mode, 'auto');
  assert.equal(install.manual, null);

  await assert.rejects(
    () => service.setInvocation({ name: 'alpha', mode: 'on' }),
    (error) => error.code === 'error.skills.bad-mode',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('旧 locale 哈希基线：升级后自动重基线，不再误报「安装后有改动」', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const dir = path.join(paths.canonical, 'alpha');
  // 让目录里同时有 ASCII 与 CJK 文件名：两种 collation 的排序才会不同
  fs.writeFileSync(path.join(dir, 'script.md'), 'script');
  fs.writeFileSync(path.join(dir, '什么是token.html'), 'html');
  // 模拟旧版在 en collation 下记的基线：内容没动，只是排序口径不同
  const legacy = contentHashWith(dir, null, localeComparator('en'));
  store.update((draft) => {
    draft.installs.find((row) => row.name === 'alpha').installedHash = legacy;
  });

  let row = (await service.getState({})).installs.find((item) => item.name === 'alpha');
  assert.equal(row.status, 'locally-modified', '升级前旧口径就是误报');

  service.ensureMigrated(); // 等价于宿主启动时那次 reloadState → ensureHashBaseline

  row = (await service.getState({})).installs.find((item) => item.name === 'alpha');
  assert.notEqual(row.status, 'locally-modified');
  assert.equal(store.findInstall('alpha').installedHash, contentHash(dir));
  fs.rmSync(root, { recursive: true, force: true });
});

test('旧 locale 哈希基线：内容真的改过时保留基线，继续提示「安装后有改动」', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const dir = path.join(paths.canonical, 'alpha');
  fs.writeFileSync(path.join(dir, 'script.md'), 'script');
  fs.writeFileSync(path.join(dir, '什么是token.html'), 'html');
  const legacy = contentHashWith(dir, null, localeComparator('zh'));
  store.update((draft) => {
    draft.installs.find((row) => row.name === 'alpha').installedHash = legacy;
  });
  fs.appendFileSync(path.join(dir, 'SKILL.md'), '\n本地改动\n');

  const result = service.rebaselineHashes();
  assert.deepEqual(result.rebaselined.map((item) => item.name), []);
  assert.ok(result.unresolved.includes('alpha'), '改过的技能进 unresolved，不能悄悄洗白');
  assert.equal(store.findInstall('alpha').installedHash, legacy, '基线必须原样保留');

  const row = (await service.getState({})).installs.find((item) => item.name === 'alpha');
  assert.equal(row.status, 'locally-modified');
  fs.rmSync(root, { recursive: true, force: true });
});

test('旧 locale 的停用哈希：恢复时不算内容漂移', async () => {
  const { root, paths, service } = setup({ visibleProvider: async () => ({ skills: [], complete: true }) });
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const dir = path.join(paths.canonical, 'alpha');
  fs.writeFileSync(path.join(dir, 'script.md'), 'script');
  fs.writeFileSync(path.join(dir, '什么是token.html'), 'html');
  // 旧版 park 时记录的哈希（zh collation）；内容此后一直没动
  const legacy = contentHashWith(dir, null, localeComparator('zh'));

  await service.setInvocation({ name: 'alpha', mode: 'hidden' });
  const markerFile = path.join(dir, '.dsh-skills-console.park.json');
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  fs.writeFileSync(markerFile, `${JSON.stringify({ ...marker, canonicalHash: legacy }, null, 2)}\n`);

  const restored = await service.unpark({ name: 'alpha' });
  assert.equal(restored.hashMismatch, false, '只是 locale 排序变了，不算内容漂移');
  fs.rmSync(root, { recursive: true, force: true });
});

test('完全停用：park 期间拒绝改模式 / 更新 / 安装，恢复后内容一字节不差', async () => {
  const { root, paths, store, service } = setup({ visibleProvider: async () => ({ skills: [], complete: true }) });
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const dir = path.join(paths.canonical, 'alpha');
  const file = path.join(dir, 'SKILL.md');
  const before = fs.readFileSync(file, 'utf8');

  const hidden = await service.setInvocation({ name: 'alpha', mode: 'hidden' });
  assert.equal(hidden.mode, 'hidden');
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md.disabled')), true);
  assert.equal(fs.existsSync(path.join(dir, '.dsh-skills-console.park.json')), true);
  assert.equal(store.findInstall('alpha').mode, 'hidden');
  const visibleState = await service.getState({});
  const hiddenRow = visibleState.installs.find((row) => row.name === 'alpha');
  assert.equal(hiddenRow.mode, 'hidden');
  assert.equal(hiddenRow.park.parked, true);
  assert.equal(hiddenRow.visible, false);
  assert.ok(!visibleState.visible.some((row) => row.name === 'alpha'), '停用行不出现在可见列表');

  await assert.rejects(
    () => service.setInvocation({ name: 'alpha', mode: 'manual' }),
    (error) => error.code === 'error.skills.parked',
  );
  await assert.rejects(
    () => service.applyUpdate({ name: 'alpha' }),
    (error) => error.code === 'error.skills.parked',
  );
  await assert.rejects(
    () => service.install({ source: 'morehao/ai-kit', skills: ['alpha'] }),
    (error) => error.code === 'error.skills.parked',
  );

  const restored = await service.unpark({ name: 'alpha' });
  assert.equal(restored.mode, 'auto');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md.disabled')), false);
  assert.equal(fs.existsSync(path.join(dir, '.dsh-skills-console.park.json')), false);
  assert.equal(store.findInstall('alpha').mode, 'auto');
  fs.rmSync(root, { recursive: true, force: true });
});

test('调用策略：作者声明仅手动 → 只读，恢复自动 409', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const file = path.join(paths.canonical, 'alpha', 'SKILL.md');
  const authorText = '---\nname: alpha\ndescription: demo\ndisable-model-invocation: true\n---\nbody\n';
  fs.writeFileSync(file, authorText);

  const manual = await service.setInvocation({ name: 'alpha', mode: 'manual' });
  assert.equal(manual.origin, 'author');
  assert.equal(fs.readFileSync(file, 'utf8'), authorText, '作者声明不重写');
  assert.equal(store.findInstall('alpha').manual.origin, 'author');

  await assert.rejects(
    () => service.setInvocation({ name: 'alpha', mode: 'auto' }),
    (error) => error.code === 'error.skills.author',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('更新后重放：新内容没有插件行，reconcile 按 state 写回', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await service.setInvocation({ name: 'alpha', mode: 'manual' });
  const file = path.join(paths.canonical, 'alpha', 'SKILL.md');
  // 模拟 installer 覆盖成上游新内容（不含插件行）
  fs.writeFileSync(file, '---\nname: alpha\ndescription: v2\n---\nnew body\n');

  const reports = service.reconcileInvocations();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].ok, true);
  assert.match(fs.readFileSync(file, 'utf8'), /disable-model-invocation: true/);
  assert.equal(store.findInstall('alpha').mode, 'manual');
  assert.equal(store.findInstall('alpha').manual.drift, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('仅手动：原文是 false 时恢复成 false；文件被改回 false 时标记 drift', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const file = path.join(paths.canonical, 'alpha', 'SKILL.md');
  const original = '---\nname: alpha\ndescription: demo\ndisable-model-invocation: false\n---\nbody\n';
  fs.writeFileSync(file, original);

  await service.setInvocation({ name: 'alpha', mode: 'manual' });
  assert.match(fs.readFileSync(file, 'utf8'), /disable-model-invocation: true/);
  assert.equal(store.findInstall('alpha').manual.original, 'false');
  await service.setInvocation({ name: 'alpha', mode: 'auto' });
  assert.equal(fs.readFileSync(file, 'utf8'), original);

  // 外部把 true 改回 false：reconcile 不能猜，标记 drift 让 UI 报「需修复」
  await service.setInvocation({ name: 'alpha', mode: 'manual' });
  fs.writeFileSync(file, original);
  store.load();
  const reports = service.reconcileInvocations();
  assert.equal(reports[0].ok, false);
  assert.equal(store.findInstall('alpha').manual.drift, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('恢复：state=hidden 但 marker / disabled 都没了 → park-broken，不假装成功', async () => {
  const { root, paths, store, service } = setup();
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  await service.setInvocation({ name: 'alpha', mode: 'hidden' });
  const dir = path.join(paths.canonical, 'alpha');
  fs.rmSync(path.join(dir, 'SKILL.md.disabled'), { force: true });
  fs.rmSync(path.join(dir, '.dsh-skills-console.park.json'), { force: true });
  await assert.rejects(
    () => service.unpark({ name: 'alpha' }),
    (error) => error.code === 'error.skills.park-broken',
  );
  assert.equal(store.findInstall('alpha').mode, 'hidden', '坏状态不改记账');
  fs.rmSync(root, { recursive: true, force: true });
});

test('作者声明但 state 还是 auto：展示为只读 manual，不改 state、不误判成自动', async () => {
  const { root, paths, store, service } = setup({ visibleProvider: async () => ({ skills: [], complete: true }) });
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'] });
  const file = path.join(paths.canonical, 'alpha', 'SKILL.md');
  fs.writeFileSync(file, '---\nname: alpha\ndescription: demo\ndisable-model-invocation: true\n---\nbody\n');
  const state = await service.getState({});
  const row = state.installs.find((item) => item.name === 'alpha');
  assert.equal(row.mode, 'manual');
  assert.equal(row.origin, 'author');
  assert.notEqual(store.findInstall('alpha').mode, 'manual', '只做展示推断，不改记账');
  assert.ok(!store.findInstall('alpha').manual);
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- 定时上游检测（runAutoCheck） -----------------------------------------

test('自动检测：无订阅/无安装 → 不联网直接跳过', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const result = await service.runAutoCheck();
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 'empty');
  assert.equal(gh.calls.length, 0, '空账本不应发起任何网络请求');
  assert.equal(store.state.settings.autoCheck.lastRunAt, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动检测：正常路径 → 写 checks 与 lastResult，记录次数与可更新数', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });

  const before = store.state.settings.autoCheck.lastRunAt;
  assert.equal(before, null);

  const result = await service.runAutoCheck();
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.ok(Number.isInteger(result.updatable) && result.updatable >= 0);
  assert.ok(store.state.checks.alpha, '写入 checks');
  assert.ok(store.state.settings.autoCheck.lastRunAt, '写入 lastRunAt');
  assert.equal(store.state.settings.autoCheck.lastResult.count, 1);
  assert.equal(store.state.settings.autoCheck.enabled, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动检测：节流窗口内（<5h）跳过，不重复联网', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  await service.runAutoCheck();
  const callsAfterFirst = gh.calls.length;

  const second = await service.runAutoCheck();
  assert.equal(second.skipped, 'throttled');
  assert.equal(gh.calls.length, callsAfterFirst, '节流期内不再发请求');
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动检测：enabled=false → 跳过', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  store.update((draft) => { draft.settings.autoCheck.enabled = false; });
  const callsBefore = gh.calls.length;
  const result = await service.runAutoCheck();
  assert.equal(result.skipped, 'disabled');
  assert.equal(gh.calls.length, callsBefore, '关闭后不联网');
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动检测：只读降级 → 跳过且不崩', async () => {
  const { root, store, service } = setup();
  store.readOnly = true;
  const result = await service.runAutoCheck();
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 'readonly');
  fs.rmSync(root, { recursive: true, force: true });
});

test('自动检测：上游失败也只返回 ok:false，不向定时器抛', async () => {
  const gh = githubStub();
  const { root, store, service } = setup({ fetchImpl: gh.fetchImpl });
  const added = await service.addSubscription({ source: 'morehao/ai-kit' });
  await service.install({ subscriptionId: added.subscription.id, skills: ['alpha'] });
  gh.control.fail = 'rate-limit';
  gh.control.atomFail = 404;
  // 限流通过 Atom 兜底后仍可能 unknown，但不应 throw
  const result = await service.runAutoCheck();
  assert.equal(result.ok, true);
  // checkUpdates 自身把失败折成 unknown，runAutoCheck 视为正常完成
  assert.equal(store.state.checks.alpha.status, 'unknown');
  fs.rmSync(root, { recursive: true, force: true });
});

test('安装 targets 语义：显式 [] 即一个都不建（不回退 settings），undefined 才回退', async () => {
  const { root, home, store, service } = setup();
  await service.setSettings({ exportTargets: ['agent:claude-code'] });

  // 显式空数组：即使 settings 里有默认导出目标，也不建任何链
  await service.install({ source: 'morehao/ai-kit', skills: ['alpha'], targets: [] });
  assert.equal(
    fs.existsSync(path.join(home, '.claude', 'skills', 'alpha')),
    false,
    '显式 targets: [] 不应建链（不能回退 settings）',
  );
  assert.equal(store.state.exports.filter((row) => row.skill === 'alpha').length, 0);

  // 未传 targets（undefined）：回退 settings.exportTargets → 建链
  await service.install({ source: 'morehao/ai-kit', skills: ['beta'] });
  assert.ok(
    fs.lstatSync(path.join(home, '.claude', 'skills', 'beta')).isSymbolicLink(),
    '未传 targets 时应回退 settings.exportTargets',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('诊断：dshRegistry 只读列出 DSH registry 额外看到的技能（不参与 visible）', async () => {
  const { root, service } = setup({
    registrySkillsProvider: async () => ({
      available: true,
      complete: true,
      agents: 1,
      // alpha 已在扫描根可见集合里（setup 的 visibleProvider 提供），bundle-x 只有 DSH registry 看得到
      skills: [
        { name: 'alpha', source: 'user-dsh', provider: 'fs' },
        { name: 'bundle-x', source: 'bundled', provider: 'skill-badge' },
      ],
    }),
  });
  const report = await service.diagnostics();
  assert.deepEqual(report.dshRegistry.skills, [
    { name: 'bundle-x', source: 'bundled', provider: 'skill-badge' },
  ], '只列出扫描根不可见的额外技能');
  assert.equal(report.dshRegistry.available, true);
  assert.equal(report.dshRegistry.complete, true);
  // 可见性定义不变：alpha 仍按扫描根可见；bundle-x 不进 visible
  assert.deepEqual(report.policy.blindSpots, ['custom-dirs', 'plugin-skills']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('诊断：没有 registrySkillsProvider 时 dshRegistry 为空，不影响其余', async () => {
  const { root, service } = setup();
  const report = await service.diagnostics();
  assert.deepEqual(report.dshRegistry, { available: false, complete: false, agents: 0, skills: [] });
  fs.rmSync(root, { recursive: true, force: true });
});

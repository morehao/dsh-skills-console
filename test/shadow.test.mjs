import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SHADOW_MARKER,
  createShadow,
  inspectShadow,
  readShadowMarker,
  removeShadow,
  shadowSkillMd,
} from '../lib/core/shadow.js';
import { scanSkillRoot } from '../lib/core/roots.js';
import { resolveVisibility } from '../lib/core/visibility.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-shadow-'));
  return root;
}

function realSkill(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: real\n---\nbody\n`);
  return dir;
}

test('停用标记：真实目录 + 三个 frontmatter 字段 + 识别用的 marker', () => {
  const root = sandbox();
  const stub = path.join(root, '.dsh', 'skills', 'demo');
  const result = createShadow({ stubPath: stub, name: 'demo', scope: 'user', canonicalHash: 'abc' });
  assert.equal(result.created, true);

  assert.ok(fs.lstatSync(stub).isDirectory(), '必须是真实目录（链在这里没有意义）');
  const md = fs.readFileSync(path.join(stub, 'SKILL.md'), 'utf8');
  assert.match(md, /^name: demo$/m);
  assert.match(md, /^disable-model-invocation: true$/m);
  assert.match(md, /^user-invocable: false$/m);
  assert.match(md, /已停用/);

  const marker = readShadowMarker(stub);
  assert.equal(marker.skill, 'demo');
  assert.equal(marker.scope, 'user');
  assert.equal(marker.canonicalHash, 'abc');
  assert.ok(fs.existsSync(path.join(stub, SHADOW_MARKER)));

  // 不许留 staging 残骸
  assert.deepEqual(fs.readdirSync(path.dirname(stub)).filter((name) => name.startsWith('.shadow-')), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('停用标记：幂等，已存在自己的标记不再写', () => {
  const root = sandbox();
  const stub = path.join(root, 'skills', 'demo');
  createShadow({ stubPath: stub, name: 'demo', scope: 'user' });
  const second = createShadow({ stubPath: stub, name: 'demo', scope: 'user' });
  assert.equal(second.created, false);
  assert.equal(second.already, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('停用标记：同名真实技能占用时拒绝覆盖', () => {
  const root = sandbox();
  const stub = realSkill(path.join(root, 'skills', 'demo'), 'demo');
  assert.throws(
    () => createShadow({ stubPath: stub, name: 'demo', scope: 'user' }),
    (error) => error.code === 'error.skills.shadow-conflict' && error.detail.state === 'foreign',
  );
  assert.match(fs.readFileSync(path.join(stub, 'SKILL.md'), 'utf8'), /description: real/, '别人的目录不能改');
  fs.rmSync(root, { recursive: true, force: true });
});

test('停用标记：被软链占用时要求先摘链（不自己拆）', () => {
  const root = sandbox();
  const canonical = realSkill(path.join(root, 'agents', 'skills', 'demo'), 'demo');
  const stub = path.join(root, 'dsh', 'skills', 'demo');
  fs.mkdirSync(path.dirname(stub), { recursive: true });
  fs.symlinkSync(canonical, stub, 'dir');
  assert.equal(inspectShadow(stub, 'demo').state, 'link');
  assert.throws(
    () => createShadow({ stubPath: stub, name: 'demo', scope: 'user' }),
    (error) => error.code === 'error.skills.shadow-conflict' && error.detail.state === 'link',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('停用标记：SKILL.md 丢了/置位被删 → broken（不能算成功）', () => {
  const root = sandbox();
  const stub = path.join(root, 'skills', 'demo');
  createShadow({ stubPath: stub, name: 'demo', scope: 'user' });
  fs.rmSync(path.join(stub, 'SKILL.md'));
  assert.equal(inspectShadow(stub, 'demo').state, 'broken');
  assert.equal(inspectShadow(stub, 'demo').reason, 'skill-md-missing');

  fs.writeFileSync(path.join(stub, 'SKILL.md'), shadowSkillMd({ name: 'demo' }).replace('disable-model-invocation: true', 'disable-model-invocation: false'));
  assert.equal(inspectShadow(stub, 'demo').reason, 'flag-missing');
  fs.rmSync(root, { recursive: true, force: true });
});

test('删停用标记：删掉目录，不留残骸；不删别人的目录', () => {
  const root = sandbox();
  const stub = path.join(root, 'skills', 'demo');
  createShadow({ stubPath: stub, name: 'demo', scope: 'user' });
  const removed = removeShadow({ stubPath: stub, name: 'demo' });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(stub), false);
  assert.deepEqual(fs.readdirSync(path.dirname(stub)).filter((name) => name.startsWith('.shadow-')), []);

  assert.equal(removeShadow({ stubPath: stub, name: 'demo' }).reason, 'absent');

  const foreign = realSkill(path.join(root, 'other', 'demo'), 'demo');
  const refused = removeShadow({ stubPath: foreign, name: 'demo' });
  assert.equal(refused.removed, false);
  assert.equal(refused.reason, 'not-managed');
  assert.ok(fs.existsSync(path.join(foreign, 'SKILL.md')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('扫根：目录包 / 平铺 .md / 软链 / 点文件都按宿主口径处理', () => {
  const root = sandbox();
  const dir = path.join(root, 'skills');
  realSkill(path.join(dir, 'dir-skill'), 'dir-skill');
  fs.writeFileSync(path.join(dir, 'flat.md'), '---\nname: flat\ndescription: 平铺\n---\n');
  fs.mkdirSync(path.join(dir, '.hidden'));
  fs.mkdirSync(path.join(dir, 'no-skill'));
  fs.symlinkSync(path.join(dir, 'dir-skill'), path.join(dir, 'linked'), 'dir');

  const { entries, ignored } = scanSkillRoot(dir);
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]));
  assert.equal(byName['dir-skill'].kind, 'dir');
  assert.equal(byName['dir-skill'].hasSkillFile, true);
  assert.equal(byName.flat.kind, 'file');
  // 链指向同一个技能：名字还是 frontmatter 的 `dir-skill`，只是多了一份 linked 候选
  const dirCandidates = entries.filter((entry) => entry.name === 'dir-skill');
  assert.equal(dirCandidates.length, 2, '导出链扫得出来');
  assert.equal(dirCandidates.filter((entry) => entry.linked).length, 1, '其中一份是链');
  assert.equal(dirCandidates.find((entry) => entry.linked).dirName, 'linked');
  assert.equal('hidden' in byName, false, '点开头的一律跳过');
  // 宿主只认 frontmatter 齐全的 `SKILL.md`，没有的就当不存在——不能出现在可见技能里
  assert.equal('no-skill' in byName, false);
  assert.equal(ignored.find((item) => item.name === 'no-skill')?.reason, 'no-skill-file');
  fs.rmSync(root, { recursive: true, force: true });
});

test('扫根：身份取 frontmatter name，目录名不同也算同名', () => {
  const root = sandbox();
  const dir = path.join(root, 'skills');
  realSkill(path.join(dir, 'real-one'), 'demo');
  realSkill(path.join(dir, 'demo.bak-20260101-000000'), 'demo');
  const { entries } = scanSkillRoot(dir);
  const demos = entries.filter((entry) => entry.name === 'demo');
  assert.equal(demos.length, 2, '同名两份都在，合并规则交给 visibility');
  assert.deepEqual(demos.map((entry) => entry.dirName).sort(), ['demo.bak-20260101-000000', 'real-one']);
  assert.equal(demos.find((entry) => entry.dirName === 'demo.bak-20260101-000000').nameMismatch, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：rank 小的赢，legacy 桩只遮自己这一份', () => {
  const root = sandbox();
  const userDsh = path.join(root, 'user-dsh');
  const userAgents = path.join(root, 'user-agents');
  const projectDsh = path.join(root, 'project-dsh');
  const projectAgents = path.join(root, 'project-agents');
  realSkill(path.join(userAgents, 'demo'), 'demo');
  realSkill(path.join(projectAgents, 'demo'), 'demo');
  realSkill(path.join(userAgents, 'only-canonical'), 'only-canonical');
  realSkill(path.join(userDsh, 'project-only'), 'project-only');

  const stub = path.join(userDsh, 'demo');
  createShadow({ stubPath: stub, name: 'demo', scope: 'user' });
  createShadow({ stubPath: path.join(projectDsh, 'project-only'), name: 'project-only', scope: 'project:/repo' });

  const roots = [
    { source: 'project-dsh', rank: 100, path: projectDsh, exists: true },
    { source: 'project-agents', rank: 200, path: projectAgents, exists: true },
    { source: 'user-dsh', rank: 400, path: userDsh, exists: true },
    { source: 'user-agents', rank: 500, path: userAgents, exists: true },
  ];
  const { byName } = resolveVisibility({ roots });

  const demo = byName.get('demo');
  assert.equal(demo.visible, true, '项目副本 rank 200 盖过 user 级标记 rank 400');
  assert.equal(demo.winnerSource, 'project-agents');
  assert.equal(demo.sources['user-dsh'], 'shadowed');

  assert.equal(byName.get('only-canonical').visible, true);
  assert.equal(byName.get('only-canonical').winnerSource, 'user-agents');

  const projectOnly = byName.get('project-only');
  assert.equal(projectOnly.visible, false, 'project 级标记赢了同 rank 的 user 真身');

  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：同名副本目录名不同也会互相遮盖（宿主按 frontmatter name 去重）', () => {
  const root = sandbox();
  const userDsh = path.join(root, 'user-dsh');
  const userAgents = path.join(root, 'user-agents');
  // canonical 里的真身，和 ~/.dsh/skills 里一份叫 `demo.bak-2026…` 的旧备份
  realSkill(path.join(userAgents, 'demo'), 'demo');
  realSkill(path.join(userDsh, 'demo.bak-20260101-000000'), 'demo');

  const roots = [
    { source: 'user-dsh', rank: 400, path: userDsh, exists: true },
    { source: 'user-agents', rank: 500, path: userAgents, exists: true },
  ];
  const { byName } = resolveVisibility({ roots });
  assert.equal(byName.has('demo.bak-20260101-000000'), false, '不能凭空多出一个叫备份目录名的技能');

  const demo = byName.get('demo');
  assert.equal(demo.visible, true);
  assert.equal(demo.winnerSource, 'user-dsh', 'rank 400 赢');
  assert.equal(demo.winnerDirName, 'demo.bak-20260101-000000');
  assert.equal(demo.nameConflict, true);
  assert.deepEqual(demo.shadowedBy.map((item) => item.dirName), ['demo'], 'canonical 那份被盖住');
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：user 级标记遮住同名真身（400 > 500）', () => {
  const root = sandbox();
  const userDsh = path.join(root, 'user-dsh');
  const userAgents = path.join(root, 'user-agents');
  realSkill(path.join(userAgents, 'demo'), 'demo');
  const stub = path.join(userDsh, 'demo');
  createShadow({ stubPath: stub, name: 'demo', scope: 'user' });

  const { byName } = resolveVisibility({
    roots: [
      { source: 'user-dsh', rank: 400, path: userDsh, exists: true },
      { source: 'user-agents', rank: 500, path: userAgents, exists: true },
    ],
  });
  const demo = byName.get('demo');
  assert.equal(demo.visible, false);
  assert.equal(demo.shadowed, true);
  assert.equal(demo.winnerSource, 'user-dsh');
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：带 disable-model-invocation 的 legacy 桩不论记没记账都算停用', () => {
  const root = sandbox();
  const userDsh = path.join(root, 'user-dsh');
  const userAgents = path.join(root, 'user-agents');
  realSkill(path.join(userAgents, 'demo'), 'demo');
  createShadow({ stubPath: path.join(userDsh, 'demo'), name: 'demo', scope: 'user' });

  const { byName } = resolveVisibility({
    roots: [
      { source: 'user-dsh', rank: 400, path: userDsh, exists: true },
      { source: 'user-agents', rank: 500, path: userAgents, exists: true },
    ],
  });
  assert.equal(byName.get('demo').visible, false, 'marker 在就以「停用」为准，不依赖账本');
  fs.rmSync(root, { recursive: true, force: true });
});

test('可见性：宿主 snapshot 的 global 层垫底，不能盖过任何本地根', () => {
  const root = sandbox();
  const userAgents = path.join(root, 'user-agents');
  realSkill(path.join(userAgents, 'demo'), 'demo');
  const { byName } = resolveVisibility({
    roots: [{ source: 'user-agents', rank: 500, path: userAgents, exists: true }],
    hostSkills: [
      { name: 'demo', source: 'bundled:core', provider: 'bundled' },
      { name: 'builtin-only', source: 'bundled:core', provider: 'bundled' },
    ],
  });
  assert.equal(byName.get('demo').winnerSource, 'user-agents', '本地根优先');
  assert.equal(byName.get('builtin-only').visible, true);
  assert.equal(byName.get('builtin-only').hostOnly, true);
  fs.rmSync(root, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  LockError,
  makeLockEntry,
  readLockFile,
  removeSkill,
  updateLock,
  upsertSkill,
} from '../dist/core/lock.js';

const TREE_SHA = '0e96f95ca66e0d38a69f76d288d78198332aed8f';
const NOW = new Date('2026-10-24T00:00:00.000Z');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-lock-'));
}

function lockPathIn(root) {
  return path.join(root, 'state', '.skill-lock.json');
}

function expectLockError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof LockError, `预期 LockError，实际 ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return true;
  });
}

test('makeLockEntry 形状与 CLI 落盘字段一致', () => {
  const entry = makeLockEntry({
    source: 'morehao/agent-skills',
    skillPath: 'skills/git-kit/SKILL.md',
    treeSha: TREE_SHA,
    now: NOW,
  });
  assert.deepEqual(Object.keys(entry), [
    'source',
    'sourceType',
    'sourceUrl',
    'skillPath',
    'skillFolderHash',
    'installedAt',
    'updatedAt',
  ]);
  assert.equal(entry.source, 'morehao/agent-skills');
  assert.equal(entry.sourceType, 'github');
  assert.equal(entry.sourceUrl, 'https://github.com/morehao/agent-skills.git');
  assert.equal(entry.skillFolderHash, TREE_SHA);
  assert.equal(entry.installedAt, '2026-10-24T00:00:00.000Z');
  assert.equal(entry.updatedAt, '2026-10-24T00:00:00.000Z');
  assert.equal(entry.skillPath, 'skills/git-kit/SKILL.md');

  const withRef = makeLockEntry({
    source: 'morehao/agent-skills.git',
    ref: TREE_SHA,
    skillPath: 'SKILL.md',
    treeSha: TREE_SHA,
    installedAt: '2026-10-22T12:16:20.320Z',
    updatedAt: '2026-10-23T08:24:25.717Z',
    now: NOW,
  });
  assert.equal(withRef.ref, TREE_SHA);
  assert.equal(withRef.installedAt, '2026-10-22T12:16:20.320Z', '更新时应沿用首次安装时间');
  assert.equal(withRef.sourceUrl, 'https://github.com/morehao/agent-skills.git');
});

test('makeLockEntry 拒绝非 40 位 tree SHA 与不安全 skillPath', () => {
  expectLockError(
    () => makeLockEntry({ source: 'a/b', skillPath: 'SKILL.md', treeSha: 'abc', now: NOW }),
    'lock-invalid',
  );
  for (const skillPath of ['/abs/SKILL.md', '../SKILL.md', 'a\\b.md', 'a/../b.md', 'a//b.md', 'SKILL.txt']) {
    expectLockError(() => makeLockEntry({ source: 'a/b', skillPath, treeSha: TREE_SHA, now: NOW }), 'lock-invalid');
  }
});

test('updateLock 在 lock 不存在时创建 v3 空账', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    const result = updateLock({ lockPath, mutate: () => {} });
    assert.equal(result.changed, true);
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(data.version, 3);
    assert.deepEqual(data.skills, {});
    assert.deepEqual(data.dismissed, {});
    assert.ok(fs.readFileSync(lockPath, 'utf8').endsWith('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upsertSkill 只动目标条目，保留未知顶层/条目字段与 dismissed', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const existing = {
      version: 3,
      schemaNote: 'keep-me',
      dismissed: { 'old-skill': { at: '2026-01-01T00:00:00.000Z' } },
      skills: {
        'old-skill': {
          source: 'a/b',
          sourceType: 'github',
          sourceUrl: 'https://github.com/a/b.git',
          skillFolderHash: TREE_SHA,
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          skillPath: 'SKILL.md',
          customField: 42,
        },
      },
    };
    fs.writeFileSync(lockPath, `${JSON.stringify(existing, null, 2)}\n`);

    const entry = makeLockEntry({
      source: 'morehao/agent-skills',
      skillPath: 'skills/git-kit/SKILL.md',
      treeSha: TREE_SHA,
      now: NOW,
    });
    upsertSkill({ lockPath, name: 'git-kit', entry });

    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(data.schemaNote, 'keep-me');
    assert.deepEqual(data.dismissed, existing.dismissed);
    assert.equal(data.skills['old-skill'].customField, 42);
    assert.deepEqual(data.skills['git-kit'], entry);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upsertSkill 更新同名条目时保留条目内未知字段', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    const base = makeLockEntry({ source: 'a/b', skillPath: 'SKILL.md', treeSha: TREE_SHA, now: NOW });
    updateLock({
      lockPath,
      mutate: (draft) => {
        draft.skills.legacy = { ...base, futureField: { keep: true }, ref: 'old-ref' };
      },
    });
    upsertSkill({
      lockPath,
      name: 'legacy',
      entry: makeLockEntry({ source: 'a/b', skillPath: 'SKILL.md', treeSha: TREE_SHA, now: NOW }),
    });
    const entry = JSON.parse(fs.readFileSync(lockPath, 'utf8')).skills.legacy;
    assert.deepEqual(entry.futureField, { keep: true }, '未知字段必须保留');
    assert.equal(entry.ref, undefined, '新条目没给 ref 时旧 ref 应删除，不能留过期基线');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('removeSkill 删除条目且保留其余内容', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    upsertSkill({
      lockPath,
      name: 'git-kit',
      entry: makeLockEntry({ source: 'a/b', skillPath: 'SKILL.md', treeSha: TREE_SHA, now: NOW }),
    });
    const before = fs.readFileSync(lockPath);
    const result = removeSkill({ lockPath, name: 'git-kit' });
    assert.equal(result.changed, true);
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.deepEqual(data.skills, {});
    assert.ok(fs.readFileSync(`${lockPath}.bak`).equals(before), '删除前应留 .bak');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('removeSkill 对不存在的条目是幂等的', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    updateLock({ lockPath, mutate: () => {} });
    const result = removeSkill({ lockPath, name: 'nope' });
    assert.equal(result.changed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lock 版本不是 3 时只读：拒绝覆盖', () => {
  for (const version of [2, 4]) {
    const root = tempDir();
    try {
      const lockPath = lockPathIn(root);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      const raw = `${JSON.stringify({ version, skills: {} }, null, 2)}\n`;
      fs.writeFileSync(lockPath, raw);
      expectLockError(() => updateLock({ lockPath, mutate: (draft) => { draft.skills.x = {}; } }), 'lock-unsupported');
      assert.equal(fs.readFileSync(lockPath, 'utf8'), raw, '只读时文件必须原样');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('lock JSON 损坏时拒绝覆盖', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, '{ not json');
    expectLockError(() => updateLock({ lockPath, mutate: () => {} }), 'lock-corrupt');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), '{ not json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('expectedDigest 防止覆盖外部 CLI 刚写入的内容', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    updateLock({ lockPath, mutate: () => {} });
    const snapshot = readLockFile(lockPath);
    assert.equal(snapshot.present, true);

    // 外部进程写入：digest 变了
    fs.appendFileSync(lockPath, '\n');
    expectLockError(
      () => updateLock({ lockPath, mutate: () => {}, expectedDigest: snapshot.digest }),
      'lock-conflict',
    );

    const current = readLockFile(lockPath);
    const result = updateLock({ lockPath, mutate: () => {}, expectedDigest: current.digest });
    assert.ok(result.digest);
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).version, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('写入使用临时文件 + rename，不留 .tmp 残留', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    updateLock({ lockPath, mutate: () => {} });
    const leftovers = fs.readdirSync(path.dirname(lockPath)).filter((name) => name.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upsertSkill 拒绝非法技能名与非法条目', () => {
  const root = tempDir();
  try {
    const lockPath = lockPathIn(root);
    const entry = makeLockEntry({ source: 'a/b', skillPath: 'SKILL.md', treeSha: TREE_SHA, now: NOW });
    for (const name of ['', '../x', 'a/b', 'a\\b']) {
      expectLockError(() => upsertSkill({ lockPath, name, entry }), 'lock-invalid');
    }
    const badEntry = { ...entry, skillFolderHash: 'not-a-hash' };
    expectLockError(() => upsertSkill({ lockPath, name: 'x', entry: badEntry }), 'lock-invalid');
    assert.equal(fs.existsSync(lockPath), false, '校验失败不应创建 lock');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

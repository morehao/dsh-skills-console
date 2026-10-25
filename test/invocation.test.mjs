import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { contentHash } from '../lib/core/hash.js';
import {
  hashWithoutInvocation,
  inspectPark,
  parkSkill,
  parseInvocation,
  planManualRestore,
  planManualWrite,
  readParkMarker,
  unparkSkill,
  writeFileAtomic,
} from '../lib/core/invocation.js';

function sandbox(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-inv-'));
  if (text !== undefined) fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
  return dir;
}

test('仅手动：在 description 后插入，保留 BOM / CRLF', () => {
  const text = '\uFEFF---\r\nname: demo\r\ndescription: hi\r\n---\r\nbody\r\n';
  const plan = planManualWrite(text);
  assert.equal(plan.changed, true);
  assert.equal(plan.author, false);
  assert.equal(plan.original, 'absent');
  assert.ok(plan.nextText.startsWith('\uFEFF---\r\n'));
  assert.match(plan.nextText, /description: hi\r\ndisable-model-invocation: true\r\n---/);
  assert.equal(plan.nextText.endsWith('body\r\n'), true, '正文不动');
  assert.equal((plan.nextText.match(/\uFEFF/g) || []).length, 1, 'BOM 不重复');
});

test('仅手动：已有 false 替换成 true，保留行内注释', () => {
  const text = '---\nname: demo\ndisable-model-invocation: false # keep\n---\n';
  const plan = planManualWrite(text);
  assert.equal(plan.original, 'false');
  assert.match(plan.nextText, /disable-model-invocation: true # keep/);
});

test('仅手动：已有 true 视为作者声明，不写', () => {
  const text = '---\nname: demo\ndisable-model-invocation: true\n---\n';
  const plan = planManualWrite(text);
  assert.equal(plan.changed, false);
  assert.equal(plan.author, true);
  assert.equal(plan.original, 'true');
});

test('仅手动：description 是块标量时插到块后面，不插进块里', () => {
  const text = '---\nname: demo\ndescription: |\n  line one\n  line two\n---\nbody\n';
  const plan = planManualWrite(text);
  assert.match(plan.nextText, /  line two\ndisable-model-invocation: true\n---/);
});

test('仅手动：重复 key / 无 frontmatter / 无闭合 → unsupported', () => {
  assert.throws(
    () => planManualWrite('---\ndisable-model-invocation: true\ndisable-model-invocation: true\n---\n'),
    (error) => error.code === 'error.skills.unsupported' && /重复/.test(error.message),
  );
  assert.throws(
    () => planManualWrite('# no frontmatter\n'),
    (error) => error.code === 'error.skills.unsupported',
  );
  assert.throws(
    () => planManualWrite('---\nname: demo\n'),
    (error) => error.code === 'error.skills.unsupported' && /闭合/.test(error.message),
  );
});

test('自动：original=absent 删行；original=false 改回 false', () => {
  const text = '---\nname: demo\ndescription: hi\ndisable-model-invocation: true\n---\nbody\n';
  const removed = planManualRestore(text, 'absent');
  assert.equal(removed.changed, true);
  assert.equal(removed.nextText, '---\nname: demo\ndescription: hi\n---\nbody\n');
  const replaced = planManualRestore(text, 'false');
  assert.match(replaced.nextText, /disable-model-invocation: false/);
});

test('自动：作者声明 / 文件被改过 → 拒绝而不是猜', () => {
  const text = '---\nname: demo\ndisable-model-invocation: true\n---\n';
  assert.throws(() => planManualRestore(text, 'true'), (error) => error.code === 'error.skills.author');
  assert.throws(
    () => planManualRestore('---\nname: demo\ndisable-model-invocation: false\n---\n', 'absent'),
    (error) => error.code === 'error.skills.drift',
  );
  assert.throws(
    () => planManualRestore('---\nname: demo\n---\n', 'false'),
    (error) => error.code === 'error.skills.drift',
  );
});

test('归一化哈希：插行后与原始目录哈希一致，raw 哈希则不一致', () => {
  const text = '---\nname: demo\ndescription: hi\n---\nbody\n';
  const dir = sandbox(text);
  const before = contentHash(dir);
  const plan = planManualWrite(text);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), plan.nextText);
  const manual = { origin: 'plugin', original: 'absent', appliedAt: 'x' };
  assert.equal(hashWithoutInvocation(dir, manual), before);
  assert.notEqual(contentHash(dir), before);
  const author = { origin: 'author', original: 'true', appliedAt: 'x' };
  assert.equal(hashWithoutInvocation(dir, author), contentHash(dir), '作者声明属于上游内容，不归一化');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('归一化哈希：文件被改成 false 时保守返回 null', () => {
  const dir = sandbox('---\nname: demo\ndisable-model-invocation: false\n---\n');
  assert.equal(hashWithoutInvocation(dir, { origin: 'plugin', original: 'absent' }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('park / unpark：内容字节不变、marker 完整、恢复后哈希一致', () => {
  const text = '---\nname: demo\n---\nbody\n';
  const dir = sandbox(text);
  const before = contentHash(dir);
  const parked = parkSkill({ dir, name: 'demo', previousMode: 'manual' });
  assert.equal(parked.canonicalHash, before);
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md.disabled'), 'utf8'), text);
  const marker = readParkMarker(dir);
  assert.equal(marker.by, 'dsh-skills-console');
  assert.equal(marker.previousMode, 'manual');
  assert.deepEqual(
    { parked: inspectPark(dir).parked, marker: Boolean(inspectPark(dir).marker) },
    { parked: true, marker: true },
  );

  const restored = unparkSkill({ dir, name: 'demo', fallbackMode: 'auto' });
  assert.equal(restored.mode, 'manual', '回到停用前的模式');
  assert.equal(restored.hashMismatch, false);
  assert.equal(contentHash(dir), before);
  assert.equal(readParkMarker(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('unpark：parked 期间外部写回不同内容 → 409；keep=current 保留当前', () => {
  const dir = sandbox('---\nname: demo\n---\nold\n');
  parkSkill({ dir, name: 'demo', previousMode: 'auto' });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\n---\nnew\n');
  assert.throws(
    () => unparkSkill({ dir, name: 'demo', fallbackMode: 'auto' }),
    (error) => error.code === 'error.skills.park-conflict',
  );
  const kept = unparkSkill({ dir, name: 'demo', fallbackMode: 'auto', keep: 'current' });
  assert.equal(kept.removed, 'parked-copy');
  assert.match(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), /new/);
  assert.equal(readParkMarker(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('unpark：两份内容相同 → 收敛，不丢文件', () => {
  const text = '---\nname: demo\n---\nbody\n';
  const dir = sandbox(text);
  parkSkill({ dir, name: 'demo', previousMode: 'auto' });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
  const result = unparkSkill({ dir, name: 'demo', fallbackMode: 'auto' });
  assert.equal(result.removed, 'duplicate-disabled');
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md.disabled')), false);
  assert.equal(contentHash(dir), contentHash(dir));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('unpark：只有 marker + SKILL.md（崩在 rename 前）→ 清 marker 收敛', () => {
  const dir = sandbox('---\nname: demo\n---\n');
  // 手工造一个「marker 已在、文件没改名」的半状态
  parkSkill({ dir, name: 'demo', previousMode: 'auto' });
  fs.renameSync(path.join(dir, 'SKILL.md.disabled'), path.join(dir, 'SKILL.md'));
  const result = unparkSkill({ dir, name: 'demo', fallbackMode: 'auto' });
  assert.equal(result.removed, 'marker-stale');
  assert.equal(readParkMarker(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('writeFileAtomic：保留原文件权限', () => {
  const dir = sandbox('---\nname: demo\n---\n');
  const file = path.join(dir, 'SKILL.md');
  fs.chmodSync(file, 0o640);
  writeFileAtomic(file, '---\nname: demo\ndescription: x\n---\n');
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseInvocation：返回 keyIndex / value，供 inventory 与诊断复用', () => {
  const parsed = parseInvocation('---\nname: demo\ndisable-model-invocation: true\n---\n');
  assert.equal(parsed.value, 'true');
  assert.equal(parsed.keyIndex, 2);
});

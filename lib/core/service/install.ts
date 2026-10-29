/**
 * 安装 / 删除：install / remove。
 * 拆分前是 `createService` 返回对象里的同名方法，现在接 `ctx`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentHash } from '../hash.js';
import { readLock } from '../inventory.js';
import { inspectTarget, removeLink } from '../links.js';
import { restoreBackup, trashSkill } from '../trash.js';
import { removeShadow } from '../shadow.js';
import { parseSource, hashShape } from '../updates.js';
import { readSnapshot } from './snapshots.js';
import { detectedTargets, exportSkill, exportTargetList } from './exports.js';
import { assertNotParked, reapplyInvocation } from './invocation.js';
import { assertWritable, requireInstaller, state } from './guards.js';
import { assertSafeSkillName, installerFailure, isLegacyStubDir, nowIso } from './shared.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

export async function install(ctx: ServiceCtx, { source, subscriptionId, skills = [], commit, targets }) {
  const { store, paths, logger, installer } = ctx;
  const enqueue = ctx.runtime.enqueue;
  assertWritable(ctx);
  await requireInstaller(ctx);
  const requested = (skills || []).filter(Boolean);
  for (const name of requested) {
    assertSafeSkillName(name);
    // parked 期间安装/重装会把 SKILL.md 写回来，界面却还以为停着 —— 必须先恢复
    assertNotParked(ctx, name, '安装');
  }

  return enqueue('install', async () => {
    const subscription = subscriptionId
      ? state(ctx).subscriptions.find((item) => item.id === subscriptionId)
      : null;
    if (subscriptionId && !subscription) throw new ServiceError('error.skills.no-subscription', '订阅不存在');
    const resolvedSource = subscription ? subscription.source : source;
    if (!parseSource(resolvedSource)) {
      throw new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');
    }

    // 有快照就沿用（含 commit/entries）；否则现场解析默认分支、commit 与技能清单。
    let snapshot = subscription?.snapshot || null;
    let branch = subscription?.ref || null;
    if (!commit && !snapshot?.commit) {
      const subject = subscription || { source: resolvedSource, ref: null, subpath: null, snapshot: null };
      const read = await readSnapshot(ctx, subject, { withCommit: true, force: true });
      snapshot = read.snapshot;
      branch = read.branch;
    }

    const pin = commit || snapshot?.commit || branch || subscription?.ref || null;
    if (!pin) {
      throw new ServiceError('error.skills.upstream-failed', `无法解析 ${resolvedSource} 的 commit，请稍后重试`, {
        source: resolvedSource,
      });
    }
    const sourceArg = `${resolvedSource}#${pin}`;

    let result;
    try {
      result = await installer.install({
        source: resolvedSource,
        // pin 是 commit 时按 commit 下载；只有分支时让 installer 用分支
        commit: commit || snapshot?.commit || null,
        ref: pin,
        subpath: subscription?.subpath || null,
        names: requested,
        expectedEntries: snapshot?.entries || null,
      });
    } catch (error) {
      logger('install.failed', { source: sourceArg, code: error?.code || null });
      throw installerFailure(error, resolvedSource, '安装');
    }

    const installed: any[] = [];
    const warnings = [...(result.warnings || [])];
    const recordedAt = nowIso();
    for (const item of result.installed) {
      const canonicalPath = path.join(paths.canonical, item.name);
      if (!fs.existsSync(canonicalPath)) {
        warnings.push({ name: item.name, warning: '安装成功但 canonical 里没有该目录，未能记账' });
        continue;
      }
      const installedHash = item.contentHash || contentHash(canonicalPath);
      const expected = snapshot?.entries?.find((entry) => entry.name === item.name) || null;
      const lockHash = item.lockHash ?? item.treeSha ?? null;
      const shape = hashShape(lockHash);
      const record = {
        name: item.name,
        subscriptionId: subscription ? subscription.id : null,
        skillPath: item.skillPath,
        ref: pin,
        commit: commit || snapshot?.commit || null,
        // native installer 只写 40 位 tree SHA；旧 lock 的 64 位形态仍由 checkSkill 兼容
        treeSha: item.treeSha || expected?.treeSha || null,
        installedHash,
        installedAt: recordedAt,
        updatedAt: recordedAt,
        backup: item.backup
          ? { key: item.backup, hash: item.backupHash || null, treeSha: item.backupTreeSha || null }
          : null,
      };
      store.update((draft) => {
        const index = draft.installs.findIndex((row) => row.name === item.name);
        if (index >= 0) {
          draft.installs[index] = {
            ...draft.installs[index],
            ...record,
            installedAt: draft.installs[index].installedAt || record.installedAt,
          };
        } else {
          // 重新安装不改变启停意图：装之前停用的，装完仍然停用
          draft.installs.push({ ...record, enabled: true });
        }
      });
      // 重装 / 更新同一个 manual 技能时，新内容没有插件行；按 state 重新写回。
      const invocation = reapplyInvocation(ctx, item.name);
      if (!invocation.ok) {
        warnings.push({ name: item.name, warning: `仅手动标记未能重放：${invocation.message || invocation.code}` });
      }
      installed.push({
        name: item.name,
        lockHash,
        lockHashShape: shape,
        treeSha: record.treeSha,
        installedHash,
        backup: item.backup || null,
        invocation,
      });
    }

    // 导出是显式动作：显式传入数组即权威（空数组 = 一个都不建）；只有 undefined（未传）
    // 才回退 settings.exportTargets。不能用 `targets.length > 0` 判断——那会让显式 `[]`
    // 被当成"没传"，从而意外回退到用户配置的默认导出目标（设计 §3.3 / §5.3）。
    const exportTargets = Array.isArray(targets) ? targets : exportTargetList(ctx, state(ctx));
    const linkResult: any = { created: [], skipped: [], failed: [] };
    for (const item of installed) {
      const one = exportSkill(ctx, item.name, exportTargets);
      linkResult.created.push(...one.created);
      linkResult.skipped.push(...one.skipped);
      linkResult.failed.push(...one.failed);
    }

    logger('install', { source: sourceArg, skills: installed.map((item) => item.name), installed: installed.length });
    return {
      ok: true,
      installed,
      links: linkResult,
      warnings,
      source: sourceArg,
    };
  });
}

export async function remove(ctx: ServiceCtx, { name }) {
  const { store, paths, logger, installer } = ctx;
  const enqueue = ctx.runtime.enqueue;
  assertSafeSkillName(name);
  assertWritable(ctx);
  await requireInstaller(ctx); // 快照与体检之前就拒绝，避免留下孤儿 trash
  return enqueue(`remove:${name}`, async () => {
    const canonicalPath = path.join(paths.canonical, name);
    if (!fs.existsSync(canonicalPath)) {
      throw new ServiceError('error.skills.not-found', `${name} 不在 canonical 里`);
    }

    // ① 体检：只动自己建的链接；真实目录/外来链接先拦下（前端弹窗依赖 detail.conflicts）。
    // 顺手记下「此刻确认指向 canonical 的自家链」——真身删掉之后就没法再验了。
    const conflicts: any[] = [];
    const ownLinks: any[] = [];
    const legacyStubs = new Set((state(ctx).legacyShadows || []).map((item) => item.stubPath));
    // 只体检「记账里有导出」的目标：别的 Agent 自己放的同名目录/链与我无关，
    // 删除 canonical 也不会连带删掉它（例如 OpenCode 指向另一个仓库的 handoff）。
    const recordedTargets = new Set(
      (state(ctx).exports || []).filter((item) => item.skill === name).map((item) => item.target),
    );
    for (const target of detectedTargets(ctx)) {
      const linkPath = path.join(target.dir, name);
      // legacy 停用桩也是「真实目录」，但它就是我们要清掉的东西。
      // 只跳过我方 marker 的真实目录：同路径若是软链，仍要交给体检判定，不能误删。
      if (legacyStubs.has(linkPath) && isLegacyStubDir(linkPath)) continue;
      const live = inspectTarget({ linkPath, canonicalPath });
      if (live.state === 'managed' || live.state === 'managed-external') {
        ownLinks.push({ target: target.target, linkPath, state: live.state });
      }
      if (!recordedTargets.has(target.target)) continue;
      if (live.state === 'real') conflicts.push({ target: target.target, label: target.label, linkPath, reason: 'real' });
      if (live.state === 'foreign-link' && !live.broken) {
        conflicts.push({ target: target.target, label: target.label, linkPath, reason: 'foreign-link' });
      }
    }
    if (conflicts.length > 0) {
      throw new ServiceError(
        'error.skills.remove-conflict',
        `${conflicts.map((item) => item.label).join('、')} 里的 ${name} 不是本插件创建的，删除已停下；先处理它再重试`,
        { conflicts },
      );
    }

    // ② 快照进回收站；lock 写失败时用它把 canonical 恢复回来
    const hash = fs.statSync(canonicalPath).isDirectory() ? contentHash(canonicalPath) : null;
    const trash = trashSkill({ paths, skill: name, fromDir: canonicalPath, hash });

    // ③ installer 删 lock 条目 + canonical；失败时不留“目录没了 lock 还在”的半状态
    try {
      await installer.remove({ name });
    } catch (error) {
      if (!fs.existsSync(canonicalPath)) {
        try {
          restoreBackup({
            backup: { contentDir: path.join(trash.dir, 'content') },
            toDir: canonicalPath,
          });
        } catch (restoreError) {
          logger('remove.restore.failed', { name, message: restoreError.message });
        }
      }
      const failure = installerFailure(error, name, '删除');
      logger('remove.failed', { name, code: error?.code || null });
      const kept = fs.existsSync(canonicalPath);
      return {
        ok: false,
        code: failure.code,
        message: `${failure.message}；${kept ? '真身仍在 canonical，回收站已留快照' : '已从回收站恢复真身'}`,
        detail: failure.detail,
        trash: trash.key,
      };
    }

    // ④ 清自家导出链：只删 ① 里验证过「指向 canonical」的那些，不按 force 乱扫
    const cleaned: any[] = [];
    for (const item of ownLinks) {
      const outcome = removeLink({ linkPath: item.linkPath, canonicalPath, force: true });
      if (outcome.removed) cleaned.push(item.linkPath);
    }

    // ⑤ 清 legacy 停用桩：不带它走，删除后会留一个「看不见也不存在」的幽灵目录。
    // 失败只记报告，不阻塞删除（真身已经删了，强留桩没有意义）。
    const legacyResults: any[] = [];
    for (const row of (state(ctx).legacyShadows || []).filter((item) => item.skill === name)) {
      const outcome = removeShadow({ stubPath: row.stubPath, name });
      legacyResults.push({ ...outcome, stubPath: row.stubPath });
      if (!outcome.removed && outcome.reason !== 'absent') {
        logger('remove.legacy-shadow.kept', { name, stubPath: row.stubPath, reason: outcome.reason || null });
      }
    }

    // ⑥ 清记账
    store.update((draft) => {
      draft.installs = draft.installs.filter((item) => item.name !== name);
      draft.exports = draft.exports.filter((item) => item.skill !== name);
      draft.legacyShadows = (draft.legacyShadows || []).filter((item) => item.skill !== name);
      delete draft.checks[name];
    });

    logger('remove', { name, trash: trash.key, legacyShadows: legacyResults.length });
    return { ok: true, name, trash: trash.key, removedLinks: cleaned, removedLegacyShadows: legacyResults };
  });
}

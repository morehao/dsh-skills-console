/**
 * 三档调用策略的文件侧实现：auto / manual / hidden（A′ park）。
 * 拆分前是 `createService` 闭包里的 canonicalDir / skillKindOf / isParkedNow /
 * assertNotParked / markDrift / reapplyInvocation / reconcileInvocations / commitManual /
 * commitAuthorManual + 对外方法 setInvocation / unpark（以及内部函数
 * reconcileInvocations 兼作对外方法）。现在接 `ctx`。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  InvocationError,
  backupInvocation,
  inspectPark,
  parkSkill,
  parseInvocation,
  planManualRestore,
  planManualWrite,
  readSkillText,
  unparkSkill,
  writeFileAtomic,
} from '../invocation.js';
import { readLock } from '../inventory.js';
import { assertSafeSkillName, canonicalDir, invocationFailure, nowIso } from './shared.js';
import { assertWritable, state } from './guards.js';
import { adoptionRecord, applyAdoptions } from './tracking.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

function skillKindOf(dir) {
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink()) return 'symlink';
    if (stat.isDirectory()) return 'dir';
    return 'other';
  } catch {
    /* 继续看平铺 .md */
  }
  return fs.existsSync(`${dir}.md`) ? 'file' : 'missing';
}

function isParkedNow(ctx: ServiceCtx, name, install) {
  return inspectPark(canonicalDir(ctx, name)).parked || install?.mode === 'hidden';
}

export function assertNotParked(ctx: ServiceCtx, name, action) {
  if (isParkedNow(ctx, name, ctx.store.findInstall(name))) {
    throw new ServiceError(
      'error.skills.parked',
      `${name} 已完全停用；${action}前请先恢复。否则安装器会把 SKILL.md 写回来，界面却还以为停着`,
      { name, action },
      409,
    );
  }
}

function markDrift(ctx: ServiceCtx, name) {
  const store = ctx.store;
  if (store.readOnly) return;
  try {
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row?.manual) return;
      row.manual = { ...row.manual, drift: true };
    });
  } catch (error) {
    ctx.logger('invocation.drift.persist.failed', { name, message: error.message });
  }
}

/**
 * 更新 / 回滚 / 重装后重放「仅手动」。失败不谎报成功：把 manual.drift 置 true，
 * 由 UI 标「需修复」；更新本身已经成功，不回滚正文。
 */
export function reapplyInvocation(ctx: ServiceCtx, name) {
  const store = ctx.store;
  const install = store.findInstall(name);
  if (!install || install.mode !== 'manual' || install.hidden) return { ok: true, skipped: true };
  const dir = canonicalDir(ctx, name);
  let text;
  try {
    text = readSkillText(dir);
  } catch (error) {
    markDrift(ctx, name);
    return { ok: false, code: error.code || 'error.skills.not-writable', message: error.message };
  }
  let parsed;
  try {
    parsed = parseInvocation(text);
  } catch (error) {
    markDrift(ctx, name);
    return { ok: false, code: error.code || 'error.skills.unsupported', message: error.message };
  }
  // 只重放「缺失」；已经是 true 就当已生效。false / 其它值是被外部改过，
  // 宁可标 drift 让用户看，也不覆盖作者或用户的编辑。
  if (parsed.value !== 'absent' && parsed.value !== 'true') {
    markDrift(ctx, name);
    return { ok: false, code: 'error.skills.drift', message: '标记被改成非 true，未自动覆盖' };
  }
  let plan;
  try {
    plan = planManualWrite(text);
  } catch (error) {
    markDrift(ctx, name);
    return { ok: false, code: error.code || 'error.skills.unsupported', message: error.message };
  }
  if (plan.author) {
    // 这一行可能正是插件自己写的（状态里 origin=plugin）；不能把所有权误判给作者
    if (install.manual?.origin === 'plugin') return { ok: true, origin: 'plugin', changed: false };
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row) return;
      row.manual = { origin: 'author', original: 'true', appliedAt: nowIso(), drift: false };
    });
    return { ok: true, origin: 'author', changed: false };
  }
  if (!plan.changed) return { ok: true, origin: 'plugin', changed: false };
  try {
    backupInvocation({ backupDir: ctx.paths.backupsDir, name, content: text });
    writeFileAtomic(path.join(dir, 'SKILL.md'), plan.nextText);
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row) return;
      row.manual = { origin: 'plugin', original: plan.original, appliedAt: nowIso(), drift: false };
    });
    return { ok: true, origin: 'plugin', changed: true, original: plan.original };
  } catch (error) {
    markDrift(ctx, name);
    return { ok: false, code: error.code || 'error.skills.write-failed', message: error.message };
  }
}

/**
 * 启动 reconcile：只处理 state 已经是 manual 的行。
 * - 文件里已有 true：视为已生效（若是作者声明，状态改成 author）；
 * - 文件里没有 / 是 false：重放（覆盖「更新成功但 reapply 前崩溃」的窗口）；
 * - 作者声明但被外部删掉：只标 drift，绝不替作者写回。
 */
export function reconcileInvocations(ctx: ServiceCtx) {
  const store = ctx.store;
  if (store.readOnly) return [];
  const reports: any[] = [];
  for (const install of state(ctx).installs) {
    if (install.mode !== 'manual' || install.hidden) continue;
    let parsed;
    try {
      parsed = parseInvocation(readSkillText(canonicalDir(ctx, install.name)));
    } catch (error) {
      markDrift(ctx, install.name);
      reports.push({ name: install.name, status: 'unreadable', message: error.message });
      continue;
    }
    if (parsed.value === 'true') {
      if (!install.manual) {
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === install.name);
          if (row) row.manual = { origin: 'author', original: 'true', appliedAt: nowIso(), drift: false };
        });
      }
      continue;
    }
    if (install.manual?.origin === 'author') {
      markDrift(ctx, install.name);
      reports.push({ name: install.name, status: 'author-marker-missing' });
      continue;
    }
    const result = reapplyInvocation(ctx, install.name);
    reports.push({ name: install.name, ...result });
    if (!result.ok) ctx.logger('invocation.reconcile.failed', { name: install.name, message: result.message });
  }
  if (reports.length > 0) ctx.logger('invocation.reconcile', { reports });
  return reports;
}

/**
 * 「仅手动」文件事务：备份 → 原子写 → state；state 写失败把原文件写回去。
 * 不在这里做「是否已经如此」的判断，调用方拿 `plan` 决定。
 */
function commitManual(ctx: ServiceCtx, { name, dir, plan, text }) {
  const store = ctx.store;
  try {
    backupInvocation({ backupDir: ctx.paths.backupsDir, name, content: text });
  } catch (error) {
    throw new InvocationError(
      'error.skills.not-writable',
      `无法备份 ${name} 的 SKILL.md：${error.message}`,
      { name },
      409,
    );
  }
  writeFileAtomic(path.join(dir, 'SKILL.md'), plan.nextText);
  try {
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row) return;
      row.mode = 'manual';
      row.enabled = true;
      delete row.legacy;
      row.hidden = null;
      row.manual = { origin: 'plugin', original: plan.original, appliedAt: nowIso(), drift: false };
    });
  } catch (error) {
    try {
      writeFileAtomic(path.join(dir, 'SKILL.md'), text);
    } catch (rollbackError) {
      ctx.logger('invocation.rollback.failed', { name, message: rollbackError.message });
    }
    throw error;
  }
}

function commitAuthorManual(ctx: ServiceCtx, name) {
  ctx.store.update((draft) => {
    const row = draft.installs.find((item) => item.name === name);
    if (!row) return;
    row.mode = 'manual';
    row.enabled = true;
    delete row.legacy;
    row.hidden = null;
    row.manual = { origin: 'author', original: 'true', appliedAt: nowIso(), drift: false };
  });
}

/**
 * 调用策略：auto / manual / hidden。
 *
 * - manual：只改 canonical SKILL.md 的 frontmatter；作者已声明 true 时只读；
 * - hidden：A′ park（改名为 SKILL.md.disabled + marker），失败回滚文件；
 * - auto：按 state 的 original 移除/还原插件行；作者声明不改，返回 409；
 * - hidden 期间不允许直接改成 auto/manual，必须先 unpark（避免「界面以为停着，实际已恢复」）。
 */
export async function setInvocation(ctx: ServiceCtx, { name, mode }) {
  const { store, paths, logger } = ctx;
  const enqueue = ctx.runtime.enqueue;
  const invalidatePolicies = ctx.invalidatePolicies;
  assertSafeSkillName(name);
  assertWritable(ctx);
  if (!['auto', 'manual', 'hidden'].includes(mode)) {
    throw new ServiceError('error.skills.bad-mode', 'mode 只能是 auto / manual / hidden');
  }
  const initial = store.findInstall(name);
  if (!initial) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
  return enqueue(`mode:${name}`, async () => {
    const install = store.findInstall(name) || initial;
    const dir = canonicalDir(ctx, name);
    const kind = skillKindOf(dir);
    if (kind === 'file') {
      throw new ServiceError('error.skills.unsupported', `${name} 是平铺 .md 技能，不支持调用策略`, { name, kind }, 400);
    }
    if (kind !== 'dir') {
      throw new ServiceError('error.skills.not-installed', `${name} 不在 canonical 里`, { name, kind }, 400);
    }
    if (fs.lstatSync(dir).isSymbolicLink()) {
      throw new ServiceError('error.skills.not-writable', `${name} 的 canonical 是符号链接，拒绝编辑`, { name }, 409);
    }

    const park = inspectPark(dir);
    const currentMode = park.parked || install.mode === 'hidden' ? 'hidden' : (install.mode || 'auto');

    if (mode === 'hidden') {
      if (currentMode === 'hidden') return { ok: true, name, mode: 'hidden', already: true, policy: 'park' };
      const previousMode = currentMode === 'manual' ? 'manual' : 'auto';
      // marker + SKILL.md（崩在 rename 前 / 外部手动恢复）：先把陈旧 marker 清掉再 park
      if (park.marker && park.hasSkill && !park.hasDisabled) {
        try {
          fs.rmSync(path.join(dir, '.dsh-skills-console.park.json'), { force: true });
        } catch {
          /* parkSkill 会再报 */
        }
      }
      let parked;
      try {
        parked = parkSkill({ dir, name, previousMode });
      } catch (error) {
        throw invocationFailure(error);
      }
      const hidden = {
        disabledFile: parked.marker?.disabledFile || 'SKILL.md.disabled',
        marker: '.dsh-skills-console.park.json',
        previousMode,
        canonicalHash: parked.canonicalHash || parked.marker?.canonicalHash || null,
        at: nowIso(),
      };
      try {
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (!row) return;
          row.mode = 'hidden';
          row.enabled = true;
          delete row.legacy;
          row.hidden = hidden;
        });
      } catch (error) {
        try {
          unparkSkill({ dir, name, fallbackMode: previousMode });
        } catch (rollbackError) {
          logger('invocation.park.rollback.failed', { name, message: rollbackError.message });
        }
        throw error;
      }
      try {
        await invalidatePolicies();
      } catch (error) {
        logger('policy.invalidate.failed', { name, message: error.message });
      }
      logger('invocation.hidden', { name, previousMode });
      return { ok: true, name, mode: 'hidden', previousMode, already: false, policy: 'park' };
    }

    if (currentMode === 'hidden') {
      throw new ServiceError(
        'error.skills.parked',
        `${name} 已完全停用；请先恢复，再改调用策略`,
        { name, action: 'invocation', previousMode: install.hidden?.previousMode || 'auto' },
        409,
      );
    }

    if (mode === 'manual') {
      let text;
      let plan;
      try {
        text = readSkillText(dir);
        plan = planManualWrite(text);
      } catch (error) {
        throw invocationFailure(error);
      }
      if (plan.author) {
        if (install.mode === 'manual' && install.manual?.origin === 'author') {
          return { ok: true, name, mode: 'manual', origin: 'author', already: true, policy: 'frontmatter' };
        }
        commitAuthorManual(ctx, name);
        try {
          await invalidatePolicies();
        } catch (error) {
          logger('policy.invalidate.failed', { name, message: error.message });
        }
        logger('invocation.manual', { name, origin: 'author' });
        return { ok: true, name, mode: 'manual', origin: 'author', already: false, policy: 'frontmatter' };
      }
      if (install.mode === 'manual' && install.manual?.origin === 'plugin' && !plan.changed) {
        return { ok: true, name, mode: 'manual', origin: 'plugin', already: true, policy: 'frontmatter' };
      }
      try {
        commitManual(ctx, { name, dir, plan, text });
      } catch (error) {
        throw invocationFailure(error);
      }
      try {
        await invalidatePolicies();
      } catch (error) {
        logger('policy.invalidate.failed', { name, message: error.message });
      }
      logger('invocation.manual', { name, origin: 'plugin', original: plan.original });
      return {
        ok: true,
        name,
        mode: 'manual',
        origin: 'plugin',
        original: plan.original,
        already: false,
        policy: 'frontmatter',
      };
    }

    // auto
    if (install.mode === 'manual' && install.manual) {
      if (install.manual.origin === 'author') {
        throw new ServiceError(
          'error.skills.author',
          '这个技能由作者声明了仅手动，插件不能替你改回自动；请编辑 SKILL.md',
          { name, action: 'auto' },
          409,
        );
      }
      let text;
      let plan;
      try {
        text = readSkillText(dir);
        plan = planManualRestore(text, install.manual.original);
      } catch (error) {
        if (error instanceof InvocationError && error.code === 'error.skills.drift') {
          markDrift(ctx, name);
        }
        throw invocationFailure(error);
      }
      if (plan.changed) {
        try {
          try {
            backupInvocation({ backupDir: paths.backupsDir, name, content: text });
          } catch (error) {
            throw new InvocationError(
              'error.skills.not-writable',
              `无法备份 ${name} 的 SKILL.md：${error.message}`,
              { name },
              409,
            );
          }
          writeFileAtomic(path.join(dir, 'SKILL.md'), plan.nextText);
        } catch (error) {
          throw invocationFailure(error);
        }
        try {
          store.update((draft) => {
            const row = draft.installs.find((item) => item.name === name);
            if (!row) return;
            row.mode = 'auto';
            row.enabled = true;
            delete row.legacy;
            row.manual = null;
            row.hidden = null;
          });
        } catch (error) {
          try {
            writeFileAtomic(path.join(dir, 'SKILL.md'), text);
          } catch (rollbackError) {
            logger('invocation.rollback.failed', { name, message: rollbackError.message });
          }
          throw error;
        }
      } else {
        store.update((draft) => {
          const row = draft.installs.find((item) => item.name === name);
          if (!row) return;
          row.mode = 'auto';
          row.enabled = true;
          delete row.legacy;
          row.manual = null;
          row.hidden = null;
        });
      }
      try {
        await invalidatePolicies();
      } catch (error) {
        logger('policy.invalidate.failed', { name, message: error.message });
      }
      logger('invocation.auto', { name, changed: plan.changed });
      return { ok: true, name, mode: 'auto', already: false, policy: 'frontmatter' };
    }

    if (install.mode === 'auto' && !install.legacy) {
      return { ok: true, name, mode: 'auto', already: true, policy: 'frontmatter' };
    }
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row) return;
      row.mode = 'auto';
      row.enabled = true;
      delete row.legacy;
      row.manual = null;
      row.hidden = null;
    });
    try {
      await invalidatePolicies();
    } catch (error) {
      logger('policy.invalidate.failed', { name, message: error.message });
    }
    logger('invocation.auto', { name, changed: false, legacy: true });
    return { ok: true, name, mode: 'auto', already: false, policy: 'frontmatter' };
  });
}

/**
 * A′ 恢复：校验 marker / disabled，把文件名改回来；不重新下载、不重建导出链。
 * 停用期间外部写回 SKILL.md 时默认 409；`keep='current' | 'parked'` 明确选择保留哪份。
 */
export async function unpark(ctx: ServiceCtx, { name, keep = null }) {
  const { store, paths, logger } = ctx;
  const enqueue = ctx.runtime.enqueue;
  const invalidatePolicies = ctx.invalidatePolicies;
  assertSafeSkillName(name);
  assertWritable(ctx);
  if (keep !== null && keep !== 'current' && keep !== 'parked') {
    throw new ServiceError('error.skills.bad-mode', 'keep 只能是 current / parked');
  }
  return enqueue(`mode:${name}`, async () => {
    const dir = canonicalDir(ctx, name);
    const park = inspectPark(dir);
    const existing = store.findInstall(name);
    if (!park.parked) {
      // state 说 hidden，但 marker 和 disabled 都没了：内容已丢，不能假装恢复
      if (existing?.mode === 'hidden') {
        throw new ServiceError(
          'error.skills.park-broken',
          `${name} 记录为完全停用，但技能文件不在；请从回收站或备份找回`,
          { name, reason: 'both-missing' },
          409,
        );
      }
      throw new ServiceError('error.skills.not-parked', `${name} 没有处于完全停用状态`, { name }, 409);
    }
    let install = existing;
    const fallbackMode = install?.hidden?.previousMode || install?.mode || 'auto';
    let result;
    try {
      result = await unparkSkill({ dir, name, fallbackMode: fallbackMode === 'manual' ? 'manual' : 'auto', keep });
    } catch (error) {
      throw invocationFailure(error);
    }

    if (!install) {
      // state 丢了但 marker 还在：先补一条接管记录，后面才有行可更新
      const lock = readLock(paths);
      const record = adoptionRecord(ctx, name, lock.skills?.[name] || null);
      store.update((draft) => applyAdoptions(draft, [record]));
      install = store.findInstall(name);
    }

    let mode = result.mode === 'manual' ? 'manual' : 'auto';
    let manual = install?.manual || null;
    if (mode === 'manual') {
      if (!manual) {
        let parsed: any = null;
        try {
          parsed = parseInvocation(readSkillText(dir));
        } catch {
          /* 按 auto 收敛 */
        }
        if (parsed?.value === 'true') {
          manual = { origin: 'author', original: 'true', appliedAt: nowIso(), drift: false };
        } else {
          mode = 'auto';
        }
      }
    }
    // 恢复时内容被外部改过 / 选了保留当前版本：manual 标记可能不再可信，标 drift 让 UI 报
    if (mode === 'manual' && manual && result.hashMismatch) manual = { ...manual, drift: true };
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (!row) return;
      row.mode = mode;
      row.enabled = true;
      delete row.legacy;
      row.hidden = null;
      if (mode === 'manual') row.manual = manual;
      else row.manual = null;
    });
    try {
      await invalidatePolicies();
    } catch (error) {
      logger('policy.invalidate.failed', { name, message: error.message });
    }
    logger('invocation.unpark', { name, mode, hashMismatch: result.hashMismatch });
    return {
      ok: true,
      name,
      mode,
      previousMode: result.previousMode,
      hashMismatch: result.hashMismatch,
      kept: result.kept,
      removed: result.removed,
    };
  });
}

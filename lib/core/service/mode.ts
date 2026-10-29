/**
 * 旧 `/mode` 启停（legacy dsh-off）：只写 state，由 policy provider 覆盖 canonical 候选。
 * 拆分前是 `createService` 闭包 + 对外方法 `setMode`；因与 invocation（三档调用策略）
 * 共享门禁但代码量较大，单独成一簇，避免任一子模块超过 600 行。
 */
import fs from 'node:fs';
import path from 'node:path';
import { removeShadow } from '../shadow.js';
import { assertSafeSkillName } from './shared.js';
import { assertWritable, state } from './guards.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

/**
 * 停用 = 只写 state（由 policy provider 覆盖 canonical 候选）；启用 = 写 state 并清掉
 * 可能残留的 legacy 停用桩。
 *
 * 四条不变量：
 * - 不写/删 `~/.dsh/skills`（唯一例外：清理 旧版迁移残桩），不碰 canonical/lock；
 * - 宿主没有 provider 能力（或所有 live agent 都注册失败）时 409，绝不写
 *   「界面说停用、模型照样看见」的状态；
 * - 项目级启停已移除（400）：项目副本优先，停用 canonical 不会隐藏项目副本；
 * - 已经 on/off 时返回 `already`，不重复写 state。
 */
export async function setMode(ctx: ServiceCtx, { name, mode, scope = 'user', projectRoot = null }) {
  const { store, paths, logger } = ctx;
  const enqueue = ctx.runtime.enqueue;
  const policyStatus = ctx.policyStatus;
  const invalidatePolicies = ctx.invalidatePolicies;
  assertSafeSkillName(name);
  assertWritable(ctx);
  if (mode !== 'on' && mode !== 'off') throw new ServiceError('error.skills.bad-mode', 'mode 只能是 on / off');
  if (projectRoot || scope !== 'user') {
    throw new ServiceError(
      'error.skills.scope-unsupported',
      '项目级启停已移除；项目副本优先，停用 canonical 不会隐藏项目副本',
      { scope, projectRoot },
      400,
    );
  }
  const install = store.findInstall(name);
  if (!install) throw new ServiceError('error.skills.not-managed', `${name} 没有安装记录`);
  // 旧 /mode 只服务 legacy dsh-off；manual / hidden 必须走 /invocation，避免两套开关打架
  if (install.mode === 'manual' || install.mode === 'hidden' || install.hidden) {
    throw new ServiceError(
      'error.skills.mode-conflict',
      `${name} 使用三档调用策略，请用 /invocation 而不是旧 /mode`,
      { name, mode: install.mode },
      409,
    );
  }
  return enqueue(`mode:${name}`, async () => {
    const canonicalPath = path.join(paths.canonical, name);
    // 在队列里重新读一次：并发两次 off/on 时不能拿入队前的快照判断「已经如此」。
    const current = store.findInstall(name) || install;
    if (current.mode === 'manual' || current.mode === 'hidden' || current.hidden) {
      throw new ServiceError(
        'error.skills.mode-conflict',
        `${name} 使用三档调用策略，请用 /invocation 而不是旧 /mode`,
        { name, mode: current.mode },
        409,
      );
    }
    const already = mode === 'off' ? current.enabled === false : current.enabled !== false;

    if (mode === 'off') {
      if (already) return { ok: true, mode: 'off', enabled: false, policy: 'provider', already: true };
      if (!fs.existsSync(canonicalPath)) {
        if (fs.existsSync(`${canonicalPath}.md`)) {
          throw new ServiceError(
            'error.skills.unsupported',
            `${name} 是平铺 .md 技能，本期不支持启停`,
            { name, kind: 'file' },
            400,
          );
        }
        throw new ServiceError('error.skills.not-installed', `${name} 不在 canonical 里，没有可停用的真身`);
      }
      let isDir = false;
      try {
        isDir = fs.statSync(canonicalPath).isDirectory();
      } catch {
        isDir = false;
      }
      if (!isDir) {
        throw new ServiceError(
          'error.skills.unsupported',
          `${name} 不是目录型技能，本期不支持启停`,
          { name, kind: 'file' },
          400,
        );
      }
      const status = policyStatus() || {};
      if (!status.available || (status.liveAgents > 0 && status.registered === 0)) {
        logger('mode.off.rejected', {
          name,
          available: Boolean(status.available),
          liveAgents: status.liveAgents || 0,
          registered: status.registered || 0,
        });
        throw new ServiceError(
          'error.skills.policy-unavailable',
          '宿主没有可用的 skill provider 注册接口，停用无法保证生效',
          {
            available: Boolean(status.available),
            liveAgents: status.liveAgents || 0,
            registered: status.registered || 0,
            errors: status.errors || [],
          },
          409,
        );
      }
      store.update((draft) => {
        const row = draft.installs.find((item) => item.name === name);
        if (row) {
          row.enabled = false;
          row.mode = 'auto';
          row.legacy = 'dsh-off';
        }
      });
      await invalidatePolicies();
      logger('mode.off', { name, policy: 'provider' });
      return { ok: true, mode: 'off', enabled: false, policy: 'provider' };
    }

    // 启用：先清掉 旧版留下的旧桩（只认本插件 marker）；删不掉就不改 enabled
    const legacy = (state(ctx).legacyShadows || []).filter((row) => row.skill === name);
    const removed: any[] = [];
    const failed: any[] = [];
    for (const row of legacy) {
      const outcome = removeShadow({ stubPath: row.stubPath, name: row.skill });
      if (outcome.removed || outcome.reason === 'absent') removed.push(row.stubPath);
      else failed.push({ stubPath: row.stubPath, reason: outcome.reason || 'locked' });
    }
    if (failed.length > 0) {
      throw new ServiceError(
        'error.skills.shadow-locked',
        `旧停用桩删不掉（${failed[0].reason}），技能仍是停用状态`,
        { failed },
        409,
      );
    }
    if (already && removed.length === 0) {
      return { ok: true, mode: 'on', enabled: true, policy: 'provider', already: true };
    }
    store.update((draft) => {
      const row = draft.installs.find((item) => item.name === name);
      if (row) {
        row.enabled = true;
        row.mode = 'auto';
        delete row.legacy;
      }
      draft.legacyShadows = (draft.legacyShadows || []).filter((item) => item.skill !== name);
    });
    await invalidatePolicies();
    logger('mode.on', { name, policy: 'provider', removedLegacy: removed.length });
    return { ok: true, mode: 'on', enabled: true, policy: 'provider', ...(already ? { already: true } : {}) };
  });
}

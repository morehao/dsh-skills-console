/**
 * 写操作/安装门禁：state 访问、readOnly 断言、native installer 能力。
 * 拆分前是 `createService` 闭包里的 `state` / `assertWritable` / `nativeCapabilities`
 * / `requireInstaller`，现在接 `ctx`。
 */
import { StateReadOnlyError } from '../state.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

export function state(ctx: ServiceCtx) {
  return ctx.store.state;
}

export function assertWritable(ctx: ServiceCtx) {
  if (ctx.store.readOnly) throw new StateReadOnlyError(ctx.store.problem);
}

/** `/state.cli` 兼容字段：`usable` 由 native installer 与 lock 的可写性决定。 */
export function nativeCapabilities(ctx: ServiceCtx) {
  const capabilities = ctx.installer?.readiness?.() || {
    usable: false,
    source: 'missing',
    version: null,
    json: false,
    fullDepth: false,
    problem: 'installer-missing',
  };
  return capabilities;
}

/** 安装/更新/删除写操作的就绪门禁：只看 native installer 与 lock 的可写性。 */
export async function requireInstaller(ctx: ServiceCtx) {
  const capabilities = nativeCapabilities(ctx);
  if (!capabilities.usable) {
    throw new ServiceError(
      'error.skills.installer-unavailable',
      '本地安装器不可用（lock 版本/权限异常），写操作已禁用',
      capabilities,
    );
  }
  return capabilities;
}

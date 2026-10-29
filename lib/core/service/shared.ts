/**
 * 无跨簇依赖的模块级工具函数 + 少量「只依赖 ctx.paths」的小助手。
 * 拆分前这些都在 `lib/core/service.ts` 的模块顶层（`createService` 之外）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ServiceError } from './errors.js';
import { readShadowMarker } from '../shadow.js';
import { InvocationError } from '../invocation.js';
import { SkillFileError } from '../skill-files.js';
import type { ServiceCtx } from '../../contract/service.js';

export function nowIso() {
  return new Date().toISOString();
}

/**
 * 上次检查是否已经得出可用结论。`unknown` 不是结论（是「没能判定」），
 * 所以 304 时不能拿它当「上次结论」沿用，否则待检查会一直粘着。
 */
export function isSettledCheck(check) {
  const status = check?.status;
  return status === 'current' || status === 'update-available' || status === 'upstream-deleted';
}

/**
 * 旧版本 bug 留下的坏快照：根级技能的 `snapshot.rootSha` 被写成了 commit SHA。
 * 正确数据里根 tree SHA 与 commit SHA 不可能相等，且必须有「skillPath 无 `/`」的根级条目；
 * 两者同时命中才认定需要重读修复 —— 否则会误伤正常快照。
 */
export function snapshotRootBaselineStale(snapshot) {
  if (!snapshot || !snapshot.rootSha || !snapshot.commit) return false;
  if (snapshot.rootSha !== snapshot.commit) return false;
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  return entries.some((item) => typeof item.skillPath === 'string' && !item.skillPath.includes('/'));
}

/** 读取层错误 → ServiceError（路由只认 ServiceError → 400），保留原 code / detail。 */
export function skillFileFailure(error) {
  if (error instanceof SkillFileError) {
    return new ServiceError(error.code, error.message, error.detail ?? null);
  }
  return error;
}

/** 调用策略层的文件事务错误 → 路由错误；保留 409 语义。 */
export function invocationFailure(error) {
  if (error instanceof InvocationError) {
    return new ServiceError(error.code, error.message, error.detail ?? null, error.status);
  }
  return error;
}

/** 是我方写的 legacy 停用桩（真实目录 + marker）？删除体检时只放过这一类。 */
export function isLegacyStubDir(dirPath) {
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    return readShadowMarker(dirPath) !== null;
  } catch {
    return false;
  }
}

/** 路由参数里的技能名：在拼任何路径之前先校验，拒绝穿越/分隔符/控制字符。 */
export function assertSafeSkillName(name) {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 120 ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('..') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new ServiceError('error.skills.not-found', `技能名非法: ${String(name)}`);
  }
  return name;
}

/** Native installer 的失败 → 现有通用错误码（不新增前端交互，只换 toast 文案）。 */
export function installerFailure(error, source, action = '安装') {
  const code = error?.code || null;
  const status = error?.status ?? null;
  const detail = { reason: code, status, ...(error?.available ? { available: error.available } : {}) };
  if (code === 'bad-source') return new ServiceError('error.skills.bad-source', '只接受 owner/repo 或 GitHub URL（公开源）');
  if (code === 'no-skills') return new ServiceError('error.skills.no-skills', error.message, detail);
  if (code === 'skill-not-found') {
    return new ServiceError('error.skills.no-skills', error.message, detail);
  }
  if (code === 'timeout') {
    return new ServiceError('error.skills.network', '下载技能包超时，请检查网络或代理后重试', detail);
  }
  if (code === 'tarball-too-large') {
    return new ServiceError('error.skills.install-failed', '技能包超过大小上限，已中止安装', detail);
  }
  if (code === 'http-error' && status) {
    return upstreamError(source, { status, error: error.message });
  }
  if (['lock-unsupported', 'lock-corrupt', 'lock-unreadable', 'lock-conflict', 'lock-write-failed'].includes(code)) {
    return new ServiceError('error.skills.install-failed', `${action}失败：lock 不可写或已被其他进程修改（${code}）`, detail);
  }
  return new ServiceError('error.skills.install-failed', `${action}失败：${error?.message || error}`, detail);
}

/** 本机时区的 `HH:mm`。手写而不是 `toLocaleTimeString`：不受 ICU / locale 差异影响。 */
export function formatClock(ms) {
  const at = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * 上游失败 → 可执行错误（T1）。四类必须互不相同，否则用户只知道「读不到」，
 * 不知道该等、该改来源，还是该查网络。
 */
export function upstreamError(source, failure) {
  const status = failure?.status ?? null;
  const resetAt = failure?.resetAt ?? null;
  const detail = { source, status, resetAt, error: failure?.error ?? null };
  if (failure?.rateLimited) {
    const resume = resetAt ? `约 ${formatClock(resetAt)} 后自动恢复；` : '';
    return new ServiceError(
      'error.skills.rate-limited',
      `GitHub 接口已限流（匿名 60 次/小时，按出口 IP 共享）。${resume}设置 GITHUB_TOKEN 可提到 5000 次/小时`,
      detail,
    );
  }
  if (status === 404) {
    return new ServiceError('error.skills.repo-not-found', `读不到 ${source}：仓库不存在或为私有`, detail);
  }
  if (status === 401 || status === 403) {
    return new ServiceError('error.skills.repo-forbidden', `读取 ${source} 被拒绝（HTTP ${status}）`, detail);
  }
  if (status) {
    return new ServiceError('error.skills.upstream-failed', `读取 ${source} 失败：HTTP ${status}`, detail);
  }
  return new ServiceError('error.skills.network', '无法连接 GitHub（网络或代理问题）', detail);
}

/** canonical 技能目录（`<canonical>/<name>`）。多个簇共用，放在这里避免跨簇环。 */
export function canonicalDir(ctx: ServiceCtx, name: string) {
  return path.join(ctx.paths.canonical, name);
}

import fs from 'node:fs';
import path from 'node:path';

/**
 * 四态托管判定（比三态多一个 `managed-external`，见设计 §4.2）+ `absent`。
 *
 * - managed           指向 canonical 同名目录，且插件 state 有创建记录
 * - managed-external  指向 canonical 同名目录，但 state 没有记录（别人建的，可"接管"）
 * - foreign-link      是软链但指向别处（含悬空）
 * - real              真实目录或文件（本地实体，绝不覆盖）
 * - absent            目标位置什么都没有
 */
export const LINK_STATES = ['managed', 'managed-external', 'foreign-link', 'real', 'absent'];

function realpathOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function hasSkillFile(dir) {
  try {
    return fs.statSync(path.join(dir, 'SKILL.md')).isFile();
  } catch {
    return false;
  }
}

export function inspectTarget({ linkPath, canonicalPath }) {
  let st;
  try {
    st = fs.lstatSync(linkPath);
  } catch {
    return { state: 'absent', linkPath };
  }

  if (!st.isSymbolicLink()) return { state: 'real', linkPath };

  let rawTarget = null;
  try {
    rawTarget = fs.readlinkSync(linkPath);
  } catch {
    rawTarget = null;
  }

  const resolved = realpathOrNull(linkPath);
  if (!resolved) return { state: 'foreign-link', linkPath, target: rawTarget, broken: true };

  const canonicalReal = canonicalPath ? realpathOrNull(canonicalPath) : null;
  const sameSkill = canonicalReal && resolved === canonicalReal && hasSkillFile(resolved);
  if (sameSkill) return { state: 'managed-external', linkPath, target: rawTarget, resolved };
  return { state: 'foreign-link', linkPath, target: rawTarget, resolved };
}

/**
 * 建链：同层用相对路径（可跨机器复用），算不出相对就退回绝对路径并标记。
 * Windows 用 junction + 绝对路径（对齐 CLI 的 createSymlink，F2）。
 */
export function createLink({ linkPath, targetPath, platform = process.platform, fsImpl = fs }) {
  fsImpl.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (platform === 'win32') {
    fsImpl.symlinkSync(fsImpl.realpathSync(targetPath), linkPath, 'junction');
    return { mode: 'junction', linkPath, targetPath };
  }
  // 非 Windows 一律用相对软链：同层时是 `../../.agents/skills/<name>`，跨层时由 path.relative 算出距离。
  const rel = path.relative(path.dirname(linkPath), targetPath);
  fsImpl.symlinkSync(rel || targetPath, linkPath, 'dir');
  return { mode: 'relative', linkPath, targetPath, linkTarget: rel };
}

/** 删除链接：只删软链，且默认只删指向 canonical 的（`force` 仅用于回收悬空链）。 */
export function removeLink({ linkPath, canonicalPath, force = false }) {
  let st;
  try {
    st = fs.lstatSync(linkPath);
  } catch {
    return { removed: false, reason: 'absent' };
  }
  if (!st.isSymbolicLink()) return { removed: false, reason: 'not-a-link' };
  if (!force) {
    const resolved = realpathOrNull(linkPath);
    const canonicalReal = canonicalPath ? realpathOrNull(canonicalPath) : null;
    if (!resolved || !canonicalReal || resolved !== canonicalReal) {
      return { removed: false, reason: 'not-managed' };
    }
  }
  fs.unlinkSync(linkPath);
  return { removed: true };
}

/** 幂等建链：已存在同内容链接 → 跳过；其他任何占用 → 跳过并说明原因。 */
export function ensureLink({ linkPath, canonicalPath }) {
  const current = inspectTarget({ linkPath, canonicalPath });
  if (current.state === 'managed' || current.state === 'managed-external') {
    return { created: false, state: current.state, linkPath };
  }
  if (current.state !== 'absent') {
    return { created: false, state: current.state, linkPath, skipped: true };
  }
  const created = createLink({ linkPath, targetPath: canonicalPath });
  return { created: true, state: 'managed', ...created };
}

/**
 * skills CLI 的 v3 lock（`~/.agents/.skill-lock.json` 或 XDG 下的同名文件）。
 * 锚点：lib/core/lock.js `assertLockEntry()` / `makeLockEntry()` / `LOCK_VERSION`。
 * 未知字段必须保留（CLI 与本插件共用同一个文件），所以带 index signature。
 */
export interface SkillLockEntry {
  skillPath?: string;
  skillFolderHash?: string;
  [extra: string]: unknown;
}

export interface LockFile {
  version: number;
  skills: Record<string, SkillLockEntry>;
  [extra: string]: unknown;
}

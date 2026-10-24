import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTarball } from './archive.js';
import { contentHash } from './hash.js';
import { discoverSkills } from './discovery.js';
import { gitTreeSha } from './git-tree.js';
import { createBackup, pruneBackups, readBackup, restoreBackup } from './trash.js';
import { makeLockEntry, readLockFile, updateLock } from './lock.js';
import { parseSource } from './updates.js';
import { downloadTarball } from './remote.js';

/**
 * Native Installer：canonical（`~/.agents/skills`）与 v3 lock 的**唯一写入者**。
 *
 * 事务边界（设计 §核心流程/安装）：
 * 1. 下载 + 安全解压 + 发现全部在临时目录完成；此时 canonical/lock 一个字节都没动。
 * 2. 校验 lock 可写（版本/损坏在下载前就失败）。
 * 3. 需要覆盖的旧目录先 `createBackup`，再把 staging 复制到 canonical 下的同盘临时目录，
 *    逐个 `rename` 到最终位置（同文件系统，单目录原子替换）。
 * 4. 所有目录就位后**一次** `updateLock` 写全部条目（`expectedDigest` 防外部并发）。
 * 5. 任一步失败：反向删除已 promote 的目录、从备份恢复旧目录；lock 未写或保持原样。
 *
 * 只负责文件与 lock，不碰 state / 链接 / 回收站（那些仍是 Service 的职责）。
 */

export class InstallerError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'InstallerError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function nearestExisting(dir) {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

function assertSafeSkillName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 120) {
    throw new InstallerError('invalid-name', `技能名非法: ${String(name)}`);
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new InstallerError('invalid-name', `技能名不能含路径分隔符: ${name}`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new InstallerError('invalid-name', `技能名含控制字符: ${JSON.stringify(name)}`);
  }
  return name;
}

function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: false, preserveTimestamps: true });
}

function validIsoOrUndefined(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function normalizeError(error) {
  if (error instanceof InstallerError) return error;
  const code = error?.code || 'install-failed';
  return new InstallerError(code, error?.message || String(error), {
    cause: error,
    status: error?.status ?? null,
  });
}

export function createInstaller({
  paths,
  env = process.env,
  fetchImpl = fetch,
  token,
  logger = () => {},
} = {}) {
  const authToken = token ?? env.GITHUB_TOKEN ?? env.GH_TOKEN ?? null;

  /** 与旧 `/state.cli` 兼容的就绪状态：只有 lock 与 canonical 都可写时 usable 才为 true。 */
  function readiness() {
    let problem = null;
    try {
      readLockFile(paths.lockFile);
    } catch (error) {
      problem = error?.code || 'lock-unreadable';
    }
    let writable = false;
    try {
      fs.accessSync(nearestExisting(paths.canonical), fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
    const usable = !problem && writable;
    return {
      usable,
      source: 'native',
      version: null,
      json: true,
      fullDepth: true,
      problem: problem || (writable ? null : 'canonical-not-writable'),
    };
  }

  /**
   * 安装/重装一组技能。
   * @param {{source:string, ref?:string|null, commit?:string|null, subpath?:string|null,
   *          names?:string[], expectedEntries?:Array<{name:string, treeSha?:string|null}>}} options
   */
  async function install({ source, ref = null, commit = null, subpath = null, names = [], expectedEntries = null } = {}) {
    const parsed = parseSource(source);
    if (!parsed) throw new InstallerError('bad-source', `只接受 owner/repo 或 GitHub URL: ${source}`);
    const canonicalSource = `${parsed.owner}/${parsed.repo}`;
    const pin = commit || ref;
    if (typeof pin !== 'string' || pin.length === 0) {
      throw new InstallerError('missing-ref', '安装需要 commit 或 ref');
    }
    const requested = (Array.isArray(names) ? names : []).filter(Boolean);
    if (new Set(requested).size !== requested.length) {
      throw new InstallerError('duplicate-selection', '选择列表里有重复技能名');
    }

    // 下载前先确认 lock 可写：坏 lock / 版本过高不应该先花一次网络请求
    const lockBefore = readLockFile(paths.lockFile);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-install-'));
    const tarball = path.join(tempRoot, 'repo.tar.gz');
    const staging = path.join(tempRoot, 'stage');
    const backups = new Map();
    const attempted = [];
    let preparedRoot = null;

    try {
      const downloaded = await downloadTarball({
        source: canonicalSource,
        ref: pin,
        token: authToken,
        dest: tarball,
        fetchImpl,
      });
      const extracted = await extractTarball({ tarball, dest: staging });
      const discovered = discoverSkills({ dir: extracted.dir, subpath, repoName: parsed.repo });
      if (discovered.length === 0) {
        throw new InstallerError('no-skills', `${canonicalSource} 里没有找到 SKILL.md`);
      }

      const available = new Map(discovered.map((skill) => [skill.name, skill]));
      const selected =
        requested.length > 0
          ? requested.map((name) => {
              const skill = available.get(name);
              if (!skill) {
                throw new InstallerError('skill-not-found', `${canonicalSource} 里找不到技能 ${name}`, {
                  name,
                  available: [...available.keys()],
                });
              }
              return skill;
            })
          : discovered;

      const planned = selected.map((skill) => ({
        ...skill,
        treeSha: gitTreeSha(skill.dirPath),
        contentHash: contentHash(skill.dirPath),
      }));

      const warnings = [];
      const expected = new Map((expectedEntries || []).map((entry) => [entry.name, entry]));
      for (const item of planned) {
        const want = expected.get(item.name);
        if (want?.treeSha && want.treeSha !== item.treeSha) {
          warnings.push({
            name: item.name,
            warning: '本地 tree SHA 与快照不一致（可能下载到了别的 commit）',
            expected: want.treeSha,
            actual: item.treeSha,
          });
        }
      }

      // 同盘 staging：先复制到 canonical 下的隐藏目录，再 rename 到最终位置。
      // 隐藏目录以 `.` 开头，inventory 扫描会跳过，不会把半成品当成技能。
      fs.mkdirSync(paths.canonical, { recursive: true });
      preparedRoot = path.join(
        paths.canonical,
        `.dshsc-staging-${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      );
      fs.mkdirSync(preparedRoot, { recursive: false });
      for (const item of planned) {
        copyTree(item.dirPath, path.join(preparedRoot, item.name));
      }

      for (const item of planned) {
        const dest = path.join(paths.canonical, item.name);
        if (fs.existsSync(dest)) {
          const stat = fs.lstatSync(dest);
          if (stat.isSymbolicLink()) {
            throw new InstallerError('unsupported-existing', `${dest} 是符号链接，拒绝覆盖`);
          }
          const previousHash = contentHash(dest);
          // 事务期间不 prune：多技能安装时先备份的目录不能被后面的 createBackup 挤掉
          const backup = createBackup({ paths, skill: item.name, fromDir: dest, hash: previousHash, prune: false });
          backups.set(item.name, { key: backup.key, previousHash });
        }
        // 先登记再动盘：任何一步失败都要能从备份恢复（包括 rm 之后、rename 之前）
        attempted.push({ item, dest, backup: backups.get(item.name) || null });
        fs.rmSync(dest, { recursive: true, force: true });
        fs.renameSync(path.join(preparedRoot, item.name), dest);
        const promotedHash = contentHash(dest);
        if (promotedHash !== item.contentHash) {
          throw new InstallerError('verify-failed', `${item.name} 落盘后内容哈希不一致`, {
            expected: item.contentHash,
            actual: promotedHash,
          });
        }
      }

      const now = new Date();
      const updatedAt = now.toISOString();
      const entries = new Map();
      for (const item of planned) {
        const existing = lockBefore.data?.skills?.[item.name] || null;
        entries.set(
          item.name,
          makeLockEntry({
            source: canonicalSource,
            ref: pin,
            skillPath: item.skillPath,
            treeSha: item.treeSha,
            installedAt: validIsoOrUndefined(existing?.installedAt),
            updatedAt,
            now,
          }),
        );
      }

      updateLock({
        lockPath: paths.lockFile,
        expectedDigest: lockBefore.digest,
        mutate: (draft) => {
          for (const [name, entry] of entries) {
            const previous = draft.skills[name];
            // 已知字段以新条目为准，旧条目里的未知字段保留（旧 CLI/未来 CLI 加的字段不丢）
            draft.skills[name] = previous && typeof previous === 'object' ? { ...previous, ...entry } : entry;
          }
        },
      });

      try {
        pruneBackups({ paths });
      } catch {
        // 备份清理是维护动作，失败不影响安装结果
      }

      const installed = planned.map((item) => {
        const backup = backups.get(item.name) || null;
        const previousLockHash = lockBefore.data?.skills?.[item.name]?.skillFolderHash || null;
        return {
          name: item.name,
          skillPath: item.skillPath,
          treeSha: item.treeSha,
          contentHash: item.contentHash,
          backup: backup?.key || null,
          backupHash: backup?.previousHash || null,
          backupTreeSha:
            typeof previousLockHash === 'string' && /^[0-9a-f]{40}$/.test(previousLockHash)
              ? previousLockHash
              : null,
        };
      });
      logger('installer.install', {
        source: canonicalSource,
        ref: pin,
        skills: installed.map((item) => item.name),
        bytes: downloaded.bytes,
        warnings: warnings.length,
      });
      return { installed, warnings, root: extracted.root };
    } catch (error) {
      for (const entry of [...attempted].reverse()) {
        fs.rmSync(entry.dest, { recursive: true, force: true });
        if (entry.backup) {
          const restored = readBackup({ paths, key: entry.backup.key });
          if (restored) restoreBackup({ backup: restored, toDir: entry.dest });
        }
      }
      throw normalizeError(error);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      if (preparedRoot) fs.rmSync(preparedRoot, { recursive: true, force: true });
    }
  }

  /** 删除 canonical 目录与 lock 条目；lock 写失败时不删目录，避免半状态。 */
  function remove({ name } = {}) {
    assertSafeSkillName(name);
    const lockBefore = readLockFile(paths.lockFile);
    const entry = lockBefore.data?.skills?.[name] || null;
    const canonicalPath = path.join(paths.canonical, name);

    updateLock({
      lockPath: paths.lockFile,
      expectedDigest: lockBefore.digest,
      mutate: (draft) => {
        delete draft.skills[name];
      },
    });

    try {
      fs.rmSync(canonicalPath, { recursive: true, force: true });
    } catch (error) {
      // 目录删不掉就把 lock 条目放回去（尽量恢复，恢复不了也如实报错）
      if (entry) {
        try {
          updateLock({
            lockPath: paths.lockFile,
            mutate: (draft) => {
              draft.skills[name] = entry;
            },
          });
        } catch {
          // 恢复失败只能让调用方看到原始错误；lock 里最多少一条，不会指错目录
        }
      }
      throw new InstallerError('remove-failed', `删除 ${name} 失败: ${error.message}`, { cause: error });
    }

    logger('installer.remove', { name, hadLockEntry: Boolean(entry) });
    return { removed: Boolean(entry), treeSha: entry?.skillFolderHash || null };
  }

  return { readiness, install, remove };
}

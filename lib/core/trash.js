import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEEP_GENERATIONS = 5;
const MAX_BYTES = 200 * 1024 * 1024;

function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        /* 忽略统计失败 */
      }
    }
  }
  return total;
}

function copyTree(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, dereference: false, preserveTimestamps: true });
}

export function newKey(skill) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(3).toString('hex');
  return `${skill}-${stamp}-${rand}`;
}

/**
 * 备份落 `skills-console/backups/<key>/`，**绝不进 `skills/`**：
 * 任何含 `SKILL.md` 的子目录都会被原生当成技能扫到（F13）。
 */
export function createBackup({ paths, skill, fromDir, hash = null }) {
  const key = newKey(skill);
  const target = path.join(paths.backupsDir, key);
  copyTree(fromDir, path.join(target, 'content'));
  const meta = { key, skill, hash, from: fromDir, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(target, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  pruneBackups({ paths });
  return { key, dir: target, ...meta };
}

export function readBackup({ paths, key }) {
  const dir = path.join(paths.backupsDir, key);
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return { ...meta, dir, contentDir: path.join(dir, 'content') };
}

export function listBackups({ paths }) {
  let entries;
  try {
    entries = fs.readdirSync(paths.backupsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readBackup({ paths, key: entry.name }))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** 保留最近 N 代 + 总量上限，超出按最旧清理。 */
export function pruneBackups({ paths, keep = KEEP_GENERATIONS, maxBytes = MAX_BYTES }) {
  const backups = listBackups({ paths });
  let total = backups.reduce((sum, item) => sum + dirSize(item.dir), 0);
  backups.forEach((item, index) => {
    const tooMany = index >= keep;
    const tooBig = total > maxBytes;
    if (!tooMany && !tooBig) return;
    const size = dirSize(item.dir);
    fs.rmSync(item.dir, { recursive: true, force: true });
    total -= size;
  });
}

/** 回收站：删除前的快照，保留 7 天。 */
export function trashSkill({ paths, skill, fromDir, hash = null }) {
  const key = newKey(skill);
  const target = path.join(paths.trashDir, key);
  copyTree(fromDir, path.join(target, 'content'));
  const meta = {
    key,
    skill,
    hash,
    from: fromDir,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  };
  fs.writeFileSync(path.join(target, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return { key, dir: target, ...meta };
}

export function listTrash({ paths }) {
  let entries;
  try {
    entries = fs.readdirSync(paths.trashDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const now = Date.now();
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = path.join(paths.trashDir, entry.name, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        return { ...meta, dir: path.join(paths.trashDir, entry.name), expired: Date.parse(meta.expiresAt) < now };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function pruneTrash({ paths }) {
  for (const item of listTrash({ paths })) {
    if (item.expired) fs.rmSync(item.dir, { recursive: true, force: true });
  }
}

/** 把备份内容换回 canonical（先删再拷，保持原子性由调用方的 add/校验兜底）。 */
export function restoreBackup({ backup, toDir }) {
  fs.rmSync(toDir, { recursive: true, force: true });
  copyTree(backup.contentDir, toDir);
  return { restored: true, toDir };
}

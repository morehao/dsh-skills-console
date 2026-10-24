import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * v3 skill lock（`~/.agents/.skill-lock.json`，或 XDG_STATE_HOME 下）的**唯一写入者**。
 *
 * 兼容目标（与 `skills` CLI 落盘格式一致）：
 * - `version` 必须恰好是 3；>3 视为不认识的新版本，只读并抛 `lock-unsupported`，绝不覆盖。
 * - JSON 损坏同样抛错；宁可写失败，也不拿空账覆盖用户的 lock。
 * - 顶层未知字段、每个技能条目的未知字段、`dismissed` 全部原样保留，只动调用方明确要动的键。
 * - 写入：同目录临时文件 → fsync → rename；写前留 `.bak`；rename 失败时原文件不会被截断。
 * - `expectedDigest` 用来防止覆盖外部 CLI 刚写入的内容：写前重算，不一致就报冲突。
 *
 * 语义边界：只负责文件一致性，不判断技能是否该装、不碰 canonical；事务边界由 installer 负责。
 */

export const LOCK_VERSION = 3;

const SOURCE_TYPES = new Set(['github', 'local', 'download']);
const TREE_SHA_RE = /^[0-9a-f]{40}$/;
const CONTENT_SHA_RE = /^[0-9a-f]{64}$/;

export class LockError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'LockError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function lockDigest(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * 读 lock 用于写。返回 `{ present, raw, digest, data }`；
 * 文件不存在返回 `present:false`（调用方创建空账）；其余异常一律抛 LockError。
 */
export function readLockFile(lockPath) {
  if (typeof lockPath !== 'string' || lockPath.length === 0) {
    throw new LockError('lock-invalid', 'readLockFile 需要 lock 路径');
  }
  let raw;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { present: false, raw: null, digest: null, data: null };
    }
    throw new LockError('lock-unreadable', `无法读取 lock: ${error.message}`, { cause: error });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new LockError('lock-corrupt', `lock 不是合法 JSON: ${error.message}`, { cause: error });
  }
  if (!isPlainObject(data)) throw new LockError('lock-corrupt', 'lock 顶层不是对象');
  if (typeof data.version !== 'number' || !Number.isInteger(data.version)) {
    throw new LockError('lock-corrupt', 'lock.version 缺失或不是整数');
  }
  if (data.version !== LOCK_VERSION) {
    throw new LockError(
      'lock-unsupported',
      `lock.version ${data.version} 不是可写的 v${LOCK_VERSION}，拒绝覆盖`,
      { version: data.version },
    );
  }
  if (!isPlainObject(data.skills)) throw new LockError('lock-corrupt', 'lock.skills 缺失或不是对象');
  if (data.dismissed !== undefined && !isPlainObject(data.dismissed)) {
    throw new LockError('lock-corrupt', 'lock.dismissed 不是对象');
  }
  return { present: true, raw, digest: lockDigest(raw), data };
}

function emptyLock() {
  return { version: LOCK_VERSION, skills: {}, dismissed: {} };
}

function assertLockShape(data) {
  if (!isPlainObject(data)) throw new LockError('lock-invalid', '写回的 lock 不是对象');
  if (data.version !== LOCK_VERSION) {
    throw new LockError('lock-invalid', `写回的 lock.version 必须是 ${LOCK_VERSION}`);
  }
  if (!isPlainObject(data.skills)) throw new LockError('lock-invalid', '写回的 lock.skills 不是对象');
  if (data.dismissed !== undefined && !isPlainObject(data.dismissed)) {
    throw new LockError('lock-invalid', '写回的 lock.dismissed 不是对象');
  }
}

function atomicWrite(target, text) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o644);
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, target);
  } catch (error) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // 已经关掉就算了，别覆盖原始错误
      }
    }
    fs.rmSync(tmp, { force: true });
    throw new LockError('lock-write-failed', `写 lock 失败: ${error.message}`, { cause: error });
  }
}

/**
 * 读改写 lock。`mutate(draft)` 直接改 draft（同步）；返回 `{ data, digest, changed, backup }`。
 *
 * - `expectedDigest` 传 `null` 表示“写之前必须不存在”；传字符串表示必须等于当前内容摘要；
 *   不传则不校验。
 * - 内容没变化时不落盘（不产生 `.bak`、不更新时间戳）。
 */
export function updateLock({ lockPath, mutate, expectedDigest } = {}) {
  if (typeof mutate !== 'function') {
    throw new LockError('lock-invalid', 'updateLock 需要 mutate 函数');
  }
  const current = readLockFile(lockPath);
  if (expectedDigest !== undefined && current.digest !== expectedDigest) {
    throw new LockError('lock-conflict', 'lock 在本次操作期间被其他进程修改，拒绝覆盖', {
      expectedDigest,
      actualDigest: current.digest,
    });
  }

  const draft = current.present ? structuredClone(current.data) : emptyLock();
  const result = mutate(draft);
  const next = result === undefined ? draft : result;
  assertLockShape(next);

  const text = `${JSON.stringify(next, null, 2)}\n`;
  if (current.present && text === current.raw) {
    return { data: next, digest: current.digest, changed: false, backup: null };
  }

  let backup = null;
  if (current.present) {
    backup = `${lockPath}.bak`;
    try {
      fs.writeFileSync(backup, current.raw, { encoding: 'utf8', mode: 0o644 });
    } catch (error) {
      throw new LockError('lock-write-failed', `备份 lock 失败: ${error.message}`, { cause: error });
    }
  }
  atomicWrite(lockPath, text);
  return { data: next, digest: lockDigest(text), changed: true, backup };
}

const KNOWN_ENTRY_KEYS = new Set([
  'source',
  'sourceType',
  'sourceUrl',
  'ref',
  'skillPath',
  'skillFolderHash',
  'installedAt',
  'updatedAt',
]);

/**
 * 新旧条目合并：已知字段以新条目为准（新条目没有 `ref` 就删掉旧的），
 * 未知字段原样保留 —— 与 CLI 的“不重建整个对象”语义一致，未来 CLI 加字段不会被我们抹掉。
 */
function mergeLockEntry(previous, entry) {
  if (!isPlainObject(previous)) return entry;
  const merged = {};
  for (const [key, value] of Object.entries(previous)) {
    if (!KNOWN_ENTRY_KEYS.has(key)) merged[key] = value;
  }
  return { ...merged, ...entry };
}

/** 安装/更新后写入一个技能条目；`entry` 由 makeLockEntry 或调用方按 CLI 形状构造。 */
export function upsertSkill({ lockPath, name, entry, expectedDigest } = {}) {
  assertSkillName(name);
  assertLockEntry(name, entry);
  return updateLock({
    lockPath,
    expectedDigest,
    mutate: (draft) => {
      draft.skills[name] = mergeLockEntry(draft.skills[name], entry);
    },
  });
}

/** 删除一个技能条目；条目本就不存在时视为成功（changed:false）。 */
export function removeSkill({ lockPath, name, expectedDigest } = {}) {
  assertSkillName(name);
  return updateLock({
    lockPath,
    expectedDigest,
    mutate: (draft) => {
      delete draft.skills[name];
    },
  });
}

function assertSkillName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new LockError('lock-invalid', '技能名必须是非空字符串');
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new LockError('lock-invalid', `技能名不能含路径分隔符: ${name}`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new LockError('lock-invalid', `技能名不能含控制字符: ${JSON.stringify(name)}`);
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

/**
 * 校验一条 lock 条目。允许 40 位 tree SHA 或旧数据的 64 位内容 hash，
 * 但 `makeLockEntry` 只产出 40 位 —— 新安装绝不用内容 hash 冒充 tree SHA。
 */
export function assertLockEntry(name, entry) {
  const fail = (message) => {
    throw new LockError('lock-invalid', `${name}: ${message}`);
  };
  if (!isPlainObject(entry)) fail('条目不是对象');
  if (typeof entry.source !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(entry.source)) {
    fail('source 不是 owner/repo');
  }
  if (!SOURCE_TYPES.has(entry.sourceType)) fail(`sourceType 不认识: ${entry.sourceType}`);
  if (typeof entry.sourceUrl !== 'string' || !entry.sourceUrl.startsWith('https://')) {
    fail('sourceUrl 必须是 https URL');
  }
  if (typeof entry.skillPath !== 'string' || entry.skillPath.length === 0) fail('skillPath 缺失');
  if (
    entry.skillPath.startsWith('/') ||
    entry.skillPath.includes('\\') ||
    entry.skillPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail(`skillPath 不是安全的 POSIX 相对路径: ${entry.skillPath}`);
  }
  if (!entry.skillPath.endsWith('.md')) fail('skillPath 应指向 .md 文件');
  if (typeof entry.skillFolderHash !== 'string') fail('skillFolderHash 缺失');
  if (!TREE_SHA_RE.test(entry.skillFolderHash) && !CONTENT_SHA_RE.test(entry.skillFolderHash)) {
    fail('skillFolderHash 既不是 40 位 tree SHA 也不是 64 位内容 hash');
  }
  if (!isIsoDate(entry.installedAt)) fail('installedAt 不是 ISO 时间');
  if (!isIsoDate(entry.updatedAt)) fail('updatedAt 不是 ISO 时间');
  if (entry.ref !== undefined && entry.ref !== null) {
    if (typeof entry.ref !== 'string' || entry.ref.length === 0 || entry.ref.length > 200) {
      fail('ref 不是合法字符串');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(entry.ref) || entry.ref.includes('..')) fail(`ref 含非法字符: ${entry.ref}`);
  }
  return entry;
}

/**
 * 按 CLI 落盘形状构造条目（键顺序照 skills@1.7.4：source / sourceType / sourceUrl /
 * [ref] / skillPath / skillFolderHash / installedAt / updatedAt）。
 * `ref` 为空时直接省略（CLI 对默认分支安装就是这么写的）。
 */
export function makeLockEntry({
  source,
  ref = null,
  skillPath,
  treeSha,
  installedAt,
  updatedAt,
  now = new Date(),
} = {}) {
  const normalized = typeof source === 'string' ? source.trim().replace(/\.git$/, '') : source;
  if (typeof normalized !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(normalized)) {
    throw new LockError('lock-invalid', `source 必须是 owner/repo: ${source}`);
  }
  if (typeof treeSha !== 'string' || !TREE_SHA_RE.test(treeSha)) {
    throw new LockError('lock-invalid', `treeSha 必须是 40 位小写 hex: ${treeSha}`);
  }
  const stamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const entry = {
    source: normalized,
    sourceType: 'github',
    sourceUrl: `https://github.com/${normalized}.git`,
  };
  if (ref !== null && ref !== undefined) entry.ref = ref;
  entry.skillPath = skillPath;
  entry.skillFolderHash = treeSha;
  entry.installedAt = installedAt === undefined ? stamp : installedAt;
  entry.updatedAt = updatedAt === undefined ? stamp : updatedAt;
  assertLockEntry(source, entry);
  return entry;
}

import fs from 'node:fs';
import path from 'node:path';

import { INTRO_STORE_VERSION } from './intro.js';

/**
 * 技能介绍缓存（`<stateDir>/intros.json`）。
 *
 * 与 `state.json` 的区别：这是**可丢缓存**，不是权威状态。
 * - 坏 JSON / 未知版本 → 当成空表，绝不让控制台进只读模式；
 * - 写失败只记日志，本次请求仍然把文本返回给用户；
 * - 不做版本迁移，格式变了直接重建（v2 起是「能力介绍」语义，v1 的旧简介会被丢弃）。
 */

const MAX_ITEMS = 500;
const MAX_TEXT_CHARS = 4_096;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeEntry(entry) {
  if (!isPlainObject(entry)) return null;
  if (typeof entry.hash !== 'string' || !entry.hash) return null;
  if (typeof entry.text !== 'string' || !entry.text) return null;
  return {
    hash: entry.hash,
    text: entry.text.slice(0, MAX_TEXT_CHARS),
    provider: typeof entry.provider === 'string' ? entry.provider : null,
    model: typeof entry.model === 'string' ? entry.model : null,
    generatedAt: typeof entry.generatedAt === 'string' ? entry.generatedAt : new Date().toISOString(),
    usage: isPlainObject(entry.usage) ? entry.usage : null,
    inputBytes: Number.isFinite(entry.inputBytes) ? entry.inputBytes : null,
    truncated: Boolean(entry.truncated),
    sourceBytes: Number.isFinite(entry.sourceBytes) ? entry.sourceBytes : null,
  };
}

export function createIntroStore({ paths, logger = () => {} }) {
  const file = paths.introFile;
  let data = null;
  let problem = null;

  function empty() {
    return { version: INTRO_STORE_VERSION, items: {} };
  }

  function load() {
    if (data) return data;
    data = empty();
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        problem = error.message;
        logger('intro.cache.read.failed', { message: error.message });
      }
      return data;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || parsed.version !== INTRO_STORE_VERSION) {
        throw new Error(`unsupported intro cache version: ${parsed?.version ?? 'missing'}`);
      }
      const items = {};
      for (const [name, langs] of Object.entries(isPlainObject(parsed.items) ? parsed.items : {})) {
        if (!isPlainObject(langs)) continue;
        for (const [lang, entry] of Object.entries(langs)) {
          const clean = sanitizeEntry(entry);
          if (!clean) continue;
          if (!items[name]) items[name] = {};
          items[name][lang] = clean;
        }
      }
      data = { version: INTRO_STORE_VERSION, items };
    } catch (error) {
      problem = error.message;
      logger('intro.cache.invalid', { message: error.message });
      data = empty();
    }
    return data;
  }

  function count(items) {
    let total = 0;
    for (const langs of Object.values(items)) total += Object.keys(langs).length;
    return total;
  }

  /** 超出上限时按生成时间淘汰最旧的条目（缓存可以随时没有）。 */
  function prune(items) {
    if (count(items) <= MAX_ITEMS) return items;
    const rows = [];
    for (const [name, langs] of Object.entries(items)) {
      for (const [lang, entry] of Object.entries(langs)) {
        rows.push({ name, lang, at: Date.parse(entry.generatedAt) || 0 });
      }
    }
    rows.sort((a, b) => a.at - b.at);
    for (const row of rows.slice(0, Math.max(0, rows.length - MAX_ITEMS))) {
      delete items[row.name][row.lang];
      if (Object.keys(items[row.name]).length === 0) delete items[row.name];
    }
    return items;
  }

  function write() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = path.join(path.dirname(file), `.intros.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, `${JSON.stringify(load(), null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, file);
      return true;
    } catch (error) {
      problem = error.message;
      logger('intro.cache.write.failed', { message: error.message });
      return false;
    }
  }

  return {
    file,
    get problem() {
      return problem;
    },
    load,
    /** 读一条缓存；没有就是 null。返回浅拷贝，调用方改不坏内存表。 */
    get(name, lang) {
      const entry = load().items[name]?.[lang];
      return entry ? { ...entry } : null;
    },
    /** 写一条缓存；写盘失败不影响返回值（介绍已经拿到了）。 */
    put(name, lang, entry) {
      const clean = sanitizeEntry(entry);
      if (!clean) return null;
      const items = load().items;
      if (!items[name]) items[name] = {};
      items[name][lang] = clean;
      prune(items);
      write();
      return { ...clean };
    },
    remove(name, lang) {
      const items = load().items;
      if (!items[name]?.[lang]) return false;
      delete items[name][lang];
      if (Object.keys(items[name]).length === 0) delete items[name];
      write();
      return true;
    },
    size() {
      return count(load().items);
    },
  };
}

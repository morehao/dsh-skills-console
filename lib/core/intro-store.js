import fs from 'node:fs';

import { writeFileAtomicSync } from './fs-atomic.js';
import { INTRO_STORE_VERSION } from './intro.js';

/**
 * 技能介绍缓存（`<stateDir>/intros.json`）。
 *
 * 与 `state.json` 的区别：这是**可丢缓存**，不是权威状态。
 * - 坏 JSON / 未知版本 → 当成空表，绝不让控制台进只读模式；
 * - 写失败只记日志，本次请求仍然把文本返回给用户；
 * - 不做版本迁移，格式变了直接重建（v3 起简介必须写清触发方式 / 触发关键词，v2 的旧条目会被丢弃）。
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
    maxTokens: Number.isFinite(entry.maxTokens) ? entry.maxTokens : null,
    finish: typeof entry.finish === 'string' ? entry.finish : 'stop',
  };
}

export function createIntroStore({ paths, logger = () => {} }) {
  const file = paths.introFile;
  // v0.5.8 及更早版本的缓存在 stateDir 下；新版只把旧位置当只读回退（读旧、写新），
  // 下一次生成自然迁移到 `$DSH_HOME/cache/skills-console/intros.json`。
  const legacyFiles = (Array.isArray(paths.introLegacyFiles) ? paths.introLegacyFiles : []).filter(
    (item) => typeof item === 'string' && item && item !== file,
  );
  let data = null;
  let problem = null;

  function empty() {
    return { version: INTRO_STORE_VERSION, items: {} };
  }

  function parse(raw) {
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
    return { version: INTRO_STORE_VERSION, items };
  }

  function load() {
    if (data) return data;
    data = empty();
    // 主位置缺失（不包括「存在但坏了」）才看旧位置：坏缓存按空表重建，不回退到旧文件。
    const candidates = [file, ...legacyFiles];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      let raw;
      try {
        raw = fs.readFileSync(candidate, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') continue; // 主位置不存在才回退旧位置
        problem = error.message;
        logger('intro.cache.read.failed', { file: candidate, message: error.message });
        if (index === 0) return data; // 主位置读不了（权限等）：不当成缺失，避免误用旧缓存
        continue;
      }
      try {
        data = parse(raw);
        if (index > 0) logger('intro.cache.legacy.loaded', { file: candidate });
      } catch (error) {
        problem = error.message;
        logger('intro.cache.invalid', { file: candidate, message: error.message });
        data = empty();
      }
      return data;
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
      writeFileAtomicSync(file, `${JSON.stringify(load(), null, 2)}\n`);
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
    /** 读一条缓存；没有就是 null。只有 `finish: stop` 的完整简介才会被返回。 */
    get(name, lang) {
      const entry = load().items[name]?.[lang];
      if (!entry || entry.finish !== 'stop') return null;
      return { ...entry };
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

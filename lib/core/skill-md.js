import fs from 'node:fs';
import path from 'node:path';

/**
 * SKILL.md 的极简 frontmatter 解析：取安装与清单需要的 `name` / `description`，
 * 以及宿主用来决定「模型/用户能不能调用」的 `disable-model-invocation` / `user-invocable`，
 * 不引入 YAML 依赖。支持 `|` / `>` 块与单/双引号，解析失败按“没有 frontmatter”处理。
 *
 * Service（探测补名）、Installer（落盘发现）、roots（扫描可见性）与 policy provider
 * 共用同一份实现，避免规则漂移。
 */
const STRING_FIELDS = new Set(['name', 'description']);
const BOOLEAN_FIELDS = new Set(['disable-model-invocation', 'user-invocable']);

export function parseSkillFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(String(text || ''));
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const fields = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || /^\s/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    if (!STRING_FIELDS.has(key) && !BOOLEAN_FIELDS.has(key)) continue;
    let value = line.slice(colon + 1).trim();
    const block = /^([|>])[+-]?$/.exec(value);
    if (block) {
      const folded = block[1] === '>';
      const rows = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        rows.push(lines[index + 1].replace(/^\s+/, ''));
        index += 1;
      }
      value = folded ? rows.join(' ') : rows.join('\n');
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
    value = value.trim();
    if (BOOLEAN_FIELDS.has(key)) fields[key] = value === 'true' ? true : value === 'false' ? false : value;
    else fields[key] = value;
  }
  return fields;
}

/** 读取某目录下的 SKILL.md frontmatter；读不到或解析不出就返回空对象。 */
export function readSkillFrontmatter(skillDir) {
  try {
    return parseSkillFrontmatter(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 读一份 SKILL.md：frontmatter 字段 + 去掉 frontmatter 的正文。
 * 供 policy provider 的 `get` 使用；读不到就抛（调用方决定 fail-open 还是报错）。
 */
export function readSkillDocument(skillFile) {
  const text = fs.readFileSync(skillFile, 'utf8');
  const fields = parseSkillFrontmatter(text);
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  const body = match ? text.slice(match[0].length) : text;
  return { fields, body, text };
}

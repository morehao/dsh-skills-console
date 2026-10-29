import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * SKILL.md frontmatter 解析。
 *
 * 解析器与宿主 `@deepseek-ai/dsh-skill-filesystem` 对齐：使用同一个 `yaml` 库
 * （DSH 也是 `yaml` 的 `parse()`），而不是自己写 YAML 子集；调用策略字段的语义
 * （`disable-model-invocation` / `user-invocable`，含 DSH 对旧字段名的拒绝）也按
 * 宿主 `parseInvocationPolicy` 的口径实现。
 *
 * Service（探测补名）、Installer（落盘发现）、roots（扫描可见性）与 policy provider
 * 共用这一份实现，避免规则漂移。
 *
 * 为什么不用 `FileSystemSkillProvider` 直接解析：它的 `list()` 是异步的，而清单/可见性
 * 是同步热路径；并且它会把候选 `path` 解析成 realpath，与插件大量使用的 raw path
 * 比较（policyHiddenPaths / canonical 命中判定）不一致。因此这里只复用 DSH 的
 * **名规则（`isSkillName`）与 YAML 解析器**，字段到 `invocation` 的映射按宿主源码。
 */

/** `---` 包裹的 frontmatter 原文（不含首尾分隔线）；没有则 null。 */
function frontmatterBody(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(String(text || ''));
  return match ? match[1] : null;
}

/**
 * 解析 frontmatter，返回 YAML 对象；没有 frontmatter / 非法 YAML 一律返回 `{}`。
 * 保留全部字段（供调用策略判定读取与旧字段拒绝）。
 */
export function parseSkillFrontmatter(text) {
  const body = frontmatterBody(text);
  if (body === null) return {};
  let parsed;
  try {
    parsed = parseYaml(body);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  // 折叠块（`>`）默认带尾换行；description 只用于展示，统一去掉首尾空白。
  if (typeof parsed.description === 'string') parsed.description = parsed.description.trim();
  return parsed;
}

const LEGACY_INVOCATION_KEYS = {
  disableModelInvocation: 'disable-model-invocation',
  modelInvocable: 'disable-model-invocation',
  userInvocable: 'user-invocable',
};

/** YAML 标量 → 布尔，规则同宿主 `frontmatterBoolean`。 */
function frontmatterBoolean(data, key) {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true;
      case 'false':
      case 'no':
      case 'off':
        return false;
      default:
        break;
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}

/**
 * 按宿主 `parseInvocationPolicy` 的口径解析调用策略。
 * - 旧字段名（`disableModelInvocation` / `modelInvocable` / `userInvocable`）直接抛错，
 *   与宿主一致（宿主遇到会忽略该技能）；
 * - `disable-model-invocation: true` → 模型不可调用；`user-invocable: false` → 用户不可调用。
 * @returns {{modelInvocable: boolean, userInvocable: boolean}}
 */
export function resolveInvocation(data = {}) {
  for (const [legacy, canonical] of Object.entries(LEGACY_INVOCATION_KEYS)) {
    if (Object.hasOwn(data, legacy)) {
      throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
    }
  }
  const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation');
  const userInvocable = frontmatterBoolean(data, 'user-invocable');
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  };
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从 skills CLI 的 dist/cli.mjs 生成 agent 目录表。
 *
 * 只收「有独立全局目录」的 agent：
 * - 全局目录 = `~/.agents/skills`（canonical 本身）的条目不收，它们本来就看得见 canonical；
 * - 只有项目目录、没有全局目录的条目不收（如 eve / promptscript）；
 * - `~/.config/...` 走 configHome，尊重 XDG_CONFIG_HOME（如 opencode / amp）。
 *
 * 另外记录 `universal`：上游 `skillsDir === '.agents/skills'` 的条目自己也读共享根
 * （`getUniversalAgents()` 的口径），对这类 agent 建导出链是多余的。这一位以前被
 * 丢掉了，是本插件「有私有目录 = 不读共享根」误判的根源。
 *
 * 输入可以是上游的 `dist/cli.mjs`，也可以是 `src/agents.ts`：解析用花括号配平，
 * 两种缩进都吃得下。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/sync-agent-table.mjs <skills-dist/cli.mjs> [output]');
  process.exit(1);
}
const output = process.argv[3] || path.join(here, '..', 'agent-table.json');
const src = fs.readFileSync(source, 'utf8');

// 解析 `const xxxHome = process.env.XXX?.trim() || join(home, ".xxx");` 这类别名
const aliases = { home: ['home', ''], configHome: ['config', ''] };
for (const match of src.matchAll(
  /const\s+(\w+)\s*=\s*process\.env\.[A-Z0-9_]+(?:\?\.trim\(\))?\s*\|\|\s*join\(([^)]*)\);/g,
)) {
  const [, name, inner] = match;
  const resolved = parseJoin(inner);
  if (resolved) aliases[name] = resolved;
}

function splitArgs(inner) {
  return inner.split(',').map((part) => part.trim());
}

function parseJoin(inner) {
  const args = splitArgs(inner);
  const base = args[0];
  if (!aliases[base]) return null;
  const segments = [];
  for (const arg of args.slice(1)) {
    const quoted = arg.match(/^['"]([^'"]+)['"]$/);
    if (!quoted) return null;
    segments.push(quoted[1]);
  }
  let [kind, prefix] = aliases[base];
  let dir = [prefix, ...segments].filter(Boolean).join('/').replace(/\/+/g, '/');
  // 个别条目写成 join(home, ".config", ...)，等价于 configHome
  if (kind === 'home' && dir.startsWith('.config/')) {
    kind = 'config';
    dir = dir.slice('.config/'.length);
  }
  return [kind, dir];
}

// openclaw 的全局目录是按 .openclaw / .clawdbot / .moltbot 顺序探测的函数，这里取默认值
const SPECIAL = {
  openclaw: ['home', '.openclaw/skills'],
};

// `const agents = {`（dist）与 `export const agents: Record<...> = {`（src）都认
const declaration = src.match(/(?:export\s+)?const\s+agents\b[^=]*=\s*\{/);
if (!declaration) {
  console.error('没找到 agents 声明：输入既不是 dist/cli.mjs 也不是 src/agents.ts？');
  process.exit(1);
}
const parts = sliceObjectBody(src, declaration.index + declaration[0].length - 1);

/**
 * 从 `{` 开始按花括号配平，按顶层逗号切出每个 `key: { ... }`。
 * 比正则稳：条目里有嵌套对象（detectInstalled 里没有，但用 type 对象的地方有）也不会切错。
 */
function sliceObjectBody(text, openIndex) {
  const parts = [];
  let depth = 0;
  let current = '';
  let quote = null;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += text[i + 1] ?? '';
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    // 注释里的引号和反引号不能当成字符串开头（上游注释里就有 `` `remove` ``）
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl - 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      if (depth === 1) continue; // 最外层的 `{`
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) {
        if (current.trim()) parts.push(current);
        return parts;
      }
    } else if (ch === ',' && depth === 1) {
      // 条目之间的分隔逗号：只有 depth 1 才是顶层
      if (current.trim()) parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  throw new Error('花括号没有配平');
}

const entries = [];
for (const part of parts) {
  const head = part.match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_$-]+))\s*:/);
  if (!head) continue;
  const key = head[1] || head[2] || head[3];
  if (!key || key === 'universal') continue;
  const name = (part.match(/displayName:\s*['"]([^'"]+)['"]/) || [])[1] || key;
  const universal = /skillsDir:\s*['"]\.agents\/skills['"]/.test(part);

  let resolved = SPECIAL[key] || null;
  if (!resolved) {
    const expr = part.match(/globalSkillsDir:\s*(join\([^)]*\))/);
    if (!expr) continue; // 没有全局目录（project-only）或动态目录
    resolved = parseJoin(expr[1].slice('join('.length, -1));
  }
  if (!resolved) continue;
  const [kind, dir] = resolved;
  if (!dir) continue;
  if (kind === 'home' && dir === '.agents/skills') continue; // canonical 本身
  entries.push({ key, name, dir, ...(kind === 'config' ? { base: 'config' } : {}), universal });
}

// 多个 agent 指向同一目录时只保留一个（registry 也会按目录去重）
const seen = new Map();
for (const entry of entries.sort((a, b) => a.key.localeCompare(b.key))) {
  const dir = `${entry.base || 'home'}:${entry.dir}`;
  if (seen.has(dir)) continue;
  seen.set(dir, entry);
}
const out = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));

const universalCount = out.filter((entry) => entry.universal).length;
const sourceLabel = /src\/agents\.ts|agents\.ts$/.test(source)
  ? 'skills CLI agents table (src/agents.ts)'
  : 'skills CLI agents table';
fs.writeFileSync(output, `${JSON.stringify({ source: sourceLabel, entries: out }, null, 2)}\n`);
console.log(
  `${out.length} agents (${universalCount} universal → 读共享根，不必导出); ` +
    `sample: ${out.slice(0, 8).map((entry) => `${entry.key}→${entry.dir}${entry.universal ? '*' : ''}`).join(', ')}`,
);

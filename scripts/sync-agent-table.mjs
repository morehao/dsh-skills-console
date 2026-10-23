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

const start = src.indexOf('const agents = {');
const end = src.indexOf('\n};', start);
const body = src.slice(start, end);
const entries = [];
for (const match of body.matchAll(/(?:\n\t"([^"]+)"|\n\t([A-Za-z0-9_-]+)):\s*\{([\s\S]*?)\n\t\}/g)) {
  const key = match[1] || match[2];
  if (key === 'universal') continue;
  const block = match[3];
  const name = (block.match(/displayName:\s*['"]([^'"]+)['"]/) || [])[1] || key;

  let resolved = SPECIAL[key] || null;
  if (!resolved) {
    const expr = block.match(/globalSkillsDir:\s*(join\([^)]*\))/);
    if (!expr) continue; // 没有全局目录（project-only）或动态目录
    resolved = parseJoin(expr[1].slice('join('.length, -1));
  }
  if (!resolved) continue;
  const [kind, dir] = resolved;
  if (!dir) continue;
  if (kind === 'home' && dir === '.agents/skills') continue; // canonical 本身
  entries.push({ key, name, dir, ...(kind === 'config' ? { base: 'config' } : {}) });
}

// 多个 agent 指向同一目录时只保留一个（registry 也会按目录去重）
const seen = new Map();
for (const entry of entries.sort((a, b) => a.key.localeCompare(b.key))) {
  const dir = `${entry.base || 'home'}:${entry.dir}`;
  if (seen.has(dir)) continue;
  seen.set(dir, entry);
}
const out = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));

fs.writeFileSync(output, `${JSON.stringify({ source: 'skills CLI agents table', entries: out }, null, 2)}\n`);
console.log(`${out.length} agents; sample: ${out.slice(0, 12).map((entry) => `${entry.key}→${entry.dir}`).join(', ')}`);

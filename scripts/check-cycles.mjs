#!/usr/bin/env node
/**
 * 静态 import 图循环检测：`client/` 与 `lib/` 内的相对 import 不允许成环。
 *
 * 不执行模块：按正则提取 import / export-from / 动态 import，只解析相对路径；
 * `node:*`、`react` 这类外部模块直接忽略。ESM 的循环依赖不会在加载时报错，
 * 但会把「谁初始化了谁」变成运行时顺序问题，所以放在机械校验里拦住。
 *
 *   node scripts/check-cycles.mjs          检测并打印结果，有环 / 相对路径解析不到时 exit 1
 *   node scripts/check-cycles.mjs --json   输出机器可读结果（调试用例用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 参与检测的源码目录（test/、scripts/ 不在此列）。 */
export const WATCHED_DIRS = ['client', 'lib'];

// `import x from '…'` / `import '…'` / `export … from '…'` / `import('…')`。
// `[^;'"]*?` 允许具名 import 换行，同时不会跨过引号或分号跑到下一条语句。
const STATIC_FROM = /(?:^|\n)\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** 去掉注释，避免示例代码里的 `from './x.js'` 被当成真实依赖。 */
export function stripComments(source) {
  return String(source ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 提取一个模块里出现的所有模块说明符（保序去重，不区分类别）。 */
export function parseImports(source) {
  const text = stripComments(source);
  const found = [];
  for (const pattern of [STATIC_FROM, BARE_IMPORT, DYNAMIC_IMPORT]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) found.push(match[1]);
  }
  return [...new Set(found)];
}

/** 目录内所有 `.js` 文件（绝对路径，递归）。 */
export function collectModules(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files.sort();
}

/** 只解析相对说明符；`node:*`、`react`、包名一律忽略（返回 null）。 */
export function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = path.extname(base) ? [base] : [base, `${base}.js`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/**
 * 建图：绝对路径 → 依赖的绝对路径列表。
 * `unresolved` 收集「相对路径写了但文件不存在」的情况——构建也会在这里失败，一并报出来。
 */
export function buildGraph(files) {
  const graph = new Map();
  const unresolved = [];
  for (const file of files) {
    const deps = [];
    for (const specifier of parseImports(fs.readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveSpecifier(file, specifier);
      if (resolved) deps.push(resolved);
      else unresolved.push({ from: file, specifier });
    }
    graph.set(file, deps);
  }
  return { graph, unresolved };
}

/**
 * Tarjan 强连通分量：每个 size > 1 的分量就是一个循环依赖；
 * 自引用（文件 import 自己）同样算一个。
 */
export function findCycles(graph) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowlinks = new Map();
  const cycles = [];

  const visit = (node) => {
    indices.set(node, index);
    lowlinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const dep of graph.get(node) || []) {
      if (!graph.has(dep)) continue; // 目录外的引用不参与
      if (!indices.has(dep)) {
        visit(dep);
        lowlinks.set(node, Math.min(lowlinks.get(node), lowlinks.get(dep)));
      } else if (onStack.has(dep)) {
        lowlinks.set(node, Math.min(lowlinks.get(node), indices.get(dep)));
      }
    }

    if (lowlinks.get(node) !== indices.get(node)) return;
    const component = [];
    let member = null;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    const isSelfLoop = component.length === 1 && (graph.get(node) || []).includes(node);
    if (component.length > 1 || isSelfLoop) cycles.push(component.reverse());
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) visit(node);
  }
  return cycles;
}

/** 相对根目录的展示路径（test / CLI 输出共用）。 */
export function displayPath(file, root = ROOT) {
  return path.relative(root, file).split(path.sep).join('/');
}

function main() {
  const json = process.argv.includes('--json');
  const files = WATCHED_DIRS.flatMap((dir) => collectModules(path.join(ROOT, dir)));
  const { graph, unresolved } = buildGraph(files);
  const cycles = findCycles(graph);

  if (json) {
    console.log(JSON.stringify({
      modules: files.length,
      cycles: cycles.map((component) => component.map((file) => displayPath(file))),
      unresolved: unresolved.map((item) => ({ from: displayPath(item.from), specifier: item.specifier })),
    }, null, 2));
  }

  if (unresolved.length > 0) {
    console.error(`✖ ${unresolved.length} 个相对 import 解析不到文件：`);
    for (const item of unresolved) console.error(`  ${displayPath(item.from)} → ${item.specifier}`);
  }
  if (cycles.length > 0) {
    console.error(`✖ 发现 ${cycles.length} 处循环依赖：`);
    for (const component of cycles) {
      const names = component.map((file) => displayPath(file));
      console.error(`  ${names.join(' → ')} → ${names[0]}`);
    }
  }
  if (unresolved.length > 0 || cycles.length > 0) {
    process.exitCode = 1;
    return;
  }
  if (!json) {
    const clientCount = files.filter((file) => displayPath(file).startsWith('client/')).length;
    const libCount = files.length - clientCount;
    console.log(`✔ 无循环依赖（client ${clientCount} 个模块 / lib ${libCount} 个模块）`);
  }
}

// 只作为脚本运行时才执行检测；被 test import 时只提供纯函数。
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();

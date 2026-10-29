#!/usr/bin/env node
/**
 * Host 构建：tsc 把 lib/ 编译到 dist/（1:1 保结构），并复制运行时 JSON 资产。
 *
 *   node scripts/build-host.mjs            重建 dist/（先清空，避免残留已删模块的产物）
 *   node scripts/build-host.mjs --check    编译到临时目录，与 dist/ 逐文件逐字节比对
 *   node scripts/build-host.mjs --watch    tsc --watch 持续写 dist/（资产启动时复制一次）
 *
 * 为什么不用 esbuild：lib 里有 4 处按 import.meta.url 读相邻文件（agents.js 的
 * `../agent-table.json`、service.js 的 `../invocation-support.json`、plugin-update.js 的
 * `../../package.json`、routes.js 的 `../package.json`）。打成单文件会把这些相对路径解析到
 * 错误位置，所以必须保结构 emit。详见 .dsh/docs/plans 里的 TS 迁移计划 D1/D3。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const config = path.join(root, 'tsconfig.host.json');
const outDir = path.join(root, 'dist');
const ASSETS = ['agent-table.json', 'invocation-support.json'];

const argv = new Set(process.argv.slice(2));

function compile(target) {
  execFileSync(process.execPath, [tscJs, '-p', config, '--outDir', target], { cwd: root, stdio: 'inherit' });
  for (const name of ASSETS) {
    const from = path.join(root, 'lib', name);
    if (existsSync(from)) cpSync(from, path.join(target, name));
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(path.relative(dir, full));
  }
  return out.sort();
}

function compare(actualDir, expectedDir) {
  const actual = walk(actualDir);
  const expected = walk(expectedDir);
  const problems = [];
  for (const file of expected) if (!actual.includes(file)) problems.push(`dist 缺文件：${file}`);
  for (const file of actual) if (!expected.includes(file)) problems.push(`dist 多文件：${file}`);
  for (const file of expected) {
    if (!actual.includes(file)) continue;
    if (!readFileSync(path.join(actualDir, file)).equals(readFileSync(path.join(expectedDir, file)))) {
      problems.push(`内容不一致：${file}`);
    }
  }
  return problems;
}

if (argv.has('--watch')) {
  for (const name of ASSETS) {
    const from = path.join(root, 'lib', name);
    if (existsSync(from)) cpSync(from, path.join(outDir, name));
  }
  execFileSync(process.execPath, [tscJs, '-p', config, '--watch'], { cwd: root, stdio: 'inherit' });
} else if (argv.has('--check')) {
  const temp = mkdtempSync(path.join(tmpdir(), 'dshsc-dist-'));
  try {
    compile(temp);
    const problems = compare(outDir, temp);
    if (problems.length) {
      for (const line of problems) console.error(`✖ ${line}`);
      console.error(`dist 与 lib/ 不一致（${problems.length} 处）；跑 npm run build:host 重建`);
      process.exit(1);
    }
    console.log(`✔ dist 与 lib/ 一致（${walk(temp).length} 个文件）`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
} else {
  rmSync(outDir, { recursive: true, force: true });
  compile(outDir);
  console.log(`✔ 已生成 dist/（${walk(outDir).length} 个文件）`);
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildGraph, collectModules, findCycles, parseImports, resolveSpecifier } from '../scripts/check-cycles.mjs';

/** 在临时目录里铺一棵模块树，跑完即删；用例不碰真实仓库。 */
function analyze(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-cycles-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }
    const modules = collectModules(dir);
    const { graph, unresolved } = buildGraph(modules);
    const cycles = findCycles(graph).map((component) => component.map((file) => path.relative(dir, file)));
    return { cycles, unresolved };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('parseImports：静态 / 副作用 / export-from / 动态 import 都能认出来，且去重', () => {
  const source = [
    "import React from 'react';",
    "import { a } from './a.js';",
    "import './side-effect.js';",
    "export { b } from './b.js';",
    "export * from './c.js';",
    "const lazy = () => import('./d.js');",
    "import { a as again } from './a.js';",
  ].join('\n');
  assert.deepEqual(parseImports(source), ['react', './a.js', './b.js', './c.js', './side-effect.js', './d.js']);
});

test('parseImports：注释与字符串里的 from 不算依赖', () => {
  const source = [
    "// import { x } from './commented-out.js'",
    "/* export { y } from './blocked.js'; */",
    "const url = 'https://example.com/from';",
    "import { real } from './real.js';",
  ].join('\n');
  assert.deepEqual(parseImports(source), ['./real.js']);
});

test('findCycles：a ↔ b 互引报告为一个环', () => {
  const { cycles } = analyze({
    'a.js': "import { b } from './b.js';\nexport const a = 1;\n",
    'b.js': "import { a } from './a.js';\nexport const b = 1;\n",
  });
  assert.equal(cycles.length, 1);
  assert.deepEqual(new Set(cycles[0]), new Set(['a.js', 'b.js']));
});

test('findCycles：链式依赖不是环', () => {
  const { cycles } = analyze({
    'a.js': "import { b } from './b.js';\n",
    'b.js': "import { c } from './c.js';\n",
    'c.js': 'export const c = 1;\n',
  });
  assert.deepEqual(cycles, []);
});

test('findCycles：export-from 与动态 import 也会构成环', () => {
  const { cycles } = analyze({
    'a.js': "export { b } from './b.js';\n",
    'b.js': "export const lazy = () => import('./a.js');\n",
  });
  assert.equal(cycles.length, 1);
});

test('findCycles：文件 import 自己也算环', () => {
  const { cycles } = analyze({
    'a.js': "import './a.js';\n",
  });
  assert.equal(cycles.length, 1);
});

test('buildGraph：外部模块忽略，相对路径写错会进 unresolved', () => {
  const { unresolved } = analyze({
    'a.js': "import React from 'react';\nimport fs from 'node:fs';\nimport './missing.js';\n",
  });
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].specifier, './missing.js');
});

test('resolveSpecifier：TS 源码里 `./x.js` 回退到同名 .ts，`.d.ts` 也能解析', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-cycles-ts-'));
  try {
    fs.writeFileSync(path.join(dir, 'x.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(dir, 'y.d.ts'), 'export interface Y {}\n');
    fs.writeFileSync(path.join(dir, 'm.ts'), "import { a } from './x.js';\nimport type { Y } from './y.js';\n");
    const modules = collectModules(dir).map((file) => path.relative(dir, file));
    assert.deepEqual(modules, ['m.ts', 'x.ts']);
    assert.equal(path.basename(resolveSpecifier(path.join(dir, 'm.ts'), './x.js')), 'x.ts');
    assert.equal(path.basename(resolveSpecifier(path.join(dir, 'm.ts'), './y.js')), 'y.d.ts');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

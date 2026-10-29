import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

test('产物：dist 存在、可加载、导出宿主约定符号', async () => {
  const entry = path.join(ROOT, 'dist', 'index.js');
  assert.ok(fs.existsSync(entry), 'dist/index.js 缺失：先跑 npm run build');
  const mod = await import('../dist/index.js');
  assert.equal(mod.name, 'dsh-skills-console');
  assert.ok(Array.isArray(mod.inject));
  assert.equal(typeof mod.apply, 'function');
  assert.ok(mod.Config);
});

test('产物：dist 里不应有 TypeScript 源文件或缺失资产（.d.ts 声明文件除外）', () => {
  const dist = path.join(ROOT, 'dist');
  assert.ok(fs.existsSync(path.join(dist, 'agent-table.json')), 'dist 缺少 agent-table.json');
  assert.ok(fs.existsSync(path.join(dist, 'invocation-support.json')), 'dist 缺少 invocation-support.json');
  const leftovers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // `.d.ts` 是 tsc 声明产物（公共 API 需要），不算源码残留
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) leftovers.push(path.relative(ROOT, full));
    }
  };
  walk(dist);
  assert.deepEqual(leftovers, [], 'dist 里不应出现 .ts 源文件');
});

test('产物：client.js 带 ModuleLoader 外壳', () => {
  const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
  assert.match(source.slice(0, 400), /AUTO-GENERATED from client\//);
  assert.match(source, /window\.__ModuleLoader__\.load\(/);
});

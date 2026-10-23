#!/usr/bin/env node
/** 逐文件语法自检：`node --check` 只看单文件，这里把 lib/、client/ 与 scripts/ 全跑一遍。 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['lib', 'client', 'scripts', 'test'];
const files = [];
for (const root of roots) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mjs|cjs|js)$/.test(entry.name)) files.push(full);
    }
  };
  if (fs.existsSync(root)) walk(root);
}
files.push('client.js', 'lib/index.js');

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed += 1;
    console.error(`✖ ${file}\n${error.stderr?.toString() || error.message}`);
  }
}
if (failed > 0) {
  console.error(`${failed} file(s) failed`);
  process.exit(1);
}
console.log(`✔ ${files.length} files`);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('native-only：runtime 只依赖 tar，lib 不 spawn 外部进程或引用 CLI/git 模块', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies, { tar: '7.5.22' });

  const files = walk(path.join(ROOT, 'lib')).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const label = path.relative(ROOT, file);
    assert.doesNotMatch(text, /node:child_process|\bspawn\s*\(/, `${label} 不能再启动外部进程`);
    assert.doesNotMatch(text, /from ['"]\.\/(?:core\/)?(?:cli|git)\.js['"]/, `${label} 不能再引用 CLI/git 模块`);
    assert.doesNotMatch(text, /DSH_SKILLS_CONSOLE_(?:CLI|GIT|NPX_SPEC)/, `${label} 不能再读 CLI/git 环境变量`);
  }
});

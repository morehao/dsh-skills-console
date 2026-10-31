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

test('native-only：runtime 依赖最小（tar + 自更新引擎 kit），lib 不 spawn 外部进程或引用 CLI/git 模块', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // tar 仍精确锁版本，供 native installer 解压；@morehao/dsh-plugin-kit 是插件自更新引擎
  // （零 @deepseek-ai 运行时依赖，宿主能力全部注入），不再自实现自更新。除此之外不允许别的运行时依赖。
  assert.equal(pkg.dependencies?.tar, '7.5.22');
  assert.equal(pkg.dependencies?.['@morehao/dsh-plugin-kit'], '>=0.1.0 <0.2.0');
  const runtimeDeps = Object.keys(pkg.dependencies ?? {}).sort();
  assert.deepEqual(runtimeDeps, ['@morehao/dsh-plugin-kit', 'tar']);

  const files = walk(path.join(ROOT, 'lib')).filter((file) => /\.(js|ts)$/.test(file));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const label = path.relative(ROOT, file);
    assert.doesNotMatch(text, /node:child_process|\bspawn\s*\(/, `${label} 不能再启动外部进程`);
    assert.doesNotMatch(text, /from ['"]\.\/(?:core\/)?(?:cli|git)\.js['"]/, `${label} 不能再引用 CLI/git 模块`);
    assert.doesNotMatch(text, /DSH_SKILLS_CONSOLE_(?:CLI|GIT|NPX_SPEC)/, `${label} 不能再读 CLI/git 环境变量`);
  }
});

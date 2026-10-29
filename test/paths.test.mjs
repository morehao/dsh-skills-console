import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { createPaths } from '../dist/core/paths.js';

/** 锁定路径契约：默认目录、日志名、env 优先级。 */

test('默认状态目录是 $DSH_HOME/skills-console', () => {
  const paths = createPaths({ HOME: '/h', DSH_HOME: '/h/.dsh' }, {});
  const expected = path.join('/h', '.dsh', 'skills-console');
  assert.equal(paths.stateDir, expected);
  assert.equal(paths.stateFile, path.join(expected, 'state.json'));
  assert.equal(paths.backupsDir, path.join(expected, 'backups'));
  assert.equal(paths.trashDir, path.join(expected, 'trash'));
  assert.equal(paths.logFile, path.join(expected, 'dsh-skills-console.log'));
});

test('DSH_SKILLS_CONSOLE_HOME 可整体挪走状态目录', () => {
  const paths = createPaths(
    { HOME: '/h', DSH_HOME: '/h/.dsh', DSH_SKILLS_CONSOLE_HOME: '/tmp/console-home' },
    {},
  );
  assert.equal(paths.stateDir, '/tmp/console-home');
  assert.equal(paths.logFile, path.join('/tmp/console-home', 'dsh-skills-console.log'));
});


test('XDG_STATE_HOME 下的 lock 与 CLI 对齐，canonical 不变', () => {
  const paths = createPaths(
    { HOME: '/h', DSH_HOME: '/h/.dsh', XDG_STATE_HOME: '/state' },
    {},
  );
  assert.equal(paths.lockFile, path.join('/state', 'skills', '.skill-lock.json'));
  assert.equal(paths.canonical, path.join('/h', '.agents', 'skills'));
});

test('overrides.stateDir 优先级高于任何 env（测试与实验用）', () => {
  const paths = createPaths(
    { HOME: '/h', DSH_HOME: '/h/.dsh', DSH_SKILLS_CONSOLE_HOME: '/tmp/console-home' },
    { stateDir: '/tmp/override' },
  );
  assert.equal(paths.stateDir, '/tmp/override');
});

test('技能简介缓存落在 $DSH_HOME/cache/skills-console（与状态目录分家）', () => {
  const paths = createPaths({ HOME: '/h', DSH_HOME: '/h/.dsh' }, {});
  const stateDir = path.join('/h', '.dsh', 'skills-console');
  assert.equal(paths.stateDir, stateDir);
  assert.equal(paths.cacheDir, path.join('/h', '.dsh', 'cache', 'skills-console'));
  assert.equal(paths.introFile, path.join(paths.cacheDir, 'intros.json'));
  assert.deepEqual(paths.introLegacyFiles, [path.join(stateDir, 'intros.json')]);
});

test('DSH_SKILLS_CONSOLE_CACHE_HOME 可单独挪走缓存根', () => {
  const paths = createPaths(
    { HOME: '/h', DSH_HOME: '/h/.dsh', DSH_SKILLS_CONSOLE_CACHE_HOME: '/tmp/console-cache' },
    {},
  );
  assert.equal(paths.cacheDir, '/tmp/console-cache');
  assert.equal(paths.introFile, path.join('/tmp/console-cache', 'intros.json'));
  assert.equal(paths.stateDir, path.join('/h', '.dsh', 'skills-console'), '状态目录不受影响');
});

test('空白 DSH_HOME 视为未设置，不会解析成相对路径', () => {
  const paths = createPaths({ HOME: '/h', DSH_HOME: '   ' }, {});
  assert.equal(paths.dshHome, path.join('/h', '.dsh'));
  assert.equal(paths.stateDir, path.join('/h', '.dsh', 'skills-console'));
});

test('DSH_HOME / DSH_AGENTS_HOME 的 ~ 会展开并绝对化', () => {
  const paths = createPaths({ HOME: '/h', DSH_HOME: '~/.dsh', DSH_AGENTS_HOME: '~/agents' }, {});
  assert.equal(paths.dshHome, path.join('/h', '.dsh'));
  assert.equal(paths.agentsHome, path.join('/h', 'agents'));
});

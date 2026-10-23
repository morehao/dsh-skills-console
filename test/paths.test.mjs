import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { createPaths } from '../lib/core/paths.js';

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


test('overrides.stateDir 优先级高于任何 env（测试与实验用）', () => {
  const paths = createPaths(
    { HOME: '/h', DSH_HOME: '/h/.dsh', DSH_SKILLS_CONSOLE_HOME: '/tmp/console-home' },
    { stateDir: '/tmp/override' },
  );
  assert.equal(paths.stateDir, '/tmp/override');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findProjectRoot, listRoots, ROOT_RANKS, scanSkillRoot } from '../dist/core/roots.js';
import { createPaths } from '../dist/core/paths.js';

test('findProjectRoot：向上找最近的 .git，没有则 null', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-roots-'));
  const repo = path.join(root, 'repo');
  const nested = path.join(repo, 'packages', 'app', 'src');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(findProjectRoot(nested, fs.existsSync), repo);
  assert.equal(findProjectRoot(repo, fs.existsSync), repo);
  assert.equal(findProjectRoot(path.join(root, 'outside'), fs.existsSync), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('listRoots：rank 与宿主顺序一致；项目根为空时只有两个 user 根', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-roots-list-'));
  const paths = createPaths({ HOME: path.join(root, 'home') });
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  fs.mkdirSync(path.join(project, '.dsh', 'skills'), { recursive: true });
  fs.mkdirSync(paths.userAgentsSkills, { recursive: true });

  const list = listRoots({ paths, projectRoot: project });
  assert.deepEqual(
    list.filter((item) => item.exists).map((item) => [item.source, item.rank]),
    [
      ['project-dsh', ROOT_RANKS['project-dsh']],
      ['user-agents', ROOT_RANKS['user-agents']],
    ],
  );
  assert.deepEqual(
    listRoots({ paths }).map((item) => item.source),
    ['user-dsh', 'user-agents'],
  );
  assert.equal(ROOT_RANKS['user-agents'], 500);
  fs.rmSync(root, { recursive: true, force: true });
});

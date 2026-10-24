import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractTarball } from '../lib/core/archive.js';
import { gitTreeSha } from '../lib/core/git-tree.js';
import { downloadTarball } from '../lib/core/remote.js';

/**
 * P0 真网络对拍（默认跳过，CI 不联网）：
 *   DSH_SKILLS_PARITY_NETWORK=1 npm test
 *
 * 固定到 agent-skills 的 commit `c883ee9`，该 commit 的 root tree 是
 * `338e86c...`，`skills/git-kit` tree 是 CLI lock 里的 `0e96f95...`。
 * 一次跑通 codeload 下载 → 安全解压 → 本地 Git tree SHA 整条链路。
 */
test(
  'codeload → 安全解压 → 本地 tree SHA 全链路对拍（真实网络）',
  { skip: process.env.DSH_SKILLS_PARITY_NETWORK !== '1' && '设置 DSH_SKILLS_PARITY_NETWORK=1 才跑真实网络' },
  async () => {
    const commit = 'c883ee99afa0f35b533fd230ab3e375897725da9';
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-parity-'));
    try {
      const tarball = path.join(root, 'repo.tar.gz');
      const downloaded = await downloadTarball({ source: 'morehao/agent-skills', ref: commit, dest: tarball });
      assert.ok(downloaded.bytes > 0);

      const extracted = await extractTarball({ tarball, dest: path.join(root, 'stage') });
      assert.equal(extracted.root, `agent-skills-${commit}`);
      assert.equal(gitTreeSha(extracted.dir), '338e86c6829a2d40c5dd6d89842ba96397a3b8c6');
      assert.equal(
        gitTreeSha(path.join(extracted.dir, 'skills', 'git-kit')),
        '0e96f95ca66e0d38a69f76d288d78198332aed8f',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

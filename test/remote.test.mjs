import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gitTreeSha } from '../lib/core/git-tree.js';
import {
  RemoteError,
  codeloadUrl,
  downloadTarball,
  fetchAtomCommit,
  fetchRemoteSkillMd,
  parseAtomCommit,
  snapshotFromTarball,
} from '../lib/core/remote.js';
import { writeTarFixture } from './helpers/tar-fixture.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-remote-'));
}

const PAYLOAD = Buffer.from('fake tarball bytes');
const COMMIT = '0e96f95ca66e0d38a69f76d288d78198332aed8f';

function okResponse(body = PAYLOAD, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-length': String(body.length), ...headers },
  });
}

test('codeloadUrl 只接受 GitHub owner/repo 与安全 ref', () => {
  assert.equal(
    codeloadUrl({ source: 'morehao/agent-skills', ref: COMMIT }),
    `https://codeload.github.com/morehao/agent-skills/tar.gz/${COMMIT}`,
  );
  assert.equal(
    codeloadUrl({ source: 'https://github.com/morehao/agent-skills.git', ref: 'feat/native-installer' }),
    'https://codeload.github.com/morehao/agent-skills/tar.gz/feat/native-installer',
  );
  assert.throws(
    () => codeloadUrl({ source: 'https://gitlab.com/a/b', ref: 'main' }),
    (error) => error instanceof RemoteError && error.code === 'invalid-source',
  );
  for (const bad of ['../evil', 'a b', 'x\\y', '']) {
    assert.throws(
      () => codeloadUrl({ source: 'a/b', ref: bad }),
      (error) => error instanceof RemoteError && error.code === 'invalid-ref',
    );
  }
});

test('downloadTarball 下载到 dest，token 只进 header 不进 URL', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    const calls = [];
    const result = await downloadTarball({
      source: 'morehao/agent-skills',
      ref: COMMIT,
      token: 'secret-token',
      dest,
      fetchImpl: (url, options) => {
        calls.push({ url, options });
        return Promise.resolve(okResponse());
      },
    });
    assert.equal(result.bytes, PAYLOAD.length);
    assert.equal(result.file, dest);
    assert.deepEqual(fs.readFileSync(dest), PAYLOAD);
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].url.includes('secret-token'));
    assert.equal(calls[0].options.headers.authorization, 'Bearer secret-token');
    assert.equal(calls[0].options.redirect, 'manual');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 跟随 GitHub host 重定向并剥离跨 host 的 Authorization', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    const calls = [];
    await downloadTarball({
      source: 'morehao/agent-skills',
      ref: COMMIT,
      token: 'secret-token',
      dest,
      fetchImpl: (url, options) => {
        calls.push({ url, options });
        if (calls.length === 1) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: 'https://objects.githubusercontent.com/signed/path' },
            }),
          );
        }
        return Promise.resolve(okResponse());
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://objects.githubusercontent.com/signed/path');
    assert.equal(calls[1].options.headers.authorization, undefined, '跨 host 不应带 token');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 拒绝非 GitHub host 重定向并删除半截文件', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        fetchImpl: () =>
          Promise.resolve(
            new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }),
          ),
      }),
      (error) => error instanceof RemoteError && error.code === 'redirect-rejected',
    );
    assert.equal(fs.existsSync(dest), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 映射 HTTP 错误状态', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        fetchImpl: () => Promise.resolve(new Response('nope', { status: 404 })),
      }),
      (error) => error instanceof RemoteError && error.code === 'http-error' && error.status === 404,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 按 content-length 提前拒绝超限', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        maxBytes: 4,
        fetchImpl: () => Promise.resolve(okResponse(Buffer.from('12345'))),
      }),
      (error) => error instanceof RemoteError && error.code === 'tarball-too-large',
    );
    assert.equal(fs.existsSync(dest), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 检测 content-length 与实际字节不一致', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        fetchImpl: () =>
          Promise.resolve(
            new Response(Buffer.from('1234'), { status: 200, headers: { 'content-length': '10' } }),
          ),
      }),
      (error) => error instanceof RemoteError && error.code === 'truncated-download',
    );
    assert.equal(fs.existsSync(dest), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 流式累计超限时中止', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from('1234'));
        controller.enqueue(Buffer.from('5678'));
        controller.close();
      },
    });
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        maxBytes: 6,
        fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
      }),
      (error) => error instanceof RemoteError && error.code === 'tarball-too-large',
    );
    assert.equal(fs.existsSync(dest), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 超时映射为 timeout', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        timeoutMs: 30,
        fetchImpl: (url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      }),
      (error) => error instanceof RemoteError && error.code === 'timeout',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadTarball 网络失败映射为 download-failed', async () => {
  const root = tempDir();
  try {
    const dest = path.join(root, 'repo.tar.gz');
    await assert.rejects(
      downloadTarball({
        source: 'morehao/agent-skills',
        ref: COMMIT,
        dest,
        fetchImpl: () => Promise.reject(new Error('ECONNRESET')),
      }),
      (error) => error instanceof RemoteError && error.code === 'download-failed',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parseAtomCommit：取第一条 Grit commit（id 或 link 退化）', () => {
  const id = '<feed><entry><id>tag:github.com,2008:Grit::Commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</id></entry></feed>';
  assert.equal(parseAtomCommit(id), 'a'.repeat(40));
  const link = '<entry><link rel="alternate" href="https://github.com/o/r/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/></entry>';
  assert.equal(parseAtomCommit(link), 'b'.repeat(40));
  assert.equal(parseAtomCommit('<feed></feed>'), null);
  assert.equal(parseAtomCommit(''), null);
});

test('fetchAtomCommit：默认分支与指定 ref 的 URL，token 只进 header', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      '<feed><entry><id>tag:github.com,2008:Grit::Commit/cccccccccccccccccccccccccccccccccccccccc</id></entry></feed>',
      { status: 200 },
    );
  };
  const first = await fetchAtomCommit({ source: 'morehao/ai-kit', fetchImpl, token: 'secret' });
  assert.equal(first.commit, 'c'.repeat(40));
  assert.equal(calls[0].url, 'https://github.com/morehao/ai-kit/commits.atom');
  assert.equal(calls[0].headers.authorization, 'Bearer secret');

  await fetchAtomCommit({ source: 'morehao/ai-kit', ref: 'feat/native-installer', fetchImpl });
  assert.equal(
    calls[1].url,
    'https://github.com/morehao/ai-kit/commits/feat/native-installer.atom',
    '分支名里的 / 保留为路径分隔符，其余段做编码',
  );
  assert.equal(calls[1].headers.authorization, undefined);

  await assert.rejects(
    fetchAtomCommit({ source: 'a/b', fetchImpl: async () => new Response('nope', { status: 404 }) }),
    (error) => error instanceof RemoteError && error.code === 'http-error' && error.status === 404,
  );
  await assert.rejects(
    fetchAtomCommit({ source: 'a/b', fetchImpl: async () => new Response('<feed></feed>', { status: 200 }) }),
    (error) => error instanceof RemoteError && error.code === 'atom-empty',
  );
});

test('snapshotFromTarball：解压→发现→本地 tree SHA，组装 REST 同形快照', async () => {
  const root = tempDir();
  const commit = 'd'.repeat(40);
  try {
    const files = {
      'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: alpha\n---\n',
      'skills/beta/README.md': 'beta',
      'skills/beta/SKILL.md': '---\nname: beta\n---\n',
      'README.md': 'root',
    };
    const entries = [{ name: `repo-${commit}`, type: 'dir' }];
    for (const [filePath, content] of Object.entries(files)) {
      entries.push({ name: `repo-${commit}/${filePath}`, content });
    }
    const tarball = writeTarFixture(root, entries, { name: 'repo.tar.gz' });

    const sourceDir = path.join(root, 'expected');
    for (const [filePath, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(sourceDir, filePath)), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, filePath), content);
    }
    const alphaTree = gitTreeSha(path.join(sourceDir, 'skills/alpha'));
    const betaTree = gitTreeSha(path.join(sourceDir, 'skills/beta'));
    const rootSha = gitTreeSha(sourceDir);

    const snapshot = await snapshotFromTarball({
      source: 'morehao/agent-skills',
      commit,
      ref: 'main',
      fetchImpl: async (url) => {
        assert.equal(String(url), `https://codeload.github.com/morehao/agent-skills/tar.gz/${commit}`);
        const body = fs.readFileSync(tarball);
        return new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
      },
    });

    assert.equal(snapshot.via, 'codeload');
    assert.equal(snapshot.branch, 'main');
    assert.equal(snapshot.rootSha, rootSha);
    assert.equal(snapshot.snapshot.commit, commit);
    assert.equal(snapshot.snapshot.etag, null);
    assert.deepEqual(snapshot.snapshot.entries, [
      { name: 'alpha', skillPath: 'skills/alpha/SKILL.md', treeSha: alphaTree, description: 'alpha' },
      { name: 'beta', skillPath: 'skills/beta/SKILL.md', treeSha: betaTree, description: '' },
    ]);
    assert.deepEqual(
      snapshot.tree.filter((entry) => entry.type === 'tree'),
      [
        { path: 'skills/alpha', type: 'tree', sha: alphaTree },
        { path: 'skills/beta', type: 'tree', sha: betaTree },
      ],
    );

    await assert.rejects(
      snapshotFromTarball({ source: 'a/b', commit: 'main', fetchImpl: async () => new Response('') }),
      (error) => error instanceof RemoteError && error.code === 'missing-commit',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('fetchRemoteSkillMd：按 commit 读单个 SKILL.md，token 只进 header', async () => {
  const commit = 'e'.repeat(40);
  const seen = [];
  const result = await fetchRemoteSkillMd({
    source: 'morehao/agent-skills',
    ref: commit,
    skillPath: 'skills/alpha/SKILL.md',
    token: 'secret',
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), init });
      return new Response('---\nname: alpha\n---\n正文', { status: 200 });
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `https://raw.githubusercontent.com/morehao/agent-skills/${commit}/skills/alpha/SKILL.md`);
  assert.equal(seen[0].init.headers.authorization, 'Bearer secret');
  assert.ok(!seen[0].url.includes('secret'), 'token 绝不进 URL');
  assert.equal(result.text.includes('正文'), true);
  assert.equal(result.bytes, Buffer.byteLength(result.text, 'utf8'));
});

test('fetchRemoteSkillMd：404 / 过大 / 分支 ref / 路径越界都抛 RemoteError', async () => {
  const commit = 'e'.repeat(40);
  const notFound = () => new Response('nope', { status: 404 });
  await assert.rejects(
    () => fetchRemoteSkillMd({ source: 'a/b', ref: commit, skillPath: 'SKILL.md', fetchImpl: notFound }),
    (error) => error instanceof RemoteError && error.code === 'intro-source-failed',
  );
  await assert.rejects(
    () => fetchRemoteSkillMd({
      source: 'a/b',
      ref: commit,
      skillPath: 'SKILL.md',
      maxBytes: 4,
      fetchImpl: async () => new Response('12345', { status: 200 }),
    }),
    (error) => error instanceof RemoteError && error.code === 'intro-source-too-large',
  );
  await assert.rejects(
    () => fetchRemoteSkillMd({ source: 'a/b', ref: 'main', skillPath: 'SKILL.md', fetchImpl: notFound }),
    (error) => error instanceof RemoteError && error.code === 'invalid-ref',
  );
  await assert.rejects(
    () => fetchRemoteSkillMd({ source: 'a/b', ref: commit, skillPath: '../SKILL.md', fetchImpl: notFound }),
    (error) => error instanceof RemoteError && error.code === 'intro-source-failed',
  );
  await assert.rejects(
    () => fetchRemoteSkillMd({ source: 'a/b', ref: commit, skillPath: 'skills//SKILL.md', fetchImpl: notFound }),
    (error) => error instanceof RemoteError && error.code === 'intro-source-failed',
  );
});

test('fetchRemoteSkillMd：请求超时映射成 intro-source-timeout', async () => {
  const commit = 'e'.repeat(40);
  await assert.rejects(
    () => fetchRemoteSkillMd({
      source: 'a/b',
      ref: commit,
      skillPath: 'SKILL.md',
      timeoutMs: 10,
      fetchImpl: (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    }),
    (error) => error instanceof RemoteError && error.code === 'intro-source-timeout',
  );
});

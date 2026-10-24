import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RemoteError, codeloadUrl, downloadTarball } from '../lib/core/remote.js';

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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCli, locateCli, runCli } from '../lib/core/cli.js';

const STUB = `#!/usr/bin/env node
const mode = process.env.STUB_MODE || 'ok';
const args = process.argv.slice(2);
if (process.env.STUB_ARGV_LOG) {
  require('node:fs').appendFileSync(process.env.STUB_ARGV_LOG, JSON.stringify(args) + '\\n');
}
if (mode === 'hang') { setTimeout(() => {}, 60000); }
else if (mode === 'nojson') { console.log('--skill --agent'); process.exit(0); }
else if (args.includes('--version')) { console.log('1.7.4'); process.exit(0); }
else if (args[0] === 'add' && args.includes('--help')) { console.log('--json --full-depth --skill'); process.exit(0); }
else if (args[0] === 'list') { console.log(JSON.stringify([{ name: 'demo', scope: 'global' }])); process.exit(0); }
else if (mode === 'fail') { console.error('boom'); process.exit(3); }
else { console.log(JSON.stringify({ ok: true })); process.exit(0); }
`;

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshsc-cli-'));
  const stubPath = path.join(root, 'stub.cjs');
  fs.writeFileSync(stubPath, STUB);
  const log = path.join(root, 'argv.log');
  return { root, stubPath, log };
}

function envFor({ stubPath, log, mode }) {
  return {
    ...process.env,
    DSH_SKILLS_CONSOLE_CLI: `${process.execPath} ${stubPath}`,
    STUB_ARGV_LOG: log,
    STUB_MODE: mode || 'ok',
    PATH: '',
  };
}

test('显式覆盖优先，且来源被记下来', () => {
  const { root, stubPath } = sandbox();
  const location = locateCli({ env: { DSH_SKILLS_CONSOLE_CLI: `${process.execPath} ${stubPath}` } });
  assert.equal(location.source, 'env-override');
  assert.equal(location.command, process.execPath);
  fs.rmSync(root, { recursive: true, force: true });
});

test('能力位由 add --help 自己回答', async () => {
  const { root, stubPath, log } = sandbox();
  const cli = createCli({ env: envFor({ stubPath, log }) });
  const capabilities = await cli.capabilities();
  assert.equal(capabilities.version, '1.7.4');
  assert.equal(capabilities.json, true);
  assert.equal(capabilities.fullDepth, true);
  assert.equal(capabilities.usable, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('不支持 --json/--full-depth 时 usable=false（写操作必须被禁用）', async () => {
  const { root, stubPath, log } = sandbox();
  const cli = createCli({ env: envFor({ stubPath, log, mode: 'nojson' }) });
  const capabilities = await cli.capabilities();
  assert.equal(capabilities.usable, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('list 解析 JSON；add 退出码非零被如实带回', async () => {
  const { root, stubPath, log } = sandbox();
  const cli = createCli({ env: envFor({ stubPath, log }) });
  const list = await cli.listGlobal();
  assert.equal(list[0].name, 'demo');

  const failing = createCli({ env: envFor({ stubPath, log, mode: 'fail' }) });
  const result = await failing.add({ source: 'o/r#abc', skills: ['demo'] });
  assert.equal(result.code, 3);
  fs.rmSync(root, { recursive: true, force: true });
});

test('add 的 argv 形状：-a universal -g -y --json --full-depth', async () => {
  const { root, stubPath, log } = sandbox();
  const cli = createCli({ env: envFor({ stubPath, log }) });
  await cli.add({ source: 'morehao/ai-kit#0123456789abcdef0123456789abcdef01234567', skills: ['git-kit'] });
  const argv = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
  assert.deepEqual(argv.slice(0, 3), ['add', 'morehao/ai-kit#0123456789abcdef0123456789abcdef01234567', '--skill']);
  assert.ok(argv.includes('universal'));
  assert.equal(argv[argv.indexOf('-a') + 1], 'universal', 'Agent 固定 universal，永不带 -a *');
  assert.ok(!argv.includes('--all'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('add 未点名技能时用 --skill *（整仓全部）', async () => {
  const { root, stubPath, log } = sandbox();
  const cli = createCli({ env: envFor({ stubPath, log }) });
  await cli.add({ source: 'alchaincyf/huashu-design' });
  const argv = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
  assert.equal(argv[argv.indexOf('--skill') + 1], '*');
  assert.equal(argv[argv.indexOf('-a') + 1], 'universal', '技能名的 * 不能影响 Agent');
  fs.rmSync(root, { recursive: true, force: true });
});

test('remove 的 argv 不带 -a（否则真身删不掉）', async () => {
  const { root, stubPath, log } = sandbox();
  const cli = createCli({ env: envFor({ stubPath, log }) });
  await cli.remove({ names: ['a', 'b'] });
  const argv = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
  assert.deepEqual(argv, ['remove', '-s', 'a', 'b', '-g', '-y']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('硬超时生效', async () => {
  const { root, stubPath, log } = sandbox();
  const location = locateCli({ env: envFor({ stubPath, log }) });
  const started = Date.now();
  const result = await runCli(location, ['list'], {
    timeoutMs: 400,
    env: envFor({ stubPath, log, mode: 'hang' }),
  });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 5000);
  fs.rmSync(root, { recursive: true, force: true });
});

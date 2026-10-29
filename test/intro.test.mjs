import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INTRO_CONFIG,
  INTRO_LIMITS,
  buildIntroPrompt,
  cleanIntroText,
  mapLlmFailureCode,
  normalizeIntroConfig,
  runIntroCall,
  introLang,
  truncateUtf8,
} from '../dist/core/intro.js';

function fakeLlm(chunks, { prepare = true, onStream = null, modelInfo = undefined } = {}) {
  const calls = [];
  const llm = {
    calls,
  };
  if (prepare) {
    llm.prepareCall = async (config, signal, configure) => {
      calls.push({ kind: 'prepare', config });
      const metadata =
        modelInfo === undefined
          ? { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }
          : modelInfo;
      const controls = configure ? configure({ ...config }, metadata) : { ...config };
      const resolved = Object.freeze({ ...controls, maxTokens: controls.maxTokens ?? 100 });
      return {
        config: resolved,
        stream(options) {
          calls.push({ kind: 'stream', options });
          if (onStream) return onStream(chunks);
          return (async function* gen() {
            for (const chunk of chunks) yield chunk;
          })();
        },
      };
    };
  } else {
    llm.stream = (options) => {
      calls.push({ kind: 'stream', options });
      return (async function* gen() {
        for (const chunk of chunks) yield chunk;
      })();
    };
  }
  return llm;
}

const ROUTE = { provider: 'test-provider', model: 'test-model' };
const PROMPT = { system: 'sys', input: 'input' };

test('normalizeIntroConfig：默认值、非法值回退、区间夹紧、provider/model 成对', () => {
  const defaults = normalizeIntroConfig();
  assert.deepEqual({ ...defaults }, { ...DEFAULT_INTRO_CONFIG });
  assert.equal(defaults.enabled, true);

  const clamped = normalizeIntroConfig({ maxInputBytes: 1, maxOutputTokens: 999999, timeoutMs: 1 });
  assert.equal(clamped.maxInputBytes, INTRO_LIMITS.minInputBytes);
  assert.equal(clamped.maxOutputTokens, INTRO_LIMITS.maxOutputTokens);
  assert.equal(clamped.timeoutMs, INTRO_LIMITS.minTimeoutMs);

  const halfPair = normalizeIntroConfig({ provider: 'only-provider' });
  assert.equal(halfPair.provider, null, '只配 provider 视为没配');
  assert.equal(halfPair.model, null);

  const disabled = normalizeIntroConfig({ enabled: false });
  assert.equal(disabled.enabled, false);
});

test('introLang：未知语言回落中文', () => {
  assert.equal(introLang('en'), 'en');
  assert.equal(introLang('zh'), 'zh');
  assert.equal(introLang('ja'), 'zh');
  assert.equal(introLang(undefined), 'zh');
});

test('truncateUtf8：按字节截断且不留下半个多字节字符', () => {
  const short = truncateUtf8('短文本', 10);
  assert.equal(short.truncated, false);
  assert.equal(short.text, '短文本');
  assert.equal(short.sourceBytes, Buffer.byteLength('短文本'));

  const long = '技能'.repeat(10); // 60 字节
  const cut = truncateUtf8(long, 20);
  assert.equal(cut.truncated, true);
  assert.ok(Buffer.byteLength(cut.text, 'utf8') <= 20);
  assert.ok(!cut.text.includes('\uFFFD'), '不能留下替换字符');
  assert.equal(cut.sourceBytes, 60);
});

test('buildIntroPrompt：中文 / 英文提示词、截断标注、文件清单只列名字', () => {
  const content = `---\nname: demo\ndescription: Demo skill\n---\n${'正文 '.repeat(200)}`;
  const zh = buildIntroPrompt({
    name: 'demo',
    description: 'Demo skill',
    files: ['a.md', 'b/c.md'],
    content,
    maxInputBytes: 1024,
    lang: 'zh',
  });
  assert.ok(zh.system.includes('能力简介'));
  assert.ok(zh.system.includes('怎么触发'), '必须要求写清触发方式');
  assert.ok(zh.system.includes('触发词'), '必须要求给出触发关键词');
  assert.ok(zh.system.includes('160 字'));
  assert.ok(zh.input.includes('技能名：demo'));
  assert.ok(zh.input.includes('a.md, b/c.md'));
  assert.ok(zh.input.includes('<skill_md>'));
  assert.ok(zh.input.includes('正文已截断'));
  assert.equal(zh.truncated, true);
  assert.ok(zh.inputBytes <= 1024 + 600, '输入超出的只有提示词外壳，不是正文');

  const en = buildIntroPrompt({ name: 'demo', files: [], content: 'body', lang: 'en' });
  assert.ok(en.system.includes('capability intro'));
  assert.ok(en.system.includes('how to trigger'), 'must require trigger guidance');
  assert.ok(en.system.includes('trigger words'), 'must require trigger keywords');
  assert.ok(en.system.includes('under 100 words'));
  assert.ok(en.input.includes('Skill name: demo'));
  assert.ok(en.input.includes('(none)'));
  assert.equal(en.truncated, false);
});

test('buildIntroPrompt：正文未超限时不写截断标注，文件清单截到 30 条', () => {
  const files = Array.from({ length: 50 }, (_, index) => `f${index}.md`);
  const prompt = buildIntroPrompt({ name: 'demo', files, content: 'body', maxInputBytes: 1024, lang: 'zh' });
  assert.ok(!prompt.input.includes('正文已截断'));
  assert.ok(prompt.input.includes('f29.md'));
  assert.ok(!prompt.input.includes('f30.md'), '最多 30 条');
});

test('cleanIntroText：去掉围栏 / 前缀 / 标题符，折叠空行，超长截断', () => {
  assert.equal(cleanIntroText('  简介：这个技能用来整理提交信息。  '), '这个技能用来整理提交信息。');
  assert.equal(cleanIntroText('```markdown\n# 标题\n\n正文\n```'), '标题\n\n正文');
  assert.equal(cleanIntroText('Summary: does things'), 'does things');
  assert.equal(cleanIntroText('第一段\n\n\n\n第二段'), '第一段\n\n第二段');
  assert.equal(cleanIntroText('   '), '');
  assert.equal(cleanIntroText('"带引号"'), '带引号');
  const long = '字'.repeat(INTRO_LIMITS.maxIntroChars + 10);
  const cleaned = cleanIntroText(long);
  assert.equal(cleaned.length, INTRO_LIMITS.maxIntroChars + 1, '截断后带省略号');
  assert.ok(cleaned.endsWith('…'));
});

test('mapLlmFailureCode：关键失败码映射到正确的 HTTP 语义', () => {
  assert.equal(mapLlmFailureCode('NO_ADAPTER').code, 'error.skills.intro-no-model');
  assert.equal(mapLlmFailureCode('NO_ADAPTER').status, 409);
  assert.equal(mapLlmFailureCode('MISSING_CREDENTIAL').code, 'error.skills.intro-no-model');
  assert.equal(mapLlmFailureCode('AUTH').status, 502);
  assert.equal(mapLlmFailureCode('RATE_LIMIT').status, 429);
  assert.equal(mapLlmFailureCode('QUOTA').status, 429);
  assert.equal(mapLlmFailureCode('CONTEXT_WINDOW_EXCEEDED').status, 413);
  assert.equal(mapLlmFailureCode('ABORTED').code, 'error.skills.intro-aborted');
  assert.equal(mapLlmFailureCode('SOMETHING_NEW').code, 'error.skills.intro-failed');
});

test('runIntroCall：累加 text-delta、取 usage、忽略 reasoning-delta', async () => {
  const llm = fakeLlm([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'reasoning-delta', index: 1, text: '思考' },
    { type: 'text-delta', index: 0, text: '这个技能' },
    { type: 'text-delta', index: 0, text: '用来整理提交信息。' },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]);
  const result = await runIntroCall({
    llm,
    route: ROUTE,
    prompt: PROMPT,
    maxOutputTokens: 500,
  });
  assert.equal(result.text, '这个技能用来整理提交信息。');
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
  assert.equal(result.provider, 'test-provider');
  assert.equal(result.model, 'test-model');

  const streamCall = llm.calls.find((call) => call.kind === 'stream');
  assert.equal(streamCall.options.reasoningEffort, 'low', '取最低推理强度');
  assert.equal(streamCall.options.maxTokens, 4096, '推理模型按 4096 保底，不能沿用 500 这种小上限');
  assert.equal(result.maxTokens, 4096);
  assert.equal(result.finish, 'stop');
  assert.deepEqual(streamCall.options.messages, [
    { role: 'user', content: [{ type: 'text', text: 'input' }] },
  ]);
  assert.equal(streamCall.options.system, 'sys');
});

test('runIntroCall：没有 prepareCall 的宿主退回直接 stream', async () => {
  const llm = fakeLlm(
    [
      { type: 'text-delta', index: 0, text: '退回路径' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    { prepare: false },
  );
  const result = await runIntroCall({ llm, route: ROUTE, prompt: PROMPT, maxOutputTokens: 200 });
  assert.equal(result.text, '退回路径');
  const streamCall = llm.calls.find((call) => call.kind === 'stream');
  assert.equal(streamCall.options.maxTokens, 4096, '没有 prepareCall 时也按推理模型保守保底');
});

test('runIntroCall：空输出 / 失败 finish / 没有 llm 都给出明确错误', async () => {
  const empty = fakeLlm([
    { type: 'text-delta', index: 0, text: '   ' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]);
  await assert.rejects(
    runIntroCall({ llm: empty, route: ROUTE, prompt: PROMPT, maxOutputTokens: 100 }),
    (error) => error.code === 'error.skills.intro-empty' && error.status === 502,
  );

  const failed = fakeLlm([
    { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'slow down' } } },
  ]);
  await assert.rejects(
    runIntroCall({ llm: failed, route: ROUTE, prompt: PROMPT, maxOutputTokens: 100 }),
    (error) => error.code === 'error.skills.intro-rate-limit' && error.status === 429,
  );

  await assert.rejects(
    runIntroCall({ llm: null, route: ROUTE, prompt: PROMPT, maxOutputTokens: 100 }),
    (error) => error.code === 'error.skills.intro-unavailable' && error.status === 501,
  );

  const aborted = fakeLlm([{ type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED' } } }]);
  await assert.rejects(
    runIntroCall({ llm: aborted, route: ROUTE, prompt: PROMPT, maxOutputTokens: 100 }),
    (error) => error.code === 'error.skills.intro-aborted',
  );
});

test('runIntroCall：prepareCall 抛出的适配器错误也按 code 映射', async () => {
  const llm = {
    async prepareCall() {
      const error = new Error('no adapter registered');
      error.code = 'NO_ADAPTER';
      throw error;
    },
  };
  await assert.rejects(
    runIntroCall({ llm, route: ROUTE, prompt: PROMPT, maxOutputTokens: 100 }),
    (error) => error.code === 'error.skills.intro-no-model' && error.status === 409,
  );
});

test('runIntroCall：普通模型保底 1024，模型上限更小时按模型上限', async () => {
  const plain = fakeLlm(
    [
      { type: 'text-delta', index: 0, text: '纯文本模型' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    { modelInfo: { defaultMaxTokens: 8000 } },
  );
  await runIntroCall({ llm: plain, route: ROUTE, prompt: PROMPT, maxOutputTokens: 300 });
  assert.equal(plain.calls.find((call) => call.kind === 'stream').options.maxTokens, 1024);

  const capped = fakeLlm(
    [
      { type: 'text-delta', index: 0, text: '小模型' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    { modelInfo: { reasoning: { efforts: [{ id: 'low' }] }, defaultMaxTokens: 2048 } },
  );
  await runIntroCall({ llm: capped, route: ROUTE, prompt: PROMPT, maxOutputTokens: 300 });
  assert.equal(capped.calls.find((call) => call.kind === 'stream').options.maxTokens, 2048);
});

test('runIntroCall：max-tokens 即使有正文也算截断失败，不返回半句', async () => {
  const llm = fakeLlm([
    { type: 'text-delta', index: 0, text: '这是半句' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 4096 } },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ]);
  await assert.rejects(
    runIntroCall({ llm, route: ROUTE, prompt: PROMPT, maxOutputTokens: 300 }),
    (error) =>
      error.code === 'error.skills.intro-truncated' &&
      error.status === 502 &&
      error.detail?.usage?.outputTokens === 4096,
  );
});

test('runIntroCall：只有 reasoning、没有正文时报 reasoning-only', async () => {
  const llm = fakeLlm([
    { type: 'reasoning-delta', index: 1, text: '思考了很久' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 200 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]);
  await assert.rejects(
    runIntroCall({ llm, route: ROUTE, prompt: PROMPT, maxOutputTokens: 300 }),
    (error) => error.code === 'error.skills.intro-reasoning-only' && error.status === 502,
  );
});

test('runIntroCall：块式适配器没有 text-delta 时回退读 block-end 正文', async () => {
  const llm = fakeLlm([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '块式正文' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]);
  const result = await runIntroCall({ llm, route: ROUTE, prompt: PROMPT, maxOutputTokens: 300 });
  assert.equal(result.text, '块式正文');
});


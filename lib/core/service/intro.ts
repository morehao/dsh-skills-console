/**
 * 技能介绍（模型生成）+ 正文 / 文件读取（查看器层）。
 * 拆分前是 `createService` 闭包里的 intro* 一组内部函数 + 对外方法
 * listSkillBody / getSkillIntro / generateSkillIntro / getRemoteIntro /
 * generateRemoteIntro / listSkillFiles，现在接 `ctx`。
 */
import {
  contentFingerprint,
  buildIntroPrompt,
  introLang,
  runIntroCall,
  IntroError,
  introEntry,
} from '../intro.js';
import { readSkillFile, readSkillTree, resolveSkillRoot } from '../skill-files.js';
import { parseSkillFrontmatter } from '../skill-md.js';
import { fetchRemoteSkillMd } from '../remote.js';
import { assertSafeSkillName, skillFileFailure } from './shared.js';
import { ServiceError } from './errors.js';
import type { ServiceCtx } from '../../contract/service.js';

/** `/state` 下发的介绍能力：前端据此决定按钮显隐与提示。 */
export function introCapability(ctx: ServiceCtx) {
  return {
    enabled: Boolean(ctx.introOptions.enabled),
    available: Boolean(ctx.introStore) && Boolean(ctx.getLlm()),
    langs: ['zh', 'en'],
    timeoutMs: ctx.introOptions.timeoutMs,
  };
}

/** 介绍用的模型路由：显式配置 > 宿主默认模型；解析不出来就是「没有可用模型」。 */
export function resolveIntroRoute(ctx: ServiceCtx) {
  if (ctx.introOptions.provider && ctx.introOptions.model) {
    return { provider: ctx.introOptions.provider, model: ctx.introOptions.model };
  }
  let selection: any = null;
  try {
    selection = ctx.getDefaultModel();
  } catch (error) {
    ctx.logger('intro.default-model.failed', { message: error?.message });
    selection = null;
  }
  if (selection?.provider && selection?.model) {
    return { provider: selection.provider, model: selection.model };
  }
  return null;
}

/** 读 SKILL.md（只读；根反查与路径校验沿用查看器那一层）。 */
export async function readIntroSource(ctx: ServiceCtx, name) {
  assertSafeSkillName(name);
  try {
    const root = await resolveSkillRoot(ctx.paths, name);
    const file = await readSkillFile({ root: root.root, kind: root.kind, relPath: null });
    return { root, file };
  } catch (error) {
    throw skillFileFailure(error);
  }
}

/** 只列文件名（不发内容）：让模型知道技能还带哪些资料，不扩大数据外发面。 */
export async function introFileNames(ctx: ServiceCtx, root, bodyRelPath) {
  const names = new Set(bodyRelPath ? [bodyRelPath] : ['SKILL.md']);
  try {
    const tree = await readSkillTree({ root: root.root, kind: root.kind });
    for (const item of tree.files) {
      if (item.kind === 'file' && item.path) names.add(item.path);
    }
  } catch (error) {
    ctx.logger('intro.files.failed', { message: error?.message });
  }
  return [...names].slice(0, 30);
}

/** 缓存条目 → 接口形状；`stale` 只表示 SKILL.md 的内容哈希对不上。 */
export function publicIntro(entry, hash) {
  return {
    text: entry.text,
    stale: Boolean(hash) && entry.hash !== hash,
    generatedAt: entry.generatedAt,
    provider: entry.provider,
    model: entry.model,
    truncated: Boolean(entry.truncated),
    usage: entry.usage || null,
  };
}

/**
 * 订阅候选：按订阅 id + 条目名反查快照，`skillPath` 只从服务端状态取。
 * 客户端只给 id 与名字，永远不能自带路径。
 */
export function remoteIntroTarget(ctx: ServiceCtx, subscriptionId, name) {
  if (typeof subscriptionId !== 'string' || !subscriptionId || typeof name !== 'string' || !name) {
    throw new ServiceError('error.skills.bad-request', '缺少订阅 id 或技能名', null, 400);
  }
  const subscriptions = Array.isArray(ctx.store.state?.subscriptions) ? ctx.store.state.subscriptions : [];
  const subscription = subscriptions.find((item) => item.id === subscriptionId) || null;
  if (!subscription) {
    throw new ServiceError(
      'error.skills.subscription-not-found',
      '订阅不存在，可能已被取消',
      { subscriptionId },
      404,
    );
  }
  const snapshot = subscription.snapshot || null;
  const entry = (Array.isArray(snapshot?.entries) ? snapshot.entries : []).find((item) => item.name === name) || null;
  if (!entry?.skillPath || !snapshot?.commit) {
    throw new ServiceError(
      'error.skills.intro-no-source',
      '订阅快照里没有这个技能，请先点「检查更新」刷新快照',
      { name },
      409,
    );
  }
  return {
    subscription,
    entry,
    source: subscription.source,
    commit: snapshot.commit,
    skillPath: entry.skillPath,
    description: typeof entry.description === 'string' ? entry.description : '',
    cacheKey: `remote:${subscription.source}@${snapshot.commit}:${entry.skillPath}`,
  };
}

/** 远端介绍没有「过期」概念：缓存 key 已经带 commit，换 commit 就是另一条。 */
export function publicRemoteIntro(entry) {
  return {
    text: entry.text,
    stale: false,
    generatedAt: entry.generatedAt,
    provider: entry.provider,
    model: entry.model,
    truncated: Boolean(entry.truncated),
    usage: entry.usage || null,
  };
}

export function remoteIntroSourceFailure(error) {
  const detail = { code: error?.code || null, status: error?.status ?? null, bytes: error?.bytes ?? null };
  if (error?.code === 'intro-source-timeout') {
    return new ServiceError('error.skills.intro-source-timeout', error.message, detail, 504);
  }
  if (error?.code === 'intro-source-too-large') {
    return new ServiceError('error.skills.intro-source-too-large', error.message, detail, 413);
  }
  return new ServiceError('error.skills.intro-source', error?.message || '读不到远端的 SKILL.md', detail, 502);
}

/** 一次模型调用的统一超时：到点 abort，映射成 504（与用户取消区分）。 */
export async function callIntroModel(ctx: ServiceCtx, { llm, route, prompt, signal }) {
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ctx.introOptions.timeoutMs);
  const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  try {
    return await runIntroCall({
      llm,
      route,
      prompt,
      maxOutputTokens: ctx.introOptions.maxOutputTokens,
      signal: combined,
    });
  } catch (error) {
    if (timedOut) {
      throw new ServiceError(
        'error.skills.intro-timeout',
        `生成超时（${Math.round(ctx.introOptions.timeoutMs / 1000)} 秒），请重试`,
        { timeoutMs: ctx.introOptions.timeoutMs },
        504,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** 全局单飞：辅助调用不进 agent 的重试/限流体系，并发越高越容易撞 429。 */
export async function withIntroInFlight(ctx: ServiceCtx, meta, task) {
  if (ctx.runtime.introInFlight) {
    throw new ServiceError(
      'error.skills.intro-busy',
      '正在生成另一个技能介绍，请稍后再试',
      ctx.runtime.introInFlight,
      409,
    );
  }
  const startedAt = Date.now();
  ctx.runtime.introInFlight = { ...meta, startedAt };
  try {
    return await task(startedAt);
  } catch (error) {
    if (error instanceof IntroError) throw introFailure(error);
    throw error;
  } finally {
    ctx.runtime.introInFlight = null;
  }
}

/** 介绍层的异常统一转成路由能识别的 ServiceError（保留 429/413/504 语义）。 */
export function introFailure(error) {
  if (error instanceof IntroError) {
    return new ServiceError(error.code, error.message, error.detail, error.status);
  }
  return error;
}

/**
 * 读技能正文 / 单个文件（只读）：`path` 是技能根内的相对路径，省略时读 SKILL.md（平铺读 `<name>.md`）。
 * 技能名与相对路径都在拼路径之前校验；越界一律 400，不落文件系统。
 */
export async function listSkillBody(ctx: ServiceCtx, { name, path: relPath }) {
  assertSafeSkillName(name);
  try {
    const root = await resolveSkillRoot(ctx.paths, name);
    const file = await readSkillFile({ root: root.root, kind: root.kind, relPath });
    return {
      ok: true,
      name,
      kind: root.kind,
      relPath: file.relPath,
      path: file.path,
      content: file.content,
      meta: parseSkillFrontmatter(file.content),
      size: file.size,
      truncated: file.truncated,
      mtime: file.mtime,
    };
  } catch (error) {
    throw skillFileFailure(error);
  }
}

/**
 * 读缓存的技能介绍（只读，**不触发模型调用**）。
 * `stale` 表示 SKILL.md 已被改动过；文本仍然返回，让用户先看到东西。
 */
export async function getSkillIntro(ctx: ServiceCtx, { name, lang }: any = {}) {
  assertSafeSkillName(name);
  const language = introLang(lang);
  const capability = introCapability(ctx);
  if (!ctx.introStore) return { ok: true, name, lang: language, intro: null, capability };
  const { file } = await readIntroSource(ctx, name);
  const entry = ctx.introStore.get(name, language);
  return {
    ok: true,
    name,
    lang: language,
    intro: entry ? publicIntro(entry, contentFingerprint(file.content)) : null,
    capability,
  };
}

/**
 * 生成技能介绍：显式操作，一次一个模型调用。
 * 命中缓存且内容未变时直接返回（`cached: true`），不烧额度。
 */
export async function generateSkillIntro(ctx: ServiceCtx, { name, lang, force = false, signal = null }: any = {}) {
  assertSafeSkillName(name);
  const language = introLang(lang);
  if (!ctx.introOptions.enabled) {
    throw new ServiceError('error.skills.intro-disabled', '技能介绍已关闭（config.intro.enabled = false）', null, 501);
  }
  if (!ctx.introStore) {
    throw new ServiceError('error.skills.intro-unavailable', '介绍缓存不可用', null, 501);
  }
  const llm = ctx.getLlm();
  if (!llm) {
    throw new ServiceError(
      'error.skills.intro-unavailable',
      '当前宿主没有模型服务（llm），无法生成介绍',
      null,
      501,
    );
  }

  return withIntroInFlight(ctx, { name, lang: language, kind: 'local' }, async (startedAt) => {
    try {
      const { root, file } = await readIntroSource(ctx, name);
      const hash = contentFingerprint(file.content);
      const cached = ctx.introStore.get(name, language);
      if (cached && !force) {
        const intro = publicIntro(cached, hash);
        if (!intro.stale) {
          return { ok: true, name, lang: language, cached: true, intro, usage: null };
        }
      }

      const route = resolveIntroRoute(ctx);
      if (!route) {
        throw new ServiceError(
          'error.skills.intro-no-model',
          '还没有可用的默认模型，请先在 DSH 里选择模型',
          null,
          409,
        );
      }

      const prompt = buildIntroPrompt({
        name,
        description: parseSkillFrontmatter(file.content).description || '',
        files: await introFileNames(ctx, root, file.relPath),
        content: file.content,
        maxInputBytes: ctx.introOptions.maxInputBytes,
        lang: language,
      });

      const result = await callIntroModel(ctx, { llm, route, prompt, signal });
      const entry = introEntry({
        text: result.text,
        hash,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        inputBytes: prompt.inputBytes,
        truncated: prompt.truncated,
        sourceBytes: prompt.sourceBytes,
        maxTokens: result.maxTokens,
        finish: result.finish,
      });
      ctx.introStore.put(name, language, entry);
      ctx.logger('intro.generate', {
        name,
        lang: language,
        provider: result.provider,
        model: result.model,
        effort: result.reasoningEffort || null,
        maxTokens: result.maxTokens ?? null,
        finish: result.finish || null,
        inputBytes: prompt.inputBytes,
        truncated: prompt.truncated,
        durationMs: Date.now() - startedAt,
        usage: result.usage || null,
      });
      return {
        ok: true,
        name,
        lang: language,
        cached: false,
        intro: publicIntro(entry, hash),
        usage: result.usage || null,
      };
    } catch (error) {
      if (!(error instanceof ServiceError)) {
        ctx.logger('intro.generate.failed', {
          name,
          message: error?.message,
          code: error?.code,
          detail: error?.detail || null,
        });
      }
      throw error;
    }
  });
}

/** 读订阅候选的介绍缓存（只读，不联网、不调模型）。 */
export async function getRemoteIntro(ctx: ServiceCtx, { subscriptionId, name, lang }: any = {}) {
  const language = introLang(lang);
  const capability = introCapability(ctx);
  const target = remoteIntroTarget(ctx, subscriptionId, name);
  const entry = ctx.introStore ? ctx.introStore.get(target.cacheKey, language) : null;
  return {
    ok: true,
    subscriptionId,
    name,
    lang: language,
    source: target.source,
    commit: target.commit,
    skillPath: target.skillPath,
    description: target.description,
    intro: entry ? publicRemoteIntro(entry) : null,
    capability,
  };
}

/**
 * 生成订阅候选的介绍：先按快照 commit 拉远端 SKILL.md，再走同一套提示词与模型调用。
 * 拉不到 / 超限只影响这次介绍，不影响安装按钮。
 */
export async function generateRemoteIntro(ctx: ServiceCtx, { subscriptionId, name, lang, force = false, signal = null }: any = {}) {
  const language = introLang(lang);
  if (!ctx.introOptions.enabled) {
    throw new ServiceError('error.skills.intro-disabled', '技能介绍已关闭（config.intro.enabled = false）', null, 501);
  }
  if (!ctx.introStore) {
    throw new ServiceError('error.skills.intro-unavailable', '介绍缓存不可用', null, 501);
  }
  const llm = ctx.getLlm();
  if (!llm) {
    throw new ServiceError(
      'error.skills.intro-unavailable',
      '当前宿主没有模型服务（llm），无法生成介绍',
      null,
      501,
    );
  }

  const target = remoteIntroTarget(ctx, subscriptionId, name);
  const cached = ctx.introStore.get(target.cacheKey, language);
  if (cached && !force) {
    return {
      ok: true,
      subscriptionId,
      name,
      lang: language,
      cached: true,
      source: target.source,
      commit: target.commit,
      skillPath: target.skillPath,
      intro: publicRemoteIntro(cached),
      usage: null,
    };
  }

  return withIntroInFlight(
    ctx,
    { name, lang: language, kind: 'remote', source: target.source },
    async (startedAt) => {
      try {
        const route = resolveIntroRoute(ctx);
        if (!route) {
          throw new ServiceError(
            'error.skills.intro-no-model',
            '还没有可用的默认模型，请先在 DSH 里选择模型',
            null,
            409,
          );
        }

        let file;
        try {
          file = await fetchRemoteSkillMd({
            source: target.source,
            ref: target.commit,
            skillPath: target.skillPath,
            token: ctx.runtime.tokenOf,
            fetchImpl: ctx.fetchImpl,
          });
        } catch (error) {
          throw remoteIntroSourceFailure(error);
        }

        const prompt = buildIntroPrompt({
          name,
          description: target.description,
          files: [],
          content: file.text,
          maxInputBytes: ctx.introOptions.maxInputBytes,
          lang: language,
        });

        const result = await callIntroModel(ctx, { llm, route, prompt, signal });
        const entry = introEntry({
          text: result.text,
          hash: target.commit,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          inputBytes: prompt.inputBytes,
          truncated: prompt.truncated,
          sourceBytes: prompt.sourceBytes,
          maxTokens: result.maxTokens,
          finish: result.finish,
        });
        ctx.introStore.put(target.cacheKey, language, entry);
        ctx.logger('intro.generate.remote', {
          source: target.source,
          name,
          lang: language,
          commit: target.commit,
          provider: result.provider,
          model: result.model,
          effort: result.reasoningEffort || null,
          maxTokens: result.maxTokens ?? null,
          finish: result.finish || null,
          inputBytes: prompt.inputBytes,
          truncated: prompt.truncated,
          durationMs: Date.now() - startedAt,
          usage: result.usage || null,
        });
        return {
          ok: true,
          subscriptionId,
          name,
          lang: language,
          cached: false,
          source: target.source,
          commit: target.commit,
          skillPath: target.skillPath,
          intro: publicRemoteIntro(entry),
          usage: result.usage || null,
        };
      } catch (error) {
        if (!(error instanceof ServiceError)) {
          ctx.logger('intro.generate.remote.failed', {
            source: target.source,
            name,
            message: error?.message,
            code: error?.code,
            detail: error?.detail || null,
          });
        }
        throw error;
      }
    },
  );
}

/** 列技能目录的文件树（只读，不跟随符号链接）。 */
export async function listSkillFiles(ctx: ServiceCtx, { name }) {
  assertSafeSkillName(name);
  try {
    const root = await resolveSkillRoot(ctx.paths, name);
    const tree = await readSkillTree({ root: root.root, kind: root.kind });
    return {
      ok: true,
      name,
      root: tree.root,
      kind: tree.kind,
      body: tree.body,
      hasSkillMd: tree.hasSkillMd,
      files: tree.files,
      totalBytes: tree.totalBytes,
      truncated: tree.truncated,
    };
  } catch (error) {
    throw skillFileFailure(error);
  }
}

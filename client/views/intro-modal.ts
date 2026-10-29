/**
 * 技能简介弹窗：点列表行里的 ✨ 打开（已安装列表 / 订阅候选共用）。
 *
 * 打开只读缓存（GET …/intro），点「生成简介」才真正调模型（POST …/intro）。
 * 和调用策略 / 共享设置 / 删除一致，走标准 Overlay 居中弹窗（遮罩 + 标题 + 底栏），
 * 不再锚在按钮旁边：窗口窄、列表滚到边缘时也不会飘出可视区。
 * 订阅候选传 `endpoint` 指向 `/subscriptions/:id/entries/:name/intro`，按钮换成「安装」。
 */
import { h } from '../host.js';
import type { IntroCapability } from '../api.js';
import type { Translate } from '../copy.js';
import { useSkillIntro } from '../hooks.js';
import { Overlay } from './overlay.js';

/** 错误码 → 文案键：服务端 message 只有中文，英文界面必须自己映射。 */
const ERROR_KEY: Record<string, string> = {
  'error.skills.intro-no-model': 'intro.error.noModel',
  'error.skills.intro-rate-limit': 'intro.error.rateLimit',
  'error.skills.intro-quota': 'intro.error.rateLimit',
  'error.skills.intro-too-large': 'intro.error.tooLarge',
  'error.skills.intro-timeout': 'intro.error.timeout',
  'error.skills.intro-auth': 'intro.error.auth',
  'error.skills.intro-empty': 'intro.error.empty',
  'error.skills.intro-truncated': 'intro.error.truncated',
  'error.skills.intro-reasoning-only': 'intro.error.reasoningOnly',
  'error.skills.intro-no-text': 'intro.error.noText',
  'error.skills.intro-busy': 'intro.error.busy',
  'error.skills.intro-source': 'intro.error.source',
  'error.skills.subscription-not-found': 'intro.error.subscription',
  'error.skills.intro-source-timeout': 'intro.error.sourceTimeout',
  'error.skills.intro-no-source': 'intro.error.noSource',
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function modelLabel(intro: { model?: string | null; provider?: string | null } | null | undefined): string {
  if (!intro?.model) return '—';
  return intro.provider ? `${intro.provider}/${intro.model}` : intro.model;
}

export interface IntroModalProps {
  t: Translate;
  name: string;
  stamp?: string;
  subtitle?: string | null;
  endpoint?: string | null;
  capability?: IntroCapability | null;
  hint?: string | null;
  viewLabel?: string | null;
  onClose: () => void;
  onView?: (() => void) | null;
}

export function IntroModal({
  t,
  name,
  stamp = '',
  subtitle = null,
  endpoint = null,
  capability,
  hint = null,
  viewLabel = null,
  onClose,
  onView = null,
}: IntroModalProps) {
  const enabled = capability?.enabled !== false;
  const available = capability?.available !== false;
  const intro: any = useSkillIntro({
    name,
    lang: t.lang || 'zh',
    stamp,
    enabled,
    endpoint,
  });

  const failure = intro.genError || intro.error;
  const failureKey = failure?.code ? (ERROR_KEY[failure.code] || 'intro.error.generic') : null;
  const meta = intro.intro
    ? t('intro.meta')
      .replace('{model}', modelLabel(intro.intro))
      .replace('{time}', formatWhen(intro.intro.generatedAt) || '—')
    : '';

  const actions: any[] = [];
  if (intro.intro) {
    actions.push(h('button', {
      type: 'button',
      key: 'regen',
      className: 'dshsc-btn ghost',
      disabled: intro.generating || !available,
      onClick: () => { void intro.generate(true); },
    }, intro.generating ? t('intro.generating') : t('intro.regenerate')));
    if (onView) {
      actions.push(h('button', {
        type: 'button',
        key: 'view',
        className: 'dshsc-btn primary',
        onClick: onView,
      }, viewLabel || t('intro.view')));
    }
  } else {
    actions.push(h('button', {
      type: 'button',
      key: 'gen',
      className: 'dshsc-btn primary',
      disabled: intro.generating || !available || !enabled,
      onClick: () => { void intro.generate(false); },
    }, intro.generating ? t('intro.generating') : t('intro.generate')));
  }

  return h(Overlay, {
    t,
    title: `✨ ${t('intro.title')}`,
    onCancel: onClose,
    footer: actions,
  },
  h('p', { className: 'dshsc-intro-sub', key: 'sub', title: subtitle || name }, subtitle || name),

  intro.loading
    ? h('p', { className: 'dshsc-intro-note', key: 'loading' }, t('intro.loading'))
    : intro.intro
      ? h('p', { className: 'dshsc-intro-text', key: 'text' }, intro.intro.text)
      : h('p', { className: 'dshsc-intro-note', key: 'empty' }, t('intro.empty')),

  intro.intro?.stale ? h('p', { className: 'dshsc-intro-stale', key: 'stale' }, t('intro.stale')) : null,
  failureKey ? h('p', { className: 'dshsc-intro-error', key: 'error' }, t(failureKey)) : null,
  meta ? h('p', { className: 'dshsc-intro-meta', key: 'meta' }, meta) : null,
  available && !intro.intro && !intro.loading
    ? h('p', { className: 'dshsc-intro-meta', key: 'hint' }, hint || t('intro.hint'))
    : null,
  !available ? h('p', { className: 'dshsc-intro-error', key: 'unavailable' }, t('intro.unavailable')) : null);
}

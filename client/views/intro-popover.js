/**
 * 技能介绍浮层：点列表行里的 ✨ 打开（已安装列表 / 订阅候选共用）。
 *
 * 打开只读缓存（GET …/intro），点「生成介绍」才真正调模型（POST …/intro）；
 * 锚在按钮上（fixed + portal 到宿主弹窗），列表区的 overflow 裁不到。
 * 订阅候选传 `endpoint` 指向 `/subscriptions/:id/entries/:name/intro`，按钮换成「安装」。
 */
import React from 'react';

import { h, portalize, useOverlayLayer } from '../host.js';
import { useSkillIntro } from '../hooks.js';

/** 错误码 → 文案键：服务端 message 只有中文，英文界面必须自己映射。 */
const ERROR_KEY = {
  'error.skills.intro-no-model': 'intro.error.noModel',
  'error.skills.intro-rate-limit': 'intro.error.rateLimit',
  'error.skills.intro-quota': 'intro.error.rateLimit',
  'error.skills.intro-too-large': 'intro.error.tooLarge',
  'error.skills.intro-timeout': 'intro.error.timeout',
  'error.skills.intro-auth': 'intro.error.auth',
  'error.skills.intro-empty': 'intro.error.empty',
  'error.skills.intro-busy': 'intro.error.busy',
  'error.skills.intro-source': 'intro.error.source',
  'error.skills.subscription-not-found': 'intro.error.subscription',
  'error.skills.intro-source-timeout': 'intro.error.sourceTimeout',
  'error.skills.intro-no-source': 'intro.error.noSource',
};

function formatWhen(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function modelLabel(intro) {
  if (!intro?.model) return '—';
  return intro.provider ? `${intro.provider}/${intro.model}` : intro.model;
}

export function IntroPopover({
  t,
  name,
  stamp = '',
  subtitle = null,
  endpoint = null,
  capability,
  anchor,
  anchorEl,
  hint = null,
  viewLabel = null,
  onClose,
  onView = null,
}) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ left: 0, top: 0, visibility: 'hidden' });
  const enabled = capability?.enabled !== false;
  const available = capability?.available !== false;
  const intro = useSkillIntro({
    name,
    lang: t.lang || 'zh',
    stamp,
    enabled,
    endpoint,
  });

  useOverlayLayer(true, onClose);

  // 锚点下方放不下就翻到上方；左右按视口夹住，窄面板里也不会出界
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !anchor || typeof window === 'undefined') return;
    const rect = node.getBoundingClientRect();
    const width = rect.width || 360;
    const height = rect.height || 220;
    let left = anchor.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = anchor.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, anchor.top - height - 8);
    }
    setPos({ left, top, visibility: 'visible' });
  }, [anchor, intro.loading, intro.intro?.text, intro.generating, intro.genError]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (ref.current?.contains?.(target)) return;
      if (anchorEl?.contains?.(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchorEl, onClose]);

  const failure = intro.genError || intro.error;
  const failureKey = failure?.code ? (ERROR_KEY[failure.code] || 'intro.error.generic') : null;
  const meta = intro.intro
    ? t('intro.meta')
      .replace('{model}', modelLabel(intro.intro))
      .replace('{time}', formatWhen(intro.intro.generatedAt) || '—')
    : '';

  const actions = [];
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

  return portalize(h('div', {
    ref,
    className: 'dshsc-floatpop dshsc-intro-pop',
    role: 'dialog',
    'aria-label': `${t('intro.title')} · ${name}`,
    style: { left: `${pos.left}px`, top: `${pos.top}px`, visibility: pos.visibility },
  },
  h('div', { className: 'dshsc-floatpop-head' },
    h('div', null,
      h('div', { className: 'dshsc-floatpop-title' }, `✨ ${t('intro.title')}`),
      h('div', { className: 'dshsc-floatpop-sub', title: subtitle || name }, subtitle || name)),
    h('button', {
      type: 'button',
      className: 'dshsc-floatpop-close',
      'aria-label': t('action.close'),
      onClick: onClose,
    }, '×')),

  intro.loading
    ? h('p', { className: 'dshsc-intro-note' }, t('intro.loading'))
    : intro.intro
      ? h('p', { className: 'dshsc-intro-text' }, intro.intro.text)
      : h('p', { className: 'dshsc-intro-note' }, t('intro.empty')),

  intro.intro?.stale ? h('p', { className: 'dshsc-intro-stale' }, t('intro.stale')) : null,
  failureKey ? h('p', { className: 'dshsc-intro-error' }, t(failureKey)) : null,
  meta ? h('p', { className: 'dshsc-intro-meta' }, meta) : null,
  available && !intro.intro && !intro.loading
    ? h('p', { className: 'dshsc-intro-meta' }, hint || t('intro.hint'))
    : null,
  !available ? h('p', { className: 'dshsc-intro-error' }, t('intro.unavailable')) : null,

  h('div', { className: 'dshsc-intro-foot' }, actions)));
}

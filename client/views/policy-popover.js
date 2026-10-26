/**
 * 调用策略浮层：自动 / 仅手动 / 完全停用。
 *
 * 锚在行内状态 chip 上（fixed + portal 到宿主弹窗），列表的 overflow 裁不到。
 * 只收集选择并回调；写请求在 actions 里，视图不直接 fetch。
 */
import React from 'react';

import { h, overlayHost, portalize, useOverlayLayer } from '../host.js';

export function PolicyPopover({ t, row, anchor, anchorEl, busy, onClose, onSave, onUnpark }) {
  const initial = row.mode === 'hidden' ? 'auto' : row.mode;
  const [mode, setMode] = React.useState(initial);
  const [confirming, setConfirming] = React.useState(false);
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ left: 0, top: 0, visibility: 'hidden' });

  useOverlayLayer(true, onClose);

  // 锚点下方放不下就翻到上方；左右按视口夹住，窄面板里也不会出界
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !anchor || typeof window === 'undefined') return;
    const rect = node.getBoundingClientRect();
    const width = rect.width || 360;
    const height = rect.height || 320;
    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = anchor.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, anchor.top - height - 8);
    }
    setPos({ left, top, visibility: 'visible' });
  }, [anchor, confirming, mode]);

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

  const hidden = row.mode === 'hidden';
  const author = row.origin === 'author' && row.mode === 'manual';
  const flat = row.kind === 'file';
  const dirty = mode !== initial || Boolean(row.legacy) || Boolean(row.drift);

  function choose(next) {
    setMode(next);
    setConfirming(false);
  }

  function submit() {
    if (mode === 'hidden' && !hidden && !confirming) {
      setConfirming(true);
      return;
    }
    onSave(mode);
  }

  const option = (id, label, desc) => h('button', {
    type: 'button',
    key: `policy-${id}`,
    className: `dshsc-policyopt${mode === id ? ' active' : ''}`,
    'aria-pressed': String(mode === id),
    disabled: busy || flat,
    onClick: () => choose(id),
  },
  h('span', { className: 'dshsc-policyopt-dot', 'aria-hidden': 'true' }),
  h('span', { className: 'dshsc-policyopt-body' },
    h('b', null, label),
    h('small', null, desc)));

  return portalize(h('div', {
    ref,
    className: 'dshsc-policy-pop',
    role: 'dialog',
    'aria-label': t('policy.title'),
    style: { left: `${pos.left}px`, top: `${pos.top}px`, visibility: pos.visibility },
  },
  h('div', { className: 'dshsc-policy-head' },
    h('div', null,
      h('div', { className: 'dshsc-policy-title' }, t('policy.title')),
      h('div', { className: 'dshsc-policy-sub' }, t('policy.subtitle'))),
    h('button', {
      type: 'button',
      className: 'dshsc-policy-close',
      'aria-label': t('action.close'),
      onClick: onClose,
    }, '×')),

  h('div', { className: 'dshsc-policy-scroll' },
    author
      ? h('div', { className: 'dshsc-policy-note author' }, t('policy.authorHint'))
      : null,
    row.legacy ? h('div', { className: 'dshsc-policy-note' }, t('policy.legacyHint')) : null,
    row.drift ? h('div', { className: 'dshsc-policy-note warn' }, t('policy.driftHint')) : null,

    hidden
      ? h('div', { className: 'dshsc-policy-hidden' },
          h('div', { className: 'dshsc-policyopt active static' },
            h('span', { className: 'dshsc-policyopt-dot' }),
            h('span', { className: 'dshsc-policyopt-body' },
              h('b', null, t('policy.hidden')),
              h('small', null, t('policy.hiddenDesc')))),
          h('button', {
            type: 'button',
            className: 'dshsc-btn primary dshsc-policy-restore',
            disabled: busy,
            onClick: onUnpark,
          }, t('policy.unpark')),
          h('p', { className: 'dshsc-policy-sub' }, t('policy.hiddenHint')))
      : h('div', { className: 'dshsc-policy-options' },
          option('auto', t('policy.auto'), t('policy.autoDesc')),
          option('manual', t('policy.manual'), t('policy.manualDesc')),
          option('hidden', t('policy.hidden'), t('policy.hiddenDesc')))),

  confirming
    ? h('div', { className: 'dshsc-policy-confirm' },
        h('b', null, t('policy.hiddenConfirmTitle')),
        h('p', null, t('policy.hiddenConfirmBody')),
        h('div', { className: 'dshsc-policy-foot' },
          h('button', {
            type: 'button',
            className: 'dshsc-btn ghost',
            disabled: busy,
            onClick: () => setConfirming(false),
          }, t('action.cancel')),
          h('button', {
            type: 'button',
            className: 'dshsc-btn danger',
            disabled: busy,
            onClick: () => onSave('hidden'),
          }, busy ? t('policy.saving') : t('policy.hiddenConfirm'))))
    : h('div', { className: 'dshsc-policy-foot' },
        h('button', { type: 'button', className: 'dshsc-btn ghost', onClick: onClose }, t('action.cancel')),
        hidden
          ? null
          : h('button', {
              type: 'button',
              className: 'dshsc-btn primary',
              disabled: busy || !dirty || flat,
              onClick: submit,
            }, busy ? t('policy.saving') : t('action.save')))), overlayHost());
}

/**
 * 调用策略弹窗：自动 / 仅手动 / 完全停用。
 *
 * 与「共享设置」「删除」等一致，走标准 Overlay 居中弹窗（遮罩 + 标题 + 底栏），
 * 三档选项排在面板里，视觉对齐共享设置的勾选列表。只收集选择并回调；
 * 写请求在 actions 里，视图不直接 fetch。
 */
import React from 'react';

import { h } from '../host.js';
import { Overlay } from './overlay.js';

export function PolicyModal({ t, row, busy, onClose, onSave, onUnpark }) {
  const initial = row.mode === 'hidden' ? 'auto' : row.mode;
  const [mode, setMode] = React.useState(initial);
  const [confirming, setConfirming] = React.useState(false);

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
    role: 'radio',
    'aria-checked': String(mode === id),
    disabled: busy || flat,
    onClick: () => choose(id),
  },
  h('span', { className: 'dshsc-policyopt-dot', 'aria-hidden': 'true' }),
  h('span', { className: 'dshsc-policyopt-body' },
    h('b', null, label),
    h('small', null, desc)));

  const footer = confirming
    ? [
        h('button', {
          type: 'button',
          key: 'cancel',
          className: 'dshsc-btn ghost',
          disabled: busy,
          onClick: () => setConfirming(false),
        }, t('action.cancel')),
        h('button', {
          type: 'button',
          key: 'confirm',
          className: 'dshsc-btn danger',
          disabled: busy,
          onClick: () => onSave('hidden'),
        }, busy ? t('policy.saving') : t('policy.hiddenConfirm')),
      ]
    : hidden
      ? [
          h('button', { type: 'button', key: 'cancel', className: 'dshsc-btn ghost', onClick: onClose }, t('action.cancel')),
          h('button', {
            type: 'button',
            key: 'restore',
            className: 'dshsc-btn primary',
            disabled: busy,
            onClick: onUnpark,
          }, t('policy.unpark')),
        ]
      : [
          h('button', { type: 'button', key: 'cancel', className: 'dshsc-btn ghost', onClick: onClose }, t('action.cancel')),
          h('button', {
            type: 'button',
            key: 'save',
            className: 'dshsc-btn primary',
            disabled: busy || !dirty || flat,
            onClick: submit,
          }, busy ? t('policy.saving') : t('action.save')),
        ];

  return h(Overlay, {
    t,
    title: t('policy.title'),
    onCancel: onClose,
    footer,
  },
  h('p', { className: 'dshsc-sub', key: 'sub' }, t('policy.subtitle')),
  author ? h('div', { className: 'dshsc-policy-note author', key: 'author' }, t('policy.authorHint')) : null,
  row.legacy ? h('div', { className: 'dshsc-policy-note', key: 'legacy' }, t('policy.legacyHint')) : null,
  row.drift ? h('div', { className: 'dshsc-policy-note warn', key: 'drift' }, t('policy.driftHint')) : null,

  hidden
    ? h('div', { className: 'dshsc-policy-hidden', key: 'hidden' },
        h('div', { className: 'dshsc-panel' },
          h('div', { className: 'dshsc-policyopt active static', role: 'radio', 'aria-checked': 'true' },
            h('span', { className: 'dshsc-policyopt-dot', 'aria-hidden': 'true' }),
            h('span', { className: 'dshsc-policyopt-body' },
              h('b', null, t('policy.hidden')),
              h('small', null, t('policy.hiddenDesc'))))),
        h('p', { className: 'dshsc-sub' }, t('policy.hiddenHint')))
    : h('div', { className: 'dshsc-panel dshsc-policy-options', key: 'options', role: 'radiogroup', 'aria-label': t('policy.title') },
        option('auto', t('policy.auto'), t('policy.autoDesc')),
        option('manual', t('policy.manual'), t('policy.manualDesc')),
        option('hidden', t('policy.hidden'), t('policy.hiddenDesc'))),

  confirming
    ? h('div', { className: 'dshsc-policy-confirm', key: 'confirm' },
        h('b', null, t('policy.hiddenConfirmTitle')),
        h('p', null, t('policy.hiddenConfirmBody')))
    : null);
}

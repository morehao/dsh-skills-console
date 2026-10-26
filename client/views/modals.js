/** 弹层：表单 / 确认 / 共享设置 / 自动共享 + 按 modal.type 分发；外壳在 overlay.js，添加技能在 add-skill.js。 */
import React from 'react';

import { h } from '../host.js';
import { AddSkillModal } from './add-skill.js';
import { Overlay } from './overlay.js';

export function FormModal({ t, title, hint, fields, onCancel, onSubmit }) {
  const [form, setForm] = React.useState(() => Object.fromEntries(fields.map((field) => [field.key, ''])));
  // 默认每项都必填；标了 required: false 的字段（技能名 / ref / 子目录）可留空
  const incomplete = fields.some(
    (field) => field.required !== false && !String(form[field.key] || '').trim(),
  );
  return h(Overlay, {
    t,
    title,
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', {
        key: 's',
        className: 'dshsc-btn primary',
        disabled: incomplete,
        onClick: () => onSubmit(form),
      }, t('action.save')),
    ],
  },
  hint ? h('p', { className: 'dshsc-sub' }, hint) : null,
  ...fields.map((field) =>
    h('label', { className: 'dshsc-field', key: field.key },
      h('span', null, field.label),
      h('input', {
        value: form[field.key],
        placeholder: field.placeholder,
        onChange: (event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value })),
      }))));
}

export function ConfirmModal({ t, title, body, onCancel, onConfirm, danger, confirmLabel, hideCancel = false }) {
  return h(Overlay, {
    t,
    title,
    onCancel,
    footer: [
      ...(hideCancel ? [] : [h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel'))]),
      h('button', { key: 'o', className: `dshsc-btn${danger ? ' danger' : ' primary'}`, onClick: onConfirm }, confirmLabel || t('action.save')),
    ],
  }, h('p', { className: 'dshsc-sub', style: { whiteSpace: 'pre-wrap' } }, body));
}

/**
 * 共享设置：把技能暴露给**不读共享根**的其他 Agent。
 * 这里没有作用范围：DSH 的可见性由本地策略决定，共享只影响别的 agent。
 */
export function ExportsModal({ t, row, agents, onCancel, onSave }) {
  // 只列本机真有目录、且能当导出目标的 agent（`exportable` 由 Host 判断：
  // 读共享根的、DSH 自己扫描根的都不在里面）
  const candidates = agents.filter(
    (agent) => agent.kind === 'agent' && agent.exists && agent.exportable,
  );
  const [targets, setTargets] = React.useState(() => {
    const available = new Set(candidates.map((agent) => agent.target));
    return new Set((row.exports || []).map((item) => item.target).filter((target) => available.has(target)));
  });
  const toggle = (target) => setTargets((prev) => {
    const next = new Set(prev);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  });
  return h(Overlay, {
    t,
    title: `${t('action.exports')} · ${row.name}`,
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', { key: 's', className: 'dshsc-btn primary', onClick: () => onSave([...targets]) }, t('action.save')),
    ],
  },
  h('div', { className: 'dshsc-group' }, t('exports.targets')),
  h('p', { className: 'dshsc-sub' }, t('exports.detectedHint')),
  h('p', { className: 'dshsc-sub' }, t('exports.canonical').replace('{path}', `~/.agents/skills/${row.name}`)),
  candidates.length === 0 ? h('p', { className: 'dshsc-sub' }, t('exports.none')) : null,
  ...candidates.map((agent) =>
    h('label', { className: 'dshsc-check', key: agent.target },
      h('input', {
        type: 'checkbox',
        checked: targets.has(agent.target),
        onChange: () => toggle(agent.target),
      }),
      h('span', null, agent.label),
      // 候选里已经没有「读共享根」的 agent 了；'no' 是常态不必标注，只提示没验证过的
      agent.sharedHome === 'unknown' ? h('small', null, t('exports.sharedUnknown')) : null,
      h('small', { title: agent.dir }, agent.dir))),
  h('p', { className: 'dshsc-sub' }, t('exports.hint')));
}

export function DefaultExportModal({ t, settings, agents, onCancel, onSave }) {
  const [targets, setTargets] = React.useState(() => new Set(
    Array.isArray(settings.exportTargets) ? settings.exportTargets : [],
  ));
  const toggle = (target) => setTargets((prev) => {
    const next = new Set(prev);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  });
  return h(Overlay, {
    t,
    title: t('exportDefault'),
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', { key: 's', className: 'dshsc-btn primary', onClick: () => onSave([...targets]) }, t('action.save')),
    ],
  },
  h('div', { className: 'dshsc-group' }, t('exportDefault.detected')),
  agents.length === 0
    ? h('p', { className: 'dshsc-sub' }, t('exportDefault.none'))
    : h('div', { className: 'dshsc-panel' }, agents.map((agent) =>
        h('label', { className: 'dshsc-check', key: agent.target },
          h('input', {
            type: 'checkbox',
            checked: targets.has(agent.target),
            onChange: () => toggle(agent.target),
          }),
          h('span', null, agent.label),
          h('small', null, agent.dir)))),
  h('p', { className: 'dshsc-sub' }, t('exportDefault.hint')));
}

/** 按 modal.type 分发；未识别的类型不渲染。 */
export function Modals({ t, modal, data, autoLinkAgents, actions, onClose, onSaveAutoLink }) {
  if (modal.type === 'add-skill') {
    return h(AddSkillModal, {
      t,
      onCancel: onClose,
      onProbe: actions.probeSkills,
      onInstall: actions.installSkills,
    });
  }
  if (modal.type === 'add-subscription') {
    return h(FormModal, {
      t,
      title: t('action.addSubscription'),
      hint: t('form.subHint'),
      fields: [
        { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
        { key: 'ref', label: t('form.ref'), placeholder: t('form.refHint'), required: false },
        { key: 'subpath', label: t('form.subpath'), placeholder: 'skills', required: false },
      ],
      onCancel: onClose,
      onSubmit: (form) => void actions.addSubscription(form),
    });
  }
  if (modal.type === 'exports') {
    return h(ExportsModal, {
      t,
      row: modal.row,
      agents: data?.agents?.all || [],
      onCancel: onClose,
      onSave: (targets) => {
        onClose();
        void actions.saveExports(modal.row, targets);
      },
    });
  }
  if (modal.type === 'autolink') {
    return h(DefaultExportModal, {
      t,
      settings: data?.settings || {},
      agents: autoLinkAgents,
      onCancel: onClose,
      onSave: (targets) => void onSaveAutoLink(targets),
    });
  }
  if (modal.type === 'confirm-unpark') {
    const previous = modal.row?.park?.previousMode === 'manual' ? t('policy.manual') : t('policy.auto');
    return h(ConfirmModal, {
      t,
      title: t('policy.unparkTitle'),
      body: t('policy.unparkBody').replace('{mode}', previous),
      confirmLabel: t('policy.unpark'),
      onCancel: onClose,
      onConfirm: modal.onConfirm,
    });
  }
  if (modal.type === 'confirm-delete') {
    return h(ConfirmModal, {
      t,
      title: t('confirm.deleteTitle'),
      body: t('confirm.deleteBody'),
      danger: true,
      confirmLabel: t('action.delete'),
      onCancel: onClose,
      onConfirm: modal.onConfirm,
    });
  }
  if (modal.type === 'confirm-update') {
    return h(ConfirmModal, {
      t,
      title: t('confirm.updateTitle'),
      body: t('confirm.updateBody'),
      confirmLabel: t('action.update'),
      onCancel: onClose,
      onConfirm: modal.onConfirm,
    });
  }
  if (modal.type === 'conflict') {
    const conflicts = modal.detail?.conflicts || [];
    return h(ConfirmModal, {
      t,
      title: t('error.conflictTitle'),
      body: `${modal.message}\n${conflicts.map((item) => `${item.label}: ${item.linkPath}`).join('\n')}`,
      onCancel: onClose,
      onConfirm: onClose,
      confirmLabel: t('action.close'),
      danger: true,
      hideCancel: true,
    });
  }
  return null;
}

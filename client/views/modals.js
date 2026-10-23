/** 弹层：表单 / 确认 / 接入设置 / 自动接入 + 按 modal.type 分发。 */
import React from 'react';

import { h } from '../host.js';

export function Overlay({ t, title, children, footer, onCancel }) {
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return h('div', { className: 'dshsc-overlay', onClick: (event) => { if (event.target === event.currentTarget) onCancel?.(); } },
    h('div', { className: 'dshsc-modal', role: 'dialog', 'aria-modal': 'true' },
      h('button', {
        className: 'dshsc-modal-close',
        'aria-label': t('action.cancel'),
        onClick: (event) => { event.stopPropagation(); onCancel?.(); },
      }, '×'),
      h('h3', null, title),
      children,
      h('div', { className: 'dshsc-modal-foot' }, footer)));
}

export function FormModal({ t, title, hint, fields, onCancel, onSubmit }) {
  const [form, setForm] = React.useState(() => Object.fromEntries(fields.map((field) => [field.key, ''])));
  return h(Overlay, {
    t,
    title,
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', {
        key: 's',
        className: 'dshsc-btn primary',
        disabled: !form[fields[0].key]?.trim?.() || (fields.some((f) => f.key === 'skills') && !form.skills?.trim()),
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

export function ConfirmModal({ t, title, body, onCancel, onConfirm, danger, confirmLabel }) {
  return h(Overlay, {
    t,
    title,
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', { key: 'o', className: `dshsc-btn${danger ? ' danger' : ' primary'}`, onClick: onConfirm }, confirmLabel || t('action.save')),
    ],
  }, h('p', { className: 'dshsc-sub', style: { whiteSpace: 'pre-wrap' } }, body));
}

export function LinksModal({ t, row, agents, workspaces, pickDirectory, onCancel, onSave }) {
  // 本机没有目录的 Agent 不展示；dsh（全局）必选，永远显示
  const candidates = agents.filter(
    (agent) => agent.kind === 'dsh' || (agent.kind !== 'project' && agent.exists),
  );
  const [targets, setTargets] = React.useState(() => {
    // 只保留还能展示的目标：agent 目录都没了就别在保存时把它重新建出来
    const visible = new Set(candidates.map((agent) => agent.target));
    const initial = new Set(row.links.map((link) => link.target).filter((target) => visible.has(target)));
    initial.add('dsh-global');
    return initial;
  });
  const [scopeProjects, setScopeProjects] = React.useState(row.scopeProjects || []);
  const [scopeMode, setScopeMode] = React.useState((row.scopeProjects || []).length > 0 ? 'projects' : 'global');
  const workspacePaths = new Set(workspaces.map((workspace) => workspace.path));
  const otherProjects = scopeProjects.filter((project) => !workspacePaths.has(project));
  const toggle = (target) => setTargets((prev) => {
    const next = new Set(prev);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  });
  const toggleProject = (project) => setScopeProjects((prev) =>
    prev.includes(project) ? prev.filter((item) => item !== project) : [...prev, project]);
  const chooseDirectory = async () => {
    const dir = await pickDirectory?.();
    if (!dir) return;
    setScopeProjects((prev) => (prev.includes(dir) ? prev : [...prev, dir]));
  };
  return h(Overlay, {
    t,
    title: `${t('action.links')} · ${row.name}`,
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', {
        key: 's',
        className: 'dshsc-btn primary',
        onClick: () => onSave([...targets], scopeMode === 'projects' ? scopeProjects.filter((item) => item.trim()) : []),
      }, t('action.save')),
    ],
  },
  h('div', { className: 'dshsc-group' }, t('links.targets')),
  h('p', { className: 'dshsc-sub' }, t('links.detectedHint')),
  h('p', { className: 'dshsc-sub' }, t('links.canonical').replace('{path}', `~/.agents/skills/${row.name}`)),
  ...candidates.map((agent) =>
    h('label', { className: 'dshsc-check', key: agent.target },
      h('input', {
        type: 'checkbox',
        checked: agent.target === 'dsh-global' ? true : targets.has(agent.target),
        disabled: agent.target === 'dsh-global',
        onChange: () => toggle(agent.target),
      }),
      h('span', null, agent.kind === 'dsh' ? t('links.dshGlobal') : agent.label),
      agent.target === 'dsh-global' ? h('small', null, t('links.required')) : null,
      h('small', { title: agent.dir }, agent.dir))),
  h('div', { className: 'dshsc-group' }, t('links.scope')),
  h('label', { className: 'dshsc-check' },
    h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'global', onChange: () => setScopeMode('global') }),
    h('span', null, t('links.scopeGlobal'))),
  h('label', { className: 'dshsc-check' },
    h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'projects', onChange: () => setScopeMode('projects') }),
    h('span', null, t('links.scopeProjects'))),
  scopeMode === 'projects'
    ? h('div', null,
        h('div', { className: 'dshsc-group' }, t('links.workspaces')),
        workspaces.length === 0
          ? h('p', { className: 'dshsc-sub' }, t('links.noWorkspaces'))
          : h('div', { className: 'dshsc-panel' }, workspaces.map((workspace) =>
              h('label', { className: 'dshsc-check', key: workspace.id },
                h('input', {
                  type: 'checkbox',
                  checked: scopeProjects.includes(workspace.path),
                  onChange: () => toggleProject(workspace.path),
                }),
                h('span', null, workspace.title),
                h('small', null, workspace.path)))),
        otherProjects.length > 0
          ? h('div', { className: 'dshsc-group' }, t('links.selected'))
          : null,
        ...otherProjects.map((project) =>
          h('div', { className: 'dshsc-sub-entry', key: project },
            h('span', { className: 'dshsc-code' }, project),
            h('div', { className: 'dshsc-actions' },
              h('button', {
                className: 'dshsc-btn ghost danger',
                onClick: () => setScopeProjects((prev) => prev.filter((item) => item !== project)),
              }, t('action.delete'))))),
        h('button', { className: 'dshsc-btn', style: { alignSelf: 'flex-start', marginTop: 6 }, onClick: () => void chooseDirectory() }, t('links.pickDirectory')))
    : null,
  h('p', { className: 'dshsc-sub' }, t('links.hint')));
}

export function AutoLinkModal({ t, settings, agents, onCancel, onSave }) {
  const [targets, setTargets] = React.useState(() => new Set(
    Array.isArray(settings.autoLinkTargets) ? settings.autoLinkTargets : agents.map((agent) => agent.target),
  ));
  const toggle = (target) => setTargets((prev) => {
    const next = new Set(prev);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  });
  return h(Overlay, {
    t,
    title: t('autoLink'),
    onCancel,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
      h('button', { key: 's', className: 'dshsc-btn primary', onClick: () => onSave([...targets]) }, t('action.save')),
    ],
  },
  h('p', { className: 'dshsc-sub' }, t('links.dshGlobal') + ' · ' + t('links.required')),
  h('div', { className: 'dshsc-group' }, t('autoLink.detected')),
  agents.length === 0
    ? h('p', { className: 'dshsc-sub' }, t('autoLink.none'))
    : h('div', { className: 'dshsc-panel' }, agents.map((agent) =>
        h('label', { className: 'dshsc-check', key: agent.target },
          h('input', {
            type: 'checkbox',
            checked: targets.has(agent.target),
            onChange: () => toggle(agent.target),
          }),
          h('span', null, agent.label),
          h('small', null, agent.dir)))),
  h('p', { className: 'dshsc-sub' }, t('autoLink.hint')));
}

/** 按 modal.type 分发；未识别的类型不渲染。 */
export function Modals({ t, modal, data, autoLinkAgents, pickDirectory, actions, onClose, onSaveAutoLink }) {
  if (modal.type === 'add-skill') {
    return h(FormModal, {
      t,
      title: t('action.addSkill'),
      hint: t('form.hint'),
      fields: [
        { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
        { key: 'skills', label: t('form.skills'), placeholder: 'git-kit, handoff' },
      ],
      onCancel: onClose,
      onSubmit: (form) => void actions.addSkill(form),
    });
  }
  if (modal.type === 'add-subscription') {
    return h(FormModal, {
      t,
      title: t('action.addSubscription'),
      hint: t('form.subHint'),
      fields: [
        { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
        { key: 'ref', label: t('form.ref'), placeholder: t('form.refHint') },
        { key: 'subpath', label: t('form.subpath'), placeholder: 'skills' },
      ],
      onCancel: onClose,
      onSubmit: (form) => void actions.addSubscription(form),
    });
  }
  if (modal.type === 'links') {
    return h(LinksModal, {
      t,
      row: modal.row,
      agents: data?.agents?.all || [],
      workspaces: data?.workspaces || [],
      pickDirectory,
      onCancel: onClose,
      onSave: (targets, scopeProjects) => {
        onClose();
        void actions.saveLinks(modal.row, targets, scopeProjects);
      },
    });
  }
  if (modal.type === 'autolink') {
    return h(AutoLinkModal, {
      t,
      settings: data?.settings || {},
      agents: autoLinkAgents,
      onCancel: onClose,
      onSave: (targets) => void onSaveAutoLink(targets),
    });
  }
  if (modal.type === 'confirm-delete') {
    return h(ConfirmModal, {
      t,
      title: t('confirm.deleteTitle'),
      body: t('confirm.deleteBody'),
      danger: true,
      onCancel: onClose,
      onConfirm: modal.onConfirm,
    });
  }
  if (modal.type === 'confirm-update') {
    return h(ConfirmModal, {
      t,
      title: t('confirm.updateTitle'),
      body: t('confirm.updateBody'),
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
      confirmLabel: t('action.cancel'),
    });
  }
  return null;
}

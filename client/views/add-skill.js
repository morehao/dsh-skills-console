/**
 * 添加技能：先探测来源里的 SKILL.md，再让用户勾选要装哪些（多选）。
 * 探测失败 / 仓库里没有 SKILL.md 时退回手填技能名，保证离线或私有源仍可尝试。
 *
 * 独立于 modals.js：这是一个带自己状态机（idle → probing → picked / empty / failed）的流程，
 * 外壳走 overlay.js，跟其余确认类弹窗没有耦合。
 */
import React from 'react';

import { h } from '../host.js';
import { Overlay } from './overlay.js';

export function AddSkillModal({ t, onCancel, onProbe, onInstall }) {
  const [source, setSource] = React.useState('');
  // idle | probing | picked | empty | failed
  const [phase, setPhase] = React.useState('idle');
  const [options, setOptions] = React.useState([]);
  const [selected, setSelected] = React.useState(() => new Set());
  const [manual, setManual] = React.useState('');
  const [skipped, setSkipped] = React.useState(0);
  const [error, setError] = React.useState(null);
  // 提交安装的进行中 / 失败态：失败时不关窗，就地提示并保留探测结果与勾选
  const [pending, setPending] = React.useState(false);
  const [submitError, setSubmitError] = React.useState(null);

  const reset = (value) => {
    setSource(value);
    setPhase('idle');
    setOptions([]);
    setSelected(new Set());
    setSkipped(0);
    setError(null);
    setSubmitError(null);
  };

  const probe = async () => {
    const value = source.trim();
    if (!value || phase === 'probing' || pending) return;
    setPhase('probing');
    setError(null);
    setSubmitError(null);
    try {
      const result = await onProbe(value);
      const found = Array.isArray(result?.skills) ? result.skills : [];
      setOptions(found);
      setSelected(new Set(found.map((item) => item.name)));
      setSkipped(Math.max(0, Number(result?.skipped) || 0));
      setPhase(found.length > 0 ? 'picked' : 'empty');
    } catch (err) {
      setError(err?.message || String(err));
      setPhase('failed');
    }
  };

  const toggle = (name) => {
    setSubmitError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const names = manual.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const skippedText = skipped > 0 ? t('form.skipped').replace('{n}', String(skipped)) : null;
  const manualMode = phase === 'empty' || phase === 'failed';
  const skills = phase === 'picked' ? [...selected] : names;
  const canSubmit = phase === 'picked' ? selected.size > 0 : manualMode ? names.length > 0 : false;
  const submit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    setSubmitError(null);
    let res;
    try {
      res = await onInstall({ source: source.trim(), skills });
    } catch (err) {
      res = { ok: false, error: err?.message || String(err) };
    }
    // 成功：父级已关窗，组件即将卸载，不再回写状态
    if (res?.ok) return;
    setPending(false);
    setSubmitError(res?.error || t('form.submitFailed'));
  };

  return h(Overlay, {
    t,
    title: t('action.addSkill'),
    onCancel,
    // 提交安装进行中禁止关闭：请求不可取消，允许关闭只是假装取消
    dismissible: !pending,
    footer: [
      h('button', { key: 'c', className: 'dshsc-btn ghost', disabled: pending, onClick: onCancel }, t('action.cancel')),
      h('button', {
        key: 's',
        className: 'dshsc-btn primary',
        disabled: !canSubmit || pending,
        onClick: () => void submit(),
      }, pending ? t('busy.working') : t('action.save')),
    ],
  },
  h('p', { className: 'dshsc-sub' }, t('form.pickHint')),
  h('div', { className: 'dshsc-field' },
    h('span', null, t('form.source')),
    h('div', { className: 'dshsc-inline' },
      h('input', {
        value: source,
        placeholder: t('form.sourceHint'),
        disabled: pending,
        onChange: (event) => reset(event.target.value),
        onKeyDown: (event) => { if (event.key === 'Enter' && !pending) void probe(); },
      }),
      h('button', {
        className: 'dshsc-btn',
        disabled: !source.trim() || phase === 'probing' || pending,
        onClick: () => void probe(),
      }, phase === 'probing' ? t('form.probing') : t('form.probe')))),
  submitError ? h('p', { className: 'dshsc-form-error', role: 'alert' }, submitError) : null,
  phase === 'picked'
    ? h('div', { key: 'picked' },
        h('div', { className: 'dshsc-group' }, t('form.detected').replace('{n}', String(options.length))),
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 6 } },
          h('button', {
            className: 'dshsc-btn ghost',
            disabled: pending,
            onClick: () => { setSubmitError(null); setSelected(new Set(options.map((item) => item.name))); },
          }, t('form.selectAll')),
          h('button', {
            className: 'dshsc-btn ghost',
            disabled: pending,
            onClick: () => { setSubmitError(null); setSelected(new Set()); },
          }, t('form.selectNone'))),
        h('div', { className: 'dshsc-panel' }, options.map((option) =>
          h('label', { className: 'dshsc-check dshsc-skill', key: option.name },
            h('input', {
              type: 'checkbox',
              checked: selected.has(option.name),
              disabled: pending,
              onChange: () => toggle(option.name),
            }),
            h('span', { className: 'dshsc-skill-main' },
              h('span', { className: 'dshsc-skill-name' }, option.name),
              option.description
                ? h('small', { className: 'dshsc-skill-desc' }, option.description)
                : null,
              h('small', { className: 'dshsc-skill-path' }, option.skillPath))))),
        skippedText
          ? h('p', { className: 'dshsc-sub' }, skippedText)
          : null)
    : null,
  phase === 'probing' ? h('p', { className: 'dshsc-sub' }, t('form.probingHint')) : null,
  manualMode
    ? h('div', { key: 'manual' },
        h('p', { className: 'dshsc-sub' }, phase === 'empty'
          ? skippedText || t('form.noSkills')
          : `${t('form.probeFailed')}${error ? ` · ${error}` : ''}`),
        h('label', { className: 'dshsc-field' },
          h('span', null, t('form.skills')),
          h('input', {
            value: manual,
            placeholder: 'git-kit, handoff',
            disabled: pending,
            onChange: (event) => { setManual(event.target.value); if (submitError) setSubmitError(null); },
          })))
    : null,
  h('p', { className: 'dshsc-sub' }, t('form.hint')));
}

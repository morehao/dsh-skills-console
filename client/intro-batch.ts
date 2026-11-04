/**
 * 批量简介：前端控制器 + 确认弹窗（已安装 / 订阅两个入口共用）。
 *
 * 交互收敛到「只选生成范围」（仅缺失 / 全部重算）；并发、遇错继续、落盘不自动续都由
 * Host 定默认值，不在 UI 暴露。任务在后端跑，前端 1s 轮询进度；关页面不会中断任务，
 * 重开时通过 `/state.activeIntroJob` 恢复展示（running 恢复轮询 / interrupted 提示「继续」）。
 */
import React from 'react';

import { h } from './host.js';
import { apiCall } from './api.js';
import type { IntroCapability } from './api.js';
import type { Translate } from './copy.js';
import { Overlay } from './views/overlay.js';

export interface IntroJobItem {
  name: string;
  key?: string;
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  errorCode?: string | null;
}

export interface IntroJobProgress {
  id: string;
  kind: 'installed' | 'subscription';
  mode: 'missing' | 'all';
  status: 'running' | 'paused' | 'done' | 'cancelled' | 'interrupted';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  running: number;
  pending: number;
  items?: IntroJobItem[];
}

/** 轮询一个批量任务；running/paused 时每 1s 拉一次，其余状态停。返回当前进度。 */
export function useIntroJob(jobId: string | null) {
  const [job, setJob] = React.useState<IntroJobProgress | null>(null);
  React.useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let alive = true;
    let timer: any = null;
    const poll = async () => {
      try {
        const res = await apiCall('GET', `/intro-jobs/${encodeURIComponent(jobId)}`);
        if (!alive) return;
        setJob(res.job || null);
        if (res.job && (res.job.status === 'running' || res.job.status === 'paused')) {
          timer = setTimeout(poll, 1000);
        }
      } catch (error) {
        if (!alive) return;
        // 拉不到就停止轮询，界面保留上一次进度
        setJob((prev) => prev);
      }
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);
  return job;
}

/** 建任务（POST /intro-jobs）；返回 job 或 null（失败已在 error 里）。 */
export async function startIntroJob(body: {
  kind: 'installed' | 'subscription';
  subscriptionId?: string;
  names?: string[];
  lang: string;
  mode: 'missing' | 'all';
}) {
  return apiCall('POST', '/intro-jobs', body);
}

export async function cancelIntroJob(id: string) {
  return apiCall('POST', `/intro-jobs/${encodeURIComponent(id)}/cancel`);
}

export async function resumeIntroJob(id: string) {
  return apiCall('POST', `/intro-jobs/${encodeURIComponent(id)}/resume`);
}

export interface IntroBatchModalProps {
  t: Translate;
  capability: IntroCapability | null;
  /** 候选数量（用于成本预估；可按 mode 显示不同） */
  candidateCount: number;
  /** 当前已有可用简介的数量（missing 模式会跳过这些） */
  cachedCount?: number;
  /** 并发度（Host 默认 2，仅用于时长估算） */
  concurrency?: number;
  onClose: () => void;
  onStart: (mode: 'missing' | 'all') => void | Promise<void>;
}

/** 确认弹窗：只选「生成范围」，成本预估在下方；其余默认值不暴露。 */
export function IntroBatchModal({
  t, capability, candidateCount, cachedCount = 0, concurrency = 2, onClose, onStart,
}: IntroBatchModalProps) {
  const [mode, setMode] = React.useState<'missing' | 'all'>('missing');
  const [busy, setBusy] = React.useState(false);
  const enabled = capability?.enabled !== false;
  const available = capability?.available !== false;

  const total = mode === 'all' ? candidateCount : Math.max(0, candidateCount - cachedCount);
  const skip = mode === 'all' ? 0 : Math.min(cachedCount, candidateCount);
  const seconds = Math.max(1, Math.ceil((total / Math.max(1, concurrency)) * 6));

  function opt(key: 'missing' | 'all', title: string, hint: string) {
    const checked = mode === key;
    return h('button', {
      type: 'button',
      className: `dshsc-batchopt${checked ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': String(checked),
      onClick: () => setMode(key),
    },
    h('span', { className: 'dshsc-batchopt-radio' }),
    h('span', { className: 'dshsc-batchopt-body' },
      h('span', { className: 'dshsc-batchopt-title' }, title),
      h('span', { className: 'dshsc-batchopt-hint' }, hint)));
  }

  const cost = t('introBatch.cost')
    .replace('{n}', String(total))
    .replace('{sec}', String(seconds))
    + (skip > 0 ? t('introBatch.costSkip').replace('{skip}', String(skip)) : '');

  const footer = [
    h('button', { key: 'cancel', type: 'button', className: 'dshsc-btn ghost', onClick: onClose }, t('action.cancel')),
    h('button', {
      key: 'start',
      type: 'button',
      className: 'dshsc-btn primary',
      disabled: busy || !available || !enabled || total === 0,
      onClick: async () => {
        setBusy(true);
        try { await onStart(mode); } finally { setBusy(false); }
      },
    }, t('introBatch.start')),
  ];

  return h(Overlay, { t, title: `✨ ${t('introBatch.title')}`, onCancel: onClose, footer },
    h('p', { className: 'dshsc-modal-desc' }, t('introBatch.desc')),
    h('div', { className: 'dshsc-batchopts', role: 'radiogroup', 'aria-label': t('introBatch.scope') },
      opt('missing', t('introBatch.missingTitle'), t('introBatch.missingHint')),
      opt('all', t('introBatch.allTitle'), t('introBatch.allHint'))),
    !available
      ? h('p', { className: 'dshsc-modal-error' }, t('intro.unavailable'))
      : h('p', { className: 'dshsc-batchcost' }, cost));
}

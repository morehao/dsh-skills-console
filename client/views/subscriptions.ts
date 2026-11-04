/** 订阅 tab：仓库列表 + 可展开的快照条目（未装条目给安装入口）。 */
import React from 'react';

import { h } from '../host.js';
import { githubRepoUrl } from '../api.js';
import type { IntroCapability, SkillRow, Subscription, SubscriptionEntry } from '../api.js';
import type { Translate } from '../copy.js';
import { CaretIcon, RefreshIcon, TrashIcon, DownloadIcon } from '../icons.js';
import { IntroModal } from './intro-modal.js';
import { IntroBatchModal } from '../intro-batch.js';

/** 仓库标识归一化：订阅的 source 与账本里的 source 都可能是 owner/repo。 */
function repoOf(source: string | null | undefined) {
  const value = String(source || '').trim().toLowerCase().replace(/\.git$/, '');
  return value || null;
}

function shortCommit(value: string | null | undefined) {
  return typeof value === 'string' ? value.slice(0, 7) : '';
}

export interface SubscriptionsTabProps {
  t: Translate;
  subscriptions: Subscription[];
  rows: SkillRow[];
  expanded: Record<string, boolean>;
  busy: string | null;
  writable: boolean;
  capability?: IntroCapability | null;
  /** 运行中/中断的批量任务（用于禁用重复入口）。 */
  activeJob?: any;
  onToggle: (id: string) => void;
  onRefresh: (subscription: Subscription) => void;
  onDelete: (subscription: Subscription) => void;
  onInstall: (subscription: Subscription, entry: SubscriptionEntry) => void;
  onAdd: () => void;
  /** 为本仓库生成简介：mode 由确认弹窗选择。 */
  onBatchStart?: (subscription: Subscription, mode: 'missing' | 'all') => void | Promise<void>;
}

export function SubscriptionsTab({
  t, subscriptions, rows, expanded, busy, writable, capability = null, activeJob = null,
  onToggle, onRefresh, onDelete, onInstall, onAdd, onBatchStart,
}: SubscriptionsTabProps) {
  const [intro, setIntro] = React.useState<{ subscriptionId: string; name: string } | null>(null);
  const [batchFor, setBatchFor] = React.useState<Subscription | null>(null);

  // 取消订阅 / 刷新后条目没了，弹窗不能留在原地
  React.useEffect(() => {
    if (!intro) return;
    const subscription = subscriptions.find((item) => item.id === intro.subscriptionId);
    const entries = subscription?.snapshot?.entries || [];
    if (entries.some((entry) => entry.name === intro.name)) return;
    setIntro(null);
  }, [intro, subscriptions]);

  function openIntro(subscription: Subscription, entry: SubscriptionEntry) {
    setIntro({
      subscriptionId: subscription.id,
      name: entry.name,
    });
  }

  function introButton(subscription: Subscription, entry: SubscriptionEntry) {
    return h('button', {
      type: 'button',
      className: 'dshsc-intro-btn',
      title: t('intro.open'),
      'aria-haspopup': 'dialog',
      onClick: () => openIntro(subscription, entry),
    },
    h('span', { className: 'dshsc-spark', 'aria-hidden': 'true' }, '✨'),
    t('intro.button'));
  }

  // 只对仍然存在的订阅 + 条目渲染弹窗（刷新期间快照可能被换掉）
  const introSubscription = intro
    ? subscriptions.find((item) => item.id === intro.subscriptionId) || null
    : null;
  const introEntry = introSubscription
    ? (introSubscription.snapshot?.entries || []).find((entry) => entry.name === intro!.name) || null
    : null;
  const introModal = intro && introEntry && capability
    ? (() => {
        const commit = introSubscription!.snapshot?.commit || '';
        const installedAlready = rows.some((row) => {
          if (row.name !== introEntry.name) return false;
          if (row.subscriptionId === introSubscription!.id) return true;
          return repoOf(row.source) === repoOf(introSubscription!.source);
        });
        return h(IntroModal, {
          t,
          name: introEntry.name,
          stamp: commit,
          subtitle: `${introSubscription!.source}@${shortCommit(commit)}`,
          endpoint: `/subscriptions/${encodeURIComponent(introSubscription!.id)}/entries/${encodeURIComponent(introEntry.name)}/intro`,
          capability,
          hint: t('intro.hintRemote')
            .replace('{source}', introSubscription!.source)
            .replace('{commit}', shortCommit(commit) || '—'),
          viewLabel: t('action.install'),
          onView: installedAlready
            ? null
            : () => {
                setIntro(null);
                void onInstall(introSubscription!, introEntry);
              },
          onClose: () => setIntro(null),
        });
      })()
    : null;

  if (subscriptions.length === 0) {
    return h('div', { className: 'dshsc-tabpane' },
      h('div', { className: 'dshsc-listscroll' },
        h(
          'div',
          { className: 'dshsc-empty' },
          h('div', { className: 'dshsc-name' }, t('empty.subs')),
          h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.subsHint')),
          h('div', { style: { marginTop: 10 } },
            h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: onAdd }, t('action.addSubscription'))),
        )));
  }
  return h(React.Fragment, null,
    h('div', { className: 'dshsc-tabpane' },
      // 表头与仓库行共用同一个滚动容器，位置 sticky；仓库信息聚合在一列里，
      // 操作列只放统一的图标按钮。窄屏收成「仓库」/「操作」。
      h('div', { className: 'dshsc-listscroll dshsc-subscroll' },
        h('div', { className: 'dshsc-subhead' },
          h('div', { className: 'dshsc-hrepo' }, t('column.repo')),
          h('div', { className: 'dshsc-hact' }, t('column.actions'))),
        subscriptions.map((subscription) => {
      const entries = subscription.snapshot?.entries || [];
      const repo = repoOf(subscription.source);
      const rowsByName = new Map<string, any>(rows.map((row) => [row.name, row]));
      // 已装判定不能只看 subscriptionId：从同一仓库直接安装、或旧版本接管进来的技能，
      // 账本里可能没有订阅关联；物理上已经在了再给「安装」只会覆盖重装。
      const installedRow = (name: string) => {
        const row = rowsByName.get(name);
        if (!row) return null;
        if (row.subscriptionId === subscription.id) return row;
        return repo && repoOf(row.source) === repo ? row : null;
      };
      const installedCount = entries.filter((entry) => installedRow(entry.name)).length;
      const open = Boolean(expanded[subscription.id]);
      return h(
        'div',
        { className: 'dshsc-sub-block', key: subscription.id },
        h('div', { className: 'dshsc-sub-row' },
          h('div', { className: 'dshsc-sub-info' },
            h('button', {
              className: 'dshsc-caret',
              'aria-expanded': String(open),
              'aria-label': `${subscription.source} ${open ? t('action.collapse') : t('action.expand')}`,
              onClick: () => onToggle(subscription.id),
            }, h(CaretIcon, { open })),
            // 仓库名：能认出来的 owner/repo 渲染成 GitHub 外链（caret 是 button，链接是兄弟节点，不嵌套）；
            // 认不出保持纯文本，不出死链。
            (() => {
              const url = githubRepoUrl(subscription.source);
              return url
                ? h('a', {
                    className: 'dshsc-name dshsc-repolink',
                    href: url,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: t('link.openRepo'),
                  }, subscription.source)
                : h('span', { className: 'dshsc-name' }, subscription.source);
            })(),
            h('span', { className: 'dshsc-tag dshsc-subref' }, subscription.ref || t('subscription.defaultRef')),
            // 已装进度：小圆点 + 数字，全装绿 / 部分黄 / 未装灰
            (() => {
              const partial = installedCount > 0 && installedCount < entries.length;
              const dot = installedCount === 0 ? 'off' : partial ? 'partial' : 'full';
              const label = installedCount === 0
                ? t('subs.progressNone').replace('{total}', String(entries.length))
                : t('subs.progress')
                    .replace('{installed}', String(installedCount))
                    .replace('{total}', String(entries.length));
              return h('span', { className: 'dshsc-progress', title: label },
                h('span', { className: `dshsc-progress-dot ${dot}`, 'aria-hidden': 'true' }),
                installedCount === 0
                  ? h('span', null, label)
                  : h('span', null, h('b', null, String(installedCount)), `/${entries.length} ${t('installed')}`));
            })()),
          h('div', { className: 'dshsc-actions dshsc-iconbar' },
            capability && capability.enabled !== false && capability.available !== false
              ? h('button', {
                  className: 'dshsc-btn ic tint',
                  disabled: busy !== null || Boolean(activeJob),
                  title: t('introBatch.title'),
                  'aria-label': `${t('introBatch.title')} ${subscription.source}`,
                  onClick: () => setBatchFor(subscription),
                }, h('span', { className: 'dshsc-spark', 'aria-hidden': 'true' }, '✨'))
              : null,
            h('button', {
              className: 'dshsc-btn ic tint',
              disabled: busy !== null,
              title: t('action.checkUpdates'),
              'aria-label': `${t('action.checkUpdates')} ${subscription.source}`,
              onClick: () => void onRefresh(subscription),
            }, h(RefreshIcon, { size: 15 })),
            h('span', { className: 'dshsc-act-sep', 'aria-hidden': 'true' }),
            h('button', {
              className: 'dshsc-btn ic danger',
              disabled: busy !== null,
              title: t('action.unsubscribe'),
              'aria-label': `${t('action.unsubscribe')} ${subscription.source}`,
              onClick: () => void onDelete(subscription),
            }, h(TrashIcon, { size: 15 })))),
        open
          ? h('div', { className: 'dshsc-sub-list' },
              h('div', { className: 'dshsc-entryhead' },
                h('div', null, t('column.skill')),
                h('div', null, t('column.status')),
                h('div', { className: 'right' }, t('column.actions'))),
              entries.map((entry) => {
                const installedAlready = Boolean(installedRow(entry.name));
                return h('div', { className: 'dshsc-sub-entry', key: entry.name },
                  h('div', { className: 'dshsc-sub-skill' },
                    h('div', { className: 'dshsc-sub-namerow' },
                      h('span', { className: 'dshsc-name' }, entry.name),
                      capability ? introButton(subscription, entry) : null),
                    entry.description
                      ? h('div', { className: 'dshsc-sub-desc', title: entry.description }, entry.description)
                      : null),
                  h('span', { className: `dshsc-state${installedAlready ? ' ok' : ''}` },
                    installedAlready ? t('installed') : t('notInstalled')),
                  h('div', { className: 'dshsc-actions dshsc-iconbar' },
                    installedAlready
                      // 没有可做的操作也用破折号占位，避免操作列看起来像漏渲染
                      ? h('span', { className: 'dshsc-noop' }, '-')
                      : h('button', {
                          className: 'dshsc-btn ic tint',
                          disabled: !writable || busy !== null,
                          title: t('action.install'),
                          'aria-label': `${t('action.install')} ${entry.name}`,
                          onClick: () => void onInstall(subscription, entry),
                        }, h(DownloadIcon, { size: 15 }))));
              }))
          : null,
      );
    }))),
    introModal,
    batchFor ? h(IntroBatchModal, {
      t,
      capability,
      candidateCount: (batchFor.snapshot?.entries || []).length,
      cachedCount: 0,
      concurrency: 2,
      onClose: () => setBatchFor(null),
      onStart: async (mode) => {
        const target = batchFor;
        setBatchFor(null);
        if (target && onBatchStart) await onBatchStart(target, mode);
      },
    }) : null);
}

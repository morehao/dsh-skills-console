/** 订阅 tab：仓库列表 + 可展开的快照条目（未装条目给安装入口）。 */
import React from 'react';

import { h } from '../host.js';
import { CaretIcon, RefreshIcon } from '../icons.js';
import { IntroModal } from './intro-modal.js';

/** 仓库标识归一化：订阅的 source 与账本里的 source 都可能是 owner/repo。 */
function repoOf(source) {
  const value = String(source || '').trim().toLowerCase().replace(/\.git$/, '');
  return value || null;
}

function shortCommit(value) {
  return typeof value === 'string' ? value.slice(0, 7) : '';
}

export function SubscriptionsTab({
  t, subscriptions, rows, expanded, busy, writable, capability = null,
  onToggle, onRefresh, onDelete, onInstall, onAdd,
}: any) {
  const [intro, setIntro] = React.useState<any>(null);

  // 取消订阅 / 刷新后条目没了，弹窗不能留在原地
  React.useEffect(() => {
    if (!intro) return;
    const subscription = subscriptions.find((item) => item.id === intro.subscriptionId);
    const entries = subscription?.snapshot?.entries || [];
    if (entries.some((entry) => entry.name === intro.name)) return;
    setIntro(null);
  }, [intro, subscriptions]);

  function openIntro(subscription, entry) {
    setIntro({
      subscriptionId: subscription.id,
      name: entry.name,
    });
  }

  function introButton(subscription, entry) {
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
    ? (introSubscription.snapshot?.entries || []).find((entry) => entry.name === intro.name) || null
    : null;
  const introModal = intro && introEntry && capability
    ? (() => {
        const commit = introSubscription.snapshot?.commit || '';
        const installedAlready = rows.some((row) => {
          if (row.name !== introEntry.name) return false;
          if (row.subscriptionId === introSubscription.id) return true;
          return repoOf(row.source) === repoOf(introSubscription.source);
        });
        return h(IntroModal, {
          t,
          name: introEntry.name,
          stamp: commit,
          subtitle: `${introSubscription.source}@${shortCommit(commit)}`,
          endpoint: `/subscriptions/${encodeURIComponent(introSubscription.id)}/entries/${encodeURIComponent(introEntry.name)}/intro`,
          capability,
          hint: t('intro.hintRemote')
            .replace('{source}', introSubscription.source)
            .replace('{commit}', shortCommit(commit) || '—'),
          viewLabel: t('action.install'),
          onView: installedAlready
            ? null
            : () => {
                setIntro(null);
                void onInstall(introSubscription, introEntry);
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
      // 表头与仓库行共用同一个滚动容器，位置 sticky；宽屏 4 列，窄屏收成「仓库」/「操作」。
      h('div', { className: 'dshsc-listscroll dshsc-subscroll' },
        h('div', { className: 'dshsc-subhead' },
          h('div', { className: 'dshsc-hrepo' }, t('column.repo')),
          h('div', { className: 'dshsc-href' }, t('column.ref')),
          h('div', { className: 'dshsc-hcount' }, t('column.entries')),
          h('div', { className: 'dshsc-hact' }, t('column.actions'))),
        subscriptions.map((subscription) => {
      const entries = subscription.snapshot?.entries || [];
      const repo = repoOf(subscription.source);
      const rowsByName = new Map<string, any>(rows.map((row) => [row.name, row]));
      // 已装判定不能只看 subscriptionId：从同一仓库直接安装、或旧版本接管进来的技能，
      // 账本里可能没有订阅关联；物理上已经在了再给「安装」只会覆盖重装。
      const installedRow = (name) => {
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
          h('div', { className: 'dshsc-sub-repo' },
            h('button', {
              className: 'dshsc-caret',
              'aria-expanded': String(open),
              'aria-label': `${subscription.source} ${open ? t('action.collapse') : t('action.expand')}`,
              onClick: () => onToggle(subscription.id),
            }, h(CaretIcon, { open })),
            h('span', { className: 'dshsc-name' }, subscription.source)),
          // 宽屏铺成 Ref / 条目两列；窄屏回到仓库名下方一行。
          h('div', { className: 'dshsc-sub-meta' },
            h('span', { className: 'dshsc-tag dshsc-subref' }, subscription.ref || t('subscription.defaultRef')),
            h('span', { className: 'dshsc-substat' },
              `${entries.length} ${t('skillCount')} · ${t('installed')} ${installedCount}`)),
          h('div', { className: 'dshsc-actions' },
            h('button', {
              className: 'dshsc-btn sq',
              disabled: busy !== null,
              title: t('action.checkUpdates'),
              'aria-label': `${t('action.checkUpdates')} ${subscription.source}`,
              onClick: () => void onRefresh(subscription),
            }, h(RefreshIcon, { size: 13 })),
            h('button', { className: 'dshsc-btn ghost danger', disabled: busy !== null, onClick: () => void onDelete(subscription) }, t('action.unsubscribe')))),
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
                  h('div', { className: 'dshsc-actions' },
                    installedAlready
                      // 没有可做的操作也用破折号占位，避免操作列看起来像漏渲染
                      ? h('span', { className: 'dshsc-noop' }, '-')
                      : h('button', {
                          className: 'dshsc-btn',
                          disabled: !writable || busy !== null,
                          onClick: () => void onInstall(subscription, entry),
                        }, t('action.install'))));
              }))
          : null,
      );
    }))),
    introModal);
}

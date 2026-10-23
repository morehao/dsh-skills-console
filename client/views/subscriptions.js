/** 订阅 tab：仓库列表 + 可展开的快照条目（未装条目给安装入口）。 */
import { h } from '../host.js';
import { CaretIcon, RefreshIcon } from '../icons.js';

export function SubscriptionsTab({
  t, subscriptions, rows, expanded, busy, writable,
  onToggle, onRefresh, onDelete, onInstall, onAdd,
}) {
  if (subscriptions.length === 0) {
    return h(
      'div',
      { className: 'dshsc-empty' },
      h('div', { className: 'dshsc-name' }, t('empty.subs')),
      h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.subsHint')),
      h('div', { style: { marginTop: 10 } },
        h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: onAdd }, t('action.addSubscription'))),
    );
  }
  return h('div', { className: 'dshsc-list' }, subscriptions.map((subscription) => {
    const entries = subscription.snapshot?.entries || [];
    const installedNames = new Set(rows.filter((row) => row.subscriptionId === subscription.id).map((row) => row.name));
    const open = Boolean(expanded[subscription.id]);
    return h(
      'div',
      { className: 'dshsc-sub-block', key: subscription.id },
      h('div', { className: 'dshsc-sub-row' },
        h('button', {
          className: 'dshsc-caret',
          'aria-expanded': String(open),
          'aria-label': `${subscription.source} ${open ? t('action.collapse') : t('action.expand')}`,
          onClick: () => onToggle(subscription.id),
        }, h(CaretIcon, { open })),
        h('span', { className: 'dshsc-name' }, subscription.source),
        h('span', { className: 'dshsc-tag' }, subscription.ref || 'default'),
        h('span', { className: 'dshsc-substat' },
          `${entries.length} ${t('skillCount')} · ${t('installed')} ${installedNames.size}`),
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
        ? h('div', { className: 'dshsc-sub-list' }, entries.map((entry) => {
            const installedAlready = installedNames.has(entry.name);
            return h('div', { className: 'dshsc-sub-entry', key: entry.name },
              h('span', { className: 'dshsc-name' }, entry.name),
              h('span', { className: `dshsc-state${installedAlready ? ' ok' : ''}` },
                installedAlready ? '✓ ' : '', installedAlready ? t('installed') : t('notInstalled')),
              h('div', { className: 'dshsc-actions' },
                installedAlready
                  ? null
                  : h('button', {
                      className: 'dshsc-btn',
                      disabled: !writable || busy !== null,
                      onClick: () => void onInstall(subscription, entry),
                    }, t('action.install'))));
          }))
        : null,
    );
  }));
}

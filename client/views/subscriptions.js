/** 订阅 tab：仓库列表 + 可展开的快照条目（未装条目给安装入口）。 */
import { h } from '../host.js';
import { CaretIcon, RefreshIcon } from '../icons.js';

export function SubscriptionsTab({
  t, subscriptions, rows, expanded, busy, writable,
  onToggle, onRefresh, onDelete, onInstall, onAdd,
}) {
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
  return h('div', { className: 'dshsc-tabpane' },
    // 表头与仓库行共用同一个滚动容器，位置 sticky；宽屏 4 列，窄屏收成「仓库」/「操作」。
    h('div', { className: 'dshsc-listscroll dshsc-subscroll' },
      h('div', { className: 'dshsc-subhead' },
        h('div', { className: 'dshsc-hrepo' }, t('column.repo')),
        h('div', { className: 'dshsc-href' }, t('column.ref')),
        h('div', { className: 'dshsc-hcount' }, t('column.entries')),
        h('div', { className: 'dshsc-hact' }, t('column.actions'))),
      subscriptions.map((subscription) => {
    const entries = subscription.snapshot?.entries || [];
    const installedNames = new Set(rows.filter((row) => row.subscriptionId === subscription.id).map((row) => row.name));
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
            `${entries.length} ${t('skillCount')} · ${t('installed')} ${installedNames.size}`)),
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
  })));
}

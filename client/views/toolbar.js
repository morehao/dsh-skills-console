/** 工具栏：tab 切换、搜索框、平铺 / 按 Agent 视图切换。 */
import { h } from '../host.js';
import { SearchIcon } from '../icons.js';

export function Toolbar({
  t, tab, onTabChange,
  installedCount, subscriptionCount,
  query, onQueryChange,
  view, onViewChange,
}) {
  return h('div', { className: 'dshsc-toolbar' },
    h('div', { className: 'dshsc-tabs' },
      h('button', { className: `dshsc-tab${tab === 'installed' ? ' active' : ''}`, onClick: () => onTabChange('installed') },
        h('span', null, t('tab.installed')), h('span', { className: 'n' }, installedCount)),
      h('button', { className: `dshsc-tab${tab === 'subscriptions' ? ' active' : ''}`, onClick: () => onTabChange('subscriptions') },
        h('span', null, t('tab.subscriptions')), h('span', { className: 'n' }, subscriptionCount))),
    h('div', { className: 'dshsc-spacer' }),
    tab === 'installed' ? [
      h('div', { key: 'search', className: 'dshsc-search' },
        h(SearchIcon, { size: 13 }),
        h('input', {
          type: 'search',
          value: query,
          placeholder: t('search.placeholder'),
          'aria-label': t('search.placeholder'),
          onChange: (event) => onQueryChange(event.target.value),
        }),
        query
          ? h('button', {
              className: 'dshsc-search-clear',
              'aria-label': t('search.clear'),
              title: t('search.clear'),
              onClick: () => onQueryChange(''),
            }, '×')
          : null),
      h('div', { key: 'view', className: 'dshsc-segment' },
        h('button', { className: 'dshsc-btn', 'aria-pressed': String(view === 'flat'), onClick: () => onViewChange('flat') }, t('view.flat')),
        h('button', { className: 'dshsc-btn', 'aria-pressed': String(view === 'agent'), onClick: () => onViewChange('agent') }, t('view.agent'))),
    ] : null);
}

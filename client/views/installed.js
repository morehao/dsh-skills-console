/**
 * 已安装 tab：行 / 分组 / 筛选 / 搜索 / 空态 / 内置技能说明。
 * 纯展示 + 事件回调：不直接发请求，不持有跨视图状态。
 */
import { h } from '../host.js';
import { short } from '../api.js';
import { EyeIcon, InfoIcon, RefreshIcon, TrashIcon } from '../icons.js';

const UPDATABLE = new Set(['update-available', 'locally-modified', 'conflict']);

export function InstalledTab({
  t, data, rows, visibleRows, counts, bulkCount,
  filter, query, view, busy, writable, agentTip, builtinOpen,
  actions,
}) {
  const updatable = (row) => UPDATABLE.has(row.status);

  function statusTag(row) {
    // 「待检查」不逐行刷：由列表头的计数与底部提示承接
    if (row.status === 'unknown') return null;
    // 「无上游」不是待检查：没有可用订阅就永远无法检查更新。
    // 连来源都没有时，下面的 sourceLine 已经写了「无远端来源 · 不检测更新」，不再重复一枚同义标签
    if (row.status === 'no-upstream') {
      return row.source
        ? h('span', { className: 'dshsc-tag', title: t('status.noUpstreamHint') }, t('status.noUpstream'))
        : null;
    }
    const map = {
      current: ['status.current', 'ok', true],
      'update-available': ['status.update', 'warn'],
      'locally-modified': ['status.local', 'warn'],
      conflict: ['status.conflict', 'warn'],
      'upstream-deleted': ['status.deleted', 'warn'],
      'broken-link': ['status.broken', 'err'],
      unmanaged: ['status.unmanaged', ''],
    };
    const [key, cls, check] = map[row.status] || ['status.unknown', ''];
    return h('span', { className: `dshsc-tag ${cls}` }, check ? `✓ ${t(key)}` : t(key));
  }

  function sourceLine(row) {
    if (!row.source) {
      return h('div', { className: 'dshsc-src', title: t('meta.noUpstream') }, t('meta.noUpstream'));
    }
    const ref = row.commit ? `#${short(row.commit)}` : row.ref ? `#${row.ref}` : '';
    const text = `${row.source}${ref}`;
    return h('div', { className: 'dshsc-src', title: text },
      h('span', null, `${t('meta.from')} `),
      h('span', { className: 'dshsc-code' }, text));
  }

  function agentChips(row) {
    const links = row.links.filter((link) => !link.broken);
    // project:* 链接本身就是「仅某项目可见」，用后面的 scope chip 表达，不再重复一枚同名 chip
    const projectLinks = links.filter((link) => String(link.target).startsWith('project:'));
    const labels = links
      .filter((link) => !String(link.target).startsWith('project:'))
      .map((link) => (link.target === 'dsh-global' ? 'DSH' : link.label));
    if (projectLinks.length > 0 && !labels.includes('DSH')) labels.unshift('DSH');
    const projects = row.scopeProjects || [];
    const scopeNames = projects.length > 0
      ? projects.map((project) => project.split('/').pop())
      : projectLinks.map((link) => link.label);
    if (labels.length === 0 && scopeNames.length === 0) {
      return h('span', { className: 'dshsc-unlinked' }, t('meta.unlinked'));
    }
    const chips = labels.slice(0, 3).map((label, index) => h('span', {
      className: `dshsc-agent${label === 'DSH' ? ' dsh' : ''}`,
      key: `agent-${index}`,
      title: label,
    }, label === 'DSH' ? h('i', { className: 'dshsc-dot' }) : null, label));
    if (labels.length > 3) {
      const open = agentTip?.rowName === row.name;
      chips.push(h('button', {
        type: 'button',
        className: 'dshsc-agent more',
        key: 'more',
        'aria-label': `${t('meta.agentsAll')}：${labels.join('、')}`,
        'aria-describedby': open ? 'dshsc-agenttip' : undefined,
        'aria-expanded': String(open),
        onClick: (event) => actions.onOpenAgentTip(event, row.name, labels),
        onMouseEnter: (event) => actions.onOpenAgentTip(event, row.name, labels),
        onFocus: (event) => actions.onOpenAgentTip(event, row.name, labels),
        onMouseLeave: actions.onCloseAgentTip,
        onBlur: actions.onCloseAgentTip,
      }, `+${labels.length - 3}`));
    }
    if (scopeNames.length > 0) {
      chips.push(h('span', {
        className: 'dshsc-agent scope',
        key: 'scope',
        title: `${t('meta.scope')}：${projects.length > 0 ? projects.join('、') : scopeNames.join('、')}`,
      }, `${t('meta.onlyProject')} ${scopeNames.join('、')}`));
    }
    return chips;
  }

  function rowView(row) {
    const off = row.mode === 'off';
    const tracked = row.status !== 'unmanaged';
    const canUpdate = writable && updatable(row);
    return h(
      'div',
      { className: `dshsc-row${off ? ' off' : ''}`, key: row.name },
      h(
        'div',
        { className: 'dshsc-cell' },
        h(
          'div',
          { className: 'dshsc-namerow' },
          h('button', {
            type: 'button',
            className: 'dshsc-name dshsc-namebtn',
            title: row.name,
            'aria-haspopup': 'dialog',
            onClick: () => actions.onView(row),
          }, row.name),
          statusTag(row),
          off ? h('span', { className: 'dshsc-tag off' }, t('status.off')) : null,
        ),
        sourceLine(row),
        off ? h('div', { className: 'dshsc-note' }, t('mode.offHint')) : null,
        row.status === 'broken-link' ? h('div', { className: 'dshsc-note warn' }, t('status.brokenHint')) : null,
      ),
      h('div', { className: 'dshsc-agents' }, agentChips(row)),
      h(
        'div',
        { className: 'dshsc-actions' },
        h('button', {
          className: 'dshsc-switch',
          role: 'switch',
          'aria-checked': String(tracked && row.mode === 'on'),
          'aria-label': `${row.name} ${t('mode.on')}/${t('mode.off')}`,
          // 未纳入追踪时调 setMode 只会报「没有安装记录」，不如直接禁用
          disabled: busy !== null || !tracked,
          onClick: () => void actions.onToggleMode(row),
          title: tracked ? (row.mode === 'on' ? t('mode.off') : t('mode.on')) : t('adopt.switchHint'),
        }, h('span', { className: 'dshsc-knob' })),
        h('button', {
          className: 'dshsc-btn ghost dshsc-view',
          disabled: busy !== null,
          'aria-haspopup': 'dialog',
          title: t('action.view'),
          onClick: () => actions.onView(row),
        }, h(EyeIcon, { size: 12 }), t('action.view')),
        row.status === 'unmanaged'
          ? h('button', {
              className: 'dshsc-btn ghost',
              disabled: !writable || busy !== null,
              title: row.source ? row.source : t('meta.none'),
              onClick: () => void actions.onAdopt(row),
            }, t('action.adopt'))
          : h('button', {
              className: `dshsc-btn ghost${canUpdate ? ' dshsc-update' : ''}`,
              disabled: !canUpdate || busy !== null,
              onClick: () => actions.onUpdate(row),
            }, t('action.update')),
        h('button', { className: 'dshsc-btn ghost', disabled: busy !== null, onClick: () => actions.onLinks(row) }, t('action.links')),
        h('button', {
          className: 'dshsc-btn ghost danger sq',
          disabled: !writable || busy !== null,
          title: t('action.delete'),
          'aria-label': `${t('action.delete')} ${row.name}`,
          onClick: () => actions.onDelete(row),
        }, h(TrashIcon, { size: 13 })),
      ),
    );
  }

  function groupedRows() {
    const groups = [];
    const hasLink = (row, prefix) => row.links.some((link) => !link.broken && String(link.target).startsWith(prefix));
    const dshRows = visibleRows.filter((row) => row.mode === 'on' && !row.scopeProjects?.length && hasLink(row, 'dsh-global'));
    const projectRows = visibleRows.filter((row) => row.mode === 'on' && row.scopeProjects?.length);
    const offRows = visibleRows.filter((row) => row.mode === 'off');
    const unlinkedRows = visibleRows.filter((row) => row.mode === 'on' && !row.scopeProjects?.length
      && !row.links.some((link) => !link.broken));
    groups.push({ key: 'dsh-global', title: t('group.dshGlobal'), rows: dshRows, dot: true });
    if (projectRows.length) groups.push({ key: 'dsh-project', title: t('group.dshProject'), rows: projectRows, dot: true });
    if (offRows.length) groups.push({ key: 'off', title: t('group.off'), rows: offRows });
    if (unlinkedRows.length) groups.push({ key: 'unlinked', title: t('group.unlinked'), rows: unlinkedRows });
    for (const agent of data?.agents?.detected || []) {
      if (agent.kind !== 'agent') continue;
      const matched = visibleRows.filter((row) => row.links.some((link) => link.target === agent.target));
      if (matched.length) groups.push({ key: agent.target, title: agent.label, rows: matched });
    }
    return groups.filter((group) => group.rows.length > 0);
  }

  function filterChip(id, label, dot) {
    return h('button', {
      key: id,
      type: 'button',
      className: `dshsc-fchip${filter === id ? ' active' : ''}`,
      'aria-pressed': String(filter === id),
      title: id === 'unknown' && counts.unknown
        ? t('hint.unknown').replace('{n}', String(counts.unknown))
        : undefined,
      onClick: () => actions.onFilterChange(id),
    }, dot, h('span', null, label), h('span', { className: 'n' }, counts[id]));
  }

  function listBar() {
    return h('div', { className: 'dshsc-listbar' },
      h('div', { className: 'dshsc-filters' },
        filterChip('all', t('filter.all')),
        filterChip('update', t('filter.update'), h('i', { className: 'dshsc-fdot' })),
        filterChip('unknown', t('filter.unknown')),
        filterChip('off', t('filter.off'))),
      h('div', { className: 'dshsc-listbar-actions' },
        h('button', {
          className: 'dshsc-btn sq',
          disabled: busy !== null,
          title: t('action.checkUpdates'),
          'aria-label': t('action.checkUpdates'),
          onClick: () => void actions.onCheckUpdates(),
        }, h(RefreshIcon, { size: 14 })),
        bulkCount > 0
          ? h('button', { className: 'dshsc-btn tint', disabled: !writable || busy !== null, onClick: () => void actions.onUpdateAll() }, `${t('action.updateAll')} · ${bulkCount}`)
          : null));
  }

  function filteredEmpty() {
    return h('div', { className: 'dshsc-empty' },
      h('div', { className: 'dshsc-name' }, t('empty.filtered')),
      h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.filteredHint')),
      h('div', { style: { marginTop: 10 } },
        h('button', {
          className: 'dshsc-btn',
          onClick: actions.onClearFilters,
        }, t('search.clear'))));
  }

  function builtinNotice() {
    // 内置技能是说明，不是告警：默认折叠成一行句子 + 查看入口，点开才列出名字
    const items = (data?.visibleOnly || []).filter((item) => item.source === 'bundled');
    if (items.length === 0) return null;
    const listId = 'dshsc-builtin-list';
    return h('div', { className: 'dshsc-notice' },
      h('div', { className: 'dshsc-notice-row' },
        h(InfoIcon, { size: 13 }),
        h('span', { className: 'dshsc-notice-text' },
          t('visibleOnlyBuiltin'),
          ' ',
          h('button', {
            className: 'dshsc-linkbtn',
            'aria-expanded': String(builtinOpen),
            'aria-controls': builtinOpen ? listId : undefined,
            onClick: actions.onToggleBuiltin,
          }, builtinOpen
            ? t('builtin.hide')
            : t('builtin.view').replace('{n}', String(items.length))))),
      builtinOpen
        ? h('div', { className: 'dshsc-notice-list', id: listId }, items.map((item) => item.name).join('、'))
        : null);
  }

  function visibleOnlyBanners() {
    // 只有「visible but not canonical」的其他来源才需要告警；bundled 已收进 builtinNotice
    const others = (data?.visibleOnly || []).filter((item) => item.source !== 'bundled');
    return others.length > 0
      ? h('div', { className: 'dshsc-banner warn' },
          `${t('visibleOnlyOther')}：${others.map((item) => item.name).join('、')}`)
      : null;
  }

  function content() {
    // 列表区是唯一的滚动容器：顶部的提示 / 筛选条固定，只有行区域跟着页面剩余高度滚。
    if (!data) {
      return h('div', { className: 'dshsc-tabpane' },
        h('div', { className: 'dshsc-listscroll' },
          h('div', { className: 'dshsc-empty' }, t('empty.loading'))));
    }
    if (rows.length === 0) {
      return h('div', { className: 'dshsc-tabpane' },
        h('div', { className: 'dshsc-listscroll' },
          h(
            'div',
            { className: 'dshsc-empty' },
            h('div', { className: 'dshsc-name' }, t('empty.skills')),
            h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.skillsHint')),
            h('div', { style: { marginTop: 10 } },
              h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: actions.onAddSkill }, t('action.addSkill'))),
          )));
    }
    const body = view === 'agent'
      ? h('div', { className: 'dshsc-groupstack' }, groupedRows().map((group) =>
          h('div', { key: group.key },
            h('div', { className: 'dshsc-group-head' },
              group.dot ? h('i', { className: 'dshsc-gdot' }) : null,
              h('span', null, group.title),
              h('span', { className: 'n' }, group.rows.length)),
            h('div', { className: 'dshsc-list' }, group.rows.map(rowView)))))
      : h('div', { className: 'dshsc-list' }, visibleRows.map(rowView));
    return h(
      'div',
      { className: 'dshsc-tabpane' },
      visibleOnlyBanners(),
      builtinNotice(),
      listBar(),
      h('div', { className: 'dshsc-listscroll' },
        visibleRows.length === 0 ? filteredEmpty() : body),
    );
  }

  return content();
}

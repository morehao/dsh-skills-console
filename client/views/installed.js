/**
 * 已安装 tab：行 / 分组 / 筛选 / 搜索 / 空态 / 内置技能说明。
 * 纯展示 + 事件回调：不直接发请求，不持有跨视图状态。
 */
import React from 'react';

import { h } from '../host.js';
import { short } from '../api.js';
import { EyeIcon, InfoIcon, RefreshIcon, TrashIcon, DownloadIcon, PlugIcon } from '../icons.js';
import { PolicyPopover } from './policy-popover.js';

const UPDATABLE = new Set(['update-available', 'locally-modified', 'conflict']);

export function InstalledTab({
  t, data, rows, visibleRows, counts, bulkCount,
  filter, query, view, busy, writable, agentTip, builtinOpen,
  actions,
}) {
  const updatable = (row) => UPDATABLE.has(row.status);
  const [policy, setPolicy] = React.useState(null);
  // 直读共享根的 Agent 不需要导出；旧 Host 若还把它们的链塞进 row.exports，这里也不显示
  const sharedTargets = new Set((data?.agents?.detected || [])
    .filter((agent) => agent.kind === 'agent' && agent.sharedHome === 'yes')
    .map((agent) => agent.target));

  // 行被删 / 筛选掉后浮层不能留在原地
  React.useEffect(() => {
    if (!policy) return;
    if (rows.some((row) => row.name === policy.row.name)) return;
    setPolicy(null);
  }, [policy, rows]);

  function openPolicy(event, row) {
    if (busy !== null || row.kind === 'file') return;
    if (row.mode === 'manual' && row.origin === 'author') return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    setPolicy({
      row,
      anchorEl: el,
      anchor: { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
    });
  }

  /** 行内唯一的状态入口：自动 / 仅手动 / 完全停用 / 旧版 DSH-only / 作者声明 / 需修复。 */
  function policyChip(row) {
    if (row.status === 'unmanaged') {
      return h('span', { className: 'dshsc-chip muted', title: t('adopt.switchHint') }, t('policy.unmanaged'));
    }
    if (row.kind === 'file') {
      return h('span', { className: 'dshsc-chip muted', title: t('policy.flat') }, t('policy.flat'));
    }
    const mode = row.mode || 'auto';
    if (mode === 'hidden') {
      return h('button', {
        type: 'button',
        className: 'dshsc-chip hidden',
        disabled: busy !== null,
        title: t('policy.hiddenHint'),
        'aria-haspopup': 'dialog',
        onClick: (event) => openPolicy(event, row),
      }, t('policy.hidden'));
    }
    if (mode === 'manual' && row.origin === 'author') {
      return h('span', {
        className: 'dshsc-chip author',
        title: t('policy.authorHint'),
      }, t('policy.author'));
    }
    if (row.drift) {
      return h('button', {
        type: 'button',
        className: 'dshsc-chip drift',
        disabled: busy !== null,
        title: t('policy.driftHint'),
        'aria-haspopup': 'dialog',
        onClick: (event) => openPolicy(event, row),
      }, t('policy.drift'));
    }
    if (row.legacy === 'dsh-off') {
      return h('button', {
        type: 'button',
        className: 'dshsc-chip legacy',
        disabled: busy !== null,
        title: t('policy.legacyHint'),
        'aria-haspopup': 'dialog',
        onClick: (event) => openPolicy(event, row),
      }, t('policy.legacy'));
    }
    if (mode === 'manual') {
      return h('button', {
        type: 'button',
        className: 'dshsc-chip manual',
        disabled: busy !== null,
        title: t('policy.manualOnlyHint'),
        'aria-haspopup': 'dialog',
        onClick: (event) => openPolicy(event, row),
      }, t('policy.manual'));
    }
    return h('button', {
      type: 'button',
      className: 'dshsc-chip auto',
      disabled: busy !== null,
      title: t('policy.open'),
      'aria-haspopup': 'dialog',
      onClick: (event) => openPolicy(event, row),
    }, t('policy.auto'));
  }

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

  /**
   * Agent 列只列「显式共享」：不支持共享根、且真的建了共享链的 Agent。
   * 直读 `~/.agents/skills` 的 Agent 装好即可用，不在这里重复出现。
   */
  function agentChips(row) {
    const exported = (row.exports || []).filter(
      (item) => !item.broken && !sharedTargets.has(item.target),
    );
    if (exported.length === 0) {
      return [h('span', {
        key: 'none',
        className: 'dshsc-unlinked',
        title: t('meta.noExportHint'),
      }, t('meta.noExport'))];
    }
    const chips = [];
    const labels = exported.map((item) => item.label);
    const shown = exported.slice(0, 3);
    shown.forEach((item, index) => chips.push(h('span', {
      className: 'dshsc-agent',
      key: `agent-${index}`,
      title: item.label,
    }, item.label)));
    if (exported.length > shown.length) {
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
      }, `+${exported.length - shown.length}`));
    }
    return chips;
  }

  /**
   * 表头：宽屏 4 列；窄屏收成「技能（含 Agent）」/「策略与操作」两列。
   * 不挂 columnheader 语义：行本身不是表格结构，避免对读屏软件撒谎。
   */
  function headView() {
    return h('div', { className: 'dshsc-listhead' },
      h('div', { className: 'dshsc-hskill' },
        h('span', { className: 'dshsc-col-wide' }, t('column.skill')),
        h('span', { className: 'dshsc-col-narrow' }, t('column.skillAgents'))),
      h('div', { className: 'dshsc-hagents' }, t('column.agents')),
      h('div', { className: 'dshsc-hpolicy' }, t('column.policy')),
      h('div', { className: 'dshsc-hactions' },
        h('span', { className: 'dshsc-col-wide' }, t('column.actions')),
        h('span', { className: 'dshsc-col-narrow' }, t('column.policyActions'))));
  }

  function listView(listRows) {
    return h('div', { className: 'dshsc-list' }, headView(), listRows);
  }

  function rowView(row) {
    const parked = row.mode === 'hidden';
    const off = parked || row.enabled === false;
    const canUpdate = writable && updatable(row);
    // 启用却看不见：要么真身不在扫描根里，要么项目副本盖过了停用标记
    const hidden = !off && !row.visible;
    const manualOnly = hidden && Boolean(row.visibility?.selfHidden);
    // 可见性是中性状态，不再挂「DSH」标签：实心点=模型可见，空心点=模型不可见
    const visLabel = hidden ? t('meta.modelHidden') : t('meta.modelVisible');
    return h(
      'div',
      { className: `dshsc-row${off ? ' off' : ''}`, key: row.name },
      h(
        'div',
        { className: 'dshsc-cell' },
        h(
          'div',
          { className: 'dshsc-namerow' },
          off
            ? null
            : h('span', {
                className: `dshsc-vdot${hidden ? ' hidden' : ''}`,
                role: 'img',
                title: visLabel,
                'aria-label': visLabel,
              }),
          h('button', {
            type: 'button',
            className: 'dshsc-name dshsc-namebtn',
            title: row.name,
            'aria-haspopup': 'dialog',
            onClick: () => actions.onView(row),
          }, row.name),
          statusTag(row),
        ),
        sourceLine(row),
        parked
          ? h('div', { className: 'dshsc-note' }, t('policy.hiddenNote'))
          : row.legacy === 'dsh-off'
            ? h('div', { className: 'dshsc-note' }, t('policy.legacyNote'))
            : null,
        row.origin === 'author' && row.mode === 'manual'
          ? h('div', { className: 'dshsc-note' }, t('policy.authorNote'))
          : null,
        row.drift ? h('div', { className: 'dshsc-note warn' }, t('policy.driftNote')) : null,
        // 仅手动用行内 chip 表达；被更靠前的同名副本盖住时由下面的 foreignWinner 点名。
        hidden && !manualOnly && row.visibility?.winnerIsCanonical !== false
          ? h('div', { className: 'dshsc-note warn' }, t('visibility.hiddenHint'))
          : null,
        row.visibility?.shadowScopeMismatch
          ? h('div', { className: 'dshsc-note warn' }, t('visibility.scopeMismatch'))
          : null,
        // 同名副本在更小的 rank 上：模型看到的不是这一份，必须点名路径
        row.visibility?.winnerIsCanonical === false
          ? h(
              'div',
              { className: 'dshsc-note warn' },
              t('visibility.foreignWinner').replace('{path}', row.visibility.winnerPath || '?'),
            )
          : null,
        row.status === 'broken-link' ? h('div', { className: 'dshsc-note warn' }, t('status.brokenHint')) : null,
      ),
      h('div', { className: 'dshsc-agents' }, agentChips(row)),
      h('div', { className: 'dshsc-policy' }, policyChip(row)),
      h(
        'div',
        { className: 'dshsc-actions' },
        parked
          // 完全停用：只给「恢复」和「删除」；更新/共享在 parked 期间没有意义
          ? [
              h('button', {
                key: 'restore',
                className: 'dshsc-btn ghost sq dshsc-restore',
                disabled: !writable || busy !== null,
                title: t('policy.unpark'),
                'aria-label': `${t('policy.unpark')} ${row.name}`,
                onClick: () => actions.onRequestUnpark(row),
              }, h(RefreshIcon, { size: 13 })),
              h('button', {
                key: 'delete',
                className: 'dshsc-btn ghost danger sq',
                disabled: !writable || busy !== null,
                title: t('action.delete'),
                'aria-label': `${t('action.delete')} ${row.name}`,
                onClick: () => actions.onDelete(row),
              }, h(TrashIcon, { size: 13 })),
            ]
          : [
              h('button', {
                key: 'view',
                className: 'dshsc-btn ghost sq dshsc-view',
                disabled: busy !== null,
                'aria-haspopup': 'dialog',
                title: t('action.view'),
                'aria-label': `${t('action.view')} ${row.name}`,
                onClick: () => actions.onView(row),
              }, h(EyeIcon, { size: 13 })),
              row.status === 'unmanaged'
                ? h('button', {
                    key: 'adopt',
                    className: 'dshsc-btn ghost',
                    disabled: !writable || busy !== null,
                    title: row.source ? row.source : t('meta.none'),
                    onClick: () => void actions.onAdopt(row),
                  }, t('action.adopt'))
                : h('button', {
                    key: 'update',
                    className: `dshsc-btn ghost sq${canUpdate ? ' dshsc-update' : ''}`,
                    disabled: !canUpdate || busy !== null,
                    title: t('action.update'),
                    'aria-label': `${t('action.update')} ${row.name}`,
                    onClick: () => actions.onUpdate(row),
                  }, h(DownloadIcon, { size: 13 })),
              h('button', {
                key: 'exports',
                className: 'dshsc-btn ghost sq',
                disabled: busy !== null,
                title: t('action.exports'),
                'aria-label': `${t('action.exports')} ${row.name}`,
                onClick: () => actions.onExports(row),
              }, h(PlugIcon, { size: 13 })),
              h('button', {
                key: 'delete',
                className: 'dshsc-btn ghost danger sq',
                disabled: !writable || busy !== null,
                title: t('action.delete'),
                'aria-label': `${t('action.delete')} ${row.name}`,
                onClick: () => actions.onDelete(row),
              }, h(TrashIcon, { size: 13 })),
            ],
      ),
    );
  }

  function groupedRows() {
    const groups = [];
    const visibleGroup = visibleRows.filter((row) => row.mode === 'auto' && row.enabled !== false && row.visible);
    const manualRows = visibleRows.filter((row) => row.mode === 'manual');
    const offRows = visibleRows.filter((row) => row.mode === 'hidden' || row.enabled === false);
    const hiddenRows = visibleRows.filter((row) => row.mode === 'auto' && row.enabled !== false && !row.visible);
    if (visibleGroup.length) groups.push({ key: 'visible', title: t('group.visible'), rows: visibleGroup, dot: true });
    if (manualRows.length) groups.push({ key: 'manual', title: t('group.manual'), rows: manualRows });
    if (offRows.length) groups.push({ key: 'off', title: t('group.off'), rows: offRows });
    if (hiddenRows.length) groups.push({ key: 'hidden', title: t('group.hidden'), rows: hiddenRows });
    for (const agent of data?.agents?.detected || []) {
      if (agent.kind !== 'agent') continue;
      // 只给「有显式共享」的 Agent 分组；直读共享根的 Agent 不逐行展示
      const matched = visibleRows.filter(
        (row) => (row.exports || []).some((item) => item.target === agent.target && !item.broken),
      );
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
        filterChip('manual', t('filter.manual')),
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
            listView(group.rows.map(rowView)))))
      : listView(visibleRows.map(rowView));
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

  const popover = policy
    ? h(PolicyPopover, {
        t,
        row: policy.row,
        anchor: policy.anchor,
        anchorEl: policy.anchorEl,
        busy: busy !== null,
        onClose: () => setPolicy(null),
        onSave: (mode) => {
          const target = policy.row;
          setPolicy(null);
          void actions.onSetInvocation(target, mode);
        },
        onUnpark: () => {
          const target = policy.row;
          setPolicy(null);
          actions.onRequestUnpark(target);
        },
      })
    : null;
  return h(React.Fragment, null, content(), popover);
}

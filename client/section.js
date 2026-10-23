/**
 * Section：组合 hooks + 派生值 + 拼装 views。
 * 这里不直接发请求（交给 hooks），也不写视图细节（交给 views）。
 */
import React from 'react';

import { h } from './host.js';
import { apiCall } from './api.js';
import { CSS } from './styles.js';
import { useSkillActions } from './actions.js';
import { useAgentTip, useSettingsPopover, useSkillsData } from './hooks.js';
import { Header } from './views/header.js';
import { Toolbar } from './views/toolbar.js';
import { InstalledTab } from './views/installed.js';
import { AgentTip } from './views/agent-tip.js';
import { SubscriptionsTab } from './views/subscriptions.js';
import { Modals } from './views/modals.js';

const UPDATABLE = new Set(['update-available', 'locally-modified', 'conflict']);

export function Section({ t, page = false, pickDirectory, onPlacementChange }) {
  const { data, error, busy, toast, setToast, setBusy, reload, run } = useSkillsData();
  const [tab, setTab] = React.useState('installed');
  const [view, setView] = React.useState('flat');
  const [modal, setModal] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});
  const [placementBusy, setPlacementBusy] = React.useState(null);
  // POST /settings 成功后 data 还是旧的；用本地覆盖值，避免开关弹回旧状态（重开面板时尤其明显）
  const [placementOverride, setPlacementOverride] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [builtinOpen, setBuiltinOpen] = React.useState(false);
  const { settingsOpen, settingsRef, settingsPlacement, closeSettings, toggleSettings } = useSettingsPopover();
  const { agentTip, agentTipPos, agentTipRef, openAgentTip, closeAgentTip } = useAgentTip();

  const rows = data?.installs || [];
  const actions = useSkillActions({ t, rows, reload, run, setBusy, setToast, setModal });

  const writable = Boolean(data) && !data?.readOnly && data?.cli?.usable;
  const updatable = (row) => UPDATABLE.has(row.status);
  const updateCount = rows.filter(updatable).length;
  // 批量更新只处理无本地改动、可直接 fast-forward 的行；有本地改动仍需逐个确认
  const bulkCount = rows.filter((row) => row.status === 'update-available').length;
  const unknownCount = rows.filter((row) => row.status === 'unknown').length;
  const offCount = rows.filter((row) => row.mode === 'off').length;
  const counts = { all: rows.length, update: updateCount, unknown: unknownCount, off: offCount };
  const queryText = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (filter === 'update' && !updatable(row)) return false;
    if (filter === 'unknown' && row.status !== 'unknown') return false;
    if (filter === 'off' && row.mode !== 'off') return false;
    if (!queryText) return true;
    const agentLabels = row.links.map((link) => (link.target === 'dsh-global' ? 'DSH' : link.label));
    return [row.name, row.source || '', ...agentLabels].join(' ').toLowerCase().includes(queryText);
  });

  const autolinkTargets = (data?.agents?.detected || []).filter((agent) => agent.kind === 'agent');
  const autoLinkSelection = data?.settings?.autoLinkTargets;
  const autoLinkAgents = Array.isArray(autoLinkSelection)
    ? autolinkTargets.filter((agent) => autoLinkSelection.includes(agent.target))
    : autolinkTargets;
  const autoLinkLabel = [t('links.dshGlobal'), ...autoLinkAgents.map((agent) => agent.label)].join('、');
  const placement = (placementOverride ?? data?.settings?.placement) === 'sidebar' ? 'sidebar' : 'settings';

  async function changePlacement(next) {
    if (next === placement || placementBusy) return;
    setPlacementBusy(next);
    try {
      await apiCall('POST', '/settings', { placement: next });
      setPlacementOverride(next);
      closeSettings();
      onPlacementChange?.(next);
      setPlacementBusy(null);
    } catch (err) {
      setToast({ kind: 'err', text: err.message });
      setPlacementBusy(null);
    }
  }

  async function saveAutoLink(targets) {
    setModal(null);
    await run('settings', () => apiCall('POST', '/settings', { autoLinkTargets: targets }));
  }

  const installedActions = {
    onAdopt: actions.adopt,
    onToggleMode: actions.toggleMode,
    onUpdate: actions.requestUpdate,
    onDelete: actions.requestDelete,
    onLinks: (row) => setModal({ type: 'links', row }),
    onCheckUpdates: actions.checkUpdates,
    onUpdateAll: actions.updateAll,
    onAddSkill: actions.requestAddSkill,
    onFilterChange: setFilter,
    onQueryChange: setQuery,
    onOpenAgentTip: openAgentTip,
    onCloseAgentTip: closeAgentTip,
    onToggleBuiltin: () => setBuiltinOpen((prev) => !prev),
    onClearFilters: () => { setQuery(''); setFilter('all'); },
  };

  const subscriptionActions = {
    onToggle: (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] })),
    onRefresh: actions.refreshSubscription,
    onDelete: actions.deleteSubscription,
    onInstall: actions.installFromSubscription,
    onAdd: actions.requestAddSubscription,
  };

  const root = h(
    'div',
    { className: 'dshsc-root' },
    h('style', null, CSS),
    h(Header, {
      t,
      page,
      plugin: data?.plugin,
      writable,
      autoLinkLabel,
      autoLinkCount: autoLinkAgents.length + 1,
      tab,
      settingsOpen,
      settingsRef,
      settingsPlacement,
      placement,
      placementBusy,
      readOnly: Boolean(data?.readOnly),
      onToggleSettings: toggleSettings,
      onChangePlacement: (next) => void changePlacement(next),
      onOpenAutoLink: () => setModal({ type: 'autolink' }),
      onAddSkill: actions.requestAddSkill,
      onAddSubscription: actions.requestAddSubscription,
    }),

    error ? h('div', { className: 'dshsc-banner err' }, `${error} · `, h('button', { className: 'dshsc-btn ghost', onClick: () => void reload() }, t('action.retry'))) : null,
    data?.readOnly ? h('div', { className: 'dshsc-banner warn' }, t('banner.readonly')) : null,
    data && !data.cli?.usable ? h('div', { className: 'dshsc-banner err' }, `${t('banner.cli')} · ${data.cli?.source || ''} ${data.cli?.version || ''}`) : null,

    h(Toolbar, {
      t,
      tab,
      onTabChange: setTab,
      installedCount: rows.length,
      subscriptionCount: data?.subscriptions?.length || 0,
      query,
      onQueryChange: setQuery,
      view,
      onViewChange: setView,
    }),

    tab === 'installed'
      ? h(InstalledTab, {
          t,
          data,
          rows,
          visibleRows,
          counts,
          bulkCount,
          filter,
          query,
          view,
          busy,
          writable,
          agentTip,
          builtinOpen,
          actions: installedActions,
        })
      : h(SubscriptionsTab, {
          t,
          subscriptions: data?.subscriptions || [],
          rows,
          expanded,
          busy,
          writable,
          ...subscriptionActions,
        }),

    busy ? h('div', { className: 'dshsc-meta' }, `${t('busy.working')} ${busy}`) : null,
    toast ? h('div', { className: `dshsc-toast ${toast.kind}` }, toast.text) : null,
    modal ? h(Modals, {
      t,
      modal,
      data,
      autoLinkAgents: autolinkTargets,
      pickDirectory,
      actions: {
        addSkill: actions.addSkill,
        addSubscription: actions.addSubscription,
        saveLinks: actions.saveLinks,
      },
      onClose: () => setModal(null),
      onSaveAutoLink: saveAutoLink,
    }) : null,
    agentTip ? h(AgentTip, { t, agentTip, agentTipPos, nodeRef: agentTipRef }) : null,
  );
  return page ? h('div', { className: 'dshsc-page' }, root) : root;
}

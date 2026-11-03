/** 页头：标题 / 身份胶囊 / 插件工具（刷新检查更新 → GitHub + 设置浮层）/ 业务动作。 */
import React from 'react';
import type { RefObject } from 'react';

import { h } from '../host.js';
import { GITHUB_URL } from '../api.js';
import type { PluginInfo, SettingsPlacement } from '../api.js';
import type { Translate } from '../copy.js';
import { Logo, GitHubIcon, GearIcon, RefreshIcon } from '../icons.js';
import { writePendingUpdate } from '../update-store.js';
import { deriveUpdateUiState, updateStatusLabel } from '@morehao/dsh-plugin-kit/update/client';
import type { UpdateClientState } from '@morehao/dsh-plugin-kit/update/client';

/** 安装标识：跟页面外安装插件时输入的一模一样（`@scope/name@version`），不带 `v`。 */
function installSpec(plugin: PluginInfo | null | undefined): string | null {
  const name = plugin?.fullName || plugin?.name;
  if (!name) return null;
  return plugin.version ? `${name}@${plugin.version}` : name;
}

/** 插件自更新控制器视图（`usePluginUpdate` 的返回子集）：胶囊就地检查/更新，详情走弹窗。 */
export interface HeaderPluginUpdate {
  status?: {
    currentVersion?: string;
    latestVersion?: string | null;
    updateAvailable?: boolean;
    canAutoUpdate?: boolean;
    checkFailed?: boolean;
    restartRequired?: boolean;
    updatedVersion?: string | null;
  } | null;
  checking?: boolean;
  applying?: boolean;
  checkError?: { code?: string | null; message?: string } | null;
  applyError?: { code?: string | null; message?: string } | null;
  check?: (fresh?: boolean) => Promise<unknown>;
  apply?: () => Promise<unknown>;
  /** 原始 controller 状态（plugin-kit `UpdateClientState`），用于共享的状态派生。 */
  clientState?: UpdateClientState | null;
}

export interface HeaderProps {
  t: Translate;
  page: boolean;
  plugin?: PluginInfo | null;
  writable: boolean;
  autoLinkLabel: string;
  autoLinkCount: number;
  tab: string;
  settingsOpen: boolean;
  settingsRef: RefObject<Element | null>;
  settingsPlacement: SettingsPlacement;
  placement: string;
  placementBusy: string | null;
  readOnly: boolean;
  pluginUpdate?: HeaderPluginUpdate | null;
  onCheckUpdate: () => void;
  onToggleSettings: () => void;
  onChangePlacement: (next: string) => void;
  onOpenAutoLink: () => void;
  onAddSkill: () => void;
  onAddSubscription: () => void;
  onOpenAbout: () => void;
}

export function Header({
  t, page, plugin, writable,
  autoLinkLabel, autoLinkCount, tab,
  settingsOpen, settingsRef, settingsPlacement, placement, placementBusy, readOnly,
  pluginUpdate, onCheckUpdate,
  onToggleSettings, onChangePlacement,
  onOpenAutoLink, onAddSkill, onAddSubscription, onOpenAbout,
}: HeaderProps) {
  const spec = installSpec(plugin);
  // 内联更新胶囊：状态由 controller 派生；两段确认的 confirming 是本组件局部态。
  const [confirming, setConfirming] = React.useState(false);
  const upd = pluginUpdate || null;
  const st = upd?.status || null;
  const latest = st?.latestVersion || null;
  const current = st?.currentVersion || '—';

  // 跨插件的状态派生统一走 plugin-kit（与 dsh-github-trending 同一套）：
  //   visual → data-state；showBadge/badgeVersion → 版本徽标；busy/settled/actionable → 交互。
  // 优先用原始 controller 状态；缺失时回退到由旧字段派生的等价状态，保证组件可独立渲染。
  const clientState: UpdateClientState = upd?.clientState ?? {
    status: upd?.applying ? 'applying'
      : upd?.checking ? 'checking'
      : upd?.checkError ? 'failed'
      : st?.updateAvailable ? 'available'
      : st ? 'current'
      : 'idle',
    view: st === null ? null : {
      packageName: '',
      currentVersion: String(current),
      latestVersion: latest,
      updateAvailable: Boolean(st.updateAvailable),
      checkFailed: Boolean(st.checkFailed),
      canApply: st.canAutoUpdate !== false,
      installKind: st.canAutoUpdate === false ? 'link' : 'unknown',
      manualCommand: '',
    },
    error: (() => {
      const e = upd?.checkError ?? upd?.applyError ?? null;
      if (e === null) return null;
      return { message: String(e.message ?? ''), ...(typeof e.code === 'string' ? { code: e.code } : {}) };
    })(),
  };
  const ui = deriveUpdateUiState(clientState);
  const label = updateStatusLabel(clientState);

  // 语义 key → 本仓文案（plugin-kit 只给「该显示哪条」，文案留在本仓 i18n）。
  const LABEL_COPY: Record<string, string> = {
    checking: t('pluginUpdate.capsule.checking'),
    applying: t('pluginUpdate.capsule.applying').replace('{version}', label.params.version || ''),
    available: t('pluginUpdate.capsule.available').replace('{version}', label.params.latest || ''),
    latest: t('pluginUpdate.capsule.latest').replace('{version}', label.params.version || ''),
    done: t('pluginUpdate.capsule.restart'),
    checkFailed: t('pluginUpdate.capsule.checkFailed'),
    failed: t('pluginUpdate.capsule.checkFailed'),
  };
  const state = ui.visual;
  const tip = LABEL_COPY[label.key] ?? t('pluginUpdate.capsule.latest').replace('{version}', String(current));

  const busy = ui.busy;

  // 确认态：有新版本且可更新时，点图标弹确认气泡；更新中/更新后自动收起。
  React.useEffect(() => {
    if (!ui.actionable) setConfirming(false);
  }, [ui.actionable]);

  // 点刷新图标的动作：可更新 → 开确认气泡；失败 → 重试；其余 → 检查。
  function onRefreshClick() {
    if (busy) return;
    if (ui.actionable) { setConfirming((v) => !v); return; }
    void upd?.check?.(true);
  }

  // 「确认更新」：落「刚点过更新」的记号后触发 apply，面板随插件自卸而消失，
  // 重开的新进程靠这个记号渲染跨进程恢复提示。
  function onConfirmUpdate() {
    setConfirming(false);
    try { writePendingUpdate(String(current || ''), String(latest || '')); } catch { /* 记不上也不拦更新 */ }
    void upd?.apply?.();
  }

  // 版本徽标：仅「有新版本且可自动更新、非忙碌、未落定」时出现（由 plugin-kit 派生）；
  // 点击等同点图标（弹确认气泡）。
  const showBadge = ui.showBadge;
  const confirmOpen = confirming && ui.actionable;

  // 插件级工具跟身份胶囊同组：版本徽标 + 刷新图标、GitHub 开仓库、齿轮开设置；业务动作留在右侧
  const headTools = h('div', { className: 'dshsc-tools' },
    // 刷新单元：版本徽标 + 纯图标刷新。状态由 data-state 表达，文案走 tooltip。
    h('div', { className: 'dshsc-refresh-unit' },
      showBadge
        ? h('button', {
            type: 'button',
            className: 'dshsc-ver-badge',
            title: t('pluginUpdate.capsule.badgeTitle').replace('{version}', String(latest || '')),
            'aria-label': t('pluginUpdate.capsule.badgeTitle').replace('{version}', String(latest || '')),
            onClick: () => setConfirming((v) => !v),
          }, `v${latest}`)
        : null,
      h('button', {
        type: 'button',
        className: 'dshsc-tool dshsc-refresh',
        'data-state': state,
        disabled: busy,
        title: tip,
        'aria-label': tip,
        'aria-expanded': String(confirmOpen),
        onClick: onRefreshClick,
      }, h(RefreshIcon, { size: 15 }))),
    confirmOpen
      ? h('div', { className: 'dshsc-pop dshsc-confirm-pop', role: 'dialog', 'aria-label': t('pluginUpdate.capsule.confirmHint').replace('{version}', String(latest || '')) },
          h('div', { className: 'dshsc-pop-title' }, t('pluginUpdate.capsule.confirmHint').replace('{version}', String(latest || ''))),
          h('button', {
            type: 'button', className: 'dshsc-linkbtn dshsc-confirm-details',
            onClick: () => { setConfirming(false); onCheckUpdate(); },
          }, t('pluginUpdate.viewReleaseNotes')),
          h('div', { className: 'dshsc-confirm-actions' },
            h('button', { className: 'dshsc-btn ghost', type: 'button', onClick: () => setConfirming(false) }, t('pluginUpdate.capsule.cancel')),
            h('button', { className: 'dshsc-btn primary', type: 'button', onClick: onConfirmUpdate }, t('pluginUpdate.capsule.confirmYes'))))
      : null,
    // 先源码、后设置：GitHub 紧挨包名，齿轮留在工具组最外侧
    h('a', {
      className: 'dshsc-tool',
      href: GITHUB_URL,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: t('github.open'),
      'aria-label': t('github.open'),
    }, h(GitHubIcon, { size: 15 })),
    h('div', { className: 'dshsc-settings' },
      h('button', {
        ref: settingsRef,
        className: 'dshsc-tool',
        'aria-haspopup': 'dialog',
        'aria-expanded': String(settingsOpen),
        type: 'button',
        'aria-label': t('settings.title'),
        title: t('settings.title'),
        onClick: onToggleSettings,
      }, h(GearIcon, { size: 15 })),
      settingsOpen
        ? h('div', {
            className: 'dshsc-pop',
            role: 'dialog',
            'aria-label': t('settings.title'),
            style: settingsPlacement.side === 'right'
              ? { left: 0, width: `${settingsPlacement.width}px` }
              : { right: 0, width: `${settingsPlacement.width}px` },
          },
            h('div', { className: 'dshsc-pop-title' }, t('settings.title')),
            h('div', { className: 'dshsc-pop-label' },
              h('span', { className: 'dshsc-pop-name' },
                t('placement.label'), h('em', null, t('placement.effect'))),
              h('button', {
                className: 'dshsc-switch',
                role: 'switch',
                'aria-checked': String(placement === 'sidebar'),
                'aria-label': `${t('placement.label')}：${placement === 'sidebar' ? t('placement.on') : t('placement.off')}`,
                title: t('placement.hint'),
                disabled: Boolean(placementBusy) || readOnly,
                onClick: () => void onChangePlacement(placement === 'sidebar' ? 'settings' : 'sidebar'),
              }, h('span', { className: 'dshsc-knob' }))),
            h('div', { className: 'dshsc-pop-hint' }, t('placement.hint')))
        : null));

  return h('div', { className: 'dshsc-head' },
    h('div', { className: 'dshsc-heading' },
      h(Logo, { size: page ? 36 : 30 }),
      h('div', { className: 'dshsc-heading-text' },
        h('div', { className: 'dshsc-title-row' },
          h('h2', { className: 'dshsc-title' }, page ? t('page.title') : t('section.title')),
          // 身份：按「安装时输入的包名」显示（Host 从 package.json 注入）。
          // 点整段打开「关于」弹层（许可 / 仓库 / 包名）；参照 dsh-github-trending 的入口约定。
          spec
            ? h('button', {
                type: 'button',
                className: 'dshsc-id',
                title: `${t('about.title')} · ${spec}`,
                'aria-label': t('about.title'),
                onClick: onOpenAbout,
              }, h('span', { className: 'dshsc-spec' }, spec))
            : null,
          headTools),
        h('p', { className: 'dshsc-sub' }, t('section.subtitle')))),
    // 右侧只留业务动作；主按钮仍在最右
    h('div', { className: 'dshsc-head-actions' },
      h('button', {
        className: 'dshsc-btn',
        disabled: !writable,
        title: `${t('exportDefault')}：${autoLinkLabel}`,
        'aria-label': `${t('exportDefault')}：${autoLinkLabel}`,
        onClick: onOpenAutoLink,
      }, `${t('exportDefault')} · ${autoLinkCount} ▾`),
      h('button', {
        className: 'dshsc-btn primary',
        disabled: !writable,
        onClick: tab === 'installed' ? onAddSkill : onAddSubscription,
      }, tab === 'installed' ? t('action.addSkill') : t('action.addSubscription'))));
}

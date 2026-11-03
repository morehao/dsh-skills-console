/** 页头：标题 / 身份胶囊 / 插件工具（刷新检查更新 → GitHub + 设置浮层）/ 业务动作。 */
import React from 'react';
import type { RefObject } from 'react';

import { h } from '../host.js';
import { GITHUB_URL } from '../api.js';
import type { PluginInfo, SettingsPlacement } from '../api.js';
import type { Translate } from '../copy.js';
import { Logo, GitHubIcon, GearIcon, RefreshIcon } from '../icons.js';
import { writePendingUpdate } from '../update-store.js';

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
  // 内联更新胶囊：状态由 controller 派生出的 status 决定；两段确认的 confirming 是本组件局部态。
  const [confirming, setConfirming] = React.useState(false);
  const upd = pluginUpdate || null;
  const st = upd?.status || null;
  const checking = Boolean(upd?.checking);
  const applying = Boolean(upd?.applying);
  const updateAvailable = Boolean(st?.updateAvailable);
  const checkFailed = Boolean(upd?.checkError) || Boolean(st?.checkFailed);
  const settled = Boolean(st?.restartRequired);
  const latest = st?.latestVersion || null;
  const current = st?.currentVersion || '—';

  // 状态收敛成「一个 data-state + 一句 tooltip 文案」：
  //   available → 琥珀（有新版本）；checking/applying → 旋转禁用；error → 红（重试）；
  //   latest → 普通图标；ok-flash → 绿（刚更新完）。版本号常驻在图标左侧的徽标里（仅 available）。
  let state = 'latest';
  let tip = t('pluginUpdate.capsule.latest').replace('{version}', String(current));
  if (applying) { state = 'checking'; tip = t('pluginUpdate.capsule.applying').replace('{version}', String(latest || '')); }
  else if (checking) { state = 'checking'; tip = t('pluginUpdate.capsule.checking'); }
  else if (checkFailed) { state = 'error'; tip = t('pluginUpdate.capsule.checkFailed'); }
  else if (settled) { state = 'ok-flash'; tip = t('pluginUpdate.capsule.restart'); }
  else if (st && updateAvailable) { state = 'available'; tip = t('pluginUpdate.capsule.available').replace('{version}', String(latest || '')); }
  else if (st) { state = 'latest'; tip = t('pluginUpdate.capsule.latest').replace('{version}', String(current)); }

  const busy = applying || checking;

  // 确认态：有新版本且可更新时，点图标弹确认气泡；更新中/更新后自动收起。
  React.useEffect(() => {
    if (!updateAvailable || busy || settled) setConfirming(false);
  }, [updateAvailable, busy, settled]);

  // 点刷新图标的动作：可更新 → 开确认气泡；失败 → 重试；其余 → 检查。
  function onRefreshClick() {
    if (busy) return;
    if (updateAvailable && st?.canAutoUpdate !== false) { setConfirming((v) => !v); return; }
    void upd?.check?.(true);
  }

  // 「确认更新」：落「刚点过更新」的记号后触发 apply，面板随插件自卸而消失，
  // 重开的新进程靠这个记号渲染跨进程恢复提示。
  function onConfirmUpdate() {
    setConfirming(false);
    try { writePendingUpdate(String(current || ''), String(latest || '')); } catch { /* 记不上也不拦更新 */ }
    void upd?.apply?.();
  }

  // 版本徽标：仅「有新版本」时出现，显示目标版本号；点击等同点图标（弹确认气泡）。
  const showBadge = Boolean(st && updateAvailable && !busy && !settled);
  const confirmOpen = confirming && updateAvailable && !busy && !settled;

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

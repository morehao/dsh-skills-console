/** 页头：标题 / 身份胶囊 / 插件工具（刷新检查更新 → GitHub + 设置浮层）/ 业务动作。 */
import React from 'react';
import type { RefObject } from 'react';

import { h } from '../host.js';
import { GITHUB_URL } from '../api.js';
import type { PluginInfo, SettingsPlacement } from '../api.js';
import type { Translate } from '../copy.js';
import { Logo, GitHubIcon, GearIcon } from '../icons.js';
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

  // 状态机收敛成「一种 tone + 一句文案 + 一个动作」：
  //   checking → 灰；failed → 红（重试）；available → 琥珀（更新/确认）；running/独立态 → 灰；最新 → 绿（检查）。
  let tone = 'ok';
  let stateText = t('pluginUpdate.capsule.latest').replace('{version}', String(current));
  if (applying) { tone = 'muted'; stateText = t('pluginUpdate.capsule.applying').replace('{version}', String(latest || '')); }
  else if (checking) { tone = 'muted'; stateText = t('pluginUpdate.capsule.checking'); }
  else if (checkFailed) { tone = 'err'; stateText = t('pluginUpdate.capsule.checkFailed'); }
  else if (settled) { tone = 'ok'; stateText = t('pluginUpdate.capsule.restart'); }
  else if (st && updateAvailable) { tone = 'new'; stateText = t('pluginUpdate.capsule.available').replace('{version}', String(latest || '')); }
  else if (st) { tone = 'ok'; stateText = t('pluginUpdate.capsule.latest').replace('{version}', String(current)); }

  // 确认态：文案换成提示，动作换成「确认/取消」。
  React.useEffect(() => {
    if (!updateAvailable || applying || settled) setConfirming(false);
  }, [updateAvailable, applying, settled]);

  // 动作按钮：与状态胶囊分开成一组，形状/风格跟右侧业务按钮（.dshsc-btn）一致。
  //   applying/checking → 禁用；confirming → 确认/取消；可更新 → 更新；失败 → 重试；其余 → 检查。
  function actionButtons() {
    if (applying) {
      return h('button', { className: 'dshsc-btn', type: 'button', disabled: true }, t('pluginUpdate.capsule.applyingShort'));
    }
    if (checking) {
      return h('button', { className: 'dshsc-btn', type: 'button', disabled: true }, t('pluginUpdate.capsule.checkingShort'));
    }
    if (confirming) {
      return [
        h('button', {
          key: 'yes', className: 'dshsc-btn primary', type: 'button',
          onClick: () => {
            setConfirming(false);
            // 动手前落「刚点过更新」的记号：一键更新会先卸载插件自身、面板随之消失，
            // 重开的新进程靠这个记号渲染跨进程恢复提示。（操作只在胶囊发起，故记号写在这里）
            try { writePendingUpdate(String(current || ''), String(latest || '')); } catch { /* 记不上也不拦更新 */ }
            void upd?.apply?.();
          },
        }, t('pluginUpdate.capsule.confirmYes')),
        h('button', {
          key: 'no', className: 'dshsc-btn ghost', type: 'button', onClick: () => setConfirming(false),
        }, t('pluginUpdate.capsule.cancel')),
      ];
    }
    if (updateAvailable && st?.canAutoUpdate !== false) {
      return h('button', {
        className: 'dshsc-btn primary', type: 'button',
        onClick: () => setConfirming(true),
      }, t('pluginUpdate.capsule.update'));
    }
    if (checkFailed) {
      return h('button', {
        className: 'dshsc-btn', type: 'button', onClick: () => void upd?.check?.(true),
      }, t('pluginUpdate.capsule.retry'));
    }
    // 最新 / restart / 不可一键更新：给「检查」入口
    return h('button', {
      className: 'dshsc-btn', type: 'button', onClick: () => void upd?.check?.(true),
    }, t('pluginUpdate.capsule.check'));
  }

  const capsuleText = confirming
    ? t('pluginUpdate.capsule.confirmHint').replace('{version}', String(latest || ''))
    : stateText;

  // 插件级工具跟身份胶囊同组：状态胶囊 + 动作按钮、GitHub 开仓库、齿轮开设置；业务动作留在右侧
  const headTools = h('div', { className: 'dshsc-tools' },
    // 更新状态区：左侧状态胶囊点文字区打开详情弹窗（看 Release 正文），右侧动作按钮就地检查/更新（两段确认）。
    h('div', { className: 'dshsc-update-group' },
      h('div', { className: `dshsc-cap${confirming ? ' confirming' : ''}`, 'data-tone': tone },
        h('button', {
          className: 'dshsc-cap-text', type: 'button',
          title: t('pluginUpdate.check'),
          'aria-label': t('pluginUpdate.check'),
          onClick: onCheckUpdate,
        }, h('span', { className: 'dshsc-cap-dot' }), h('span', { className: 'dshsc-cap-label' }, capsuleText))),
      h('span', { className: 'dshsc-update-actions' }, actionButtons())),
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

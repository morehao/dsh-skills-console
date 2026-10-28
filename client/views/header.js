/** 页头：标题 / 身份胶囊 / 插件工具（刷新检查更新 → GitHub + 设置浮层）/ 业务动作。 */
import { h } from '../host.js';
import { GITHUB_URL } from '../api.js';
import { Logo, GitHubIcon, GearIcon, RefreshIcon } from '../icons.js';

/** 安装标识：跟页面外安装插件时输入的一模一样（`@scope/name@version`），不带 `v`。 */
function installSpec(plugin) {
  const name = plugin?.fullName || plugin?.name;
  if (!name) return null;
  return plugin.version ? `${name}@${plugin.version}` : name;
}

export function Header({
  t, page, plugin, writable,
  autoLinkLabel, autoLinkCount, tab,
  settingsOpen, settingsRef, settingsPlacement, placement, placementBusy, readOnly,
  pluginUpdate, onCheckUpdate,
  onToggleSettings, onChangePlacement,
  onOpenAutoLink, onAddSkill, onAddSubscription,
}) {
  const spec = installSpec(plugin);
  const updateAvailable = Boolean(pluginUpdate?.status?.updateAvailable);

  // 插件级工具跟身份胶囊同组：刷新检查更新、GitHub 开仓库、齿轮开设置；业务动作留在右侧
  const headTools = h('div', { className: 'dshsc-tools' },
    // 刷新按钮放在 GitHub 前面：点一下检查插件自身版本，有新版本时高亮提示
    h('button', {
      className: `dshsc-tool${updateAvailable ? ' dshsc-tool-dot' : ''}`,
      type: 'button',
      title: t('pluginUpdate.check'),
      'aria-label': t('pluginUpdate.check'),
      onClick: onCheckUpdate,
    }, h(RefreshIcon, { size: 15 })),
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
          // 身份：按「安装时输入的包名」显示，点一下整段复制（Host 从 package.json 注入）
          // 身份：按「安装时输入的包名」显示，只读展示（Host 从 package.json 注入）
          spec
            ? h('span', { className: 'dshsc-id', title: spec },
                h('span', { className: 'dshsc-spec' }, spec))
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

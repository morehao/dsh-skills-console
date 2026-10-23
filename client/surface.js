/** 两种挂载面：设置页分区（settings.section）与侧栏主面板（main + sidebar.panellist）。 */
import { h } from './host.js';
import { PanelIcon } from './icons.js';
import { Section } from './section.js';

export const PANEL_ID = 'dsh-skills-console';

export function createSurface({ slots, layout, t, pickDirectory }) {
  let surface = null;
  let userSelected = false;
  const surfaceDisposers = [];

  function SettingsSurface(props) {
    return h(Section, {
      t,
      page: false,
      pickDirectory,
      onPlacementChange: (next) => changeSurface(next, props?.close),
    });
  }

  function PageSurface() {
    return h(Section, { t, page: true, pickDirectory, onPlacementChange: (next) => changeSurface(next) });
  }

  function SurfaceIcon(props) {
    return h(PanelIcon, { size: props?.size || 16 });
  }

  function clearSurface() {
    while (surfaceDisposers.length > 0) {
      const dispose = surfaceDisposers.pop();
      try {
        dispose();
      } catch {
        // 单个卸载失败不阻塞另一个入口
      }
    }
  }

  function mount(next) {
    const target = next === 'sidebar' ? 'sidebar' : 'settings';
    if (surface === target) return;
    clearSurface();
    surface = target;
    if (target === 'sidebar') {
      // 先注册 main 再注册侧栏按钮：按钮出现时 main 一定可选
      surfaceDisposers.push(slots.inject('main', () => {
        const disposeMain = slots.register({ name: 'main', key: PANEL_ID }, PageSurface);
        const disposeIcon = slots.inject('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => t('page.title'),
        }, SurfaceIcon));
        return [disposeMain, disposeIcon];
      }));
    } else {
      surfaceDisposers.push(slots.inject('settings.section', () =>
        slots.register({
          name: 'settings.section', id: PANEL_ID, order: 26, label: () => t('section.title'),
        }, SettingsSurface)));
    }
  }

  function changeSurface(next, close) {
    userSelected = true;
    mount(next);
    try {
      if (next === 'sidebar') {
        layout?.selectPanel?.(PANEL_ID);
        close?.();
      } else {
        // 离开已消失的自定义主面板，回到会话；用户从侧栏底部打开设置即可看到分区
        layout?.selectPanel?.('conversation');
      }
    } catch {
      // main 声明尚未就绪时 select 会抛错；侧栏按钮/设置分区随后仍可点开
    }
  }

  function dispose() {
    clearSurface();
    surface = null;
  }

  return { mount, changeSurface, clearSurface, dispose, hasUserSelected: () => userSelected };
}

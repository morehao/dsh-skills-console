/** 两种挂载面：设置页分区（settings.section）与侧栏主面板（main + sidebar.panellist）。 */
import { h } from './host.js';
import { PanelIcon } from './icons.js';
import { Section } from './section.js';
import { writeLayoutSelected } from './update-store.js';

export const PANEL_ID = 'dsh-skills-console';

export function createSurface({ slots, layout, t, pickDirectory }: any): any {
  let surface: 'settings' | 'sidebar' | null = null;
  let userSelected = false;
  const surfaceDisposers: Array<() => void> = [];
  // 兜底入口的 disposer：与偏好入口分开管，偏好切换时不必拆它，但 dispose() 时要一起回收。
  let fallbackDisposer: (() => void) | null = null;

  function SettingsSurface(props: any) {
    return h(Section, {
      t,
      page: false,
      pickDirectory,
      onPlacementChange: (next: string) => changeSurface(next, props?.close),
    });
  }

  function PageSurface() {
    return h(Section, { t, page: true, pickDirectory, onPlacementChange: (next: string) => changeSurface(next) });
  }

  function SurfaceIcon(props: any) {
    return h(PanelIcon, { size: props?.size || 16 });
  }

  function clearSurface() {
    while (surfaceDisposers.length > 0) {
      const dispose = surfaceDisposers.pop();
      if (!dispose) break;
      try {
        dispose();
      } catch {
        // 单个卸载失败不阻塞另一个入口
      }
    }
  }

  function registerSettingsSection() {
    return slots.inject('settings.section', () =>
      slots.register({
        name: 'settings.section', id: PANEL_ID, order: 26, label: () => t('section.title'),
      }, SettingsSurface));
  }

  function mount(next: string) {
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
      surfaceDisposers.push(registerSettingsSection());
    }
  }

  /**
   * 入口自愈：无论当前偏好是哪一套，都保证「设置页分区」这个最稳的入口在。
   *
   * 场景来自实机：宿主跨版本自更新先 removeBundle 把自己卸掉，`settings.section` 与
   * `sidebar.panellist` 一起注销；重装不热挂回，用户重启后如果偏好是 sidebar，也就只会挂
   * sidebar 那套。若那次 sidebar 的 main 没挂上（例如主面板存在性判定的边界），用户会「找不到入口」。
   * 这里补一道兜底：只要不是 settings 偏好，就额外挂一个 settings.section（幂等，不覆盖现有）。
   * 它是「保命入口」而非用户偏好；偏好切到 settings 时由 mount('settings') 正常接管，这里不重建。
   */
  function ensureFallbackEntry() {
    if (surface === 'settings') {
      // 偏好就是设置页分区，本身就是最稳的入口，无需兜底
      if (fallbackDisposer) { try { fallbackDisposer(); } catch { /* ignore */ } fallbackDisposer = null; }
      return;
    }
    if (fallbackDisposer) return; // 已挂过
    try {
      fallbackDisposer = registerSettingsSection();
    } catch {
      fallbackDisposer = null;
    }
  }

  function changeSurface(next: string, close?: () => void) {
    userSelected = true;
    mount(next);
    try {
      if (next === 'sidebar') {
        layout?.selectPanel?.(PANEL_ID);
        writeLayoutSelected(PANEL_ID);
        close?.();
      } else {
        // 离开已消失的自定义主面板，回到会话；用户从侧栏底部打开设置即可看到分区
        layout?.selectPanel?.('conversation');
        writeLayoutSelected('');
      }
    } catch {
      // main 声明尚未就绪时 select 会抛错；侧栏按钮/设置分区随后仍可点开
    }
  }

  function dispose() {
    clearSurface();
    if (fallbackDisposer) {
      try { fallbackDisposer(); } catch { /* ignore */ }
      fallbackDisposer = null;
    }
    surface = null;
  }

  return { mount, changeSurface, ensureFallbackEntry, clearSurface, dispose, hasUserSelected: () => userSelected };
}

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
  // 常驻的 settings.section 注册（boot 时由 registerFallbackSettingsSection 建）。它不随
  // mount() 的偏好切换拆装；mount('settings') 复用这一条，绝不另注册第二份同名 slot。
  let fallbackSettingsDisposer: (() => void) | null = null;
  // 0.2.2 的 settings.section.icon：与 section 同 id 的导航图标。旧宿主没有声明这个 slot，
  // slots.inject 的回调不会执行，静默不注册——不需要版本判断。
  let fallbackIconDisposer: (() => void) | null = null;
  let fallbackSettingsComponent: any = null;

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

  /**
   * boot 时常驻注册一次 settings.section（「保命入口」）。组件由调用方给，便于与首挂载保持
   * 同一份 Section 实例工厂。若已有常驻注册则幂等返回。
   * 同时注册同 id 的 settings.section.icon；两者生命周期绑定，见 releaseSettingsSection()。
   */
  function registerFallbackSettingsSection(Component: any) {
    if (fallbackSettingsDisposer) return;
    fallbackSettingsComponent = Component;
    fallbackSettingsDisposer = slots.inject('settings.section', () =>
      slots.register({
        name: 'settings.section', id: PANEL_ID, order: 26, label: () => t('section.title'),
      }, Component));
    fallbackIconDisposer = slots.inject('settings.section.icon', () =>
      slots.register({ name: 'settings.section.icon', id: PANEL_ID }, SurfaceIcon));
  }

  /** 撤掉常驻 settings.section 与它的导航图标（两者必须同进同出）。 */
  function releaseSettingsSection() {
    for (const dispose of [fallbackIconDisposer, fallbackSettingsDisposer]) {
      try { dispose?.(); } catch { /* 单个卸载失败不阻塞另一个 */ }
    }
    fallbackIconDisposer = null;
    fallbackSettingsDisposer = null;
  }

  /**
   * 给 settings.section 占一个位：已有常驻注册就复用（不重复注册），否则注册一条。
   * 返回该注册的 disposer，供 mount() 从设置页切走时注销。
   */
  function ensureSettingsSection() {
    if (!fallbackSettingsDisposer) registerFallbackSettingsSection(fallbackSettingsComponent);
    return releaseSettingsSection;
  }

  /**
   * 两个入口严格互斥：settings 偏好只挂设置页分区；sidebar 偏好只挂 main + 侧栏按钮。
   *
   * 曾经这里额外挂一个 settings.section 兜底（「保命入口」），但宿主对同一 slot 里重复的 id
   * 会直接抛错——`list slot "settings.section" already has an entry with id "dsh-skills-console" ...`。
   * 用户从侧栏切回设置（不重载进程）时会同时命中「偏好入口」与「兜底入口」触发该报错；
   * 也造成了「开启侧栏后设置里仍留着一条」的问题。入口自愈交由 index.ts 顶层 provider 承担
   * （boot 时无条件注册一次 settings.section，保证恒有一个设置入口），这里只管按偏好切换、
   * 绝不重复注册同名 slot。
   */
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
      surfaceDisposers.push(ensureSettingsSection());
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
    releaseSettingsSection();
    surface = null;
  }

  return {
    mount, changeSurface, registerFallbackSettingsSection, clearSurface, dispose,
    hasUserSelected: () => userSelected,
  };
}

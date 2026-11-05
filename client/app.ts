/** apply(ctx)：装配 locale / slots / 首挂载，并读取入口偏好。 */
import { apiCall } from './api.js';
import { buildTranslate } from './copy.js';
import { createSurface } from './surface.js';
import { Section } from './section.js';
import { h } from './host.js';
import { readLayoutSelected, writeLayoutSelected } from './update-store.js';

export const inject = ['slots'];

export function apply(ctx: any): void {
  const locale = ctx.get('locale');
  const t = buildTranslate(locale);
  const slots = ctx.get('slots');
  if (!slots?.register) return;

  const pickDirectory = async () => ctx.get('uiWorkspace')?.pickDirectory?.();
  const layout = ctx.get('layout');
  const surface = createSurface({ slots, layout, t, pickDirectory });

  // 入口自愈：boot 时无条件注册一次 settings.section（保命入口，保证「设置里一定找得到」）。
  // 侧栏偏好只影响 mount() 挂哪一套；两者互斥、绝不重复注册同名 slot（重复 id 会让宿主抛
  // `list slot "settings.section" already has an entry with id ...`）。createSurface 内部会
  // 跟踪这条常驻注册：若随后 mount('settings') 要挂设置分区，就复用这一条、不再另注册。
  surface.registerFallbackSettingsSection((props: any) => h(Section, {
    t, page: false, pickDirectory,
    onPlacementChange: (next: string) => surface.changeSurface(next, props?.close),
  }));

  surface.mount('settings');
  ctx.effect(() => () => {
    surface.dispose();
  }, 'dsh-skills-console:surface');

  // 布局卫生：上次选中的主面板 key 若本次无法选中（例如自更新后 sidebar 的 main 没挂上），
  // 回退到会话页，避免「选中一个不存在的面板 → 黑屏且无法导航」。null 是契约允许值。
  // 宿主的 slots 没有「是否已注册某 key」的查询；selectPanel(未注册 key) 会抛错——用它做探测：
  // 抛了就当未注册、选 null 回会话；没抛则保持用户上次选择。
  try {
    const lastSelected = readLayoutSelected();
    if (lastSelected && typeof layout?.selectPanel === 'function') {
      try {
        layout.selectPanel(lastSelected);
      } catch {
        layout.selectPanel(null);
        writeLayoutSelected('');
      }
    }
  } catch {
    // 卫生处理失败不影响主面板挂载
  }

  // 读取入口偏好；晚到的响应不能覆盖用户刚才在页面里的选择
  apiCall('GET', '/state')
    .then((state) => {
      if (!surface.hasUserSelected() && state?.settings?.placement === 'sidebar') {
        surface.mount('sidebar');
      }
    })
    .catch(() => {});
}

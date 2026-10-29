/** apply(ctx)：装配 locale / slots / 导航图标 / 首挂载，并读取入口偏好。 */
import { apiCall } from './api.js';
import { buildTranslate } from './copy.js';
import { installSettingsNavIcon } from './icons.js';
import { createSurface } from './surface.js';

export const inject = ['slots'];

export function apply(ctx: any): void {
  const locale = ctx.get('locale');
  const t = buildTranslate(locale);
  const slots = ctx.get('slots');
  if (!slots?.register) return;

  // 设置分区在 Host 的导航里默认拿齿轮；换成插件自己的标记（语言切换时重认领）。
  installSettingsNavIcon(ctx, () => t('section.title'));

  const pickDirectory = async () => ctx.get('uiWorkspace')?.pickDirectory?.();
  const surface = createSurface({ slots, layout: ctx.get('layout'), t, pickDirectory });

  surface.mount('settings');
  ctx.effect(() => () => {
    surface.dispose();
  }, 'dsh-skills-console:surface');

  // 读取入口偏好；晚到的响应不能覆盖用户刚才在页面里的选择
  apiCall('GET', '/state')
    .then((state) => {
      if (!surface.hasUserSelected() && state?.settings?.placement === 'sidebar') surface.mount('sidebar');
    })
    .catch(() => {});
}

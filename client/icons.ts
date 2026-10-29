/** 图标与设置导航图标认领：纯 SVG / DOM 操作，不依赖业务状态。 */
import { h } from './host.js';

export function Logo({ size = 30 }: { size?: number }): any {
  return h('svg', {
    className: 'dshsc-logo', width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true,
  },
  h('defs', null,
    h('linearGradient', { id: 'dshsc-logo-bg', x1: 6, y1: 2, x2: 58, y2: 62, gradientUnits: 'userSpaceOnUse' },
      h('stop', { stopColor: '#3b82f6' }),
      h('stop', { offset: 1, stopColor: '#1d4ed8' }))),
  h('rect', { x: 3, y: 3, width: 58, height: 58, rx: 14, fill: 'url(#dshsc-logo-bg)' }),
  h('path', {
    d: 'M32 32 18 17M32 32 46 17M32 32 32 49',
    stroke: '#ffffff', strokeOpacity: 0.55, strokeWidth: 2.6, strokeLinecap: 'round',
  }),
  h('circle', { cx: 18, cy: 17, r: 4.6, fill: '#7ef0c0' }),
  h('circle', { cx: 46, cy: 17, r: 4.6, fill: '#ffffff' }),
  h('circle', { cx: 32, cy: 49, r: 4.6, fill: '#ffffff' }),
  h('rect', { x: 21, y: 21, width: 22, height: 22, rx: 7, fill: '#ffffff' }),
  h('path', {
    d: 'M27 32.5l3.6 3.6 6.8-7.4',
    fill: 'none', stroke: '#1d4ed8', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round',
  }));
}

export function PanelIcon({ size = 16 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('rect', { x: 7.5, y: 7.5, width: 9, height: 9, rx: 3 }),
  h('path', { d: 'M9.8 12.1l1.5 1.5 3.1-3.3' }),
  h('path', { d: 'M12 7.5V4.8M12 16.5v2.7M7.5 12H4.8', opacity: 0.55 }),
  h('circle', { cx: 12, cy: 4.2, r: 1.1, fill: 'currentColor', stroke: 'none' }),
  h('circle', { cx: 12, cy: 19.8, r: 1.1, fill: 'currentColor', stroke: 'none' }),
  h('circle', { cx: 4.2, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }));
}

// 设置导航的图标由 Host 按 section id 从固定映射里挑，未知 id 一律回落到齿轮
// （dsh-client-ui-settings-general 的 navIcon），而 settings.section 只投影
// id / order / label，没有 icon 字段——所以每个第三方分区都会和「通用设置」撞图标。
// 这里在对话框挂载后认领自己那一行：只按可见文案匹配本插件的分区标题，把回落的
// 齿轮换成本插件的标记；不碰 Host 的其它结构。等 settings.section 支持 icon 后删掉。
const NAV_ICON_MARKER = 'data-dsh-skills-console-nav-icon';
const NAV_ROW_SELECTOR = '[role="dialog"] nav button';

/** 导航行里用的标记：与 PanelIcon 同一套几何，画成 CSS mask 的 alpha 形状。 */
function navIconMaskSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">'
    + '<rect x="7.5" y="7.5" width="9" height="9" rx="3" stroke="#000" stroke-width="1.8"/>'
    + '<path d="M9.8 12.1l1.5 1.5 3.1-3.3" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M12 7.5V4.8M12 16.5v2.7M7.5 12H4.8" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".55"/>'
    + '<circle cx="12" cy="4.2" r="1.1" fill="#000"/><circle cx="12" cy="19.8" r="1.1" fill="#000"/>'
    + '<circle cx="4.2" cy="12" r="1.1" fill="#000"/></svg>';
}

/** mask 的 URL：运行时编码，避免手写转义。 */
function navIconMaskUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(navIconMaskSvg())}`;
}

/** 隐藏 Host 画的齿轮，改用本插件标记（颜色跟随 currentColor，适配深浅主题）。 */
function navIconCss(maskUrl: string): string {
  return [
    `[${NAV_ICON_MARKER}] > svg { display: none; }`,
    `[${NAV_ICON_MARKER}]::before {`,
    "  content: '';",
    '  flex: none;',
    '  width: 16px;',
    '  height: 16px;',
    '  background-color: currentColor;',
    `  -webkit-mask-image: url("${maskUrl}");`,
    `  mask-image: url("${maskUrl}");`,
    '  -webkit-mask-repeat: no-repeat;',
    '  mask-repeat: no-repeat;',
    '  -webkit-mask-position: center;',
    '  mask-position: center;',
    '  -webkit-mask-size: 16px 16px;',
    '  mask-size: 16px 16px;',
    '}',
  ].join('\n');
}

/** 只有可见文案等于本插件分区标题的那一行才算自己的；空标题不认领任何行。 */
function isOwnNavRow(rowText: string, wantedLabel: string): boolean {
  const wanted = String(wantedLabel ?? '').trim();
  if (wanted.length === 0) return false;
  return String(rowText ?? '').trim() === wanted;
}

/**
 * 把设置导航里的齿轮换成本插件标记。
 * @param ctx 客户端 context，用于 effect 生命周期（卸载时移除标记与样式）。
 * @param resolveLabel 当前分区标题（与 settings.section 用同一个 thunk，语言切换后可重认领）。
 */
export function installSettingsNavIcon(ctx: any, resolveLabel: () => string): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  ctx.effect(() => {
    const tag = document.createElement('style');
    tag.dataset.plugin = '@morehao/dsh-skills-console';
    tag.dataset.pluginCss = 'dsh-skills-console/settings-nav-icon';
    tag.textContent = navIconCss(navIconMaskUrl());
    document.head.appendChild(tag);
    let disposed = false;
    let scheduled = false;
    const sync = () => {
      scheduled = false;
      if (disposed) return;
      const wanted = resolveLabel();
      for (const row of document.querySelectorAll(NAV_ROW_SELECTOR)) {
        if (isOwnNavRow(row.textContent, wanted)) row.setAttribute(NAV_ICON_MARKER, '');
        else row.removeAttribute(NAV_ICON_MARKER);
      }
    };
    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      if (typeof queueMicrotask === 'function') queueMicrotask(sync);
      else Promise.resolve().then(sync);
    };
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      disposed = true;
      observer.disconnect();
      for (const row of document.querySelectorAll(`[${NAV_ICON_MARKER}]`)) row.removeAttribute(NAV_ICON_MARKER);
      tag.remove();
    };
  }, 'dsh-skills-console: settings nav icon');
}

export function GitHubIcon({ size = 16 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true,
    style: { display: 'block' },
  }, h('path', {
    d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  }));
}

export function GearIcon({ size = 13 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('circle', { cx: 12, cy: 12, r: 3.1 }),
  h('path', {
    d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  }));
}

export function TrashIcon({ size = 14 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'M4 7h16' }),
  h('path', { d: 'M9 7V5h6v2' }),
  h('path', { d: 'M6.5 7l1 13h9l1-13' }),
  h('path', { d: 'M10 11v5.5M14 11v5.5' }));
}

export function DownloadIcon({ size = 14 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'M12 4v12' }),
  h('path', { d: 'M7 11l5 5 5-5' }),
  h('path', { d: 'M4 20h16' }));
}

/**
 * 共享：一个方框向下分出两条支线，接到两个方框——「一份技能 → 多个 Agent」。
 * 行内「共享设置」用：方框代表 Agent / 目录，不用圆形节点，避免被读成“分享给好友”。
 * 不用箭头出框（那是导出/上传），也不用插头（插头只读得出「接入」，读不出「共享给谁」）。
 */
export function ShareIcon({ size = 14 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('rect', { x: 9.2, y: 2.8, width: 5.6, height: 5.6, rx: 1.2 }),
  h('rect', { x: 2.4, y: 15.4, width: 5.6, height: 5.6, rx: 1.2 }),
  h('rect', { x: 16, y: 15.4, width: 5.6, height: 5.6, rx: 1.2 }),
  h('path', { d: 'M10.4 8.8 6.2 15.4' }),
  h('path', { d: 'M13.6 8.8 17.8 15.4' }));
}

export function InfoIcon({ size = 13 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true, style: { display: 'block' },
  },
  h('circle', { cx: 12, cy: 12, r: 9 }),
  h('path', { d: 'M12 11v5' }),
  h('path', { d: 'M12 8h.01' }));
}

export function RefreshIcon({ size = 14 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'M20 12a8 8 0 1 1-2.34-5.66' }),
  h('path', { d: 'M20 4v5h-5' }));
}

export function CaretIcon({ open }: { open?: boolean }): any {
  return h('svg', {
    width: 10, height: 10, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true,
    style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease' },
  }, h('path', { d: 'M8 5l11 7-11 7z' }));
}

export function SearchIcon({ size = 13 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('circle', { cx: 11, cy: 11, r: 6.4 }),
  h('path', { d: 'M16 16l4.3 4.3' }));
}

const STROKE_ICON = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** 查看：眼睛。行内「查看」按钮用。 */
export function EyeIcon({ size = 13 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', ...STROKE_ICON, 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }),
  h('circle', { cx: 12, cy: 12, r: 3 }));
}

/**
 * 复制。几何取自 lucide 的 copy（14×14 方块 + 左上回字），
 * 包围盒严格对称于 (12,12)，小尺寸下不会看起来偏左上。
 */
export function CopyIcon({ size = 13 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', ...STROKE_ICON, 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('rect', { x: 8, y: 8, width: 14, height: 14, rx: 2 }),
  h('path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }));
}

/** 返回 / 上一级。 */
export function ChevronLeftIcon({ size = 14 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', ...STROKE_ICON, 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'm15 18-6-6 6-6' }));
}

/** 文件。 */
export function FileIcon({ size = 12 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', ...STROKE_ICON, 'aria-hidden': true,
    style: { display: 'block', flex: 'none' },
  },
  h('path', { d: 'M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z' }),
  h('path', { d: 'M13 3.5V9h5' }));
}

/** 目录。 */
export function FolderIcon({ size = 12 }: { size?: number }): any {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', ...STROKE_ICON, 'aria-hidden': true,
    style: { display: 'block', flex: 'none' },
  },
  h('path', { d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l1.8 2.2H19a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z' }));
}

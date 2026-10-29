/**
 * 弹层外壳：遮罩 + 对话框 + 关闭按钮，只负责「怎么浮出来」。
 * Esc 交给插件浮层栈（只关最上面一层），弹窗叠在抽屉 / 设置页之上时不会连带关掉背后那层。
 *
 * 单独成文件是为了让各弹窗（modals / add-skill）都能引用它而不产生循环依赖。
 */
import type { ReactNode } from 'react';

import { h, overlayHost, portalize, useOverlayLayer } from '../host.js';
import type { Translate } from '../copy.js';

export interface OverlayProps {
  t: Translate;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onCancel: () => void;
  dismissible?: boolean;
}

export function Overlay({ t, title, children, footer, onCancel, dismissible = true }: OverlayProps) {
  // Esc 交给插件浮层栈：只关最上面的弹窗，不连带关掉背后的设置弹窗 / 抽屉。
  // dismissible=false 时（提交进行中）仍占住最上层但 close 变成空操作：
  // 这样 Esc 被本层吃掉，既不会关掉自己、也不会穿透去关背后的抽屉 / 设置页。
  useOverlayLayer(true, dismissible ? onCancel : () => {});
  return portalize(h('div', { className: 'dshsc-overlay', onClick: (event: any) => { if (dismissible && event.target === event.currentTarget) onCancel?.(); } },
    h('div', { className: 'dshsc-modal', role: 'dialog', 'aria-modal': 'true' },
      h('button', {
        className: 'dshsc-modal-close',
        'aria-label': t('action.cancel'),
        disabled: !dismissible,
        onClick: (event: any) => { event.stopPropagation(); if (dismissible) onCancel?.(); },
      }, '×'),
      h('h3', null, title),
      children,
      h('div', { className: 'dshsc-modal-foot' }, footer))), overlayHost());
}

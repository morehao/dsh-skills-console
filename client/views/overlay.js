/**
 * 弹层外壳：遮罩 + 对话框 + 关闭按钮，只负责「怎么浮出来」。
 * Esc 交给插件浮层栈（只关最上面一层），弹窗叠在抽屉 / 设置页之上时不会连带关掉背后那层。
 *
 * 单独成文件是为了让各弹窗（modals / add-skill）都能引用它而不产生循环依赖。
 */
import { h, overlayHost, portalize, useOverlayLayer } from '../host.js';

export function Overlay({ t, title, children, footer, onCancel }) {
  // Esc 交给插件浮层栈：只关最上面的弹窗，不连带关掉背后的设置弹窗 / 抽屉
  useOverlayLayer(true, onCancel);
  return portalize(h('div', { className: 'dshsc-overlay', onClick: (event) => { if (event.target === event.currentTarget) onCancel?.(); } },
    h('div', { className: 'dshsc-modal', role: 'dialog', 'aria-modal': 'true' },
      h('button', {
        className: 'dshsc-modal-close',
        'aria-label': t('action.cancel'),
        onClick: (event) => { event.stopPropagation(); onCancel?.(); },
      }, '×'),
      h('h3', null, title),
      children,
      h('div', { className: 'dshsc-modal-foot' }, footer))), overlayHost());
}

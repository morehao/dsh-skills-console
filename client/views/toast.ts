/**
 * 顶部居中状态条：一次操作反馈的「轻量」呈现（方向 A）。
 *
 * 为什么在顶部而不是右下角：右下角的提示容易被面板内容 / 视线起点忽略；
 * 顶部居中是浏览器 / 系统通知的惯例位置，进入视野自然，又不会盖住正在看的列表底部。
 *
 * 结构：状态图标（成功 ✓ / 失败 !）+ 标题（可选）+ 正文 + 关闭 ×。
 * 堆叠：多条纵向排列，连点多个操作不互相覆盖；每条各自定时退出（成功短、失败长）。
 * 时序在 hooks.useSkillsData 里；这里只负责渲染与手动关闭。
 */
import { h, portalize } from '../host.js';
import type { Translate } from '../copy.js';

export interface ToastItemLike {
  id: number;
  kind: string;
  text: string;
  title?: string;
}

export interface ToastStackProps {
  t: Translate;
  toasts: ToastItemLike[];
  onDismiss: (id: number) => void;
  /** 落点（overlayHost）：设置弹窗里要 portal 进同一个 dialog，否则被压住。 */
  host?: Element | null;
}

export function ToastStack({ t, toasts, onDismiss, host }: ToastStackProps) {
  if (!toasts || toasts.length === 0) return null;
  const node = h('div', { className: 'dshsc-toastwrap', role: 'region', 'aria-label': t('toast.region') },
    toasts.map((toast) => {
      const isErr = toast.kind !== 'ok';
      // 错误类若调用点没给标题，用本地化的默认标题（成功类无标题，只显示一行）。
      const title = toast.title || (isErr ? t('toast.errTitle') : '');
      return h('div', {
        key: `toast-${toast.id}`,
        className: `dshsc-toastbar ${isErr ? 'err' : 'ok'}`,
        role: isErr ? 'alert' : 'status',
        'aria-live': isErr ? 'assertive' : 'polite',
      },
        h('span', { className: 'dshsc-toastbar-ic', 'aria-hidden': 'true' }, isErr ? '!' : '✓'),
        h('div', { className: 'dshsc-toastbar-body' },
          title ? h('div', { className: 'dshsc-toastbar-title' }, title) : null,
          h('div', { className: 'dshsc-toastbar-msg' }, toast.text)),
        h('button', {
          className: 'dshsc-toastbar-x',
          type: 'button',
          'aria-label': t('action.close'),
          onClick: () => onDismiss(toast.id),
        }, '×'));
    }));
  return portalize(node, host);
}

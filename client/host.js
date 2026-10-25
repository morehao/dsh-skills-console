/**
 * 唯一接触宿主模块的文件：react 必需，react-dom 可选（老宿主没暴露时退回内联渲染）。
 * 其余模块只从这里拿 React / h / portalize / 浮层层，方便宿主接口变化时收口。
 */
import React from 'react';

export const h = React.createElement;

let ReactDOM = null;
try {
  ReactDOM = require('react-dom');
} catch {
  ReactDOM = null;
}

/**
 * 插件浮层的落点：设置页的根挂在宿主设置弹窗（role="dialog"）里，
 * 抽屉 / 弹窗也要 portal 进同一个弹窗——否则宿主的 z-index:1000 模态层会把 body 上的浮层压住。
 * 侧栏主面板里没有祖先弹窗，回落到 body。
 */
export function overlayHost() {
  if (typeof document === 'undefined') return null;
  const root = document.querySelector?.('.dshsc-root');
  const dialog = root?.closest?.('[role="dialog"]');
  return dialog || document.querySelector?.('body') || null;
}

// 浮层（抽屉 / 设置弹窗 / toast / Agent 气泡）统一走 portal：列表和页面的 overflow 都裁不到
export function portalize(node, target) {
  const host = target || (typeof document !== 'undefined' ? document.body : null);
  return ReactDOM?.createPortal && host ? ReactDOM.createPortal(node, host) : node;
}

// 插件自己的浮层栈：Esc 只关最上面这层，并拦住宿主设置弹窗的 document 级 Esc
const overlayLayers = [];
let escapeGuarded = false;

function onOverlayEscape(event) {
  if (event.key !== 'Escape' || overlayLayers.length === 0) return;
  // 宿主的 Esc 挂在 document 冒泡阶段；这里在捕获阶段截住，避免抽屉/弹窗和设置页一起关
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  overlayLayers[overlayLayers.length - 1].close();
}

/** 注册一层浮层：active 时入栈，Esc 关最上层；关闭时出栈。 */
export function useOverlayLayer(active, close) {
  const closeRef = React.useRef(close);
  closeRef.current = close;
  React.useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const layer = { close: () => closeRef.current?.() };
    overlayLayers.push(layer);
    if (!escapeGuarded) {
      document.addEventListener('keydown', onOverlayEscape, true);
      escapeGuarded = true;
    }
    return () => {
      const index = overlayLayers.indexOf(layer);
      if (index >= 0) overlayLayers.splice(index, 1);
      if (overlayLayers.length === 0 && escapeGuarded) {
        document.removeEventListener('keydown', onOverlayEscape, true);
        escapeGuarded = false;
      }
    };
  }, [active]);
}

/**
 * 唯一接触宿主模块的文件：react 必需，react-dom 可选（老宿主没暴露时退回内联渲染）。
 * 其余模块只从这里拿 React / h / portalize，方便宿主接口变化时收口。
 */
import React from 'react';

export const h = React.createElement;

let ReactDOM = null;
try {
  ReactDOM = require('react-dom');
} catch {
  ReactDOM = null;
}

// 浮层（设置面板 / Agent 气泡）统一走 portal：列表和页面的 overflow 都裁不到
export function portalize(node) {
  return ReactDOM?.createPortal && typeof document !== 'undefined' && document.body
    ? ReactDOM.createPortal(node, document.body)
    : node;
}

/**
 * 滚动容器探测：把「谁在滚」收在一处。
 * 列表区（还原滚动位置）与查看器（目录高亮 / 锚点跳转）共用同一套口径；
 * 只碰 DOM 全局，不 import React / api / views。
 */

/**
 * 元素自己是不是滚动容器：overflow-y 可滚，且内容确实超出。
 * 4px 容差避开亚像素 / 边框噪声——1~3px 的伪溢出不该被当成「内容超长」。
 */
export function isScroller(node: Element | null | undefined, tolerance = 4): boolean {
  if (!node || typeof getComputedStyle !== 'function') return false;
  const style = getComputedStyle(node);
  return Boolean(style && /(auto|scroll)/.test(style.overflowY || '') && node.scrollHeight > node.clientHeight + tolerance);
}

/** 最近的滚动祖先：整页挂在设置页里时，真正滚动的是外层容器（侧栏 / 设置页）。 */
export function nearestScroller(node: Element | null, tolerance = 4): Element | null {
  let current = node?.parentElement || null;
  while (current) {
    if (isScroller(current, tolerance)) return current;
    current = current.parentElement || null;
  }
  return typeof document !== 'undefined' ? document.scrollingElement || null : null;
}

/** 先认自己，再找祖先；都找不到时退回 node（查看器正文的旧行为）。 */
export function scrollHost(node: Element | null, tolerance = 4): Element | null {
  // 正文自己就是滚动容器（列表之外的区域现在都固定），先认它；抽屉与旧宿主再找祖先
  if (isScroller(node, tolerance)) return node;
  return (node && nearestScroller(node, tolerance)) || node;
}

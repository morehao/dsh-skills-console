import assert from 'node:assert/strict';
import test from 'node:test';

import { isScroller, nearestScroller, scrollHost } from '../client/scroll.js';

/**
 * 滚动容器探测的纯函数用例。
 * 直接 import client/scroll.js（不经过 bundle）：这类 DOM 工具不需要 React 存根，
 * 用假节点 + 假 getComputedStyle 就能把判定口径钉住。
 */
function fakeNode({ overflow = 'visible', scrollHeight = 0, clientHeight = 0 } = {}) {
  return { style: { overflowY: overflow }, scrollHeight, clientHeight, parentElement: null };
}

function withDom(run) {
  const previousStyle = globalThis.getComputedStyle;
  const previousDocument = globalThis.document;
  globalThis.getComputedStyle = (node) => node?.style || null;
  const scrollingElement = fakeNode();
  globalThis.document = { scrollingElement };
  try {
    run(scrollingElement);
  } finally {
    if (previousStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousStyle;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('isScroller：可滚 + 内容超出才算；4px 以内的伪溢出不算', () => {
  withDom(() => {
    assert.equal(isScroller(fakeNode({ overflow: 'auto', scrollHeight: 200, clientHeight: 100 })), true);
    // 2px 溢出：亚像素 / 边框噪声，不该被当成滚动容器
    assert.equal(isScroller(fakeNode({ overflow: 'auto', scrollHeight: 102, clientHeight: 100 })), false);
    // 内容不超出
    assert.equal(isScroller(fakeNode({ overflow: 'auto', scrollHeight: 100, clientHeight: 100 })), false);
    // 不可滚
    assert.equal(isScroller(fakeNode({ overflow: 'hidden', scrollHeight: 999, clientHeight: 100 })), false);
    // 空节点
    assert.equal(isScroller(null), false);
  });
});

test('isScroller：没有 getComputedStyle 的环境（Node / SSR）一律 false，不抛错', () => {
  withDom(() => {
    const previous = globalThis.getComputedStyle;
    delete globalThis.getComputedStyle;
    try {
      assert.equal(isScroller(fakeNode({ overflow: 'auto', scrollHeight: 200, clientHeight: 100 })), false);
    } finally {
      globalThis.getComputedStyle = previous;
    }
  });
});

test('nearestScroller：跳过不可滚的父级，命中最近的可滚祖先', () => {
  withDom(() => {
    const scroller = fakeNode({ overflow: 'auto', scrollHeight: 300, clientHeight: 100 });
    const middle = fakeNode({ overflow: 'visible', scrollHeight: 300, clientHeight: 100 });
    const node = fakeNode();
    node.parentElement = middle;
    middle.parentElement = scroller;
    assert.equal(nearestScroller(node), scroller);
  });
});

test('nearestScroller：祖先都不可滚时退回文档滚动元素', () => {
  withDom((scrollingElement) => {
    const node = fakeNode();
    node.parentElement = fakeNode();
    assert.equal(nearestScroller(node), scrollingElement);
  });
});

test('scrollHost：先认自己，再找祖先，都没有时退回自身', () => {
  withDom(() => {
    const self = fakeNode({ overflow: 'auto', scrollHeight: 300, clientHeight: 100 });
    assert.equal(scrollHost(self), self);

    const scroller = fakeNode({ overflow: 'auto', scrollHeight: 300, clientHeight: 100 });
    const child = fakeNode();
    child.parentElement = scroller;
    assert.equal(scrollHost(child), scroller);

    // 全链路都不可滚、也没有 document：退回传入节点，调用方仍能拿到 scrollTop
    const lone = fakeNode();
    const previousDocument = globalThis.document;
    delete globalThis.document;
    try {
      assert.equal(scrollHost(lone), lone);
    } finally {
      globalThis.document = previousDocument;
    }
  });
});

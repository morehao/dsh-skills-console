/**
 * 正文渲染：markdown AST → React 节点。
 * 与查看器外壳（tab / 文件树 / 浮层）无关，只认 `Markdown` 的 props；
 * 解析仍然在 client/markdown.js（纯函数），这里只负责画。
 *
 * 用 h 建节点，不用 dangerouslySetInnerHTML；链接按 markdown.js 的协议分类决定可点性。
 */
import { h } from '../host.js';
import { parseMarkdown, stripFrontmatter } from '../markdown.js';

/** 解析结果按正文缓存：切 tab / 切渲染不重复解析，最多留 8 份。 */
const PARSE_CACHE = new Map();

/** 解析并缓存：frontmatter 先剥掉；查看器用它取标题列表。 */
export function parseCached(text) {
  const key = String(text ?? '');
  if (PARSE_CACHE.has(key)) return PARSE_CACHE.get(key);
  const parsed = parseMarkdown(stripFrontmatter(key).body);
  PARSE_CACHE.set(key, parsed);
  if (PARSE_CACHE.size > 8) {
    const oldest = PARSE_CACHE.keys().next().value;
    PARSE_CACHE.delete(oldest);
  }
  return parsed;
}

/** 行内 AST → React 节点。 */
function inlineNodes(nodes, { onOpenFile, onOpenAnchor, keyPrefix = 'i' }) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return node.value;
      case 'code':
        return h('code', { className: 'dshsc-md-inline', key }, node.value);
      case 'strong':
        return h('strong', { key }, inlineNodes(node.children, { onOpenFile, onOpenAnchor, keyPrefix: key }));
      case 'em':
        return h('em', { key }, inlineNodes(node.children, { onOpenFile, onOpenAnchor, keyPrefix: key }));
      case 'link': {
        const children = inlineNodes(node.children, { onOpenFile, onOpenAnchor, keyPrefix: key });
        if (node.kind === 'external') {
          return h('a', {
            className: 'dshsc-md-link',
            key,
            href: node.href,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, children);
        }
        if (node.kind === 'anchor') {
          return h('a', {
            className: 'dshsc-md-link',
            key,
            href: `#${node.href}`,
            onClick: (event) => {
              event?.preventDefault?.();
              onOpenAnchor?.(node.href);
            },
          }, children);
        }
        if (node.kind === 'relative') {
          return h('a', {
            className: 'dshsc-md-link',
            key,
            href: '#',
            title: node.href,
            onClick: (event) => {
              event?.preventDefault?.();
              onOpenFile?.(node.href);
            },
          }, children);
        }
        // javascript: / data: 之类：只显示文字，不给可点的锚
        return h('span', { className: 'dshsc-md-nolink', key }, children);
      }
      case 'image':
        // v1 不请求本地文件：图片一律占位（路径 + alt），避免把任意文件当图片读
        return h('span', { className: 'dshsc-md-image', key, title: node.src },
          h('span', { className: 'dshsc-md-image-tag' }, 'IMG'),
          node.alt || node.src);
      default:
        return null;
    }
  });
}

function blockNodes(blocks, options) {
  return blocks.map((block, index) => {
    const key = `b-${index}`;
    switch (block.type) {
      case 'heading': {
        const tag = `h${Math.min(block.level, 6)}`;
        return h(tag, { className: 'dshsc-md-h', key, id: block.id, 'data-md-id': block.id },
          inlineNodes(block.inlines, { ...options, keyPrefix: key }));
      }
      case 'paragraph':
        return h('p', { className: 'dshsc-md-p', key },
          inlineNodes(block.inlines, { ...options, keyPrefix: key }));
      case 'code':
        return h('pre', { className: 'dshsc-md-code', key, 'data-lang': block.lang || undefined },
          h('code', null, block.text));
      case 'hr':
        return h('hr', { className: 'dshsc-md-hr', key });
      case 'quote':
        return h('blockquote', { className: 'dshsc-md-quote', key }, blockNodes(block.blocks, options));
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        return h(tag, { className: 'dshsc-md-list', key }, block.items.map((item, itemIndex) => h('li', {
          key: `${key}-${itemIndex}`,
          className: item.checked === null || item.checked === undefined ? undefined : 'dshsc-md-task',
        },
        item.checked === null || item.checked === undefined
          ? null
          : h('span', { className: `dshsc-md-check${item.checked ? ' on' : ''}`, 'aria-hidden': true }),
        inlineNodes(item.inlines, { ...options, keyPrefix: `${key}-${itemIndex}` }),
        Array.isArray(item.children) && item.children.length > 0 ? blockNodes(item.children, options) : null)));
      }
      case 'table':
        return h('div', { className: 'dshsc-md-table', key },
          h('table', null,
            h('thead', null, h('tr', null, block.header.map((cell, cellIndex) => h('th', {
              key: `h-${cellIndex}`,
              style: { textAlign: block.align?.[cellIndex] || 'left' },
            }, inlineNodes(cell, { ...options, keyPrefix: `${key}-h-${cellIndex}` }))))),
            h('tbody', null, block.rows.map((row, rowIndex) => h('tr', { key: `r-${rowIndex}` },
              row.map((cell, cellIndex) => h('td', {
                key: `c-${cellIndex}`,
                style: { textAlign: block.align?.[cellIndex] || 'left' },
              }, inlineNodes(cell, { ...options, keyPrefix: `${key}-${rowIndex}-${cellIndex}` }))))))));
      default:
        return null;
    }
  });
}

/** 正文渲染：`text` 可以是完整 SKILL.md（frontmatter 会自动剥掉）。 */
export function Markdown({ text, onOpenFile, onOpenAnchor }) {
  const { blocks } = parseCached(text);
  return h('div', { className: 'dshsc-md' }, blockNodes(blocks, { onOpenFile, onOpenAnchor }));
}

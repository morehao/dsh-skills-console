/**
 * 最小 Markdown 解析器：纯函数，不碰 React / DOM，也不引入依赖（客户端只允许 react）。
 *
 * 覆盖 SKILL.md 实际用到的语法：标题、段落、行内 code、粗体 / 斜体、链接、图片、
 * fenced code、有序 / 无序 / 任务列表（最多两层嵌套）、引用、水平线、表格（含对齐）。
 * 认不出的语法一律退回段落文本；原始 HTML 当纯文本，不执行。
 *
 * 渲染交给 `views/markdown-view.js` 的 `Markdown` 组件（用 h 建节点，不用 innerHTML）。
 */

/** 链接分类：外部 / 文内锚点 / 技能内相对路径 / 不可点。 */
export function classifyHref(href) {
  const value = String(href ?? '').trim();
  if (!value) return { kind: 'unsafe', href: value };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return { kind: 'unsafe', href: value };
  if (value.startsWith('#')) return { kind: 'anchor', href: value.slice(1) };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name === 'http' || name === 'https' || name === 'mailto') return { kind: 'external', href: value };
    return { kind: 'unsafe', href: value };
  }
  if (value.startsWith('//')) return { kind: 'unsafe', href: value };
  return { kind: 'relative', href: value };
}

/** 标题文本 → 锚点 id：保留中日韩与字母数字，其余折成 `-`。 */
export function slugify(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 剥离开头的 YAML frontmatter；没有或没闭合就当没有。 */
export function stripFrontmatter(text) {
  const source = String(text ?? '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { frontmatter: null, body: source };
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '>', '~']);

/** 从 `[` 开始找一整个 `[label](href)`（括号可嵌套一层，`javascript:alert(1)` 也能整段取到）。 */
function matchBracketLink(text, start) {
  const close = text.indexOf(']', start + 1);
  if (close < 0) return null;
  if (text[close + 1] !== '(') return null;
  let depth = 0;
  let index = close + 1;
  for (; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (index >= text.length) return null;
  const label = text.slice(start + 1, close);
  const rawTarget = text.slice(close + 2, index).trim();
  // `(url "title")`：标题丢掉，只留第一个 token
  const href = rawTarget.split(/\s+/)[0] || '';
  return { label, href, end: index + 1 };
}

/** 行内：转义、行内 code、图片、链接、粗体、斜体。 */
export function parseInline(text) {
  const source = String(text ?? '');
  const nodes = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];

    if (char === '\\' && ESCAPABLE.has(source[index + 1])) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    if (char === '`') {
      const end = source.indexOf('`', index + 1);
      if (end > index + 1) {
        flush();
        nodes.push({ type: 'code', value: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (char === '!' && source[index + 1] === '[') {
      const match = matchBracketLink(source, index + 1);
      if (match) {
        flush();
        const target = classifyHref(match.href);
        nodes.push({ type: 'image', alt: match.label, src: match.href, kind: target.kind });
        index = match.end;
        continue;
      }
    }

    if (char === '[') {
      const match = matchBracketLink(source, index);
      if (match) {
        flush();
        const target = classifyHref(match.href);
        nodes.push({
          type: 'link',
          href: target.href,
          kind: target.kind,
          children: parseInline(match.label),
        });
        index = match.end;
        continue;
      }
    }

    if (char === '*' || char === '_') {
      const doubled = source[index + 1] === char;
      const marker = doubled ? char + char : char;
      const end = source.indexOf(marker, index + marker.length);
      if (end > index + marker.length) {
        flush();
        nodes.push({
          type: doubled ? 'strong' : 'em',
          children: parseInline(source.slice(index + marker.length, end)),
        });
        index = end + marker.length;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return nodes;
}

/** 行内 AST → 纯文本（标题锚点、目录、aria-label 用）。 */
export function inlineToText(nodes) {
  if (!Array.isArray(nodes)) return String(nodes ?? '');
  return nodes.map((node) => {
    if (node.type === 'text' || node.type === 'code') return node.value;
    if (node.type === 'image') return node.alt || '';
    return inlineToText(node.children);
  }).join('');
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`]*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function alignOf(cell) {
  const value = cell.trim();
  if (/^:-+:$/.test(value)) return 'center';
  if (/^:-+$/.test(value)) return 'left';
  if (/^-+:$/.test(value)) return 'right';
  return null;
}

/** Markdown → `{ blocks, headings }`。headings 给整页目录用。 */
export function parseMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const headings = [];
  const usedIds = new Map();

  const headingId = (plain) => {
    const base = slugify(plain) || 'section';
    const seen = usedIds.get(base) || 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };

  const isBlockStart = (line) => FENCE.test(line)
    || HEADING.test(line)
    || HR.test(line)
    || LIST_ITEM.test(line)
    || QUOTE.test(line)
    || line.includes('|');

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2];
      const info = fence[3].trim();
      const body = [];
      index += 1;
      while (index < lines.length) {
        const current = lines[index];
        if (current.trim().startsWith(marker[0].repeat(marker.length)) && current.trim().replace(/[`~]/g, '') === '') {
          index += 1;
          break;
        }
        body.push(current);
        index += 1;
      }
      blocks.push({ type: 'code', lang: info.split(/\s+/)[0] || '', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const inlines = parseInline(heading[2]);
      const plain = inlineToText(inlines).trim();
      const id = headingId(plain);
      blocks.push({ type: 'heading', level, id, inlines, text: plain });
      headings.push({ id, level, text: plain });
      index += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', blocks: parseMarkdown(quoted.join('\n')).blocks });
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1])) {
      const header = splitRow(line).map((cell) => parseInline(cell));
      const align = splitRow(lines[index + 1]).map(alignOf);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitRow(lines[index]).map((cell) => parseInline(cell)));
        index += 1;
      }
      blocks.push({ type: 'table', align, header, rows });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const first = LIST_ITEM.exec(line);
      const ordered = /\d/.test(first[2]);
      const items = [];
      while (index < lines.length) {
        const match = LIST_ITEM.exec(lines[index]);
        if (!match) break;
        const indent = match[1].replace(/\t/g, '  ').length;
        if (indent > 3) break; // 更深层的嵌套在下面按子列表处理
        const content = match[3];
        let checked = null;
        const task = /^\[([ xX])\]\s*(.*)$/.exec(content);
        const text2 = task ? task[2] : content;
        if (task) checked = task[1].toLowerCase() === 'x';
        index += 1;

        // 收集属于这一项的嵌套项（缩进 > 0 且未超过两层）
        const nested = [];
        while (index < lines.length) {
          const child = LIST_ITEM.exec(lines[index]);
          if (!child) break;
          const childIndent = child[1].replace(/\t/g, '  ').length;
          if (childIndent === 0) break;
          nested.push(lines[index]);
          index += 1;
        }
        // 续行：非空、非列表、非块起始的行并入本项
        while (index < lines.length && lines[index].trim() && !LIST_ITEM.test(lines[index]) && !isBlockStart(lines[index])) {
          index += 1;
        }
        const item = { inlines: parseInline(text2), checked };
        if (nested.length > 0) {
          const sub = parseMarkdown(nested.map((row) => row.replace(/^\s{1,4}/, '')).join('\n')).blocks;
          item.children = sub;
        }
        items.push(item);
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // 段落：吃到空行或下一个块起始
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.map((row) => row.trim()).join(' ')) });
  }

  return { blocks, headings };
}

/**
 * 相对链接 → 查看器内部路径：按当前文件所在目录解析，`..` 折回上级，越界的那一段直接丢掉。
 * `#anchor`、`?query` 不参与路径；返回值交给 `onOpenFile`。
 */
export function resolveRelativeHref(currentDir, href) {
  const target = classifyHref(href);
  if (target.kind === 'anchor') return { relPath: '', anchor: target.href };
  const raw = String(target.href || '').split('#')[0].split('?')[0];
  const base = String(currentDir || '').replace(/^\/+|\/+$/g, '');
  if (!raw) return { relPath: '', anchor: target.kind === 'anchor' ? target.href : '' };
  const segments = `${base ? `${base}/` : ''}${raw}`.split('/');
  const out = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return { relPath: out.join('/'), anchor: target.kind === 'anchor' ? target.href : '' };
}

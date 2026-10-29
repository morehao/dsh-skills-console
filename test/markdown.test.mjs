import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyHref,
  inlineToText,
  parseInline,
  parseMarkdown,
  resolveRelativeHref,
  slugify,
  stripFrontmatter,
} from '../client/markdown.ts';

const types = (blocks) => blocks.map((block) => block.type);

test('frontmatter：只剥离开头那一段，正文里出现的 --- 不动', () => {
  const { frontmatter, body } = stripFrontmatter('---\nname: demo\ndescription: 演示\n---\n# 标题\n\n---\n尾巴\n');
  assert.equal(frontmatter, 'name: demo\ndescription: 演示');
  assert.match(body, /^# 标题/);
  assert.match(body, /---\n尾巴/, '正文里的分隔线保留');

  assert.deepEqual(stripFrontmatter('# 没有 frontmatter\n'), { frontmatter: null, body: '# 没有 frontmatter\n' });
  assert.deepEqual(stripFrontmatter(''), { frontmatter: null, body: '' });
  assert.equal(stripFrontmatter('---\nname: x\n').frontmatter, null, '没闭合就当没有');
});

test('标题 / 目录锚点：层级、纯文本与去重', () => {
  const { blocks, headings } = parseMarkdown('# 一\n\n## 二 节\n\n## 二 节\n\n#### 深\n');
  assert.deepEqual(headings.map((item) => item.level), [1, 2, 2, 4]);
  assert.deepEqual(headings.map((item) => item.text), ['一', '二 节', '二 节', '深']);
  assert.equal(headings[1].id, '二-节');
  assert.equal(headings[2].id, '二-节-2', '同名标题给不同 id');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(slugify('Grounding Guide!'), 'grounding-guide');
});

test('段落与行内：粗体、斜体、行内 code、转义', () => {
  const { blocks } = parseMarkdown('这是 **粗** 和 *斜* 和 `code` 还有 \\*不是斜体\\*\n第二行同一段\n\n新段落\n');
  assert.deepEqual(types(blocks), ['paragraph', 'paragraph']);
  const inlines = blocks[0].inlines;
  assert.deepEqual(inlines.map((node) => node.type), ['text', 'strong', 'text', 'em', 'text', 'code', 'text']);
  assert.equal(inlineToText(inlines), '这是 粗 和 斜 和 code 还有 *不是斜体* 第二行同一段');
});

test('fenced code：里面的 # 和 | 都只是代码', () => {
  const { blocks, headings } = parseMarkdown('```bash\n# 注释\n| a | b |\n```\n\n# 真正的标题\n');
  assert.deepEqual(types(blocks), ['code', 'heading']);
  assert.equal(blocks[0].lang, 'bash');
  assert.equal(blocks[0].text, '# 注释\n| a | b |');
  assert.equal(headings.length, 1);
});

test('列表：无序、有序、任务列表，嵌套最多两层', () => {
  const unordered = parseMarkdown('- 一\n- 二\n  - 二点一\n- 三\n').blocks[0];
  assert.equal(unordered.type, 'list');
  assert.equal(unordered.ordered, false);
  assert.equal(unordered.items.length, 3);
  assert.equal(inlineToText(unordered.items[0].inlines), '一');
  assert.equal(unordered.items[1].children.length, 1, '缩进项落成子列表');
  assert.equal(unordered.items[1].children[0].type, 'list');

  const ordered = parseMarkdown('1. 第一\n2. 第二\n').blocks[0];
  assert.equal(ordered.ordered, true);
  assert.equal(ordered.items.length, 2);

  const tasks = parseMarkdown('- [ ] 没做\n- [x] 做了\n').blocks[0];
  assert.deepEqual(tasks.items.map((item) => item.checked), [false, true]);
});

test('表格：对齐信息与单元格', () => {
  const { blocks } = parseMarkdown('| 名称 | 值 | 备注 |\n| :--- | :--: | ---: |\n| a | **b** | c |\n');
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].align, ['left', 'center', 'right']);
  assert.equal(inlineToText(blocks[0].header[0]), '名称');
  assert.equal(blocks[0].rows.length, 1);
  assert.equal(inlineToText(blocks[0].rows[0][1]), 'b');
});

test('引用与水平线', () => {
  const { blocks } = parseMarkdown('> 引用一行\n> 引用两行\n\n---\n');
  assert.deepEqual(types(blocks), ['quote', 'hr']);
  assert.equal(blocks[0].blocks[0].type, 'paragraph');
  assert.equal(inlineToText(blocks[0].blocks[0].inlines), '引用一行 引用两行');
});

test('链接：分类只在白名单里给可点类型', () => {
  const unsafe = parseMarkdown('[x](javascript:alert(1))').blocks[0].inlines[0];
  assert.equal(unsafe.type, 'link');
  assert.equal(unsafe.kind, 'unsafe', 'javascript: 不能当链接渲染');

  assert.equal(classifyHref('https://example.com/a').kind, 'external');
  assert.equal(classifyHref('mailto:a@b.c').kind, 'external');
  assert.equal(classifyHref('#section').kind, 'anchor');
  assert.equal(classifyHref('references/guide.md').kind, 'relative');
  assert.equal(classifyHref('data:text/html;base64,xx').kind, 'unsafe');
  assert.equal(classifyHref('//evil.example/x').kind, 'unsafe');
  assert.equal(classifyHref('a\u0000b').kind, 'unsafe');

  const image = parseMarkdown('![图](images/a.png)').blocks[0].inlines[0];
  assert.equal(image.type, 'image');
  assert.equal(image.alt, '图');
  assert.equal(image.src, 'images/a.png');
});

test('原始 HTML 当文本，不产生可执行节点', () => {
  const { blocks } = parseMarkdown('<script>alert(1)</script>\n\n<b>粗</b>\n');
  assert.deepEqual(types(blocks), ['paragraph', 'paragraph']);
  assert.equal(inlineToText(blocks[0].inlines), '<script>alert(1)</script>');
  assert.equal(blocks.every((block) => block.type !== 'html'), true);
});

test('相对链接归一化：按当前文件目录解析，不越出技能根', () => {
  assert.equal(resolveRelativeHref('', 'references/guide.md').relPath, 'references/guide.md');
  assert.equal(resolveRelativeHref('references', '../SKILL.md').relPath, 'SKILL.md');
  assert.equal(resolveRelativeHref('references/deep', './a.md').relPath, 'references/deep/a.md');
  assert.equal(resolveRelativeHref('references', '../../../etc/passwd').relPath, 'etc/passwd', '越界段被丢掉');
  assert.deepEqual(resolveRelativeHref('references', '#anchor'), { relPath: '', anchor: 'anchor' });
  assert.equal(resolveRelativeHref('references', 'guide.md#part').relPath, 'references/guide.md');
});

test('空输入与未知语法：不抛异常，退回段落', () => {
  assert.deepEqual(parseMarkdown('').blocks, []);
  assert.deepEqual(parseMarkdown(undefined).headings, []);
  const { blocks } = parseMarkdown('::: 莫名语法 :::\n');
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(inlineToText(parseInline('***')), '***', '不配对的标记原样保留');
});

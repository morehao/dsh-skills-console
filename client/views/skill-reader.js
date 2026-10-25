/**
 * 技能查看器：抽屉（B1）与整页（A1）共用一套正文 / 文件 / 信息三 tab。
 * 纯展示：数据走 `hooks.useSkillReader`，写动作由 Section 注入回调（这里不发请求）。
 *
 * 渲染交给 `views/markdown-view.js`（h 建节点，不用 dangerouslySetInnerHTML）；
 * 这里只管外壳、tab、文件树与滚动。
 */
import React from 'react';

import { h, overlayHost, portalize, useOverlayLayer } from '../host.js';
import { short } from '../api.js';
import { useSkillReader } from '../hooks.js';
import { ChevronLeftIcon, CopyIcon, FileIcon, FolderIcon } from '../icons.js';
import { resolveRelativeHref } from '../markdown.js';
import { scrollHost } from '../scroll.js';
import { Markdown, parseCached } from './markdown-view.js';

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MARKDOWN = /\.(md|markdown)$/i;

function isMarkdownPath(relPath) {
  return MARKDOWN.test(String(relPath || ''));
}

function extOf(relPath) {
  const match = /\.([a-z0-9]+)$/i.exec(String(relPath || ''));
  return match ? match[1].toUpperCase() : 'FILE';
}

const STATUS_KEY = {
  current: 'status.current',
  'update-available': 'status.update',
  'locally-modified': 'status.local',
  conflict: 'status.conflict',
  'upstream-deleted': 'status.deleted',
  'broken-link': 'status.broken',
  unmanaged: 'status.unmanaged',
};

function TabButton({ id, label, count, active, onSelect }) {
  return h('button', {
    type: 'button',
    role: 'tab',
    id: `dshsc-tab-${id}`,
    'aria-selected': String(active),
    'aria-controls': `dshsc-panel-${id}`,
    tabIndex: active ? 0 : -1,
    className: `dshsc-rtab${active ? ' active' : ''}`,
    onClick: () => onSelect(id),
  }, label, count === null || count === undefined ? null : h('i', { className: 'n' }, count));
}

function InfoSection({ t, title, rows }) {
  return h('section', { className: 'dshsc-info-sec' },
    h('h3', null, title),
    h('dl', null, rows.map((row, index) => [
      h('dt', { key: `t-${index}` }, t(row[0])),
      h('dd', { key: `d-${index}`, className: row[2] === 'mono' ? 'mono' : undefined }, row[1]),
    ])));
}

/**
 * 查看器。`variant` 只决定外壳（抽屉 / 整页），正文、tab、数据都在同一个组件实例里，
 * 所以「在整页打开」不会重新拉数据。
 */
export function SkillReader({
  t,
  variant = 'drawer',
  row,
  writable,
  busy,
  readOnly,
  version,
  initialTab = 'doc',
  initialFile = null,
  onClose,
  onOpenPage,
  onUpdate,
  onLinks,
  onToast,
}) {
  const { state, file, loadFile, retry } = useSkillReader(row);
  const [tab, setTab] = React.useState(initialTab);
  const [format, setFormat] = React.useState('rendered');
  const [docOverride, setDocOverride] = React.useState(null);
  const [fileFormat, setFileFormat] = React.useState('rendered');
  const [tocActive, setTocActive] = React.useState(null);
  const [descOpen, setDescOpen] = React.useState(false);
  const [descClamped, setDescClamped] = React.useState(false);
  const bodyRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const descRef = React.useRef(null);
  const scrollRef = React.useRef(0);

  // 抽屉 / 整页阅读都注册成一层：Esc 只退回列表，不连带关掉背后的宿主设置弹窗
  useOverlayLayer(variant === 'drawer' || variant === 'page', onClose);

  const name = row?.name || '';
  const tree = state.tree;
  const files = tree?.files || [];
  const fileCount = files.filter((entry) => entry.kind === 'file').length;
  const bodyText = docOverride ? docOverride.content : (state.body?.content || '');
  const description = row?.description || state.body?.meta?.description || '';
  const headings = tab === 'doc' && bodyText ? parseCached(bodyText).headings : [];

  // 换技能就丢掉「正文里临时打开的文件」和滚动位置
  React.useEffect(() => {
    setDocOverride(null);
    scrollRef.current = 0;
  }, [name]);

  // 换技能时收起描述。用 ref 挡一道：effect 在存根里每轮都会执行，不能无条件重置用户刚展开的状态
  const descOwnerRef = React.useRef(name);
  React.useEffect(() => {
    if (descOwnerRef.current === name) return;
    descOwnerRef.current = name;
    setDescOpen(false);
    setDescClamped(false);
  }, [name]);

  // 描述确实被行数上限截断时才给「展开」；宽度变化（抽屉 / 整页 / 改窗口）要重量
  React.useLayoutEffect(() => {
    const node = descRef.current;
    if (!node) return undefined;
    const measure = () => {
      // 展开状态下的高度就是全文高度，再量会把按钮判没，所以保持原状
      if (descOpen) return;
      const scroll = Number(node.scrollHeight) || 0;
      const client = Number(node.clientHeight) || 0;
      setDescClamped(scroll > client + 1);
    };
    measure();
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    window.addEventListener('resize', measure);
    let observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(measure);
      observer.observe(node);
    }
    return () => {
      observer?.disconnect?.();
      window.removeEventListener('resize', measure);
    };
  }, [description, descOpen]);

  // 从别处带着文件进来（例如从文件 tab 再次打开同一个文件）：只拉一次
  React.useEffect(() => {
    if (!initialFile) return;
    setTab('files');
    void loadFile(initialFile);
  }, [initialFile, loadFile]);

  // 切渲染 / 原文：记住滚动位置，渲染完成后放回去
  React.useEffect(() => {
    const node = bodyRef.current;
    if (node && scrollRef.current) node.scrollTop = scrollRef.current;
  });

  // 抽屉：Tab 焦点陷阱、关闭后把焦点还给触发的按钮（Esc 由 useOverlayLayer 统一处理）
  React.useEffect(() => {
    if (variant !== 'drawer' || typeof document === 'undefined') return undefined;
    const previous = document.activeElement;
    const node = dialogRef.current;
    node?.focus?.();
    const onKeyDown = (event) => {
      if (event?.key !== 'Tab' || !node?.querySelectorAll) return;
      const focusables = Array.from(
        node.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      ).filter((item) => item.offsetParent !== null || item === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault?.();
        last.focus?.();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault?.();
        first.focus?.();
      }
    };
    // 捕获阶段先于宿主设置弹窗的 Tab 陷阱，防止焦点跑到遮罩后的设置导航上
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, [variant, onClose]);

  // 整页：进来先把焦点放到技能名上，返回时由抽屉 / 行的回调接管
  React.useEffect(() => {
    if (variant !== 'page' || typeof document === 'undefined') return;
    const node = document.getElementById('dshsc-reader-name');
    node?.focus?.();
  }, [variant, name]);

  // 整页：目录高亮跟着正文滚动走
  React.useEffect(() => {
    if (variant !== 'page' || typeof window === 'undefined') return undefined;
    const node = bodyRef.current;
    if (!node?.querySelectorAll) return undefined;
    const scroller = scrollHost(node);
    const sync = () => {
      const line = (scroller?.getBoundingClientRect?.().top ?? 0) + 96;
      let current = null;
      for (const element of Array.from(node.querySelectorAll('[data-md-id]'))) {
        const top = element.getBoundingClientRect?.().top ?? 0;
        if (top <= line) current = element.getAttribute('data-md-id');
      }
      setTocActive(current || headings[0]?.id || null);
    };
    sync();
    scroller?.addEventListener?.('scroll', sync, { passive: true });
    return () => scroller?.removeEventListener?.('scroll', sync);
  }, [variant, headings.length, tab, bodyText]);

  function scrollToAnchor(id) {
    const node = bodyRef.current;
    if (!node?.querySelectorAll) return;
    const target = Array.from(node.querySelectorAll('[data-md-id]'))
      .find((element) => element.getAttribute('data-md-id') === id);
    if (!target) return;
    const scroller = scrollHost(node);
    const offset = target.getBoundingClientRect().top - (scroller?.getBoundingClientRect?.().top ?? 0);
    if (scroller) scroller.scrollTop = Math.max(0, (scroller.scrollTop || 0) + offset - 12);
    setTocActive(id);
  }

  function openLinkedFile(href, fromPath) {
    // 相对链接按「当前正在读的文件」所在目录解析；解析结果为空说明只是锚点
    const source = fromPath || docOverride?.relPath || '';
    const base = source.split('/').slice(0, -1).join('/');
    const resolved = resolveRelativeHref(base, href);
    if (!resolved.relPath) return;
    setTab('files');
    void loadFile(resolved.relPath);
  }

  async function copyTextWithToast(text, okKey) {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    onToast?.(ok ? { kind: 'ok', text: t(okKey) } : { kind: 'err', text: t('viewer.copyFailed') });
  }

  function selectTab(next) {
    if (next === tab) return;
    if (bodyRef.current) scrollRef.current = 0;
    setTab(next);
  }

  const header = h('header', { className: 'dshsc-reader-head' },
    h('div', { className: 'dshsc-reader-title' },
      h('h2', { id: 'dshsc-reader-name', tabIndex: -1 }, name || t('viewer.title')),
      row?.status && STATUS_KEY[row.status]
        ? h('span', { className: `dshsc-tag ${row.status === 'current' ? 'ok' : 'warn'}` }, t(STATUS_KEY[row.status]))
        : null,
      row?.mode === 'off' ? h('span', { className: 'dshsc-tag off' }, t('status.off')) : null,
      variant === 'drawer'
        ? h('button', {
            type: 'button',
            className: 'dshsc-reader-close',
            'aria-label': t('viewer.close'),
            title: t('viewer.close'),
            onClick: () => onClose?.(),
          }, '×')
        : null),
    description
      ? h('div', { className: 'dshsc-reader-descblock' },
          h('p', {
            className: `dshsc-reader-desc${descOpen ? ' expanded' : ''}`,
            id: 'dshsc-reader-desc',
            ref: descRef,
          }, description),
          descClamped
            ? h('button', {
                type: 'button',
                className: 'dshsc-reader-more',
                'aria-expanded': String(descOpen),
                'aria-controls': 'dshsc-reader-desc',
                onClick: () => setDescOpen((prev) => !prev),
              }, t(descOpen ? 'action.collapse' : 'action.expand'))
            : null)
      : null,
    h('div', { className: 'dshsc-reader-meta' },
      h('span', null, `${t('meta.from')} `,
        h('span', { className: 'dshsc-code' }, row?.source
          ? `${row.source}${row.commit ? `#${short(row.commit)}` : row.ref ? `#${row.ref}` : ''}`
          : t('meta.noUpstream'))),
      tree ? h('span', null, t('viewer.fileCount').replace('{n}', String(fileCount))) : null,
      row?.updatedAt ? h('span', null, formatWhen(row.updatedAt)) : null));

  const tabsBar = h('div', { className: 'dshsc-reader-tabs' },
    h('div', { className: 'dshsc-rtabs', role: 'tablist', 'aria-label': t('viewer.title') },
      h(TabButton, { id: 'doc', label: t('viewer.tab.doc'), active: tab === 'doc', onSelect: selectTab }),
      h(TabButton, { id: 'files', label: t('viewer.tab.files'), count: tree ? fileCount : null, active: tab === 'files', onSelect: selectTab }),
      h(TabButton, { id: 'info', label: t('viewer.tab.info'), active: tab === 'info', onSelect: selectTab })),
    tab === 'doc' && !docOverride
      ? h('div', { className: 'dshsc-segment dshsc-reader-seg', role: 'group', 'aria-label': t('viewer.rendered') },
          h('button', {
            type: 'button',
            className: 'dshsc-btn',
            'aria-pressed': String(format === 'rendered'),
            onClick: () => setFormat('rendered'),
          }, t('viewer.rendered')),
          h('button', {
            type: 'button',
            className: 'dshsc-btn',
            'aria-pressed': String(format === 'raw'),
            onClick: () => setFormat('raw'),
          }, t('viewer.raw')))
      : null);

  function docPanel() {
    if (state.loading) {
      return h('div', { className: 'dshsc-reader-skeleton' },
        h('span', null, t('viewer.loading')),
        h('i'), h('i'), h('i'));
    }
    if (!bodyText) {
      const error = state.bodyError;
      const missing = error?.code === 'error.skills.no-skill-md';
      return h('div', { className: 'dshsc-reader-placeholder' },
        h('b', null, missing ? t('viewer.noSkill') : (error?.message || t('viewer.noSkill'))),
        missing ? h('span', null, t('viewer.noSkillHint')) : null,
        error && !missing
          ? h('button', { type: 'button', className: 'dshsc-btn', onClick: retry }, t('viewer.retry'))
          : null);
    }
    if (docOverride) {
      return h('div', { className: 'dshsc-reader-doc' },
        h('div', { className: 'dshsc-reader-filebar' },
          h('span', { className: 'mono' }, docOverride.relPath),
          h('button', {
            type: 'button',
            className: 'dshsc-btn',
            onClick: () => setDocOverride(null),
          }, t('viewer.backToBody'))),
        h(Markdown, { text: docOverride.content, onOpenFile: openLinkedFile, onOpenAnchor: scrollToAnchor }));
    }
    const truncated = Boolean(state.body?.truncated);
    return h('div', { className: 'dshsc-reader-doc' },
      truncated
        ? h('div', { className: 'dshsc-banner warn' }, t('viewer.tooLarge').replace('{size}', formatBytes(256 * 1024)))
        : null,
      format === 'raw'
        ? h('pre', { className: 'dshsc-reader-raw' }, h('code', null, bodyText))
        : h(Markdown, { text: bodyText, onOpenFile: openLinkedFile, onOpenAnchor: scrollToAnchor }));
  }

  function filesPanel() {
    if (state.treeError) {
      return h('div', { className: 'dshsc-reader-placeholder' },
        h('b', null, state.treeError.message),
        h('button', { type: 'button', className: 'dshsc-btn', onClick: retry }, t('viewer.retry')));
    }
    if (!tree) return h('div', { className: 'dshsc-reader-skeleton' }, h('i'), h('i'));
    if (files.length === 0) {
      return h('div', { className: 'dshsc-reader-placeholder' }, h('b', null, t('viewer.emptyFiles')));
    }
    const active = file.relPath;
    const activeEntry = files.find((entry) => entry.kind === 'file' && entry.path === active) || null;
    // 能渲染的直接渲染：markdown 默认走渲染视图，原文仍可切；其他文本给源码
    const renderable = Boolean(active) && isMarkdownPath(active) && !file.error && !file.loading;
    const preview = file.loading
      ? h('div', { className: 'dshsc-reader-skeleton' }, h('i'), h('i'), h('i'))
      : file.error
        ? h('div', { className: 'dshsc-reader-placeholder' },
            h('b', null, file.error.code === 'error.skills.binary' ? t('viewer.binary') : file.error.message),
            h('span', { className: 'mono' },
              [active, activeEntry ? formatBytes(activeEntry.size) : null].filter(Boolean).join(' · ')),
            file.error.code === 'error.skills.binary' ? h('span', null, t('viewer.binaryHint')) : null)
        : renderable && fileFormat === 'rendered'
          ? h('div', { className: 'dshsc-reader-preview-doc' },
              h(Markdown, {
                text: file.content,
                onOpenFile: (href) => openLinkedFile(href, file.relPath || active),
                onOpenAnchor: scrollToAnchor,
              }))
          : h('pre', { className: 'dshsc-reader-raw' },
              h('code', null, file.content
                + (file.truncated ? `\n\n… ${t('viewer.tooLarge').replace('{size}', formatBytes(256 * 1024))}` : '')));

    return h('div', { className: 'dshsc-reader-files' },
      h('div', { className: 'dshsc-reader-tree' },
        h('div', { className: 'dshsc-reader-tree-head' },
          h('span', null, name),
          h('span', { className: 'mono' }, tree.kind === 'file' ? tree.body : `~/.agents/skills/${name}`)),
        files.map((entry) => {
          if (entry.kind === 'dir') {
            const count = files.filter((item) => item.kind === 'file' && item.path.startsWith(`${entry.path}/`)).length;
            return h('div', { className: 'dshsc-reader-tdir', key: `d:${entry.path}` },
              h(FolderIcon, null),
              h('span', { className: 'mono' }, `${entry.path}/`),
              h('span', { className: 'n' }, String(count)));
          }
          const depth = entry.path.split('/').length - 1;
          return h('button', {
            type: 'button',
            key: `f:${entry.path}`,
            className: `dshsc-reader-titem${active === entry.path ? ' on' : ''}`,
            style: { paddingLeft: 8 + depth * 12 },
            title: entry.path,
            onClick: () => {
              setFileFormat('rendered');
              void loadFile(entry.path);
            },
          },
          h(FileIcon, null),
          h('span', { className: 'nname' }, entry.path.split('/').pop()),
          h('span', { className: 'nsize' }, formatBytes(entry.size)));
        })),
      h('div', { className: 'dshsc-reader-preview' },
        h('div', { className: 'dshsc-reader-tree-head' },
          h('span', null, t('viewer.tab.files')),
          h('span', { className: 'mono' }, active || '—'),
          // 预览的三个动作放在一起，靠右成一排，而不是一个贴路径、一个飘到最右
          h('div', { className: 'dshsc-reader-tools' },
            renderable
              ? h('div', { className: 'dshsc-segment dshsc-reader-seg', role: 'group', 'aria-label': t('viewer.rendered') },
                  h('button', {
                    type: 'button',
                    className: 'dshsc-btn',
                    'aria-pressed': String(fileFormat === 'rendered'),
                    onClick: () => setFileFormat('rendered'),
                  }, t('viewer.rendered')),
                  h('button', {
                    type: 'button',
                    className: 'dshsc-btn',
                    'aria-pressed': String(fileFormat === 'raw'),
                    onClick: () => setFileFormat('raw'),
                  }, t('viewer.raw')))
              : null,
            active && !file.loading && !file.error && isMarkdownPath(active)
              ? h('button', {
                  type: 'button',
                  className: 'dshsc-btn',
                  onClick: () => {
                    setDocOverride({ relPath: file.relPath || active, content: file.content });
                    setTab('doc');
                  },
                }, t('viewer.openInDoc'))
              : null)),
        preview));
  }

  function infoPanel() {
    const agentLabels = (row?.links || [])
      .filter((link) => !link.broken)
      .map((link) => (link.target === 'dsh-global' ? 'DSH' : link.label));
    const projects = row?.scopeProjects || [];
    const hash = row?.lockHash || row?.currentHash || null;
    const rows = [];
    rows.push(['viewer.info.name', h('span', { className: 'mono' }, name), 'mono']);
    if (description) rows.push(['viewer.info.desc', description]);
    rows.push(['viewer.info.path', h('span', { className: 'mono' }, row?.path || (tree?.root ?? t('viewer.info.none'))), 'mono']);

    const sourceRows = [
      ['viewer.info.repo', row?.source ? h('span', { className: 'mono' }, row.source) : t('viewer.info.none'), 'mono'],
      ['viewer.info.ref', row?.commit ? h('span', { className: 'mono' }, short(row.commit)) : (row?.ref || t('viewer.info.none')), 'mono'],
      ['viewer.info.skillPath', row?.skillPath ? h('span', { className: 'mono' }, row.skillPath) : t('viewer.info.none'), 'mono'],
      ['viewer.info.hash', hash ? h('span', { className: 'mono' }, hash) : t('viewer.info.none'), 'mono'],
    ];

    const localRows = [
      ['viewer.info.installedAt', formatWhen(row?.installedAt) || t('viewer.info.none')],
      ['viewer.info.updatedAt', formatWhen(row?.updatedAt) || t('viewer.info.none')],
      ['viewer.info.size', tree
        ? `${formatBytes(tree.totalBytes)} · ${t('viewer.fileCount').replace('{n}', String(fileCount))}`
        : t('viewer.info.none')],
      ['viewer.info.localChange', row?.status === 'locally-modified' || row?.status === 'conflict'
        ? t('viewer.info.localChangeYes')
        : t('viewer.info.localChangeNone')],
    ];

    const linkRows = [
      ['viewer.info.agents', agentLabels.length > 0 ? agentLabels.join('、') : t('meta.unlinked')],
      ['viewer.info.scope', projects.length > 0
        ? `${t('viewer.info.scopeProject')}：${projects.map((item) => item.split('/').pop()).join('、')}`
        : t('viewer.info.scopeGlobal')],
      ['viewer.info.mode', row?.mode === 'off' ? t('status.off') : t('mode.on')],
      ['viewer.info.status', STATUS_KEY[row?.status] ? t(STATUS_KEY[row.status]) : t('status.unknown')],
    ];

    return h('div', { className: 'dshsc-reader-info' },
      h(InfoSection, { t, title: t('viewer.info.basic'), rows }),
      h(InfoSection, { t, title: t('viewer.info.source'), rows: sourceRows }),
      h(InfoSection, { t, title: t('viewer.info.local'), rows: localRows }),
      h(InfoSection, { t, title: t('viewer.info.links'), rows: linkRows }));
  }

  function panel() {
    if (tab === 'files') return filesPanel();
    if (tab === 'info') return infoPanel();
    return docPanel();
  }

  const body = h('div', {
    className: 'dshsc-reader-body',
    ref: bodyRef,
    role: 'tabpanel',
    id: `dshsc-panel-${tab}`,
    'aria-labelledby': `dshsc-tab-${tab}`,
    tabIndex: -1,
  }, panel());

  const canUpdate = Boolean(writable) && Boolean(row) && !busy;
  const actionsFooter = h('div', { className: 'dshsc-reader-actions' },
    h('span', { className: 'dshsc-reader-note' }, readOnly ? t('banner.readonly') : t('viewer.readonlyNote')),
    h('button', {
      type: 'button',
      // 抽屉底栏空间紧，图标按钮；整页顶栏跟一排文字按钮并排，用文字更齐
      className: variant === 'page' ? 'dshsc-btn ghost' : 'dshsc-btn ghost sq',
      title: t('viewer.copyBody'),
      'aria-label': t('viewer.copyBody'),
      disabled: !bodyText,
      onClick: () => void copyTextWithToast(bodyText, 'viewer.copied'),
    }, h(CopyIcon, null), variant === 'page' ? t('viewer.copyBody') : null),
    h('button', {
      type: 'button',
      className: 'dshsc-btn ghost',
      title: row?.path || '',
      disabled: !row?.path,
      onClick: () => void copyTextWithToast(row?.path || '', 'viewer.copied'),
    }, t('viewer.copyPath')),
    variant === 'drawer' && onOpenPage
      ? h('button', { type: 'button', className: 'dshsc-btn ghost', onClick: () => onOpenPage() }, t('viewer.openPage'))
      : null,
    onLinks ? h('button', { type: 'button', className: 'dshsc-btn', onClick: () => onLinks?.(row) }, t('action.links')) : null,
    onUpdate
      ? h('button', {
          type: 'button',
          className: 'dshsc-btn tint',
          disabled: !canUpdate,
          onClick: () => onUpdate?.(row),
        }, t('action.update'))
      : null);

  if (variant === 'page') {
    const tocShown = headings.length > 1;
    return h('div', { className: 'dshsc-reader-page' },
      h('div', { className: 'dshsc-reader-topbar' },
        h('button', { type: 'button', className: 'dshsc-btn ghost', 'data-autofocus': true, onClick: () => onClose?.() },
          h(ChevronLeftIcon, null), t('viewer.back')),
        h('span', { className: 'dshsc-reader-crumb' },
          h('span', null, t('tab.installed')),
          h('span', { className: 'sep' }, '/'),
          h('span', { className: 'mono' }, name)),
        h('span', { className: 'spacer' }),
        actionsFooter),
      h('div', { className: 'dshsc-reader-hero' }, header),
      h('div', { className: `dshsc-reader-layout${tocShown ? ' has-toc' : ''}` },
        tocShown
          ? h('nav', { className: 'dshsc-reader-toc', 'aria-label': t('viewer.toc') },
              h('div', { className: 'dshsc-reader-toc-title' }, t('viewer.toc')),
              headings.map((heading) => h('button', {
                type: 'button',
                key: heading.id,
                className: `dshsc-reader-tocitem l${heading.level}${tocActive === heading.id ? ' on' : ''}`,
                onClick: () => scrollToAnchor(heading.id),
              }, heading.text)))
          : null,
        h('div', { className: 'dshsc-reader-col' }, tabsBar, body)));
  }

  // 抽屉走 portal：落到当前挂载面所在的层级——设置页里是宿主的设置弹窗，
  // 侧栏主页是 body。这样 z-index 只在同一层里比较，不会被宿主的模态层压住；
  // 组件实例仍留在 Section 的树里，所以「在整页打开」只换外壳，不卸载、不重拉数据。
  return portalize(h('div', { className: 'dshsc-drawer-wrap' },
    h('div', { className: 'dshsc-drawer-scrim', onClick: () => onClose?.() }),
    h('aside', {
      className: 'dshsc-drawer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'dshsc-reader-name',
      ref: dialogRef,
      tabIndex: -1,
    }, header, tabsBar, body, actionsFooter)), overlayHost());
}

/**
 * 「关于」弹层（参照 dsh-github-trending 的 about.ts 定稿）。
 *
 * 顶部是居中的应用身份（小 logo / 名称 / 版本胶囊），与下方左对齐的信息表
 * （包名 / GitHub 仓库 / 许可）整卡同色，无渐变、无分隔线，用背景替代纯留白以压缩顶部高度。
 *
 * 数据全部来自 `data.plugin`（Host 从 package.json 注入），不从客户端猜版本；
 * 仓库缺失时隐藏外链，不拼一个可能 404 的地址。外链一律 `target=_blank rel=noreferrer`。
 *
 * 交互约定（与参照项目一致）：
 *   - 不承载「检查更新」：更新入口只在页头；本弹窗是纯信息页；
 *   - 包名行整行点击即复制「包名@版本」，不放独立复制按钮，复制后行尾短暂显示「已复制」，
 *     失败时行尾显示「复制失败」，1.4s 后恢复；
 *   - 不展示「运行环境」——不足以描述双 half 形态，直接省略；
 *   - 本仓没有 `core`（核心）概念，故不展示「核心」行。
 *
 * 外壳复用本仓 `Overlay`：统一 portal 到浮层宿主、Esc 只关最上层、点遮罩 / 关闭按钮都关窗。
 */
import React from 'react';

import { h } from '../host.js';
import type { PluginInfo } from '../api.js';
import type { Translate } from '../copy.js';
import { copyText } from '../copy.js';
import { Logo } from '../icons.js';
import { Overlay } from './overlay.js';

export interface AboutDialogProps {
  t: Translate;
  plugin: PluginInfo;
  onClose: () => void;
}

export function AboutDialog({ t, plugin, onClose }: AboutDialogProps) {
  // 复制反馈：'' 无 / 'ok' 已复制 / 'err' 复制失败
  const [copied, setCopied] = React.useState<'' | 'ok' | 'err'>('');

  // 安装标识：与页头身份胶囊、插件安装时输入的一模一样（`@scope/name@version`）。
  const fullName = plugin.fullName || plugin.name;
  const spec = plugin.version ? `${fullName}@${plugin.version}` : fullName;
  const repository = plugin.repository || undefined;
  const ownerRepo = repository === undefined ? undefined : repository.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

  const copy = (): void => {
    void copyText(spec).then((ok) => {
      setCopied(ok ? 'ok' : 'err');
      setTimeout(() => setCopied(''), 1400);
    });
  };

  // 包名行：label「包名」+ 等宽值，整行可点，无独立复制按钮。
  const pkgRow = h(
    'dd',
    { className: 'dshsc-about-pkgrow' },
    h(
      'button',
      {
        type: 'button',
        className: `dshsc-about-pkglink${copied ? ` is-${copied}` : ''}`,
        title: copied === 'err' ? t('about.copyFailed') : copied === 'ok' ? t('about.copied') : t('about.copy'),
        'aria-label': `${t('about.copy')}: ${spec}`,
        onClick: copy,
      },
      h('span', { className: 'dshsc-mono dshsc-about-pkglink-name' }, spec),
      h('span', { className: 'dshsc-about-copied' }, copied === 'err' ? t('about.copyFailed') : t('about.copied')),
    ),
  );

  return h(
    Overlay,
    {
      t,
      title: t('about.title'),
      onCancel: onClose,
      footer: [
        h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onClose }, t('about.close')),
      ],
    },
    h(
      'div',
      { className: 'dshsc-about-identity' },
      h('div', { className: 'dshsc-about-logo' }, h(Logo, { size: 32 })),
      h('div', { className: 'dshsc-about-name' }, t('section.title')),
      plugin.version ? h('span', { className: 'dshsc-about-ver' }, `v${plugin.version}`) : null,
    ),
    h(
      'dl',
      { className: 'dshsc-kv dshsc-about-kv' },
      h('dt', null, t('about.pkg')),
      pkgRow,
      h('dt', null, t('about.repo')),
      h(
        'dd',
        null,
        repository === undefined || ownerRepo === undefined
          ? h('span', { className: 'dshsc-hint' }, t('about.repo.missing'))
          : h('a', { href: repository, target: '_blank', rel: 'noreferrer' }, ownerRepo),
      ),
      h('dt', null, t('about.license')),
      h('dd', null, 'MIT'),
    ),
  );
}

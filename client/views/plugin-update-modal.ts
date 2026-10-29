/**
 * 插件自更新弹窗：展示当前 / 最新版本，有新版本时拉 GitHub Release 正文展示更新内容；
 * 一键更新；不可自动更新时给可复制的手动命令。
 * 状态与请求都在 `usePluginUpdate`，这里只渲染。
 */
import React from 'react';

import { h } from '../host.js';
import type { Translate } from '../copy.js';
import { RefreshIcon } from '../icons.js';
import { Overlay } from './overlay.js';
import { Markdown } from './markdown-view.js';

/**
 * Release 正文里常有 `<details><summary>…</summary>…</details>`（本仓 CI 用它折叠
 * 「原始变更记录」）。插件内的 Markdown 渲染器按安全策略把原始 HTML 当纯文本显示，
 * 直接渲染会露出标签；这里只做展示层降级：summary 折成加粗小标题、去掉 details 外壳，
 * 里面的 markdown 正文照常渲染（不执行任何 HTML）。
 */
function flattenDetails(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>/gi, (_, summary) => `**${String(summary).trim()}**\n\n`)
    .replace(/<\/details>/gi, '');
}

interface PluginUpdateController {
  status?: {
    currentVersion?: string;
    latestVersion?: string | null;
    updateAvailable?: boolean;
    canAutoUpdate?: boolean;
    manualCommand?: string | null;
    restartRequired?: boolean;
    updatedVersion?: string | null;
    checkFailed?: boolean;
  } | null;
  checking: boolean;
  applying: boolean;
  checkError?: { code?: string | null; message?: string } | null;
  applyError?: { code?: string | null; message?: string; detail?: unknown } | null;
  check: (fresh?: boolean) => Promise<unknown>;
  apply: () => Promise<unknown>;
  release: { loading: boolean; data: { version?: string; body?: string; htmlUrl?: string | null } | null; version: string | null };
  loadRelease: (version: string | null | undefined) => Promise<unknown>;
}

interface PluginUpdateModalProps {
  t: Translate;
  update: PluginUpdateController;
  onClose: () => void;
  repoUrl: string;
}

export function PluginUpdateModal({ t, update, onClose, repoUrl }: PluginUpdateModalProps) {  const { status, checking, applying, checkError, applyError, check, apply, release, loadRelease } = update;
  const [copied, setCopied] = React.useState(false);

  // 打开即查一次（Host 有 5 分钟缓存，连续打开不会重复打网络）
  React.useEffect(() => {
    void check();
  }, [check]);

  const latest = status?.latestVersion || null;
  const current = status?.currentVersion || '—';
  const available = Boolean(status?.updateAvailable);
  const canAuto = status?.canAutoUpdate !== false;
  const manual = status?.manualCommand || '';
  const restartRequired = status?.restartRequired === true;
  const updatedVersion = status?.updatedVersion || null;

  // 有新版本时拉该版本的发布说明（换版本重拉）
  React.useEffect(() => {
    if (available && latest) void loadRelease(latest);
  }, [available, latest, loadRelease]);

  const releaseData = release?.version === latest ? release.data : null;
  const releaseLoading = release?.version === latest && release.loading;
  const releaseBody = typeof releaseData?.body === 'string' ? flattenDetails(releaseData.body.trim()).trim() : '';
  const releaseUrl = releaseData?.htmlUrl || (repoUrl ? `${repoUrl}/releases` : null);

  const copy = () => {
    if (!manual || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    Promise.resolve(navigator.clipboard.writeText(manual))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  let stateLine;
  if (checking && !status) stateLine = t('pluginUpdate.checking');
  else if (checkError || status?.checkFailed) stateLine = t('pluginUpdate.checkFailed');
  else if (restartRequired) stateLine = t('pluginUpdate.updated').replace('{version}', String(updatedVersion || latest || ''));
  else if (available) stateLine = t('pluginUpdate.available');
  else if (status) stateLine = t('pluginUpdate.upToDate');
  else stateLine = t('pluginUpdate.checking');

  const stateTone = (checkError || status?.checkFailed) ? 'err' : available ? 'update' : 'ok';

  const footer: any[] = [
    h('button', {
      key: 'check',
      className: 'dshsc-btn ghost',
      disabled: checking || applying,
      onClick: () => void check(true),
    }, h(RefreshIcon, { size: 13 }), t('pluginUpdate.recheck')),
  ];
  if (available && canAuto) {
    footer.push(h('button', {
      key: 'apply',
      className: 'dshsc-btn primary',
      disabled: applying,
      onClick: () => void apply(),
    }, applying ? t('pluginUpdate.applying') : t('pluginUpdate.update').replace('{version}', String(latest || ''))));
  }
  footer.push(h('button', { key: 'close', className: 'dshsc-btn ghost', onClick: onClose }, t('pluginUpdate.close')));

  return h(Overlay, { t, title: t('pluginUpdate.title'), onCancel: onClose, footer },
    h('dl', { className: 'dshsc-kv' },
      h('dt', null, t('pluginUpdate.current')),
      h('dd', null, h('span', { className: 'dshsc-code' }, current)),
      h('dt', null, t('pluginUpdate.latest')),
      h('dd', null, h('span', { className: 'dshsc-code' }, latest || '—'))),
    h('p', { className: 'dshsc-sub', 'data-kind': stateTone, role: 'status', style: stateTone === 'err' ? { color: 'var(--dsw-alias-state-error-primary)' } : null }, stateLine),
    // 有新版本：展示该版本的发布说明（拉了 GitHub Release 正文就渲染，拉不到给外链）
    available
      ? h('div', { className: 'dshsc-release' },
          h('div', { className: 'dshsc-release-head' }, t('pluginUpdate.whatsNew').replace('{version}', String(latest || ''))),
          releaseLoading
            ? h('p', { className: 'dshsc-sub' }, t('pluginUpdate.releaseLoading'))
            : releaseBody
              ? h('div', { className: 'dshsc-release-body' }, h(Markdown, { text: releaseBody }))
              : h('p', { className: 'dshsc-sub' },
                  releaseUrl
                    ? h('a', { className: 'dshsc-md-link', href: releaseUrl, target: '_blank', rel: 'noopener noreferrer' }, t('pluginUpdate.viewReleaseNotes'))
                    : t('pluginUpdate.releaseUnavailable')))
      : null,
    applyError
      ? h('p', { className: 'dshsc-sub', role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)' } }, applyError.message)
      : null,
    restartRequired
      ? h('p', { className: 'dshsc-sub' }, t('pluginUpdate.restartHint'))
      : null,
    // 一键更新不可用（或本次安装失败后想手动兜底）：给命令 + 复制
    (!canAuto && manual)
      ? h('div', { className: 'dshsc-field' },
          h('span', null, t('pluginUpdate.manual')),
          h('div', { className: 'dshsc-inline', style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('code', { className: 'dshsc-code', style: { flex: 1, wordBreak: 'break-all' } }, manual),
            h('button', { className: 'dshsc-btn ghost', onClick: copy }, copied ? t('pluginUpdate.copied') : t('pluginUpdate.copy'))))
      : null,
  );
}

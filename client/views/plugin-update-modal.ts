/**
 * 插件自更新「详情」弹窗：**纯信息页**——展示当前 / 最新版本、状态行，以及该版本的
 * GitHub Release 正文（更新内容）。不发任何更新动作。
 *
 * 更新操作（检查 / 更新 / 两段确认）只在页头内联更新胶囊里，弹窗不承担操作，
 * 避免「信息页兼操作页」（与 dsh-github-trending v0.8.7 的关于弹层同一条结论）。
 * 数据与状态都在 `usePluginUpdate`，这里只渲染。
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
    restartRequired?: boolean;
    updatedVersion?: string | null;
    checkFailed?: boolean;
  } | null;
  checking: boolean;
  checkError?: { code?: string | null; message?: string } | null;
  check: (fresh?: boolean) => Promise<unknown>;
  release: { loading: boolean; data: { version?: string; body?: string; htmlUrl?: string | null } | null; version: string | null };
  loadRelease: (version: string | null | undefined) => Promise<unknown>;
}

interface PluginUpdateModalProps {
  t: Translate;
  update: PluginUpdateController;
  onClose: () => void;
  repoUrl: string;
}

export function PluginUpdateModal({ t, update, onClose, repoUrl }: PluginUpdateModalProps) {
  const { status, checking, checkError, check, release, loadRelease } = update;

  // 打开即查一次（Host 有 5 分钟缓存，连续打开不会重复打网络）
  React.useEffect(() => {
    void check();
  }, [check]);

  const latest = status?.latestVersion || null;
  const current = status?.currentVersion || '—';
  const available = Boolean(status?.updateAvailable);
  const canAuto = status?.canAutoUpdate !== false;
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
      disabled: checking,
      onClick: () => void check(true),
    }, h(RefreshIcon, { size: 13 }), t('pluginUpdate.recheck')),
  ];
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
    restartRequired
      ? h('p', { className: 'dshsc-sub' }, t('pluginUpdate.restartHint'))
      : null,
    // 一键更新不可用：只给一句提示，不再展示/复制手动命令（本地安装等场景由用户自行重装）。
    (!canAuto && available)
      ? h('p', { className: 'dshsc-sub' }, t('pluginUpdate.manualUnavailable'))
      : null,
    // 更新操作入口：只在页头胶囊。这里明确告诉用户去胶囊操作。
    available
      ? h('p', { className: 'dshsc-sub' }, t('pluginUpdate.updateInCapsule'))
      : null,
  );
}

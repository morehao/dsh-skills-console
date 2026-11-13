/**
 * 迁移 tab：跨机器搬「已安装 + 已订阅」名单。
 *
 * 两块：
 * - 复制名单：调 `GET /manifest` 生成名单 JSON，点按钮写入剪贴板；标题旁「展开」才显示只读 JSON。
 * - 导入名单：粘贴 JSON →「合并到本机」调 `POST /manifest/import`；已装同名技能跳过（不覆盖）。
 *
 * 只搬名单，不搬本体：技能由 install 从 GitHub 重新下载；无上游技能单列提示手动拷贝。
 */
import React from 'react';

import { h } from '../host.js';
import { apiCall } from '../api.js';
import type { Translate } from '../copy.js';

export interface MigrateTabProps {
  t: Translate;
  writable: boolean;
  busy: string | null;
  reload: () => Promise<unknown> | unknown;
  setToast: (toast: { kind: string; text: string }) => void;
}

interface ManifestGroup {
  source: string;
  ref: string | null;
  skills: string[];
}

interface Manifest {
  version: number;
  exportedAt: string;
  sources: ManifestGroup[];
  subscriptions: { source: string; ref: string | null; subpath: string | null }[];
  installed: { name: string; source: string | null }[];
  noUpstream: string[];
}

interface ImportResult {
  ok: boolean;
  dryRun: boolean;
  planInstallCount: number;
  plan: { source: string; ref: string | null; install: string[]; skip: string[] }[];
  subscriptionsToAdd: { source: string; ref: string | null }[];
  noUpstream: string[];
  installed: { name: string; source: string }[];
  skipped: string[];
  failed: { stage: string; source?: string; skills?: string[]; message: string }[];
}

export function MigrateTab({ t, writable, busy, reload, setToast }: MigrateTabProps) {
  const [manifest, setManifest] = React.useState<Manifest | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  // 进 tab 时拉一次名单（只为「展开」预览与计数；复制时再取一次以保证最新）
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    apiCall('GET', '/manifest')
      .then((data: any) => { if (alive) setManifest(data as Manifest); })
      .catch(() => { if (alive) setManifest(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const builtin = Number(manifest?.installed?.length || 0);
  const upCount = manifest ? manifest.installed.length - manifest.noUpstream.length : 0;
  const noCount = Number(manifest?.noUpstream?.length || 0);
  const subCount = Number(manifest?.subscriptions?.length || 0);

  async function copyManifest() {
    try {
      // 复制前重新取一次，避免用陈旧的预览
      const fresh = (await apiCall('GET', '/manifest')) as Manifest;
      setManifest(fresh);
      const text = JSON.stringify(fresh, null, 2);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setToast({ kind: 'ok', text: t('migrate.copied') });
      } else {
        setToast({ kind: 'err', text: t('migrate.copyFailed') });
      }
    } catch (error: any) {
      setToast({ kind: 'err', text: error?.message || t('migrate.copyFailed') });
    }
  }

  async function doImport() {
    const raw = input.trim();
    if (!raw) {
      setToast({ kind: 'err', text: t('migrate.emptyInput') });
      return;
    }
    let parsed: Manifest;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setToast({ kind: 'err', text: t('migrate.badJson') });
      return;
    }
    if (!parsed || !Array.isArray((parsed as any).sources)) {
      setToast({ kind: 'err', text: t('migrate.badManifest') });
      return;
    }
    setImporting(true);
    try {
      const res = (await apiCall('POST', '/manifest/import', { manifest: parsed })) as ImportResult;
      setResult(res);
      if (res.ok) {
        setToast({ kind: 'ok', text: t('migrate.importDone').replace('{n}', String(res.installed.length)) });
        void reload();
      } else {
        setToast({ kind: 'err', text: t('migrate.importPartial').replace('{n}', String(res.failed.length)) });
        void reload();
      }
    } catch (error: any) {
      setToast({ kind: 'err', text: error?.message || t('migrate.importFailed') });
    } finally {
      setImporting(false);
    }
  }

  // ==== 复制名单卡片 ====
  const copyCard = h('div', { className: 'dshsc-card' },
    h('div', { className: 'dshsc-card-head' },
      h('h3', { className: 'dshsc-card-title' }, t('migrate.copyTitle'),
        h('a', {
          className: 'dshsc-link',
          href: 'javascript:void 0',
          onClick: (e: any) => { e.preventDefault(); setJsonOpen((v) => !v); },
        }, jsonOpen ? t('migrate.collapse') : t('migrate.expand')))),
    h('p', { className: 'dshsc-card-desc' }, t('migrate.copyDesc')),
    h('div', { className: 'dshsc-migrate-actions' },
      h('button', {
        className: 'dshsc-btn primary',
        onClick: () => void copyManifest(),
      }, t('migrate.copyBtn'))),
    jsonOpen
      ? h('pre', { className: 'dshsc-manifest-json' }, loading ? t('migrate.loading') : (manifest ? JSON.stringify(manifest, null, 2) : t('migrate.noData')))
      : null,
    noCount > 0
      ? h('div', { className: 'dshsc-card-hint' },
          t('migrate.noUpstreamHint').replace('{list}', manifest!.noUpstream.join('、')))
      : null,
  );

  // ==== 导入名单卡片 ====
  const importCard = h('div', { className: 'dshsc-card' },
    h('div', { className: 'dshsc-card-head' },
      h('h3', { className: 'dshsc-card-title' }, t('migrate.importTitle'))),
    h('p', { className: 'dshsc-card-desc' }, t('migrate.importDesc')),
    h('textarea', {
      className: 'dshsc-manifest-input',
      placeholder: t('migrate.importPlaceholder'),
      value: input,
      disabled: !writable || importing,
      onChange: (e: any) => setInput(e.target.value),
    }),
    h('div', { className: 'dshsc-migrate-actions' },
      h('button', {
        className: 'dshsc-btn primary',
        disabled: !writable || importing,
        onClick: () => void doImport(),
      }, importing ? t('migrate.importing') : t('migrate.importBtn'))),
    result ? renderResult(t, result) : null,
  );

  return h('div', { className: 'dshsc-migrate' },
    h('div', { className: 'dshsc-migrate-stats' },
      stat(String(builtin), t('migrate.statInstalled'), ''),
      stat(String(upCount), t('migrate.statUpstream'), 'ok'),
      stat(String(noCount), t('migrate.statNoUpstream'), 'warn'),
      stat(String(subCount), t('migrate.statSubs'), '')),
    copyCard,
    importCard,
  );
}

function stat(value: string, label: string, cls: string) {
  return h('div', { className: 'dshsc-migrate-stat' },
    h('span', { className: `v${cls ? ' ' + cls : ''}` }, value),
    h('span', { className: 'l' }, label));
}

function renderResult(t: Translate, res: ImportResult) {
  const rows = res.plan.filter((p) => p.install.length > 0);
  const skipCount = res.plan.reduce((sum, p) => sum + p.skip.length, 0);
  return h('div', { className: 'dshsc-migrate-result' },
    h('p', { className: 'dshsc-migrate-result-summary' },
      t('migrate.resultSummary')
        .replace('{install}', String(res.installed.length))
        .replace('{skip}', String(skipCount))
        .replace('{subs}', String(res.subscriptionsToAdd.length || 0))),
    h('div', { className: 'dshsc-migrate-glist' },
      ...rows.map((p) => h('div', { className: 'dshsc-migrate-grow', key: `${p.source}@${p.ref || ''}` },
        h('span', { className: 'dshsc-migrate-gsrc' }, p.source, h('span', { className: 'ref' }, ` @${p.ref || '—'}`)),
        h('span', { className: 'dshsc-migrate-gskills' },
          ...p.install.map((n) => h('span', { className: 'dshsc-migrate-chip', key: n }, n))),
        h('span', { className: 'dshsc-migrate-tag install' }, t('migrate.tagInstall').replace('{n}', String(p.install.length)))))),
    res.noUpstream.length > 0
      ? h('div', { className: 'dshsc-card-hint warn' }, t('migrate.resultNoUpstream').replace('{list}', res.noUpstream.join('、')))
      : null,
    res.failed.length > 0
      ? h('div', { className: 'dshsc-card-hint err' },
          ...res.failed.map((f, i) => h('div', { key: i }, `${f.source || ''}: ${f.message}`)))
      : null,
  );
}

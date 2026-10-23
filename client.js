/**
 * Client half：设置页「技能」分区。
 * 一页两 tab：已装 / 订阅。行内操作列 = 开关 + 更新 + 接入设置 + 删除。
 * 所有数据来自 Host 的 /api/morehao/skills-manager/*，这里只做展示与提交。
 */
window.__ModuleLoader__.load({
  id: '@morehao/dsh-skills-manager',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const API = '/api/morehao/skills-manager';

    const DICT = {
      zh: {
        'section.title': '技能',
        'section.subtitle': 'canonical 只由 skills CLI 写入；这里管装、更新、删除与接入。',
        'tab.installed': '已装',
        'tab.subscriptions': '订阅',
        'action.addSkill': '添加技能',
        'action.addSubscription': '添加订阅',
        'action.refresh': '刷新',
        'action.update': '更新',
        'action.updateAll': '全部更新',
        'action.delete': '删除',
        'action.links': '接入设置',
        'action.install': '安装',
        'action.adopt': '接管',
        'action.save': '保存',
        'action.cancel': '取消',
        'action.choose': '选择目录',
        'action.retry': '重新加载',
        'view.flat': '平铺',
        'view.agent': '按 Agent',
        autoLink: '自动链接',
        'status.current': '最新',
        'status.update': '有新版本',
        'status.local': '本地已改',
        'status.conflict': '本地已改 + 上游已变',
        'status.deleted': '上游已移除',
        'status.broken': '异常：链接断裂',
        'status.unmanaged': '未纳入追踪',
        'status.unknown': '待检查',
        'adopt.switchHint': '还未纳入追踪，不能启停',
        'adopt.noUpstream': '没有远端来源，暂时无法检测更新',
        'toast.checked': '检查完成',
        'mode.on': '启用',
        'mode.off': '停用',
        'mode.offHint': '停用中：DSH 看不到它，但已链接的其他 Agent 照常可用',
        'links.dshGlobal': 'dsh（全局）',
        'links.required': '必选',
        'links.scope': '在 DSH 里的作用范围',
        'links.scopeGlobal': '全局（默认）',
        'links.scopeProjects': '仅以下项目',
        'links.targets': '链接到哪些 Agent',
        'links.detectedHint': '只显示本机已安装（目录存在）的 Agent',
        'links.workspaces': 'DSH 工作区',
        'links.noWorkspaces': '还没有 DSH 工作区，可以点下面「选择其他目录」',
        'links.pickDirectory': '选择其他目录…',
        'links.selected': '其他已选目录',
        'links.hint': '保存后按勾选建/删软链；canonical 里的技能真身不会移动。',
        'autoLink.detected': '安装后自动接入',
        'autoLink.none': '本机没有检测到其他 Agent',
        'autoLink.hint': 'dsh（全局）始终接入；这里只影响之后安装时自动建链，已装的技能请在「接入设置」里改。',
        'empty.skills': '还没有安装任何技能',
        'empty.skillsHint': '在终端跑 `npx skills add owner/repo`，或点右上角「添加技能」',
        'empty.subs': '还没有添加订阅',
        'empty.subsHint': '订阅只是关注，不安装任何技能',
        'banner.cli': 'skills CLI 不可用或不支持 --json/--full-depth，写操作已禁用',
        'banner.readonly': '状态文件损坏，插件处于只读模式',
        'banner.visible': '模型可见技能与本地账本不一致，差异已列在下方',
        'form.source': '来源（owner/repo 或 GitHub URL）',
        'form.sourceHint': '例如 morehao/ai-kit',
        'form.skills': '技能名（多个用逗号分隔）',
        'form.ref': 'ref（分支 / tag，可空）',
        'form.subpath': '子目录（可空）',
        'form.hint': '会立即下载并写入 ~/.agents/skills，并按「自动链接」设置接入 Agent。',
        'form.subHint': '只记录你关注这个仓库，不会安装任何技能。',
        'confirm.deleteTitle': '删除技能',
        'confirm.deleteBody': '会从本机移除，断开本插件建的链接并调 skills CLI 卸载；目录先备份到回收站（保留 7 天）。不会删除你的源仓库。',
        'confirm.updateTitle': '本地有改动',
        'confirm.updateBody': '更新会覆盖这些本地改动；旧内容已备份，可回滚。',
        'error.conflictTitle': '删除被拦截',
        'busy.working': '处理中…',
        'meta.from': '来自',
        'meta.available': '可用',
        'meta.unlinked': '未接入任何 Agent',
        'meta.scope': '范围',
        'meta.none': '无',
        installed: '已装',
        notInstalled: '未装',
        skillCount: '个技能',
        visibleOnly: '模型可见但不在 canonical',
        visibleOnlyOther: 'DSH 能看到、但不在 ~/.agents/skills',
        visibleOnlyBuiltin: 'DSH 自带技能（不在 canonical 属正常，本插件不管理）',
        external: '非本插件创建',
      },
      en: {
        'section.title': 'Skills',
        'section.subtitle': 'The skills CLI owns canonical; this page installs, updates, removes and links.',
        'tab.installed': 'Installed',
        'tab.subscriptions': 'Subscriptions',
        'action.addSkill': 'Add skill',
        'action.addSubscription': 'Add subscription',
        'action.refresh': 'Refresh',
        'action.update': 'Update',
        'action.updateAll': 'Update all',
        'action.delete': 'Delete',
        'action.links': 'Link settings',
        'action.install': 'Install',
        'action.adopt': 'Adopt',
        'action.save': 'Save',
        'action.cancel': 'Cancel',
        'action.choose': 'Choose folder',
        'action.retry': 'Reload',
        'view.flat': 'Flat',
        'view.agent': 'By agent',
        'autoLink': 'Auto-link',
        'status.current': 'Up to date',
        'status.update': 'Update available',
        'status.local': 'Locally modified',
        'status.conflict': 'Local + upstream changed',
        'status.deleted': 'Removed upstream',
        'status.broken': 'Broken link',
        'status.unmanaged': 'Untracked',
        'status.unknown': 'Not checked',
        'adopt.switchHint': 'Not tracked yet, cannot be enabled or disabled',
        'adopt.noUpstream': 'No upstream source; update checks are unavailable',
        'toast.checked': 'Checked',
        'mode.on': 'Enabled',
        'mode.off': 'Disabled',
        'mode.offHint': 'Disabled: DSH cannot see it, other linked agents still can',
        'links.dshGlobal': 'dsh (global)',
        'links.required': 'required',
        'links.scope': 'Scope inside DSH',
        'links.scopeGlobal': 'Global (default)',
        'links.scopeProjects': 'Only these projects',
        'links.targets': 'Link to agents',
        'links.detectedHint': 'Only agents installed on this machine (directory exists)',
        'links.workspaces': 'DSH workspaces',
        'links.noWorkspaces': 'No DSH workspaces yet; use "Choose another folder" below',
        'links.pickDirectory': 'Choose another folder…',
        'links.selected': 'Other selected folders',
        'links.hint': 'Saving creates/removes only symlinks; the skill itself stays in canonical.',
        'autoLink.detected': 'Auto-link after install',
        'autoLink.none': 'No other agents detected on this machine',
        'autoLink.hint': 'dsh (global) is always linked; this only affects future installs. Change existing skills under "Link settings".',
        'empty.skills': 'No skills installed yet',
        'empty.skillsHint': 'Run `npx skills add owner/repo` or use "Add skill".',
        'empty.subs': 'No subscriptions yet',
        'empty.subsHint': 'A subscription only tracks a repository; it installs nothing.',
        'banner.cli': 'skills CLI unavailable or lacks --json/--full-depth; write actions disabled',
        'banner.readonly': 'State file is corrupt; the plugin is read-only',
        'banner.visible': 'Model-visible skills differ from the local ledger',
        'form.source': 'Source (owner/repo or GitHub URL)',
        'form.sourceHint': 'e.g. morehao/ai-kit',
        'form.skills': 'Skill names (comma separated)',
        'form.ref': 'ref (branch / tag, optional)',
        'form.subpath': 'Subdirectory (optional)',
        'form.hint': 'Downloads into ~/.agents/skills and links agents per the auto-link setting.',
        'form.subHint': 'Only records the repository; installs nothing.',
        'confirm.deleteTitle': 'Delete skill',
        'confirm.deleteBody': 'Removes it locally, disconnects this plugin’s links and calls skills remove. A snapshot stays in trash for 7 days. Your source repo is untouched.',
        'confirm.updateTitle': 'Local changes',
        'confirm.updateBody': 'Updating overwrites local changes; the old content is backed up and can be rolled back.',
        'error.conflictTitle': 'Delete blocked',
        'busy.working': 'Working…',
        'meta.from': 'from',
        'meta.available': 'available',
        'meta.unlinked': 'not linked to any agent',
        'meta.scope': 'scope',
        'meta.none': 'none',
        installed: 'installed',
        notInstalled: 'not installed',
        skillCount: 'skills',
        visibleOnly: 'Visible to the model but not in canonical',
        visibleOnlyOther: 'DSH can see these but they are not in ~/.agents/skills',
        visibleOnlyBuiltin: 'Shipped with DSH (not in canonical is normal; this plugin does not manage them)',
        external: 'created outside this plugin',
        'adopt.done': 'now tracked',
      },
    };

    const CSS = `
      .dshsm-root { display: flex; flex-direction: column; gap: 12px; color: var(--dsw-alias-label-primary); }
      .dshsm-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .dshsm-title { font-size: 15px; font-weight: 600; margin: 0; }
      .dshsm-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0; }
      .dshsm-spacer { flex: 1; }
      .dshsm-btn { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
      .dshsm-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
      .dshsm-btn:disabled { opacity: .45; cursor: not-allowed; }
      /* brand-primary 在深色主题里是浅色，写死 #fff 会让按钮文字变成白底白字 */
      .dshsm-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); }
      .dshsm-btn.ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
      .dshsm-btn.ghost:hover { color: var(--dsw-alias-label-primary); }
      .dshsm-btn.danger { color: var(--dsw-alias-state-error-primary); }
      .dshsm-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .dshsm-tab { font: inherit; font-size: 13px; padding: 7px 12px; border: 0; background: transparent; cursor: pointer;
        color: var(--dsw-alias-label-secondary); border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .dshsm-tab.active { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); }
      .dshsm-list { display: flex; flex-direction: column; gap: 8px; }
      .dshsm-row { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; }
      .dshsm-row.off { opacity: .55; }
      .dshsm-row-head { display: flex; align-items: center; gap: 10px; }
      .dshsm-name { font-size: 13px; font-weight: 600; }
      .dshsm-status { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .dshsm-status.warn { color: var(--dsw-alias-state-warn-primary); }
      .dshsm-status.ok { color: var(--dsw-alias-state-success-primary); }
      .dshsm-status.err { color: var(--dsw-alias-state-error-primary); }
      .dshsm-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 4px; display: flex; gap: 8px; flex-wrap: wrap; }
      .dshsm-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
      .dshsm-switch { width: 34px; height: 19px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2); position: relative; cursor: pointer; padding: 0; }
      .dshsm-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); border-color: transparent; }
      .dshsm-knob { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: left .12s ease; }
      .dshsm-switch[aria-checked="true"] .dshsm-knob { left: 17px; }
      .dshsm-banner { border-radius: 8px; padding: 8px 10px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l1); }
      .dshsm-banner.err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
      .dshsm-banner.warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
      .dshsm-banner.info { color: var(--dsw-alias-label-secondary); }
      .dshsm-empty { text-align: center; padding: 28px 12px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; }
      .dshsm-group { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); margin: 10px 0 2px; }
      .dshsm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 60; }
      .dshsm-modal { width: min(560px, calc(100vw - 40px)); max-height: 82vh; overflow: auto; background: var(--dsw-alias-bg-overlay);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .dshsm-modal h3 { margin: 0; font-size: 14px; }
      .dshsm-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
      .dshsm-field input { font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .dshsm-check { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 0; }
      .dshsm-check small { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .dshsm-check span { white-space: nowrap; }
      .dshsm-modal-foot { display: flex; justify-content: flex-end; gap: 8px; }
      .dshsm-toast { position: fixed; right: 18px; bottom: 18px; z-index: 70; font-size: 12px; padding: 9px 12px; border-radius: 9px;
        background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); max-width: 420px; }
      .dshsm-toast.err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .dshsm-toast.ok { border-color: var(--dsw-alias-state-success-primary); }
      .dshsm-sub-entry { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0 3px 12px; }
      .dshsm-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    `;

    function short(sha) {
      return sha ? String(sha).slice(0, 7) : '';
    }

    async function apiCall(method, path, body) {
      const response = await fetch(`${API}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-dsh-skills-manager': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
      let json = {};
      try {
        json = await response.json();
      } catch {
        json = {};
      }
      if (!response.ok || json.ok === false) {
        const error = new Error(json.message || `HTTP ${response.status}`);
        error.code = json.code;
        error.detail = json.detail;
        throw error;
      }
      return json;
    }

    function buildTranslate(locale) {
      const active = () => {
        try {
          return locale?.getLocale?.().active || 'zh';
        } catch {
          return 'zh';
        }
      };
      return (key) => {
        const id = active();
        const pack = DICT[id] || DICT.zh;
        return pack[key] ?? DICT.zh[key] ?? key;
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale');
        const t = buildTranslate(locale);
        const slots = ctx.get('slots');
        if (!slots?.register) return;

        function Section() {
          const [data, setData] = React.useState(null);
          const [error, setError] = React.useState(null);
          const [tab, setTab] = React.useState('installed');
          const [view, setView] = React.useState('flat');
          const [busy, setBusy] = React.useState(null);
          const [toast, setToast] = React.useState(null);
          const [modal, setModal] = React.useState(null);
          const [expanded, setExpanded] = React.useState({});

          const reload = React.useCallback(async () => {
            try {
              const next = await apiCall('GET', '/state');
              setData(next);
              setError(null);
            } catch (err) {
              setError(err.message);
            }
          }, []);

          React.useEffect(() => {
            void reload();
          }, [reload]);

          React.useEffect(() => {
            if (!toast) return undefined;
            const timer = setTimeout(() => setToast(null), 4200);
            return () => clearTimeout(timer);
          }, [toast]);

          const run = React.useCallback(
            async (label, task) => {
              setBusy(label);
              try {
                const result = await task();
                await reload();
                return result;
              } catch (err) {
                setToast({ kind: 'err', text: err.message });
                throw err;
              } finally {
                setBusy(null);
              }
            },
            [reload],
          );

          const rows = data?.installs || [];
          const writable = Boolean(data) && !data?.readOnly && data?.cli?.usable;
          const updateCount = rows.filter((row) => row.status === 'update-available' || row.status === 'conflict').length;

          async function adopt(row) {
            await run(`adopt:${row.name}`, async () => {
              const result = await apiCall('POST', `/skills/${encodeURIComponent(row.name)}/adopt`, {});
              setToast({ kind: 'ok', text: `${row.name} · ${result.tracked ? t('adopt.done') : t('adopt.noUpstream')}` });
              return result;
            });
          }

          async function toggleMode(row) {
            const mode = row.mode === 'on' ? 'off' : 'on';
            await run(`mode:${row.name}`, () => apiCall('POST', `/skills/${encodeURIComponent(row.name)}/mode`, { mode }));
          }

          async function updateOne(row, overwrite) {
            await run(`update:${row.name}`, async () => {
              const result = await apiCall('POST', '/updates/apply', { name: row.name, overwrite });
              setToast({ kind: 'ok', text: `${row.name} → ${short(result.toCommit) || 'latest'}` });
              return result;
            });
          }

          function requestUpdate(row) {
            if (row.status === 'locally-modified' || row.status === 'conflict') {
              setModal({
                type: 'confirm-update',
                row,
                onConfirm: () => {
                  setModal(null);
                  void updateOne(row, true);
                },
              });
              return;
            }
            void updateOne(row, false);
          }

          async function updateAll() {
            const pending = rows.filter((row) => row.status === 'update-available');
            for (const row of pending) {
              try {
                await run(`update:${row.name}`, () => apiCall('POST', '/updates/apply', { name: row.name }));
              } catch {
                // 单条失败不阻断其余
              }
            }
            setToast({ kind: 'ok', text: t('action.updateAll') });
          }

          async function checkUpdates() {
            await run('check', async () => {
              const result = await apiCall('POST', '/updates/check', {});
              setToast({ kind: 'ok', text: `${t('toast.checked')} · ${result.checks.length}` });
            });
          }

          function requestDelete(row) {
            setModal({
              type: 'confirm-delete',
              row,
              onConfirm: async () => {
                setModal(null);
                setBusy(`delete:${row.name}`);
                try {
                  await apiCall('DELETE', `/skills/${encodeURIComponent(row.name)}`);
                  setToast({ kind: 'ok', text: `${row.name} · ${t('action.delete')} ✓` });
                  await reload();
                } catch (err) {
                  if (err.code === 'error.skills.remove-conflict') {
                    setModal({ type: 'conflict', row, detail: err.detail, message: err.message });
                  } else {
                    setToast({ kind: 'err', text: err.message });
                  }
                } finally {
                  setBusy(null);
                }
              },
            });
          }

          async function saveLinks(row, targets, scopeProjects) {
            const current = new Set(row.links.map((link) => link.target));
            // 作用范围非空 = 只写项目链，全局链要被摘掉（两条同时存在没有额外效果）
            const desired = new Set(scopeProjects.length > 0 ? targets.filter((target) => target !== 'dsh-global') : targets);
            const toRemove = [...current].filter((target) => !desired.has(target));
            await run(`links:${row.name}`, async () => {
              if (toRemove.length > 0) {
                await apiCall('POST', '/links', { skill: row.name, targets: toRemove, action: 'remove' });
              }
              await apiCall('POST', '/links', { skill: row.name, targets: [...desired], action: 'add', scopeProjects });
            });
            setToast({ kind: 'ok', text: `${row.name} · ${t('action.links')} ✓` });
          }

          function requestAddSkill() {
            setModal({ type: 'add-skill' });
          }

          function requestAddSubscription() {
            setModal({ type: 'add-subscription' });
          }

          async function addSkill(form) {
            const names = form.skills
              .split(/[,，\s]+/)
              .map((item) => item.trim())
              .filter(Boolean);
            setModal(null);
            await run('install', async () => {
              const result = await apiCall('POST', '/install', { source: form.source.trim(), skills: names });
              const warnings = result.warnings?.length || 0;
              setToast({
                kind: warnings ? 'err' : 'ok',
                text: `${result.installed?.length || 0} ${t('skillCount')}${warnings ? ` · ${warnings} 条提示` : ''}`,
              });
            });
          }

          async function addSubscription(form) {
            setModal(null);
            await run('subscribe', async () => {
              const result = await apiCall('POST', '/subscriptions', {
                source: form.source.trim(),
                ref: form.ref.trim() || undefined,
                subpath: form.subpath.trim() || undefined,
              });
              setToast({ kind: 'ok', text: result.subscription?.source || form.source });
            });
          }

          async function refreshSubscription(row) {
            await run(`refresh:${row.id}`, async () => {
              const result = await apiCall('POST', `/subscriptions/${encodeURIComponent(row.id)}/refresh`, {});
              setToast({ kind: 'ok', text: `${row.source} · ${result.changed ? 'snapshot updated' : 'unchanged'}` });
            });
          }

          async function deleteSubscription(row) {
            await run(`unsubscribe:${row.id}`, async () => {
              await apiCall('DELETE', `/subscriptions/${encodeURIComponent(row.id)}`, { keepInstalled: true });
              setToast({ kind: 'ok', text: `${row.source} · ${t('action.delete')} ✓` });
            });
          }

          async function installFromSubscription(subscription, entry) {
            await run(`install:${entry.name}`, async () => {
              await apiCall('POST', '/install', { subscriptionId: subscription.id, skills: [entry.name] });
              setToast({ kind: 'ok', text: `${entry.name} ✓` });
            });
          }

          function statusCell(row) {
            const map = {
              current: ['status.current', 'ok'],
              'update-available': ['status.update', 'warn'],
              'locally-modified': ['status.local', 'warn'],
              conflict: ['status.conflict', 'warn'],
              'upstream-deleted': ['status.deleted', 'warn'],
              'broken-link': ['status.broken', 'err'],
              unmanaged: ['status.unmanaged', ''],
              unknown: ['status.unknown', ''],
            };
            const [key, cls] = map[row.status] || ['status.unknown', ''];
            return h('span', { className: `dshsm-status ${cls}` }, t(key));
          }

          function metaLine(row) {
            const parts = [];
            if (row.source) {
              const ref = row.commit ? `#${short(row.commit)}` : row.ref ? `#${row.ref}` : '';
              parts.push(`${t('meta.from')} ${row.source}${ref}`);
            }
            // 只按现场链接说「可用」，没有链接就别默认写 DSH
            const available = row.links
              .filter((link) => !link.broken)
              .map((link) => (link.target === 'dsh-global' ? 'DSH' : link.label));
            parts.push(available.length > 0 ? `${t('meta.available')}：${available.join('、')}` : t('meta.unlinked'));
            if (row.scopeProjects?.length) parts.push(`${t('meta.scope')}：${row.scopeProjects.map((p) => p.split('/').pop()).join('、')}`);
            return h('div', { className: 'dshsm-meta' }, parts.map((text, index) => h('span', { key: index }, text)));
          }

          function rowView(row) {
            const off = row.mode === 'off';
            const tracked = row.status !== 'unmanaged';
            const canUpdate = writable && (row.status === 'update-available' || row.status === 'conflict' || row.status === 'locally-modified');
            return h(
              'div',
              { className: `dshsm-row${off ? ' off' : ''}`, key: row.name },
              h(
                'div',
                { className: 'dshsm-row-head' },
                h('span', { className: 'dshsm-name' }, row.name),
                statusCell(row),
                h(
                  'div',
                  { className: 'dshsm-actions' },
                  h('button', {
                    className: 'dshsm-switch',
                    role: 'switch',
                    'aria-checked': String(tracked && row.mode === 'on'),
                    'aria-label': `${row.name} ${t('mode.on')}/${t('mode.off')}`,
                    // 未纳入追踪时调 setMode 只会报「没有安装记录」，不如直接禁用
                    disabled: busy !== null || !tracked,
                    onClick: () => void toggleMode(row),
                    title: tracked ? (row.mode === 'on' ? t('mode.off') : t('mode.on')) : t('adopt.switchHint'),
                  }, h('span', { className: 'dshsm-knob' })),
                  row.status === 'unmanaged'
                    ? h('button', {
                        className: 'dshsm-btn ghost',
                        disabled: !writable || busy !== null,
                        title: row.source ? row.source : t('meta.none'),
                        onClick: () => void adopt(row),
                      }, t('action.adopt'))
                    : h('button', { className: 'dshsm-btn ghost', disabled: !canUpdate || busy !== null, onClick: () => requestUpdate(row) }, t('action.update')),
                  h('button', { className: 'dshsm-btn ghost', disabled: busy !== null, onClick: () => setModal({ type: 'links', row }) }, t('action.links')),
                  h('button', { className: 'dshsm-btn ghost danger', disabled: !writable || busy !== null, onClick: () => requestDelete(row) }, t('action.delete')),
                ),
              ),
              metaLine(row),
              off ? h('div', { className: 'dshsm-meta' }, t('mode.offHint')) : null,
              row.status === 'broken-link' ? h('div', { className: 'dshsm-meta' }, `⚠ ${t('status.broken')}`) : null,
            );
          }

          function groupedRows() {
            const groups = [];
            const dshRows = rows.filter((row) => row.mode === 'on' && !row.scopeProjects?.length);
            const projectRows = rows.filter((row) => row.mode === 'on' && row.scopeProjects?.length);
            const offRows = rows.filter((row) => row.mode === 'off');
            groups.push({ title: 'DSH（全局）', rows: dshRows });
            if (projectRows.length) groups.push({ title: 'DSH（仅特定项目）', rows: projectRows });
            if (offRows.length) groups.push({ title: '已停用', rows: offRows });
            for (const agent of data?.agents?.detected || []) {
              if (agent.kind !== 'agent') continue;
              const matched = rows.filter((row) => row.links.some((link) => link.target === agent.target));
              if (matched.length) groups.push({ title: agent.label, rows: matched });
            }
            return groups.filter((group) => group.rows.length > 0);
          }

          function installedTab() {
            if (!data) return h('div', { className: 'dshsm-empty' }, t('busy.working'));
            if (rows.length === 0) {
              return h(
                'div',
                { className: 'dshsm-empty' },
                h('div', { className: 'dshsm-name' }, t('empty.skills')),
                h('div', { className: 'dshsm-meta', style: { justifyContent: 'center' } }, t('empty.skillsHint')),
                h('div', { style: { marginTop: 10 } },
                  h('button', { className: 'dshsm-btn primary', disabled: !writable, onClick: requestAddSkill }, t('action.addSkill'))),
              );
            }
            const body =
              view === 'agent'
                ? groupedRows().map((group) =>
                    h('div', { key: group.title }, h('div', { className: 'dshsm-group' }, group.title), h('div', { className: 'dshsm-list' }, group.rows.map(rowView))))
                : h('div', { className: 'dshsm-list' }, rows.map(rowView));
            return h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              updateCount > 0
                ? h('div', { className: 'dshsm-banner warn', style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('span', null, `⚠ ${updateCount} ${t('status.update')}`),
                    h('button', { className: 'dshsm-btn', disabled: !writable || busy !== null, onClick: () => void updateAll() }, t('action.updateAll')))
                : null,
              h('div', { className: 'dshsm-head' },
                h('button', { className: 'dshsm-btn ghost', onClick: () => void checkUpdates(), disabled: busy !== null }, t('action.refresh')),
                h('div', { className: 'dshsm-spacer' }),
                h('button', { className: 'dshsm-btn ghost', onClick: () => setView('flat'), 'aria-pressed': String(view === 'flat') }, t('view.flat')),
                h('button', { className: 'dshsm-btn ghost', onClick: () => setView('agent'), 'aria-pressed': String(view === 'agent') }, t('view.agent'))),
              body,
              visibleOnlyBanners(),
            );
          }

          function visibleOnlyBanners() {
            const items = data?.visibleOnly || [];
            // bundled 是 DSH 自带（archify / office…），不在 canonical 是设计如此，别当成告警
            const builtin = items.filter((item) => item.source === 'bundled');
            const others = items.filter((item) => item.source !== 'bundled');
            return [
              others.length > 0
                ? h('div', { className: 'dshsm-banner warn', key: 'other' },
                    `${t('visibleOnlyOther')}：${others.map((item) => item.name).join('、')}`)
                : null,
              builtin.length > 0
                ? h('div', { className: 'dshsm-banner info', key: 'builtin' },
                    `${t('visibleOnlyBuiltin')}：${builtin.map((item) => item.name).join('、')}`)
                : null,
            ];
          }

          function subscriptionsTab() {
            const subs = data?.subscriptions || [];
            if (subs.length === 0) {
              return h(
                'div',
                { className: 'dshsm-empty' },
                h('div', { className: 'dshsm-name' }, t('empty.subs')),
                h('div', { className: 'dshsm-meta', style: { justifyContent: 'center' } }, t('empty.subsHint')),
                h('div', { style: { marginTop: 10 } },
                  h('button', { className: 'dshsm-btn primary', disabled: !writable, onClick: requestAddSubscription }, t('action.addSubscription'))),
              );
            }
            return h('div', { className: 'dshsm-list' }, subs.map((subscription) => {
              const entries = subscription.snapshot?.entries || [];
              const installedNames = new Set(rows.filter((row) => row.subscriptionId === subscription.id).map((row) => row.name));
              const open = Boolean(expanded[subscription.id]);
              return h(
                'div',
                { className: 'dshsm-row', key: subscription.id },
                h('div', { className: 'dshsm-row-head' },
                  h('button', { className: 'dshsm-btn ghost', onClick: () => setExpanded((prev) => ({ ...prev, [subscription.id]: !open })) }, open ? '▾' : '▸'),
                  h('span', { className: 'dshsm-name' }, subscription.source),
                  h('span', { className: 'dshsm-status' },
                    `${subscription.ref || 'default'} · ${entries.length} ${t('skillCount')} · ${t('installed')} ${installedNames.size}`),
                  h('div', { className: 'dshsm-actions' },
                    h('button', { className: 'dshsm-btn ghost', disabled: busy !== null, onClick: () => void refreshSubscription(subscription) }, t('action.refresh')),
                    h('button', { className: 'dshsm-btn ghost danger', disabled: busy !== null, onClick: () => void deleteSubscription(subscription) }, t('action.delete')))),
                open
                  ? h('div', { style: { marginTop: 6 } }, entries.map((entry) =>
                      h('div', { className: 'dshsm-sub-entry', key: entry.name },
                        h('span', { className: 'dshsm-name' }, entry.name),
                        h('span', { className: 'dshsm-status' }, installedNames.has(entry.name) ? t('installed') : t('notInstalled')),
                        h('div', { className: 'dshsm-actions' },
                          h('button', {
                            className: 'dshsm-btn',
                            disabled: !writable || busy !== null || installedNames.has(entry.name),
                            onClick: () => void installFromSubscription(subscription, entry),
                          }, t('action.install')))))) 
                  : null,
              );
            }));
          }

          const autolinkTargets = (data?.agents?.detected || []).filter((agent) => agent.kind === 'agent');
          const autoLinkSelection = data?.settings?.autoLinkTargets;
          const autoLinkAgents = Array.isArray(autoLinkSelection)
            ? autolinkTargets.filter((agent) => autoLinkSelection.includes(agent.target))
            : autolinkTargets;
          const autoLinkLabel = [t('links.dshGlobal'), ...autoLinkAgents.map((agent) => agent.label)].join('、');

          return h(
            'div',
            { className: 'dshsm-root' },
            h('style', null, CSS),
            h('div', { className: 'dshsm-head' },
              h('div', null,
                h('h2', { className: 'dshsm-title' }, t('section.title')),
                h('p', { className: 'dshsm-sub' }, t('section.subtitle'))),
              h('div', { className: 'dshsm-spacer' }),
              h('button', {
                className: 'dshsm-btn',
                disabled: !writable,
                title: t('autoLink'),
                onClick: () => setModal({ type: 'autolink' }),
              }, `${t('autoLink')}：${autoLinkLabel} ▾`),
              h('button', {
                className: 'dshsm-btn primary',
                disabled: !writable,
                onClick: tab === 'installed' ? requestAddSkill : requestAddSubscription,
              }, tab === 'installed' ? t('action.addSkill') : t('action.addSubscription'))),

            error ? h('div', { className: 'dshsm-banner err' }, `${error} · `, h('button', { className: 'dshsm-btn ghost', onClick: () => void reload() }, t('action.retry'))) : null,
            data?.readOnly ? h('div', { className: 'dshsm-banner warn' }, t('banner.readonly')) : null,
            data && !data.cli?.usable ? h('div', { className: 'dshsm-banner err' }, `${t('banner.cli')} · ${data.cli?.source || ''} ${data.cli?.version || ''}`) : null,

            h('div', { className: 'dshsm-tabs' },
              h('button', { className: `dshsm-tab${tab === 'installed' ? ' active' : ''}`, onClick: () => setTab('installed') },
                `${t('tab.installed')}（${rows.length}）`),
              h('button', { className: `dshsm-tab${tab === 'subscriptions' ? ' active' : ''}`, onClick: () => setTab('subscriptions') },
                `${t('tab.subscriptions')}（${data?.subscriptions?.length || 0}）`)),

            tab === 'installed' ? installedTab() : subscriptionsTab(),

            busy ? h('div', { className: 'dshsm-meta' }, `${t('busy.working')} ${busy}`) : null,
            toast ? h('div', { className: `dshsm-toast ${toast.kind}` }, toast.text) : null,
            modal ? renderModal() : null,
          );

          function renderModal() {
            if (modal.type === 'add-skill') {
              return h(FormModal, {
                title: t('action.addSkill'),
                hint: t('form.hint'),
                fields: [
                  { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
                  { key: 'skills', label: t('form.skills'), placeholder: 'git-kit, handoff' },
                ],
                onCancel: () => setModal(null),
                onSubmit: (form) => void addSkill(form),
              });
            }
            if (modal.type === 'add-subscription') {
              return h(FormModal, {
                title: t('action.addSubscription'),
                hint: t('form.subHint'),
                fields: [
                  { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
                  { key: 'ref', label: t('form.ref'), placeholder: 'main' },
                  { key: 'subpath', label: t('form.subpath'), placeholder: 'skills' },
                ],
                onCancel: () => setModal(null),
                onSubmit: (form) => void addSubscription(form),
              });
            }
            if (modal.type === 'links') {
              return h(LinksModal, {
                row: modal.row,
                agents: data?.agents?.all || [],
                workspaces: data?.workspaces || [],
                onCancel: () => setModal(null),
                onSave: (targets, scopeProjects) => {
                  setModal(null);
                  void saveLinks(modal.row, targets, scopeProjects);
                },
              });
            }
            if (modal.type === 'autolink') {
              return h(AutoLinkModal, {
                settings: data?.settings || {},
                agents: autolinkTargets,
                onCancel: () => setModal(null),
                onSave: async (targets) => {
                  setModal(null);
                  await run('settings', () => apiCall('POST', '/settings', { autoLinkTargets: targets }));
                },
              });
            }
            if (modal.type === 'confirm-delete') {
              return h(ConfirmModal, {
                title: t('confirm.deleteTitle'),
                body: t('confirm.deleteBody'),
                danger: true,
                onCancel: () => setModal(null),
                onConfirm: modal.onConfirm,
              });
            }
            if (modal.type === 'confirm-update') {
              return h(ConfirmModal, {
                title: t('confirm.updateTitle'),
                body: t('confirm.updateBody'),
                onCancel: () => setModal(null),
                onConfirm: modal.onConfirm,
              });
            }
            if (modal.type === 'conflict') {
              const conflicts = modal.detail?.conflicts || [];
              return h(ConfirmModal, {
                title: t('error.conflictTitle'),
                body: `${modal.message}\n${conflicts.map((item) => `${item.label}: ${item.linkPath}`).join('\n')}`,
                onCancel: () => setModal(null),
                onConfirm: () => setModal(null),
                confirmLabel: t('action.cancel'),
              });
            }
            return null;
          }
        }

        function Overlay({ title, children, footer, onCancel }) {
          React.useEffect(() => {
            const onKey = (event) => {
              if (event.key === 'Escape') onCancel?.();
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
          }, [onCancel]);
          return h('div', { className: 'dshsm-overlay', onClick: (event) => { if (event.target === event.currentTarget) onCancel?.(); } },
            h('div', { className: 'dshsm-modal', role: 'dialog', 'aria-modal': 'true' },
              h('h3', null, title),
              children,
              h('div', { className: 'dshsm-modal-foot' }, footer)));
        }

        function FormModal({ title, hint, fields, onCancel, onSubmit }) {
          const [form, setForm] = React.useState(() => Object.fromEntries(fields.map((field) => [field.key, ''])));
          return h(Overlay, {
            title,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsm-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', {
                key: 's',
                className: 'dshsm-btn primary',
                disabled: !form[fields[0].key]?.trim?.() || (fields.some((f) => f.key === 'skills') && !form.skills?.trim()),
                onClick: () => onSubmit(form),
              }, t('action.save')),
            ],
          },
          hint ? h('p', { className: 'dshsm-sub' }, hint) : null,
          ...fields.map((field) =>
            h('label', { className: 'dshsm-field', key: field.key },
              h('span', null, field.label),
              h('input', {
                value: form[field.key],
                placeholder: field.placeholder,
                onChange: (event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value })),
              }))));
        }

        function ConfirmModal({ title, body, onCancel, onConfirm, danger, confirmLabel }) {
          return h(Overlay, {
            title,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsm-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', { key: 'o', className: `dshsm-btn${danger ? ' danger' : ' primary'}`, onClick: onConfirm }, confirmLabel || t('action.save')),
            ],
          }, h('p', { className: 'dshsm-sub', style: { whiteSpace: 'pre-wrap' } }, body));
        }

        function LinksModal({ row, agents, workspaces, onCancel, onSave }) {
          // 本机没有目录的 Agent 不展示；dsh（全局）必选，永远显示
          const candidates = agents.filter(
            (agent) => agent.kind === 'dsh' || (agent.kind !== 'project' && agent.exists),
          );
          const [targets, setTargets] = React.useState(() => {
            // 只保留还能展示的目标：agent 目录都没了就别在保存时把它重新建出来
            const visible = new Set(candidates.map((agent) => agent.target));
            const initial = new Set(row.links.map((link) => link.target).filter((target) => visible.has(target)));
            initial.add('dsh-global');
            return initial;
          });
          const [scopeProjects, setScopeProjects] = React.useState(row.scopeProjects || []);
          const [scopeMode, setScopeMode] = React.useState((row.scopeProjects || []).length > 0 ? 'projects' : 'global');
          const workspacePaths = new Set(workspaces.map((workspace) => workspace.path));
          const otherProjects = scopeProjects.filter((project) => !workspacePaths.has(project));
          const toggle = (target) => setTargets((prev) => {
            const next = new Set(prev);
            if (next.has(target)) next.delete(target);
            else next.add(target);
            return next;
          });
          const toggleProject = (project) => setScopeProjects((prev) =>
            prev.includes(project) ? prev.filter((item) => item !== project) : [...prev, project]);
          const pickDirectory = async () => {
            const picker = ctx.get('uiWorkspace');
            const dir = await picker?.pickDirectory?.();
            if (!dir) return;
            setScopeProjects((prev) => (prev.includes(dir) ? prev : [...prev, dir]));
          };
          return h(Overlay, {
            title: `${t('action.links')} · ${row.name}`,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsm-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', {
                key: 's',
                className: 'dshsm-btn primary',
                onClick: () => onSave([...targets], scopeMode === 'projects' ? scopeProjects.filter((item) => item.trim()) : []),
              }, t('action.save')),
            ],
          },
          h('div', { className: 'dshsm-group' }, t('links.targets')),
          h('p', { className: 'dshsm-sub' }, t('links.detectedHint')),
          ...candidates.map((agent) =>
            h('label', { className: 'dshsm-check', key: agent.target },
              h('input', {
                type: 'checkbox',
                checked: agent.target === 'dsh-global' ? true : targets.has(agent.target),
                disabled: agent.target === 'dsh-global',
                onChange: () => toggle(agent.target),
              }),
              h('span', null, agent.kind === 'dsh' ? t('links.dshGlobal') : agent.label),
              agent.target === 'dsh-global' ? h('small', null, t('links.required')) : null,
              h('small', null, agent.dir))),
          h('div', { className: 'dshsm-group' }, t('links.scope')),
          h('label', { className: 'dshsm-check' },
            h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'global', onChange: () => setScopeMode('global') }),
            h('span', null, t('links.scopeGlobal'))),
          h('label', { className: 'dshsm-check' },
            h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'projects', onChange: () => setScopeMode('projects') }),
            h('span', null, t('links.scopeProjects'))),
          scopeMode === 'projects'
            ? h('div', null,
                h('div', { className: 'dshsm-group' }, t('links.workspaces')),
                workspaces.length === 0
                  ? h('p', { className: 'dshsm-sub' }, t('links.noWorkspaces'))
                  : workspaces.map((workspace) =>
                      h('label', { className: 'dshsm-check', key: workspace.id },
                        h('input', {
                          type: 'checkbox',
                          checked: scopeProjects.includes(workspace.path),
                          onChange: () => toggleProject(workspace.path),
                        }),
                        h('span', null, workspace.title),
                        h('small', null, workspace.path))),
                otherProjects.length > 0
                  ? h('div', { className: 'dshsm-group' }, t('links.selected'))
                  : null,
                ...otherProjects.map((project) =>
                  h('div', { className: 'dshsm-sub-entry', key: project },
                    h('span', { className: 'dshsm-code' }, project),
                    h('div', { className: 'dshsm-actions' },
                      h('button', {
                        className: 'dshsm-btn ghost danger',
                        onClick: () => setScopeProjects((prev) => prev.filter((item) => item !== project)),
                      }, t('action.delete'))))),
                h('button', { className: 'dshsm-btn', onClick: () => void pickDirectory() }, t('links.pickDirectory')))
            : null,
          h('p', { className: 'dshsm-sub' }, t('links.hint')));
        }

        function AutoLinkModal({ settings, agents, onCancel, onSave }) {
          const [targets, setTargets] = React.useState(() => new Set(
            Array.isArray(settings.autoLinkTargets) ? settings.autoLinkTargets : agents.map((agent) => agent.target),
          ));
          const toggle = (target) => setTargets((prev) => {
            const next = new Set(prev);
            if (next.has(target)) next.delete(target);
            else next.add(target);
            return next;
          });
          return h(Overlay, {
            title: t('autoLink'),
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsm-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', { key: 's', className: 'dshsm-btn primary', onClick: () => onSave([...targets]) }, t('action.save')),
            ],
          },
          h('p', { className: 'dshsm-sub' }, t('links.dshGlobal') + ' · ' + t('links.required')),
          h('div', { className: 'dshsm-group' }, t('autoLink.detected')),
          agents.length === 0
            ? h('p', { className: 'dshsm-sub' }, t('autoLink.none'))
            : agents.map((agent) =>
                h('label', { className: 'dshsm-check', key: agent.target },
                  h('input', {
                    type: 'checkbox',
                    checked: targets.has(agent.target),
                    onChange: () => toggle(agent.target),
                  }),
                  h('span', null, agent.label),
                  h('small', null, agent.dir))),
          h('p', { className: 'dshsm-sub' }, t('autoLink.hint')));
        }

        ctx.effect(
          () => slots.inject('settings.section', () =>
            slots.register(
              { name: 'settings.section', id: 'dsh-skills-manager', order: 26, label: () => t('section.title') },
              Section,
            ),
          ),
          'dsh-skills-manager:settings-section',
        );
      },
    };
  },
});

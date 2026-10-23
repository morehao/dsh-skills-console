/**
 * Client half：设置页「技能控制台」分区。
 * 一页两 tab：已装 / 订阅。行内操作列 = 开关 + 更新 + 接入设置 + 删除。
 * 所有数据来自 Host 的 /api/morehao/skills-console/*，这里只做展示与提交。
 */
window.__ModuleLoader__.load({
  id: '@morehao/dsh-skills-console',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const API = '/api/morehao/skills-console';

    const DICT = {
      zh: {
        'section.title': '技能控制台',
        'page.title': '技能控制台',
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
        'placement.label': '入口位置',
        'placement.settings': '设置里',
        'placement.sidebar': '侧边栏',
        'placement.hint': '切换后立即生效；移到设置后从侧栏底部「设置 → 技能」打开',
        'github.open': '打开 GitHub 仓库',
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
        'links.detectedHint': '只显示本机已安装（目录存在）的 Agent；已删除的 Agent 会从列表消失，旧链接记录保留但不展示。',
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
        visibleOnlyBuiltin: 'DSH 自带技能（本插件不管理）',
        external: '非本插件创建',
      },
      en: {
        'section.title': 'Skills Console',
        'page.title': 'Skills Console',
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
        'links.detectedHint': 'Only installed agents are listed; deleted agents disappear but their old link records are kept and hidden.',
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
        visibleOnlyBuiltin: 'Shipped with DSH (this plugin does not manage them)',
        external: 'created outside this plugin',
        'adopt.done': 'now tracked',
      },
    };

    const CSS = `
      /* 主面板形态：与 DSH 自带管理页同一边距/滚动方式 */
      .dshsc-page { box-sizing: border-box; width: 100%; height: 100%; overflow: auto;
        padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) clamp(24px, 4vw, 48px) 48px; }
      .dshsc-page .dshsc-root { max-width: 980px; margin: 0 auto; }
      .dshsc-page .dshsc-title { font-size: 20px; font-weight: 500; line-height: 28px; }
      .dshsc-page .dshsc-sub { font-size: 13px; line-height: 20px; }
      .dshsc-root { display: flex; flex-direction: column; gap: 16px; color: var(--dsw-alias-label-primary); }
      .dshsc-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
      .dshsc-heading { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
      .dshsc-heading-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .dshsc-logo { flex: none; display: block; border-radius: 8px; }
      .dshsc-title { font-size: 17px; font-weight: 600; letter-spacing: -.01em; margin: 0; }
      .dshsc-sub { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; max-width: 64ch; }
      .dshsc-spacer { flex: 1; }
      .dshsc-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
      .dshsc-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; }
      .dshsc-prefbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px;
        color: var(--dsw-alias-label-secondary); }
      .dshsc-pref-hint { color: var(--dsw-alias-label-tertiary); }

      .dshsc-btn { font: inherit; font-size: 12px; line-height: 1; padding: 7px 11px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
        transition: background .12s ease, border-color .12s ease, color .12s ease; }
      .dshsc-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
      .dshsc-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .dshsc-btn:disabled { opacity: .42; cursor: not-allowed; }
      /* brand-primary 与 bg-base 在明暗主题里互为反色：文字用 bg-base 才不会是白底白字 */
      .dshsc-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); font-weight: 600; }
      .dshsc-btn.primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); opacity: .9; }
      .dshsc-btn.ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); padding: 6px 8px; }
      .dshsc-btn.ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .dshsc-btn.ghost.danger { color: var(--dsw-alias-state-error-primary); }
      .dshsc-btn.ghost.danger:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }

      .dshsc-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .dshsc-tabs { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
      .dshsc-tab { font: inherit; font-size: 12px; padding: 6px 11px; border: 0; border-radius: 7px; background: transparent;
        cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .dshsc-tab:hover { color: var(--dsw-alias-label-primary); }
      .dshsc-tab.active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
        box-shadow: 0 0 0 1px var(--dsw-alias-border-l1), 0 1px 2px rgba(0,0,0,.12); }

      .dshsc-segment { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
      .dshsc-segment .dshsc-btn { border: 0; border-radius: 0; background: transparent; padding: 6px 10px; }
      .dshsc-segment .dshsc-btn + .dshsc-btn { border-left: 1px solid var(--dsw-alias-border-l1); }
      .dshsc-segment .dshsc-btn[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

      .dshsc-list { display: flex; flex-direction: column; gap: 8px; }
      .dshsc-row { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1);
        padding: 12px 14px; transition: border-color .12s ease, background .12s ease; }
      .dshsc-row:hover { border-color: var(--dsw-alias-border-l2); }
      .dshsc-row.off { opacity: .62; }
      .dshsc-row-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .dshsc-name { font-size: 13px; font-weight: 600; letter-spacing: -.005em; }
      .dshsc-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; line-height: 1; padding: 4px 8px;
        border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .dshsc-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .85; }
      .dshsc-status.ok { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent); }
      .dshsc-status.warn { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 13%, transparent); }
      .dshsc-status.err { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent); }
      .dshsc-meta { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin-top: 6px; display: flex; flex-wrap: wrap; }
      .dshsc-row .dshsc-meta span + span::before { content: '·'; margin: 0 7px; color: var(--dsw-alias-label-tertiary); }
      .dshsc-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; flex-wrap: wrap; }

      /* 与 DSH 自带开关同尺寸/同 token：关是 border-l3 轨道，开是 brand-primary 轨道 */
      .dshsc-switch { box-sizing: border-box; position: relative; flex: none; width: 36px; height: 20px; padding: 2px;
        border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer;
        transition: background .14s ease; }
      .dshsc-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .dshsc-switch:disabled { cursor: not-allowed; opacity: .5; }
      .dshsc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
      .dshsc-knob { display: block; width: 16px; height: 16px; border-radius: 50%;
        background: var(--dsw-alias-switch-thumb); transition: transform .12s ease, background .12s ease; }
      .dshsc-switch[aria-checked="true"] .dshsc-knob { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }

      .dshsc-banner { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 9px 12px; font-size: 12px;
        line-height: 1.55; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .dshsc-banner.err { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
      .dshsc-banner.warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); }

      .dshsc-empty { text-align: center; padding: 34px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px;
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent); }
      .dshsc-empty .dshsc-name { font-size: 14px; }
      .dshsc-empty .dshsc-meta { justify-content: center; margin-top: 6px; }
      .dshsc-group { font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--dsw-alias-label-tertiary); margin: 12px 0 6px; }

      .dshsc-overlay { position: fixed; inset: 0; background: rgba(4,6,9,.55); display: flex; align-items: center; justify-content: center;
        z-index: 60; padding: 20px; backdrop-filter: blur(2px); }
      .dshsc-modal { position: relative; width: min(600px, 100%); max-height: calc(100vh - 40px); overflow: auto;
        background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
        padding: 18px; display: flex; flex-direction: column; gap: 14px;
        box-shadow: 0 20px 56px rgba(0,0,0,.38), 0 2px 8px rgba(0,0,0,.18); }
      .dshsc-modal h3 { margin: 0; font-size: 15px; font-weight: 600; padding-right: 26px; }
      .dshsc-modal-close { position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; border: 0; border-radius: 7px;
        background: transparent; color: var(--dsw-alias-label-secondary); font-size: 18px; line-height: 1; cursor: pointer; }
      .dshsc-modal-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

      .dshsc-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .dshsc-field input { font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; }
      .dshsc-field input:focus { border-color: var(--dsw-alias-brand-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }

      .dshsc-check { display: flex; align-items: center; gap: 9px; font-size: 13px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
      .dshsc-check:hover { background: var(--dsw-alias-bg-layer-1); }
      .dshsc-check input { width: 14px; height: 14px; accent-color: var(--dsw-alias-brand-primary); flex: none; }
      .dshsc-check small { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .dshsc-check span { white-space: nowrap; }

      .dshsc-panel { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1);
        padding: 4px; max-height: 240px; overflow: auto; display: flex; flex-direction: column; }
      .dshsc-panel .dshsc-check:hover { background: var(--dsw-alias-bg-layer-2); }

      .dshsc-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .dshsc-toast { position: fixed; right: 18px; bottom: 18px; z-index: 70; font-size: 12px; padding: 10px 13px; border-radius: 9px;
        background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2);
        box-shadow: 0 8px 24px rgba(0,0,0,.22); max-width: 420px; }
      .dshsc-toast.err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .dshsc-toast.ok { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, var(--dsw-alias-border-l2)); }
      .dshsc-substat { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .dshsc-sub-entry { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 7px 8px 7px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .dshsc-sub-entry:first-child { border-top: 0; }
      .dshsc-sub-list { margin-top: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
      .dshsc-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
      .dshsc-chevron { width: 26px; padding: 4px 0; text-align: center; }
    `;

    function short(sha) {
      return sha ? String(sha).slice(0, 7) : '';
    }

    async function apiCall(method, path, body) {
      const response = await fetch(`${API}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-dsh-skills-console': '1' },
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

    const GITHUB_URL = 'https://github.com/morehao/dsh-skills-console';

    function Logo({ size = 30 }) {
      return h('svg', {
        className: 'dshsc-logo', width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true,
      },
      h('defs', null,
        h('linearGradient', { id: 'dshsc-logo-bg', x1: 6, y1: 2, x2: 58, y2: 62, gradientUnits: 'userSpaceOnUse' },
          h('stop', { stopColor: '#3b82f6' }),
          h('stop', { offset: 1, stopColor: '#1d4ed8' }))),
      h('rect', { x: 3, y: 3, width: 58, height: 58, rx: 14, fill: 'url(#dshsc-logo-bg)' }),
      h('path', {
        d: 'M32 32 18 17M32 32 46 17M32 32 32 49',
        stroke: '#ffffff', strokeOpacity: 0.55, strokeWidth: 2.6, strokeLinecap: 'round',
      }),
      h('circle', { cx: 18, cy: 17, r: 4.6, fill: '#7ef0c0' }),
      h('circle', { cx: 46, cy: 17, r: 4.6, fill: '#ffffff' }),
      h('circle', { cx: 32, cy: 49, r: 4.6, fill: '#ffffff' }),
      h('rect', { x: 21, y: 21, width: 22, height: 22, rx: 7, fill: '#ffffff' }),
      h('path', {
        d: 'M27 32.5l3.6 3.6 6.8-7.4',
        fill: 'none', stroke: '#1d4ed8', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    function PanelIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', { x: 7.5, y: 7.5, width: 9, height: 9, rx: 3 }),
      h('path', { d: 'M9.8 12.1l1.5 1.5 3.1-3.3' }),
      h('path', { d: 'M12 7.5V4.8M12 16.5v2.7M7.5 12H4.8', opacity: 0.55 }),
      h('circle', { cx: 12, cy: 4.2, r: 1.1, fill: 'currentColor', stroke: 'none' }),
      h('circle', { cx: 12, cy: 19.8, r: 1.1, fill: 'currentColor', stroke: 'none' }),
      h('circle', { cx: 4.2, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }));
    }

    function GitHubIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true,
        style: { display: 'block' },
      }, h('path', {
        d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
      }));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale');
        const t = buildTranslate(locale);
        const slots = ctx.get('slots');
        if (!slots?.register) return;

        function Section(props) {
          const page = Boolean(props?.page);
          const [data, setData] = React.useState(null);
          const [error, setError] = React.useState(null);
          const [tab, setTab] = React.useState('installed');
          const [view, setView] = React.useState('flat');
          const [busy, setBusy] = React.useState(null);
          const [toast, setToast] = React.useState(null);
          const [modal, setModal] = React.useState(null);
          const [expanded, setExpanded] = React.useState({});
          const [placementBusy, setPlacementBusy] = React.useState(null);

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
            return h('span', { className: `dshsc-status ${cls}` }, t(key));
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
            return h('div', { className: 'dshsc-meta' }, parts.map((text, index) => h('span', { key: index }, text)));
          }

          function rowView(row) {
            const off = row.mode === 'off';
            const tracked = row.status !== 'unmanaged';
            const canUpdate = writable && (row.status === 'update-available' || row.status === 'conflict' || row.status === 'locally-modified');
            return h(
              'div',
              { className: `dshsc-row${off ? ' off' : ''}`, key: row.name },
              h(
                'div',
                { className: 'dshsc-row-head' },
                h('span', { className: 'dshsc-name' }, row.name),
                statusCell(row),
                h(
                  'div',
                  { className: 'dshsc-actions' },
                  h('button', {
                    className: 'dshsc-switch',
                    role: 'switch',
                    'aria-checked': String(tracked && row.mode === 'on'),
                    'aria-label': `${row.name} ${t('mode.on')}/${t('mode.off')}`,
                    // 未纳入追踪时调 setMode 只会报「没有安装记录」，不如直接禁用
                    disabled: busy !== null || !tracked,
                    onClick: () => void toggleMode(row),
                    title: tracked ? (row.mode === 'on' ? t('mode.off') : t('mode.on')) : t('adopt.switchHint'),
                  }, h('span', { className: 'dshsc-knob' })),
                  row.status === 'unmanaged'
                    ? h('button', {
                        className: 'dshsc-btn ghost',
                        disabled: !writable || busy !== null,
                        title: row.source ? row.source : t('meta.none'),
                        onClick: () => void adopt(row),
                      }, t('action.adopt'))
                    : h('button', { className: 'dshsc-btn ghost', disabled: !canUpdate || busy !== null, onClick: () => requestUpdate(row) }, t('action.update')),
                  h('button', { className: 'dshsc-btn ghost', disabled: busy !== null, onClick: () => setModal({ type: 'links', row }) }, t('action.links')),
                  h('button', { className: 'dshsc-btn ghost danger', disabled: !writable || busy !== null, onClick: () => requestDelete(row) }, t('action.delete')),
                ),
              ),
              metaLine(row),
              off ? h('div', { className: 'dshsc-meta' }, t('mode.offHint')) : null,
              row.status === 'broken-link' ? h('div', { className: 'dshsc-meta' }, `⚠ ${t('status.broken')}`) : null,
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
            if (!data) return h('div', { className: 'dshsc-empty' }, t('busy.working'));
            if (rows.length === 0) {
              return h(
                'div',
                { className: 'dshsc-empty' },
                h('div', { className: 'dshsc-name' }, t('empty.skills')),
                h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.skillsHint')),
                h('div', { style: { marginTop: 10 } },
                  h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: requestAddSkill }, t('action.addSkill'))),
              );
            }
            const body =
              view === 'agent'
                ? groupedRows().map((group) =>
                    h('div', { key: group.title }, h('div', { className: 'dshsc-group' }, group.title), h('div', { className: 'dshsc-list' }, group.rows.map(rowView))))
                : h('div', { className: 'dshsc-list' }, rows.map(rowView));
            return h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              updateCount > 0
                ? h('div', { className: 'dshsc-banner warn' },
                    h('span', null, `⚠ ${updateCount} ${t('status.update')}`),
                    h('button', { className: 'dshsc-btn', disabled: !writable || busy !== null, onClick: () => void updateAll() }, t('action.updateAll')))
                : null,
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
                ? h('div', { className: 'dshsc-banner warn', key: 'other' },
                    `${t('visibleOnlyOther')}：${others.map((item) => item.name).join('、')}`)
                : null,
              builtin.length > 0
                ? h('div', { className: 'dshsc-banner info', key: 'builtin' },
                    `${t('visibleOnlyBuiltin')}：${builtin.map((item) => item.name).join('、')}`)
                : null,
            ];
          }

          function subscriptionsTab() {
            const subs = data?.subscriptions || [];
            if (subs.length === 0) {
              return h(
                'div',
                { className: 'dshsc-empty' },
                h('div', { className: 'dshsc-name' }, t('empty.subs')),
                h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.subsHint')),
                h('div', { style: { marginTop: 10 } },
                  h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: requestAddSubscription }, t('action.addSubscription'))),
              );
            }
            return h('div', { className: 'dshsc-list' }, subs.map((subscription) => {
              const entries = subscription.snapshot?.entries || [];
              const installedNames = new Set(rows.filter((row) => row.subscriptionId === subscription.id).map((row) => row.name));
              const open = Boolean(expanded[subscription.id]);
              return h(
                'div',
                { className: 'dshsc-row', key: subscription.id },
                h('div', { className: 'dshsc-row-head' },
                  h('button', { className: 'dshsc-btn ghost', onClick: () => setExpanded((prev) => ({ ...prev, [subscription.id]: !open })) }, open ? '▾' : '▸'),
                  h('span', { className: 'dshsc-name' }, subscription.source),
                  h('span', { className: 'dshsc-substat' },
                    `${subscription.ref || 'default'} · ${entries.length} ${t('skillCount')} · ${t('installed')} ${installedNames.size}`),
                  h('div', { className: 'dshsc-actions' },
                    h('button', { className: 'dshsc-btn ghost', disabled: busy !== null, onClick: () => void refreshSubscription(subscription) }, t('action.refresh')),
                    h('button', { className: 'dshsc-btn ghost danger', disabled: busy !== null, onClick: () => void deleteSubscription(subscription) }, t('action.delete')))),
                open
                  ? h('div', { className: 'dshsc-sub-list' }, entries.map((entry) =>
                      h('div', { className: 'dshsc-sub-entry', key: entry.name },
                        h('span', { className: 'dshsc-name' }, entry.name),
                        h('span', { className: 'dshsc-substat' }, installedNames.has(entry.name) ? t('installed') : t('notInstalled')),
                        h('div', { className: 'dshsc-actions' },
                          h('button', {
                            className: 'dshsc-btn',
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
          const placement = data?.settings?.placement === 'sidebar' ? 'sidebar' : 'settings';

          async function changePlacement(next) {
            if (next === placement || placementBusy) return;
            setPlacementBusy(next);
            try {
              await apiCall('POST', '/settings', { placement: next });
              props?.onPlacementChange?.(next);
              setPlacementBusy(null);
            } catch (err) {
              setToast({ kind: 'err', text: err.message });
              setPlacementBusy(null);
            }
          }

          const root = h(
            'div',
            { className: 'dshsc-root' },
            h('style', null, CSS),
            h('div', { className: 'dshsc-head' },
              h('div', { className: 'dshsc-heading' },
                h(Logo, { size: page ? 36 : 30 }),
                h('div', { className: 'dshsc-heading-text' },
                  h('h2', { className: 'dshsc-title' }, page ? t('page.title') : t('section.title')),
                  h('p', { className: 'dshsc-sub' }, t('section.subtitle')))),
              h('div', { className: 'dshsc-head-actions' },
                h('button', {
                  className: 'dshsc-btn',
                  disabled: !writable,
                  title: `${t('autoLink')}：${autoLinkLabel}`,
                  'aria-label': `${t('autoLink')}：${autoLinkLabel}`,
                  onClick: () => setModal({ type: 'autolink' }),
                }, `${t('autoLink')} · ${autoLinkAgents.length + 1} ▾`),
                h('button', {
                  className: 'dshsc-btn primary',
                  disabled: !writable,
                  onClick: tab === 'installed' ? requestAddSkill : requestAddSubscription,
                }, tab === 'installed' ? t('action.addSkill') : t('action.addSubscription')),
                h('a', {
                  className: 'dshsc-btn dshsc-iconbtn',
                  href: GITHUB_URL,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  title: t('github.open'),
                  'aria-label': t('github.open'),
                }, h(GitHubIcon, { size: 16 })))),

            data ? h('div', { className: 'dshsc-prefbar' },
              h('span', null, t('placement.label')),
              h('div', { className: 'dshsc-segment' },
                h('button', {
                  className: 'dshsc-btn',
                  'aria-pressed': String(placement === 'settings'),
                  disabled: Boolean(placementBusy) || Boolean(data.readOnly),
                  onClick: () => void changePlacement('settings'),
                }, t('placement.settings')),
                h('button', {
                  className: 'dshsc-btn',
                  'aria-pressed': String(placement === 'sidebar'),
                  disabled: Boolean(placementBusy) || Boolean(data.readOnly),
                  onClick: () => void changePlacement('sidebar'),
                }, t('placement.sidebar'))),
              h('span', { className: 'dshsc-pref-hint' }, t('placement.hint'))) : null,

            error ? h('div', { className: 'dshsc-banner err' }, `${error} · `, h('button', { className: 'dshsc-btn ghost', onClick: () => void reload() }, t('action.retry'))) : null,
            data?.readOnly ? h('div', { className: 'dshsc-banner warn' }, t('banner.readonly')) : null,
            data && !data.cli?.usable ? h('div', { className: 'dshsc-banner err' }, `${t('banner.cli')} · ${data.cli?.source || ''} ${data.cli?.version || ''}`) : null,

            h('div', { className: 'dshsc-toolbar' },
              h('div', { className: 'dshsc-tabs' },
                h('button', { className: `dshsc-tab${tab === 'installed' ? ' active' : ''}`, onClick: () => setTab('installed') },
                  `${t('tab.installed')}（${rows.length}）`),
                h('button', { className: `dshsc-tab${tab === 'subscriptions' ? ' active' : ''}`, onClick: () => setTab('subscriptions') },
                  `${t('tab.subscriptions')}（${data?.subscriptions?.length || 0}）`)),
              h('div', { className: 'dshsc-spacer' }),
              tab === 'installed' ? [
                h('button', { key: 'refresh', className: 'dshsc-btn', disabled: busy !== null, onClick: () => void checkUpdates() }, t('action.refresh')),
                h('div', { key: 'view', className: 'dshsc-segment' },
                  h('button', { className: 'dshsc-btn', 'aria-pressed': String(view === 'flat'), onClick: () => setView('flat') }, t('view.flat')),
                  h('button', { className: 'dshsc-btn', 'aria-pressed': String(view === 'agent'), onClick: () => setView('agent') }, t('view.agent'))),
              ] : null),

            tab === 'installed' ? installedTab() : subscriptionsTab(),

            busy ? h('div', { className: 'dshsc-meta' }, `${t('busy.working')} ${busy}`) : null,
            toast ? h('div', { className: `dshsc-toast ${toast.kind}` }, toast.text) : null,
            modal ? renderModal() : null,
          );
          return page ? h('div', { className: 'dshsc-page' }, root) : root;

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
          return h('div', { className: 'dshsc-overlay', onClick: (event) => { if (event.target === event.currentTarget) onCancel?.(); } },
            h('div', { className: 'dshsc-modal', role: 'dialog', 'aria-modal': 'true' },
              h('button', {
                className: 'dshsc-modal-close',
                'aria-label': t('action.cancel'),
                onClick: (event) => { event.stopPropagation(); onCancel?.(); },
              }, '×'),
              h('h3', null, title),
              children,
              h('div', { className: 'dshsc-modal-foot' }, footer)));
        }

        function FormModal({ title, hint, fields, onCancel, onSubmit }) {
          const [form, setForm] = React.useState(() => Object.fromEntries(fields.map((field) => [field.key, ''])));
          return h(Overlay, {
            title,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', {
                key: 's',
                className: 'dshsc-btn primary',
                disabled: !form[fields[0].key]?.trim?.() || (fields.some((f) => f.key === 'skills') && !form.skills?.trim()),
                onClick: () => onSubmit(form),
              }, t('action.save')),
            ],
          },
          hint ? h('p', { className: 'dshsc-sub' }, hint) : null,
          ...fields.map((field) =>
            h('label', { className: 'dshsc-field', key: field.key },
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
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', { key: 'o', className: `dshsc-btn${danger ? ' danger' : ' primary'}`, onClick: onConfirm }, confirmLabel || t('action.save')),
            ],
          }, h('p', { className: 'dshsc-sub', style: { whiteSpace: 'pre-wrap' } }, body));
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
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', {
                key: 's',
                className: 'dshsc-btn primary',
                onClick: () => onSave([...targets], scopeMode === 'projects' ? scopeProjects.filter((item) => item.trim()) : []),
              }, t('action.save')),
            ],
          },
          h('div', { className: 'dshsc-group' }, t('links.targets')),
          h('p', { className: 'dshsc-sub' }, t('links.detectedHint')),
          ...candidates.map((agent) =>
            h('label', { className: 'dshsc-check', key: agent.target },
              h('input', {
                type: 'checkbox',
                checked: agent.target === 'dsh-global' ? true : targets.has(agent.target),
                disabled: agent.target === 'dsh-global',
                onChange: () => toggle(agent.target),
              }),
              h('span', null, agent.kind === 'dsh' ? t('links.dshGlobal') : agent.label),
              agent.target === 'dsh-global' ? h('small', null, t('links.required')) : null,
              h('small', null, agent.dir))),
          h('div', { className: 'dshsc-group' }, t('links.scope')),
          h('label', { className: 'dshsc-check' },
            h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'global', onChange: () => setScopeMode('global') }),
            h('span', null, t('links.scopeGlobal'))),
          h('label', { className: 'dshsc-check' },
            h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'projects', onChange: () => setScopeMode('projects') }),
            h('span', null, t('links.scopeProjects'))),
          scopeMode === 'projects'
            ? h('div', null,
                h('div', { className: 'dshsc-group' }, t('links.workspaces')),
                workspaces.length === 0
                  ? h('p', { className: 'dshsc-sub' }, t('links.noWorkspaces'))
                  : h('div', { className: 'dshsc-panel' }, workspaces.map((workspace) =>
                      h('label', { className: 'dshsc-check', key: workspace.id },
                        h('input', {
                          type: 'checkbox',
                          checked: scopeProjects.includes(workspace.path),
                          onChange: () => toggleProject(workspace.path),
                        }),
                        h('span', null, workspace.title),
                        h('small', null, workspace.path)))),
                otherProjects.length > 0
                  ? h('div', { className: 'dshsc-group' }, t('links.selected'))
                  : null,
                ...otherProjects.map((project) =>
                  h('div', { className: 'dshsc-sub-entry', key: project },
                    h('span', { className: 'dshsc-code' }, project),
                    h('div', { className: 'dshsc-actions' },
                      h('button', {
                        className: 'dshsc-btn ghost danger',
                        onClick: () => setScopeProjects((prev) => prev.filter((item) => item !== project)),
                      }, t('action.delete'))))),
                h('button', { className: 'dshsc-btn', style: { alignSelf: 'flex-start', marginTop: 6 }, onClick: () => void pickDirectory() }, t('links.pickDirectory')))
            : null,
          h('p', { className: 'dshsc-sub' }, t('links.hint')));
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
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', { key: 's', className: 'dshsc-btn primary', onClick: () => onSave([...targets]) }, t('action.save')),
            ],
          },
          h('p', { className: 'dshsc-sub' }, t('links.dshGlobal') + ' · ' + t('links.required')),
          h('div', { className: 'dshsc-group' }, t('autoLink.detected')),
          agents.length === 0
            ? h('p', { className: 'dshsc-sub' }, t('autoLink.none'))
            : h('div', { className: 'dshsc-panel' }, agents.map((agent) =>
                h('label', { className: 'dshsc-check', key: agent.target },
                  h('input', {
                    type: 'checkbox',
                    checked: targets.has(agent.target),
                    onChange: () => toggle(agent.target),
                  }),
                  h('span', null, agent.label),
                  h('small', null, agent.dir)))),
          h('p', { className: 'dshsc-sub' }, t('autoLink.hint')));
        }

        const PANEL_ID = 'dsh-skills-console';
        const layout = ctx.get('layout');
        let surface = null;
        let userSelected = false;
        const surfaceDisposers = [];

        function SettingsSurface(props) {
          return h(Section, {
            ...props,
            page: false,
            onPlacementChange: (next) => changeSurface(next, props?.close),
          });
        }

        function PageSurface() {
          return h(Section, { page: true, onPlacementChange: (next) => changeSurface(next) });
        }

        function SurfaceIcon(props) {
          return h(PanelIcon, { size: props?.size || 16 });
        }

        function clearSurface() {
          while (surfaceDisposers.length > 0) {
            const dispose = surfaceDisposers.pop();
            try {
              dispose();
            } catch {
              // 单个卸载失败不阻塞另一个入口
            }
          }
        }

        function mount(next) {
          const target = next === 'sidebar' ? 'sidebar' : 'settings';
          if (surface === target) return;
          clearSurface();
          surface = target;
          if (target === 'sidebar') {
            // 先注册 main 再注册侧栏按钮：按钮出现时 main 一定可选
            surfaceDisposers.push(slots.inject('main', () => {
              const disposeMain = slots.register({ name: 'main', key: PANEL_ID }, PageSurface);
              const disposeIcon = slots.inject('sidebar.panellist', () => slots.register({
                name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => t('page.title'),
              }, SurfaceIcon));
              return [disposeMain, disposeIcon];
            }));
          } else {
            surfaceDisposers.push(slots.inject('settings.section', () =>
              slots.register({
                name: 'settings.section', id: PANEL_ID, order: 26, label: () => t('section.title'),
              }, SettingsSurface)));
          }
        }

        function changeSurface(next, close) {
          userSelected = true;
          mount(next);
          try {
            if (next === 'sidebar') {
              layout?.selectPanel?.(PANEL_ID);
              close?.();
            } else {
              // 离开已消失的自定义主面板，回到会话；用户从侧栏底部打开设置即可看到分区
              layout?.selectPanel?.('conversation');
            }
          } catch {
            // main 声明尚未就绪时 select 会抛错；侧栏按钮/设置分区随后仍可点开
          }
        }

        mount('settings');
        ctx.effect(() => () => {
          clearSurface();
          surface = null;
        }, 'dsh-skills-console:surface');

        // 读取入口偏好；晚到的响应不能覆盖用户刚才在页面里的选择
        apiCall('GET', '/state')
          .then((state) => {
            if (!userSelected && state?.settings?.placement === 'sidebar') mount('sidebar');
          })
          .catch(() => {});
      },
    };
  },
});

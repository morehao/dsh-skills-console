/* AUTO-GENERATED from client/ by scripts/build-client.mjs — do not edit. */
/* eslint-disable */
window.__ModuleLoader__.load({
  id: "@morehao/dsh-skills-console",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// client/api.js
var API = "/api/morehao/skills-console";
function short(sha) {
  return sha ? String(sha).slice(0, 7) : "";
}
async function apiCall(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-dsh-skills-console": "1" },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    cache: "no-store"
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
var GITHUB_URL = "https://github.com/morehao/dsh-skills-console";

// client/copy.js
var DICT = {
  zh: {
    "section.title": "技能控制台",
    "page.title": "技能控制台",
    "section.subtitle": "统一管理本地技能的安装、更新、删除与接入，让同一份技能在多个 Agent 间复用。",
    "tab.installed": "已安装",
    "tab.subscriptions": "订阅",
    "action.addSkill": "添加技能",
    "action.addSubscription": "添加订阅",
    "action.checkUpdates": "检查更新",
    "action.update": "更新",
    "action.updateAll": "全部更新",
    "action.delete": "删除",
    "action.unsubscribe": "取消订阅",
    "action.view": "查看",
    "action.hide": "收起",
    "action.links": "接入设置",
    "action.install": "安装",
    "action.expand": "展开",
    "action.collapse": "收起",
    "action.adopt": "接管",
    "action.save": "保存",
    "action.cancel": "取消",
    "action.choose": "选择目录",
    "action.retry": "重新加载",
    "view.flat": "平铺",
    "view.agent": "按 Agent",
    autoLink: "自动接入",
    "settings.title": "插件设置",
    "version.label": "当前版本",
    "placement.label": "侧边栏入口",
    "placement.effect": "切换后立即生效",
    "placement.on": "已开启",
    "placement.off": "已关闭",
    "placement.hint": "开启后侧栏出现「技能控制台」入口；关闭则只在「设置 → 技能」显示。",
    "github.open": "打开 GitHub 仓库",
    "status.current": "最新",
    "status.update": "可更新",
    "status.local": "本地已改",
    "status.conflict": "本地已改 + 上游已变",
    "status.deleted": "上游已移除",
    "status.broken": "异常：软链断裂",
    "status.unmanaged": "未纳入追踪",
    "status.unknown": "待检查",
    "status.off": "已停用",
    "status.brokenHint": "软链目标不存在：重新接入，或删除后重装",
    "adopt.switchHint": "还未纳入追踪，不能启停",
    "adopt.noUpstream": "没有远端来源，暂时无法检测更新",
    "adopt.done": "已纳入追踪",
    "toast.checked": "检查完成",
    "mode.on": "启用",
    "mode.off": "停用",
    "mode.offHint": "停用中：DSH 看不到它，但已接入的其他 Agent 照常可用",
    "links.dshGlobal": "dsh（全局）",
    "links.required": "必选",
    "links.scope": "在 DSH 里的作用范围",
    "links.scopeGlobal": "全局（默认）",
    "links.scopeProjects": "仅以下项目",
    "links.targets": "接入到哪些 Agent",
    "links.detectedHint": "只显示本机已安装（目录存在）的 Agent；已删除的会从列表消失，旧接入记录保留但不展示。",
    "links.canonical": "技能本体：{path}；下面列的是各 Agent 的接入目录（软链目标）。",
    "links.workspaces": "DSH 工作区",
    "links.noWorkspaces": "还没有 DSH 工作区，可以点下面「选择其他目录」",
    "links.pickDirectory": "选择其他目录…",
    "links.selected": "其他已选目录",
    "links.hint": "保存后按勾选建立或移除接入；技能本体保留在原位置，不会移动。",
    "autoLink.detected": "安装后自动接入",
    "autoLink.none": "本机没有检测到其他 Agent",
    "autoLink.hint": "dsh（全局）始终接入；这里只影响之后安装时的自动接入，已安装的技能请在「接入设置」里改。",
    "empty.skills": "还没有安装任何技能",
    "empty.skillsHint": "在终端跑 `npx skills add owner/repo`，或点右上角「添加技能」",
    "empty.subs": "还没有添加订阅",
    "empty.subsHint": "订阅只是关注，不安装任何技能",
    "banner.cli": "本地技能工具不可用，暂时无法安装或修改",
    "banner.readonly": "状态文件损坏，插件处于只读模式",
    "banner.visible": "模型可见技能与本地账本不一致，差异已列在下方",
    "form.source": "来源（owner/repo 或 GitHub URL）",
    "form.sourceHint": "例如 morehao/ai-kit",
    "form.probe": "检测技能",
    "form.probing": "读取中…",
    "form.probingHint": "正在读仓库的文件树，稍等一下…",
    "form.detected": "检测到 {n} 个技能，勾选要安装的",
    "form.skipped": "另有 {n} 个 SKILL.md 缺少 name/description，CLI 无法安装，已跳过",
    "form.selectAll": "全选",
    "form.selectNone": "全不选",
    "form.pickHint": "先填来源并检测；仓库里有多个技能时可以多选，只有一个会默认勾上。",
    "form.noSkills": "仓库里没找到 SKILL.md，可以直接填技能名安装",
    "form.probeFailed": "检测失败，仍可手动填技能名",
    "form.skills": "技能名（多个用逗号分隔）",
    "form.ref": "ref（分支 / tag，可空）",
    "form.refHint": "留空则自动跟随仓库默认分支",
    "form.subpath": "子目录（可空）",
    "form.hint": "会立即下载并写入 ~/.agents/skills，并按「自动接入」设置接到对应 Agent。",
    "form.subHint": "只记录你关注这个仓库，不会安装任何技能。",
    "subscription.defaultRef": "默认分支",
    "confirm.deleteTitle": "删除技能",
    "confirm.deleteBody": "会从本机移除，断开本插件建立的软链并调 skills CLI 卸载；目录先备份到回收站（保留 7 天）。不会删除你的源仓库。",
    "confirm.updateTitle": "本地有改动",
    "confirm.updateBody": "更新会覆盖这些本地改动；旧内容已备份，可回滚。",
    "error.conflictTitle": "删除被拦截",
    "busy.working": "处理中…",
    "meta.from": "来自",
    "meta.noUpstream": "无远端来源 · 不检测更新",
    "meta.unlinked": "未接入任何 Agent",
    "meta.scope": "范围",
    "meta.onlyProject": "仅",
    "meta.agentsAll": "已接入的 Agent",
    "meta.none": "无",
    "filter.all": "全部",
    "filter.update": "可更新",
    "filter.unknown": "待检查",
    "filter.off": "已停用",
    "search.placeholder": "搜索技能或 Agent",
    "search.clear": "清除",
    "empty.loading": "正在读取技能清单…",
    "empty.filtered": "没有匹配的技能",
    "empty.filteredHint": "换个关键词，或清除筛选条件",
    "hint.unknown": "还有 {n} 个技能未检查更新。",
    "group.dshGlobal": "DSH · 全局",
    "group.dshProject": "DSH · 仅特定项目",
    "group.off": "已停用",
    "group.unlinked": "未接入 Agent",
    installed: "已安装",
    notInstalled: "未安装",
    skillCount: "个技能",
    visibleOnly: "模型可见，但不在本地技能库",
    visibleOnlyOther: "DSH 能看到，但不在 ~/.agents/skills",
    visibleOnlyBuiltin: "本插件仅管理 ~/.agents/skills 下的技能，DSH 内置技能不在管理范围内",
    "builtin.view": "查看内置技能（{n}）",
    "builtin.hide": "收起内置技能",
    external: "非本插件创建"
  },
  en: {
    "section.title": "Skills Console",
    "page.title": "Skills Console",
    "section.subtitle": "Manage local skills in one place: install, update, remove and link — so the same skill can be reused across agents.",
    "tab.installed": "Installed",
    "tab.subscriptions": "Subscriptions",
    "action.addSkill": "Add skill",
    "action.addSubscription": "Add subscription",
    "action.checkUpdates": "Check for updates",
    "action.update": "Update",
    "action.updateAll": "Update all",
    "action.delete": "Delete",
    "action.unsubscribe": "Unsubscribe",
    "action.view": "View",
    "action.hide": "Hide",
    "action.links": "Link settings",
    "action.install": "Install",
    "action.expand": "Expand",
    "action.collapse": "Collapse",
    "action.adopt": "Adopt",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "action.choose": "Choose folder",
    "action.retry": "Reload",
    "view.flat": "Flat",
    "view.agent": "By agent",
    "autoLink": "Auto-link",
    "settings.title": "Plugin settings",
    "version.label": "Version",
    "placement.label": "Sidebar entry",
    "placement.effect": "Applies immediately",
    "placement.on": "on",
    "placement.off": "off",
    "placement.hint": "On: a Skills Console entry appears in the sidebar. Off: it only shows under Settings → Skills.",
    "github.open": "Open GitHub repository",
    "status.current": "Up to date",
    "status.update": "Update available",
    "status.local": "Locally modified",
    "status.conflict": "Local + upstream changed",
    "status.deleted": "Removed upstream",
    "status.broken": "Broken link",
    "status.unmanaged": "Untracked",
    "status.unknown": "Not checked",
    "status.off": "Disabled",
    "status.brokenHint": "The link target is missing: relink, or delete and reinstall",
    "adopt.switchHint": "Not tracked yet, cannot be enabled or disabled",
    "adopt.noUpstream": "No upstream source; update checks are unavailable",
    "toast.checked": "Checked",
    "mode.on": "Enabled",
    "mode.off": "Disabled",
    "mode.offHint": "Disabled: DSH cannot see it, other linked agents still can",
    "links.dshGlobal": "dsh (global)",
    "links.required": "required",
    "links.scope": "Scope inside DSH",
    "links.scopeGlobal": "Global (default)",
    "links.scopeProjects": "Only these projects",
    "links.targets": "Link to agents",
    "links.detectedHint": "Only installed agents are listed; deleted agents disappear but their old link records are kept and hidden.",
    "links.canonical": "Skill source: {path}; the entries below are each agent's link target.",
    "links.workspaces": "DSH workspaces",
    "links.noWorkspaces": 'No DSH workspaces yet; use "Choose another folder" below',
    "links.pickDirectory": "Choose another folder…",
    "links.selected": "Other selected folders",
    "links.hint": "Saving only adds or removes links; the skill itself stays where it is.",
    "autoLink.detected": "Auto-link after install",
    "autoLink.none": "No other agents detected on this machine",
    "autoLink.hint": 'dsh (global) is always linked; this only affects future installs. Change existing skills under "Link settings".',
    "empty.skills": "No skills installed yet",
    "empty.skillsHint": 'Run `npx skills add owner/repo` or use "Add skill".',
    "empty.subs": "No subscriptions yet",
    "empty.subsHint": "A subscription only tracks a repository; it installs nothing.",
    "banner.cli": "The local skills tool is unavailable; install and changes are disabled",
    "banner.readonly": "State file is corrupt; the plugin is read-only",
    "banner.visible": "Model-visible skills differ from the local ledger",
    "form.source": "Source (owner/repo or GitHub URL)",
    "form.sourceHint": "e.g. morehao/ai-kit",
    "form.probe": "Detect",
    "form.probing": "Reading…",
    "form.probingHint": "Reading the repository tree…",
    "form.detected": "Found {n} skills; pick the ones to install",
    "form.skipped": "{n} SKILL.md file(s) skipped: missing name/description",
    "form.selectAll": "Select all",
    "form.selectNone": "Clear",
    "form.pickHint": "Enter a source and detect first. Pick one or more when the repo has several.",
    "form.noSkills": "No SKILL.md found; type skill names instead",
    "form.probeFailed": "Detection failed; you can still type names",
    "form.skills": "Skill names (comma separated)",
    "form.ref": "ref (branch / tag, optional)",
    "form.refHint": "empty follows the repository default branch",
    "form.subpath": "Subdirectory (optional)",
    "form.hint": "Downloads into ~/.agents/skills and links agents per the auto-link setting.",
    "form.subHint": "Only records the repository; installs nothing.",
    "subscription.defaultRef": "default branch",
    "confirm.deleteTitle": "Delete skill",
    "confirm.deleteBody": "Removes it locally, disconnects this plugin’s links and calls skills remove. A snapshot stays in trash for 7 days. Your source repo is untouched.",
    "confirm.updateTitle": "Local changes",
    "confirm.updateBody": "Updating overwrites local changes; the old content is backed up and can be rolled back.",
    "error.conflictTitle": "Delete blocked",
    "busy.working": "Working…",
    "meta.from": "from",
    "meta.noUpstream": "no upstream · updates not checked",
    "meta.unlinked": "not linked to any agent",
    "meta.scope": "scope",
    "meta.onlyProject": "only",
    "meta.agentsAll": "Connected agents",
    "meta.none": "none",
    "filter.all": "All",
    "filter.update": "Updates",
    "filter.unknown": "Not checked",
    "filter.off": "Disabled",
    "search.placeholder": "Search skills or agents",
    "search.clear": "Clear",
    "empty.loading": "Loading skills…",
    "empty.filtered": "No matching skills",
    "empty.filteredHint": "Try another keyword, or clear the filters",
    "hint.unknown": "{n} skills have not been checked for updates.",
    "group.dshGlobal": "DSH · global",
    "group.dshProject": "DSH · project only",
    "group.off": "Disabled",
    "group.unlinked": "Not linked",
    installed: "installed",
    notInstalled: "not installed",
    skillCount: "skills",
    visibleOnly: "Visible to the model but not in the local skill library",
    visibleOnlyOther: "DSH can see these, but they are not under ~/.agents/skills",
    visibleOnlyBuiltin: "This plugin only manages skills under ~/.agents/skills; DSH built-in skills are out of scope",
    "builtin.view": "View built-ins ({n})",
    "builtin.hide": "Hide built-ins",
    external: "created outside this plugin",
    "adopt.done": "now tracked"
  }
};
function buildTranslate(locale) {
  const active = () => {
    try {
      return locale?.getLocale?.().active || "zh";
    } catch {
      return "zh";
    }
  };
  return (key) => {
    const id = active();
    const pack = DICT[id] || DICT.zh;
    return pack[key] ?? DICT.zh[key] ?? key;
  };
}

// client/host.js
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var ReactDOM = null;
try {
  ReactDOM = require("react-dom");
} catch {
  ReactDOM = null;
}
function portalize(node) {
  return ReactDOM?.createPortal && typeof document !== "undefined" && document.body ? ReactDOM.createPortal(node, document.body) : node;
}

// client/icons.js
function Logo({ size = 30 }) {
  return h(
    "svg",
    {
      className: "dshsc-logo",
      width: size,
      height: size,
      viewBox: "0 0 64 64",
      "aria-hidden": true
    },
    h(
      "defs",
      null,
      h(
        "linearGradient",
        { id: "dshsc-logo-bg", x1: 6, y1: 2, x2: 58, y2: 62, gradientUnits: "userSpaceOnUse" },
        h("stop", { stopColor: "#3b82f6" }),
        h("stop", { offset: 1, stopColor: "#1d4ed8" })
      )
    ),
    h("rect", { x: 3, y: 3, width: 58, height: 58, rx: 14, fill: "url(#dshsc-logo-bg)" }),
    h("path", {
      d: "M32 32 18 17M32 32 46 17M32 32 32 49",
      stroke: "#ffffff",
      strokeOpacity: 0.55,
      strokeWidth: 2.6,
      strokeLinecap: "round"
    }),
    h("circle", { cx: 18, cy: 17, r: 4.6, fill: "#7ef0c0" }),
    h("circle", { cx: 46, cy: 17, r: 4.6, fill: "#ffffff" }),
    h("circle", { cx: 32, cy: 49, r: 4.6, fill: "#ffffff" }),
    h("rect", { x: 21, y: 21, width: 22, height: 22, rx: 7, fill: "#ffffff" }),
    h("path", {
      d: "M27 32.5l3.6 3.6 6.8-7.4",
      fill: "none",
      stroke: "#1d4ed8",
      strokeWidth: 3,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })
  );
}
function PanelIcon({ size = 16 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("rect", { x: 7.5, y: 7.5, width: 9, height: 9, rx: 3 }),
    h("path", { d: "M9.8 12.1l1.5 1.5 3.1-3.3" }),
    h("path", { d: "M12 7.5V4.8M12 16.5v2.7M7.5 12H4.8", opacity: 0.55 }),
    h("circle", { cx: 12, cy: 4.2, r: 1.1, fill: "currentColor", stroke: "none" }),
    h("circle", { cx: 12, cy: 19.8, r: 1.1, fill: "currentColor", stroke: "none" }),
    h("circle", { cx: 4.2, cy: 12, r: 1.1, fill: "currentColor", stroke: "none" })
  );
}
var NAV_ICON_MARKER = "data-dsh-skills-console-nav-icon";
var NAV_ROW_SELECTOR = '[role="dialog"] nav button';
function navIconMaskSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="7.5" y="7.5" width="9" height="9" rx="3" stroke="#000" stroke-width="1.8"/><path d="M9.8 12.1l1.5 1.5 3.1-3.3" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.5V4.8M12 16.5v2.7M7.5 12H4.8" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".55"/><circle cx="12" cy="4.2" r="1.1" fill="#000"/><circle cx="12" cy="19.8" r="1.1" fill="#000"/><circle cx="4.2" cy="12" r="1.1" fill="#000"/></svg>';
}
function navIconMaskUrl() {
  return `data:image/svg+xml,${encodeURIComponent(navIconMaskSvg())}`;
}
function navIconCss(maskUrl) {
  return [
    `[${NAV_ICON_MARKER}] > svg { display: none; }`,
    `[${NAV_ICON_MARKER}]::before {`,
    "  content: '';",
    "  flex: none;",
    "  width: 16px;",
    "  height: 16px;",
    "  background-color: currentColor;",
    `  -webkit-mask-image: url("${maskUrl}");`,
    `  mask-image: url("${maskUrl}");`,
    "  -webkit-mask-repeat: no-repeat;",
    "  mask-repeat: no-repeat;",
    "  -webkit-mask-position: center;",
    "  mask-position: center;",
    "  -webkit-mask-size: 16px 16px;",
    "  mask-size: 16px 16px;",
    "}"
  ].join("\n");
}
function isOwnNavRow(rowText, wantedLabel) {
  const wanted = String(wantedLabel ?? "").trim();
  if (wanted.length === 0) return false;
  return String(rowText ?? "").trim() === wanted;
}
function installSettingsNavIcon(ctx, resolveLabel) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@morehao/dsh-skills-console";
    tag.dataset.pluginCss = "dsh-skills-console/settings-nav-icon";
    tag.textContent = navIconCss(navIconMaskUrl());
    document.head.appendChild(tag);
    let disposed = false;
    let scheduled = false;
    const sync = () => {
      scheduled = false;
      if (disposed) return;
      const wanted = resolveLabel();
      for (const row of document.querySelectorAll(NAV_ROW_SELECTOR)) {
        if (isOwnNavRow(row.textContent, wanted)) row.setAttribute(NAV_ICON_MARKER, "");
        else row.removeAttribute(NAV_ICON_MARKER);
      }
    };
    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      if (typeof queueMicrotask === "function") queueMicrotask(sync);
      else Promise.resolve().then(sync);
    };
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      disposed = true;
      observer.disconnect();
      for (const row of document.querySelectorAll(`[${NAV_ICON_MARKER}]`)) row.removeAttribute(NAV_ICON_MARKER);
      tag.remove();
    };
  }, "dsh-skills-console: settings nav icon");
}
function GitHubIcon({ size = 16 }) {
  return h("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    style: { display: "block" }
  }, h("path", {
    d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
  }));
}
function GearIcon({ size = 13 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("circle", { cx: 12, cy: 12, r: 3.1 }),
    h("path", {
      d: "M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
    })
  );
}
function TrashIcon({ size = 14 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("path", { d: "M4 7h16" }),
    h("path", { d: "M9 7V5h6v2" }),
    h("path", { d: "M6.5 7l1 13h9l1-13" }),
    h("path", { d: "M10 11v5.5M14 11v5.5" })
  );
}
function InfoIcon({ size = 13 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("circle", { cx: 12, cy: 12, r: 9 }),
    h("path", { d: "M12 11v5" }),
    h("path", { d: "M12 8h.01" })
  );
}
function RefreshIcon({ size = 14 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("path", { d: "M20 12a8 8 0 1 1-2.34-5.66" }),
    h("path", { d: "M20 4v5h-5" })
  );
}
function CaretIcon({ open }) {
  return h("svg", {
    width: 10,
    height: 10,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    style: { display: "block", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s ease" }
  }, h("path", { d: "M8 5l11 7-11 7z" }));
}
function SearchIcon({ size = 13 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("circle", { cx: 11, cy: 11, r: 6.4 }),
    h("path", { d: "M16 16l4.3 4.3" })
  );
}

// client/section.js
var import_react4 = __toESM(require("react"), 1);

// client/styles.js
var CSS = `
  /* 主面板形态：与 DSH 自带管理页同一边距/滚动方式 */
  .dshsc-page { box-sizing: border-box; width: 100%; height: 100%; overflow: auto;
    padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) clamp(24px, 4vw, 48px) 48px; }
  .dshsc-page .dshsc-root { max-width: 980px; margin: 0 auto; }
  .dshsc-page .dshsc-title { font-size: 20px; font-weight: 500; line-height: 28px; }
  .dshsc-page .dshsc-sub { font-size: 13px; line-height: 20px; }
  .dshsc-root { display: flex; flex-direction: column; gap: 14px; color: var(--dsw-alias-label-primary);
    container-type: inline-size; container-name: dshsc; }
  .dshsc-head { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
  .dshsc-heading { display: flex; align-items: flex-start; gap: 10px; min-width: 0; flex: 1; }
  .dshsc-heading-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dshsc-logo { flex: none; display: block; border-radius: 8px; }
  .dshsc-title { font-size: 17px; font-weight: 600; letter-spacing: -.01em; margin: 0; }
  .dshsc-sub { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; max-width: 64ch; }
  .dshsc-spacer { flex: 1; }
  .dshsc-head-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
  .dshsc-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }

  /* 身份：包名 + 版本合成一枚低调 chip，不再各占一段 */
  .dshsc-id { display: inline-flex; align-items: center; gap: 6px; min-width: 0; height: 22px; padding: 0 7px;
    border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); }
  .dshsc-pkg { font-size: 11px; line-height: 1; color: var(--dsw-alias-label-tertiary); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace); }
  .dshsc-idsep { flex: none; font-size: 10px; color: var(--dsw-alias-border-l3); }
  .dshsc-ver { flex: none; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

  /* 插件级工具（设置 / GitHub）：跟在身份胶囊后面，用细线分组；鬼影按钮不和业务按钮抢权重 */
  .dshsc-tools { display: inline-flex; align-items: center; gap: 2px; flex: none; margin-left: 2px;
    padding-left: 9px; border-left: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-tool { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
    width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent;
    color: var(--dsw-alias-label-secondary); cursor: pointer; text-decoration: none;
    transition: background .12s ease, color .12s ease; }
  .dshsc-tool:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-tool:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
  .dshsc-tool[aria-expanded="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-settings { position: relative; display: inline-flex; }
  /* 设置面板留在 Host 对话框内（焦点陷阱 / 层级都跟着走）；开启时按左右余量选边和宽度 */
  .dshsc-pop { position: absolute; top: calc(100% + 8px); z-index: 30; box-sizing: border-box;
    max-width: calc(100vw - 16px); max-height: calc(100vh - 24px); overflow: auto;
    display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px;
    border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, .35); }
  .dshsc-pop-title { font-size: 11px; letter-spacing: .06em; color: var(--dsw-alias-label-tertiary); }
  .dshsc-pop-label { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    font-size: 12px; color: var(--dsw-alias-label-primary); }
  .dshsc-pop-label em { font-style: normal; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-pop-name { display: inline-flex; align-items: baseline; gap: 6px; }
  .dshsc-pop-hint { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }

  .dshsc-btn { font: inherit; font-size: 12px; line-height: 1; padding: 7px 11px; border-radius: 8px; cursor: pointer;
    white-space: nowrap;
    border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
    transition: background .12s ease, border-color .12s ease, color .12s ease; }
  /* 页头动作按钮：显式同高（border-box），文案换行 / 字体回退都不会让其中一个变高 */
  .dshsc-head-actions .dshsc-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
    height: 28px; padding: 0 11px; }
  .dshsc-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
  .dshsc-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-btn:disabled { opacity: .42; cursor: not-allowed; }
  /* brand-primary 与 bg-base 在明暗主题里互为反色：文字用 bg-base 才不会是白底白字 */
  .dshsc-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); font-weight: 600; }
  .dshsc-btn.primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); opacity: .9; }
  .dshsc-btn.tint { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); border-color: transparent;
    color: var(--dsw-alias-brand-primary); font-weight: 500; }
  .dshsc-btn.tint:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
  .dshsc-btn.ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); padding: 6px 8px; }
  .dshsc-btn.ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-btn.ghost.danger { color: var(--dsw-alias-state-error-primary); }
  .dshsc-btn.ghost.danger:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
  .dshsc-btn.ghost.dshsc-update { color: var(--dsw-alias-brand-primary); }
  .dshsc-btn.ghost.dshsc-update:hover:not(:disabled) { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }

  .dshsc-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dshsc-tabs { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 9px; background: var(--dsw-alias-bg-layer-1); }
  .dshsc-tab { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; padding: 5px 10px;
    border: 0; border-radius: 7px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
  .dshsc-tab:hover { color: var(--dsw-alias-label-primary); }
  .dshsc-tab.active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
    box-shadow: 0 0 0 1px var(--dsw-alias-border-l1), 0 1px 2px rgba(0,0,0,.12); }
  .dshsc-tab .n { min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 999px;
    background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary);
    font-size: 10px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
  .dshsc-tab.active .n { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); }

  .dshsc-search { position: relative; display: inline-flex; align-items: center; }
  .dshsc-search > svg { position: absolute; left: 8px; pointer-events: none; color: var(--dsw-alias-label-tertiary); }
  .dshsc-search input { box-sizing: border-box; width: 210px; height: 30px; padding: 0 27px 0 27px;
    border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; outline: none; }
  .dshsc-search input::placeholder { color: var(--dsw-alias-label-tertiary); }
  .dshsc-search input:focus { border-color: var(--dsw-alias-brand-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
  .dshsc-search input::-webkit-search-cancel-button { display: none; }
  .dshsc-search-clear { position: absolute; right: 4px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 13px; line-height: 1; }
  .dshsc-search-clear:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

  .dshsc-segment { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
    background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
  .dshsc-segment .dshsc-btn { display: inline-flex; align-items: center; height: 28px; border: 0; border-radius: 0;
    background: transparent; padding: 0 10px; font-size: 11.5px; }
  .dshsc-segment .dshsc-btn + .dshsc-btn { border-left: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-segment .dshsc-btn[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

  .dshsc-listbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dshsc-filters { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
  .dshsc-fchip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border: 1px solid transparent;
    border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px;
    cursor: pointer; white-space: nowrap; }
  .dshsc-fchip:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-fchip.active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
  .dshsc-fchip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-fchip .n { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
  .dshsc-fchip.active .n { color: var(--dsw-alias-label-secondary); }
  .dshsc-fdot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-state-warn-primary); flex: none; }
  .dshsc-listbar-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .dshsc-listbar .dshsc-btn { display: inline-flex; align-items: center; height: 26px; padding: 0 9px; font-size: 11.5px; }

  .dshsc-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
  .dshsc-row { display: grid; grid-template-columns: 300px minmax(0, 1fr) 218px; gap: 14px; align-items: center;
    padding: 8px 12px 8px 14px; min-height: 54px; border-top: 1px solid var(--dsw-alias-border-l1);
    transition: background .12s ease; }
  .dshsc-list > .dshsc-row:first-child { border-top: 0; }
  .dshsc-row:hover { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 48%, transparent); }
  .dshsc-row.off { opacity: .7; }
  .dshsc-cell { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .dshsc-namerow { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .dshsc-name { font-size: 13px; font-weight: 600; letter-spacing: -.005em; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dshsc-src { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 11.5px; line-height: 16px;
    color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dshsc-src .dshsc-code { color: var(--dsw-alias-label-secondary); font-size: 11px; }
  .dshsc-note { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
  .dshsc-note.warn { color: var(--dsw-alias-state-warn-primary); }

  .dshsc-tag { display: inline-flex; align-items: center; gap: 3px; flex: none; height: 18px; padding: 0 6px;
    border-radius: 5px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
    font-size: 10.5px; line-height: 1; white-space: nowrap; }
  .dshsc-tag.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent); color: var(--dsw-alias-state-success-primary); }
  .dshsc-tag.warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 13%, transparent); color: var(--dsw-alias-state-warn-primary); }
  .dshsc-tag.err { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent); color: var(--dsw-alias-state-error-primary); }
  .dshsc-tag.off { color: var(--dsw-alias-label-tertiary); }

  .dshsc-agents { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
  .dshsc-agent { display: inline-flex; align-items: center; gap: 5px; flex: none; height: 20px; padding: 0 7px;
    border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; color: var(--dsw-alias-label-secondary);
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, transparent); font-size: 11px; white-space: nowrap; }
  .dshsc-agent.dsh { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, var(--dsw-alias-border-l1));
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
  .dshsc-agent .dshsc-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .8; }
  .dshsc-agent.more, .dshsc-agent.scope { border-style: dashed; background: transparent; color: var(--dsw-alias-label-tertiary); }
  .dshsc-agent.more { margin: 0; font: inherit; font-size: 11px; line-height: 1; cursor: pointer;
    -webkit-appearance: none; appearance: none; }
  .dshsc-agent.more:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-tertiary); }
  .dshsc-agent.more[aria-expanded="true"] { color: var(--dsw-alias-label-primary);
    border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); }
  .dshsc-agent.more:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
  .dshsc-unlinked { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }

  /* “+n” 的悬浮气泡：portal 到 body + fixed 定位，列表的 overflow:hidden 裁不到 */
  .dshsc-agenttip { position: fixed; z-index: 10000; box-sizing: border-box; width: max-content;
    max-width: min(340px, calc(100vw - 24px)); padding: 9px 10px; display: flex; flex-direction: column; gap: 7px;
    border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, .32), 0 2px 6px rgba(0, 0, 0, .18); pointer-events: none; }
  .dshsc-agenttip-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-agenttip-n { min-width: 16px; height: 15px; padding: 0 5px; box-sizing: border-box; border-radius: 999px;
    background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 20%, transparent);
    color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 15px; text-align: center;
    font-variant-numeric: tabular-nums; }
  .dshsc-agenttip-list { display: flex; flex-wrap: wrap; gap: 4px; }

  .dshsc-row .dshsc-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; flex-wrap: nowrap; }
  .dshsc-row .dshsc-btn { display: inline-flex; align-items: center; justify-content: center; height: 24px;
    padding: 0 7px; font-size: 11.5px; border-radius: 6px; }
  /* 行内图标按钮：删除 / 检查更新 24–26px；页头工具入口见 .dshsc-tool */
  .dshsc-btn.sq { box-sizing: border-box; width: 24px; padding: 0; justify-content: center; }
  .dshsc-btn.sq svg { display: block; }
  .dshsc-listbar .dshsc-btn.sq { width: 26px; padding: 0; }
  .dshsc-sub-row .dshsc-btn.sq { width: 24px; padding: 0; }

  .dshsc-groupstack { display: flex; flex-direction: column; gap: 12px; }
  .dshsc-group-head { display: flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid var(--dsw-alias-border-l1);
    border-bottom: 0; border-radius: 10px 10px 0 0; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 48%, transparent);
    font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-primary); }
  .dshsc-group-head + .dshsc-list { border-radius: 0 0 10px 10px; }
  .dshsc-group-head .n { min-width: 16px; height: 15px; padding: 0 5px; box-sizing: border-box; border-radius: 999px;
    background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 20%, transparent); color: var(--dsw-alias-label-secondary);
    font-size: 10px; line-height: 15px; text-align: center; font-weight: 500; font-variant-numeric: tabular-nums; }
  .dshsc-gdot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-brand-primary); opacity: .8; flex: none; }

  /* 说明会是一整句，窄面板必然折行：图标单独成列并贴住首行，正文列负责换行，避免图标被挤成孤行 */
  .dshsc-notice { display: flex; flex-direction: column; font-size: 11.5px;
    color: var(--dsw-alias-label-tertiary); line-height: 1.5; }
  .dshsc-notice-row { display: flex; align-items: flex-start; gap: 6px; }
  .dshsc-notice-row > svg { flex: none; margin-top: 2px; }
  .dshsc-notice-text { flex: 1 1 auto; min-width: 0; color: var(--dsw-alias-label-secondary); }
  .dshsc-notice-text .dshsc-linkbtn { margin-left: 2px; white-space: nowrap; }
  .dshsc-linkbtn { border: 0; background: none; padding: 0 2px; font: inherit; font-size: 11.5px;
    color: var(--dsw-alias-brand-primary); cursor: pointer; }
  .dshsc-linkbtn:hover { text-decoration: underline; }
  .dshsc-linkbtn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 4px; }
  .dshsc-notice-list { margin: 4px 0 0 19px; padding: 7px 10px; border-radius: 8px;
    border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.7; }
  .dshsc-empty { text-align: center; padding: 30px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px;
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent); }
  .dshsc-empty .dshsc-name { font-size: 14px; }
  .dshsc-empty .dshsc-meta { justify-content: center; margin-top: 6px; }
  .dshsc-meta { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); display: flex; flex-wrap: wrap; }

  .dshsc-banner { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 9px 12px; font-size: 12px;
    line-height: 1.55; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dshsc-banner.err { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
  .dshsc-banner.warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); }

  .dshsc-sub-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 52px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-sub-block:first-child .dshsc-sub-row { border-top: 0; }
  .dshsc-sub-block + .dshsc-sub-block { border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-caret { flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent;
    color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
  .dshsc-caret:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-caret:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-sub-row .dshsc-name { font-size: 12.5px; }
  .dshsc-substat { font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
  .dshsc-sub-row .dshsc-actions { margin-left: auto; display: flex; align-items: center; gap: 2px; }
  .dshsc-sub-row .dshsc-btn { height: 24px; padding: 0 7px; font-size: 11.5px; display: inline-flex; align-items: center; }
  .dshsc-sub-list { display: flex; flex-direction: column; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 22%, transparent); }
  .dshsc-sub-entry { display: flex; align-items: center; gap: 8px;
    font-size: 12px; padding: 6px 12px 6px 44px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-sub-entry:first-child { border-top: 0; }
  .dshsc-sub-entry .dshsc-name { font-size: 12px; font-weight: 500; }
  .dshsc-state { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-state.ok svg { color: var(--dsw-alias-state-success-primary); }
  .dshsc-sub-entry .dshsc-actions { margin-left: auto; display: flex; justify-content: flex-end; }
  .dshsc-sub-entry .dshsc-btn { height: 24px; padding: 0 9px; font-size: 11.5px; }
  /* 设置页的真实宽度常常远小于窗口（侧栏 + 页面缩放），视口 media query 不可靠；
     以 .dshsc-root 自身宽度为准，窄面板时切两列，避免固定列把 Agent 标签挤成竖排。 */
  @container dshsc (max-width: 900px) {
    .dshsc-head-actions { width: 100%; justify-content: flex-end; }
    .dshsc-search input { width: 180px; }
    .dshsc-row { grid-template-columns: minmax(0, 1fr) 196px; row-gap: 3px; padding: 9px 12px; }
    .dshsc-cell { grid-column: 1; }
    .dshsc-agents { grid-column: 1; }
    .dshsc-row .dshsc-actions { grid-column: 2; grid-row: 1 / span 2; }
    .dshsc-row .dshsc-btn { padding: 0 5px; }
  }
  /* 窄面板里工具组会换到下一行，行首的分割线就没有意义了 */
  @container dshsc (max-width: 520px) {
    .dshsc-tools { border-left: 0; padding-left: 0; margin-left: 0; }
  }
  .dshsc-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

  /* 与 DSH 自带开关同尺寸/同 token：关是 border-l3 轨道，开是 brand-primary 轨道 */
  .dshsc-switch { box-sizing: border-box; position: relative; flex: none; width: 36px; height: 20px; padding: 2px;
    border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer;
    transition: background .14s ease; }
  .dshsc-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-switch:disabled { cursor: not-allowed; opacity: .5; }
  .dshsc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
  .dshsc-knob { display: block; width: 16px; height: 16px; border-radius: 50%;
    background: var(--dsw-alias-switch-thumb); box-shadow: 0 1px 2px rgba(0, 0, 0, .28);
    transition: transform .12s ease, background .12s ease; }
  .dshsc-switch[aria-checked="true"] .dshsc-knob { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }

  .dshsc-overlay { position: fixed; inset: 0; background: rgba(4,6,9,.55); display: flex; align-items: center; justify-content: center;
    z-index: 60; padding: 20px; backdrop-filter: blur(2px); }
  .dshsc-modal { position: relative; width: min(600px, 100%); max-height: calc(100vh - 40px); overflow: auto;
    background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
    padding: 18px; display: flex; flex-direction: column; gap: 14px;
    box-shadow: 0 20px 56px rgba(0,0,0,.38), 0 2px 8px rgba(0,0,0,.18); }
  /* 64ch 是主页面长文的舒适行长；弹窗说明只有一两句，用满弹窗宽度，避免没必要的折行 */
  .dshsc-modal .dshsc-sub { max-width: none; }
  .dshsc-modal h3 { margin: 0; font-size: 15px; font-weight: 600; padding-right: 26px; }
  .dshsc-modal-close { position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; border: 0; border-radius: 7px;
    background: transparent; color: var(--dsw-alias-label-secondary); font-size: 18px; line-height: 1; cursor: pointer; }
  .dshsc-modal-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

  .dshsc-group { margin: 2px 0 -2px; font-size: 11px; font-weight: 600; letter-spacing: .02em;
    color: var(--dsw-alias-label-secondary); }
  .dshsc-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
  .dshsc-field input { font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; }
  .dshsc-field input:focus { border-color: var(--dsw-alias-brand-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
  /* 来源输入 + 检测按钮同一行；输入框吃掉剩余宽度，按钮不被挤压 */
  .dshsc-inline { display: flex; gap: 6px; align-items: stretch; }
  .dshsc-inline input { flex: 1; min-width: 0; }
  .dshsc-inline .dshsc-btn { flex: none; }

  .dshsc-check { display: flex; align-items: center; gap: 9px; font-size: 13px; padding: 5px 8px; border-radius: 8px; cursor: pointer; }
  .dshsc-check:hover { background: var(--dsw-alias-bg-layer-1); }
  .dshsc-check input[type="checkbox"], .dshsc-check input[type="radio"] { appearance: none; -webkit-appearance: none;
    flex: none; position: relative; width: 15px; height: 15px; margin: 0; border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 4px; background: var(--dsw-alias-bg-layer-1); cursor: pointer; }
  .dshsc-check input[type="radio"] { border-radius: 50%; }
  .dshsc-check input[type="checkbox"]:checked { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
  /* 选中用反色圆点：品牌色可能是白色，白勾会消失 */
  .dshsc-check input[type="checkbox"]:checked::after { content: ''; position: absolute; left: 50%; top: 50%;
    width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-bg-base);
    transform: translate(-50%, -50%); }
  .dshsc-check input[type="radio"]:checked { border: 5px solid var(--dsw-alias-brand-primary); }
  .dshsc-check input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-check input:disabled { opacity: .55; cursor: not-allowed; }
  .dshsc-check small { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dshsc-check span { white-space: nowrap; }
  /* 添加技能：每个技能一行，名字 + 两行描述 + 路径；描述太长时截断，不把弹窗撑高 */
  .dshsc-skill { align-items: flex-start; }
  .dshsc-skill input[type="checkbox"] { margin-top: 3px; }
  .dshsc-skill-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .dshsc-skill-name { font-weight: 600; }
  .dshsc-check .dshsc-skill-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; white-space: normal; line-height: 1.4; }
  .dshsc-check .dshsc-skill-path { font-size: 11px; opacity: .75; }

  .dshsc-panel { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1);
    padding: 4px; max-height: 300px; overflow: auto; display: flex; flex-direction: column; }
  .dshsc-panel .dshsc-check:hover { background: var(--dsw-alias-bg-layer-2); }

  .dshsc-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-toast { position: fixed; right: 18px; bottom: 18px; z-index: 70; font-size: 12px; padding: 10px 13px; border-radius: 9px;
    background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2);
    box-shadow: 0 8px 24px rgba(0,0,0,.22); max-width: 420px; }
  .dshsc-toast.err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
  .dshsc-toast.ok { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, var(--dsw-alias-border-l2)); }
`;

// client/actions.js
function useSkillActions({ t, rows, reload, run, setBusy, setToast, setModal }) {
  async function adopt(row) {
    await run(`adopt:${row.name}`, async () => {
      const result = await apiCall("POST", `/skills/${encodeURIComponent(row.name)}/adopt`, {});
      setToast({ kind: "ok", text: `${row.name} · ${result.tracked ? t("adopt.done") : t("adopt.noUpstream")}` });
      return result;
    });
  }
  async function toggleMode(row) {
    const mode = row.mode === "on" ? "off" : "on";
    await run(`mode:${row.name}`, () => apiCall("POST", `/skills/${encodeURIComponent(row.name)}/mode`, { mode }));
  }
  async function updateOne(row, overwrite) {
    await run(`update:${row.name}`, async () => {
      const result = await apiCall("POST", "/updates/apply", { name: row.name, overwrite });
      setToast({ kind: "ok", text: `${row.name} → ${short(result.toCommit) || "latest"}` });
      return result;
    });
  }
  function requestUpdate(row) {
    if (row.status === "locally-modified" || row.status === "conflict") {
      setModal({
        type: "confirm-update",
        row,
        onConfirm: () => {
          setModal(null);
          void updateOne(row, true);
        }
      });
      return;
    }
    void updateOne(row, false);
  }
  async function updateAll() {
    const pending = rows.filter((row) => row.status === "update-available");
    for (const row of pending) {
      try {
        await run(`update:${row.name}`, () => apiCall("POST", "/updates/apply", { name: row.name }));
      } catch {
      }
    }
    setToast({ kind: "ok", text: t("action.updateAll") });
  }
  async function checkUpdates() {
    await run("check", async () => {
      const result = await apiCall("POST", "/updates/check", {});
      setToast({ kind: "ok", text: `${t("toast.checked")} · ${result.checks.length}` });
    });
  }
  function requestDelete(row) {
    setModal({
      type: "confirm-delete",
      row,
      onConfirm: async () => {
        setModal(null);
        setBusy(`delete:${row.name}`);
        try {
          await apiCall("DELETE", `/skills/${encodeURIComponent(row.name)}`);
          setToast({ kind: "ok", text: `${row.name} · ${t("action.delete")} ✓` });
          await reload();
        } catch (err) {
          if (err.code === "error.skills.remove-conflict") {
            setModal({ type: "conflict", row, detail: err.detail, message: err.message });
          } else {
            setToast({ kind: "err", text: err.message });
          }
        } finally {
          setBusy(null);
        }
      }
    });
  }
  async function saveLinks(row, targets, scopeProjects) {
    const current = new Set(row.links.map((link) => link.target));
    const desired = new Set(scopeProjects.length > 0 ? targets.filter((target) => target !== "dsh-global") : targets);
    const toRemove = [...current].filter((target) => !desired.has(target));
    await run(`links:${row.name}`, async () => {
      if (toRemove.length > 0) {
        await apiCall("POST", "/links", { skill: row.name, targets: toRemove, action: "remove" });
      }
      await apiCall("POST", "/links", { skill: row.name, targets: [...desired], action: "add", scopeProjects });
    });
    setToast({ kind: "ok", text: `${row.name} · ${t("action.links")} ✓` });
  }
  function requestAddSkill() {
    setModal({ type: "add-skill" });
  }
  function requestAddSubscription() {
    setModal({ type: "add-subscription" });
  }
  async function probeSkills(source) {
    return apiCall("POST", "/probe", { source: String(source || "").trim() });
  }
  async function installSkills({ source, skills }) {
    setModal(null);
    await run("install", async () => {
      const result = await apiCall("POST", "/install", { source: String(source || "").trim(), skills });
      const warnings = result.warnings?.length || 0;
      setToast({
        kind: warnings ? "err" : "ok",
        text: `${result.installed?.length || 0} ${t("skillCount")}${warnings ? ` · ${warnings} 条提示` : ""}`
      });
    });
  }
  async function addSubscription(form) {
    setModal(null);
    await run("subscribe", async () => {
      const result = await apiCall("POST", "/subscriptions", {
        source: form.source.trim(),
        ref: form.ref.trim() || void 0,
        subpath: form.subpath.trim() || void 0
      });
      setToast({ kind: "ok", text: result.subscription?.source || form.source });
    });
  }
  async function refreshSubscription(row) {
    await run(`refresh:${row.id}`, async () => {
      const result = await apiCall("POST", `/subscriptions/${encodeURIComponent(row.id)}/refresh`, {});
      setToast({ kind: "ok", text: `${row.source} · ${result.changed ? "snapshot updated" : "unchanged"}` });
    });
  }
  async function deleteSubscription(row) {
    await run(`unsubscribe:${row.id}`, async () => {
      await apiCall("DELETE", `/subscriptions/${encodeURIComponent(row.id)}`, { keepInstalled: true });
      setToast({ kind: "ok", text: `${row.source} · ${t("action.delete")} ✓` });
    });
  }
  async function installFromSubscription(subscription, entry) {
    await run(`install:${entry.name}`, async () => {
      await apiCall("POST", "/install", { subscriptionId: subscription.id, skills: [entry.name] });
      setToast({ kind: "ok", text: `${entry.name} ✓` });
    });
  }
  return {
    adopt,
    toggleMode,
    requestUpdate,
    updateAll,
    checkUpdates,
    requestDelete,
    saveLinks,
    requestAddSkill,
    requestAddSubscription,
    probeSkills,
    installSkills,
    addSubscription,
    refreshSubscription,
    deleteSubscription,
    installFromSubscription
  };
}

// client/hooks.js
var import_react2 = __toESM(require("react"), 1);
var TOAST_MS = 4200;
function useSkillsData() {
  const [data, setData] = import_react2.default.useState(null);
  const [error, setError] = import_react2.default.useState(null);
  const [busy, setBusy] = import_react2.default.useState(null);
  const [toast, setToast] = import_react2.default.useState(null);
  const reload = import_react2.default.useCallback(async () => {
    try {
      const next = await apiCall("GET", "/state");
      setData(next);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);
  import_react2.default.useEffect(() => {
    void reload();
  }, [reload]);
  import_react2.default.useEffect(() => {
    if (!toast) return void 0;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const run = import_react2.default.useCallback(
    async (label, task) => {
      setBusy(label);
      try {
        const result = await task();
        await reload();
        return result;
      } catch (err) {
        setToast({ kind: "err", text: err.message });
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [reload]
  );
  return { data, error, busy, toast, setToast, setBusy, reload, run };
}
function useSettingsPopover() {
  const [settingsOpen, setSettingsOpen] = import_react2.default.useState(false);
  const settingsRef = import_react2.default.useRef(null);
  const [settingsPlacement, setSettingsPlacement] = import_react2.default.useState({ side: "left", width: 286 });
  import_react2.default.useEffect(() => {
    if (!settingsOpen || typeof document === "undefined") return void 0;
    const close = () => setSettingsOpen(false);
    const onPointerDown = (event) => {
      const target = event?.target;
      if (target && typeof target.closest === "function" && (target.closest(".dshsc-settings") || target.closest(".dshsc-pop"))) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event?.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [settingsOpen]);
  function toggleSettings() {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    const anchor = settingsRef.current;
    if (anchor && typeof window !== "undefined") {
      const rect = anchor.getBoundingClientRect();
      const root = typeof anchor.closest === "function" ? anchor.closest(".dshsc-root") : null;
      const rootRect = root ? root.getBoundingClientRect() : { left: 8, right: window.innerWidth - 8 };
      const spaceRight = rootRect.right - rect.left;
      const spaceLeft = rect.right - rootRect.left;
      const side = spaceRight >= spaceLeft ? "right" : "left";
      const width = Math.max(180, Math.min(286, (side === "right" ? spaceRight : spaceLeft) - 8));
      setSettingsPlacement({ side, width });
    }
    setSettingsOpen(true);
  }
  return { settingsOpen, settingsRef, settingsPlacement, closeSettings: () => setSettingsOpen(false), toggleSettings };
}
function useAgentTip() {
  const [agentTip, setAgentTip] = import_react2.default.useState(null);
  const [agentTipPos, setAgentTipPos] = import_react2.default.useState(null);
  const agentTipRef = import_react2.default.useRef(null);
  import_react2.default.useEffect(() => {
    if (!agentTip) return void 0;
    const close = () => {
      setAgentTip(null);
      setAgentTipPos(null);
    };
    const onPointerDown = (event) => {
      if (agentTip.anchor && event?.target === agentTip.anchor) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event?.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (typeof document !== "undefined") {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
      }
    };
  }, [agentTip]);
  import_react2.default.useLayoutEffect(() => {
    if (!agentTip || typeof window === "undefined") return;
    const node = agentTipRef.current;
    if (!node) return;
    const width = node.offsetWidth || 0;
    const height = node.offsetHeight || 0;
    const { left, right, top, bottom } = agentTip.rect;
    const nextLeft = Math.max(8, Math.min(left + (right - left) / 2 - width / 2, window.innerWidth - width - 8));
    let nextTop = bottom + 6;
    if (nextTop + height > window.innerHeight - 8) nextTop = Math.max(8, top - height - 6);
    setAgentTipPos({ left: nextLeft, top: nextTop });
  }, [agentTip]);
  function openAgentTip(event, rowName, labels) {
    if (agentTip?.rowName === rowName) return;
    const anchor = event?.currentTarget;
    if (!anchor || typeof anchor.getBoundingClientRect !== "function") return;
    const rect = anchor.getBoundingClientRect();
    setAgentTipPos(null);
    setAgentTip({
      anchor,
      rowName,
      labels,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    });
  }
  function closeAgentTip() {
    setAgentTip(null);
    setAgentTipPos(null);
  }
  return { agentTip, agentTipPos, agentTipRef, openAgentTip, closeAgentTip };
}

// client/views/header.js
function Header({
  t,
  page,
  plugin,
  writable,
  autoLinkLabel,
  autoLinkCount,
  tab,
  settingsOpen,
  settingsRef,
  settingsPlacement,
  placement,
  placementBusy,
  readOnly,
  onToggleSettings,
  onChangePlacement,
  onOpenAutoLink,
  onAddSkill,
  onAddSubscription
}) {
  const headTools = h(
    "div",
    { className: "dshsc-tools" },
    // 先源码、后设置：GitHub 紧挨包名，齿轮留在工具组最外侧
    h("a", {
      className: "dshsc-tool",
      href: GITHUB_URL,
      target: "_blank",
      rel: "noopener noreferrer",
      title: t("github.open"),
      "aria-label": t("github.open")
    }, h(GitHubIcon, { size: 15 })),
    h(
      "div",
      { className: "dshsc-settings" },
      h("button", {
        ref: settingsRef,
        className: "dshsc-tool",
        "aria-haspopup": "dialog",
        "aria-expanded": String(settingsOpen),
        type: "button",
        "aria-label": t("settings.title"),
        title: t("settings.title"),
        onClick: onToggleSettings
      }, h(GearIcon, { size: 15 })),
      settingsOpen ? h(
        "div",
        {
          className: "dshsc-pop",
          role: "dialog",
          "aria-label": t("settings.title"),
          style: settingsPlacement.side === "right" ? { left: 0, width: `${settingsPlacement.width}px` } : { right: 0, width: `${settingsPlacement.width}px` }
        },
        h("div", { className: "dshsc-pop-title" }, t("settings.title")),
        h(
          "div",
          { className: "dshsc-pop-label" },
          h(
            "span",
            { className: "dshsc-pop-name" },
            t("placement.label"),
            h("em", null, t("placement.effect"))
          ),
          h("button", {
            className: "dshsc-switch",
            role: "switch",
            "aria-checked": String(placement === "sidebar"),
            "aria-label": `${t("placement.label")}：${placement === "sidebar" ? t("placement.on") : t("placement.off")}`,
            title: t("placement.hint"),
            disabled: Boolean(placementBusy) || readOnly,
            onClick: () => void onChangePlacement(placement === "sidebar" ? "settings" : "sidebar")
          }, h("span", { className: "dshsc-knob" }))
        ),
        h("div", { className: "dshsc-pop-hint" }, t("placement.hint"))
      ) : null
    )
  );
  return h(
    "div",
    { className: "dshsc-head" },
    h(
      "div",
      { className: "dshsc-heading" },
      h(Logo, { size: page ? 36 : 30 }),
      h(
        "div",
        { className: "dshsc-heading-text" },
        h(
          "div",
          { className: "dshsc-title-row" },
          h("h2", { className: "dshsc-title" }, page ? t("page.title") : t("section.title")),
          // 身份：包名 + 版本合成一枚低调 chip，由 Host 从 package.json 注入
          plugin?.name ? h(
            "span",
            { className: "dshsc-id" },
            h("span", { className: "dshsc-pkg" }, plugin.name),
            plugin.version ? h("span", { className: "dshsc-idsep" }, "|") : null,
            plugin.version ? h(
              "span",
              { className: "dshsc-ver", title: `${t("version.label")} v${plugin.version}` },
              `v${plugin.version}`
            ) : null
          ) : null,
          headTools
        ),
        h("p", { className: "dshsc-sub" }, t("section.subtitle"))
      )
    ),
    // 右侧只留业务动作；主按钮仍在最右
    h(
      "div",
      { className: "dshsc-head-actions" },
      h("button", {
        className: "dshsc-btn",
        disabled: !writable,
        title: `${t("autoLink")}：${autoLinkLabel}`,
        "aria-label": `${t("autoLink")}：${autoLinkLabel}`,
        onClick: onOpenAutoLink
      }, `${t("autoLink")} · ${autoLinkCount} ▾`),
      h("button", {
        className: "dshsc-btn primary",
        disabled: !writable,
        onClick: tab === "installed" ? onAddSkill : onAddSubscription
      }, tab === "installed" ? t("action.addSkill") : t("action.addSubscription"))
    )
  );
}

// client/views/toolbar.js
function Toolbar({
  t,
  tab,
  onTabChange,
  installedCount,
  subscriptionCount,
  query,
  onQueryChange,
  view,
  onViewChange
}) {
  return h(
    "div",
    { className: "dshsc-toolbar" },
    h(
      "div",
      { className: "dshsc-tabs" },
      h(
        "button",
        { className: `dshsc-tab${tab === "installed" ? " active" : ""}`, onClick: () => onTabChange("installed") },
        h("span", null, t("tab.installed")),
        h("span", { className: "n" }, installedCount)
      ),
      h(
        "button",
        { className: `dshsc-tab${tab === "subscriptions" ? " active" : ""}`, onClick: () => onTabChange("subscriptions") },
        h("span", null, t("tab.subscriptions")),
        h("span", { className: "n" }, subscriptionCount)
      )
    ),
    h("div", { className: "dshsc-spacer" }),
    tab === "installed" ? [
      h(
        "div",
        { key: "search", className: "dshsc-search" },
        h(SearchIcon, { size: 13 }),
        h("input", {
          type: "search",
          value: query,
          placeholder: t("search.placeholder"),
          "aria-label": t("search.placeholder"),
          onChange: (event) => onQueryChange(event.target.value)
        }),
        query ? h("button", {
          className: "dshsc-search-clear",
          "aria-label": t("search.clear"),
          title: t("search.clear"),
          onClick: () => onQueryChange("")
        }, "×") : null
      ),
      h(
        "div",
        { key: "view", className: "dshsc-segment" },
        h("button", { className: "dshsc-btn", "aria-pressed": String(view === "flat"), onClick: () => onViewChange("flat") }, t("view.flat")),
        h("button", { className: "dshsc-btn", "aria-pressed": String(view === "agent"), onClick: () => onViewChange("agent") }, t("view.agent"))
      )
    ] : null
  );
}

// client/views/installed.js
var UPDATABLE = /* @__PURE__ */ new Set(["update-available", "locally-modified", "conflict"]);
function InstalledTab({
  t,
  data,
  rows,
  visibleRows,
  counts,
  bulkCount,
  filter,
  query,
  view,
  busy,
  writable,
  agentTip,
  builtinOpen,
  actions
}) {
  const updatable = (row) => UPDATABLE.has(row.status);
  function statusTag(row) {
    if (row.status === "unknown") return null;
    const map = {
      current: ["status.current", "ok", true],
      "update-available": ["status.update", "warn"],
      "locally-modified": ["status.local", "warn"],
      conflict: ["status.conflict", "warn"],
      "upstream-deleted": ["status.deleted", "warn"],
      "broken-link": ["status.broken", "err"],
      unmanaged: ["status.unmanaged", ""]
    };
    const [key, cls, check] = map[row.status] || ["status.unknown", ""];
    return h("span", { className: `dshsc-tag ${cls}` }, check ? `✓ ${t(key)}` : t(key));
  }
  function sourceLine(row) {
    if (!row.source) {
      return h("div", { className: "dshsc-src", title: t("meta.noUpstream") }, t("meta.noUpstream"));
    }
    const ref = row.commit ? `#${short(row.commit)}` : row.ref ? `#${row.ref}` : "";
    const text = `${row.source}${ref}`;
    return h(
      "div",
      { className: "dshsc-src", title: text },
      h("span", null, `${t("meta.from")} `),
      h("span", { className: "dshsc-code" }, text)
    );
  }
  function agentChips(row) {
    const links = row.links.filter((link) => !link.broken);
    const projectLinks = links.filter((link) => String(link.target).startsWith("project:"));
    const labels = links.filter((link) => !String(link.target).startsWith("project:")).map((link) => link.target === "dsh-global" ? "DSH" : link.label);
    if (projectLinks.length > 0 && !labels.includes("DSH")) labels.unshift("DSH");
    const projects = row.scopeProjects || [];
    const scopeNames = projects.length > 0 ? projects.map((project) => project.split("/").pop()) : projectLinks.map((link) => link.label);
    if (labels.length === 0 && scopeNames.length === 0) {
      return h("span", { className: "dshsc-unlinked" }, t("meta.unlinked"));
    }
    const chips = labels.slice(0, 3).map((label, index) => h("span", {
      className: `dshsc-agent${label === "DSH" ? " dsh" : ""}`,
      key: `agent-${index}`,
      title: label
    }, label === "DSH" ? h("i", { className: "dshsc-dot" }) : null, label));
    if (labels.length > 3) {
      const open = agentTip?.rowName === row.name;
      chips.push(h("button", {
        type: "button",
        className: "dshsc-agent more",
        key: "more",
        "aria-label": `${t("meta.agentsAll")}：${labels.join("、")}`,
        "aria-describedby": open ? "dshsc-agenttip" : void 0,
        "aria-expanded": String(open),
        onClick: (event) => actions.onOpenAgentTip(event, row.name, labels),
        onMouseEnter: (event) => actions.onOpenAgentTip(event, row.name, labels),
        onFocus: (event) => actions.onOpenAgentTip(event, row.name, labels),
        onMouseLeave: actions.onCloseAgentTip,
        onBlur: actions.onCloseAgentTip
      }, `+${labels.length - 3}`));
    }
    if (scopeNames.length > 0) {
      chips.push(h("span", {
        className: "dshsc-agent scope",
        key: "scope",
        title: `${t("meta.scope")}：${projects.length > 0 ? projects.join("、") : scopeNames.join("、")}`
      }, `${t("meta.onlyProject")} ${scopeNames.join("、")}`));
    }
    return chips;
  }
  function rowView(row) {
    const off = row.mode === "off";
    const tracked = row.status !== "unmanaged";
    const canUpdate = writable && updatable(row);
    return h(
      "div",
      { className: `dshsc-row${off ? " off" : ""}`, key: row.name },
      h(
        "div",
        { className: "dshsc-cell" },
        h(
          "div",
          { className: "dshsc-namerow" },
          h("span", { className: "dshsc-name", title: row.name }, row.name),
          statusTag(row),
          off ? h("span", { className: "dshsc-tag off" }, t("status.off")) : null
        ),
        sourceLine(row),
        off ? h("div", { className: "dshsc-note" }, t("mode.offHint")) : null,
        row.status === "broken-link" ? h("div", { className: "dshsc-note warn" }, t("status.brokenHint")) : null
      ),
      h("div", { className: "dshsc-agents" }, agentChips(row)),
      h(
        "div",
        { className: "dshsc-actions" },
        h("button", {
          className: "dshsc-switch",
          role: "switch",
          "aria-checked": String(tracked && row.mode === "on"),
          "aria-label": `${row.name} ${t("mode.on")}/${t("mode.off")}`,
          // 未纳入追踪时调 setMode 只会报「没有安装记录」，不如直接禁用
          disabled: busy !== null || !tracked,
          onClick: () => void actions.onToggleMode(row),
          title: tracked ? row.mode === "on" ? t("mode.off") : t("mode.on") : t("adopt.switchHint")
        }, h("span", { className: "dshsc-knob" })),
        row.status === "unmanaged" ? h("button", {
          className: "dshsc-btn ghost",
          disabled: !writable || busy !== null,
          title: row.source ? row.source : t("meta.none"),
          onClick: () => void actions.onAdopt(row)
        }, t("action.adopt")) : h("button", {
          className: `dshsc-btn ghost${canUpdate ? " dshsc-update" : ""}`,
          disabled: !canUpdate || busy !== null,
          onClick: () => actions.onUpdate(row)
        }, t("action.update")),
        h("button", { className: "dshsc-btn ghost", disabled: busy !== null, onClick: () => actions.onLinks(row) }, t("action.links")),
        h("button", {
          className: "dshsc-btn ghost danger sq",
          disabled: !writable || busy !== null,
          title: t("action.delete"),
          "aria-label": `${t("action.delete")} ${row.name}`,
          onClick: () => actions.onDelete(row)
        }, h(TrashIcon, { size: 13 }))
      )
    );
  }
  function groupedRows() {
    const groups = [];
    const hasLink = (row, prefix) => row.links.some((link) => !link.broken && String(link.target).startsWith(prefix));
    const dshRows = visibleRows.filter((row) => row.mode === "on" && !row.scopeProjects?.length && hasLink(row, "dsh-global"));
    const projectRows = visibleRows.filter((row) => row.mode === "on" && row.scopeProjects?.length);
    const offRows = visibleRows.filter((row) => row.mode === "off");
    const unlinkedRows = visibleRows.filter((row) => row.mode === "on" && !row.scopeProjects?.length && !row.links.some((link) => !link.broken));
    groups.push({ key: "dsh-global", title: t("group.dshGlobal"), rows: dshRows, dot: true });
    if (projectRows.length) groups.push({ key: "dsh-project", title: t("group.dshProject"), rows: projectRows, dot: true });
    if (offRows.length) groups.push({ key: "off", title: t("group.off"), rows: offRows });
    if (unlinkedRows.length) groups.push({ key: "unlinked", title: t("group.unlinked"), rows: unlinkedRows });
    for (const agent of data?.agents?.detected || []) {
      if (agent.kind !== "agent") continue;
      const matched = visibleRows.filter((row) => row.links.some((link) => link.target === agent.target));
      if (matched.length) groups.push({ key: agent.target, title: agent.label, rows: matched });
    }
    return groups.filter((group) => group.rows.length > 0);
  }
  function filterChip(id, label, dot) {
    return h("button", {
      key: id,
      type: "button",
      className: `dshsc-fchip${filter === id ? " active" : ""}`,
      "aria-pressed": String(filter === id),
      title: id === "unknown" && counts.unknown ? t("hint.unknown").replace("{n}", String(counts.unknown)) : void 0,
      onClick: () => actions.onFilterChange(id)
    }, dot, h("span", null, label), h("span", { className: "n" }, counts[id]));
  }
  function listBar() {
    return h(
      "div",
      { className: "dshsc-listbar" },
      h(
        "div",
        { className: "dshsc-filters" },
        filterChip("all", t("filter.all")),
        filterChip("update", t("filter.update"), h("i", { className: "dshsc-fdot" })),
        filterChip("unknown", t("filter.unknown")),
        filterChip("off", t("filter.off"))
      ),
      h(
        "div",
        { className: "dshsc-listbar-actions" },
        h("button", {
          className: "dshsc-btn sq",
          disabled: busy !== null,
          title: t("action.checkUpdates"),
          "aria-label": t("action.checkUpdates"),
          onClick: () => void actions.onCheckUpdates()
        }, h(RefreshIcon, { size: 14 })),
        bulkCount > 0 ? h("button", { className: "dshsc-btn tint", disabled: !writable || busy !== null, onClick: () => void actions.onUpdateAll() }, `${t("action.updateAll")} · ${bulkCount}`) : null
      )
    );
  }
  function filteredEmpty() {
    return h(
      "div",
      { className: "dshsc-empty" },
      h("div", { className: "dshsc-name" }, t("empty.filtered")),
      h("div", { className: "dshsc-meta", style: { justifyContent: "center" } }, t("empty.filteredHint")),
      h(
        "div",
        { style: { marginTop: 10 } },
        h("button", {
          className: "dshsc-btn",
          onClick: actions.onClearFilters
        }, t("search.clear"))
      )
    );
  }
  function builtinNotice() {
    const items = (data?.visibleOnly || []).filter((item) => item.source === "bundled");
    if (items.length === 0) return null;
    const listId = "dshsc-builtin-list";
    return h(
      "div",
      { className: "dshsc-notice" },
      h(
        "div",
        { className: "dshsc-notice-row" },
        h(InfoIcon, { size: 13 }),
        h(
          "span",
          { className: "dshsc-notice-text" },
          t("visibleOnlyBuiltin"),
          " ",
          h("button", {
            className: "dshsc-linkbtn",
            "aria-expanded": String(builtinOpen),
            "aria-controls": builtinOpen ? listId : void 0,
            onClick: actions.onToggleBuiltin
          }, builtinOpen ? t("builtin.hide") : t("builtin.view").replace("{n}", String(items.length)))
        )
      ),
      builtinOpen ? h("div", { className: "dshsc-notice-list", id: listId }, items.map((item) => item.name).join("、")) : null
    );
  }
  function visibleOnlyBanners() {
    const others = (data?.visibleOnly || []).filter((item) => item.source !== "bundled");
    return others.length > 0 ? h(
      "div",
      { className: "dshsc-banner warn" },
      `${t("visibleOnlyOther")}：${others.map((item) => item.name).join("、")}`
    ) : null;
  }
  function content() {
    if (!data) return h("div", { className: "dshsc-empty" }, t("empty.loading"));
    if (rows.length === 0) {
      return h(
        "div",
        { className: "dshsc-empty" },
        h("div", { className: "dshsc-name" }, t("empty.skills")),
        h("div", { className: "dshsc-meta", style: { justifyContent: "center" } }, t("empty.skillsHint")),
        h(
          "div",
          { style: { marginTop: 10 } },
          h("button", { className: "dshsc-btn primary", disabled: !writable, onClick: actions.onAddSkill }, t("action.addSkill"))
        )
      );
    }
    const body = view === "agent" ? h("div", { className: "dshsc-groupstack" }, groupedRows().map((group) => h(
      "div",
      { key: group.key },
      h(
        "div",
        { className: "dshsc-group-head" },
        group.dot ? h("i", { className: "dshsc-gdot" }) : null,
        h("span", null, group.title),
        h("span", { className: "n" }, group.rows.length)
      ),
      h("div", { className: "dshsc-list" }, group.rows.map(rowView))
    ))) : h("div", { className: "dshsc-list" }, visibleRows.map(rowView));
    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 8 } },
      visibleOnlyBanners(),
      builtinNotice(),
      listBar(),
      visibleRows.length === 0 ? filteredEmpty() : body
    );
  }
  return content();
}

// client/views/agent-tip.js
function AgentTip({ t, agentTip, agentTipPos, nodeRef }) {
  const node = h(
    "div",
    {
      ref: nodeRef,
      id: "dshsc-agenttip",
      role: "tooltip",
      className: "dshsc-agenttip",
      style: agentTipPos ? { left: `${agentTipPos.left}px`, top: `${agentTipPos.top}px` } : { left: 0, top: 0, visibility: "hidden" }
    },
    h(
      "div",
      { className: "dshsc-agenttip-head" },
      h("span", null, t("meta.agentsAll")),
      h("span", { className: "dshsc-agenttip-n" }, agentTip.labels.length)
    ),
    h(
      "div",
      { className: "dshsc-agenttip-list" },
      agentTip.labels.map((label, index) => h("span", {
        className: `dshsc-agent${label === "DSH" ? " dsh" : ""}`,
        key: `agenttip-${index}`
      }, label === "DSH" ? h("i", { className: "dshsc-dot" }) : null, label))
    )
  );
  return portalize(node);
}

// client/views/subscriptions.js
function SubscriptionsTab({
  t,
  subscriptions,
  rows,
  expanded,
  busy,
  writable,
  onToggle,
  onRefresh,
  onDelete,
  onInstall,
  onAdd
}) {
  if (subscriptions.length === 0) {
    return h(
      "div",
      { className: "dshsc-empty" },
      h("div", { className: "dshsc-name" }, t("empty.subs")),
      h("div", { className: "dshsc-meta", style: { justifyContent: "center" } }, t("empty.subsHint")),
      h(
        "div",
        { style: { marginTop: 10 } },
        h("button", { className: "dshsc-btn primary", disabled: !writable, onClick: onAdd }, t("action.addSubscription"))
      )
    );
  }
  return h("div", { className: "dshsc-list" }, subscriptions.map((subscription) => {
    const entries = subscription.snapshot?.entries || [];
    const installedNames = new Set(rows.filter((row) => row.subscriptionId === subscription.id).map((row) => row.name));
    const open = Boolean(expanded[subscription.id]);
    return h(
      "div",
      { className: "dshsc-sub-block", key: subscription.id },
      h(
        "div",
        { className: "dshsc-sub-row" },
        h("button", {
          className: "dshsc-caret",
          "aria-expanded": String(open),
          "aria-label": `${subscription.source} ${open ? t("action.collapse") : t("action.expand")}`,
          onClick: () => onToggle(subscription.id)
        }, h(CaretIcon, { open })),
        h("span", { className: "dshsc-name" }, subscription.source),
        h("span", { className: "dshsc-tag" }, subscription.ref || t("subscription.defaultRef")),
        h(
          "span",
          { className: "dshsc-substat" },
          `${entries.length} ${t("skillCount")} · ${t("installed")} ${installedNames.size}`
        ),
        h(
          "div",
          { className: "dshsc-actions" },
          h("button", {
            className: "dshsc-btn sq",
            disabled: busy !== null,
            title: t("action.checkUpdates"),
            "aria-label": `${t("action.checkUpdates")} ${subscription.source}`,
            onClick: () => void onRefresh(subscription)
          }, h(RefreshIcon, { size: 13 })),
          h("button", { className: "dshsc-btn ghost danger", disabled: busy !== null, onClick: () => void onDelete(subscription) }, t("action.unsubscribe"))
        )
      ),
      open ? h("div", { className: "dshsc-sub-list" }, entries.map((entry) => {
        const installedAlready = installedNames.has(entry.name);
        return h(
          "div",
          { className: "dshsc-sub-entry", key: entry.name },
          h("span", { className: "dshsc-name" }, entry.name),
          h(
            "span",
            { className: `dshsc-state${installedAlready ? " ok" : ""}` },
            installedAlready ? "✓ " : "",
            installedAlready ? t("installed") : t("notInstalled")
          ),
          h(
            "div",
            { className: "dshsc-actions" },
            installedAlready ? null : h("button", {
              className: "dshsc-btn",
              disabled: !writable || busy !== null,
              onClick: () => void onInstall(subscription, entry)
            }, t("action.install"))
          )
        );
      })) : null
    );
  }));
}

// client/views/modals.js
var import_react3 = __toESM(require("react"), 1);
function Overlay({ t, title, children, footer, onCancel }) {
  import_react3.default.useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return h(
    "div",
    { className: "dshsc-overlay", onClick: (event) => {
      if (event.target === event.currentTarget) onCancel?.();
    } },
    h(
      "div",
      { className: "dshsc-modal", role: "dialog", "aria-modal": "true" },
      h("button", {
        className: "dshsc-modal-close",
        "aria-label": t("action.cancel"),
        onClick: (event) => {
          event.stopPropagation();
          onCancel?.();
        }
      }, "×"),
      h("h3", null, title),
      children,
      h("div", { className: "dshsc-modal-foot" }, footer)
    )
  );
}
function FormModal({ t, title, hint, fields, onCancel, onSubmit }) {
  const [form, setForm] = import_react3.default.useState(() => Object.fromEntries(fields.map((field) => [field.key, ""])));
  const incomplete = fields.some(
    (field) => field.required !== false && !String(form[field.key] || "").trim()
  );
  return h(
    Overlay,
    {
      t,
      title,
      onCancel,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
        h("button", {
          key: "s",
          className: "dshsc-btn primary",
          disabled: incomplete,
          onClick: () => onSubmit(form)
        }, t("action.save"))
      ]
    },
    hint ? h("p", { className: "dshsc-sub" }, hint) : null,
    ...fields.map((field) => h(
      "label",
      { className: "dshsc-field", key: field.key },
      h("span", null, field.label),
      h("input", {
        value: form[field.key],
        placeholder: field.placeholder,
        onChange: (event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))
      })
    ))
  );
}
function ConfirmModal({ t, title, body, onCancel, onConfirm, danger, confirmLabel }) {
  return h(Overlay, {
    t,
    title,
    onCancel,
    footer: [
      h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
      h("button", { key: "o", className: `dshsc-btn${danger ? " danger" : " primary"}`, onClick: onConfirm }, confirmLabel || t("action.save"))
    ]
  }, h("p", { className: "dshsc-sub", style: { whiteSpace: "pre-wrap" } }, body));
}
function LinksModal({ t, row, agents, workspaces, pickDirectory, onCancel, onSave }) {
  const candidates = agents.filter(
    (agent) => agent.kind === "dsh" || agent.kind !== "project" && agent.exists
  );
  const [targets, setTargets] = import_react3.default.useState(() => {
    const visible = new Set(candidates.map((agent) => agent.target));
    const initial = new Set(row.links.map((link) => link.target).filter((target) => visible.has(target)));
    initial.add("dsh-global");
    return initial;
  });
  const [scopeProjects, setScopeProjects] = import_react3.default.useState(row.scopeProjects || []);
  const [scopeMode, setScopeMode] = import_react3.default.useState((row.scopeProjects || []).length > 0 ? "projects" : "global");
  const workspacePaths = new Set(workspaces.map((workspace) => workspace.path));
  const otherProjects = scopeProjects.filter((project) => !workspacePaths.has(project));
  const toggle = (target) => setTargets((prev) => {
    const next = new Set(prev);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  });
  const toggleProject = (project) => setScopeProjects((prev) => prev.includes(project) ? prev.filter((item) => item !== project) : [...prev, project]);
  const chooseDirectory = async () => {
    const dir = await pickDirectory?.();
    if (!dir) return;
    setScopeProjects((prev) => prev.includes(dir) ? prev : [...prev, dir]);
  };
  return h(
    Overlay,
    {
      t,
      title: `${t("action.links")} · ${row.name}`,
      onCancel,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
        h("button", {
          key: "s",
          className: "dshsc-btn primary",
          onClick: () => onSave([...targets], scopeMode === "projects" ? scopeProjects.filter((item) => item.trim()) : [])
        }, t("action.save"))
      ]
    },
    h("div", { className: "dshsc-group" }, t("links.targets")),
    h("p", { className: "dshsc-sub" }, t("links.detectedHint")),
    h("p", { className: "dshsc-sub" }, t("links.canonical").replace("{path}", `~/.agents/skills/${row.name}`)),
    ...candidates.map((agent) => h(
      "label",
      { className: "dshsc-check", key: agent.target },
      h("input", {
        type: "checkbox",
        checked: agent.target === "dsh-global" ? true : targets.has(agent.target),
        disabled: agent.target === "dsh-global",
        onChange: () => toggle(agent.target)
      }),
      h("span", null, agent.kind === "dsh" ? t("links.dshGlobal") : agent.label),
      agent.target === "dsh-global" ? h("small", null, t("links.required")) : null,
      h("small", { title: agent.dir }, agent.dir)
    )),
    h("div", { className: "dshsc-group" }, t("links.scope")),
    h(
      "label",
      { className: "dshsc-check" },
      h("input", { type: "radio", name: `scope-${row.name}`, checked: scopeMode === "global", onChange: () => setScopeMode("global") }),
      h("span", null, t("links.scopeGlobal"))
    ),
    h(
      "label",
      { className: "dshsc-check" },
      h("input", { type: "radio", name: `scope-${row.name}`, checked: scopeMode === "projects", onChange: () => setScopeMode("projects") }),
      h("span", null, t("links.scopeProjects"))
    ),
    scopeMode === "projects" ? h(
      "div",
      null,
      h("div", { className: "dshsc-group" }, t("links.workspaces")),
      workspaces.length === 0 ? h("p", { className: "dshsc-sub" }, t("links.noWorkspaces")) : h("div", { className: "dshsc-panel" }, workspaces.map((workspace) => h(
        "label",
        { className: "dshsc-check", key: workspace.id },
        h("input", {
          type: "checkbox",
          checked: scopeProjects.includes(workspace.path),
          onChange: () => toggleProject(workspace.path)
        }),
        h("span", null, workspace.title),
        h("small", null, workspace.path)
      ))),
      otherProjects.length > 0 ? h("div", { className: "dshsc-group" }, t("links.selected")) : null,
      ...otherProjects.map((project) => h(
        "div",
        { className: "dshsc-sub-entry", key: project },
        h("span", { className: "dshsc-code" }, project),
        h(
          "div",
          { className: "dshsc-actions" },
          h("button", {
            className: "dshsc-btn ghost danger",
            onClick: () => setScopeProjects((prev) => prev.filter((item) => item !== project))
          }, t("action.delete"))
        )
      )),
      h("button", { className: "dshsc-btn", style: { alignSelf: "flex-start", marginTop: 6 }, onClick: () => void chooseDirectory() }, t("links.pickDirectory"))
    ) : null,
    h("p", { className: "dshsc-sub" }, t("links.hint"))
  );
}
function AutoLinkModal({ t, settings, agents, onCancel, onSave }) {
  const [targets, setTargets] = import_react3.default.useState(() => new Set(
    Array.isArray(settings.autoLinkTargets) ? settings.autoLinkTargets : agents.map((agent) => agent.target)
  ));
  const toggle = (target) => setTargets((prev) => {
    const next = new Set(prev);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  });
  return h(
    Overlay,
    {
      t,
      title: t("autoLink"),
      onCancel,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
        h("button", { key: "s", className: "dshsc-btn primary", onClick: () => onSave([...targets]) }, t("action.save"))
      ]
    },
    h("p", { className: "dshsc-sub" }, t("links.dshGlobal") + " · " + t("links.required")),
    h("div", { className: "dshsc-group" }, t("autoLink.detected")),
    agents.length === 0 ? h("p", { className: "dshsc-sub" }, t("autoLink.none")) : h("div", { className: "dshsc-panel" }, agents.map((agent) => h(
      "label",
      { className: "dshsc-check", key: agent.target },
      h("input", {
        type: "checkbox",
        checked: targets.has(agent.target),
        onChange: () => toggle(agent.target)
      }),
      h("span", null, agent.label),
      h("small", null, agent.dir)
    ))),
    h("p", { className: "dshsc-sub" }, t("autoLink.hint"))
  );
}
function AddSkillModal({ t, onCancel, onProbe, onInstall }) {
  const [source, setSource] = import_react3.default.useState("");
  const [phase, setPhase] = import_react3.default.useState("idle");
  const [options, setOptions] = import_react3.default.useState([]);
  const [selected, setSelected] = import_react3.default.useState(() => /* @__PURE__ */ new Set());
  const [manual, setManual] = import_react3.default.useState("");
  const [skipped, setSkipped] = import_react3.default.useState(0);
  const [error, setError] = import_react3.default.useState(null);
  const reset = (value) => {
    setSource(value);
    setPhase("idle");
    setOptions([]);
    setSelected(/* @__PURE__ */ new Set());
    setSkipped(0);
    setError(null);
  };
  const probe = async () => {
    const value = source.trim();
    if (!value || phase === "probing") return;
    setPhase("probing");
    setError(null);
    try {
      const result = await onProbe(value);
      const found = Array.isArray(result?.skills) ? result.skills : [];
      setOptions(found);
      setSelected(new Set(found.map((item) => item.name)));
      setSkipped(Math.max(0, Number(result?.skipped) || 0));
      setPhase(found.length > 0 ? "picked" : "empty");
    } catch (err) {
      setError(err?.message || String(err));
      setPhase("failed");
    }
  };
  const toggle = (name) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const names = manual.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const skippedText = skipped > 0 ? t("form.skipped").replace("{n}", String(skipped)) : null;
  const manualMode = phase === "empty" || phase === "failed";
  const skills = phase === "picked" ? [...selected] : names;
  const canSubmit = phase === "picked" ? selected.size > 0 : manualMode ? names.length > 0 : false;
  const submit = () => {
    if (!canSubmit) return;
    onInstall({ source: source.trim(), skills });
  };
  return h(
    Overlay,
    {
      t,
      title: t("action.addSkill"),
      onCancel,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
        h("button", {
          key: "s",
          className: "dshsc-btn primary",
          disabled: !canSubmit,
          onClick: submit
        }, t("action.save"))
      ]
    },
    h("p", { className: "dshsc-sub" }, t("form.pickHint")),
    h(
      "div",
      { className: "dshsc-field" },
      h("span", null, t("form.source")),
      h(
        "div",
        { className: "dshsc-inline" },
        h("input", {
          value: source,
          placeholder: t("form.sourceHint"),
          onChange: (event) => reset(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") void probe();
          }
        }),
        h("button", {
          className: "dshsc-btn",
          disabled: !source.trim() || phase === "probing",
          onClick: () => void probe()
        }, phase === "probing" ? t("form.probing") : t("form.probe"))
      )
    ),
    phase === "picked" ? h(
      "div",
      { key: "picked" },
      h("div", { className: "dshsc-group" }, t("form.detected").replace("{n}", String(options.length))),
      h(
        "div",
        { style: { display: "flex", gap: 6, marginBottom: 6 } },
        h("button", {
          className: "dshsc-btn ghost",
          onClick: () => setSelected(new Set(options.map((item) => item.name)))
        }, t("form.selectAll")),
        h("button", {
          className: "dshsc-btn ghost",
          onClick: () => setSelected(/* @__PURE__ */ new Set())
        }, t("form.selectNone"))
      ),
      h("div", { className: "dshsc-panel" }, options.map((option) => h(
        "label",
        { className: "dshsc-check dshsc-skill", key: option.name },
        h("input", {
          type: "checkbox",
          checked: selected.has(option.name),
          onChange: () => toggle(option.name)
        }),
        h(
          "span",
          { className: "dshsc-skill-main" },
          h("span", { className: "dshsc-skill-name" }, option.name),
          option.description ? h("small", { className: "dshsc-skill-desc" }, option.description) : null,
          h("small", { className: "dshsc-skill-path" }, option.skillPath)
        )
      ))),
      skippedText ? h("p", { className: "dshsc-sub" }, skippedText) : null
    ) : null,
    phase === "probing" ? h("p", { className: "dshsc-sub" }, t("form.probingHint")) : null,
    manualMode ? h(
      "div",
      { key: "manual" },
      h("p", { className: "dshsc-sub" }, phase === "empty" ? skippedText || t("form.noSkills") : `${t("form.probeFailed")}${error ? ` · ${error}` : ""}`),
      h(
        "label",
        { className: "dshsc-field" },
        h("span", null, t("form.skills")),
        h("input", {
          value: manual,
          placeholder: "git-kit, handoff",
          onChange: (event) => setManual(event.target.value)
        })
      )
    ) : null,
    h("p", { className: "dshsc-sub" }, t("form.hint"))
  );
}
function Modals({ t, modal, data, autoLinkAgents, pickDirectory, actions, onClose, onSaveAutoLink }) {
  if (modal.type === "add-skill") {
    return h(AddSkillModal, {
      t,
      onCancel: onClose,
      onProbe: actions.probeSkills,
      onInstall: actions.installSkills
    });
  }
  if (modal.type === "add-subscription") {
    return h(FormModal, {
      t,
      title: t("action.addSubscription"),
      hint: t("form.subHint"),
      fields: [
        { key: "source", label: t("form.source"), placeholder: t("form.sourceHint") },
        { key: "ref", label: t("form.ref"), placeholder: t("form.refHint"), required: false },
        { key: "subpath", label: t("form.subpath"), placeholder: "skills", required: false }
      ],
      onCancel: onClose,
      onSubmit: (form) => void actions.addSubscription(form)
    });
  }
  if (modal.type === "links") {
    return h(LinksModal, {
      t,
      row: modal.row,
      agents: data?.agents?.all || [],
      workspaces: data?.workspaces || [],
      pickDirectory,
      onCancel: onClose,
      onSave: (targets, scopeProjects) => {
        onClose();
        void actions.saveLinks(modal.row, targets, scopeProjects);
      }
    });
  }
  if (modal.type === "autolink") {
    return h(AutoLinkModal, {
      t,
      settings: data?.settings || {},
      agents: autoLinkAgents,
      onCancel: onClose,
      onSave: (targets) => void onSaveAutoLink(targets)
    });
  }
  if (modal.type === "confirm-delete") {
    return h(ConfirmModal, {
      t,
      title: t("confirm.deleteTitle"),
      body: t("confirm.deleteBody"),
      danger: true,
      onCancel: onClose,
      onConfirm: modal.onConfirm
    });
  }
  if (modal.type === "confirm-update") {
    return h(ConfirmModal, {
      t,
      title: t("confirm.updateTitle"),
      body: t("confirm.updateBody"),
      onCancel: onClose,
      onConfirm: modal.onConfirm
    });
  }
  if (modal.type === "conflict") {
    const conflicts = modal.detail?.conflicts || [];
    return h(ConfirmModal, {
      t,
      title: t("error.conflictTitle"),
      body: `${modal.message}
${conflicts.map((item) => `${item.label}: ${item.linkPath}`).join("\n")}`,
      onCancel: onClose,
      onConfirm: onClose,
      confirmLabel: t("action.cancel")
    });
  }
  return null;
}

// client/section.js
var UPDATABLE2 = /* @__PURE__ */ new Set(["update-available", "locally-modified", "conflict"]);
function Section({ t, page = false, pickDirectory, onPlacementChange }) {
  const { data, error, busy, toast, setToast, setBusy, reload, run } = useSkillsData();
  const [tab, setTab] = import_react4.default.useState("installed");
  const [view, setView] = import_react4.default.useState("flat");
  const [modal, setModal] = import_react4.default.useState(null);
  const [expanded, setExpanded] = import_react4.default.useState({});
  const [placementBusy, setPlacementBusy] = import_react4.default.useState(null);
  const [placementOverride, setPlacementOverride] = import_react4.default.useState(null);
  const [query, setQuery] = import_react4.default.useState("");
  const [filter, setFilter] = import_react4.default.useState("all");
  const [builtinOpen, setBuiltinOpen] = import_react4.default.useState(false);
  const { settingsOpen, settingsRef, settingsPlacement, closeSettings, toggleSettings } = useSettingsPopover();
  const { agentTip, agentTipPos, agentTipRef, openAgentTip, closeAgentTip } = useAgentTip();
  const rows = data?.installs || [];
  const actions = useSkillActions({ t, rows, reload, run, setBusy, setToast, setModal });
  const writable = Boolean(data) && !data?.readOnly && data?.cli?.usable;
  const updatable = (row) => UPDATABLE2.has(row.status);
  const updateCount = rows.filter(updatable).length;
  const bulkCount = rows.filter((row) => row.status === "update-available").length;
  const unknownCount = rows.filter((row) => row.status === "unknown").length;
  const offCount = rows.filter((row) => row.mode === "off").length;
  const counts = { all: rows.length, update: updateCount, unknown: unknownCount, off: offCount };
  const queryText = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (filter === "update" && !updatable(row)) return false;
    if (filter === "unknown" && row.status !== "unknown") return false;
    if (filter === "off" && row.mode !== "off") return false;
    if (!queryText) return true;
    const agentLabels = row.links.map((link) => link.target === "dsh-global" ? "DSH" : link.label);
    return [row.name, row.source || "", ...agentLabels].join(" ").toLowerCase().includes(queryText);
  });
  const autolinkTargets = (data?.agents?.detected || []).filter((agent) => agent.kind === "agent");
  const autoLinkSelection = data?.settings?.autoLinkTargets;
  const autoLinkAgents = Array.isArray(autoLinkSelection) ? autolinkTargets.filter((agent) => autoLinkSelection.includes(agent.target)) : autolinkTargets;
  const autoLinkLabel = [t("links.dshGlobal"), ...autoLinkAgents.map((agent) => agent.label)].join("、");
  const placement = (placementOverride ?? data?.settings?.placement) === "sidebar" ? "sidebar" : "settings";
  async function changePlacement(next) {
    if (next === placement || placementBusy) return;
    setPlacementBusy(next);
    try {
      await apiCall("POST", "/settings", { placement: next });
      setPlacementOverride(next);
      closeSettings();
      onPlacementChange?.(next);
      setPlacementBusy(null);
    } catch (err) {
      setToast({ kind: "err", text: err.message });
      setPlacementBusy(null);
    }
  }
  async function saveAutoLink(targets) {
    setModal(null);
    await run("settings", () => apiCall("POST", "/settings", { autoLinkTargets: targets }));
  }
  const installedActions = {
    onAdopt: actions.adopt,
    onToggleMode: actions.toggleMode,
    onUpdate: actions.requestUpdate,
    onDelete: actions.requestDelete,
    onLinks: (row) => setModal({ type: "links", row }),
    onCheckUpdates: actions.checkUpdates,
    onUpdateAll: actions.updateAll,
    onAddSkill: actions.requestAddSkill,
    onFilterChange: setFilter,
    onQueryChange: setQuery,
    onOpenAgentTip: openAgentTip,
    onCloseAgentTip: closeAgentTip,
    onToggleBuiltin: () => setBuiltinOpen((prev) => !prev),
    onClearFilters: () => {
      setQuery("");
      setFilter("all");
    }
  };
  const subscriptionActions = {
    onToggle: (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] })),
    onRefresh: actions.refreshSubscription,
    onDelete: actions.deleteSubscription,
    onInstall: actions.installFromSubscription,
    onAdd: actions.requestAddSubscription
  };
  const root = h(
    "div",
    { className: "dshsc-root" },
    h("style", null, CSS),
    h(Header, {
      t,
      page,
      plugin: data?.plugin,
      writable,
      autoLinkLabel,
      autoLinkCount: autoLinkAgents.length + 1,
      tab,
      settingsOpen,
      settingsRef,
      settingsPlacement,
      placement,
      placementBusy,
      readOnly: Boolean(data?.readOnly),
      onToggleSettings: toggleSettings,
      onChangePlacement: (next) => void changePlacement(next),
      onOpenAutoLink: () => setModal({ type: "autolink" }),
      onAddSkill: actions.requestAddSkill,
      onAddSubscription: actions.requestAddSubscription
    }),
    error ? h("div", { className: "dshsc-banner err" }, `${error} · `, h("button", { className: "dshsc-btn ghost", onClick: () => void reload() }, t("action.retry"))) : null,
    data?.readOnly ? h("div", { className: "dshsc-banner warn" }, t("banner.readonly")) : null,
    data && !data.cli?.usable ? h("div", { className: "dshsc-banner err" }, `${t("banner.cli")} · ${data.cli?.source || ""} ${data.cli?.version || ""}`) : null,
    h(Toolbar, {
      t,
      tab,
      onTabChange: setTab,
      installedCount: rows.length,
      subscriptionCount: data?.subscriptions?.length || 0,
      query,
      onQueryChange: setQuery,
      view,
      onViewChange: setView
    }),
    tab === "installed" ? h(InstalledTab, {
      t,
      data,
      rows,
      visibleRows,
      counts,
      bulkCount,
      filter,
      query,
      view,
      busy,
      writable,
      agentTip,
      builtinOpen,
      actions: installedActions
    }) : h(SubscriptionsTab, {
      t,
      subscriptions: data?.subscriptions || [],
      rows,
      expanded,
      busy,
      writable,
      ...subscriptionActions
    }),
    busy ? h("div", { className: "dshsc-meta" }, `${t("busy.working")} ${busy}`) : null,
    toast ? h("div", { className: `dshsc-toast ${toast.kind}` }, toast.text) : null,
    modal ? h(Modals, {
      t,
      modal,
      data,
      autoLinkAgents: autolinkTargets,
      pickDirectory,
      actions: {
        probeSkills: actions.probeSkills,
        installSkills: actions.installSkills,
        addSubscription: actions.addSubscription,
        saveLinks: actions.saveLinks
      },
      onClose: () => setModal(null),
      onSaveAutoLink: saveAutoLink
    }) : null,
    agentTip ? h(AgentTip, { t, agentTip, agentTipPos, nodeRef: agentTipRef }) : null
  );
  return page ? h("div", { className: "dshsc-page" }, root) : root;
}

// client/surface.js
var PANEL_ID = "dsh-skills-console";
function createSurface({ slots, layout, t, pickDirectory }) {
  let surface = null;
  let userSelected = false;
  const surfaceDisposers = [];
  function SettingsSurface(props) {
    return h(Section, {
      t,
      page: false,
      pickDirectory,
      onPlacementChange: (next) => changeSurface(next, props?.close)
    });
  }
  function PageSurface() {
    return h(Section, { t, page: true, pickDirectory, onPlacementChange: (next) => changeSurface(next) });
  }
  function SurfaceIcon(props) {
    return h(PanelIcon, { size: props?.size || 16 });
  }
  function clearSurface() {
    while (surfaceDisposers.length > 0) {
      const dispose2 = surfaceDisposers.pop();
      try {
        dispose2();
      } catch {
      }
    }
  }
  function mount(next) {
    const target = next === "sidebar" ? "sidebar" : "settings";
    if (surface === target) return;
    clearSurface();
    surface = target;
    if (target === "sidebar") {
      surfaceDisposers.push(slots.inject("main", () => {
        const disposeMain = slots.register({ name: "main", key: PANEL_ID }, PageSurface);
        const disposeIcon = slots.inject("sidebar.panellist", () => slots.register({
          name: "sidebar.panellist",
          id: PANEL_ID,
          order: 30,
          label: () => t("page.title")
        }, SurfaceIcon));
        return [disposeMain, disposeIcon];
      }));
    } else {
      surfaceDisposers.push(slots.inject("settings.section", () => slots.register({
        name: "settings.section",
        id: PANEL_ID,
        order: 26,
        label: () => t("section.title")
      }, SettingsSurface)));
    }
  }
  function changeSurface(next, close) {
    userSelected = true;
    mount(next);
    try {
      if (next === "sidebar") {
        layout?.selectPanel?.(PANEL_ID);
        close?.();
      } else {
        layout?.selectPanel?.("conversation");
      }
    } catch {
    }
  }
  function dispose() {
    clearSurface();
    surface = null;
  }
  return { mount, changeSurface, clearSurface, dispose, hasUserSelected: () => userSelected };
}

// client/app.js
var inject = ["slots"];
function apply(ctx) {
  const locale = ctx.get("locale");
  const t = buildTranslate(locale);
  const slots = ctx.get("slots");
  if (!slots?.register) return;
  installSettingsNavIcon(ctx, () => t("section.title"));
  const pickDirectory = async () => ctx.get("uiWorkspace")?.pickDirectory?.();
  const surface = createSurface({ slots, layout: ctx.get("layout"), t, pickDirectory });
  surface.mount("settings");
  ctx.effect(() => () => {
    surface.dispose();
  }, "dsh-skills-console:surface");
  apiCall("GET", "/state").then((state) => {
    if (!surface.hasUserSelected() && state?.settings?.placement === "sidebar") surface.mount("sidebar");
  }).catch(() => {
  });
}
    return module.exports;
  },
});


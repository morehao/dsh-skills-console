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
async function apiCall(method, path, body, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-dsh-skills-console": "1" },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    cache: "no-store",
    ...options.signal ? { signal: options.signal } : {}
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
function checkPluginUpdate({ fresh = false } = {}) {
  return apiCall("GET", `/plugin-update${fresh ? "?fresh=1" : ""}`);
}
function applyPluginUpdate() {
  return apiCall("POST", "/plugin-update/apply", {});
}
function fetchPluginRelease(version) {
  return apiCall("GET", `/plugin-update/release?version=${encodeURIComponent(version || "")}`);
}

// client/copy.js
var DICT = {
  zh: {
    "section.title": "技能控制台",
    "page.title": "技能控制台",
    "section.subtitle": "统一管理本地技能的安装、更新、删除与共享，让同一份技能在多个 Agent 间复用。",
    "tab.installed": "已安装",
    "tab.subscriptions": "订阅",
    "column.skill": "技能",
    "column.agents": "共享 Agent",
    "column.policy": "调用策略",
    "column.actions": "操作",
    "column.skillAgents": "技能（含 Agent）",
    "column.policyActions": "策略与操作",
    "column.repo": "仓库",
    "column.ref": "Ref",
    "column.entries": "条目",
    "column.status": "状态",
    "action.addSkill": "添加技能",
    "action.addSubscription": "添加订阅",
    "action.checkUpdates": "检查更新",
    "action.update": "更新",
    "action.updateAll": "全部更新",
    "action.delete": "删除",
    "action.unsubscribe": "取消订阅",
    "action.view": "查看",
    "action.hide": "收起",
    "action.exports": "共享设置",
    "action.install": "安装",
    "action.expand": "展开",
    "action.collapse": "收起",
    "action.adopt": "接管",
    "action.save": "保存",
    "action.cancel": "取消",
    "action.close": "关闭",
    "action.choose": "选择目录",
    "action.retry": "重新加载",
    "view.flat": "平铺",
    "view.agent": "按 Agent",
    exportDefault: "新安装时自动共享",
    "settings.title": "插件设置",
    "placement.label": "侧边栏入口",
    "placement.effect": "切换后立即生效",
    "placement.on": "已开启",
    "placement.off": "已关闭",
    "placement.hint": "开启后侧栏出现「技能控制台」入口；关闭则只在「设置 → 技能」显示。",
    "github.open": "打开 GitHub 仓库",
    "pluginUpdate.check": "检查插件更新",
    "pluginUpdate.title": "检查插件更新",
    "pluginUpdate.current": "当前版本",
    "pluginUpdate.latest": "最新版本",
    "pluginUpdate.checking": "正在检查…",
    "pluginUpdate.upToDate": "已是最新版本",
    "pluginUpdate.available": "有新版本可用",
    "pluginUpdate.checkFailed": "暂时无法获取最新版本，请稍后再试",
    "pluginUpdate.recheck": "重新检查",
    "pluginUpdate.update": "更新到 {version}",
    "pluginUpdate.applying": "正在更新…",
    "pluginUpdate.updated": "已更新到 {version}，重启 DSH 后生效",
    "pluginUpdate.restartHint": "更新已安装，请重启 DSH 使新版本生效。",
    "pluginUpdate.manual": "当前环境不支持一键更新，请手动执行：",
    "pluginUpdate.copy": "复制命令",
    "pluginUpdate.copied": "已复制",
    "pluginUpdate.close": "关闭",
    "pluginUpdate.whatsNew": "v{version} 更新内容",
    "pluginUpdate.releaseLoading": "正在加载更新内容…",
    "pluginUpdate.viewReleaseNotes": "在 GitHub 查看发布说明",
    "pluginUpdate.releaseUnavailable": "暂无该版本的发布说明。",
    "status.current": "最新",
    "status.update": "可更新",
    "status.local": "安装后有改动",
    "status.localHint": "安装或更新后，这个技能的文件被改过；再次更新会覆盖这些改动，会先请你确认。可在「查看 → 信息」里核对",
    "status.conflict": "有改动 · 可更新",
    "status.conflictHint": "本地文件有改动，上游也有新提交；更新会覆盖你的改动（旧内容有备份，可回滚）",
    "status.deleted": "上游已移除",
    "status.broken": "异常：软链断裂",
    "status.unmanaged": "未纳入追踪",
    "status.unknown": "待检查",
    "status.noUpstream": "无上游",
    "status.noUpstreamHint": "没有可用的订阅来源，无法检查更新；重新接管或添加订阅后再试",
    "status.off": "已停用",
    "status.brokenHint": "共享链接失效：重新共享，或删除后重装",
    "adopt.switchHint": "还未纳入追踪，不能启停",
    "adopt.noUpstream": "没有远端来源，暂时无法检测更新",
    "adopt.done": "已纳入追踪",
    "toast.checked": "检查完成",
    "mode.on": "启用",
    "mode.off": "停用",
    "mode.offHint": "已停用：DSH 的模型调用与 `/` 手动调用都看不到它；技能文件、共享关系与其他 Agent 都不受影响",
    "policy.auto": "自动",
    "policy.manual": "仅手动",
    "policy.hidden": "完全停用",
    "policy.legacy": "仅 DSH 隐藏",
    "policy.author": "仅手动 · 只读",
    "policy.drift": "需修复",
    "policy.unmanaged": "未纳入追踪",
    "policy.flat": "平铺 .md 不支持",
    "policy.open": "设置调用策略",
    "policy.title": "调用策略",
    "policy.subtitle": "只改变 DSH 对这份技能的调用方式；项目里的同名副本不受影响。",
    "policy.autoDesc": "模型与 / 都能调用。",
    "policy.manualDesc": "模型不自动调用，手动 / 仍可用。",
    "policy.hiddenDesc": "所有 Agent 都看不到，可随时恢复。",
    "policy.authorHint": "作者已把这份技能固定为「仅手动」；插件不会覆盖，改回自动需要编辑技能文件。",
    "policy.legacyHint": "旧版 DSH-only 停用：只隐藏 DSH 的模型调用；选择任一模式完成迁移。",
    "policy.driftHint": "记录与技能文件不一致，可能被外部改过；选择「仅手动」可重试。",
    "policy.hiddenConfirmTitle": "完全停用这个技能？",
    "policy.hiddenConfirmBody": "所有 Agent 都看不到；不会删除内容，随时可恢复。",
    "policy.hiddenConfirm": "完全停用",
    "policy.saving": "保存中…",
    "policy.saved": "调用策略已更新",
    "policy.savedManual": "已设为仅手动；更新后会保持",
    "policy.savedAuto": "已恢复自动",
    "policy.savedHidden": "已完全停用；可随时恢复",
    "policy.unpark": "恢复",
    "policy.unparkTitle": "恢复技能",
    "policy.unparkBody": "将回到停用前的模式（{mode}）；不需要重新下载，其他设置也不受影响。",
    "policy.unparkDone": "已恢复；模型与 / 按停用前的模式生效",
    "policy.manualOnlyHint": "仅手动：模型不会自动调用，手动 / 仍可用",
    "policy.hiddenHint": "完全停用：所有 Agent 都看不到；随时可恢复",
    "policy.legacyNote": "当前仍是旧版 DSH-only 停用",
    "policy.driftNote": "仅手动标记需修复",
    "policy.authorNote": "作者已设为仅手动，插件不覆盖",
    "policy.hiddenNote": "恢复后回到停用前的模式；停用期间不能更新或重装",
    "policy.unparkKept": "已恢复；冲突文件保留在 {path}",
    "policy.unparkDrift": "已恢复，但文件内容与停用时不一致；请检查或重新检查更新",
    "filter.manual": "仅手动",
    "visibility.hiddenHint": "已启用，但扫描目录里没有它：确认 ~/.agents/skills 下真有这个技能，或检查 DSH_AGENTS_HOME。",
    "visibility.manualOnlyHint": "技能作者自己设了「仅手动」：模型调用看不到它，手动 `/` 调用仍可用。",
    "visibility.scopeMismatch": "当前有另一份同名技能排在前面（项目或用户目录）；停用只影响这一份，不会隐藏它。",
    "visibility.foreignWinner": "模型看到的是另一份同名技能：{path}（它的扫描根 rank 更小，会遮住这一份）",
    "exports.targets": "共享 Agent",
    "exports.detectedHint": "只列出本机已安装（目录存在）的 Agent。共享只影响它们；DSH 自己看不看得见由 DSH 决定，和共享无关。",
    "exports.canonical": "技能本体：{path}；勾选后只是让不直接读该目录的 Agent 也能用，不会复制文件。",
    "exports.none": "本机没有可共享的 Agent 目录",
    "exports.hint": "保存后按勾选建立或移除链接；技能本体留在原位置，不会移动。",
    "exports.sharedUnknown": "共享目录未验证",
    "exportDefault.detected": "装完后默认共享至以下 Agent",
    "exportDefault.none": "本机没有需要共享的 Agent",
    "exportDefault.hint": "默认一个都不勾：技能装进 ~/.agents/skills 后 DSH 本来就能看见。共享只用于仍只认私有目录的 Agent，且只影响之后的安装。",
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
    "form.skipped": "另有 {n} 个技能缺少名称或描述，已跳过",
    "form.selectAll": "全选",
    "form.selectNone": "全不选",
    "form.pickHint": "先填来源并检测；仓库里有多个技能时可以多选，只有一个会默认勾上。",
    "form.noSkills": "仓库里没找到 SKILL.md，可以直接填技能名安装",
    "form.probeFailed": "检测失败，仍可手动填技能名",
    "form.skills": "技能名（多个用逗号分隔）",
    "form.ref": "ref（分支 / tag，可空）",
    "form.refHint": "留空则自动跟随仓库默认分支",
    "form.subpath": "子目录（可空）",
    "form.hint": "会立即下载并写入 ~/.agents/skills，并按「新安装时自动共享」的选择共享至对应 Agent。",
    "form.subHint": "只记录你关注这个仓库，不会安装任何技能。",
    "form.submitFailed": "添加失败，请重试",
    "subscription.defaultRef": "默认分支",
    "confirm.deleteTitle": "删除技能",
    "confirm.deleteBody": "会从本机移除，断开本插件建立的其他 Agent 链接并清理记录；目录先备份到回收站（保留 7 天）。不会删除你的源仓库。",
    "confirm.updateTitle": "本地有改动",
    "confirm.updateBody": "更新会覆盖这些本地改动；旧内容已备份，可回滚。",
    "error.conflictTitle": "删除被拦截",
    "busy.working": "处理中…",
    "meta.from": "来自",
    "meta.noUpstream": "无远端来源 · 不检测更新",
    "meta.noExport": "未共享",
    "meta.noExportHint": "没有给不支持共享根的 Agent 建链接；直读 ~/.agents/skills 的 Agent 装好即见，无需共享。",
    "meta.modelVisible": "模型可见",
    "meta.modelHidden": "模型不可见",
    "meta.manualOnly": "仅手动",
    "meta.agentsAll": "已共享的 Agent",
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
    "group.visible": "模型可见",
    "group.manual": "仅手动",
    "group.off": "已停用",
    "group.hidden": "启用但不可见",
    installed: "已安装",
    notInstalled: "未安装",
    skillCount: "个技能",
    visibleOnly: "模型可见，但不在本地技能库",
    visibleOnlyOther: "模型能看到，但不在 ~/.agents/skills",
    visibleOnlyBuiltin: "本插件仅管理 ~/.agents/skills 下的技能，内置技能不在管理范围内",
    "builtin.view": "查看内置技能（{n}）",
    "builtin.hide": "收起内置技能",
    external: "非本插件创建",
    // 查看器：抽屉 / 整页共用的文案
    "viewer.title": "技能内容",
    "viewer.close": "关闭",
    "viewer.openPage": "在整页打开",
    "viewer.back": "返回列表",
    "viewer.tab.doc": "正文",
    "viewer.tab.files": "文件",
    "viewer.tab.info": "信息",
    "viewer.rendered": "渲染",
    "viewer.raw": "原文",
    "viewer.loading": "正在读取 SKILL.md…",
    "viewer.retry": "重试",
    "viewer.copyPath": "复制路径",
    "viewer.copyBody": "复制正文",
    "viewer.copied": "已复制",
    "viewer.copyFailed": "复制失败，请手动选中后复制",
    "viewer.gone": "这个技能已不在本地，查看器已关闭",
    "viewer.noSkill": "这个技能里没有 SKILL.md",
    "viewer.noSkillHint": "DSH 解析不到它，但目录里的其他文件仍可以看",
    "viewer.binary": "暂不支持预览",
    "viewer.binaryHint": "二进制或非文本文件，只显示文件名与大小",
    "viewer.textNote": "只读，直接显示源码",
    "viewer.tooLarge": "超过 {size}，只显示前一部分",
    "viewer.emptyFiles": "这个技能目录里没有可读的文件",
    "viewer.fileCount": "{n} 个文件",
    "viewer.size": "{size}",
    "viewer.backToBody": "回到 SKILL.md",
    "viewer.openInDoc": "在正文中打开",
    "viewer.toc": "目录",
    "viewer.readonlyNote": "只读，内容来自本机 SKILL.md",
    "viewer.info.basic": "标识",
    "viewer.info.name": "名称",
    "viewer.info.desc": "描述",
    "viewer.info.path": "本地路径",
    "viewer.info.source": "来源",
    "viewer.info.repo": "仓库",
    "viewer.info.ref": "基准",
    "viewer.info.commit": "commit",
    "viewer.info.skillPath": "skillPath",
    "viewer.info.hash": "内容哈希",
    "viewer.info.installedAt": "安装",
    "viewer.info.updatedAt": "更新",
    "viewer.info.size": "大小",
    "viewer.info.local": "本地",
    "viewer.info.localChange": "安装后改动",
    "viewer.info.localChangeNone": "无（与安装时一致）",
    "viewer.info.localChangeYes": "有改动",
    "viewer.info.links": "共享",
    "viewer.info.exported": "已共享",
    "viewer.info.visibility": "可见性",
    "viewer.info.mode": "状态",
    "viewer.info.status": "更新",
    "viewer.info.none": "无",
    "intro.button": "简介",
    "intro.open": "AI 简介：这个技能能做什么",
    "intro.title": "AI 简介",
    "intro.loading": "读取中…",
    "intro.empty": "还没有生成简介",
    "intro.generate": "生成简介",
    "intro.regenerate": "重新生成",
    "intro.generating": "生成中…",
    "intro.hint": "会把 SKILL.md 正文发送给当前配置的模型提供方",
    "intro.hintRemote": "会把该技能在 {source}@{commit} 的 SKILL.md 发送给当前配置的模型提供方",
    "intro.meta": "{model} · {time} · AI 生成，可能不准确",
    "intro.stale": "技能内容已更新，简介可能过期",
    "intro.view": "查看技能",
    "intro.unavailable": "当前宿主没有可用的模型服务",
    "intro.error.noModel": "还没有配置可用的模型",
    "intro.error.rateLimit": "模型限流或额度不足，请稍后再试",
    "intro.error.tooLarge": "技能正文超出模型上下文",
    "intro.error.timeout": "生成超时，请重试",
    "intro.error.auth": "模型提供方认证失败",
    "intro.error.empty": "模型没有返回内容",
    "intro.error.busy": "正在生成，请稍候",
    "intro.error.source": "读不到远端的 SKILL.md（仓库私有、已删除或网络问题）",
    "intro.error.noSource": "订阅快照里没有这个技能，请先点「检查更新」",
    "intro.error.subscription": "订阅不存在，可能已被取消",
    "intro.error.sourceTimeout": "读取远端 SKILL.md 超时，请重试",
    "intro.error.generic": "生成失败，请重试"
  },
  en: {
    "section.title": "Skills Console",
    "page.title": "Skills Console",
    "section.subtitle": "Manage local skills in one place: install, update, remove and share — so the same skill can be reused across agents.",
    "tab.installed": "Installed",
    "tab.subscriptions": "Subscriptions",
    "column.skill": "Skill",
    "column.agents": "Shared with",
    "column.policy": "Invocation",
    "column.actions": "Actions",
    "column.skillAgents": "Skill & agents",
    "column.policyActions": "Policy & actions",
    "column.repo": "Repository",
    "column.ref": "Ref",
    "column.entries": "Skills",
    "column.status": "Status",
    "action.addSkill": "Add skill",
    "action.addSubscription": "Add subscription",
    "action.checkUpdates": "Check for updates",
    "action.update": "Update",
    "action.updateAll": "Update all",
    "action.delete": "Delete",
    "action.unsubscribe": "Unsubscribe",
    "action.view": "View",
    "action.hide": "Hide",
    "action.exports": "Share settings",
    "action.install": "Install",
    "action.expand": "Expand",
    "action.collapse": "Collapse",
    "action.adopt": "Adopt",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "action.close": "Close",
    "action.choose": "Choose folder",
    "action.retry": "Reload",
    "view.flat": "Flat",
    "view.agent": "By agent",
    "exportDefault": "Auto-share on install",
    "settings.title": "Plugin settings",
    "placement.label": "Sidebar entry",
    "placement.effect": "Applies immediately",
    "placement.on": "on",
    "placement.off": "off",
    "placement.hint": "On: a Skills Console entry appears in the sidebar. Off: it only shows under Settings → Skills.",
    "github.open": "Open GitHub repository",
    "pluginUpdate.check": "Check for plugin updates",
    "pluginUpdate.title": "Check for plugin updates",
    "pluginUpdate.current": "Current version",
    "pluginUpdate.latest": "Latest version",
    "pluginUpdate.checking": "Checking…",
    "pluginUpdate.upToDate": "You are on the latest version",
    "pluginUpdate.available": "A new version is available",
    "pluginUpdate.checkFailed": "Could not reach the registry; please try again later",
    "pluginUpdate.recheck": "Check again",
    "pluginUpdate.update": "Update to {version}",
    "pluginUpdate.applying": "Updating…",
    "pluginUpdate.updated": "Updated to {version}; restart DSH to apply",
    "pluginUpdate.restartHint": "The update is installed. Restart DSH to use the new version.",
    "pluginUpdate.manual": "One-click update is unavailable here; run this manually:",
    "pluginUpdate.copy": "Copy command",
    "pluginUpdate.copied": "Copied",
    "pluginUpdate.close": "Close",
    "pluginUpdate.whatsNew": "What's new in v{version}",
    "pluginUpdate.releaseLoading": "Loading release notes…",
    "pluginUpdate.viewReleaseNotes": "View release notes on GitHub",
    "pluginUpdate.releaseUnavailable": "No release notes for this version.",
    "status.current": "Up to date",
    "status.update": "Update available",
    "status.local": "Changed since install",
    "status.localHint": "Files were changed after install or update. Updating overwrites them and asks for confirmation first. Check “View → Info” to compare",
    "status.conflict": "Changed · update available",
    "status.conflictHint": "Local files changed and upstream has new commits; updating overwrites your edits (old content is backed up and can be rolled back)",
    "status.deleted": "Removed upstream",
    "status.broken": "Broken link",
    "status.unmanaged": "Untracked",
    "status.unknown": "Not checked",
    "status.noUpstream": "No upstream",
    "status.noUpstreamHint": "No usable subscription source, so update checks are impossible; re-adopt or add a subscription",
    "status.off": "Disabled",
    "status.brokenHint": "The shared link is broken: share it again, or delete and reinstall",
    "adopt.switchHint": "Not tracked yet, cannot be enabled or disabled",
    "adopt.noUpstream": "No upstream source; update checks are unavailable",
    "toast.checked": "Checked",
    "mode.on": "Enabled",
    "mode.off": "Disabled",
    "mode.offHint": "Disabled for DSH’s model and `/` calls; the skill files, shares, and other agents are untouched",
    "policy.auto": "Auto",
    "policy.manual": "Manual only",
    "policy.hidden": "Fully disabled",
    "policy.legacy": "DSH-only hidden",
    "policy.author": "Manual · read-only",
    "policy.drift": "Needs repair",
    "policy.unmanaged": "Untracked",
    "policy.flat": "Flat .md unsupported",
    "policy.open": "Set invocation policy",
    "policy.title": "Invocation policy",
    "policy.subtitle": "Applies only to how DSH invokes this skill; project copies are untouched.",
    "policy.autoDesc": "The model and `/` can invoke it.",
    "policy.manualDesc": "The model will not invoke it; `/` still works.",
    "policy.hiddenDesc": "Invisible to every agent; restorable at any time.",
    "policy.authorHint": "The author fixed this skill to “Manual only”; the plugin will not override it — edit the skill file to restore auto.",
    "policy.legacyHint": "Legacy DSH-only disable: only hides DSH model calls; pick a mode to migrate.",
    "policy.driftHint": "The record and the skill file disagree; it may have been edited externally. Pick “Manual only” to retry.",
    "policy.hiddenConfirmTitle": "Fully disable this skill?",
    "policy.hiddenConfirmBody": "Every agent stops seeing it. Nothing is deleted, and you can restore at any time.",
    "policy.hiddenConfirm": "Disable fully",
    "policy.saving": "Saving…",
    "policy.saved": "Invocation policy updated",
    "policy.savedManual": "Set to manual only; kept after updates",
    "policy.savedAuto": "Auto restored",
    "policy.savedHidden": "Fully disabled; restorable at any time",
    "policy.unpark": "Restore",
    "policy.unparkTitle": "Restore skill",
    "policy.unparkBody": "Returns to the mode before disabling ({mode}); no re-download, and other settings stay as they are.",
    "policy.unparkDone": "Restored; the model and `/` follow the previous mode",
    "policy.manualOnlyHint": "Manual only: the model will not invoke it; `/` still works",
    "policy.hiddenHint": "Fully disabled: invisible to every agent; restorable",
    "policy.legacyNote": "Still on the legacy DSH-only disable",
    "policy.driftNote": "The manual-only marker needs repair",
    "policy.authorNote": "Set to manual only by the author; the plugin will not override it",
    "policy.hiddenNote": "Restores to the previous mode; updates and reinstalls are blocked while parked",
    "policy.unparkKept": "Restored; conflict copy kept at {path}",
    "policy.unparkDrift": "Restored, but the file differs from when it was parked; review or check for updates",
    "filter.manual": "Manual only",
    "visibility.hiddenHint": "Enabled, but no copy sits in a scan directory: check that the skill really exists under ~/.agents/skills, or inspect DSH_AGENTS_HOME.",
    "visibility.manualOnlyHint": "The skill author set it to “Manual only”: the model cannot invoke it, but manual `/` invocation still works.",
    "visibility.scopeMismatch": "Another copy of this skill ranks first (project or user directory); disabling only affects this copy.",
    "visibility.foreignWinner": "The model sees a different copy of this skill: {path} (its scan root ranks higher, so it shadows this one)",
    "exports.targets": "Share with which agents",
    "exports.detectedHint": "Only installed agents (existing directories) are listed. Sharing only affects them; whether DSH sees the skill is up to DSH, not sharing.",
    "exports.canonical": "Skill source: {path}; ticking an agent only makes it available there — nothing is copied.",
    "exports.none": "No agent directories available to share to on this machine",
    "exports.hint": "Saving adds or removes links; the skill itself stays where it is.",
    "exports.sharedUnknown": "shared directory unverified",
    "exportDefault.detected": "Share new installs with",
    "exportDefault.none": "No agents need sharing on this machine",
    "exportDefault.hint": "Nothing is checked by default: once a skill lands in ~/.agents/skills, DSH already sees it. Sharing only matters for agents that still read their own directory, and only affects future installs.",
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
    "form.skipped": "{n} skill(s) skipped: missing a name or description",
    "form.selectAll": "Select all",
    "form.selectNone": "Clear",
    "form.pickHint": "Enter a source and detect first. Pick one or more when the repo has several.",
    "form.noSkills": "No SKILL.md found; type skill names instead",
    "form.probeFailed": "Detection failed; you can still type names",
    "form.skills": "Skill names (comma separated)",
    "form.ref": "ref (branch / tag, optional)",
    "form.refHint": "empty follows the repository default branch",
    "form.subpath": "Subdirectory (optional)",
    "form.hint": "Downloads into ~/.agents/skills and shares it with agents per the auto-share setting.",
    "form.subHint": "Only records the repository; installs nothing.",
    "form.submitFailed": "Failed; please try again",
    "subscription.defaultRef": "default branch",
    "confirm.deleteTitle": "Delete skill",
    "confirm.deleteBody": "Removes it locally, disconnects the agent links this plugin created, and clears the record. A snapshot stays in trash for 7 days. Your source repo is untouched.",
    "confirm.updateTitle": "Local changes",
    "confirm.updateBody": "Updating overwrites local changes; the old content is backed up and can be rolled back.",
    "error.conflictTitle": "Delete blocked",
    "busy.working": "Working…",
    "meta.from": "from",
    "meta.noUpstream": "no upstream · updates not checked",
    "meta.noExport": "Not shared",
    "meta.noExportHint": "No links to agents that need them; agents that read ~/.agents/skills can use it as-is.",
    "meta.modelVisible": "visible to the model",
    "meta.modelHidden": "hidden from the model",
    "meta.manualOnly": "Manual only",
    "meta.agentsAll": "Shared with",
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
    "group.visible": "Model visible",
    "group.manual": "Manual only",
    "group.off": "Disabled",
    "group.hidden": "Enabled but hidden",
    installed: "installed",
    notInstalled: "not installed",
    skillCount: "skills",
    visibleOnly: "Visible to the model but not in the local skill library",
    visibleOnlyOther: "The model can see these, but they are not under ~/.agents/skills",
    visibleOnlyBuiltin: "This plugin only manages skills under ~/.agents/skills; built-in skills are out of scope",
    "builtin.view": "View built-ins ({n})",
    "builtin.hide": "Hide built-ins",
    external: "created outside this plugin",
    "adopt.done": "now tracked",
    // Viewer: shared by the drawer and the full page
    "viewer.title": "Skill content",
    "viewer.close": "Close",
    "viewer.openPage": "Open as page",
    "viewer.back": "Back to list",
    "viewer.tab.doc": "Content",
    "viewer.tab.files": "Files",
    "viewer.tab.info": "Info",
    "viewer.rendered": "Rendered",
    "viewer.raw": "Raw",
    "viewer.loading": "Reading SKILL.md…",
    "viewer.retry": "Retry",
    "viewer.copyPath": "Copy path",
    "viewer.copyBody": "Copy content",
    "viewer.copied": "Copied",
    "viewer.copyFailed": "Copy failed, select the text manually",
    "viewer.gone": "This skill is gone from disk; the viewer was closed",
    "viewer.noSkill": "This skill has no SKILL.md",
    "viewer.noSkillHint": "DSH cannot parse it, but the other files are still readable",
    "viewer.binary": "Preview not supported",
    "viewer.binaryHint": "Binary or non-text file: only the name and size are shown",
    "viewer.textNote": "Read-only source",
    "viewer.tooLarge": "Larger than {size}; showing the first part only",
    "viewer.emptyFiles": "No readable files in this skill folder",
    "viewer.fileCount": "{n} files",
    "viewer.size": "{size}",
    "viewer.backToBody": "Back to SKILL.md",
    "viewer.openInDoc": "Open in content",
    "viewer.toc": "Contents",
    "viewer.readonlyNote": "Read-only, content comes from the local SKILL.md",
    "viewer.info.basic": "Identity",
    "viewer.info.name": "Name",
    "viewer.info.desc": "Description",
    "viewer.info.path": "Local path",
    "viewer.info.source": "Origin",
    "viewer.info.repo": "Repository",
    "viewer.info.ref": "Baseline",
    "viewer.info.commit": "commit",
    "viewer.info.skillPath": "skillPath",
    "viewer.info.hash": "Content hash",
    "viewer.info.installedAt": "Installed",
    "viewer.info.updatedAt": "Updated",
    "viewer.info.size": "Size",
    "viewer.info.local": "Local",
    "viewer.info.localChange": "Changes since install",
    "viewer.info.localChangeNone": "None (matches install)",
    "viewer.info.localChangeYes": "Changed",
    "viewer.info.links": "Shared",
    "viewer.info.exported": "Shared",
    "viewer.info.visibility": "Visibility",
    "viewer.info.mode": "State",
    "viewer.info.status": "Updates",
    "viewer.info.none": "None",
    "intro.button": "Intro",
    "intro.open": "AI intro: what this skill does",
    "intro.title": "AI intro",
    "intro.loading": "Loading…",
    "intro.empty": "No intro yet",
    "intro.generate": "Generate intro",
    "intro.regenerate": "Regenerate",
    "intro.generating": "Generating…",
    "intro.hint": "Sends the SKILL.md body to the model provider configured in DSH",
    "intro.hintRemote": "Sends the SKILL.md at {source}@{commit} to the model provider configured in DSH",
    "intro.meta": "{model} · {time} · AI-generated, may be inaccurate",
    "intro.stale": "The skill changed; this intro may be out of date",
    "intro.view": "Open skill",
    "intro.unavailable": "No model service is available in this host",
    "intro.error.noModel": "No usable model is configured",
    "intro.error.rateLimit": "The model is rate-limited or out of quota; try again later",
    "intro.error.tooLarge": "The skill body exceeds the model context window",
    "intro.error.timeout": "Generation timed out; try again",
    "intro.error.auth": "The model provider rejected the credentials",
    "intro.error.empty": "The model returned no content",
    "intro.error.busy": "Already generating; please wait",
    "intro.error.source": "Could not read the remote SKILL.md (private repo, deleted, or network)",
    "intro.error.noSource": "This skill is not in the subscription snapshot; run “Check for updates” first",
    "intro.error.subscription": "The subscription no longer exists",
    "intro.error.sourceTimeout": "Timed out reading the remote SKILL.md; try again",
    "intro.error.generic": "Generation failed; try again"
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
  const translate = (key) => {
    const id = active();
    const pack = DICT[id] || DICT.zh;
    return pack[key] ?? DICT.zh[key] ?? key;
  };
  Object.defineProperty(translate, "lang", {
    get: () => active() === "en" ? "en" : "zh",
    enumerable: false
  });
  return translate;
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
function overlayHost() {
  if (typeof document === "undefined") return null;
  const root = document.querySelector?.(".dshsc-root");
  const dialog = root?.closest?.('[role="dialog"]');
  return dialog || document.querySelector?.("body") || null;
}
function portalize(node, target) {
  const host = target || (typeof document !== "undefined" ? document.body : null);
  return ReactDOM?.createPortal && host ? ReactDOM.createPortal(node, host) : node;
}
var overlayLayers = [];
var escapeGuarded = false;
function onOverlayEscape(event) {
  if (event.key !== "Escape" || overlayLayers.length === 0) return;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  overlayLayers[overlayLayers.length - 1].close();
}
function useOverlayLayer(active, close) {
  const closeRef = import_react.default.useRef(close);
  closeRef.current = close;
  import_react.default.useEffect(() => {
    if (!active || typeof document === "undefined") return void 0;
    const layer = { close: () => closeRef.current?.() };
    overlayLayers.push(layer);
    if (!escapeGuarded) {
      document.addEventListener("keydown", onOverlayEscape, true);
      escapeGuarded = true;
    }
    return () => {
      const index = overlayLayers.indexOf(layer);
      if (index >= 0) overlayLayers.splice(index, 1);
      if (overlayLayers.length === 0 && escapeGuarded) {
        document.removeEventListener("keydown", onOverlayEscape, true);
        escapeGuarded = false;
      }
    };
  }, [active]);
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
function DownloadIcon({ size = 14 }) {
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
    h("path", { d: "M12 4v12" }),
    h("path", { d: "M7 11l5 5 5-5" }),
    h("path", { d: "M4 20h16" })
  );
}
function ShareIcon({ size = 14 }) {
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
    h("rect", { x: 9.2, y: 2.8, width: 5.6, height: 5.6, rx: 1.2 }),
    h("rect", { x: 2.4, y: 15.4, width: 5.6, height: 5.6, rx: 1.2 }),
    h("rect", { x: 16, y: 15.4, width: 5.6, height: 5.6, rx: 1.2 }),
    h("path", { d: "M10.4 8.8 6.2 15.4" }),
    h("path", { d: "M13.6 8.8 17.8 15.4" })
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
var STROKE_ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
function EyeIcon({ size = 13 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      ...STROKE_ICON,
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("path", { d: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" }),
    h("circle", { cx: 12, cy: 12, r: 3 })
  );
}
function CopyIcon({ size = 13 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      ...STROKE_ICON,
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("rect", { x: 8, y: 8, width: 14, height: 14, rx: 2 }),
    h("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" })
  );
}
function ChevronLeftIcon({ size = 14 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      ...STROKE_ICON,
      "aria-hidden": true,
      style: { display: "block" }
    },
    h("path", { d: "m15 18-6-6 6-6" })
  );
}
function FileIcon({ size = 12 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      ...STROKE_ICON,
      "aria-hidden": true,
      style: { display: "block", flex: "none" }
    },
    h("path", { d: "M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z" }),
    h("path", { d: "M13 3.5V9h5" })
  );
}
function FolderIcon({ size = 12 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      ...STROKE_ICON,
      "aria-hidden": true,
      style: { display: "block", flex: "none" }
    },
    h("path", { d: "M3.5 7.5A1.5 1.5 0 0 1 5 6h4l1.8 2.2H19a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" })
  );
}

// client/section.js
var import_react10 = __toESM(require("react"), 1);

// client/scroll.js
function isScroller(node, tolerance = 4) {
  if (!node || typeof getComputedStyle !== "function") return false;
  const style = getComputedStyle(node);
  return Boolean(style && /(auto|scroll)/.test(style.overflowY || "") && node.scrollHeight > node.clientHeight + tolerance);
}
function nearestScroller(node, tolerance = 4) {
  let current = node?.parentElement || null;
  while (current) {
    if (isScroller(current, tolerance)) return current;
    current = current.parentElement || null;
  }
  return typeof document !== "undefined" ? document.scrollingElement || null : null;
}
function scrollHost(node, tolerance = 4) {
  if (isScroller(node, tolerance)) return node;
  return node && nearestScroller(node, tolerance) || node;
}

// client/styles.js
var CSS = `
  /* 主面板形态：页面本身固定不滚，滚动条只出现在列表区（.dshsc-listscroll）。
     页头 / 工具栏 / 筛选条是 flex:none 的固定行，行区域 flex:1 + overflow:auto。
     scrollbar-gutter 跟着滚动条一起挪到列表区：行区域变长/变短都不改变自身宽度，
     贴着 860 断点的布局不会因为滚动条出现整页翻面。 */
  .dshsc-page { box-sizing: border-box; width: 100%; height: 100%; overflow: hidden;
    padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) clamp(24px, 4vw, 48px) 48px; }
  .dshsc-page .dshsc-root { max-width: 980px; margin: 0 auto; }
  .dshsc-page .dshsc-title { font-size: 20px; font-weight: 500; line-height: 28px; }
  .dshsc-page .dshsc-sub { font-size: 13px; line-height: 20px; }
  /* 高度取满挂载面：侧栏 main 是 100%，设置页是宿主 .options 的内容高。
     宿主没给确定高度时（height:100% 解析为 auto）退化成外层滚动，不会把内容裁掉。 */
  .dshsc-root { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0;
    color: var(--dsw-alias-label-primary);
    container-type: inline-size; container-name: dshsc; }
  /* 页头 / 工具栏 / 顶部提示条高度不参与压缩；tab 面板吃满剩余高度，
     面板里的筛选条与说明固定，只有行区域（.dshsc-listscroll）自己出现滚动条。 */
  .dshsc-root > .dshsc-head, .dshsc-root > .dshsc-toolbar,
  .dshsc-root > .dshsc-banner, .dshsc-root > .dshsc-meta { flex: none; }
  .dshsc-tabpane { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .dshsc-tabpane > .dshsc-banner, .dshsc-tabpane > .dshsc-notice,
  .dshsc-tabpane > .dshsc-listbar { flex: none; }
  .dshsc-listscroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
    scrollbar-gutter: stable; }
  /* 页头：左标题块、右业务动作。动作组不靠固定断点换行——标题块的 flex-basis 用内容宽度
     （auto），放得下就同排、放不下（约 630px 以下）动作组自然换到第二行并靠右。
     这样窄面板（设置页 ~565px）会回到「动作在下、标识在上」，身份胶囊永远是完整的，
     也不会像 900px 断点那样被滚动条/几像素窗口变化推过临界点。 */
  .dshsc-head { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
  .dshsc-heading { display: flex; align-items: flex-start; gap: 10px; min-width: 0; flex: 1 1 auto; }
  .dshsc-heading-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dshsc-logo { flex: none; display: block; border-radius: 8px; }
  /* 标题不参与收窄：窄面板里让身份胶囊先省略，标题本身不折行 */
  .dshsc-title { font-size: 17px; font-weight: 600; letter-spacing: -.01em; margin: 0; flex: none; white-space: nowrap; }
  .dshsc-sub { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; max-width: 64ch; }
  .dshsc-form-error { font-size: 12px; line-height: 1.55; margin: 8px 0 0; max-width: 64ch; color: var(--dsw-alias-state-error-primary); }
  .dshsc-spacer { flex: 1; }
  .dshsc-head-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; margin-left: auto; }
  /* 标题行恒为一行：身份胶囊只在面板极窄（连标题行都放不下）时才省略，工具组不被挤走。
     不用 wrap 是因为一 wrap 就会按「身份胶囊整段」的宽度断行，窄面板里会折成 2~3 行、
     把页头撑高；行内换行交给外层页头（动作组下移），标识本身保持完整。 */
  .dshsc-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; }

  /* 身份：按「安装时输入的包名」显示（@scope/name@version），等宽只读、不描边 */
  .dshsc-id { display: inline-flex; align-items: center; box-sizing: border-box; min-width: 0;
    max-width: 100%; height: 22px; padding: 0 2px; color: var(--dsw-alias-label-tertiary);
    font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11px; line-height: 1; white-space: nowrap; }
  .dshsc-spec { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

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
  /* 刷新按钮：检查到新版本时右上角点个品牌色圆点 */
  .dshsc-tool-dot { position: relative; color: var(--dsw-alias-brand-primary); }
  .dshsc-tool-dot::after { content: ""; position: absolute; top: 3px; right: 3px; width: 6px; height: 6px;
    border-radius: 50%; background: var(--dsw-alias-state-warning-primary, #e8b15a); box-shadow: 0 0 0 1.5px var(--dsw-alias-bg-base); }
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
  /* 与 DSH 自带开关同尺寸/同 token：关是 border-l3 轨道，开是 brand-primary 轨道。
     0.5.0 换三档 chip 时这组规则被一起删掉，但「侧边栏入口」还在用 .dshsc-switch，补回来。 */
  .dshsc-switch { box-sizing: border-box; position: relative; flex: none; width: 36px; height: 20px; padding: 2px;
    border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer;
    transition: background .14s ease; }
  .dshsc-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-switch:disabled { cursor: not-allowed; opacity: .5; }
  .dshsc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
  .dshsc-knob { display: block; width: 16px; height: 16px; border-radius: 50%;
    background: var(--dsw-alias-switch-thumb, #fff); box-shadow: 0 1px 2px rgba(0, 0, 0, .28);
    transition: transform .12s ease, background .12s ease; }
  .dshsc-switch[aria-checked="true"] .dshsc-knob { transform: translateX(16px);
    background: var(--dsw-alias-label-primary-foreground, #fff); }

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
  .dshsc-row { display: grid; grid-template-columns: 280px minmax(0, 1fr) 150px 104px;
    gap: 14px; align-items: center;
    padding: 8px 12px 8px 14px; min-height: 54px; border-top: 1px solid var(--dsw-alias-border-l1);
    transition: background .12s ease; }
  .dshsc-list > .dshsc-row:first-child, .dshsc-listhead + .dshsc-row { border-top: 0; }
  /* 表头与行共用同一套列宽/间距，只有列语义；不参与排序或筛选。
     操作列暂按 4 个图标按钮（查看/更新/共享设置/删除）取 104px，三档 chip 落地、行内
     去掉重复的「查看」后收窄到设计稿的 92px。 */
  .dshsc-listhead { display: grid; grid-template-columns: 280px minmax(0, 1fr) 150px 104px;
    gap: 14px; align-items: center; padding: 7px 12px 7px 14px;
    border-bottom: 1px solid var(--dsw-alias-border-l1);
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 40%, var(--dsw-alias-bg-layer-1));
    color: var(--dsw-alias-label-tertiary); font-size: 10.5px; font-weight: 500; letter-spacing: .02em; }
  /* 行首有 6px 可见性圆点 + 7px 间距，表头跟名字对齐而不是跟圆点对齐 */
  .dshsc-listhead .dshsc-hskill { padding-left: 13px; }
  .dshsc-listhead .dshsc-hactions { text-align: right; padding-right: 2px; }
  .dshsc-col-narrow { display: none; }
  .dshsc-policy { min-width: 0; display: flex; align-items: center; }
  .dshsc-row:hover { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 48%, transparent); }
  .dshsc-row.off { opacity: .7; }
  .dshsc-cell { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .dshsc-namerow { display: flex; align-items: center; gap: 7px; min-width: 0; }
  /* 可见性状态点：中性表达（实心=模型可见，空心=模型不可见），不绑定任何 Agent 身份 */
  .dshsc-vdot { flex: none; width: 6px; height: 6px; border-radius: 50%; box-sizing: border-box;
    background: var(--dsw-alias-state-success-primary); opacity: .75; }
  .dshsc-vdot.hidden { background: transparent; border: 1px solid var(--dsw-alias-label-tertiary); opacity: .9; }
  .dshsc-name { font-size: 13px; font-weight: 600; letter-spacing: -.005em; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* 技能名本身是查看入口：清掉 button 默认外观，保留 hover 下划线提示可点 */
  .dshsc-namebtn { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 600;
    letter-spacing: -.005em; color: inherit; text-align: left; cursor: pointer; }
  .dshsc-namebtn:hover { text-decoration: underline; text-underline-offset: 2px; }
  .dshsc-namebtn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 4px; }
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

  /* 订阅：滚动容器本身就是卡片，表头 sticky 在同一滚动上下文里，列宽与行共用 */
  .dshsc-subscroll { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1); }
  .dshsc-subhead { position: sticky; top: 0; z-index: 3; display: grid;
    grid-template-columns: minmax(0, 1fr) 86px 178px 118px; gap: 10px; align-items: center;
    height: 30px; padding: 0 12px 0 14px; background: var(--dsw-alias-bg-layer-2);
    border-bottom: 1px solid var(--dsw-alias-border-l1); border-radius: 11px 11px 0 0;
    color: var(--dsw-alias-label-tertiary); font-size: 10.5px; font-weight: 500; letter-spacing: .02em; }
  .dshsc-subhead .dshsc-hrepo { padding-left: 32px; }
  .dshsc-subhead .dshsc-hact { text-align: right; padding-right: 2px; }
  .dshsc-sub-block { border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-subhead + .dshsc-sub-block { border-top: 0; }
  .dshsc-sub-block + .dshsc-sub-block { border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-sub-row { display: grid; grid-template-columns: minmax(0, 1fr) 86px 178px 118px;
    gap: 10px; align-items: center; padding: 8px 12px 8px 14px; min-height: 52px; }
  .dshsc-sub-repo { display: flex; align-items: center; gap: 8px; min-width: 0; }
  /* 宽屏把 Ref / 条目铺成两列，窄屏回到仓库名下方一行 */
  .dshsc-sub-meta { display: contents; }
  .dshsc-subref { justify-self: start; }
  .dshsc-caret { flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent;
    color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
  .dshsc-caret:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-caret:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-sub-row .dshsc-name { font-size: 12.5px; }
  .dshsc-substat { font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .dshsc-sub-row .dshsc-actions { justify-self: end; display: flex; align-items: center; gap: 2px; }
  .dshsc-sub-row .dshsc-btn { height: 24px; padding: 0 7px; font-size: 11.5px; display: inline-flex; align-items: center; }
  /* 条目缩进对齐仓库名：行左内边距 14 + caret 24 + 间距 8 = 46 */
  .dshsc-sub-list { display: flex; flex-direction: column; padding: 0 12px 7px 46px;
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 22%, transparent);
    border-top: 1px solid var(--dsw-alias-border-l1); }
  /* 条目操作列 92px 是照两枚按钮预留的，眼下每行只有一枚「安装」（两字 ≈ 43px：0 9px padding + 边框）。
     表头「操作」和已装行的破折号都按按钮宽度做一个右对齐的居中盒子：三者落在同一条中轴上，
     既不贴着列右缘，也不用改列宽 / 挪按钮。换语言或字号时盒子只是不再严格等于按钮宽度。 */
  .dshsc-sub-list { --dshsc-entry-act: 44px; }
  .dshsc-entryhead { display: grid; grid-template-columns: minmax(0, 1fr) 110px 92px; gap: 10px;
    align-items: center; height: 26px; border-bottom: 1px solid var(--dsw-alias-border-l1);
    color: var(--dsw-alias-label-tertiary); font-size: 10px; font-weight: 500; letter-spacing: .02em; }
  .dshsc-entryhead .right { justify-self: end; box-sizing: border-box; width: var(--dshsc-entry-act);
    text-align: center; padding-right: 0; }
  .dshsc-sub-entry { display: grid; grid-template-columns: minmax(0, 1fr) 110px 92px; gap: 10px;
    align-items: center; font-size: 12px; padding: 6px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-entryhead + .dshsc-sub-entry { border-top: 0; }
  .dshsc-sub-entry .dshsc-name { font-size: 12px; font-weight: 500; }
  /* 条目第一列：名字 + ✨ 同一行，作者原描述单独一行（超长省略，完整内容在 title） */
  .dshsc-sub-skill { min-width: 0; }
  .dshsc-sub-namerow { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .dshsc-sub-desc { margin-top: 1px; font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dshsc-state { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-state.ok svg { color: var(--dsw-alias-state-success-primary); }
  .dshsc-sub-entry .dshsc-actions { justify-self: end; display: flex; justify-content: flex-end; }
  .dshsc-sub-entry .dshsc-btn { height: 24px; padding: 0 9px; font-size: 11.5px; }
  /* 已装条目的操作列没有动作：破折号占位，居中在按钮宽度里，和表头、安装按钮同一条中轴 */
  .dshsc-sub-entry .dshsc-noop { box-sizing: border-box; width: var(--dshsc-entry-act); padding: 0;
    text-align: center; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 24px; }
  /* 设置页的真实宽度常常远小于窗口（侧栏 + 页面缩放），视口 media query 不可靠；
     以 .dshsc-root 自身宽度为准，窄面板时切两列，避免固定列把 Agent 标签挤成竖排。
     断点取 860 而不是贴着面板常见的 ~900：四列网格需要 280 + 150 + 操作列 + 3×14 gap + 中间列，
     860 已经够用；留出 ~40px 余量后，滚动条（5~15px）、窗口微调、页面缩放都不会把整页翻面。 */
  @container dshsc (max-width: 860px) {
    .dshsc-search input { width: 180px; }
    .dshsc-row { grid-template-columns: minmax(0, 1fr) 102px; row-gap: 3px; padding: 9px 12px; }
    .dshsc-cell { grid-column: 1; grid-row: 1; }
    .dshsc-agents { grid-column: 1; grid-row: 2; }
    .dshsc-policy { grid-column: 2; grid-row: 1; justify-content: flex-end; }
    .dshsc-row .dshsc-actions { grid-column: 2; grid-row: 2; }
    .dshsc-row .dshsc-btn { padding: 0 5px; }
    .dshsc-listhead { grid-template-columns: minmax(0, 1fr) 102px; padding: 7px 12px; }
    .dshsc-listhead .dshsc-hagents, .dshsc-listhead .dshsc-hpolicy { display: none; }
    .dshsc-listhead .dshsc-col-wide { display: none; }
    .dshsc-listhead .dshsc-col-narrow { display: inline; }
    /* 订阅表头收成「仓库 / 操作」，Ref 与条目数移到仓库名下 */
    .dshsc-subhead { grid-template-columns: minmax(0, 1fr) auto; }
    .dshsc-subhead .dshsc-href, .dshsc-subhead .dshsc-hcount { display: none; }
    .dshsc-sub-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 2px; padding: 8px 12px; }
    .dshsc-sub-repo { grid-column: 1; grid-row: 1; }
    .dshsc-sub-meta { display: flex; align-items: center; gap: 8px; min-width: 0; grid-column: 1; grid-row: 2; }
    .dshsc-sub-row .dshsc-actions { grid-column: 2; grid-row: 1 / span 2; }
    /* 展开条目：状态 / 操作两列收窄，技能名仍吃剩余宽度 */
    .dshsc-entryhead, .dshsc-sub-entry { grid-template-columns: minmax(0, 1fr) 96px 78px; }
  }
  .dshsc-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

  /* 调用策略 chip：一个入口显示当前模式；点开三档弹窗。窄列里允许省略，不撑破 102px */
  .dshsc-chip { box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
    height: 24px; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
    background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-family: inherit;
    font-size: 11.5px; font-weight: 500; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    cursor: pointer; transition: background .12s ease, border-color .12s ease; }
  .dshsc-chip::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%;
    background: currentColor; opacity: .9; }
  .dshsc-chip:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l3); }
  .dshsc-chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-chip:disabled { cursor: not-allowed; opacity: .55; }
  .dshsc-chip.auto { color: var(--dsw-alias-state-success-primary);
    border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 34%, var(--dsw-alias-border-l2));
    background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent); }
  .dshsc-chip.manual { color: var(--dsw-alias-brand-primary);
    border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, var(--dsw-alias-border-l2));
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
  .dshsc-chip.hidden { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
  .dshsc-chip.author, .dshsc-chip.drift { color: var(--dsw-alias-state-warn-primary);
    border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 34%, var(--dsw-alias-border-l2));
    background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); }
  .dshsc-chip.legacy { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-layer-2); }
  .dshsc-chip.muted { color: var(--dsw-alias-label-tertiary); cursor: default; opacity: .8; }

  /* 调用策略：标准居中弹窗（Overlay）里的单选列表；行距 / 圆点尺寸对齐共享设置的 .dshsc-check */
  .dshsc-policy-options { max-height: none; overflow: visible; }
  .dshsc-policyopt { box-sizing: border-box; display: flex; align-items: flex-start; gap: 9px; width: 100%;
    padding: 5px 8px; text-align: left; border: 0; border-radius: 8px;
    background: transparent; color: var(--dsw-alias-label-primary); font-family: inherit; cursor: pointer; }
  .dshsc-policyopt:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
  .dshsc-policyopt:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
  .dshsc-policyopt:disabled { cursor: not-allowed; opacity: .55; }
  .dshsc-policyopt.static { cursor: default; }
  .dshsc-policyopt.static:hover { background: transparent; }
  .dshsc-policyopt-dot { box-sizing: border-box; flex: none; width: 15px; height: 15px; margin-top: 2px;
    border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
  .dshsc-policyopt.active .dshsc-policyopt-dot { border: 5px solid var(--dsw-alias-brand-primary); }
  .dshsc-policyopt-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .dshsc-policyopt-body b { font-size: 13px; font-weight: 600; }
  .dshsc-policyopt-body small { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-policy-note { padding: 7px 9px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2);
    color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 15px; }
  .dshsc-policy-note.warn, .dshsc-policy-note.author { color: var(--dsw-alias-state-warn-primary);
    background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 9%, transparent); }
  .dshsc-policy-hidden { display: flex; flex-direction: column; gap: 8px; }
  .dshsc-policy-confirm { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, var(--dsw-alias-border-l1));
    background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent); }
  .dshsc-policy-confirm b { font-size: 12px; }
  .dshsc-policy-confirm p { margin: 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }

  .dshsc-overlay { position: fixed; inset: 0; background: rgba(4,6,9,.55); display: flex; align-items: center; justify-content: center;
    z-index: 60; padding: 20px; backdrop-filter: blur(2px); }
  .dshsc-modal { position: relative; width: min(600px, 100%); max-height: calc(100vh - 40px); overflow: auto;
    background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
    padding: 18px; display: flex; flex-direction: column; gap: 14px;
    box-shadow: 0 20px 56px rgba(0,0,0,.38), 0 2px 8px rgba(0,0,0,.18); }
  /* 64ch 是主页面长文的舒适行长；弹窗说明只有一两句，用满弹窗宽度，避免没必要的折行 */
  .dshsc-modal .dshsc-sub { max-width: none; }
  .dshsc-modal h3 { margin: 0; font-size: 15px; font-weight: 600; padding-right: 26px; }
  /* 插件更新弹窗的「当前 / 最新」键值对 */
  .dshsc-kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 12px; align-items: baseline; }
  .dshsc-kv dt { color: var(--dsw-alias-label-secondary); }
  .dshsc-kv dd { margin: 0; }
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
  /* 必选项（dsh 全局）：勾着但不可改，别让它看起来能点 */
  .dshsc-panel .dshsc-check.locked { cursor: default; }
  .dshsc-panel .dshsc-check.locked:hover { background: transparent; }

  .dshsc-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
  /* 弹窗页脚按钮可能是「图标 + 文字」：统一成水平排列，避免 svg(display:block) 把文字挤到下一行 */
  .dshsc-modal-foot .dshsc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
  .dshsc-modal-foot .dshsc-btn svg { display: block; }
  /* 插件更新弹窗里的「更新内容」（GitHub Release 正文）：限高滚动，长说明不撑爆弹窗 */
  .dshsc-release-head { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); margin-bottom: 6px; }
  .dshsc-release-body { max-height: 260px; overflow: auto; padding: 10px 12px; border-radius: 10px;
    background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-release-body .dshsc-md { font-size: 12.5px; }
  /* ---------- 查看器：抽屉（B1）/ 整页（A1）共用 ---------- */
  .dshsc-drawer-wrap { position: fixed; inset: 0; z-index: 55; }
  .dshsc-drawer-scrim { position: absolute; inset: 0; background: rgba(4,6,9,.55); }
  .dshsc-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(700px, 100vw); display: flex;
    flex-direction: column; min-height: 0; background: var(--dsw-alias-bg-layer-1);
    border-left: 1px solid var(--dsw-alias-border-l2); box-shadow: -30px 0 70px rgba(0,0,0,.38); outline: none; }
  .dshsc-reader-head { flex: none; padding: 15px 20px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-reader-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .dshsc-reader-title h2 { flex: 1; min-width: 0; margin: 0; font-size: 18px; line-height: 1.3; font-weight: 650;
    letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dshsc-reader-close { flex: none; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent;
    color: var(--dsw-alias-label-tertiary); font-size: 18px; line-height: 1; cursor: pointer; }
  .dshsc-reader-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-reader-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-reader-desc { margin: 7px 0 0; font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-secondary);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .dshsc-reader-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px;
    font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-tabs { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 20px;
    border-bottom: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-rtabs { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 9px; background: var(--dsw-alias-bg-layer-1); }
  .dshsc-rtab { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border: 0;
    border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
    cursor: pointer; white-space: nowrap; }
  .dshsc-rtab:hover { color: var(--dsw-alias-label-primary); }
  .dshsc-rtab.active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
    box-shadow: 0 0 0 1px var(--dsw-alias-border-l1), 0 1px 2px rgba(0,0,0,.12); }
  .dshsc-rtab .n { min-width: 15px; height: 15px; padding: 0 4px; box-sizing: border-box; border-radius: 999px;
    background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 20%, transparent); color: var(--dsw-alias-label-secondary);
    font-size: 10px; line-height: 15px; text-align: center; font-style: normal; font-variant-numeric: tabular-nums; }
  .dshsc-rtab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
  .dshsc-reader-seg { margin-left: auto; }
  .dshsc-reader-seg .dshsc-btn { height: 22px; font-size: 11.5px; padding: 0 8px; }

  .dshsc-reader-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px 22px; outline: none; }
  .dshsc-reader-doc { display: flex; flex-direction: column; gap: 10px; }
  .dshsc-reader-filebar { display: flex; align-items: center; gap: 10px; font-size: 11.5px;
    color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-filebar .dshsc-btn { margin-left: auto; height: 24px; font-size: 11.5px; }
  .dshsc-reader-raw { margin: 0; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
    background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.65; white-space: pre-wrap;
    word-break: break-word; }
  .dshsc-reader-actions { flex: none; display: flex; align-items: center; gap: 7px; padding: 9px 20px;
    border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); flex-wrap: wrap; }
  /* 底栏按钮统一 28px 高；图标按钮做成 28×28 的方正位，避免图标在方框里偏 */
  .dshsc-reader-actions .dshsc-btn { box-sizing: border-box; height: 28px; font-size: 12px;
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
  .dshsc-reader-actions .dshsc-btn.sq { width: 28px; padding: 0; }
  .dshsc-reader-actions .dshsc-btn.sq svg { width: 14px; height: 14px; }
  .dshsc-reader-note { margin-right: auto; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-skeleton { display: flex; flex-direction: column; gap: 8px; }
  .dshsc-reader-skeleton i { display: block; height: 12px; border-radius: 5px;
    background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 16%, transparent); }
  .dshsc-reader-skeleton i:nth-child(3) { width: 82%; }
  .dshsc-reader-skeleton i:nth-child(4) { width: 64%; }
  .dshsc-reader-skeleton span { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-placeholder { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 22px;
    border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px;
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent); font-size: 12.5px;
    color: var(--dsw-alias-label-secondary); line-height: 1.6; }
  .dshsc-reader-placeholder b { color: var(--dsw-alias-label-primary); font-size: 13px; }

  /* 文件 tab：抽屉里上下排；整页（宽容器）左树右预览 */
  .dshsc-reader-files { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; }
  .dshsc-reader-page .dshsc-reader-files { grid-template-columns: minmax(200px, 240px) minmax(0, 1fr); }
  .dshsc-reader-tree { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: auto;
    max-height: 300px; background: var(--dsw-alias-bg-layer-1); }
  .dshsc-reader-preview { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden;
    background: var(--dsw-alias-bg-layer-1); }
  .dshsc-reader-tree-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; background: var(--dsw-alias-bg-layer-2); border-bottom: 1px solid var(--dsw-alias-border-l1);
    font-size: 11px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-tree-head .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dshsc-reader-tree-head .dshsc-btn { height: 22px; font-size: 11px; padding: 0 7px; }
  /* 预览头的动作组：整组贴右，组内紧挨（渲染 / 原文 + 在正文中打开） */
  .dshsc-reader-tools { margin-left: auto; flex: none; display: flex; align-items: center; gap: 6px; }
  .dshsc-reader-tools:empty { display: none; }
  .dshsc-reader-tools .dshsc-segment { height: 22px; }
  .dshsc-reader-tools .dshsc-seg { margin-left: 0; }
  /* 预览头在深色 bg-layer-2 上，默认边框太淡：抬高一级，让它一眼是按钮 */
  .dshsc-reader-tools > .dshsc-btn { border: 1px solid var(--dsw-alias-border-l2);
    background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-weight: 500; }
  .dshsc-reader-tools > .dshsc-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3);
    border-color: var(--dsw-alias-border-l3); }
  .dshsc-reader-tools > .dshsc-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-reader-filebar .dshsc-btn { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
  .dshsc-reader-tdir { display: flex; align-items: center; gap: 6px; padding: 5px 10px; font-size: 11.5px;
    color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-tdir .n { margin-left: auto; font-variant-numeric: tabular-nums; }
  .dshsc-reader-titem { display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box;
    padding: 5px 10px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
    font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .dshsc-reader-titem:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-reader-titem.on { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    color: var(--dsw-alias-brand-primary); }
  .dshsc-reader-titem:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
  .dshsc-reader-titem .nname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
  .dshsc-reader-titem .nsize { flex: none; font-size: 10.5px; color: var(--dsw-alias-label-tertiary);
    font-variant-numeric: tabular-nums; }
  .dshsc-reader-preview .dshsc-reader-raw { border: 0; border-radius: 0; background: transparent;
    max-height: 320px; }
  /* 文件 tab 里能渲染的文件（markdown）直接出正文，不让人先读源码 */
  .dshsc-reader-preview-doc { padding: 12px 14px; max-height: 320px; overflow: auto; }
  .dshsc-reader-preview-doc .dshsc-md { font-size: 12.5px; }
  .dshsc-reader-preview-doc .dshsc-md h1.dshsc-md-h { font-size: 18px; }
  .dshsc-reader-preview-doc .dshsc-md h2.dshsc-md-h { font-size: 15px; }

  /* 信息 tab：四段 dl */
  .dshsc-reader-info { display: flex; flex-direction: column; gap: 14px; }
  .dshsc-info-sec { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 11px 13px;
    background: var(--dsw-alias-bg-layer-1); }
  .dshsc-info-sec h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .04em;
    color: var(--dsw-alias-label-tertiary); text-transform: uppercase; }
  .dshsc-info-sec dl { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 5px 10px; margin: 0;
    font-size: 12px; line-height: 1.55; }
  .dshsc-info-sec dt { color: var(--dsw-alias-label-tertiary); }
  .dshsc-info-sec dd { margin: 0; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
  .dshsc-info-sec dd.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

  /* 列表行的 ✨ 简介入口：只占一个小胶囊，不改变行高与列宽 */
  .dshsc-intro-btn { flex: none; display: inline-flex; align-items: center; gap: 3px;
    height: 19px; padding: 0 7px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
    background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 11px;
    line-height: 1; cursor: pointer; white-space: nowrap; }
  .dshsc-intro-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l3);
    background: var(--dsw-alias-bg-layer-1); }
  .dshsc-intro-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-intro-btn .dshsc-spark { font-size: 10px; color: var(--dsw-alias-brand-primary); }

  /* 简介弹窗：和调用策略一样走标准居中弹窗（Overlay），这里只调内容排版 */
  .dshsc-intro-sub { margin: 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dshsc-intro-text { margin: 0; font-size: 12.5px; line-height: 1.7; color: var(--dsw-alias-label-primary);
    white-space: pre-wrap; overflow-wrap: anywhere; }
  .dshsc-intro-note { margin: 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
  .dshsc-intro-meta { margin: 0; font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-intro-stale { margin: 0; font-size: 11px; line-height: 15px; color: var(--dsw-alias-state-warn-primary); }
  .dshsc-intro-error { margin: 0; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-state-error-primary); }

  /* 正文排版：只用 token，不写死深浅色 */
  .dshsc-md { font-size: 13.5px; line-height: 1.72; color: var(--dsw-alias-label-primary); }
  .dshsc-md-h { margin: 20px 0 8px; line-height: 1.35; font-weight: 650; letter-spacing: -.008em; }
  .dshsc-md-h:first-child { margin-top: 0; }
  .dshsc-md h1.dshsc-md-h { font-size: 21px; }
  .dshsc-md h2.dshsc-md-h { font-size: 16.5px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-md h3.dshsc-md-h { font-size: 14px; }
  .dshsc-md h4.dshsc-md-h, .dshsc-md h5.dshsc-md-h, .dshsc-md h6.dshsc-md-h { font-size: 13px;
    color: var(--dsw-alias-label-secondary); }
  .dshsc-md-p { margin: 0 0 10px; }
  .dshsc-md-inline { padding: 1px 5px; border-radius: 5px; background: var(--dsw-alias-bg-layer-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; }
  .dshsc-md-code { margin: 0 0 12px; padding: 11px 13px; border-radius: 9px; overflow: auto;
    background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.65; white-space: pre; }
  .dshsc-md-list { margin: 0 0 10px; padding-left: 20px; }
  .dshsc-md-list .dshsc-md-list { margin: 4px 0 0; }
  .dshsc-md-list li { margin-bottom: 4px; }
  .dshsc-md-task { list-style: none; margin-left: -18px; }
  .dshsc-md-check { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border-radius: 3px;
    border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); vertical-align: -1px; }
  .dshsc-md-check.on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
  .dshsc-md-quote { margin: 0 0 12px; padding: 6px 0 6px 12px; border-left: 2px solid var(--dsw-alias-border-l3);
    color: var(--dsw-alias-label-secondary); }
  .dshsc-md-quote .dshsc-md-p:last-child { margin-bottom: 0; }
  .dshsc-md-hr { height: 0; margin: 16px 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-md-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }
  .dshsc-md-link:hover { text-decoration: underline; }
  .dshsc-md-nolink { color: inherit; border-bottom: 1px dotted var(--dsw-alias-border-l3); }
  .dshsc-md-image { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 6px;
    border: 1px dashed var(--dsw-alias-border-l2); color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
  .dshsc-md-image-tag { font-size: 9.5px; letter-spacing: .06em; }
  .dshsc-md-table { margin: 0 0 12px; overflow: auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; }
  .dshsc-md-table table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  .dshsc-md-table th, .dshsc-md-table td { padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1);
    text-align: left; }
  .dshsc-md-table th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
  .dshsc-md-table tr:last-child td { border-bottom: 0; }

  /* 整页（A1）：返回条 + hero + 目录 + 720px 正文。
     root 高度固定后，整页阅读器也自己撑满：顶栏 / hero 固定，正文列内部滚动，
     返回按钮不会跟着长文滚走。 */
  .dshsc-reader-page { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .dshsc-reader-page > .dshsc-reader-topbar, .dshsc-reader-page > .dshsc-reader-hero { flex: none; }
  .dshsc-reader-topbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .dshsc-reader-topbar .dshsc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    box-sizing: border-box; height: 28px; padding: 0 10px; font-size: 12px; line-height: 1; white-space: nowrap; }
  .dshsc-reader-topbar .dshsc-btn.ghost { padding: 0 9px; }
  .dshsc-reader-topbar .dshsc-btn.sq { width: 28px; padding: 0; }
  .dshsc-reader-topbar .dshsc-btn.sq svg { width: 14px; height: 14px; }
  .dshsc-reader-crumb { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px;
    color: var(--dsw-alias-label-tertiary); }
  .dshsc-reader-crumb .sep { color: var(--dsw-alias-border-l3); }
  .dshsc-reader-topbar .spacer { flex: 1; }
  /* 顶栏复用抽屉底栏那份动作组：去掉边框 / 底色 / 内边距，只留一排等高的按钮 */
  .dshsc-reader-topbar .dshsc-reader-actions { border: 0; background: transparent; padding: 0; gap: 6px;
    flex-wrap: nowrap; }
  .dshsc-reader-topbar .dshsc-reader-note { display: none; }
  .dshsc-reader-topbar .dshsc-reader-actions .dshsc-btn:not(.ghost) { padding: 0 11px; }
  .dshsc-reader-hero { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1); }
  .dshsc-reader-hero .dshsc-reader-head { border-bottom: 0; }
  .dshsc-reader-hero .dshsc-reader-desc { -webkit-line-clamp: 3; max-width: 78ch; }
  .dshsc-reader-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr);
    gap: 18px; align-items: stretch; }
  /* 只有目录真的在的时候才开第二轨：否则唯一的正文列会被自动摆进 180px 的目录轨，
     文件 / 信息 tab 会窄成一条（树里的文件名被截断、预览挤到下面）。 */
  .dshsc-reader-layout.has-toc { grid-template-columns: 180px minmax(0, 1fr); }
  .dshsc-reader-toc { position: sticky; top: 0; display: flex; flex-direction: column; gap: 1px;
    max-height: 70vh; overflow: auto; padding-right: 4px; }
  .dshsc-reader-toc-title { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase;
    color: var(--dsw-alias-label-tertiary); margin-bottom: 5px; }
  .dshsc-reader-tocitem { border: 0; background: transparent; padding: 3px 7px; border-radius: 6px; text-align: left;
    font: inherit; font-size: 11.5px; line-height: 1.45; color: var(--dsw-alias-label-secondary); cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dshsc-reader-tocitem.l2 { padding-left: 15px; }
  .dshsc-reader-tocitem.l3, .dshsc-reader-tocitem.l4 { padding-left: 23px; font-size: 11px; }
  .dshsc-reader-tocitem:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-reader-tocitem.on { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    color: var(--dsw-alias-brand-primary); }
  .dshsc-reader-tocitem:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
  .dshsc-reader-col { display: flex; flex-direction: column; min-width: 0; min-height: 0;
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 12px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
  .dshsc-reader-col .dshsc-reader-tabs { border-top: 0; }
  .dshsc-reader-page .dshsc-reader-body { max-height: none; }
  .dshsc-reader-page .dshsc-md { max-width: 720px; }
  .dshsc-reader-page .dshsc-reader-actions { border-radius: 0 0 12px 12px; }

  /* 与列表同一个页面断点（860）：窄面板里行内「查看」让位、整页目录收起 */
  @container dshsc (max-width: 860px) {
    /* 行内「查看」先让位：技能名本身仍是入口 */
    .dshsc-row .dshsc-view { display: none; }
    .dshsc-reader-layout.has-toc { grid-template-columns: minmax(0, 1fr); }
    .dshsc-reader-page .dshsc-reader-files { grid-template-columns: minmax(0, 1fr); }
    .dshsc-reader-toc { display: none; }
    .dshsc-reader-page .dshsc-reader-desc { -webkit-line-clamp: 2; }
  }

  /* 描述默认按行数截断；真被截断时下面给「展开 / 收起」，所以要压在上面所有 clamp 规则之后 */
  .dshsc-reader-descblock { display: flex; flex-direction: column; align-items: flex-start; }
  .dshsc-reader-desc.expanded { display: block; overflow: visible; -webkit-line-clamp: unset; }
  .dshsc-reader-more { margin-top: 3px; padding: 0; border: 0; border-radius: 4px; background: transparent;
    color: var(--dsw-alias-brand-primary); font: inherit; font-size: 11.5px; line-height: 1.6; cursor: pointer; }
  .dshsc-reader-more:hover { text-decoration: underline; }
  .dshsc-reader-more:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

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
    const mode = row.enabled === false ? "on" : "off";
    await run(`mode:${row.name}`, () => apiCall("POST", `/skills/${encodeURIComponent(row.name)}/mode`, { mode }));
  }
  async function setInvocation(row, mode) {
    await run(`invocation:${row.name}`, async () => {
      const result = await apiCall("POST", `/skills/${encodeURIComponent(row.name)}/invocation`, { mode });
      const saved = mode === "hidden" ? t("policy.savedHidden") : mode === "manual" ? t("policy.savedManual") : t("policy.savedAuto");
      setToast({ kind: "ok", text: `${row.name} · ${saved}` });
      return result;
    });
  }
  async function unpark(row) {
    await run(`unpark:${row.name}`, async () => {
      const result = await apiCall("POST", `/skills/${encodeURIComponent(row.name)}/unpark`, {});
      setToast({
        kind: result.hashMismatch ? "err" : "ok",
        text: result.kept ? `${row.name} · ${t("policy.unparkKept").replace("{path}", result.kept)}` : result.hashMismatch ? `${row.name} · ${t("policy.unparkDrift")}` : `${row.name} · ${t("policy.unparkDone")}`
      });
      return result;
    });
  }
  function requestUnpark(row) {
    setModal({
      type: "confirm-unpark",
      row,
      onConfirm: () => {
        setModal(null);
        void unpark(row);
      }
    });
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
  async function saveExports(row, targets) {
    const current = new Set(row.exports.map((item) => item.target));
    const desired = new Set(targets);
    const toRemove = [...current].filter((target) => !desired.has(target));
    const toAdd = [...desired].filter((target) => !current.has(target));
    await run(`exports:${row.name}`, async () => {
      if (toRemove.length > 0) {
        await apiCall("POST", "/exports", { skill: row.name, targets: toRemove, action: "remove" });
      }
      if (toAdd.length > 0) {
        await apiCall("POST", "/exports", { skill: row.name, targets: toAdd, action: "add" });
      }
    });
    setToast({ kind: "ok", text: `${row.name} · ${t("action.exports")} ✓` });
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
    try {
      await run("install", async () => {
        const result = await apiCall("POST", "/install", { source: String(source || "").trim(), skills });
        const warnings = result.warnings?.length || 0;
        setToast({
          kind: warnings ? "err" : "ok",
          text: `${result.installed?.length || 0} ${t("skillCount")}${warnings ? ` · ${warnings} 条提示` : ""}`
        });
        return result;
      }, { toastError: false });
      setModal(null);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
  async function addSubscription(form) {
    try {
      const result = await run("subscribe", async () => {
        const res = await apiCall("POST", "/subscriptions", {
          source: form.source.trim(),
          ref: form.ref.trim() || void 0,
          subpath: form.subpath.trim() || void 0
        });
        setToast({ kind: "ok", text: res.subscription?.source || form.source });
        return res;
      }, { toastError: false });
      setModal(null);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
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
    setInvocation,
    requestUnpark,
    requestUpdate,
    updateAll,
    checkUpdates,
    requestDelete,
    saveExports,
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
    async (label, task, { toastError = true } = {}) => {
      setBusy(label);
      try {
        const result = await task();
        await reload();
        return result;
      } catch (err) {
        if (toastError) setToast({ kind: "err", text: err.message });
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
function useSkillReader(row) {
  const name = row?.name || null;
  const stamp = row ? [row.commit || "", row.currentHash || "", row.updatedAt || "", row.status || ""].join("|") : "";
  const [state, setState] = import_react2.default.useState({ loading: true, body: null, tree: null, bodyError: null, treeError: null });
  const [file, setFile] = import_react2.default.useState({ relPath: null, content: "", size: 0, truncated: false, loading: false, error: null });
  const [tick, setTick] = import_react2.default.useState(0);
  const seq = import_react2.default.useRef(0);
  const fileSeq = import_react2.default.useRef(0);
  import_react2.default.useEffect(() => {
    if (!name) {
      setState({ loading: false, body: null, tree: null, bodyError: null, treeError: null });
      return;
    }
    const ticket = seq.current + 1;
    seq.current = ticket;
    setState({ loading: true, body: null, tree: null, bodyError: null, treeError: null });
    const encoded = encodeURIComponent(name);
    void (async () => {
      const [bodyResult, treeResult] = await Promise.allSettled([
        apiCall("GET", `/skills/${encoded}`),
        apiCall("GET", `/skills/${encoded}/files`)
      ]);
      if (ticket !== seq.current) return;
      setState({
        loading: false,
        body: bodyResult.status === "fulfilled" ? bodyResult.value : null,
        tree: treeResult.status === "fulfilled" ? treeResult.value : null,
        // 没有 SKILL.md 时正文失败但树还在：文件 tab 仍可用
        bodyError: bodyResult.status === "rejected" ? { code: bodyResult.reason?.code || null, message: bodyResult.reason?.message || "读取失败" } : null,
        treeError: treeResult.status === "rejected" ? { code: treeResult.reason?.code || null, message: treeResult.reason?.message || "读取失败" } : null
      });
    })();
  }, [name, stamp, tick]);
  const loadFile = import_react2.default.useCallback(async (relPath) => {
    if (!name || !relPath) return;
    const ticket = fileSeq.current + 1;
    fileSeq.current = ticket;
    setFile({ relPath, content: "", size: 0, truncated: false, loading: true, error: null });
    try {
      const result = await apiCall("GET", `/skills/${encodeURIComponent(name)}?path=${encodeURIComponent(relPath)}`);
      if (ticket !== fileSeq.current) return;
      setFile({
        relPath: result.relPath || relPath,
        content: result.content || "",
        size: result.size || 0,
        truncated: Boolean(result.truncated),
        loading: false,
        error: null,
        mtime: result.mtime || null
      });
    } catch (error) {
      if (ticket !== fileSeq.current) return;
      setFile({
        relPath,
        content: "",
        size: 0,
        truncated: false,
        loading: false,
        error: { code: error?.code || null, message: error?.message || "读取失败" }
      });
    }
  }, [name]);
  const retry = import_react2.default.useCallback(() => {
    setTick((value) => value + 1);
  }, []);
  return { state, file, loadFile, retry };
}
function useSkillIntro({ name, lang, stamp, enabled = true, endpoint = null }) {
  const base = endpoint || `/skills/${encodeURIComponent(name)}/intro`;
  const [state, setState] = import_react2.default.useState({ loading: true, intro: null, capability: null, error: null });
  const [generating, setGenerating] = import_react2.default.useState(false);
  const [genError, setGenError] = import_react2.default.useState(null);
  const seq = import_react2.default.useRef(0);
  const controller = import_react2.default.useRef(null);
  import_react2.default.useEffect(() => {
    if (!name || !enabled) {
      setState({ loading: false, intro: null, capability: null, error: null });
      return;
    }
    const ticket = seq.current + 1;
    seq.current = ticket;
    setState({ loading: true, intro: null, capability: null, error: null });
    void (async () => {
      try {
        const result = await apiCall("GET", `${base}?lang=${encodeURIComponent(lang || "zh")}`);
        if (ticket !== seq.current) return;
        setState({ loading: false, intro: result.intro || null, capability: result.capability || null, error: null });
      } catch (error) {
        if (ticket !== seq.current) return;
        setState({
          loading: false,
          intro: null,
          capability: null,
          error: { code: error?.code || null, message: error?.message || "读取失败" }
        });
      }
    })();
  }, [name, lang, stamp, enabled, base]);
  import_react2.default.useEffect(() => () => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
    }
  }, [name, lang, base]);
  const generate = import_react2.default.useCallback(async (force = false) => {
    if (!name) return null;
    if (controller.current) return null;
    const ctrl = new AbortController();
    controller.current = ctrl;
    setGenerating(true);
    setGenError(null);
    try {
      const result = await apiCall(
        "POST",
        base,
        { lang: lang || "zh", force: Boolean(force) },
        { signal: ctrl.signal }
      );
      setState({ loading: false, intro: result.intro || null, capability: result.capability || null, error: null });
      return result;
    } catch (error) {
      if (error?.name === "AbortError") return null;
      setGenError({ code: error?.code || null, message: error?.message || "生成失败" });
      return null;
    } finally {
      if (controller.current === ctrl) controller.current = null;
      setGenerating(false);
    }
  }, [name, lang, base]);
  return { ...state, generating, genError, generate };
}
function usePluginUpdate() {
  const [status, setStatus] = import_react2.default.useState(null);
  const [checking, setChecking] = import_react2.default.useState(false);
  const [applying, setApplying] = import_react2.default.useState(false);
  const [checkError, setCheckError] = import_react2.default.useState(null);
  const [applyError, setApplyError] = import_react2.default.useState(null);
  const [release, setRelease] = import_react2.default.useState({ loading: false, data: null, version: null });
  const inFlight = import_react2.default.useRef(false);
  const check = import_react2.default.useCallback(async (fresh = false) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const next = await checkPluginUpdate({ fresh });
      setStatus(next);
      return next;
    } catch (error) {
      setCheckError({ code: error?.code || null, message: error?.message || "检查失败" });
      return null;
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, []);
  const apply2 = import_react2.default.useCallback(async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const next = await applyPluginUpdate();
      setStatus(next);
      return next;
    } catch (error) {
      setApplyError({
        code: error?.code || null,
        message: error?.message || "更新失败",
        detail: error?.detail || null
      });
      return null;
    } finally {
      setApplying(false);
    }
  }, []);
  const loadRelease = import_react2.default.useCallback(async (version) => {
    const target = String(version || "").trim();
    if (!target) return null;
    setRelease({ loading: true, data: null, version: target });
    try {
      const data = await fetchPluginRelease(target);
      setRelease({ loading: false, data: data || null, version: target });
      return data;
    } catch {
      setRelease({ loading: false, data: null, version: target });
      return null;
    }
  }, []);
  return { status, checking, applying, checkError, applyError, check, apply: apply2, release, loadRelease };
}

// client/views/header.js
function installSpec(plugin) {
  const name = plugin?.fullName || plugin?.name;
  if (!name) return null;
  return plugin.version ? `${name}@${plugin.version}` : name;
}
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
  pluginUpdate,
  onCheckUpdate,
  onToggleSettings,
  onChangePlacement,
  onOpenAutoLink,
  onAddSkill,
  onAddSubscription
}) {
  const spec = installSpec(plugin);
  const updateAvailable = Boolean(pluginUpdate?.status?.updateAvailable);
  const headTools = h(
    "div",
    { className: "dshsc-tools" },
    // 刷新按钮放在 GitHub 前面：点一下检查插件自身版本，有新版本时高亮提示
    h("button", {
      className: `dshsc-tool${updateAvailable ? " dshsc-tool-dot" : ""}`,
      type: "button",
      title: t("pluginUpdate.check"),
      "aria-label": t("pluginUpdate.check"),
      onClick: onCheckUpdate
    }, h(RefreshIcon, { size: 15 })),
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
          // 身份：按「安装时输入的包名」显示，点一下整段复制（Host 从 package.json 注入）
          // 身份：按「安装时输入的包名」显示，只读展示（Host 从 package.json 注入）
          spec ? h(
            "span",
            { className: "dshsc-id", title: spec },
            h("span", { className: "dshsc-spec" }, spec)
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
        title: `${t("exportDefault")}：${autoLinkLabel}`,
        "aria-label": `${t("exportDefault")}：${autoLinkLabel}`,
        onClick: onOpenAutoLink
      }, `${t("exportDefault")} · ${autoLinkCount} ▾`),
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
var import_react4 = __toESM(require("react"), 1);

// client/views/overlay.js
function Overlay({ t, title, children, footer, onCancel, dismissible = true }) {
  useOverlayLayer(true, dismissible ? onCancel : () => {
  });
  return portalize(h(
    "div",
    { className: "dshsc-overlay", onClick: (event) => {
      if (dismissible && event.target === event.currentTarget) onCancel?.();
    } },
    h(
      "div",
      { className: "dshsc-modal", role: "dialog", "aria-modal": "true" },
      h("button", {
        className: "dshsc-modal-close",
        "aria-label": t("action.cancel"),
        disabled: !dismissible,
        onClick: (event) => {
          event.stopPropagation();
          if (dismissible) onCancel?.();
        }
      }, "×"),
      h("h3", null, title),
      children,
      h("div", { className: "dshsc-modal-foot" }, footer)
    )
  ), overlayHost());
}

// client/views/intro-modal.js
var ERROR_KEY = {
  "error.skills.intro-no-model": "intro.error.noModel",
  "error.skills.intro-rate-limit": "intro.error.rateLimit",
  "error.skills.intro-quota": "intro.error.rateLimit",
  "error.skills.intro-too-large": "intro.error.tooLarge",
  "error.skills.intro-timeout": "intro.error.timeout",
  "error.skills.intro-auth": "intro.error.auth",
  "error.skills.intro-empty": "intro.error.empty",
  "error.skills.intro-busy": "intro.error.busy",
  "error.skills.intro-source": "intro.error.source",
  "error.skills.subscription-not-found": "intro.error.subscription",
  "error.skills.intro-source-timeout": "intro.error.sourceTimeout",
  "error.skills.intro-no-source": "intro.error.noSource"
};
function formatWhen(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function modelLabel(intro) {
  if (!intro?.model) return "—";
  return intro.provider ? `${intro.provider}/${intro.model}` : intro.model;
}
function IntroModal({
  t,
  name,
  stamp = "",
  subtitle = null,
  endpoint = null,
  capability,
  hint = null,
  viewLabel = null,
  onClose,
  onView = null
}) {
  const enabled = capability?.enabled !== false;
  const available = capability?.available !== false;
  const intro = useSkillIntro({
    name,
    lang: t.lang || "zh",
    stamp,
    enabled,
    endpoint
  });
  const failure = intro.genError || intro.error;
  const failureKey = failure?.code ? ERROR_KEY[failure.code] || "intro.error.generic" : null;
  const meta = intro.intro ? t("intro.meta").replace("{model}", modelLabel(intro.intro)).replace("{time}", formatWhen(intro.intro.generatedAt) || "—") : "";
  const actions = [];
  if (intro.intro) {
    actions.push(h("button", {
      type: "button",
      key: "regen",
      className: "dshsc-btn ghost",
      disabled: intro.generating || !available,
      onClick: () => {
        void intro.generate(true);
      }
    }, intro.generating ? t("intro.generating") : t("intro.regenerate")));
    if (onView) {
      actions.push(h("button", {
        type: "button",
        key: "view",
        className: "dshsc-btn primary",
        onClick: onView
      }, viewLabel || t("intro.view")));
    }
  } else {
    actions.push(h("button", {
      type: "button",
      key: "gen",
      className: "dshsc-btn primary",
      disabled: intro.generating || !available || !enabled,
      onClick: () => {
        void intro.generate(false);
      }
    }, intro.generating ? t("intro.generating") : t("intro.generate")));
  }
  return h(
    Overlay,
    {
      t,
      title: `✨ ${t("intro.title")}`,
      onCancel: onClose,
      footer: actions
    },
    h("p", { className: "dshsc-intro-sub", key: "sub", title: subtitle || name }, subtitle || name),
    intro.loading ? h("p", { className: "dshsc-intro-note", key: "loading" }, t("intro.loading")) : intro.intro ? h("p", { className: "dshsc-intro-text", key: "text" }, intro.intro.text) : h("p", { className: "dshsc-intro-note", key: "empty" }, t("intro.empty")),
    intro.intro?.stale ? h("p", { className: "dshsc-intro-stale", key: "stale" }, t("intro.stale")) : null,
    failureKey ? h("p", { className: "dshsc-intro-error", key: "error" }, t(failureKey)) : null,
    meta ? h("p", { className: "dshsc-intro-meta", key: "meta" }, meta) : null,
    available && !intro.intro && !intro.loading ? h("p", { className: "dshsc-intro-meta", key: "hint" }, hint || t("intro.hint")) : null,
    !available ? h("p", { className: "dshsc-intro-error", key: "unavailable" }, t("intro.unavailable")) : null
  );
}

// client/views/policy-modal.js
var import_react3 = __toESM(require("react"), 1);
function PolicyModal({ t, row, busy, onClose, onSave, onUnpark }) {
  const initial = row.mode === "hidden" ? "auto" : row.mode;
  const [mode, setMode] = import_react3.default.useState(initial);
  const [confirming, setConfirming] = import_react3.default.useState(false);
  const hidden = row.mode === "hidden";
  const author = row.origin === "author" && row.mode === "manual";
  const flat = row.kind === "file";
  const dirty = mode !== initial || Boolean(row.legacy) || Boolean(row.drift);
  function choose(next) {
    setMode(next);
    setConfirming(false);
  }
  function submit() {
    if (mode === "hidden" && !hidden && !confirming) {
      setConfirming(true);
      return;
    }
    onSave(mode);
  }
  const option = (id, label, desc) => h(
    "button",
    {
      type: "button",
      key: `policy-${id}`,
      className: `dshsc-policyopt${mode === id ? " active" : ""}`,
      role: "radio",
      "aria-checked": String(mode === id),
      disabled: busy || flat,
      onClick: () => choose(id)
    },
    h("span", { className: "dshsc-policyopt-dot", "aria-hidden": "true" }),
    h(
      "span",
      { className: "dshsc-policyopt-body" },
      h("b", null, label),
      h("small", null, desc)
    )
  );
  const footer = confirming ? [
    h("button", {
      type: "button",
      key: "cancel",
      className: "dshsc-btn ghost",
      disabled: busy,
      onClick: () => setConfirming(false)
    }, t("action.cancel")),
    h("button", {
      type: "button",
      key: "confirm",
      className: "dshsc-btn danger",
      disabled: busy,
      onClick: () => onSave("hidden")
    }, busy ? t("policy.saving") : t("policy.hiddenConfirm"))
  ] : hidden ? [
    h("button", { type: "button", key: "cancel", className: "dshsc-btn ghost", onClick: onClose }, t("action.cancel")),
    h("button", {
      type: "button",
      key: "restore",
      className: "dshsc-btn primary",
      disabled: busy,
      onClick: onUnpark
    }, t("policy.unpark"))
  ] : [
    h("button", { type: "button", key: "cancel", className: "dshsc-btn ghost", onClick: onClose }, t("action.cancel")),
    h("button", {
      type: "button",
      key: "save",
      className: "dshsc-btn primary",
      disabled: busy || !dirty || flat,
      onClick: submit
    }, busy ? t("policy.saving") : t("action.save"))
  ];
  return h(
    Overlay,
    {
      t,
      title: t("policy.title"),
      onCancel: onClose,
      footer
    },
    h("p", { className: "dshsc-sub", key: "sub" }, t("policy.subtitle")),
    author ? h("div", { className: "dshsc-policy-note author", key: "author" }, t("policy.authorHint")) : null,
    row.legacy ? h("div", { className: "dshsc-policy-note", key: "legacy" }, t("policy.legacyHint")) : null,
    row.drift ? h("div", { className: "dshsc-policy-note warn", key: "drift" }, t("policy.driftHint")) : null,
    hidden ? h(
      "div",
      { className: "dshsc-policy-hidden", key: "hidden" },
      h(
        "div",
        { className: "dshsc-panel" },
        h(
          "div",
          { className: "dshsc-policyopt active static", role: "radio", "aria-checked": "true" },
          h("span", { className: "dshsc-policyopt-dot", "aria-hidden": "true" }),
          h(
            "span",
            { className: "dshsc-policyopt-body" },
            h("b", null, t("policy.hidden")),
            h("small", null, t("policy.hiddenDesc"))
          )
        )
      ),
      h("p", { className: "dshsc-sub" }, t("policy.hiddenHint"))
    ) : h(
      "div",
      { className: "dshsc-panel dshsc-policy-options", key: "options", role: "radiogroup", "aria-label": t("policy.title") },
      option("auto", t("policy.auto"), t("policy.autoDesc")),
      option("manual", t("policy.manual"), t("policy.manualDesc")),
      option("hidden", t("policy.hidden"), t("policy.hiddenDesc"))
    ),
    confirming ? h(
      "div",
      { className: "dshsc-policy-confirm", key: "confirm" },
      h("b", null, t("policy.hiddenConfirmTitle")),
      h("p", null, t("policy.hiddenConfirmBody"))
    ) : null
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
  const [policy, setPolicy] = import_react4.default.useState(null);
  const [intro, setIntro] = import_react4.default.useState(null);
  const sharedTargets = new Set((data?.agents?.detected || []).filter((agent) => agent.kind === "agent" && agent.sharedHome === "yes").map((agent) => agent.target));
  import_react4.default.useEffect(() => {
    if (!policy) return;
    if (rows.some((row) => row.name === policy.row.name)) return;
    setPolicy(null);
  }, [policy, rows]);
  import_react4.default.useEffect(() => {
    if (!intro) return;
    if (rows.some((row) => row.name === intro.row.name)) return;
    setIntro(null);
  }, [intro, rows]);
  function openIntro(row) {
    setIntro({ row });
  }
  function openPolicy(row) {
    if (busy !== null || row.kind === "file") return;
    if (row.mode === "manual" && row.origin === "author") return;
    setPolicy({ row });
  }
  function policyChip(row) {
    if (row.status === "unmanaged") {
      return h("span", { className: "dshsc-chip muted", title: t("adopt.switchHint") }, t("policy.unmanaged"));
    }
    if (row.kind === "file") {
      return h("span", { className: "dshsc-chip muted", title: t("policy.flat") }, t("policy.flat"));
    }
    const mode = row.mode || "auto";
    if (mode === "hidden") {
      return h("button", {
        type: "button",
        className: "dshsc-chip hidden",
        disabled: busy !== null,
        title: t("policy.hiddenHint"),
        "aria-haspopup": "dialog",
        onClick: () => openPolicy(row)
      }, t("policy.hidden"));
    }
    if (mode === "manual" && row.origin === "author") {
      return h("span", {
        className: "dshsc-chip author",
        title: t("policy.authorHint")
      }, t("policy.author"));
    }
    if (row.drift) {
      return h("button", {
        type: "button",
        className: "dshsc-chip drift",
        disabled: busy !== null,
        title: t("policy.driftHint"),
        "aria-haspopup": "dialog",
        onClick: () => openPolicy(row)
      }, t("policy.drift"));
    }
    if (row.legacy === "dsh-off") {
      return h("button", {
        type: "button",
        className: "dshsc-chip legacy",
        disabled: busy !== null,
        title: t("policy.legacyHint"),
        "aria-haspopup": "dialog",
        onClick: () => openPolicy(row)
      }, t("policy.legacy"));
    }
    if (mode === "manual") {
      return h("button", {
        type: "button",
        className: "dshsc-chip manual",
        disabled: busy !== null,
        title: t("policy.manualOnlyHint"),
        "aria-haspopup": "dialog",
        onClick: () => openPolicy(row)
      }, t("policy.manual"));
    }
    return h("button", {
      type: "button",
      className: "dshsc-chip auto",
      disabled: busy !== null,
      title: t("policy.open"),
      "aria-haspopup": "dialog",
      onClick: () => openPolicy(row)
    }, t("policy.auto"));
  }
  function statusTag(row) {
    if (row.status === "unknown") return null;
    if (row.status === "no-upstream") {
      return row.source ? h("span", { className: "dshsc-tag", title: t("status.noUpstreamHint") }, t("status.noUpstream")) : null;
    }
    const map = {
      current: ["status.current", "ok", true],
      "update-available": ["status.update", "warn"],
      "locally-modified": ["status.local", "warn", false, "status.localHint"],
      conflict: ["status.conflict", "warn", false, "status.conflictHint"],
      "upstream-deleted": ["status.deleted", "warn"],
      "broken-link": ["status.broken", "err"],
      unmanaged: ["status.unmanaged", ""]
    };
    const [key, cls, check, hint] = map[row.status] || ["status.unknown", ""];
    return h("span", {
      className: `dshsc-tag ${cls}`,
      title: hint ? t(hint) : void 0
    }, check ? `✓ ${t(key)}` : t(key));
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
    const exported = (row.exports || []).filter(
      (item) => !item.broken && !sharedTargets.has(item.target)
    );
    if (exported.length === 0) {
      return [h("span", {
        key: "none",
        className: "dshsc-unlinked",
        title: t("meta.noExportHint")
      }, t("meta.noExport"))];
    }
    const chips = [];
    const labels = exported.map((item) => item.label);
    const shown = exported.slice(0, 3);
    shown.forEach((item, index) => chips.push(h("span", {
      className: "dshsc-agent",
      key: `agent-${index}`,
      title: item.label
    }, item.label)));
    if (exported.length > shown.length) {
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
      }, `+${exported.length - shown.length}`));
    }
    return chips;
  }
  function headView() {
    return h(
      "div",
      { className: "dshsc-listhead" },
      h(
        "div",
        { className: "dshsc-hskill" },
        h("span", { className: "dshsc-col-wide" }, t("column.skill")),
        h("span", { className: "dshsc-col-narrow" }, t("column.skillAgents"))
      ),
      h("div", { className: "dshsc-hagents" }, t("column.agents")),
      h("div", { className: "dshsc-hpolicy" }, t("column.policy")),
      h(
        "div",
        { className: "dshsc-hactions" },
        h("span", { className: "dshsc-col-wide" }, t("column.actions")),
        h("span", { className: "dshsc-col-narrow" }, t("column.policyActions"))
      )
    );
  }
  function listView(listRows) {
    return h("div", { className: "dshsc-list" }, headView(), listRows);
  }
  function rowView(row) {
    const parked = row.mode === "hidden";
    const off = parked || row.enabled === false;
    const canUpdate = writable && updatable(row);
    const hidden = !off && !row.visible;
    const manualOnly = hidden && Boolean(row.visibility?.selfHidden);
    const visLabel = hidden ? t("meta.modelHidden") : t("meta.modelVisible");
    return h(
      "div",
      { className: `dshsc-row${off ? " off" : ""}`, key: row.name },
      h(
        "div",
        { className: "dshsc-cell" },
        h(
          "div",
          { className: "dshsc-namerow" },
          off ? null : h("span", {
            className: `dshsc-vdot${hidden ? " hidden" : ""}`,
            role: "img",
            title: visLabel,
            "aria-label": visLabel
          }),
          h("button", {
            type: "button",
            className: "dshsc-name dshsc-namebtn",
            title: row.name,
            "aria-haspopup": "dialog",
            onClick: () => actions.onView(row)
          }, row.name),
          data?.intro ? h(
            "button",
            {
              type: "button",
              className: "dshsc-intro-btn",
              title: t("intro.open"),
              "aria-haspopup": "dialog",
              onClick: () => openIntro(row)
            },
            h("span", { className: "dshsc-spark", "aria-hidden": "true" }, "✨"),
            t("intro.button")
          ) : null,
          statusTag(row)
        ),
        sourceLine(row),
        parked ? h("div", { className: "dshsc-note" }, t("policy.hiddenNote")) : row.legacy === "dsh-off" ? h("div", { className: "dshsc-note" }, t("policy.legacyNote")) : null,
        row.origin === "author" && row.mode === "manual" ? h("div", { className: "dshsc-note" }, t("policy.authorNote")) : null,
        row.drift ? h("div", { className: "dshsc-note warn" }, t("policy.driftNote")) : null,
        // 仅手动用行内 chip 表达；被更靠前的同名副本盖住时由下面的 foreignWinner 点名。
        hidden && !manualOnly && row.visibility?.winnerIsCanonical !== false ? h("div", { className: "dshsc-note warn" }, t("visibility.hiddenHint")) : null,
        row.visibility?.shadowScopeMismatch ? h("div", { className: "dshsc-note warn" }, t("visibility.scopeMismatch")) : null,
        // 同名副本在更小的 rank 上：模型看到的不是这一份，必须点名路径
        row.visibility?.winnerIsCanonical === false ? h(
          "div",
          { className: "dshsc-note warn" },
          t("visibility.foreignWinner").replace("{path}", row.visibility.winnerPath || "?")
        ) : null,
        row.status === "broken-link" ? h("div", { className: "dshsc-note warn" }, t("status.brokenHint")) : null
      ),
      h("div", { className: "dshsc-agents" }, agentChips(row)),
      h("div", { className: "dshsc-policy" }, policyChip(row)),
      h(
        "div",
        { className: "dshsc-actions" },
        parked ? [
          h("button", {
            key: "restore",
            className: "dshsc-btn ghost sq dshsc-restore",
            disabled: !writable || busy !== null,
            title: t("policy.unpark"),
            "aria-label": `${t("policy.unpark")} ${row.name}`,
            onClick: () => actions.onRequestUnpark(row)
          }, h(RefreshIcon, { size: 13 })),
          h("button", {
            key: "delete",
            className: "dshsc-btn ghost danger sq",
            disabled: !writable || busy !== null,
            title: t("action.delete"),
            "aria-label": `${t("action.delete")} ${row.name}`,
            onClick: () => actions.onDelete(row)
          }, h(TrashIcon, { size: 13 }))
        ] : [
          h("button", {
            key: "view",
            className: "dshsc-btn ghost sq dshsc-view",
            disabled: busy !== null,
            "aria-haspopup": "dialog",
            title: t("action.view"),
            "aria-label": `${t("action.view")} ${row.name}`,
            onClick: () => actions.onView(row)
          }, h(EyeIcon, { size: 13 })),
          row.status === "unmanaged" ? h("button", {
            key: "adopt",
            className: "dshsc-btn ghost",
            disabled: !writable || busy !== null,
            title: row.source ? row.source : t("meta.none"),
            onClick: () => void actions.onAdopt(row)
          }, t("action.adopt")) : h("button", {
            key: "update",
            className: `dshsc-btn ghost sq${canUpdate ? " dshsc-update" : ""}`,
            disabled: !canUpdate || busy !== null,
            title: t("action.update"),
            "aria-label": `${t("action.update")} ${row.name}`,
            onClick: () => actions.onUpdate(row)
          }, h(DownloadIcon, { size: 13 })),
          h("button", {
            key: "exports",
            className: "dshsc-btn ghost sq",
            disabled: busy !== null,
            title: t("action.exports"),
            "aria-label": `${t("action.exports")} ${row.name}`,
            onClick: () => actions.onExports(row)
          }, h(ShareIcon, { size: 13 })),
          h("button", {
            key: "delete",
            className: "dshsc-btn ghost danger sq",
            disabled: !writable || busy !== null,
            title: t("action.delete"),
            "aria-label": `${t("action.delete")} ${row.name}`,
            onClick: () => actions.onDelete(row)
          }, h(TrashIcon, { size: 13 }))
        ]
      )
    );
  }
  function groupedRows() {
    const groups = [];
    const visibleGroup = visibleRows.filter((row) => row.mode === "auto" && row.enabled !== false && row.visible);
    const manualRows = visibleRows.filter((row) => row.mode === "manual");
    const offRows = visibleRows.filter((row) => row.mode === "hidden" || row.enabled === false);
    const hiddenRows = visibleRows.filter((row) => row.mode === "auto" && row.enabled !== false && !row.visible);
    if (visibleGroup.length) groups.push({ key: "visible", title: t("group.visible"), rows: visibleGroup, dot: true });
    if (manualRows.length) groups.push({ key: "manual", title: t("group.manual"), rows: manualRows });
    if (offRows.length) groups.push({ key: "off", title: t("group.off"), rows: offRows });
    if (hiddenRows.length) groups.push({ key: "hidden", title: t("group.hidden"), rows: hiddenRows });
    for (const agent of data?.agents?.detected || []) {
      if (agent.kind !== "agent") continue;
      const matched = visibleRows.filter(
        (row) => (row.exports || []).some((item) => item.target === agent.target && !item.broken)
      );
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
    const updateDot = counts.update > 0 ? h("i", { className: "dshsc-fdot" }) : null;
    return h(
      "div",
      { className: "dshsc-listbar" },
      h(
        "div",
        { className: "dshsc-filters" },
        filterChip("all", t("filter.all")),
        filterChip("update", t("filter.update"), updateDot),
        filterChip("unknown", t("filter.unknown")),
        filterChip("manual", t("filter.manual")),
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
    if (!data) {
      return h(
        "div",
        { className: "dshsc-tabpane" },
        h(
          "div",
          { className: "dshsc-listscroll" },
          h("div", { className: "dshsc-empty" }, t("empty.loading"))
        )
      );
    }
    if (rows.length === 0) {
      return h(
        "div",
        { className: "dshsc-tabpane" },
        h(
          "div",
          { className: "dshsc-listscroll" },
          h(
            "div",
            { className: "dshsc-empty" },
            h("div", { className: "dshsc-name" }, t("empty.skills")),
            h("div", { className: "dshsc-meta", style: { justifyContent: "center" } }, t("empty.skillsHint")),
            h(
              "div",
              { style: { marginTop: 10 } },
              h("button", { className: "dshsc-btn primary", disabled: !writable, onClick: actions.onAddSkill }, t("action.addSkill"))
            )
          )
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
      listView(group.rows.map(rowView))
    ))) : listView(visibleRows.map(rowView));
    return h(
      "div",
      { className: "dshsc-tabpane" },
      visibleOnlyBanners(),
      builtinNotice(),
      listBar(),
      h(
        "div",
        { className: "dshsc-listscroll" },
        visibleRows.length === 0 ? filteredEmpty() : body
      )
    );
  }
  const introModal = intro && data?.intro ? h(IntroModal, {
    t,
    name: intro.row.name,
    stamp: [intro.row.commit || "", intro.row.currentHash || "", intro.row.updatedAt || "", intro.row.status || ""].join("|"),
    capability: data.intro,
    onClose: () => setIntro(null),
    onView: () => {
      const target = intro.row;
      setIntro(null);
      actions.onView(target);
    }
  }) : null;
  const policyModal = policy ? h(PolicyModal, {
    t,
    row: policy.row,
    busy: busy !== null,
    onClose: () => setPolicy(null),
    onSave: (mode) => {
      const target = policy.row;
      setPolicy(null);
      void actions.onSetInvocation(target, mode);
    },
    onUnpark: () => {
      const target = policy.row;
      setPolicy(null);
      actions.onRequestUnpark(target);
    }
  }) : null;
  return h(import_react4.default.Fragment, null, content(), policyModal, introModal);
}

// client/views/agent-tip.js
function AgentTip({ t, agentTip, agentTipPos, nodeRef }) {
  const labels = agentTip.labels || [];
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
      h("span", { className: "dshsc-agenttip-n" }, labels.length)
    ),
    h(
      "div",
      { className: "dshsc-agenttip-list" },
      labels.map((label, index) => h("span", {
        className: "dshsc-agent",
        key: `agenttip-${index}`,
        title: label
      }, label))
    )
  );
  return portalize(node);
}

// client/views/subscriptions.js
var import_react5 = __toESM(require("react"), 1);
function repoOf(source) {
  const value = String(source || "").trim().toLowerCase().replace(/\.git$/, "");
  return value || null;
}
function shortCommit(value) {
  return typeof value === "string" ? value.slice(0, 7) : "";
}
function SubscriptionsTab({
  t,
  subscriptions,
  rows,
  expanded,
  busy,
  writable,
  capability = null,
  onToggle,
  onRefresh,
  onDelete,
  onInstall,
  onAdd
}) {
  const [intro, setIntro] = import_react5.default.useState(null);
  import_react5.default.useEffect(() => {
    if (!intro) return;
    const subscription = subscriptions.find((item) => item.id === intro.subscriptionId);
    const entries = subscription?.snapshot?.entries || [];
    if (entries.some((entry) => entry.name === intro.name)) return;
    setIntro(null);
  }, [intro, subscriptions]);
  function openIntro(subscription, entry) {
    setIntro({
      subscriptionId: subscription.id,
      name: entry.name
    });
  }
  function introButton(subscription, entry) {
    return h(
      "button",
      {
        type: "button",
        className: "dshsc-intro-btn",
        title: t("intro.open"),
        "aria-haspopup": "dialog",
        onClick: () => openIntro(subscription, entry)
      },
      h("span", { className: "dshsc-spark", "aria-hidden": "true" }, "✨"),
      t("intro.button")
    );
  }
  const introSubscription = intro ? subscriptions.find((item) => item.id === intro.subscriptionId) || null : null;
  const introEntry = introSubscription ? (introSubscription.snapshot?.entries || []).find((entry) => entry.name === intro.name) || null : null;
  const introModal = intro && introEntry && capability ? (() => {
    const commit = introSubscription.snapshot?.commit || "";
    const installedAlready = rows.some((row) => {
      if (row.name !== introEntry.name) return false;
      if (row.subscriptionId === introSubscription.id) return true;
      return repoOf(row.source) === repoOf(introSubscription.source);
    });
    return h(IntroModal, {
      t,
      name: introEntry.name,
      stamp: commit,
      subtitle: `${introSubscription.source}@${shortCommit(commit)}`,
      endpoint: `/subscriptions/${encodeURIComponent(introSubscription.id)}/entries/${encodeURIComponent(introEntry.name)}/intro`,
      capability,
      hint: t("intro.hintRemote").replace("{source}", introSubscription.source).replace("{commit}", shortCommit(commit) || "—"),
      viewLabel: t("action.install"),
      onView: installedAlready ? null : () => {
        setIntro(null);
        void onInstall(introSubscription, introEntry);
      },
      onClose: () => setIntro(null)
    });
  })() : null;
  if (subscriptions.length === 0) {
    return h(
      "div",
      { className: "dshsc-tabpane" },
      h(
        "div",
        { className: "dshsc-listscroll" },
        h(
          "div",
          { className: "dshsc-empty" },
          h("div", { className: "dshsc-name" }, t("empty.subs")),
          h("div", { className: "dshsc-meta", style: { justifyContent: "center" } }, t("empty.subsHint")),
          h(
            "div",
            { style: { marginTop: 10 } },
            h("button", { className: "dshsc-btn primary", disabled: !writable, onClick: onAdd }, t("action.addSubscription"))
          )
        )
      )
    );
  }
  return h(
    import_react5.default.Fragment,
    null,
    h(
      "div",
      { className: "dshsc-tabpane" },
      // 表头与仓库行共用同一个滚动容器，位置 sticky；宽屏 4 列，窄屏收成「仓库」/「操作」。
      h(
        "div",
        { className: "dshsc-listscroll dshsc-subscroll" },
        h(
          "div",
          { className: "dshsc-subhead" },
          h("div", { className: "dshsc-hrepo" }, t("column.repo")),
          h("div", { className: "dshsc-href" }, t("column.ref")),
          h("div", { className: "dshsc-hcount" }, t("column.entries")),
          h("div", { className: "dshsc-hact" }, t("column.actions"))
        ),
        subscriptions.map((subscription) => {
          const entries = subscription.snapshot?.entries || [];
          const repo = repoOf(subscription.source);
          const rowsByName = new Map(rows.map((row) => [row.name, row]));
          const installedRow = (name) => {
            const row = rowsByName.get(name);
            if (!row) return null;
            if (row.subscriptionId === subscription.id) return row;
            return repo && repoOf(row.source) === repo ? row : null;
          };
          const installedCount = entries.filter((entry) => installedRow(entry.name)).length;
          const open = Boolean(expanded[subscription.id]);
          return h(
            "div",
            { className: "dshsc-sub-block", key: subscription.id },
            h(
              "div",
              { className: "dshsc-sub-row" },
              h(
                "div",
                { className: "dshsc-sub-repo" },
                h("button", {
                  className: "dshsc-caret",
                  "aria-expanded": String(open),
                  "aria-label": `${subscription.source} ${open ? t("action.collapse") : t("action.expand")}`,
                  onClick: () => onToggle(subscription.id)
                }, h(CaretIcon, { open })),
                h("span", { className: "dshsc-name" }, subscription.source)
              ),
              // 宽屏铺成 Ref / 条目两列；窄屏回到仓库名下方一行。
              h(
                "div",
                { className: "dshsc-sub-meta" },
                h("span", { className: "dshsc-tag dshsc-subref" }, subscription.ref || t("subscription.defaultRef")),
                h(
                  "span",
                  { className: "dshsc-substat" },
                  `${entries.length} ${t("skillCount")} · ${t("installed")} ${installedCount}`
                )
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
            open ? h(
              "div",
              { className: "dshsc-sub-list" },
              h(
                "div",
                { className: "dshsc-entryhead" },
                h("div", null, t("column.skill")),
                h("div", null, t("column.status")),
                h("div", { className: "right" }, t("column.actions"))
              ),
              entries.map((entry) => {
                const installedAlready = Boolean(installedRow(entry.name));
                return h(
                  "div",
                  { className: "dshsc-sub-entry", key: entry.name },
                  h(
                    "div",
                    { className: "dshsc-sub-skill" },
                    h(
                      "div",
                      { className: "dshsc-sub-namerow" },
                      h("span", { className: "dshsc-name" }, entry.name),
                      capability ? introButton(subscription, entry) : null
                    ),
                    entry.description ? h("div", { className: "dshsc-sub-desc", title: entry.description }, entry.description) : null
                  ),
                  h(
                    "span",
                    { className: `dshsc-state${installedAlready ? " ok" : ""}` },
                    installedAlready ? t("installed") : t("notInstalled")
                  ),
                  h(
                    "div",
                    { className: "dshsc-actions" },
                    installedAlready ? h("span", { className: "dshsc-noop" }, "-") : h("button", {
                      className: "dshsc-btn",
                      disabled: !writable || busy !== null,
                      onClick: () => void onInstall(subscription, entry)
                    }, t("action.install"))
                  )
                );
              })
            ) : null
          );
        })
      )
    ),
    introModal
  );
}

// client/views/modals.js
var import_react7 = __toESM(require("react"), 1);

// client/views/add-skill.js
var import_react6 = __toESM(require("react"), 1);
function AddSkillModal({ t, onCancel, onProbe, onInstall }) {
  const [source, setSource] = import_react6.default.useState("");
  const [phase, setPhase] = import_react6.default.useState("idle");
  const [options, setOptions] = import_react6.default.useState([]);
  const [selected, setSelected] = import_react6.default.useState(() => /* @__PURE__ */ new Set());
  const [manual, setManual] = import_react6.default.useState("");
  const [skipped, setSkipped] = import_react6.default.useState(0);
  const [error, setError] = import_react6.default.useState(null);
  const [pending, setPending] = import_react6.default.useState(false);
  const [submitError, setSubmitError] = import_react6.default.useState(null);
  const reset = (value) => {
    setSource(value);
    setPhase("idle");
    setOptions([]);
    setSelected(/* @__PURE__ */ new Set());
    setSkipped(0);
    setError(null);
    setSubmitError(null);
  };
  const probe = async () => {
    const value = source.trim();
    if (!value || phase === "probing" || pending) return;
    setPhase("probing");
    setError(null);
    setSubmitError(null);
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
  const toggle = (name) => {
    setSubmitError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const names = manual.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const skippedText = skipped > 0 ? t("form.skipped").replace("{n}", String(skipped)) : null;
  const manualMode = phase === "empty" || phase === "failed";
  const skills = phase === "picked" ? [...selected] : names;
  const canSubmit = phase === "picked" ? selected.size > 0 : manualMode ? names.length > 0 : false;
  const submit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    setSubmitError(null);
    let res;
    try {
      res = await onInstall({ source: source.trim(), skills });
    } catch (err) {
      res = { ok: false, error: err?.message || String(err) };
    }
    if (res?.ok) return;
    setPending(false);
    setSubmitError(res?.error || t("form.submitFailed"));
  };
  return h(
    Overlay,
    {
      t,
      title: t("action.addSkill"),
      onCancel,
      // 提交安装进行中禁止关闭：请求不可取消，允许关闭只是假装取消
      dismissible: !pending,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", disabled: pending, onClick: onCancel }, t("action.cancel")),
        h("button", {
          key: "s",
          className: "dshsc-btn primary",
          disabled: !canSubmit || pending,
          onClick: () => void submit()
        }, pending ? t("busy.working") : t("action.save"))
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
          disabled: pending,
          onChange: (event) => reset(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter" && !pending) void probe();
          }
        }),
        h("button", {
          className: "dshsc-btn",
          disabled: !source.trim() || phase === "probing" || pending,
          onClick: () => void probe()
        }, phase === "probing" ? t("form.probing") : t("form.probe"))
      )
    ),
    submitError ? h("p", { className: "dshsc-form-error", role: "alert" }, submitError) : null,
    phase === "picked" ? h(
      "div",
      { key: "picked" },
      h("div", { className: "dshsc-group" }, t("form.detected").replace("{n}", String(options.length))),
      h(
        "div",
        { style: { display: "flex", gap: 6, marginBottom: 6 } },
        h("button", {
          className: "dshsc-btn ghost",
          disabled: pending,
          onClick: () => {
            setSubmitError(null);
            setSelected(new Set(options.map((item) => item.name)));
          }
        }, t("form.selectAll")),
        h("button", {
          className: "dshsc-btn ghost",
          disabled: pending,
          onClick: () => {
            setSubmitError(null);
            setSelected(/* @__PURE__ */ new Set());
          }
        }, t("form.selectNone"))
      ),
      h("div", { className: "dshsc-panel" }, options.map((option) => h(
        "label",
        { className: "dshsc-check dshsc-skill", key: option.name },
        h("input", {
          type: "checkbox",
          checked: selected.has(option.name),
          disabled: pending,
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
          disabled: pending,
          onChange: (event) => {
            setManual(event.target.value);
            if (submitError) setSubmitError(null);
          }
        })
      )
    ) : null,
    h("p", { className: "dshsc-sub" }, t("form.hint"))
  );
}

// client/views/modals.js
function FormModal({ t, title, hint, fields, onCancel, onSubmit }) {
  const [form, setForm] = import_react7.default.useState(() => Object.fromEntries(fields.map((field) => [field.key, ""])));
  const [pending, setPending] = import_react7.default.useState(false);
  const [error, setError] = import_react7.default.useState(null);
  const incomplete = fields.some(
    (field) => field.required !== false && !String(form[field.key] || "").trim()
  );
  const submit = async () => {
    if (incomplete || pending) return;
    setPending(true);
    setError(null);
    let res;
    try {
      res = await onSubmit(form);
    } catch (err) {
      res = { ok: false, error: err?.message || String(err) };
    }
    if (res?.ok) return;
    setPending(false);
    setError(res?.error || t("form.submitFailed"));
  };
  return h(
    Overlay,
    {
      t,
      title,
      onCancel,
      // 提交进行中禁止关闭：请求不可取消，允许关闭只是假装取消
      dismissible: !pending,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", disabled: pending, onClick: onCancel }, t("action.cancel")),
        h("button", {
          key: "s",
          className: "dshsc-btn primary",
          disabled: incomplete || pending,
          onClick: () => void submit()
        }, pending ? t("busy.working") : t("action.save"))
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
        disabled: pending,
        onChange: (event) => {
          setForm((prev) => ({ ...prev, [field.key]: event.target.value }));
          if (error) setError(null);
        }
      })
    )),
    error ? h("p", { className: "dshsc-form-error", role: "alert" }, error) : null
  );
}
function ConfirmModal({ t, title, body, onCancel, onConfirm, danger, confirmLabel, hideCancel = false }) {
  return h(Overlay, {
    t,
    title,
    onCancel,
    footer: [
      ...hideCancel ? [] : [h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel"))],
      h("button", { key: "o", className: `dshsc-btn${danger ? " danger" : " primary"}`, onClick: onConfirm }, confirmLabel || t("action.save"))
    ]
  }, h("p", { className: "dshsc-sub", style: { whiteSpace: "pre-wrap" } }, body));
}
function ExportsModal({ t, row, agents, onCancel, onSave }) {
  const candidates = agents.filter(
    (agent) => agent.kind === "agent" && agent.exists && agent.exportable
  );
  const [targets, setTargets] = import_react7.default.useState(() => {
    const available = new Set(candidates.map((agent) => agent.target));
    return new Set((row.exports || []).map((item) => item.target).filter((target) => available.has(target)));
  });
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
      title: `${t("action.exports")} · ${row.name}`,
      onCancel,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
        h("button", { key: "s", className: "dshsc-btn primary", onClick: () => onSave([...targets]) }, t("action.save"))
      ]
    },
    h("div", { className: "dshsc-group" }, t("exports.targets")),
    h("p", { className: "dshsc-sub" }, t("exports.detectedHint")),
    h("p", { className: "dshsc-sub" }, t("exports.canonical").replace("{path}", `~/.agents/skills/${row.name}`)),
    candidates.length === 0 ? h("p", { className: "dshsc-sub" }, t("exports.none")) : null,
    ...candidates.map((agent) => h(
      "label",
      { className: "dshsc-check", key: agent.target },
      h("input", {
        type: "checkbox",
        checked: targets.has(agent.target),
        onChange: () => toggle(agent.target)
      }),
      h("span", null, agent.label),
      // 候选里已经没有「读共享根」的 agent 了；'no' 是常态不必标注，只提示没验证过的
      agent.sharedHome === "unknown" ? h("small", null, t("exports.sharedUnknown")) : null,
      h("small", { title: agent.dir }, agent.dir)
    )),
    h("p", { className: "dshsc-sub" }, t("exports.hint"))
  );
}
function DefaultExportModal({ t, settings, agents, onCancel, onSave }) {
  const [targets, setTargets] = import_react7.default.useState(() => new Set(
    Array.isArray(settings.exportTargets) ? settings.exportTargets : []
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
      title: t("exportDefault"),
      onCancel,
      footer: [
        h("button", { key: "c", className: "dshsc-btn ghost", onClick: onCancel }, t("action.cancel")),
        h("button", { key: "s", className: "dshsc-btn primary", onClick: () => onSave([...targets]) }, t("action.save"))
      ]
    },
    h("div", { className: "dshsc-group" }, t("exportDefault.detected")),
    agents.length === 0 ? h("p", { className: "dshsc-sub" }, t("exportDefault.none")) : h("div", { className: "dshsc-panel" }, agents.map((agent) => h(
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
    h("p", { className: "dshsc-sub" }, t("exportDefault.hint"))
  );
}
function Modals({ t, modal, data, autoLinkAgents, actions, onClose, onSaveAutoLink }) {
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
      onSubmit: (form) => actions.addSubscription(form)
    });
  }
  if (modal.type === "exports") {
    return h(ExportsModal, {
      t,
      row: modal.row,
      agents: data?.agents?.all || [],
      onCancel: onClose,
      onSave: (targets) => {
        onClose();
        void actions.saveExports(modal.row, targets);
      }
    });
  }
  if (modal.type === "autolink") {
    return h(DefaultExportModal, {
      t,
      settings: data?.settings || {},
      agents: autoLinkAgents,
      onCancel: onClose,
      onSave: (targets) => void onSaveAutoLink(targets)
    });
  }
  if (modal.type === "confirm-unpark") {
    const previous = modal.row?.park?.previousMode === "manual" ? t("policy.manual") : t("policy.auto");
    return h(ConfirmModal, {
      t,
      title: t("policy.unparkTitle"),
      body: t("policy.unparkBody").replace("{mode}", previous),
      confirmLabel: t("policy.unpark"),
      onCancel: onClose,
      onConfirm: modal.onConfirm
    });
  }
  if (modal.type === "confirm-delete") {
    return h(ConfirmModal, {
      t,
      title: t("confirm.deleteTitle"),
      body: t("confirm.deleteBody"),
      danger: true,
      confirmLabel: t("action.delete"),
      onCancel: onClose,
      onConfirm: modal.onConfirm
    });
  }
  if (modal.type === "confirm-update") {
    return h(ConfirmModal, {
      t,
      title: t("confirm.updateTitle"),
      body: t("confirm.updateBody"),
      confirmLabel: t("action.update"),
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
      confirmLabel: t("action.close"),
      danger: true,
      hideCancel: true
    });
  }
  return null;
}

// client/views/skill-reader.js
var import_react8 = __toESM(require("react"), 1);

// client/markdown.js
function classifyHref(href) {
  const value = String(href ?? "").trim();
  if (!value) return { kind: "unsafe", href: value };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { kind: "unsafe", href: value };
  if (value.startsWith("#")) return { kind: "anchor", href: value.slice(1) };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name === "http" || name === "https" || name === "mailto") return { kind: "external", href: value };
    return { kind: "unsafe", href: value };
  }
  if (value.startsWith("//")) return { kind: "unsafe", href: value };
  return { kind: "relative", href: value };
}
function slugify(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[`*_~]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function stripFrontmatter(text) {
  const source = String(text ?? "");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { frontmatter: null, body: source };
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}
var ESCAPABLE = /* @__PURE__ */ new Set(["\\", "`", "*", "_", "[", "]", "(", ")", "#", "+", "-", ".", "!", "|", ">", "~"]);
function matchBracketLink(text, start) {
  const close = text.indexOf("]", start + 1);
  if (close < 0) return null;
  if (text[close + 1] !== "(") return null;
  let depth = 0;
  let index = close + 1;
  for (; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (index >= text.length) return null;
  const label = text.slice(start + 1, close);
  const rawTarget = text.slice(close + 2, index).trim();
  const href = rawTarget.split(/\s+/)[0] || "";
  return { label, href, end: index + 1 };
}
function parseInline(text) {
  const source = String(text ?? "");
  const nodes = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      nodes.push({ type: "text", value: buffer });
      buffer = "";
    }
  };
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\" && ESCAPABLE.has(source[index + 1])) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }
    if (char === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        nodes.push({ type: "code", value: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (char === "!" && source[index + 1] === "[") {
      const match = matchBracketLink(source, index + 1);
      if (match) {
        flush();
        const target = classifyHref(match.href);
        nodes.push({ type: "image", alt: match.label, src: match.href, kind: target.kind });
        index = match.end;
        continue;
      }
    }
    if (char === "[") {
      const match = matchBracketLink(source, index);
      if (match) {
        flush();
        const target = classifyHref(match.href);
        nodes.push({
          type: "link",
          href: target.href,
          kind: target.kind,
          children: parseInline(match.label)
        });
        index = match.end;
        continue;
      }
    }
    if (char === "*" || char === "_") {
      const doubled = source[index + 1] === char;
      const marker = doubled ? char + char : char;
      const end = source.indexOf(marker, index + marker.length);
      if (end > index + marker.length) {
        flush();
        nodes.push({
          type: doubled ? "strong" : "em",
          children: parseInline(source.slice(index + marker.length, end))
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
function inlineToText(nodes) {
  if (!Array.isArray(nodes)) return String(nodes ?? "");
  return nodes.map((node) => {
    if (node.type === "text" || node.type === "code") return node.value;
    if (node.type === "image") return node.alt || "";
    return inlineToText(node.children);
  }).join("");
}
var FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`]*)$/;
var HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
var HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
var LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
var QUOTE = /^\s{0,3}>\s?(.*)$/;
var TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}
function alignOf(cell) {
  const value = cell.trim();
  if (/^:-+:$/.test(value)) return "center";
  if (/^:-+$/.test(value)) return "left";
  if (/^-+:$/.test(value)) return "right";
  return null;
}
function parseMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const headings = [];
  const usedIds = /* @__PURE__ */ new Map();
  const headingId = (plain) => {
    const base = slugify(plain) || "section";
    const seen = usedIds.get(base) || 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };
  const isBlockStart = (line) => FENCE.test(line) || HEADING.test(line) || HR.test(line) || LIST_ITEM.test(line) || QUOTE.test(line) || line.includes("|");
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
        if (current.trim().startsWith(marker[0].repeat(marker.length)) && current.trim().replace(/[`~]/g, "") === "") {
          index += 1;
          break;
        }
        body.push(current);
        index += 1;
      }
      blocks.push({ type: "code", lang: info.split(/\s+/)[0] || "", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const inlines = parseInline(heading[2]);
      const plain = inlineToText(inlines).trim();
      const id = headingId(plain);
      blocks.push({ type: "heading", level, id, inlines, text: plain });
      headings.push({ id, level, text: plain });
      index += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])[1]);
        index += 1;
      }
      blocks.push({ type: "quote", blocks: parseMarkdown(quoted.join("\n")).blocks });
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1])) {
      const header = splitRow(line).map((cell) => parseInline(cell));
      const align = splitRow(lines[index + 1]).map(alignOf);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitRow(lines[index]).map((cell) => parseInline(cell)));
        index += 1;
      }
      blocks.push({ type: "table", align, header, rows });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const first = LIST_ITEM.exec(line);
      const ordered = /\d/.test(first[2]);
      const items = [];
      while (index < lines.length) {
        const match = LIST_ITEM.exec(lines[index]);
        if (!match) break;
        const indent = match[1].replace(/\t/g, "  ").length;
        if (indent > 3) break;
        const content = match[3];
        let checked = null;
        const task = /^\[([ xX])\]\s*(.*)$/.exec(content);
        const text2 = task ? task[2] : content;
        if (task) checked = task[1].toLowerCase() === "x";
        index += 1;
        const nested = [];
        while (index < lines.length) {
          const child = LIST_ITEM.exec(lines[index]);
          if (!child) break;
          const childIndent = child[1].replace(/\t/g, "  ").length;
          if (childIndent === 0) break;
          nested.push(lines[index]);
          index += 1;
        }
        while (index < lines.length && lines[index].trim() && !LIST_ITEM.test(lines[index]) && !isBlockStart(lines[index])) {
          index += 1;
        }
        const item = { inlines: parseInline(text2), checked };
        if (nested.length > 0) {
          const sub = parseMarkdown(nested.map((row) => row.replace(/^\s{1,4}/, "")).join("\n")).blocks;
          item.children = sub;
        }
        items.push(item);
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", inlines: parseInline(paragraph.map((row) => row.trim()).join(" ")) });
  }
  return { blocks, headings };
}
function resolveRelativeHref(currentDir, href) {
  const target = classifyHref(href);
  if (target.kind === "anchor") return { relPath: "", anchor: target.href };
  const raw = String(target.href || "").split("#")[0].split("?")[0];
  const base = String(currentDir || "").replace(/^\/+|\/+$/g, "");
  if (!raw) return { relPath: "", anchor: target.kind === "anchor" ? target.href : "" };
  const segments = `${base ? `${base}/` : ""}${raw}`.split("/");
  const out = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return { relPath: out.join("/"), anchor: target.kind === "anchor" ? target.href : "" };
}

// client/views/markdown-view.js
var PARSE_CACHE = /* @__PURE__ */ new Map();
function parseCached(text) {
  const key = String(text ?? "");
  if (PARSE_CACHE.has(key)) return PARSE_CACHE.get(key);
  const parsed = parseMarkdown(stripFrontmatter(key).body);
  PARSE_CACHE.set(key, parsed);
  if (PARSE_CACHE.size > 8) {
    const oldest = PARSE_CACHE.keys().next().value;
    PARSE_CACHE.delete(oldest);
  }
  return parsed;
}
function inlineNodes(nodes, { onOpenFile, onOpenAnchor, keyPrefix = "i" }) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "code":
        return h("code", { className: "dshsc-md-inline", key }, node.value);
      case "strong":
        return h("strong", { key }, inlineNodes(node.children, { onOpenFile, onOpenAnchor, keyPrefix: key }));
      case "em":
        return h("em", { key }, inlineNodes(node.children, { onOpenFile, onOpenAnchor, keyPrefix: key }));
      case "link": {
        const children = inlineNodes(node.children, { onOpenFile, onOpenAnchor, keyPrefix: key });
        if (node.kind === "external") {
          return h("a", {
            className: "dshsc-md-link",
            key,
            href: node.href,
            target: "_blank",
            rel: "noopener noreferrer"
          }, children);
        }
        if (node.kind === "anchor") {
          return h("a", {
            className: "dshsc-md-link",
            key,
            href: `#${node.href}`,
            onClick: (event) => {
              event?.preventDefault?.();
              onOpenAnchor?.(node.href);
            }
          }, children);
        }
        if (node.kind === "relative") {
          return h("a", {
            className: "dshsc-md-link",
            key,
            href: "#",
            title: node.href,
            onClick: (event) => {
              event?.preventDefault?.();
              onOpenFile?.(node.href);
            }
          }, children);
        }
        return h("span", { className: "dshsc-md-nolink", key }, children);
      }
      case "image":
        return h(
          "span",
          { className: "dshsc-md-image", key, title: node.src },
          h("span", { className: "dshsc-md-image-tag" }, "IMG"),
          node.alt || node.src
        );
      default:
        return null;
    }
  });
}
function blockNodes(blocks, options) {
  return blocks.map((block, index) => {
    const key = `b-${index}`;
    switch (block.type) {
      case "heading": {
        const tag = `h${Math.min(block.level, 6)}`;
        return h(
          tag,
          { className: "dshsc-md-h", key, id: block.id, "data-md-id": block.id },
          inlineNodes(block.inlines, { ...options, keyPrefix: key })
        );
      }
      case "paragraph":
        return h(
          "p",
          { className: "dshsc-md-p", key },
          inlineNodes(block.inlines, { ...options, keyPrefix: key })
        );
      case "code":
        return h(
          "pre",
          { className: "dshsc-md-code", key, "data-lang": block.lang || void 0 },
          h("code", null, block.text)
        );
      case "hr":
        return h("hr", { className: "dshsc-md-hr", key });
      case "quote":
        return h("blockquote", { className: "dshsc-md-quote", key }, blockNodes(block.blocks, options));
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        return h(tag, { className: "dshsc-md-list", key }, block.items.map((item, itemIndex) => h(
          "li",
          {
            key: `${key}-${itemIndex}`,
            className: item.checked === null || item.checked === void 0 ? void 0 : "dshsc-md-task"
          },
          item.checked === null || item.checked === void 0 ? null : h("span", { className: `dshsc-md-check${item.checked ? " on" : ""}`, "aria-hidden": true }),
          inlineNodes(item.inlines, { ...options, keyPrefix: `${key}-${itemIndex}` }),
          Array.isArray(item.children) && item.children.length > 0 ? blockNodes(item.children, options) : null
        )));
      }
      case "table":
        return h(
          "div",
          { className: "dshsc-md-table", key },
          h(
            "table",
            null,
            h("thead", null, h("tr", null, block.header.map((cell, cellIndex) => h("th", {
              key: `h-${cellIndex}`,
              style: { textAlign: block.align?.[cellIndex] || "left" }
            }, inlineNodes(cell, { ...options, keyPrefix: `${key}-h-${cellIndex}` }))))),
            h("tbody", null, block.rows.map((row, rowIndex) => h(
              "tr",
              { key: `r-${rowIndex}` },
              row.map((cell, cellIndex) => h("td", {
                key: `c-${cellIndex}`,
                style: { textAlign: block.align?.[cellIndex] || "left" }
              }, inlineNodes(cell, { ...options, keyPrefix: `${key}-${rowIndex}-${cellIndex}` })))
            )))
          )
        );
      default:
        return null;
    }
  });
}
function Markdown({ text, onOpenFile, onOpenAnchor }) {
  const { blocks } = parseCached(text);
  return h("div", { className: "dshsc-md" }, blockNodes(blocks, { onOpenFile, onOpenAnchor }));
}

// client/views/skill-reader.js
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function formatWhen2(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
var MARKDOWN = /\.(md|markdown)$/i;
function isMarkdownPath(relPath) {
  return MARKDOWN.test(String(relPath || ""));
}
var STATUS_KEY = {
  current: "status.current",
  "update-available": "status.update",
  "locally-modified": "status.local",
  conflict: "status.conflict",
  "upstream-deleted": "status.deleted",
  "broken-link": "status.broken",
  unmanaged: "status.unmanaged"
};
var STATUS_HINT = {
  "locally-modified": "status.localHint",
  conflict: "status.conflictHint"
};
function TabButton({ id, label, count, active, onSelect }) {
  return h("button", {
    type: "button",
    role: "tab",
    id: `dshsc-tab-${id}`,
    "aria-selected": String(active),
    "aria-controls": `dshsc-panel-${id}`,
    tabIndex: active ? 0 : -1,
    className: `dshsc-rtab${active ? " active" : ""}`,
    onClick: () => onSelect(id)
  }, label, count === null || count === void 0 ? null : h("i", { className: "n" }, count));
}
function InfoSection({ t, title, rows }) {
  return h(
    "section",
    { className: "dshsc-info-sec" },
    h("h3", null, title),
    h("dl", null, rows.map((row, index) => [
      h("dt", { key: `t-${index}` }, t(row[0])),
      h("dd", { key: `d-${index}`, className: row[2] === "mono" ? "mono" : void 0 }, row[1])
    ]))
  );
}
function SkillReader({
  t,
  variant = "drawer",
  row,
  writable,
  busy,
  readOnly,
  version,
  initialTab = "doc",
  initialFile = null,
  onClose,
  onOpenPage,
  onUpdate,
  onExports,
  onToast
}) {
  const { state, file, loadFile, retry } = useSkillReader(row);
  const name = row?.name || "";
  const [tab, setTab] = import_react8.default.useState(initialTab);
  const [format, setFormat] = import_react8.default.useState("rendered");
  const [docOverride, setDocOverride] = import_react8.default.useState(null);
  const [fileFormat, setFileFormat] = import_react8.default.useState("rendered");
  const [tocActive, setTocActive] = import_react8.default.useState(null);
  const [descOpen, setDescOpen] = import_react8.default.useState(false);
  const [descClamped, setDescClamped] = import_react8.default.useState(false);
  const bodyRef = import_react8.default.useRef(null);
  const dialogRef = import_react8.default.useRef(null);
  const descRef = import_react8.default.useRef(null);
  const scrollRef = import_react8.default.useRef(0);
  useOverlayLayer(variant === "drawer" || variant === "page", onClose);
  const tree = state.tree;
  const files = tree?.files || [];
  const fileCount = files.filter((entry) => entry.kind === "file").length;
  const bodyText = docOverride ? docOverride.content : state.body?.content || "";
  const description = row?.description || state.body?.meta?.description || "";
  const headings = tab === "doc" && bodyText ? parseCached(bodyText).headings : [];
  import_react8.default.useEffect(() => {
    setDocOverride(null);
    scrollRef.current = 0;
  }, [name]);
  const descOwnerRef = import_react8.default.useRef(name);
  import_react8.default.useEffect(() => {
    if (descOwnerRef.current === name) return;
    descOwnerRef.current = name;
    setDescOpen(false);
    setDescClamped(false);
  }, [name]);
  import_react8.default.useLayoutEffect(() => {
    const node = descRef.current;
    if (!node) return void 0;
    const measure = () => {
      if (descOpen) return;
      const scroll = Number(node.scrollHeight) || 0;
      const client = Number(node.clientHeight) || 0;
      setDescClamped(scroll > client + 1);
    };
    measure();
    if (typeof window === "undefined" || !window.addEventListener) return void 0;
    window.addEventListener("resize", measure);
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(measure);
      observer.observe(node);
    }
    return () => {
      observer?.disconnect?.();
      window.removeEventListener("resize", measure);
    };
  }, [description, descOpen]);
  import_react8.default.useEffect(() => {
    if (!initialFile) return;
    setTab("files");
    void loadFile(initialFile);
  }, [initialFile, loadFile]);
  import_react8.default.useEffect(() => {
    const node = bodyRef.current;
    if (node && scrollRef.current) node.scrollTop = scrollRef.current;
  });
  import_react8.default.useEffect(() => {
    if (variant !== "drawer" || typeof document === "undefined") return void 0;
    const previous = document.activeElement;
    const node = dialogRef.current;
    node?.focus?.();
    const onKeyDown = (event) => {
      if (event?.key !== "Tab" || !node?.querySelectorAll) return;
      const focusables = Array.from(
        node.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')
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
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus?.();
    };
  }, [variant, onClose]);
  import_react8.default.useEffect(() => {
    if (variant !== "page" || typeof document === "undefined") return;
    const node = document.getElementById("dshsc-reader-name");
    node?.focus?.();
  }, [variant, name]);
  import_react8.default.useEffect(() => {
    if (variant !== "page" || typeof window === "undefined") return void 0;
    const node = bodyRef.current;
    if (!node?.querySelectorAll) return void 0;
    const scroller = scrollHost(node);
    const sync = () => {
      const line = (scroller?.getBoundingClientRect?.().top ?? 0) + 96;
      let current = null;
      for (const element of Array.from(node.querySelectorAll("[data-md-id]"))) {
        const top = element.getBoundingClientRect?.().top ?? 0;
        if (top <= line) current = element.getAttribute("data-md-id");
      }
      setTocActive(current || headings[0]?.id || null);
    };
    sync();
    scroller?.addEventListener?.("scroll", sync, { passive: true });
    return () => scroller?.removeEventListener?.("scroll", sync);
  }, [variant, headings.length, tab, bodyText]);
  function scrollToAnchor(id) {
    const node = bodyRef.current;
    if (!node?.querySelectorAll) return;
    const target = Array.from(node.querySelectorAll("[data-md-id]")).find((element) => element.getAttribute("data-md-id") === id);
    if (!target) return;
    const scroller = scrollHost(node);
    const offset = target.getBoundingClientRect().top - (scroller?.getBoundingClientRect?.().top ?? 0);
    if (scroller) scroller.scrollTop = Math.max(0, (scroller.scrollTop || 0) + offset - 12);
    setTocActive(id);
  }
  function openLinkedFile(href, fromPath) {
    const source = fromPath || docOverride?.relPath || "";
    const base = source.split("/").slice(0, -1).join("/");
    const resolved = resolveRelativeHref(base, href);
    if (!resolved.relPath) return;
    setTab("files");
    void loadFile(resolved.relPath);
  }
  async function copyTextWithToast(text, okKey) {
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    onToast?.(ok ? { kind: "ok", text: t(okKey) } : { kind: "err", text: t("viewer.copyFailed") });
  }
  function selectTab(next) {
    if (next === tab) return;
    if (bodyRef.current) scrollRef.current = 0;
    setTab(next);
  }
  const header = h(
    "header",
    { className: "dshsc-reader-head" },
    h(
      "div",
      { className: "dshsc-reader-title" },
      h("h2", { id: "dshsc-reader-name", tabIndex: -1 }, name || t("viewer.title")),
      row?.status && STATUS_KEY[row.status] ? h("span", {
        className: `dshsc-tag ${row.status === "current" ? "ok" : "warn"}`,
        title: STATUS_HINT[row.status] ? t(STATUS_HINT[row.status]) : void 0
      }, t(STATUS_KEY[row.status])) : null,
      row?.enabled === false ? h("span", { className: "dshsc-tag off" }, t("status.off")) : null,
      variant === "drawer" ? h("button", {
        type: "button",
        className: "dshsc-reader-close",
        "aria-label": t("viewer.close"),
        title: t("viewer.close"),
        onClick: () => onClose?.()
      }, "×") : null
    ),
    description ? h(
      "div",
      { className: "dshsc-reader-descblock" },
      h("p", {
        className: `dshsc-reader-desc${descOpen ? " expanded" : ""}`,
        id: "dshsc-reader-desc",
        ref: descRef
      }, description),
      descClamped ? h("button", {
        type: "button",
        className: "dshsc-reader-more",
        "aria-expanded": String(descOpen),
        "aria-controls": "dshsc-reader-desc",
        onClick: () => setDescOpen((prev) => !prev)
      }, t(descOpen ? "action.collapse" : "action.expand")) : null
    ) : null,
    h(
      "div",
      { className: "dshsc-reader-meta" },
      h(
        "span",
        null,
        `${t("meta.from")} `,
        h("span", { className: "dshsc-code" }, row?.source ? `${row.source}${row.commit ? `#${short(row.commit)}` : row.ref ? `#${row.ref}` : ""}` : t("meta.noUpstream"))
      ),
      tree ? h("span", null, t("viewer.fileCount").replace("{n}", String(fileCount))) : null,
      row?.updatedAt ? h("span", null, formatWhen2(row.updatedAt)) : null
    )
  );
  const tabsBar = h(
    "div",
    { className: "dshsc-reader-tabs" },
    h(
      "div",
      { className: "dshsc-rtabs", role: "tablist", "aria-label": t("viewer.title") },
      h(TabButton, { id: "doc", label: t("viewer.tab.doc"), active: tab === "doc", onSelect: selectTab }),
      h(TabButton, { id: "files", label: t("viewer.tab.files"), count: tree ? fileCount : null, active: tab === "files", onSelect: selectTab }),
      h(TabButton, { id: "info", label: t("viewer.tab.info"), active: tab === "info", onSelect: selectTab })
    ),
    tab === "doc" && !docOverride ? h(
      "div",
      { className: "dshsc-segment dshsc-reader-seg", role: "group", "aria-label": t("viewer.rendered") },
      h("button", {
        type: "button",
        className: "dshsc-btn",
        "aria-pressed": String(format === "rendered"),
        onClick: () => setFormat("rendered")
      }, t("viewer.rendered")),
      h("button", {
        type: "button",
        className: "dshsc-btn",
        "aria-pressed": String(format === "raw"),
        onClick: () => setFormat("raw")
      }, t("viewer.raw"))
    ) : null
  );
  function docPanel() {
    if (state.loading) {
      return h(
        "div",
        { className: "dshsc-reader-skeleton" },
        h("span", null, t("viewer.loading")),
        h("i"),
        h("i"),
        h("i")
      );
    }
    if (!bodyText) {
      const error = state.bodyError;
      const missing = error?.code === "error.skills.no-skill-md";
      return h(
        "div",
        { className: "dshsc-reader-placeholder" },
        h("b", null, missing ? t("viewer.noSkill") : error?.message || t("viewer.noSkill")),
        missing ? h("span", null, t("viewer.noSkillHint")) : null,
        error && !missing ? h("button", { type: "button", className: "dshsc-btn", onClick: retry }, t("viewer.retry")) : null
      );
    }
    if (docOverride) {
      return h(
        "div",
        { className: "dshsc-reader-doc" },
        h(
          "div",
          { className: "dshsc-reader-filebar" },
          h("span", { className: "mono" }, docOverride.relPath),
          h("button", {
            type: "button",
            className: "dshsc-btn",
            onClick: () => setDocOverride(null)
          }, t("viewer.backToBody"))
        ),
        h(Markdown, { text: docOverride.content, onOpenFile: openLinkedFile, onOpenAnchor: scrollToAnchor })
      );
    }
    const truncated = Boolean(state.body?.truncated);
    return h(
      "div",
      { className: "dshsc-reader-doc" },
      truncated ? h("div", { className: "dshsc-banner warn" }, t("viewer.tooLarge").replace("{size}", formatBytes(256 * 1024))) : null,
      format === "raw" ? h("pre", { className: "dshsc-reader-raw" }, h("code", null, bodyText)) : h(Markdown, { text: bodyText, onOpenFile: openLinkedFile, onOpenAnchor: scrollToAnchor })
    );
  }
  function filesPanel() {
    if (state.treeError) {
      return h(
        "div",
        { className: "dshsc-reader-placeholder" },
        h("b", null, state.treeError.message),
        h("button", { type: "button", className: "dshsc-btn", onClick: retry }, t("viewer.retry"))
      );
    }
    if (!tree) return h("div", { className: "dshsc-reader-skeleton" }, h("i"), h("i"));
    if (files.length === 0) {
      return h("div", { className: "dshsc-reader-placeholder" }, h("b", null, t("viewer.emptyFiles")));
    }
    const active = file.relPath;
    const activeEntry = files.find((entry) => entry.kind === "file" && entry.path === active) || null;
    const renderable = Boolean(active) && isMarkdownPath(active) && !file.error && !file.loading;
    const preview = file.loading ? h("div", { className: "dshsc-reader-skeleton" }, h("i"), h("i"), h("i")) : file.error ? h(
      "div",
      { className: "dshsc-reader-placeholder" },
      h("b", null, file.error.code === "error.skills.binary" ? t("viewer.binary") : file.error.message),
      h(
        "span",
        { className: "mono" },
        [active, activeEntry ? formatBytes(activeEntry.size) : null].filter(Boolean).join(" · ")
      ),
      file.error.code === "error.skills.binary" ? h("span", null, t("viewer.binaryHint")) : null
    ) : renderable && fileFormat === "rendered" ? h(
      "div",
      { className: "dshsc-reader-preview-doc" },
      h(Markdown, {
        text: file.content,
        onOpenFile: (href) => openLinkedFile(href, file.relPath || active),
        onOpenAnchor: scrollToAnchor
      })
    ) : h(
      "pre",
      { className: "dshsc-reader-raw" },
      h("code", null, file.content + (file.truncated ? `

… ${t("viewer.tooLarge").replace("{size}", formatBytes(256 * 1024))}` : ""))
    );
    return h(
      "div",
      { className: "dshsc-reader-files" },
      h(
        "div",
        { className: "dshsc-reader-tree" },
        h(
          "div",
          { className: "dshsc-reader-tree-head" },
          h("span", null, name),
          h("span", { className: "mono" }, tree.kind === "file" ? tree.body : `~/.agents/skills/${name}`)
        ),
        files.map((entry) => {
          if (entry.kind === "dir") {
            const count = files.filter((item) => item.kind === "file" && item.path.startsWith(`${entry.path}/`)).length;
            return h(
              "div",
              { className: "dshsc-reader-tdir", key: `d:${entry.path}` },
              h(FolderIcon, null),
              h("span", { className: "mono" }, `${entry.path}/`),
              h("span", { className: "n" }, String(count))
            );
          }
          const depth = entry.path.split("/").length - 1;
          return h(
            "button",
            {
              type: "button",
              key: `f:${entry.path}`,
              className: `dshsc-reader-titem${active === entry.path ? " on" : ""}`,
              style: { paddingLeft: 8 + depth * 12 },
              title: entry.path,
              onClick: () => {
                setFileFormat("rendered");
                void loadFile(entry.path);
              }
            },
            h(FileIcon, null),
            h("span", { className: "nname" }, entry.path.split("/").pop()),
            h("span", { className: "nsize" }, formatBytes(entry.size))
          );
        })
      ),
      h(
        "div",
        { className: "dshsc-reader-preview" },
        h(
          "div",
          { className: "dshsc-reader-tree-head" },
          h("span", null, t("viewer.tab.files")),
          h("span", { className: "mono" }, active || "—"),
          // 预览的三个动作放在一起，靠右成一排，而不是一个贴路径、一个飘到最右
          h(
            "div",
            { className: "dshsc-reader-tools" },
            renderable ? h(
              "div",
              { className: "dshsc-segment dshsc-reader-seg", role: "group", "aria-label": t("viewer.rendered") },
              h("button", {
                type: "button",
                className: "dshsc-btn",
                "aria-pressed": String(fileFormat === "rendered"),
                onClick: () => setFileFormat("rendered")
              }, t("viewer.rendered")),
              h("button", {
                type: "button",
                className: "dshsc-btn",
                "aria-pressed": String(fileFormat === "raw"),
                onClick: () => setFileFormat("raw")
              }, t("viewer.raw"))
            ) : null,
            active && !file.loading && !file.error && isMarkdownPath(active) ? h("button", {
              type: "button",
              className: "dshsc-btn",
              onClick: () => {
                setDocOverride({ relPath: file.relPath || active, content: file.content });
                setTab("doc");
              }
            }, t("viewer.openInDoc")) : null
          )
        ),
        preview
      )
    );
  }
  function infoPanel() {
    const exportLabels = (row?.exports || []).filter((item) => !item.broken).map((item) => item.label);
    const hash = row?.lockHash || row?.currentHash || null;
    const rows = [];
    rows.push(["viewer.info.name", h("span", { className: "mono" }, name), "mono"]);
    if (description) rows.push(["viewer.info.desc", description]);
    rows.push(["viewer.info.path", h("span", { className: "mono" }, row?.path || (tree?.root ?? t("viewer.info.none"))), "mono"]);
    const sourceRows = [
      ["viewer.info.repo", row?.source ? h("span", { className: "mono" }, row.source) : t("viewer.info.none"), "mono"],
      ["viewer.info.ref", row?.commit ? h("span", { className: "mono" }, short(row.commit)) : row?.ref || t("viewer.info.none"), "mono"],
      ["viewer.info.skillPath", row?.skillPath ? h("span", { className: "mono" }, row.skillPath) : t("viewer.info.none"), "mono"],
      ["viewer.info.hash", hash ? h("span", { className: "mono" }, hash) : t("viewer.info.none"), "mono"]
    ];
    const localRows = [
      ["viewer.info.installedAt", formatWhen2(row?.installedAt) || t("viewer.info.none")],
      ["viewer.info.updatedAt", formatWhen2(row?.updatedAt) || t("viewer.info.none")],
      ["viewer.info.size", tree ? `${formatBytes(tree.totalBytes)} · ${t("viewer.fileCount").replace("{n}", String(fileCount))}` : t("viewer.info.none")],
      ["viewer.info.localChange", row?.status === "locally-modified" || row?.status === "conflict" ? t("viewer.info.localChangeYes") : t("viewer.info.localChangeNone")]
    ];
    const linkRows = [
      ["viewer.info.visibility", row?.visible ? t("meta.modelVisible") : t("meta.modelHidden")],
      ["viewer.info.exported", exportLabels.length > 0 ? exportLabels.join("、") : t("viewer.info.none")],
      ["viewer.info.mode", row?.enabled === false ? t("status.off") : t("mode.on")],
      ["viewer.info.status", STATUS_KEY[row?.status] ? t(STATUS_KEY[row.status]) : t("status.unknown")]
    ];
    return h(
      "div",
      { className: "dshsc-reader-info" },
      h(InfoSection, { t, title: t("viewer.info.basic"), rows }),
      h(InfoSection, { t, title: t("viewer.info.source"), rows: sourceRows }),
      h(InfoSection, { t, title: t("viewer.info.local"), rows: localRows }),
      h(InfoSection, { t, title: t("viewer.info.links"), rows: linkRows })
    );
  }
  function panel() {
    if (tab === "files") return filesPanel();
    if (tab === "info") return infoPanel();
    return docPanel();
  }
  const body = h("div", {
    className: "dshsc-reader-body",
    ref: bodyRef,
    role: "tabpanel",
    id: `dshsc-panel-${tab}`,
    "aria-labelledby": `dshsc-tab-${tab}`,
    tabIndex: -1
  }, panel());
  const canUpdate = Boolean(writable) && Boolean(row) && !busy;
  const actionsFooter = h(
    "div",
    { className: "dshsc-reader-actions" },
    h("span", { className: "dshsc-reader-note" }, readOnly ? t("banner.readonly") : t("viewer.readonlyNote")),
    h("button", {
      type: "button",
      // 抽屉底栏空间紧，图标按钮；整页顶栏跟一排文字按钮并排，用文字更齐
      className: variant === "page" ? "dshsc-btn ghost" : "dshsc-btn ghost sq",
      title: t("viewer.copyBody"),
      "aria-label": t("viewer.copyBody"),
      disabled: !bodyText,
      onClick: () => void copyTextWithToast(bodyText, "viewer.copied")
    }, h(CopyIcon, null), variant === "page" ? t("viewer.copyBody") : null),
    h("button", {
      type: "button",
      className: "dshsc-btn ghost",
      title: row?.path || "",
      disabled: !row?.path,
      onClick: () => void copyTextWithToast(row?.path || "", "viewer.copied")
    }, t("viewer.copyPath")),
    variant === "drawer" && onOpenPage ? h("button", { type: "button", className: "dshsc-btn ghost", onClick: () => onOpenPage() }, t("viewer.openPage")) : null,
    onExports ? h("button", { type: "button", className: "dshsc-btn", onClick: () => onExports?.(row) }, t("action.exports")) : null,
    onUpdate ? h("button", {
      type: "button",
      className: "dshsc-btn tint",
      disabled: !canUpdate,
      onClick: () => onUpdate?.(row)
    }, t("action.update")) : null
  );
  if (variant === "page") {
    const tocShown = headings.length > 1;
    return h(
      "div",
      { className: "dshsc-reader-page" },
      h(
        "div",
        { className: "dshsc-reader-topbar" },
        h(
          "button",
          { type: "button", className: "dshsc-btn ghost", "data-autofocus": true, onClick: () => onClose?.() },
          h(ChevronLeftIcon, null),
          t("viewer.back")
        ),
        h(
          "span",
          { className: "dshsc-reader-crumb" },
          h("span", null, t("tab.installed")),
          h("span", { className: "sep" }, "/"),
          h("span", { className: "mono" }, name)
        ),
        h("span", { className: "spacer" }),
        actionsFooter
      ),
      h("div", { className: "dshsc-reader-hero" }, header),
      h(
        "div",
        { className: `dshsc-reader-layout${tocShown ? " has-toc" : ""}` },
        tocShown ? h(
          "nav",
          { className: "dshsc-reader-toc", "aria-label": t("viewer.toc") },
          h("div", { className: "dshsc-reader-toc-title" }, t("viewer.toc")),
          headings.map((heading) => h("button", {
            type: "button",
            key: heading.id,
            className: `dshsc-reader-tocitem l${heading.level}${tocActive === heading.id ? " on" : ""}`,
            onClick: () => scrollToAnchor(heading.id)
          }, heading.text))
        ) : null,
        h("div", { className: "dshsc-reader-col" }, tabsBar, body)
      )
    );
  }
  return portalize(h(
    "div",
    { className: "dshsc-drawer-wrap" },
    h("div", { className: "dshsc-drawer-scrim", onClick: () => onClose?.() }),
    h("aside", {
      className: "dshsc-drawer",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "dshsc-reader-name",
      ref: dialogRef,
      tabIndex: -1
    }, header, tabsBar, body, actionsFooter)
  ), overlayHost());
}

// client/views/plugin-update-modal.js
var import_react9 = __toESM(require("react"), 1);
function PluginUpdateModal({ t, update, onClose, repoUrl }) {
  const { status, checking, applying, checkError, applyError, check, apply: apply2, release, loadRelease } = update;
  const [copied, setCopied] = import_react9.default.useState(false);
  import_react9.default.useEffect(() => {
    void check();
  }, [check]);
  const latest = status?.latestVersion || null;
  const current = status?.currentVersion || "—";
  const available = Boolean(status?.updateAvailable);
  const canAuto = status?.canAutoUpdate !== false;
  const manual = status?.manualCommand || "";
  const restartRequired = status?.restartRequired === true;
  const updatedVersion = status?.updatedVersion || null;
  import_react9.default.useEffect(() => {
    if (available && latest) void loadRelease(latest);
  }, [available, latest, loadRelease]);
  const releaseData = release?.version === latest ? release.data : null;
  const releaseLoading = release?.version === latest && release.loading;
  const releaseBody = typeof releaseData?.body === "string" ? releaseData.body.trim() : "";
  const releaseUrl = releaseData?.htmlUrl || (repoUrl ? `${repoUrl}/releases` : null);
  const copy = () => {
    if (!manual || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    Promise.resolve(navigator.clipboard.writeText(manual)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
    });
  };
  let stateLine;
  if (checking && !status) stateLine = t("pluginUpdate.checking");
  else if (checkError || status?.checkFailed) stateLine = t("pluginUpdate.checkFailed");
  else if (restartRequired) stateLine = t("pluginUpdate.updated", { version: updatedVersion || latest });
  else if (available) stateLine = t("pluginUpdate.available");
  else if (status) stateLine = t("pluginUpdate.upToDate");
  else stateLine = t("pluginUpdate.checking");
  const stateTone = checkError || status?.checkFailed ? "err" : available ? "update" : "ok";
  const footer = [
    h("button", {
      key: "check",
      className: "dshsc-btn ghost",
      disabled: checking || applying,
      onClick: () => void check(true)
    }, h(RefreshIcon, { size: 13 }), t("pluginUpdate.recheck"))
  ];
  if (available && canAuto) {
    footer.push(h("button", {
      key: "apply",
      className: "dshsc-btn primary",
      disabled: applying,
      onClick: () => void apply2()
    }, applying ? t("pluginUpdate.applying") : t("pluginUpdate.update", { version: latest })));
  }
  footer.push(h("button", { key: "close", className: "dshsc-btn ghost", onClick: onClose }, t("pluginUpdate.close")));
  return h(
    Overlay,
    { t, title: t("pluginUpdate.title"), onCancel: onClose, footer },
    h(
      "dl",
      { className: "dshsc-kv" },
      h("dt", null, t("pluginUpdate.current")),
      h("dd", null, h("span", { className: "dshsc-code" }, current)),
      h("dt", null, t("pluginUpdate.latest")),
      h("dd", null, h("span", { className: "dshsc-code" }, latest || "—"))
    ),
    h("p", { className: "dshsc-sub", "data-kind": stateTone, role: "status", style: stateTone === "err" ? { color: "var(--dsw-alias-state-error-primary)" } : null }, stateLine),
    // 有新版本：展示该版本的发布说明（拉了 GitHub Release 正文就渲染，拉不到给外链）
    available ? h(
      "div",
      { className: "dshsc-release" },
      h("div", { className: "dshsc-release-head" }, t("pluginUpdate.whatsNew", { version: latest })),
      releaseLoading ? h("p", { className: "dshsc-sub" }, t("pluginUpdate.releaseLoading")) : releaseBody ? h("div", { className: "dshsc-release-body" }, h(Markdown, { text: releaseBody })) : h(
        "p",
        { className: "dshsc-sub" },
        releaseUrl ? h("a", { className: "dshsc-md-link", href: releaseUrl, target: "_blank", rel: "noopener noreferrer" }, t("pluginUpdate.viewReleaseNotes")) : t("pluginUpdate.releaseUnavailable")
      )
    ) : null,
    applyError ? h("p", { className: "dshsc-sub", role: "alert", style: { color: "var(--dsw-alias-state-error-primary)" } }, applyError.message) : null,
    restartRequired ? h("p", { className: "dshsc-sub" }, t("pluginUpdate.restartHint")) : null,
    // 一键更新不可用（或本次安装失败后想手动兜底）：给命令 + 复制
    !canAuto && manual ? h(
      "div",
      { className: "dshsc-field" },
      h("span", null, t("pluginUpdate.manual")),
      h(
        "div",
        { className: "dshsc-inline", style: { display: "flex", gap: 8, alignItems: "center" } },
        h("code", { className: "dshsc-code", style: { flex: 1, wordBreak: "break-all" } }, manual),
        h("button", { className: "dshsc-btn ghost", onClick: copy }, copied ? t("pluginUpdate.copied") : t("pluginUpdate.copy"))
      )
    ) : null
  );
}

// client/section.js
var UPDATABLE2 = /* @__PURE__ */ new Set(["update-available", "locally-modified", "conflict"]);
function Section({ t, page = false, pickDirectory, onPlacementChange }) {
  const { data, error, busy, toast, setToast, setBusy, reload, run } = useSkillsData();
  const [tab, setTab] = import_react10.default.useState("installed");
  const [view, setView] = import_react10.default.useState("flat");
  const [modal, setModal] = import_react10.default.useState(null);
  const [expanded, setExpanded] = import_react10.default.useState({});
  const [placementBusy, setPlacementBusy] = import_react10.default.useState(null);
  const [placementOverride, setPlacementOverride] = import_react10.default.useState(null);
  const [query, setQuery] = import_react10.default.useState("");
  const [viewer, setViewer] = import_react10.default.useState(null);
  const rootRef = import_react10.default.useRef(null);
  const scrollPos = import_react10.default.useRef(null);
  const restoreScroll = import_react10.default.useRef(null);
  const [filter, setFilter] = import_react10.default.useState("all");
  const [builtinOpen, setBuiltinOpen] = import_react10.default.useState(false);
  const { settingsOpen, settingsRef, settingsPlacement, closeSettings, toggleSettings } = useSettingsPopover();
  const { agentTip, agentTipPos, agentTipRef, openAgentTip, closeAgentTip } = useAgentTip();
  const pluginUpdate = usePluginUpdate();
  const [updateOpen, setUpdateOpen] = import_react10.default.useState(false);
  const rows = data?.installs || [];
  const actions = useSkillActions({ t, rows, reload, run, setBusy, setToast, setModal });
  const writable = Boolean(data) && !data?.readOnly && data?.cli?.usable;
  const updatable = (row) => UPDATABLE2.has(row.status);
  const updateCount = rows.filter(updatable).length;
  const bulkCount = rows.filter((row) => row.status === "update-available").length;
  const unknownCount = rows.filter((row) => row.status === "unknown").length;
  const offCount = rows.filter((row) => row.mode === "hidden" || row.enabled === false).length;
  const manualCount = rows.filter((row) => row.mode === "manual").length;
  const counts = { all: rows.length, update: updateCount, unknown: unknownCount, manual: manualCount, off: offCount };
  const queryText = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (filter === "update" && !updatable(row)) return false;
    if (filter === "unknown" && row.status !== "unknown") return false;
    if (filter === "manual" && row.mode !== "manual") return false;
    if (filter === "off" && row.mode !== "hidden" && row.enabled !== false) return false;
    if (!queryText) return true;
    const agentLabels = row.exports.map((item) => item.label);
    return [row.name, row.source || "", ...agentLabels].join(" ").toLowerCase().includes(queryText);
  });
  import_react10.default.useEffect(() => {
    if (!viewer || !data) return;
    if (rows.some((row) => row.name === viewer.name)) return;
    setViewer(null);
    setToast({ kind: "err", text: t("viewer.gone") });
  }, [data, rows, t, viewer]);
  const exportTargetOptions = (data?.agents?.detected || []).filter((agent) => agent.kind === "agent" && agent.exportable);
  const exportSelection = data?.settings?.exportTargets;
  const autoLinkAgents = Array.isArray(exportSelection) ? exportTargetOptions.filter((agent) => exportSelection.includes(agent.target)) : [];
  const autoLinkLabel = autoLinkAgents.length > 0 ? autoLinkAgents.map((agent) => agent.label).join("、") : t("exportDefault.none");
  const placement = (placementOverride ?? data?.settings?.placement) === "sidebar" ? "sidebar" : "settings";
  function listScroller() {
    const node = rootRef.current?.querySelector?.(".dshsc-listscroll");
    if (isScroller(node)) return node;
    return nearestScroller(rootRef.current);
  }
  function openViewer(row, mode = "drawer") {
    if (!row) return;
    if (mode === "page") {
      scrollPos.current = listScroller()?.scrollTop ?? 0;
    }
    setViewer({ name: row.name, mode });
  }
  function openPage() {
    setViewer((prev) => {
      if (!prev) return prev;
      scrollPos.current = listScroller()?.scrollTop ?? 0;
      return { ...prev, mode: "page" };
    });
  }
  function closeViewer() {
    if (viewer?.mode === "page") restoreScroll.current = scrollPos.current;
    setViewer(null);
  }
  import_react10.default.useLayoutEffect(() => {
    if (restoreScroll.current === null) return;
    const target = restoreScroll.current;
    restoreScroll.current = null;
    const scroller = listScroller();
    if (scroller) scroller.scrollTop = target;
  }, [viewer]);
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
    await run("settings", () => apiCall("POST", "/settings", { exportTargets: targets }));
  }
  const installedActions = {
    onView: (row) => openViewer(row),
    onAdopt: actions.adopt,
    onToggleMode: actions.toggleMode,
    onSetInvocation: actions.setInvocation,
    onRequestUnpark: actions.requestUnpark,
    onUpdate: actions.requestUpdate,
    onDelete: actions.requestDelete,
    onExports: (row) => setModal({ type: "exports", row }),
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
  const viewerRow = viewer ? rows.find((row) => row.name === viewer.name) || null : null;
  const readerNode = viewerRow ? h(SkillReader, {
    t,
    variant: viewer.mode,
    row: viewerRow,
    writable,
    busy,
    readOnly: Boolean(data?.readOnly),
    onClose: closeViewer,
    onOpenPage: viewer.mode === "drawer" ? openPage : null,
    onUpdate: actions.requestUpdate,
    onExports: (row) => setModal({ type: "exports", row }),
    onToast: (next) => setToast(next)
  }) : null;
  const listNode = h(
    import_react10.default.Fragment,
    null,
    h(Header, {
      t,
      page,
      plugin: data?.plugin,
      writable,
      autoLinkLabel,
      autoLinkCount: autoLinkAgents.length,
      tab,
      settingsOpen,
      settingsRef,
      settingsPlacement,
      placement,
      placementBusy,
      readOnly: Boolean(data?.readOnly),
      pluginUpdate,
      onCheckUpdate: () => setUpdateOpen(true),
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
      capability: data?.intro || null,
      ...subscriptionActions
    }),
    busy ? h("div", { className: "dshsc-meta" }, `${t("busy.working")} ${busy}`) : null
  );
  const root = h(
    "div",
    { className: "dshsc-root", ref: rootRef },
    h("style", null, CSS),
    viewer?.mode === "page" ? null : listNode,
    readerNode,
    toast ? portalize(h("div", { className: `dshsc-toast ${toast.kind}` }, toast.text), overlayHost()) : null,
    modal ? h(Modals, {
      t,
      modal,
      data,
      autoLinkAgents: exportTargetOptions,
      pickDirectory,
      actions: {
        probeSkills: actions.probeSkills,
        installSkills: actions.installSkills,
        addSubscription: actions.addSubscription,
        saveExports: actions.saveExports
      },
      onClose: () => setModal(null),
      onSaveAutoLink: saveAutoLink
    }) : null,
    agentTip ? h(AgentTip, { t, agentTip, agentTipPos, nodeRef: agentTipRef }) : null,
    updateOpen ? h(PluginUpdateModal, { t, update: pluginUpdate, repoUrl: GITHUB_URL, onClose: () => setUpdateOpen(false) }) : null
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


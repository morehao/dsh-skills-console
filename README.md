<p align="center"><img src="icon.svg" width="64" height="64" alt="技能控制台图标" /></p>

# 技能控制台 · dsh-skills-console

**简体中文** · [English](README.en.md)

[![npm version](https://img.shields.io/npm/v/@morehao/dsh-skills-console.svg)](https://www.npmjs.com/package/@morehao/dsh-skills-console) [![check](https://github.com/morehao/dsh-skills-console/actions/workflows/check.yml/badge.svg)](https://github.com/morehao/dsh-skills-console/actions/workflows/check.yml) [![license](https://img.shields.io/npm/l/@morehao/dsh-skills-console.svg)](LICENSE)

DSH（DeepSeek Harness）的技能控制台：**安装、更新、删除、启停、共享至其他 Agent，外加一份订阅清单**。

它把本机技能收进一张清单：有哪些、从哪来、谁能用、是不是最新。要用的打开，不用的关掉；别的 Agent 需要，一键建链过去——技能本体始终只有一份。

## 为什么需要它

- **一个地方管所有技能**：装好的和本机已有的技能都在同一张清单里，来源、版本、共享至哪些 Agent、更新时间一眼看清，不用去翻目录。
- **按需启停，省上下文**：暂时用不上的技能一键停用，DSH 的模型调用与 `/` 手动调用立刻看不到它，再打开就恢复；磁盘上的技能、共享关系、其他 Agent 都不受影响。
- **一份技能，多个 Agent**：多数 Agent（OpenCode、Cursor、Gemini CLI 等）直接读共享技能目录，装好即用；只认自己目录的（如 Claude Code）在面板里勾一下就能建链过去。
- **装完不是结束**：上游仓库一直在动，控制台会检查新提交，先告诉你「会影响哪些技能」，再由你决定更不更新。
- **删错还能救**：删除先进回收站保留 7 天；更新失败自动回滚上一版。

## 功能

| 能力 | 说明 |
| --- | --- |
| 清单 | 汇总本机技能，来源、版本、可见状态、共享至哪些 Agent 一处看全；共享目录里已有的技能第一次打开就自动纳入管理 |
| 安装 | 填 `owner/repo` 或 GitHub URL，先检测仓库里有哪些技能、各自做什么；可以全装，也可以只挑几个 |
| 更新 | 检查上游新提交，列出 commit 区间和受影响的技能，确认后一键更新；本地改过的技能会先要求确认 |
| 删除 | 删除前体检（不碰别人建的东西），再快照进回收站（保留 7 天） |
| 启停 | 一键开关；停用后 DSH 的模型调用与 `/` 手动调用都看不到它，其他 Agent 与磁盘文件不受影响 |
| 共享 | 只给「只读自己目录」的 Agent 建链，默认不共享；直接读共享目录的 Agent 不出现在列表里 |
| 查看 | 只读打开技能正文与文件：渲染 / 原文切换、目录树、单文件预览，外加来源、哈希与共享信息 |
| 技能简介 | 列表每行一个 ✨，点开就能看到模型写的「这个技能能做什么、什么时候用」；只发 `SKILL.md` 与文件名清单，结果缓存在本地，内容没变不重复调用 |
| 订阅 | 关注 `owner/repo` 的上游变化，只记快照、不下载技能；展开条目能看到作者原描述，也可以让模型写一段 AI 简介再决定装不装；ref / 子目录可选，不填 ref 时跟随默认分支 |
| 作用范围 | 管 user 级共享技能；暂不支持按项目启停。项目或用户目录里有同名副本时，副本仍优先可见 |

## 截图

截图取自 v0.5.2 的 DSH Web 实机（深色主题）。素材都放在 [`assets/`](https://github.com/morehao/dsh-skills-console/tree/main/assets)（位图图标与界面截图），不随 npm 包发布，所以这里用绝对地址引用，GitHub 与 npm 页面都能看到。

**已安装清单**：来源、调用策略、共享的 Agent、更新状态一屏看全；顶部切「已安装 / 订阅」。

![已安装清单：来源、调用策略、共享的 Agent 与更新状态一屏看全](https://raw.githubusercontent.com/morehao/dsh-skills-console/main/assets/screenshot-1-installed.png)

**只读查看器**：列表不动，右侧抽屉渲染 `SKILL.md`；可切原文、看文件树与信息，也能进整页阅读。

![只读查看器：右侧抽屉渲染 SKILL.md，可切原文与文件树](https://raw.githubusercontent.com/morehao/dsh-skills-console/main/assets/screenshot-2-viewer.png)

**AI 简介**：点行内 ✨，看模型概括的「能做什么、什么时候用」；和调用策略等弹窗一样居中打开，生成过就直接读本地缓存。

![AI 简介：居中弹窗展示模型生成的能力简介](https://raw.githubusercontent.com/morehao/dsh-skills-console/main/assets/screenshot-3-intro.png)

**订阅清单**：只记 `owner/repo` 的上游快照；展开看仓库里有几个技能、哪些已装、各自状态。

![订阅清单：展开仓库查看技能与安装状态](https://raw.githubusercontent.com/morehao/dsh-skills-console/main/assets/screenshot-4-subscriptions.png)

**添加订阅**：填 `owner/repo` 或 GitHub URL，ref 与子目录可空；只关注，不下载技能。

![添加订阅：填写来源、ref 与子目录](https://raw.githubusercontent.com/morehao/dsh-skills-console/main/assets/screenshot-5-subscribe-dialog.png)

## 界面

- **两个入口**：默认在 DSH 设置页的「技能控制台」分区；页头 ⚙ 里打开「侧边栏入口」，左侧栏就会出现独立面板，切换立即生效。
- **一页两 tab**：已安装 / 订阅。页头右侧是「新安装时自动共享」与「添加技能 / 添加订阅」。
- **每行五个动作**：开关（启停）、查看、更新、共享设置、删除；技能名旁的 ✨ 打开 AI 简介；窄面板下隐藏「查看」，技能名本身仍是入口。状态标签覆盖最新 / 可更新 / 安装后有改动 / 上游已移除 / 软链断裂 / 无上游等。
- **窄面板不跳版**：动作组按面板宽度自然换行，插件名始终完整；列表按宽度切两列；滚动只发生在列表区，切 tab、调整窗口都不会让整页翻面。
- **Agent 多了不挤**：每行最多展示 3 个，其余折成 `+n`，悬浮或聚焦即可看全。
- **找得到**：支持按名称 / 来源 / Agent 搜索，按「可更新 / 待检查 / 已停用」筛选，平铺或按 Agent 分组。
- **待检查 vs 无上游**：「待检查」只表示这次没拿到上游结论（限流、网络、仓库 404 等），下次检查会重试；没有可用来源的技能标「无上游」，不参与更新检查。

## 查看技能内容

管理途中想知道「这个技能写了什么、值不值得留」，点技能名或行内「查看」即可：

- **抽屉速览**：列表不动，右侧滑出只读抽屉；Esc / 点遮罩 / × 关闭，关闭后回到原来的筛选与滚动位置。
- **整页深读**：抽屉底部「在整页打开」切到整页阅读（正文 + 左侧目录），顶部返回条回列表。
- **三个 tab**：正文（渲染 / 原文切换，原文保留 frontmatter）、文件（目录树 + 单文件预览；`.md` 默认渲染、可切原文，其他文本直接出源码）、信息（来源、ref、commit、skillPath、内容哈希、安装 / 更新时间、共享至哪些 Agent、启停、安装后改动）。
- **只读**：没有输入框和保存按钮。更新 / 共享设置按可写状态决定是否可用；状态文件损坏时仍可查看，管理动作禁用。
- **能预览什么**：能按 UTF-8 解码的文本文件（`.md` / `.html` / `.jsx` / `.css` / `.sh` / 无扩展名脚本…）直接显示源码；单文件上限 256 KB（超出截断并提示）；图片、音视频、压缩包等二进制显示「暂不支持预览」和文件名 / 大小。

## 技能简介（AI 生成）

有些技能只有英文说明，也有的光看标题不知道能干什么。已安装列表里每行技能名旁都有一个 `✨ 简介`：

- **点开即看**：生成过的直接显示本地缓存，秒开；没生成过才出现「生成简介」按钮，点它才调模型。
- **写什么**：2–3 句能力简介——能做什么、什么时候用，并写清**怎么触发**：优先照抄 `SKILL.md` 里的触发词 / 示例请求，原文没写就按作者描述归纳成可以直接说的话（关键词或一句示例），也可以写技能名 / 斜杠命令；必要时点出关键限制；用模型自己的话概括，不是逐字翻译。
- **发什么**：`SKILL.md` 正文（超出 `maxInputBytes` 截断）与技能目录的文件名清单（最多 30 个），**不读其他文件内容**；语言跟随界面（中文 / English）。
- **缓存在本地**：`$DSH_HOME/cache/skills-console/intros.json`，按技能名 + 语言分开存；`SKILL.md` 内容哈希变了会提示「可能过期」，重新生成才覆盖。失败不缓存。旧版本放在 `$DSH_HOME/skills-console/intros.json` 的缓存仍会被只读读到，下次生成时写到新位置。
- **默认模型**：优先用 `config.intro.provider/model`，没配就用 DSH 当前默认模型；同一时间只跑一个生成，重复点击返回「正在生成」。
- **订阅候选也能看**：展开订阅后，条目行同样有 `✨ 简介`；按快照 `commit` 拉远端 `SKILL.md` 再生成，缓存 key 带 commit，不挡「安装」。展开时还会显示作者自己的 frontmatter 描述，不花额度。
- **关闭方式**：`config.intro.enabled = false`（界面隐藏 ✨ 入口）。其他可调项见「数据与配置」。

## 检查与更新插件自身

页头身份胶囊旁的**刷新按钮**用来检查「技能控制台」这个插件自己有没有新版本，而管的是另一个维度——它不是检查技能的上游，而是检查本插件在 npm 上的发布：

- **怎么查**：按宿主 `pluginManager.registries()` 给的 registry 计划（继承 profile 的镜像 / 私有源 / token 配置）依次问 `<registry>/<包名>/latest`（8 秒超时，只取版本号，取不到才回退官方 `registry.npmjs.org`），与本机安装的版本比较；Host 端 5 分钟缓存，连续打开不重复打网络。启动后约 20 秒会静默热身一次，不打扰你。
- **一键更新**：桌面端有 `pluginManager` 服务时，弹窗里点「更新到 x.y.z」即可把本插件重装到最新版（装到查到最新版的那个 registry）。HMR 开启时宿主会以 `already-installed` 拒绝覆盖同名已安装包，插件按官方更新路径先 `removeBundle` 再 `installBundle`；更新成功后**重启 DSH 生效**（不自动刷新）。
- **手动兜底**：环境不支持一键更新时，弹窗给出可复制的手动命令（`dsh plugin --profile <profile> add <包名>@latest`）。
- **有新版本时**：刷新按钮上会亮一个小圆点，点开即见当前版本 / 最新版本与更新按钮；弹窗还会拉取该版本在 GitHub 上的 **Release 发布说明**正文一并展示（拉不到时给「在 GitHub 查看发布说明」链接）。
- **边界**：只问 registry、只装本插件自身，不读写其他插件的状态目录；失败静默降级为「暂时无法获取最新版本」，不影响技能管理的任何功能。

## 安装

插件自带下载与解压能力，**不需要预装 Node / npm / npx / git**；首次安装需要联网拉取依赖。

在 Harness 里装本地 link：

```bash
plugin_manager install_bundle(target = <本仓库绝对路径>)
```

或写进 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-skills-console
      name: '@morehao/dsh-skills-console'
```

面板出现在 DSH Web 的设置页 / 侧栏。

## 快速上手

1. **添加技能**：点右上角「添加技能」，填 `owner/repo` 或 GitHub URL，点「检测技能」；仓库里有多个技能时勾选要装的（支持多选，默认全选，列表带每个技能的说明），只有一个会默认勾上。检测不到时可以手填技能名，留空则装仓库内全部。
2. **共享至其他 Agent**：只有「只读自己目录」的 Agent 才需要这一步（例如 Claude Code）。点行内「共享设置」勾选目标 Agent；本来就读共享目录的 Agent 不在列表里。之后新装技能默认共享至哪些 Agent，用页头「新安装时自动共享」设定（默认一个都不勾）。
3. **检查更新**：手动检查与后台自动检测是**互补**的两条路径，共用同一套判定、结论都落在已安装页的更新状态里。手动点列表头上的刷新图标即可检查、点亮「更新」或「全部更新」；后台另每 6 小时自动跑一次（复用 DSH 的 timer 服务，未装 timer 时这项静默跳过，手动检查不受影响），所以打开面板时往往已是最新。本地改过的技能更新前会先要求确认。
4. **调用策略**：点行内「自动 / 仅手动 / 完全停用」状态按钮，在居中的调用策略弹窗里切换。自动＝模型与 `/` 都能调用；仅手动＝只改 `SKILL.md` 的 `disable-model-invocation`，`/` 仍可用；完全停用＝把 `SKILL.md` 改名为 `SKILL.md.disabled` 并留 marker，恢复时回到停用前的模式。作者已在 `SKILL.md` 里声明仅手动时，chip 只读展示，不会被覆盖。停用期间更新 / 安装会被拒绝，避免文件被悄悄写回。

## 安全与可靠性

- **只动自己的东西**：只维护本插件创建的链接；删除前先体检，要删的链接已被换成真实目录或外来链就中止，别人的同名链接不碰也不删。
- **文件改动的边界**：自动只写插件状态；仅手动只改 frontmatter 的一行并先备份；完全停用只做改名 + marker，内容一字节不差。v3 lock、共享链接与正文都不碰；更新会重放调用策略，其余本地改动仍会先要求确认。
- **可回滚**：删除进回收站（7 天）；更新前自动备份，失败还原上一版，需要时也能手动回滚。
- **状态坏了就只读**：状态文件损坏或版本不认识时，插件降级只读、管理动作禁用，不猜结构、不自动修复。
- **不接收任意路径**：请求里的目标一律走注册表反查，共享链接只会指向共享目录下的同名技能。
- **大仓库也能更新**：带设计素材的大仓库（压缩包 50MB+）不会被大小上限卡住。
- **「仅手动」有明确入口**：可以在控制台切换，也可能由技能作者在 `SKILL.md` 里声明；作者声明时只读展示，不会被覆盖，也不会被当成异常。
- **同名副本会点名**：项目或用户目录里另有同名技能时，界面直接指出「模型看到的是另一份」，不假装可见的就是共享目录那一份。
- **限流有兜底**：公开仓库匿名可用；GitHub 配额打满时会自动换通道继续检查，也可以设置 `GITHUB_TOKEN`，把配额从 60 次/小时提到 5000 次/小时——私有仓库安装也靠它。

## 数据与配置

| 项 | 位置 |
| --- | --- |
| 技能本体 | `~/.agents/skills`（DSH 与多数 Agent 共用的技能目录） |
| 插件状态 | `$DSH_HOME/skills-console/state.json`（`DSH_SKILLS_CONSOLE_HOME` 可换根目录） |
| 备份 / 回收站 | `$DSH_HOME/skills-console/{backups,trash}`；仅手动改写的原文另存 `backups/invocation/` |
| 技能简介缓存 | `$DSH_HOME/cache/skills-console/intros.json`（可丢缓存，`DSH_SKILLS_CONSOLE_CACHE_HOME` 可换根目录；已安装技能按名字、订阅候选按 `source@commit:path`，只存生成的文本与元数据，不存 `SKILL.md` 原文） |
| 事件日志 | `$DSH_HOME/skills-console/dsh-skills-console.log`（JSONL，1MB 滚动） |

技能本体留在共享目录，共享只是建链，不搬文件。

技能简介的可调项（写在 profile / `cordis.patch.yml` 的插件 `config` 里）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `intro.enabled` | `true` | `false` 时界面隐藏 ✨ 入口，接口返回 501 |
| `intro.provider` / `intro.model` | 空 | 留空用 DSH 当前默认模型；两个必须同时给 |
| `intro.maxInputBytes` | `24576` | 发给模型的 `SKILL.md` 上限（8–48 KB），超出截断并在提示词里标注 |
| `intro.maxOutputTokens` | `4096` | 输出上限（96–8192）。这是防跑飞的预算，不是长度目标；推理模型的思考 token 也计入，实际会按模型自动抬高保底 |
| `intro.timeoutMs` | `60000` | 单次生成超时（5–60 秒），超时返回 504 |

简介长度由提示词里的 160 字控制，不要把 `maxOutputTokens` 当成目标长度；调小它不会省钱，只会让推理模型没有输出正文的空间。

## 开发与发布

源码结构、测试策略与本地 `link:` 验证见 [docs/development.md](docs/development.md)；可见性、数据落点与实现边界见 [docs/internals.md](docs/internals.md)；发布流程与排障清单见 [docs/publishing.md](docs/publishing.md)。在本仓工作的 AI agent 请先读 [AGENTS.md](AGENTS.md)。

## 边界（明确不做）

- 不做技能市场 / 搜索，也不接管或改写其他工具自己的 Agent 分发。
- 不编辑技能正文：查看器只读；只有「仅手动」会改 frontmatter 的 `disable-model-invocation`，「完全停用」只做改名，其它内容不碰。
- 不做文件级差异预览：只给 commit 区间与受影响技能；要看具体行，在终端跑 `git diff <from>..<to> -- <skillDir>`。
- 不做图片 / 二进制预览。
- 不做跨机器同步，不落盘任何 token。
- 不做进程级隐身：「自动」的启停只对 DSH 生效；「完全停用」会改名 `SKILL.md`，读该目录的其他 Agent 也看不到，但不会阻止外部重新写回文件。
- 不支持项目级启停：项目里的同名技能仍按 DSH 的优先级可见。
- 不接管宿主 preset 层与其他插件自带的技能源；诊断里会把它们标成盲区，而不是假装支持。

## 许可

MIT

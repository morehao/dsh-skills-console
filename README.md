<img src="icon.svg" width="64" height="64" alt="技能控制台图标" align="right" />

# 技能控制台 · dsh-skills-console

[![npm version](https://img.shields.io/npm/v/@morehao/dsh-skills-console.svg)](https://www.npmjs.com/package/@morehao/dsh-skills-console)
[![check](https://github.com/morehao/dsh-skills-console/actions/workflows/check.yml/badge.svg)](https://github.com/morehao/dsh-skills-console/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/@morehao/dsh-skills-console.svg)](LICENSE)

DSH（DeepSeek Harness）的**技能控制台**：装、更新、删除、接入其他 Agent、随时启停，外加一份订阅清单。

它不搬技能。技能真身由插件内的 **native installer** 写进 `~/.agents/skills`，并维护 v3 lock；本插件只在 DSH 这一侧做控制台：决定**哪些技能、对谁、在哪一层可见**，并把每次改动做成可回滚的事务。

## 为什么需要它

- **两份目录，一个真身**：技能装在 `~/.agents/skills`；DSH 默认同时扫描 `~/.dsh/skills`（rank 400）和 `~/.agents/skills`（rank 500）。插件负责在 DSH 侧建软链，不复制文件、不产生第二份真相。
- **一份技能，多个 Agent**：Claude Code / Cursor / Codex … 各自只认自己的 `skills` 目录。勾一次，分别建链，之后装新技能也能按偏好自动接入。
- **装完不是结束**：上游仓库一直在动。插件按 commit 比对，先给出「会影响哪些技能」的计划，再让你决定更新。
- **停用 ≠ 删掉**：关掉 DSH 侧链接，文件和其他 Agent 的接入原样保留；注意 canonical 本身仍在 DSH 的扫描根里，彻底隐藏需要 provider 覆盖层（尚未实现）。
- **删错还能救**：删除前先快照进回收站（保留 7 天），更新失败自动回滚上一版。

## 功能

| 能力 | 说明 |
| --- | --- |
| 清单 | canonical 扫描 + v3 lock 对账 + DSH 实际可见性对账；canonical 里已有的技能首次读取自动纳入追踪，不必逐个「接管」 |
| 安装 | 填 `owner/repo`（可只装其中几个技能），native installer 下载 codeload tarball → 安全解压 → 本地计算 tree SHA → 原子落盘 canonical + v3 lock；来自订阅快照时核对哈希，不一致会提示 |
| 更新 | GitHub Trees 检测上游新 commit → 计划（commit 区间 + 影响范围 + 防抖 token）→ 应用前备份，失败自动回滚上一版 |
| 删除 | 先体检（真实目录 / 外部链接直接中止）→ 快照进回收站 → installer 删 lock 条目与真身（lock 写失败从回收站恢复）→ 只清本插件建的链接与记账 |
| 接入 | 软链四态判定（`managed` / `managed-external` / `foreign-link` / `real`），**绝不覆盖**别人创建的东西；只列本机已安装目录，已删的 Agent 自动从列表消失 |
| 启停 | `mode: on/off` 只摘或重建 DSH 侧链接，不动 `SKILL.md`，其他 Agent 的链接也不受影响；canonical 仍在 rank 500 扫描范围，彻底隐藏待 provider 覆盖层 |
| 作用范围 | 全局 `~/.dsh/skills`，或仅指定项目；项目可直接勾选 DSH 已登记的工作区，也可手动选目录 |
| 查看 | 已安装技能可以只读打开：抽屉速览或整页深读，正文渲染 / 原文切换，文件树与单文件预览，信息 tab 汇总来源、哈希、接入与更新时间 |
| 订阅 | 关注 `owner/repo`（可指定 ref / 子目录；ref 缺省时跟随仓库默认分支，`master` 仓库也能用），只记快照、不装技能；上游读不到快照时直接报错，不会留下空订阅 |

## 界面

- **两个入口**：默认在「设置 → 技能控制台」；页头 ⚙ 里可切到左侧栏独立面板，切换立即生效。
- **一页两 tab**：已安装 / 订阅。页头右侧是「自动接入」（多选 Agent）与「添加技能 / 添加订阅」。
- **每行五个动作**：开关（启停）、查看、更新、接入设置、删除；窄面板下隐藏「查看」，技能名本身仍是入口。状态标签覆盖最新 / 可更新 / 本地已改 / 上游已移除 / 软链断裂 / 无上游等。
- **窄面板不跳版**：页头按内容自然换行——放得下时动作组在标题行右侧，放不下（约 630px 以下，如设置页）就整组换到下一行并靠右，插件名始终完整；列表按面板自身宽度在 860px 处切两列；滚动只发生在列表区（页头、工具栏、筛选条固定不动），滚动条出现/消失、切 tab、窗口微调都不会让整页翻面。
- **Agent 多了不挤**：每行最多展示 3 个，其余折成 `+n`，悬浮或聚焦即可看全。
- **找得到**：支持按名称 / 来源 / Agent 搜索，按「可更新 / 待检查 / 已停用」筛选，平铺或按 Agent 分组。
- **待检查 vs 无上游**：「待检查」只表示*这次*没拿到上游结论（限流、网络、仓库 404 等）；再次点「检查更新」时，如果上次没有结论、上游又只回了 304，会无视 ETag 完整重读一次树，不会把「待检查」永久粘住。没有可用订阅来源的技能标「无上游」——它们无法参与更新检查，不计入待检查。

## 查看技能内容

管理途中想知道「这个技能写了什么、值不值得留」，点技能名或行内「查看」即可：

- **抽屉速览**：列表不动，右侧滑出 700px 只读抽屉；Esc / 点遮罩 / × 关闭，关闭后回到原来的筛选与滚动位置。
- **整页深读**：抽屉底部「在整页打开」切到整页阅读（720px 正文 + 左侧目录），顶部返回条回列表。
- **三个 tab**：正文（渲染 / 原文切换，原文保留 frontmatter）、文件（目录树 + 单文件预览；`.md` 默认渲染、可切原文，其他文本直接出源码）、信息（来源、ref、commit、skillPath、内容哈希、安装 / 更新时间、接入 Agent、启停、本地改动）。
- **只读**：没有任何输入框和保存按钮。更新 / 接入设置按 `writable` 与 `readOnly` 复用现有规则；`state.json` 损坏时仍可查看，管理动作禁用。
- **限制**：按内容判断能否预览，能解码成 UTF-8 的源码类文件（`.md` / `.html` / `.jsx` / `.css` / `.sh` / 无扩展名脚本…）都直接显示源码；单文件上限 256 KB（超出截断并提示）；真正的二进制（图片、音视频、压缩包等）显示「暂不支持预览」+ 文件名与大小，不请求本地文件当图片渲染。

接口与错误码见 [docs/skill-viewer.md](docs/skill-viewer.md)。

## 安装

插件只带 `tar@7.5.22`（native installer 解压），**不需要用户预装 Node / npm / npx / git**。首次装插件需要联网拉取依赖。

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

客户端 half 只注册 `platform: web`，面板出现在 DSH Web 的设置页 / 侧栏。本地 `link:` 开发时，先在仓库跑一次 `npm install`（装上 `tar`），否则 native installer 的解压依赖层不会命中。

## 快速上手

1. **添加技能**：点右上角「添加技能」，填 `owner/repo` 或 GitHub URL，点「检测技能」；仓库里有多个技能时勾选要装的（支持多选，默认全选，列表带每个技能的说明），只有一个会默认勾上。检测不到时可以直接手填技能名，留空则装仓库内全部。
2. **接到别的 Agent**：点行内「接入设置」，勾选目标 Agent；需要限定项目时改选「仅以下项目」并勾工作区。之后新装技能默认接哪些 Agent，用它旁边的「自动接入」设定。
3. **检查更新**：点列表头上的刷新图标；有更新的行会亮起「更新」，也可以一次「全部更新」。本地改过的技能会先要求确认。
4. **临时停用**：关掉行内开关，摘掉 DSH 侧链接；文件和其他 Agent 的接入都还在，再打开就恢复。canonical 本身仍在 DSH 的扫描根里，所以这并不等于真正隐藏（见「可靠性」里的已知限制）。

## 可靠性

- **canonical 与 v3 lock 的写入口**：安装、更新、删除由 native installer 统一处理（下载/解压/发现/tree SHA/原子 promote/lock 事务）；插件其他模块只读。限流兜底的 codeload 扫描只在 `os.tmpdir()` 里解压，结果绝不落进 canonical 或 lock。
- **只动自己的东西**：只处理本插件创建的 `managed` 链接，以及已记账的 `managed-external`；`real` 目录和 `foreign-link` 永不改写，删除前体检直接中止。
- **启停不改正文**：`mode` 只增删 DSH 侧链接，避免本地修改被下一次安装/更新覆盖。
- **已知限制：停用 ≠ 不可见**：`mode: off` 只摘 `~/.dsh/skills`（rank 400）的链；canonical 所在的 `~/.agents/skills` 仍是 DSH rank 500 的扫描根，模型可能照旧读到该技能。彻底隐藏需要 provider 覆盖层，尚未实现。
- **可回滚**：删除进回收站（7 天）；更新前快照到 `backups/`，失败自动还原（接口另提供手动回滚）。
- **状态坏了就只读**：`state.json` 是坏 JSON 或版本未知时，插件降级为只读并让写接口返回 409，不猜结构、不自动修复。
- **不做任意路径**：请求里的目标一律走注册表反查，软链目标恒为 canonical 下同名目录。

## 数据与配置

| 项 | 路径 | 归属 |
| --- | --- | --- |
| canonical 真身 | `~/.agents/skills` | native installer（安装/删除/更新） |
| v3 lock | `~/.agents/.skill-lock.json`（设了 `XDG_STATE_HOME` 时为 `$XDG_STATE_HOME/skills/.skill-lock.json`） | native installer（安装/更新/删除） |
| DSH 全局根 | `~/.dsh/skills` | 本插件写软链 |
| 插件状态 | `$DSH_HOME/skills-console/state.json` | 本插件（`DSH_SKILLS_CONSOLE_HOME` 可覆盖） |
| 备份 / 回收站 | `$DSH_HOME/skills-console/{backups,trash}` | 本插件 |
| 事件日志 | `$DSH_HOME/skills-console/dsh-skills-console.log` | 本插件（JSONL，1MB 滚动） |

### 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `DSH_SKILLS_CONSOLE_HOME` | `$DSH_HOME/skills-console` | 状态、备份、回收站与事件日志的根 |
| `GITHUB_TOKEN` / `GH_TOKEN` | 无 | 只读环境变量；带上后 REST 配额从匿名 60 次/小时提到 5000 次/小时，私有仓库安装也靠它 |
| `XDG_STATE_HOME` | 未设置 | 设置后 lock 移到 `$XDG_STATE_HOME/skills/.skill-lock.json`，插件跟随读取 |

关于 GitHub 配额：**匿名 REST 是 60 次/小时，按出口 IP 共享**（公司、校园网出口常被同网段的人一起打满），打满后探测与更新会收到 403。本插件先走 REST；403/429 时改用 **Atom commit feed** 取 commit，再用 **codeload tarball** 在临时目录解压、扫描并本地计算 tree SHA，不占 REST 配额、也不需要 git。兜底也失败时，错误文案会给出恢复时间，并提示设置 `GITHUB_TOKEN`（5000 次/小时）。

> Atom/codeload 兜底只在 `os.tmpdir()` 里解压，用完即删；结果不会落进 canonical 或 lock。


## 开发与发布

源码结构、测试策略与调试手段见 [docs/development.md](docs/development.md)（含本地 `link:` 验证与回退步骤）；发布流程与排障清单见 [docs/publishing.md](docs/publishing.md)。在本仓工作的 AI agent 请先读 [AGENTS.md](AGENTS.md)。

## 边界（明确不做）

- 不做技能市场 / 搜索，也不接管或改写其他工具自己的 Agent 分发。
- 不编辑技能正文（`add` 会整份重建，本地改写必然被覆盖）。
- 不做技能正文编辑与图片 / 二进制预览；查看器只读，更新会整份覆盖正文。
- 不做文件级差异预览：只给 commit 区间与受影响技能；要看具体行，终端跑 `git diff <from>..<to> -- <skillDir>`。
- 不做跨机器同步，不落盘任何 token。

## 许可

MIT

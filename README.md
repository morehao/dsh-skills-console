<img src="icon.svg" width="64" height="64" alt="技能控制台图标" align="right" />

# 技能控制台 · dsh-skills-console

[![npm version](https://img.shields.io/npm/v/@morehao/dsh-skills-console.svg)](https://www.npmjs.com/package/@morehao/dsh-skills-console)
[![check](https://github.com/morehao/dsh-skills-console/actions/workflows/check.yml/badge.svg)](https://github.com/morehao/dsh-skills-console/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/@morehao/dsh-skills-console.svg)](LICENSE)

DSH（DeepSeek Harness）的**技能控制台**：装、更新、删除、接入其他 Agent、随时启停，外加一份订阅清单。

它不搬技能。技能真身始终由 [`skills`](https://www.npmjs.com/package/skills) CLI 写进 `~/.agents/skills`；本插件只在 DSH 这一侧做控制台：决定**哪些技能、对谁、在哪一层可见**，并把每次改动做成可回滚的事务。

## 为什么需要它

- **两份目录，一个真身**：技能装在 `~/.agents/skills`，DSH 只读 `~/.dsh/skills`。插件负责在两边建软链，不复制文件、不产生第二份真相。
- **一份技能，多个 Agent**：Claude Code / Cursor / Codex … 各自只认自己的 `skills` 目录。勾一次，分别建链，之后装新技能也能按偏好自动接入。
- **装完不是结束**：上游仓库一直在动。插件按 commit 比对，先给出「会影响哪些技能」的计划，再让你决定更新。
- **看不见 ≠ 删掉**：临时不想让模型用到某个技能，关掉 DSH 侧链接即可；文件和其他 Agent 的接入原样保留。
- **删错还能救**：删除前先快照进回收站（保留 7 天），更新失败自动回滚上一版。

## 功能

| 能力 | 说明 |
| --- | --- |
| 清单 | canonical 扫描 + CLI lock 对账 + DSH 实际可见性对账；canonical 里已有的技能首次读取自动纳入追踪，不必逐个「接管」 |
| 安装 | 填 `owner/repo`（可只装其中几个技能），下载、落盘、写 lock 全部交给 CLI；来自订阅快照时核对 lock 哈希，不一致会提示 |
| 更新 | GitHub Trees 检测上游新 commit → 计划（commit 区间 + 影响范围 + 防抖 token）→ 应用前备份，失败自动回滚上一版 |
| 删除 | 先体检（真实目录 / 外部链接直接中止）→ 快照进回收站 → 只删本插件建的链接与记账，CLI 的 `remove` 不带 `-a` |
| 接入 | 软链四态判定（`managed` / `managed-external` / `foreign-link` / `real`），**绝不覆盖**别人创建的东西；只列本机已安装目录，已删的 Agent 自动从列表消失 |
| 启停 | `mode: on/off` 只摘或重建 DSH 侧链接，不动 `SKILL.md`，其他 Agent 的链接也不受影响 |
| 作用范围 | 全局 `~/.dsh/skills`，或仅指定项目；项目可直接勾选 DSH 已登记的工作区，也可手动选目录 |
| 订阅 | 关注 `owner/repo`（可指定 ref / 子目录），只记快照、不装技能；装好后再逐个安装 |

## 界面

- **两个入口**：默认在「设置 → 技能控制台」；页头 ⚙ 里可切到左侧栏独立面板，切换立即生效。
- **一页两 tab**：已安装 / 订阅。页头右侧是「自动接入」（多选 Agent）与「添加技能 / 添加订阅」。
- **每行四个动作**：开关（启停）、更新、接入设置、删除；状态标签覆盖最新 / 可更新 / 本地已改 / 上游已移除 / 软链断裂等。
- **Agent 多了不挤**：每行最多展示 3 个，其余折成 `+n`，悬浮或聚焦即可看全。
- **找得到**：支持按名称 / 来源 / Agent 搜索，按「可更新 / 待检查 / 已停用」筛选，平铺或按 Agent 分组。

## 安装

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

客户端 half 只注册 `platform: web`，面板出现在 DSH Web 的设置页 / 侧栏。

> 本机可能还装着 `@michengai/dsh-skills-manager`（显示名「技能管理」）。两者互不干扰（路由前缀 `/api/morehao/skills-console/*`、状态目录 `$DSH_HOME/skills-console/` 都不同），但会各出一个设置分区；只想留一个时把另一个 `plugin_manager set_plugin enabled:false` 即可。

如果你从本插件的旧包名 `@morehao/dsh-skills-manager` 升级，新旧对照与账本搬迁见 [迁移说明](docs/migration-from-skills-manager.md)。

## 快速上手

1. **添加技能**：点右上角「添加技能」，填 `owner/repo`（需要的话再列出技能名），确认即可。安装完成后会在列表里出现。
2. **接到别的 Agent**：点行内「接入设置」，勾选目标 Agent；需要限定项目时改选「仅以下项目」并勾工作区。之后新装技能默认接哪些 Agent，用它旁边的「自动接入」设定。
3. **检查更新**：点列表头上的刷新图标；有更新的行会亮起「更新」，也可以一次「全部更新」。本地改过的技能会先要求确认。
4. **临时停用**：关掉行内开关。DSH 看不到它，但文件和其他 Agent 的接入都还在；再打开就恢复。

## 可靠性

- **canonical 与 CLI lock 只读**：`~/.agents/skills`、`~/.agents/.skill-lock.json` 的增删改只经 `skills` CLI，插件不直接写、不克隆仓库、不代理来源。
- **只动自己的东西**：只处理本插件创建的 `managed` 链接，以及已记账的 `managed-external`；`real` 目录和 `foreign-link` 永不改写，删除前体检直接中止。
- **启停不改正文**：`mode` 只增删 DSH 侧链接，避免本地修改被下一次 `add` 覆盖。
- **可回滚**：删除进回收站（7 天）；更新前快照到 `backups/`，失败自动还原（接口另提供手动回滚）。
- **状态坏了就只读**：`state.json` 是坏 JSON 或版本未知时，插件降级为只读并让写接口返回 409，不猜结构、不自动修复。
- **不做任意路径**：请求里的目标一律走注册表反查，软链目标恒为 canonical 下同名目录。

## 数据与配置

| 项 | 路径 | 归属 |
| --- | --- | --- |
| canonical 真身 | `~/.agents/skills` | `skills` CLI 独占 |
| CLI lock | `~/.agents/.skill-lock.json` | `skills` CLI 独占（本插件只读） |
| DSH 全局根 | `~/.dsh/skills` | 本插件写软链 |
| 插件状态 | `$DSH_HOME/skills-console/state.json` | 本插件（`DSH_SKILLS_CONSOLE_HOME` 可覆盖） |
| 备份 / 回收站 | `$DSH_HOME/skills-console/{backups,trash}` | 本插件 |
| 事件日志 | `$DSH_HOME/skills-console/dsh-skills-console.log` | 本插件（JSONL，1MB 滚动） |

环境变量：`DSH_SKILLS_CONSOLE_HOME`、`DSH_SKILLS_CONSOLE_CLI`、`DSH_SKILLS_CONSOLE_NPX_SPEC`、`DSH_SKILLS_CONSOLE_TIMEOUT_MS`、`GITHUB_TOKEN` / `GH_TOKEN`。

## 开发与发布

源码结构、测试策略与调试手段见 [docs/development.md](docs/development.md)；发布流程与排障清单见 [docs/publishing.md](docs/publishing.md)。在本仓工作的 AI agent 请先读 [AGENTS.md](AGENTS.md)。

## 边界（明确不做）

- 不做技能市场 / 搜索，不接管 CLI 已有的 Agent 分发，不给 CLI 打补丁。
- 不编辑技能正文（`add` 会整份重建，本地改写必然被覆盖）。
- 不做文件级差异预览：只给 commit 区间与受影响技能；要看具体行，终端跑 `git diff <from>..<to> -- <skillDir>`。
- 不做跨机器同步，不落盘任何 token。

## 许可

MIT

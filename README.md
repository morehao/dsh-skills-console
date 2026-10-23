<p align="center">
  <img src="./icon.svg" width="88" height="88" alt="dsh-skills-manager logo">
</p>

<h1 align="center">dsh-skills-manager</h1>

<p align="center">DeepSeek Harness（dsh）的技能管理插件：装 / 更新 / 删除 / 接入其他 Agent / 启停，外加订阅跟踪。</p>

## 能力

| 能力 | 说明 |
| --- | --- |
| 清单 | canonical 扫描 + `skills` CLI lock 对账 + `ctx.skills.snapshot` 可见性对账（模型可见 vs 本地账本） |
| 安装 | `skills add <owner/repo#commit> --skill … -a universal -g -y --json --full-depth`；装完断言 lock 的 `skillFolderHash` 与快照 tree SHA 一致 |
| 更新 | GitHub Trees API 检测 → 计划（commit 区间 + token）→ 应用（先备份、后重建、失败回滚） |
| 删除 | 体检（真实目录 / 外部链接即中止）→ 快照进回收站（7 天）→ `skills remove -s … -g -y`（**不带 `-a`**）→ 清自家链接与记账 |
| 接入 | 软链四态判定（`managed` / `managed-external` / `foreign-link` / `real`），**绝不覆盖**不是自己创建的东西 |
| 启停 | `mode: on/off` 只增删 DSH 侧链接，文件与其他 Agent 链接不动 |
| 订阅 | 记 `owner/repo` + ref + 子目录的快照，只跟踪不安装 |

## 设计约定

- **技能真身只认 `skills` CLI**：下载、解析、落盘 canonical（`~/.agents/skills`）、写 lock 全交给 [`skills`](https://www.npmjs.com/package/skills)；本插件只做「发链接 + 记账 + 事务编排」，不代理来源、不写 lock、不克隆仓库。
- **DSH 侧只靠原生根**：全局往 `~/.dsh/skills`（`user-dsh`，rank 400）建软链，项目维度用 `project-dsh` 根（rank 100）；不注册自有 provider、不改 DSH 配置。
- **其他 Agent 靠软链分发**：Claude Code / Cursor / Codex … 各自的 skills 目录里放指向 canonical 的软链。
- **启停 = DSH 侧链接的有无**：不改 `SKILL.md`（`add` 会整份覆盖，改文件还会让更新被锁死）。

## 安装

在 Harness 里让 `plugin_manager` 安装本仓库：

```text
plugin_manager install_bundle(target = <本仓库绝对路径>)
```

或直接写进 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-skills-manager
      name: '@morehao/dsh-skills-manager'
```

装好后设置页多出「技能」分区（一页两 tab：已安装 / 订阅）。

## 数据位置

| 项 | 路径 | 归属 |
| --- | --- | --- |
| canonical 真身 | `~/.agents/skills` | `skills` CLI 独占 |
| CLI lock | `~/.agents/.skill-lock.json` | `skills` CLI 独占（本插件只读） |
| DSH 全局根 | `~/.dsh/skills` | 本插件写软链 |
| 插件状态 | `$DSH_HOME/skills-manager/state.json` | 本插件（`DSH_SKILLS_MANAGER_HOME` 可覆盖） |
| 备份 / 回收站 | `$DSH_HOME/skills-manager/{backups,trash}` | 本插件 |
| 事件日志 | `$DSH_HOME/skills-manager/dsh-skills-manager.log` | 本插件（JSONL，1MB 滚动） |

环境变量：`DSH_SKILLS_MANAGER_HOME`、`DSH_SKILLS_MANAGER_CLI`、`DSH_SKILLS_MANAGER_NPX_SPEC`、`DSH_SKILLS_MANAGER_TIMEOUT_MS`、`GITHUB_TOKEN` / `GH_TOKEN`。

## 插件元信息与图标

桌面端 / 插件管理页显示的标题、描述、图标都来自包的导出资源，不需要激活插件即可读取：

- 标题与描述：`locale/{zh,en}.json` 的 `meta.title` / `meta.description`。
- 图标：`icon.svg`，经 `exports["./icon"]` 暴露；支持 SVG / PNG / JPEG / WebP，≤ 256 KiB，且必须留在包内。改图后同步确认 `files` 白名单里仍有 `icon.svg`（`npm run check:pack` 会校验）。

## 开发

```bash
npm test               # node --test，临时 HOME / DSH_HOME，不碰真实目录
npm run check          # 语法自检 + 命名/导出接线 + 打包白名单 + Release 说明投影
npm run sync:agents    # 从 skills CLI 的 dist 重新导出 agent 目录表
```

目录结构、测试策略与调试手段见 [docs/development.md](docs/development.md)；在本仓工作的 AI agent 先读 [AGENTS.md](AGENTS.md)。

## 发布

打注记 tag `vX.Y.Z` → GitHub Actions（OIDC / Trusted Publishing）发布到 npm → 用 tag 注记正文建 GitHub Release，不需要任何 npm token。完整流程与排障见 [docs/publishing.md](docs/publishing.md)。

## 边界（明确不做）

- 不做技能市场 / 搜索，不接管 CLI 已有的 agent 分发，不给 CLI 打补丁。
- 不编辑技能正文，不做文件级差异预览（只给 commit 区间与受影响技能）。
- 不做跨机器同步，不落盘任何 token。

## 许可

MIT

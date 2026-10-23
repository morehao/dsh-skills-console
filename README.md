# dsh-skills-console

DeepSeek Harness（dsh）的**技能控制台**：**装 / 更新 / 删除 / 接入其他 Agent / 启停**，配一个订阅列表。

> 与 `skills` CLI 的分工：CLI 是技能的唯一写者（供应链 + lock），本插件是 DSH 侧的控制台（可见性 + 接线 + 事务）。它不搬技能，它管「哪些技能、对谁、在哪一层可见」。

## 定位

- **技能真身只认 `skills` CLI**：下载、解析、落盘到 canonical（`~/.agents/skills`）、写 lock，全部交给 [`skills`](https://www.npmjs.com/package/skills) CLI。本插件不代理来源、不写 lock、不克隆仓库。
- **DSH 侧只靠原生根**：往原生 `user-dsh` 根（`~/.dsh/skills`，rank 400）建软链让 DSH 发现；项目维度写 `project-dsh` 根（rank 100）。不注册自有 provider、不改 DSH 配置。
- **其他 Agent 靠软链分发**：Claude Code / Cursor / Codex … 各自 `skills` 目录里放指向 canonical 的软链。
- **启停 = DSH 侧链接的有/无**：不动 `SKILL.md`（`add` 会整份覆盖，改文件还会让更新被锁死）。

## 状态

P0–P2 已实现并通过单测（70 个用例）：

| 能力 | 说明 |
| --- | --- |
| 清单 | canonical 扫描 + CLI lock 对账 + `ctx.skills.snapshot` 可见性对账（模型可见 vs 本地账本）；canonical 里已有的技能首次读取自动纳入追踪，不必逐个「接管」 |
| 接入 | 软链四态判定（`managed` / `managed-external` / `foreign-link` / `real`），**绝不覆盖**非本插件创建的东西；可接入的 Agent 只列本机已安装目录，「自动链接」按 Agent 多选 |
| 入口 | 默认在设置页「技能控制台」分区；页头 ⚙ 图标里可切到左侧栏独立面板，切换立即生效；包名 / 版本合并为一枚 chip，⚙ / GitHub 图标与「自动链接 / 添加技能」一起右对齐 |
| 安装 | `skills add <owner/repo#commit> --skill … -a universal -g -y --json --full-depth`，装完断言 lock 的 `skillFolderHash` 与快照 tree SHA 一致 |
| 更新 | GitHub Trees API 检测 → 计划（commit 区间 + token）→ 应用（先备份、后重建、失败回滚） |
| 删除 | 体检（真实目录/外部链接即中止）→ 快照进回收站（7 天）→ `skills remove -s … -g -y`（**不带 `-a`**）→ 清自家链接与记账 |
| 启停 | `mode: on/off` 只摘 DSH 侧链接，文件与其他 Agent 链接不动 |
| 作用范围 | 全局，或仅 `project-dsh` 根；项目可直接勾选 DSH 已登记的工作区 |
| 订阅 | `owner/repo` + ref + 子目录，只记快照不安装 |

## 安装

```bash
# 在 Harness 里：plugin_manager install_bundle(target = 本仓库绝对路径)
```

或写进 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-skills-console
      name: '@morehao/dsh-skills-console'
```

> ⚠️ 本机 profile 里可能还装着 `@michengai/dsh-skills-manager`（显示名「技能管理」）。两者互不干扰（路由前缀 `/api/morehao/skills-console/*`、状态目录 `$DSH_HOME/skills-console/` 均不同），但会各出一个设置分区；只想留一个时把另一个 `plugin_manager set_plugin enabled:false` 即可。

## 从 `dsh-skills-manager` 迁移

`v0.2.0` 起包名、插件 id、路由前缀与状态目录都换成 `skills-console`，**不提供兼容读旧值**：

| 层面 | 旧 | 新 |
| --- | --- | --- |
| npm 包 / 模块标识符 | `@morehao/dsh-skills-manager` | `@morehao/dsh-skills-console` |
| 插件 id（配置树键） | `dsh-skills-manager` | `dsh-skills-console` |
| 路由前缀 / 鉴权头 | `/api/morehao/skills-manager` · `x-dsh-skills-manager` | `/api/morehao/skills-console` · `x-dsh-skills-console` |
| 状态目录 | `$DSH_HOME/skills-manager/` | `$DSH_HOME/skills-console/` |
| 环境变量 | `DSH_SKILLS_MANAGER_*` | `DSH_SKILLS_CONSOLE_*` |

**保住现有账本**（订阅、回收站、链接记录、版本缓存）只需把旧目录搬过去：

```bash
mv ~/.dsh/skills-manager ~/.dsh/skills-console
```

不搬也能用：软链四态判定会把已有链接读成 `managed-external`（指向 canonical 但账本无记录），在设置页点一次「接管」即可恢复接管，**不会误删也不会覆盖**；代价是订阅列表、回收站快照与「已停用」状态会丢失。

安装侧：profile 的 `package.json` 依赖键要从 `@morehao/dsh-skills-manager` 换成新名（`link:` 本地接入时同步改路径），否则 bundle 不会加载。

## 开发

```bash
npm test               # node --test，临时 HOME / DSH_HOME，不碰真实目录
npm run check          # 语法自检 + 命名/导出接线 + 打包白名单 + Release 说明投影冒烟
npm run sync:agents -- <skills/dist/cli.mjs>   # 重新导出 agent 目录表（默认写回 lib/agent-table.json）
```

目录结构、测试策略（离线 / stub CLI / 各用例覆盖什么）与调试手段见 [docs/development.md](docs/development.md)；
在本仓工作的 AI agent 请先读 [AGENTS.md](AGENTS.md)（硬约束与任务路由）。

## 发布

打注记 tag `vX.Y.Z` → GitHub Actions（OIDC / Trusted Publishing）自动发布到 npm → 用 tag 注记正文建 GitHub Release；不需要任何 npm token。完整流程、一次性建包配置与排障清单见 [docs/publishing.md](docs/publishing.md)。

```bash
# 升版本走分支 + PR；合并后在 main 最新提交上打注记 tag（正文就是 Release body）
git tag -a v0.2.0 -m "release: v0.2.0
<变更说明>"
git push origin v0.2.0
```

## 数据位置

| 项 | 路径 | 归属 |
| --- | --- | --- |
| canonical 真身 | `~/.agents/skills` | `skills` CLI 独占 |
| CLI lock | `~/.agents/.skill-lock.json` | `skills` CLI 独占（本插件只读） |
| DSH 全局根 | `~/.dsh/skills` | 本插件写软链 |
| 插件状态 | `$DSH_HOME/skills-console/state.json` | 本插件（`DSH_SKILLS_CONSOLE_HOME` 可覆盖） |
| 备份 / 回收站 | `$DSH_HOME/skills-console/{backups,trash}` | 本插件 |
| 事件日志 | `$DSH_HOME/skills-console/dsh-skills-console.log` | 本插件（JSONL，1MB 滚动） |

环境变量：`DSH_SKILLS_CONSOLE_HOME`、`DSH_SKILLS_CONSOLE_CLI`、`DSH_SKILLS_CONSOLE_NPX_SPEC`、`DSH_SKILLS_CONSOLE_TIMEOUT_MS`、`GITHUB_TOKEN`/`GH_TOKEN`。

## 边界（明确不做）

- 不做技能市场/搜索，不接管 CLI 已有的 agent 分发，不给 CLI 打补丁。
- 不编辑技能正文（`add` 会整份重建，本地改写必然被覆盖）。
- 不做文件级差异预览：只给 commit 区间与受影响技能；要看具体行，终端跑 `git diff <from>..<to> -- <skillDir>`。
- 不做跨机器同步，不落盘任何 token。

## 许可

MIT

# 实现与数据边界

> [README](../README.md) 讲能做什么；这里讲数据落在哪、可见性怎么算、哪些东西不碰。面向在本仓改代码或排查问题的人；开发流程见 [development.md](development.md)。

## 1. 技能真身与写入口

- **canonical 真身**：`~/.agents/skills`（`$DSH_AGENTS_HOME/skills`），本身也是 DSH 的 rank 500 扫描根。
- **唯一写入口**：安装 / 更新 / 删除都由 native installer（`lib/core/installer.ts`）完成——下载 codeload tarball → 安全解压 → 发现 `SKILL.md` → 本地计算 tree SHA → 原子 promote → v3 lock 事务。其他模块只读，禁止再手写 canonical 或 lock。
- **v3 lock**：`~/.agents/.skill-lock.json`；设置了 `XDG_STATE_HOME` 时是 `$XDG_STATE_HOME/skills/.skill-lock.json`。
- **回滚素材**：删除前快照进回收站；更新前快照到 `backups/`，失败自动还原；lock 写失败从回收站恢复。
- **限流兜底**：GitHub REST 403/429 时，探测与更新检查改用 Atom commit feed + codeload tarball；tarball 只在 `os.tmpdir()` 解压扫描，用完即删，结果不落 canonical 或 lock。codeload 默认上限 100MB（解压侧 200MB / 1 万文件兜底）。

## 2. 可见性模型

DSH 会把所有扫描根合并成一张技能表，**rank 小的先赢**；同层内按 rank 升序，项目级覆盖全局。

| rank | 来源 | 本插件怎么用 |
| --- | --- | --- |
| 100 | `<项目>/.dsh/skills` | 只读；有同名副本时 provider 不发候选，副本优先可见 |
| 200 | `<项目>/.agents/skills` | 只读；同上 |
| 300 | `Config.customSkillDirs` | 只读；本插件读不到宿主 custom 配置，是盲区，诊断里标注 |
| 400 | `~/.dsh/skills` | v0.4.0 起不写；legacy 停用桩迁移时清理 |
| 500 | `~/.agents/skills`（`$DSH_AGENTS_HOME/skills`） | canonical 真身，native installer 写；停用时由 agent scope 的 policy provider 条件覆盖 |

以上是文件系统扫描根的 rank；policy provider 注册在 agent scope（preset scope 的子层），跨层按层序直接赢，不靠这张表。

所以「停用」不是往扫描根放桩，而是：写 `installs[].enabled=false`，再让每个 live agent scope 里的 policy provider **只在 canonical 是 native winner 时**发一个 `modelInvocable=false` + `userInvocable=false` 的同名候选。项目级副本（100/200）或 user-dsh 副本（400）存在时，provider 保持沉默，模型仍看到副本；行内用 `visibility.scopeMismatch` 提示「另一份同名技能排在前面」。这是产品语义，不是 bug。

`~/.dsh/skills` 里**不要**再放真身或指向真身的链：那会变成两份真相，正是 v0.3 之前「摘了链却还可见」的根源。`DSH_AGENTS_HOME` 被改到别处时，`~/.agents/skills` 就不再是扫描根——本插件不建可见性链兜底，而是在 `/diagnostics` 里报一条 `canonical-not-scanned`。

**可见性以现场扫描为准**：`/state` 的 `visible` 来自真扫一遍各扫描根 + 宿主 `snapshot()`，再叠加 `enabled=false` 的 policy 判定，不是从账本推的。账本与磁盘不一致时出现在 `diagnostics.drift` 里（导出悬空、legacy 桩残留、启用却不可见……）。`/diagnostics` 另有一个只读的 `dshRegistry` 段：列出 DSH registry 额外看到、但不在扫描根里的技能（bundled / 插件 / customSkillDirs / 远端 provider），**仅供排查，不参与 `visible`**，正是下面说的「盲区」明细。

**技能身份是 `SKILL.md` frontmatter 的 `name`，不是目录名**：宿主 `discoverRoot` 也按 frontmatter 的 `name` 读，所以 `xxx.bak-20260101/`（frontmatter 还写着 `name: xxx`）会被当成 `xxx`，和真身在同一个名字上抢 rank——rank 小的赢。没有 `SKILL.md`、缺 `name` / `description`、名字不合法的目录，宿主根本不当技能看，控制台也不算进可见列表。

**manual-only**：技能自己在 `SKILL.md` 里写 `disable-model-invocation: true` 时，模型调用看不到它，但 `/` 手动调用仍可用；诊断不会把它算成 `enabledButHidden`。控制台 v4 起也可以主动切到「仅手动」：只写这一行 frontmatter，作者已声明时只记只读来源，不改写。

**legacy 停用桩只用于迁移**：旧版本的桩目录带 `.dsh-skills-console.json` 标记；v2→v3 迁移只删带这个标记的桩，`foreign` / `link` 一律保留并报告，删不掉的进 `legacyShadows[]`。v0.4.0 起不再新建停用桩，也不再往 `~/.dsh/skills` 写任何东西。

## 3. 文件与状态

| 项 | 路径 | 归属 |
| --- | --- | --- |
| canonical 真身 | `~/.agents/skills`（DSH rank 500 扫描根） | native installer（安装 / 删除 / 更新） |
| Agent 共享根 | `$DSH_AGENTS_HOME/skills`（默认即 `~/.agents/skills`） | 各 Agent 自己读；本插件只读 |
| 迁移留档 | `$DSH_HOME/skills-console/migrations/` | 本插件（v1→v2、v2→v3 的清单与状态副本，保留 7 天） |
| v3 lock | `~/.agents/.skill-lock.json`（设了 `XDG_STATE_HOME` 时为 `$XDG_STATE_HOME/skills/.skill-lock.json`） | native installer（安装 / 更新 / 删除） |
| DSH 用户局部根 | `~/.dsh/skills`（rank 400） | v0.4.0 起**不写**；只作为 legacy 停用桩的迁移清理对象 |
| 插件状态 | `$DSH_HOME/skills-console/state.json` | 本插件（`DSH_SKILLS_CONSOLE_HOME` 可覆盖） |
| 备份 / 回收站 | `$DSH_HOME/skills-console/{backups,trash}` | 本插件 |
| 技能简介缓存 | `$DSH_HOME/cache/skills-console/intros.json` | 本插件（可丢缓存，`DSH_SKILLS_CONSOLE_CACHE_HOME` 可覆盖；v0.5.8 及更早的 `$DSH_HOME/skills-console/intros.json` 只读回退） |
| 事件日志 | `$DSH_HOME/skills-console/dsh-skills-console.log` | 本插件（JSONL，1MB 滚动） |

state v4 的形状、v3→v4 与 v1→v2→v3 迁移步骤、诊断字段见 [development.md §4](development.md#4-调试)。

## 4. 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `DSH_SKILLS_CONSOLE_HOME` | `$DSH_HOME/skills-console` | 状态、备份、回收站与事件日志的根 |
| `DSH_SKILLS_CONSOLE_CACHE_HOME` | `$DSH_HOME/cache/skills-console` | 可丢缓存的根（目前是技能简介 `intros.json`）；按 DSH 的 `dshCachePath` 约定与状态目录分家 |
| `GITHUB_TOKEN` / `GH_TOKEN` | 无 | 只读环境变量；带上后 REST 配额从匿名 60 次/小时提到 5000 次/小时，私有仓库安装也靠它 |
| `XDG_STATE_HOME` | 未设置 | 设置后 lock 移到 `$XDG_STATE_HOME/skills/.skill-lock.json`，插件跟随读取 |
| `DSH_AGENTS_HOME` | `~/.agents` | DSH 自己的设置：共享技能根（rank 500）与各 Agent 的默认目录都从这里派生。改到别处后 canonical 不在扫描根里，本插件不负责 DSH 可见性（`/diagnostics` 的 `canonical-not-scanned` 会提示） |

关于 GitHub 配额：**匿名 REST 是 60 次/小时，按出口 IP 共享**（公司、校园网出口常被同网段的人一起打满），打满后探测与更新会收到 403。本插件先走 REST；403/429 时改用 **Atom commit feed** 取 commit，再用 **codeload tarball** 在临时目录解压、扫描并本地计算 tree SHA，不占 REST 配额、也不需要 git。兜底也失败时，错误文案会给出恢复时间，并提示设置 `GITHUB_TOKEN`（5000 次/小时）。

> Atom/codeload 兜底只在 `os.tmpdir()` 里解压，用完即删；结果不会落进 canonical 或 lock。

## 5. Agent 表与导出资格

- **哪些 Agent 不需要导出**：`lib/agent-table.json` 里 `universal: true` 的条目自己也读 `~/.agents/skills`——装好就看得见，导出是多余的。当前表里 11 个：Amp、Antigravity、Antigravity CLI、Cursor、Deep Agents、Droid、Firebender、Gemini CLI、GitHub Copilot、Kilo Code、OpenCode。判定来自上游 `skills` CLI 的 `skillsDir === '.agents/skills'`。
- **表不要手改**：由 `npm run sync:agents` 从上游 [skills](https://github.com/vercel-labs/skills) 生成，输入可以是仓库里的 `src/agents.ts`，也可以是发布包里的 `node_modules/skills/dist/cli.mjs`（两者解析结果一致）。表头 `upstream: {name, version, from}` 记录出处，据此判断落后了几版。
- **导出与可见性解耦**：`exports` 只给不读共享根的其他 Agent 建链，默认空；没有任何导出的技能照样应该对 DSH 可见。界面把这套能力叫「共享」（列名「共享 Agent」，行内「共享设置」），Host 与 API 内部仍用 `exports`。
- **软链四态**：`managed` / `managed-external` / `foreign-link` / `real`。只动自己建的 `managed` 与已记账的 `managed-external`；`real` 与 `foreign-link` 永不改写，删除前体检即中止。导出清单只认真实指向 canonical 的链，`foreign-link` 指向别的副本、`real` 是本地实体目录，都不会被冒充成导出。
- **行内 Agent 列只列显式导出**：只有「不支持共享根、且真的建了导出链」的 Agent 才出现（最多 3 个，其余折成 `+n`）；直读共享根的 Agent（OpenCode / Cursor 等）装好即见，不逐行展示，没有导出时显示「未共享」（悬停说明共享根 Agent 装好即见）。按 Agent 视图只给有导出的 Agent 分组；抽屉的信息 tab 只列「已共享」。

# AGENTS.md

> 给在本仓工作的 AI agent。人类向说明见 [README](README.md) 与 [docs/](docs/)；本文件只放**每次都必须遵守**的硬约束与任务路由。命中具体任务时再读 `docs/agents/` 对应篇，不要一次全读。

## 1. 项目速览

- 包：`@morehao/dsh-skills-manager`，DeepSeek Harness（dsh）的**技能管理插件**；**仓库根即包根**，无 workspace、无子包目录。
- 两个 half：Host（[lib/index.js](lib/index.js) → [lib/routes.js](lib/routes.js) + [lib/core/](lib/core/)）与 Web Client（[client.js](client.js)，`window.__ModuleLoader__` 预打包 bundle；默认 `settings.section` 一页两 tab，可在页内切到 `sidebar.panellist` + `main` 独立面板）。
- 纯 ESM、**零 runtime 依赖**、无构建步骤；Node ≥ 22.20（`engines` 另接受 ≥ 24）。
- 技能真身只认 [`skills`](https://www.npmjs.com/package/skills) CLI：下载/落盘 canonical（`~/.agents/skills`）/写 lock 全交给它；本插件只做「发链接 + 记账 + 事务编排」。
- 发布：注记 tag `vX.Y.Z` → GitHub Actions OIDC → npm；发布成功后 CI 用注记正文建 GitHub Release。

| 路径 | 作用 |
|---|---|
| [lib/index.js](lib/index.js) | `export const name = "dsh-skills-manager"`、`inject`、`apply()` 装配 |
| [lib/routes.js](lib/routes.js) | prefix 路由 `/api/morehao/skills-manager/*`，自定义头鉴权，统一 JSON 错误码 |
| [lib/core/service.js](lib/core/service.js) | 业务编排：清单 / 安装 / 更新 / 回滚 / 删除 / 启停 / 接管 / 订阅 |
| [lib/core/paths.js](lib/core/paths.js) | 路径与 env 覆盖（`HOME` / `XDG_CONFIG_HOME` / `DSH_HOME` / `DSH_SKILLS_MANAGER_HOME`） |
| [lib/core/cli.js](lib/core/cli.js) | `skills` CLI 定位（四层探测 + `npx` 兜底）、能力位、spawn 封装 |
| [lib/core/hash.js](lib/core/hash.js) | 复刻 CLI 的内容哈希（与 lock 的 `skillFolderHash` 对拍） |
| [lib/core/state.js](lib/core/state.js) | `state.json` 原子写 + 校验 + 只读降级 |
| [lib/core/agents.js](lib/core/agents.js) | 目标注册表（`dsh-global` / `agent:*` / `project:*` / `custom:*`） |
| [lib/core/links.js](lib/core/links.js) | 软链四态判定、建/删、幂等 |
| [lib/core/inventory.js](lib/core/inventory.js) | canonical 扫描 + lock 读取 + 可见性对账 |
| [lib/core/updates.js](lib/core/updates.js) | GitHub Trees 快照、L0–L3 判定、apply/rollback、计划 token |
| [lib/core/trash.js](lib/core/trash.js) | 删除前快照（回收站）与备份 |
| [lib/core/log.js](lib/core/log.js) | JSONL 事件日志，1MB 滚动，写失败不阻塞主流程 |
| [scripts/](scripts/) | 语法自检、命名/打包校验、agent 表导出、发布与 Release 正文投影 |
| [test/](test/) | `node --test` 用例（离线、临时 HOME、stub CLI） |
| [docs/](docs/) | 人类向文档（开发、发布）与 `docs/agents/` 任务手册 |
| `.dsh/` | 本地过程文档，已 gitignore；**不是权威来源** |

## 2. 硬约束

### 数据边界（最基本的一条）

- **canonical 与 CLI lock 只读**：`~/.agents/skills`、`~/.agents/.skill-lock.json` 一律不直接写；增删改只能经 CLI（`add` 恒带 `-a universal -g -y --json --full-depth`；`remove` 恒**不带** `-a`，避免误删其他 Agent 的目录）。
- **软链四态**：`managed` / `managed-external` / `foreign-link` / `real`。只动自己建的 `managed` 与已记账的 `managed-external`；`real` 与 `foreign-link` 永不改写、删除前体检即中止。
- **不接收任意路径**：`target` 一律走注册表反查；软链目标恒为 canonical 下同名目录；请求体路径参数不得直接拼到文件系统。
- **state 只读降级**：坏 JSON / 未知版本 → `readOnly=true` 且写接口 409，**不 fail-open、不猜结构、不自动修复**。
- **启停不改正文**：`mode: on/off` 只增删 DSH 侧链接，不编辑 `SKILL.md`（`add` 会整份覆盖，改文件还会让更新被锁死）。
- **不碰别人的东西**：与本机可能并存的 `@michengai/dsh-skills-manager` 靠自有 id/前缀/state 文件名隔离，不要改成相同前缀。

### 测试与环境

- 测试必须**离线**：临时 `HOME` / `DSH_HOME`，CLI 用 `DSH_SKILLS_MANAGER_CLI` 注入 stub；禁止读写真实 `~/.dsh`、`~/.agents` 或真实技能目录。
- 新逻辑先想「怎么在不联网、不碰真目录的前提下断言」，再落代码；网络相关分支（Trees API、CLI 退出码/超时/无 JSON）用 stub 覆盖。
- 破坏性操作（删除技能、`updates/apply`、push、tag、publish、改真实 HOME、覆盖或删除软链）先征得用户确认。
- 改 `lib/` 后需重启 dsh web；只有 `link:` 接入时源码即时生效，npm 版是拷贝。

### 包与发布

- 三处命名一致：`package.json.name` = `cordis.patch.yml` 的 `insert[0].name`；`lib/index.js` 的 `export const name` = `insert[0].id`；且 `publishConfig.access = "public"`。
- 打包只含白名单：`client.js`、`lib/`、`locale/`、`package.json`、`README.md`、`LICENSE`、`cordis.patch.yml`、`icon.svg`。`.dsh/`、`docs/`、`scripts/`、`test/`、`node_modules`、`*.tgz` 一律不入包。
- `main` 不直推；**升版本也走分支 + PR**。tag 打在合并后的 `main`，去掉 `v` 必须等于 `package.json.version`。
- GitHub Release 由 CI 在 npm 发布成功后创建，正文取自**注记** tag；`gh release create` 必须留在 [.github/workflows/release.yml](.github/workflows/release.yml)（git-kit 的 `/git-release` 预检靠它判定后效），不要挪进 `scripts/`。
- `release.yml` 的 `name:` 必须等于文件名 `release.yml`（与 npm Trusted Publisher 的 Workflow 字段精确匹配）；发布 job 需 `id-token: write`，且**不要**设 `NODE_AUTH_TOKEN`（会覆盖 OIDC）。
- workflow 用 `actions/checkout@v7` + `actions/setup-node@v7`：**不设 `registry-url`**（v7 移除了 dummy `NODE_AUTH_TOKEN` 兜底，registry 由 `ci-publish.sh` 显式 `--registry` 指定），并显式 `package-manager-cache: false`。完整发布流程见 [docs/publishing.md](docs/publishing.md)。

### 文档

- `.dsh/` 里的 specs/plans/notes/原型是本地过程文档：可以读、可以写，但**不要把结论只留在那里**——确定的契约与约定要落回 `README.md` / `docs/`。
- 子文档与代码/脚本冲突时以代码与脚本为准，并顺手修正文档。

## 3. 常用命令

| 目的 | 命令 |
|---|---|
| 全量机械校验（语法 + 命名 + 打包 + Release 说明冒烟） | `npm run check` |
| 单元测试（58 例，离线） | `npm test` |
| 单文件语法自检 | `node --check lib/core/service.js` |
| 三处命名 / `exports` / `files` 接线 | `node scripts/check-naming.mjs` |
| 打包白名单 | `node scripts/check-pack.mjs` |
| Release body 投影冒烟 | `node scripts/smoke-release-notes.mjs` |
| 重新导出 agent 目录表（需本机有 `skills` CLI） | `npm run sync:agents -- <skills/dist/cli.mjs>` |
| 发布脚本语法 | `bash -n scripts/ci-publish.sh` |

## 4. 任务路由

| 你要改 | 先读 | 必跑 |
|---|---|---|
| `lib/core/*`（清单/链接/安装/更新/删除/订阅） | 对应模块头部注释 + 相关 `test/*.test.mjs` | `npm run check` + `npm test` |
| `lib/routes.js`（接口形状、错误码、鉴权） | [lib/routes.js](lib/routes.js) 的 `matchRoute` + `client.js` 调用点 | `npm run check` + `npm test` |
| `client.js`（设置页 UI） | `test/client.test.mjs`（React 存根渲染）与 `locale/{zh,en}.json` | `npm run check` + `npm test` |
| `package.json` / `exports` / `files` / 命名 / CI / 发布 | [验证与发布](docs/agents/verification-release.md) | `npm run check`（含命名与打包） |
| 纯文档 | 对应人类文档；链接与事实核对 | 不跑代码检查 |

## 5. 完成定义

- [ ] `npm run check` 通过。
- [ ] `npm test` 通过（改了 `lib/` 必须跑）。
- [ ] 改 `package.json` / `exports` / `files` / 命名 / CI 时，`check-naming` 与 `check-pack` 通过。
- [ ] 行为或契约变更同步 `README.md` / `docs/`（按影响面，不机械全改）。
- [ ] `git status` / `git diff --stat` 无 `.dsh/`、`node_modules`、`*.tgz` 等意外文件。
- [ ] 需要用户确认的操作（删除、apply、push、tag、publish）已确认；提交不在 `main` 上。

## 6. 文档地图

| 层 | 位置 | 用途 |
|---|---|---|
| Agent 常驻约束 | `AGENTS.md` | 每次会话 |
| Agent 任务手册 | [docs/agents/](docs/agents/) | 命中任务时按需读 |
| 人类文档 | [docs/](docs/) · [README.md](README.md) | 开发与测试、发布流程、能力说明 |
| 本地过程 | `.dsh/docs/` | specs / plans / notes / 原型，gitignored |

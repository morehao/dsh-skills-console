# AGENTS.md

> 给在本仓工作的 AI agent。人类向说明见 [README](README.md) 与 [docs/](docs/)；本文件只放**每次都必须遵守**的硬约束与任务路由。命中具体任务时再读 `docs/agents/` 对应篇，不要一次全读。

## 1. 项目速览

- 包：`@morehao/dsh-skills-console`（显示名「技能控制台」），DeepSeek Harness（dsh）的**技能控制台插件**；**仓库根即包根**，无 workspace、无子包目录。
- 两个 half：Host（[lib/index.js](lib/index.js) → [lib/routes.js](lib/routes.js) + [lib/core/](lib/core/)）与 Web Client（源码 `client/`，构建产物 [client.js](client.js)，`window.__ModuleLoader__` bundle；默认 `settings.section` 一页两 tab，可在页内切到 `sidebar.panellist` + `main` 独立面板）。
- 纯 ESM、**runtime 依赖只有 `tar@7.5.22`（精确锁版本）**，供 native installer 解压；Host 无构建，Web Client 由 esbuild 打包（构建期 devDependency，生成物提交）；Node ≥ 22.20（`engines` 另接受 ≥ 24）。
- 技能真身的安装/更新/删除由 native installer 写入：下载/解压/canonical（`~/.agents/skills`）/v3 lock 均由 `lib/core/installer.js` 负责。本插件其余部分做三件事：**停用桩**（可见性）、**导出链**（给别的 Agent）、**记账 + 事务编排**。
- 发布：注记 tag `vX.Y.Z` → GitHub Actions OIDC → npm；发布成功后 CI 用注记正文建 GitHub Release。

| 路径 | 作用 |
|---|---|
| [lib/index.js](lib/index.js) | `export const name = "dsh-skills-console"`、`inject`、`apply()` 装配 |
| [lib/routes.js](lib/routes.js) | prefix 路由 `/api/morehao/skills-console/*`，自定义头鉴权，统一 JSON 错误码 |
| [lib/core/service.js](lib/core/service.js) | 业务编排：清单 / 安装 / 更新 / 回滚 / 删除 / 启停 / 接管 / 订阅 |
| [lib/core/paths.js](lib/core/paths.js) | 路径与 env 覆盖（`HOME` / `XDG_CONFIG_HOME` / `DSH_HOME` / `DSH_SKILLS_CONSOLE_HOME`） |
| [lib/core/installer.js](lib/core/installer.js) | native installer：staging → 原子 promote → v3 lock 事务；安装/更新/删除的 canonical/lock 写入者 |
| [lib/core/discovery.js](lib/core/discovery.js) | 解压目录里的 `SKILL.md` 发现、subpath/重名/命名校验 |
| [lib/core/skill-md.js](lib/core/skill-md.js) | `SKILL.md` frontmatter `name`/`description` 解析（Installer 与 Service 共用） |
| [lib/core/skill-files.js](lib/core/skill-files.js) | 查看器只读读取层：根反查（目录包 / 平铺）、相对路径校验、单文件读取、文件树；`SkillFileError` |
| [lib/core/hash.js](lib/core/hash.js) | 复刻 CLI 的内容哈希（与 lock 的 `skillFolderHash` 对拍） |
| [lib/core/remote.js](lib/core/remote.js) | codeload tarball 下载（限额 / 超时 / 重定向 / token 安全）；native installer 模块 |
| [lib/core/archive.js](lib/core/archive.js) | 安全 tar 解压（拒绝穿越 / 绝对路径 / symlink / hardlink / 超限）；native installer 模块 |
| [lib/core/git-tree.js](lib/core/git-tree.js) | 本地 Git tree SHA（40 位），与 CLI lock 的 `skillFolderHash` 对拍 |
| [lib/core/lock.js](lib/core/lock.js) | v3 lock 原子读改写（保留未知字段 / 版本守卫 / `expectedDigest`） |
| [lib/core/state.js](lib/core/state.js) | `state.json`（v2）原子写 + 校验 + v1 纯函数升级 + 只读降级 |
| [lib/core/roots.js](lib/core/roots.js) | 扫描根表（rank 100/200/300/400/500/600）与单根扫描口径 |
| [lib/core/visibility.js](lib/core/visibility.js) | 按 rank 合并各扫描根 + 宿主 `snapshot()`，得出每个技能到底可不可见 |
| [lib/core/shadow.js](lib/core/shadow.js) | 停用桩：`SKILL.md` 三字段 + `.dsh-skills-console.json` 标记，建/删/判态/清残骸 |
| [lib/core/exporter.js](lib/core/exporter.js) | 导出链：给不读共享根的 Agent 建链、摘链、悬空判定、agent 目录探测 |
| [lib/core/migrations.js](lib/core/migrations.js) | v1→v2：删历史可见性链、剪悬空导出记录、补齐停用桩、写 manifest（fail-open） |
| [lib/core/agents.js](lib/core/agents.js) | 目标注册表（`dsh-global` / `agent:*` / `project:*` / `custom:*`） |
| [lib/core/links.js](lib/core/links.js) | 软链四态判定、建/删、幂等（导出与迁移共用） |
| [lib/core/inventory.js](lib/core/inventory.js) | canonical 扫描 + lock 读取 + `enabled`/`exports`/`visible` 对账，产出账本行 |
| [lib/core/updates.js](lib/core/updates.js) | GitHub Trees 快照、REST 失败分流（限流/404/网络）、L0–L3 判定、计划 token |
| [lib/core/trash.js](lib/core/trash.js) | 删除前快照（回收站）与备份 |
| [lib/core/log.js](lib/core/log.js) | JSONL 事件日志，1MB 滚动，写失败不阻塞主流程 |
| [client/](client/) | Web Client 源码（ESM）：`host` / `copy` / `styles` / `api` / `icons` / `hooks` / `actions` / `markdown` / `scroll` / `views/*` / `section` / `surface` / `app` |
| [scripts/build-client.mjs](scripts/build-client.mjs) | esbuild 打包：`client/` → 根 `client.js`，`--check` 校验生成物漂移 |
| [scripts/](scripts/) | 语法自检、循环依赖检测、命名/打包校验、agent 表导出、发布与 Release 正文投影 |
| [test/](test/) | `node --test` 用例（离线、临时 HOME、fake installer / Atom-codeload stub） |
| [docs/](docs/) | 人类向文档（开发、发布）与 `docs/agents/` 任务手册 |
| `.dsh/` | 本地过程文档，已 gitignore；**不是权威来源** |

## 2. 硬约束

### 数据边界（最基本的一条）

- **canonical 与 v3 lock 的写入口**：`~/.agents/skills`、`~/.agents/.skill-lock.json`（设了 `XDG_STATE_HOME` 时是 `$XDG_STATE_HOME/skills/.skill-lock.json`）的安装/更新/删除一律走 [lib/core/installer.js](lib/core/installer.js)（下载→安全解压→发现→tree SHA→原子 promote→lock 事务）。其他模块只读，禁止再手写 canonical/lock。
- **软链四态**：`managed` / `managed-external` / `foreign-link` / `real`。只动自己建的 `managed` 与已记账的 `managed-external`；`real` 与 `foreign-link` 永不改写、删除前体检即中止。停用桩必须是**真实目录**（链没有意义），建之前先 `inspectShadow` 判态：`foreign`/`link` 一律报 `error.skills.shadow-conflict`，不覆盖。
- **不接收任意路径**：`target` 一律走注册表反查；软链目标恒为 canonical 下同名目录；请求体路径参数不得直接拼到文件系统。
- **state 只读降级**：坏 JSON / 未知版本 → `readOnly=true` 且写接口 409，**不 fail-open、不猜结构、不自动修复**。
- **启停不改正文**：`enabled` 只写/删 `~/.dsh/skills/<name>` 这个**停用桩**（`disable-model-invocation: true` + `user-invocable: false` + `.dsh-skills-console.json` 标记），绝不编辑 canonical 的 `SKILL.md`（安装/更新会整份覆盖，改文件还会让更新被锁死）。
- **可见性只由扫描根决定**：canonical `~/.agents/skills` 本身就是 DSH 的扫描根，**禁止**再往 `~/.dsh/skills` 建指向真身的「可见性链」——那会造出两份真相，摘链也不等于不可见。`~/.dsh/skills` 只放停用桩。用户级桩（rank 400）压不住项目副本（100/200），这是排序规则的正确结果，用 `visibility.shadowScopeMismatch` 告知用户，不要「顺便」去删项目里的东西。
- **导出与可见性解耦**：`exports` 只给不读共享根的其他 Agent 建链，默认空；没有任何导出的技能照样应该对 DSH 可见。
- **不碰别人的东西**：本机可能并存其他同类技能插件。与本插件无关的插件一律不共用路由前缀与状态目录；也不要为了「统一命名」去凑别人的前缀。

### 测试与环境

- 测试必须**离线**：临时 `HOME` / `DSH_HOME`；安装/更新/删除用 fake installer 或本地 tar fixture，探测/更新的限流兜底用 Atom/codeload stub；禁止读写真实 `~/.dsh`、`~/.agents` 或真实技能目录。
- 新逻辑先想「怎么在不联网、不碰真目录的前提下断言」，再落代码；网络相关分支（Trees API、Atom、codeload、超时）用 stub 覆盖。
- 破坏性操作（删除技能、`updates/apply`、push、tag、publish、改真实 HOME、覆盖或删除软链）先征得用户确认。
- 改 `lib/` 后需重启 dsh web；只有 `link:` 接入时源码即时生效，npm 版是拷贝。
- **link 用完即退**：本地用 `link:` 验证未发布改动必须按 [§6](#6-本地-link-验证标准流程) 走完整流程（确认 + 备份 → link → 重启验证 → **回退 npm 版并删除 link**）；`link:` 不得留在 profile，`.dsh/link-preview/` 备份在回退确认后删除。细节见 [docs/development.md](docs/development.md) §5。

### Client 源码与生成物

- Web Client 的**唯一源码目录是 `client/`**；仓根 [client.js](client.js) 是 `npm run build:client` 的产物（esbuild + `__ModuleLoader__.load` 外壳），**禁止手改**。改 UI 一律改 `client/`，然后重建。
- 每次改 `client/**`：先 `npm run build:client`，再把 `client/` 与根 `client.js` 一起提交。`npm run check` 里的 `check:client` 会在内存中重建并逐字节比对，不一致直接红。
- 生成物必须提交（`link:` 安装与 npm 包都直接读根 `client.js`）；不要加进 `.gitignore`，也不要把 `client/` 加进 `package.json.files`。
- 客户端只允许 `require('react')` / `require('react-dom')`（后者可选）；其它宿主模块或 npm 包一律不许。源码内的相对 `import` 由构建内联；运行时不解析相对 `require`。
- 构建期依赖只有 esbuild（devDependency）；runtime **只允许** `tar@7.5.22`（native installer）一个依赖，精确版本，不要新增其他 `dependencies`。
- `client.js.map` 只用于本地调试（`npm run build:client -- --sourcemap`）：不提交、不入包。
- 文案：`client/copy.js` 的 `zh` / `en` 键集合与 `{n}` / `{path}` 占位符必须一一对应；新增文案必须两份一起加。
- 模块边界：`host` / `copy` / `styles` / `api` / `icons` / `hooks` / `actions` / `markdown` / `scroll` / `views/*` / `section` / `surface` / `app` / `index`；禁止循环依赖（`client/` 与 `lib/` 由 `npm run check:cycles` 兜底）；`hooks` / `actions` 只依赖 `api`，`views` 不直接发请求（查看器的取数走 `hooks.useSkillReader`）。`scroll` 是只碰 DOM 的基础设施，不依赖 React / `api` / `views`，列表区与查看器共用同一套滚动容器口径。
- 查看器（抽屉 / 整页）是只读视图：正文与文件都来自 Host 的两个 `GET` 接口，接口契约见 [docs/skill-viewer.md](docs/skill-viewer.md)；新增读逻辑时不要绕开 `lib/core/skill-files.js` 的路径校验。

### 包与发布

- 三处命名一致：`package.json.name` = `cordis.patch.yml` 的 `insert[0].name`；`lib/index.js` 的 `export const name` = `insert[0].id`；且 `publishConfig.access = "public"`。
- 打包只含白名单：`client.js`、`lib/`、`locale/`、`package.json`、`README.md`、`LICENSE`、`cordis.patch.yml`、`icon.svg`。`.dsh/`、`docs/`、`scripts/`、`test/`、`client/`、`node_modules`、`*.tgz` 一律不入包——`client/` 是源码目录，npm 只发根 `client.js`。
- `main` 不直推；**升版本也走分支 + PR**。tag 打在合并后的 `main`，去掉 `v` 必须等于 `package.json.version`。
- GitHub Release 由 CI 在 npm 发布成功后创建，正文取自**注记** tag；`gh release create` 必须留在 [.github/workflows/release.yml](.github/workflows/release.yml)（git-kit 的 `/git-release` 预检靠它判定后效），不要挪进 `scripts/`。
- `release.yml` 的 `name:` 必须等于文件名 `release.yml`（与 npm Trusted Publisher 的 Workflow 字段精确匹配）；发布 job 需 `id-token: write`，且**不要**设 `NODE_AUTH_TOKEN`（会覆盖 OIDC）。
- workflow 用 `actions/checkout@v7` + `actions/setup-node@v7`：**不设 `registry-url`**（v7 移除了 dummy `NODE_AUTH_TOKEN` 兜底，registry 由 `ci-publish.sh` 显式 `--registry` 指定），并显式 `package-manager-cache: false`；`runs-on` 钉 `ubuntu-24.04`（不用 `ubuntu-latest`，避免 26.04 升级把镜像差异混进校验与发布结果）。完整发布流程见 [docs/publishing.md](docs/publishing.md)。

### 文档

- `.dsh/` 里的 specs/plans/notes/原型是本地过程文档：可以读、可以写，但**不要把结论只留在那里**——确定的契约与约定要落回 `README.md` / `docs/`。
- 子文档与代码/脚本冲突时以代码与脚本为准，并顺手修正文档。

## 3. 常用命令

| 目的 | 命令 |
|---|---|
| 首次安装依赖（构建期 + tar） | `npm install` |
| 从 `client/` 生成根 `client.js` | `npm run build:client` |
| 监听源码并自动重建（配合 `link:` HMR） | `npm run dev:client` |
| 校验生成物与源码一致（`npm run check` 已含） | `npm run check:client` |
| 全量机械校验（需先 `npm install`） | `npm run check` |
| import 图循环检测（`client/` + `lib/`） | `npm run check:cycles` |
| 单元测试（273 例，离线；真实网络对拍默认 skip） | `npm test` |
| 单文件语法自检 | `node --check lib/core/service.js` |
| 三处命名 / `exports` / `files` 接线 | `node scripts/check-naming.mjs` |
| 打包白名单 | `node scripts/check-pack.mjs` |
| Release body 投影冒烟 | `node scripts/smoke-release-notes.mjs` |
| 重新导出 agent 目录表（仅开发脚本；`src/agents.ts` 或发布包的 `dist/cli.mjs` 都收，表头记 upstream 版本） | `npm run sync:agents -- <path/to/skills/{src/agents.ts,dist/cli.mjs}>` |
| 发布脚本语法 | `bash -n scripts/ci-publish.sh` |

## 4. 任务路由

| 你要改 | 先读 | 必跑 |
|---|---|---|
| `lib/core/*`（清单/链接/安装/更新/删除/订阅） | 对应模块头部注释 + 相关 `test/*.test.mjs` | `npm run check` + `npm test` |
| `lib/routes.js`（接口形状、错误码、鉴权） | [lib/routes.js](lib/routes.js) 的 `matchRoute` + `client.js` 调用点 | `npm run check` + `npm test` |
| `client/**`（Web Client UI） | `client/index.js` + `test/client.test.mjs` | `npm run build:client` + `npm run check` + `npm test` |
| 根 `client.js`（生成物） | 不要改；改 `client/**` 后重建 | `npm run check:client` |
| `package.json` / `exports` / `files` / 命名 / CI / 发布 | [验证与发布](docs/agents/verification-release.md) | `npm run check`（含命名与打包） |
| 本地 link 验证 / 预览未发布改动 | 本文 §6 + [docs/development.md](docs/development.md) §5 | 验证后必须回退并删除 link（§6 第 5 步） |
| 纯文档 | 对应人类文档；链接与事实核对 | 不跑代码检查 |

## 5. 完成定义

- [ ] `npm run check` 通过。
- [ ] `npm test` 通过（改了 `lib/` 或 `client/` 必须跑）。
- [ ] 改了 `client/**`：`npm run build:client` 后 `npm run check`（含 `check:client`）通过，生成物已随提交。
- [ ] `git diff` 中 `client.js` 的变化能与 `client/**` 的改动对应（没有手改生成物）。
- [ ] 改 `package.json` / `exports` / `files` / 命名 / CI 时，`check-naming` 与 `check-pack` 通过。
- [ ] 行为或契约变更同步 `README.md` / `docs/`（按影响面，不机械全改）。
- [ ] `git status` / `git diff --stat` 无 `.dsh/`、`node_modules`、`*.tgz` 等意外文件。
- [ ] 需要用户确认的操作（删除、apply、push、tag、publish）已确认；提交不在 `main` 上。

## 6. 本地 link 验证（标准流程）

要让宿主跑工作树而不是 npm 包（验证未发布的 `client/**` / `lib/**` 改动）时，按下面五步走完。**验证结束（通过或放弃）都必须回退并删除 link，`link:` 不允许留在 profile 里。**

1. **准备**：先 `npm run build:client`（只改 `lib/` 也建议跑 `npm run check`）。把 profile 的 `package.json`、`pnpm-lock.yaml` 与已装的 `@morehao/dsh-skills-console` 备份到 `.dsh/link-preview/`。
2. **装 link**：`dsh plugin --profile <profile> add "link:$PWD"`。沙箱里会报 `EPERM ... package.json.lock`，在终端用更高权限重跑；不要手写 profile 的 `package.json`。
3. **校验**：`realpath ~/.dsh/profiles/<profile>/node_modules/@morehao/dsh-skills-console` 指向本仓；profile `package.json` 的值为 `link:<本仓绝对路径>`；根 `client.js` 与工作树一致。
4. **生效 + 验证**：**完全退出宿主再重开**（⌘Q；profile bundle 只在启动时装载）。验证期间不切分支、不移动/删除 checkout（`link:` 绑当前工作树）。给用户的验证清单要写清「点哪里、应看到什么」。
5. **收尾（必做）**：验证通过后立即回退并删除 link：
   - `dsh plugin --profile <profile> add @morehao/dsh-skills-console@<改动前版本>`；
   - 校验：`test -L` 为假、profile `package.json` 与备份一致、装回 `client.js` 不含本次未发布改动、`tar` 等运行时依赖仍可解析；
   - 确认回退无误后删除 `.dsh/link-preview/` 备份目录；
   - 再完全重启宿主，确认界面回到 npm 版；
   - 回退后如果工作树的 `node_modules` 被清掉（pnpm 替换 `link:` 时可能发生），`npm install` 恢复后跑 `npm run check` 确认；
   - 把实机验证结论写回 PR/issue，临时分支按 git 流程清理。

   失败或中断：按 [docs/development.md](docs/development.md) §5.3 方式二用备份还原，重启确认，不要留半 link 状态。

## 7. 文档地图

| 层 | 位置 | 用途 |
|---|---|---|
| Agent 常驻约束 | `AGENTS.md` | 每次会话 |
| Agent 任务手册 | [docs/agents/](docs/agents/) | 命中任务时按需读 |
| 人类文档 | [docs/](docs/) · [README.md](README.md) | 开发与测试、发布流程、能力说明 |
| 本地过程 | `.dsh/docs/` | specs / plans / notes / 原型，gitignored |

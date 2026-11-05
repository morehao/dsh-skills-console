# Changelog

## [v0.8.14] - 2026-11-05

### Features

- **settings**: 设置导航图标改用 dsh 0.2.2 的 `settings.section.icon` slot（与 `settings.section` 同 `id`、同生命周期装卸），删除此前按 DOM 认领导航行、替换齿轮的 `installSettingsNavIcon` 补丁；旧宿主没有该 slot 时回落默认齿轮。

### Fixes

- **i18n**: 适配 dsh 0.2.2 新增的 ja / es / fr / de / ru / pt；未知语言回落英文（`t.lang` 用 `zh* ? zh : en`），不再显示中文；缺失 locale 时仍默认中文。
- **update**: 补 `INCOMPATIBLE_VERSION` / `UNSUPPORTED_PLATFORM` / `ROLLBACK_FAILED` 的错误文案映射。

### Chores

- `@deepseek-ai/schemastery` peer 放宽为 `~3.18.5 || ~3.19.0`，兼容 dsh 0.2.2 自带的 3.19.0。
- 升级 `@morehao/dsh-plugin-kit` 到 0.5.1；`locale/*.json` 增加 `meta.detail`。

## [v0.8.13] - 2026-11-05

### Fixes

- **updates**: treat source as upstream, drop no-upstream status (#135)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.8.12...v0.8.13

## [v0.8.11] - 2026-11-04

### Fixes

- **plugin-update**: 修复「更新完不重启仍持续提示有新版本」。版本判定改为以**磁盘已安装版本**为唯一真相
  （由 `@morehao/dsh-plugin-kit@^0.5.0` 提供）：一键更新写入磁盘后即视为「已最新」，不再基于进程启动快照
  谎报有新版、也不再允许重复卸载重装同一版本。「已装待重启」由 `restartRequired` 如实表达，并落
  `$DSH_HOME/skills-console/update-state.json` 跨重启保留提示。

### Dependencies

- 升级 `@morehao/dsh-plugin-kit` 到 `^0.5.0`（`UpdateView.currentVersion` 语义改为磁盘版本、新增
  `restartRequired` / `createUpdateStateStore`）。

## [v0.8.9] - 2026-11-04

### Features

- **intro**: 技能列表区分「已生成 / 未生成」简介状态 (#128)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.8.8...v0.8.9

## [v0.8.8] - 2026-11-04

### Fixes

- **intro**: 批量简介已缓存条数改由后端权威判定 (#124)

### Refactors

- **subscriptions**: 订阅操作列改为统一图标操作条 (#123)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.8.7...v0.8.8

## [v0.8.7] - 2026-11-04

### Tests

- 新增 `apply()` 裸 ctx 守卫测试（`test/apply-guard.test.mjs`）：用 `@morehao/dsh-plugin-kit/test` 的 `createUndeclaredContext()` / `createAbsentContext()` 断言具名导出 `apply` 在服务未就绪时降级不抛，复现「读未声明服务 → 红点无面板」事故；含自检防假绿。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.8.6...v0.8.7

## [v0.8.5] - 2026-11-04

### Features

- **client**: 操作提示改为顶部居中状态条 (#115)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.8.4...v0.8.5

## [v0.8.6] - 2026-11-04

### 新增

- **批量生成简介**：已安装列表工具栏「批量生成简介」、订阅卡片头「为本仓库生成简介（N）」；只需选择生成范围（仅缺失 / 全部重算），并发、遇错处理等由插件定默认值。任务在后端逐条执行，可取消、可暂停继续；关闭页面仍在后台跑，重开后提示「继续」（不自动续跑）。
- **GitHub 跳转**：已安装 / 订阅列表里的仓库名可点开 GitHub 仓库，`#commit` 可点开对应提交页。

### 变更

- **简介缓存改为身份寻址**（`owner/repo/技能名`）：订阅页生成的简介，装到本地后直接复用、不再重复调用模型；同名不同源互不串。旧缓存（v4 及更早）升级后按冷启动重建。

## [Unreleased]

## [v0.8.2] - 2026-11-03

### 新增

- **「关于」弹窗**：点页头身份胶囊（安装标识 `@scope/name@version`）打开居中弹窗——顶部紧凑身份头（小 logo / 名称 / 版本胶囊），下方信息表展示包名（整行点击复制，行尾短暂显示「已复制」/「复制失败」）、GitHub 仓库外链与许可（MIT）。纯信息页，不承载检查更新（参照 `dsh-github-trending`）。

### 变更

- **自更新恢复提示改为居中弹层**：更新后「请 ⌘Q 重开生效」的提示不再缩在右下角、也不再自动消失，改为居中弹层——显示 `from → to` 版本跨栏，只有「关闭」按钮（点遮罩不关，Esc 可关），点「关闭」才收起并清掉 `localStorage` 记号。

### 修复

- **开启侧栏入口后设置里仍残留一条**：`settings.section` 与 `sidebar.panellist` 现在严格互斥——开启「侧栏入口」后只在侧栏出现，设置页不再保留同名分区。
- **关闭侧栏入口报错**：修复从侧栏切回设置时报 `list slot "settings.section" already has an entry with id "dsh-skills-console" ...`（host 拒绝同一 slot 重复 id）。根因是旧版的「保命入口」兜底与偏好入口同时注册了 `settings.section`。改为 boot 时无条件常驻注册一次 `settings.section`，`mount('settings')` 复用它、绝不重复注册；切换侧栏只拆装 `main` / `sidebar.panellist`。

## [v0.8.1] - 2026-11-02

### 修复

- **恢复提示自动消失**：自更新后右下角的「已更新、请 ⌘Q 重开生效」提示不再常驻，出现约 6 秒后自动收起（同时清除 `localStorage` 记号）；用户仍可提前点「知道了」或「重新检查更新」。
- **页头更新胶囊高度对齐**：内联更新胶囊高度 30px→26px、内部文字/按钮 24px→20px，与标题行内的工具按钮 / 身份胶囊对齐，修正此前比同行元素偏高的问题。

## [v0.8.0] - 2026-11-02

### 新增

- **页头内联更新胶囊**：插件自更新的入口从「刷新图标 + 弹窗」改为页头一枚内联**状态胶囊**，直接在页头显示「已是最新 / 有新版本 / 更新中 / 已更新待重启 / 检查失败」，并就地提供「检查 / 更新 / 重试」，更新走**两段确认**（先点「更新」再「确认」，防误触）。点胶囊文字区仍可打开详情弹窗。
- **更新弹窗改为纯详情页**：只展示当前/最新版本与该版本 GitHub Release 正文（更新内容），不再承载更新操作——更新操作统一收在页头胶囊，避免「信息页兼操作页」。（与 dsh-github-trending v0.8.7 的方向一致）

### 改进

- **客户端状态机收敛到共享包**：`usePluginUpdate` 改为复用 `@morehao/dsh-plugin-kit/update/client` 的 `createUpdateController`（模块级单例，页头与弹窗共享同一份状态），check/apply 错误经统一 `state.error` 收敛。
- **跨进程更新记号收敛到共享包**：pending 记号（`write/read/clearPendingUpdate`）改为委托 `@morehao/dsh-plugin-kit/update/restore` 的 `createPendingStore`，对外接口不变，旧 `localStorage` 键平滑迁移。依赖 `@morehao/dsh-plugin-kit` 升至 `^0.4.0`。

### 移除

- **手动更新命令**：不再在弹窗展示/复制 `dsh plugin add …` 手动命令；本地安装等不可一键更新的场景仅给一句提示（请自行重装到最新版本）。相关文案 `pluginUpdate.manual/copy/copied` 随之下线。

## [v0.7.7] - 2026-11-01

### 新增

- **自更新恢复提示**：一键更新会先卸载运行中的自己，面板随之消失（宿主跨版本自更新返回 `restart-required`，不会热挂回）。此前「请 ⌘Q 重开」这句提示恰好渲染在已消失的面板里，用户容易错过、误以为插件坏了。现在点击更新**动手前**会把「刚点过更新」记到浏览器 `localStorage`；重开（新进程重新装载客户端）后，面板若已回来，会在右下角弹出一条常驻的**恢复提示**，讲清「面板消失是正常的、⌘Q 重开才生效」，点「知道了」收起。`>24h` 的记号自动忽略；`localStorage` 不可用（隐私模式 / 无 window）时整体降级为空操作，不影响挂载。
- **入口自愈**：客户端每次加载都保证「至少一个入口」——`settings.section` 与 `sidebar.panellist` 缺谁补谁（幂等）。即使某次侧栏主面板因故没挂上，也仍能通过设置页分区进入，不会彻底找不到入口。同时对 `localStorage` 里上次选中的主面板 key 做卫生处理：若当前选不中（未注册），回退到会话页（`selectPanel(null)`），避免「选中一个不存在的面板 → 黑屏且无法导航」。

### 修复

- **plugin-update**：`apply` 回执新增 `appliedVersion`（本进程内已装成的目标版本，过渡态用）。同一进程内重装成功后，`GET /plugin-update` 不再对已装到的最新版谎报「有新版本」（页头小红点 / 更新按钮不再误导）；`restartRequired` 仍如实为 `true`（真话：已装但需重启），跨进程（重启后）自然归零。安装失败不会置位 `appliedVersion`，不掩盖真实失败。

### 注意

- 不改宿主行为：跨版本自更新仍需 ⌘Q 重启生效，本轮只把「用户不会被坑 + 重开后入口一定在」补齐。既有契约字段（`canAutoUpdate` / `manualCommand` / `restartRequired` / `updatedVersion` / `checkFailed`）与错误码均不变。

## [v0.7.6] - 2026-11-01

### Refactor

- **kit（行为等价迁移到 @morehao/dsh-plugin-kit@^0.3.1）**：把本仓重复实现收敛到共享包，对外接口与业务语义一律不变：
  - **fs 原子写**：删除 `lib/core/fs-atomic.ts`，改用 kit `./fs` 的 `writeFileAtomicSync`；`state` / `invocation` / `intro-store` / `lock` 四处引用改指向 kit（`lock` 保留显式 `mode:0o644`）。
  - **插件身份**：`plugin-update.ts` 的 `PLUGIN_META` 改用 kit `./meta` 的 `createPluginMeta`（`pkgUrl` 为 `../../package.json`），字段 `name` / `version` / `repository` / `repo` 不变。
  - **发布说明**：`releaseNotes()` 改用 kit `./github` 的 `createReleaseReader`，语义逐字对齐（`v<version>` tag、`accept: vnd.github+json`、失败短缓存 10 分钟、非法版本不发请求、失败返回 `null` 不抛）。
  - **路由外壳**：`lib/routes.ts` 的 `sendJson` / `readBody` / 头校验改用 kit `./http` 的 `createRouteHandler`；`matchRoute` + `dispatch` 业务保留，错误码翻译仍留在插件侧（`onError`：`StateReadOnlyError`→409、`ServiceError`→`status||400`、body 超限/非法 JSON→`error.skills.*`→400、其余→500）。
  - **不引入 `./exec`**：保持 `lib/` 的 native-only guard（禁 `node:child_process` / `spawn(`）通过。

### 依赖

- `dependencies`：`@morehao/dsh-plugin-kit` 从 `>=0.2.1 <0.3.0` 升到 `^0.3.1`；`tar@7.5.22` 不变。

### 注意

- **对外零变化**：HTTP 路由响应形状、`error.skills.*` 错误码、`PLUGIN_META` 字段、`releaseNotes` 返回值、前端字段均保持原样。
- 内部无行为差异：`releaseNotes` 与 kit 实现逻辑一致；路由鉴权/响应/错误映射语义不变。

## [v0.7.5] - 2026-11-01

### Refactor

- **deps**：`@morehao/dsh-plugin-kit` `>=0.1.0 <0.2.0` → `>=0.2.1 <0.3.0`。0.2.x 复用宿主原生 registryPlan 与主流 semver 包，对外行为不变，`lib/core/plugin-update.ts` 薄适配层与对外视图形状无需改动。

## [v0.7.4] - 2026-10-31

### Refactor

- **plugin-update（引擎收敛到共享包）**：插件自更新的引擎（semver 解析比较、registry 计划、8 秒超时、5 分钟缓存、依次问各 registry、`installBundle` + `already-installed` 先 remove 再 install 的重装流程、`APPLY_IN_PROGRESS` 单飞）收敛到 `@morehao/dsh-plugin-kit`（`>=0.1.0 <0.2.0`，零 `@deepseek-ai` 运行时依赖、宿主能力全部注入）。`lib/core/plugin-update.ts` 退化为薄适配层，只保留本仓特有部分：`PLUGIN_META`、对外视图形状 `canAutoUpdate`、`ServiceError` 错误码映射，以及 GitHub Release 正文（`releaseNotes`，kit 不覆盖）。`isNewerVersion` / `parseSemver` / `registryPlan` / `OFFICIAL_REGISTRY` 从 kit re-export，调用方与签名不变。与 `dsh-commands@0.4.3` 同款改造。
- **deps**：`dependencies` 新增 `@morehao/dsh-plugin-kit`（`>=0.1.0 <0.2.0`）；`tar@7.5.22` 不变。

### 注意

- 对外行为不变：HTTP 路由回执（`GET /plugin-update`、`POST /plugin-update/apply`、`GET /plugin-update/release`）、错误码（`error.plugin-update.check-failed` / `.manual` / `.busy` / `.install-failed`）、前端字段（`canAutoUpdate` / `manualCommand` / `restartRequired` / `updatedVersion` / `checkFailed`）均保持。`removeBundle` 报 `stop-profile` 时仍提示「完全退出 DSH 后手动更新」。
- 一处实现细节变化：kit 把 registry 计划用在「查最新版」，`installBundle` 只传 `pkg@version`（registry 由宿主 pnpm 决定），不再把 registry 作为安装选项透传。

## [v0.7.3] - 2026-10-30

### 新增

- **plugin-update（可诊断性）**：自更新全程写入事件日志——`plugin.update.check`、`plugin.update.apply.start`（在卸载自己之前写）、`plugin.update.apply`（带 `application` / `restartReason` / `registry`）、`plugin.update.apply.failed`（带 `code` / `message`；`to: null` 表示卡在查版本或宿主没有 `pluginManager`），并发点击记 `plugin.update.apply.busy`。此前自更新不留任何日志，面板一消失就只能靠宿主 `.plugin-manager` 的 pnpm 日志反推。

### 修复

- **plugin-update（提示）**：更新弹窗在动手之前就用警告条说明「一键更新会先卸载当前版本，面板会立刻消失；装完后要完全退出 DSH（⌘Q）再打开，刷新页面没用」，避免用户以为插件坏了；成功提示与重启提示也从含糊的「重启 DSH」改成准确的「完全退出（⌘Q）再打开」。

### 注意

- 触发背景：在当前 DSH 桌面版上，插件自更新（宿主先 `removeBundle` 再 `installBundle`）之后不会把新版本热重挂，面板会一直缺席到完全退出重开——而「请重启」这句话正好渲染在那个已经消失的面板里。0.7.3 不能改变宿主行为，只保证这次更新**说清楚**、**事后查得到**。

## [v0.7.2] - 2026-10-30

### 新增

- **diagnostics**：`/diagnostics` 增加 `dshRegistry` 盲区报告——列出 DSH registry 各 live agent 额外看到、但不在扫描根可见集合里的技能（bundled / 插件 runtime / `customSkillDirs` / 远端 provider）。只读诊断，**不参与** `visible` 计算，也不改变任何可见性判定。（#92）

### 修复

- **check-pack**：npm 10 的 `npm pack` 会无视 `--ignore-scripts` 执行 `prepare`，把构建日志写进 `--json` 清单前的 stdout，导致 `npm run check` 在 CI（node 22 + npm 10.9.9）上 `JSON.parse` 报错、PR 全红。校验脚本现在只截取清单 JSON，npm 10 / 11 行为一致。（#94）

## [v0.7.1] - 2026-10-29

### 修复

- **可选 peer**：`@deepseek-ai/dsh-home-paths` / `@deepseek-ai/dsh-skill` / `@deepseek-ai/dsh-skill-filesystem` 标记为 `peerDependenciesMeta.optional`。它们由 DSH 宿主在运行时提供；此前作为必装 peer，npm 7+ 会在安装本包时自动解析并安装 `dsh-skill`，而 `dsh-skill@0.2.0-rc.2` 精确 peer 依赖 `@deepseek-ai/dsh-llm@0.2.0-rc.2`，与宿主要求的 `>=0.2.1-rc.3` 冲突，导致消费方（如 `@morehao/dsh-commands`）`npm install` / `npm ci` 报 ERESOLVE、必须加 `legacy-peer-deps`。改为可选 peer 后无需该绕过即可安装。

## [v0.7.0] - 2026-10-29

### Refactor

- **build**: 全仓迁移到 TypeScript——Host（`lib/**`，37 个 `.ts`，含 6 份纯类型 `lib/contract/*.d.ts`）由 `tsc` 编译到 `dist/`；Web Client（`client/**`，27 个 `.ts`）由 esbuild 打包为根 `client.js`。仓库内已无 `.js` 源码。
- **packaging**: `main` / `exports` 从 `lib/index.js` 切到 `dist/index.js`；打包白名单改发 `dist/` 与根 `client.js`，不再发 `lib/`、`client/` 源码目录。
- **build**: `dist/` 与根 `client.js` 两个产物都不入库（`.gitignore`），改由 `npm run build` 生成（`prepare` / `prepack` 自动触发）；`release.yml` 发布 job 增加 `npm ci`，保证构建期依赖到位。
- **deps**: 新增构建期 devDependency `typescript`（另有 `esbuild`、`@types/node`、`@types/react`）；`dependencies` 仍只有 `tar`。

### 注意

- 运行时行为、HTTP 契约（路由前缀、鉴权、错误码）、`state.json` 文件格式（v4）与 `dependencies`（仅 `tar`）均未改变；本轮为纯类型化迁移。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.6.0...v0.7.0

## [v0.6.0] - 2026-10-29

### Refactor

- **dsh**: 全面复用 DSH 宿主能力、删除重复实现——路径解析改用 `@deepseek-ai/dsh-home-paths`；`SKILL.md` frontmatter 解析改用宿主同款 `yaml`；技能名规则改用 `@deepseek-ai/dsh-skill` 的 `isSkillName`（与 `dsh-skill-filesystem` 同口径，修掉非 kebab 名被宿主忽略/触发校验错误的隐患）；状态/缓存/lock/`SKILL.md` 的 4 份原子写收敛为一份（fsync 文件 + 目录）。新增 `test/skill-parity.test.mjs` 与宿主 `FileSystemSkillProvider` 对拍。
- **deps**: `dependencies` 仍只有 `tar`；DSH 能力改用 `peerDependencies`（宿主 runtime resolution 提供、不打包），开发/测试用 `devDependencies` 锁版本。
- **config**: 补齐 `export const Config`（schemastery），覆盖 `stateDir` / `cacheDir` / `intro`。
- **ui**: 前端零改动（`client/**`、`client.js`、`locale/**`、`cordis.patch.yml` 字节级不变）。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.9...v0.6.0

## [v0.5.9] - 2026-10-29

### Fixes

- **paths**: 用户数据根解析对齐 DSH 的 `dsh-home-paths`——空白的 `DSH_HOME` / `DSH_AGENTS_HOME` 等覆盖值按未设置处理（不再解析成相对路径），支持 `~` 展开并统一绝对化。技能简介缓存从 `$DSH_HOME/skills-console/intros.json` 迁到 `$DSH_HOME/cache/skills-console/intros.json`，与权威状态分家；旧位置只读回退，下次生成写到新位置；新增 `DSH_SKILLS_CONSOLE_CACHE_HOME` 与 `config.cacheDir`。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.8...v0.5.9

## [v0.5.8] - 2026-10-29

### Fixes

- **updates**: 修复根级 `SKILL.md` 技能（`skillPath` 无子目录，如 huashu-design）的更新永远失败。GitHub Trees API 在 `ref` 为分支/commit 时返回的顶层 `sha` 是 **commit SHA** 而非根 tree SHA，旧逻辑直接拿它当 `rootSha`，导致更新计划的目标 tree 与本地实际 tree 永远不等，安装器在 strict 校验时报 `tree-mismatch` 并回滚。现在 `fetchTree` 由扁平条目本地重建真实根 tree SHA（`treeShaFromEntries`），条目被截断时才补一次 commits 请求兜底；同时自动识别并修复旧版本写坏的快照（`rootSha == commit`），不再让 phantom 更新常驻。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.7...v0.5.8

## [v0.5.7] - 2026-10-29

### Fixes

- **plugin-update**: 修复自身更新链路——弹窗里的版本号占位符 `{version}` 现在会正确替换；HMR 下 `installBundle` 会以 `already-installed` 拒绝覆盖已安装包，改为按官方更新路径先 `removeBundle` 再 `installBundle`，并在 `stop-profile` 等失败时给出手动命令；Release 正文里的 `<details>` 折叠块降级为加粗小标题，不再原样露出标签。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.6...v0.5.7

## [v0.5.6] - 2026-10-29

### Fixes

- **intro**: prevent empty or truncated intros on reasoning models (#78)
- **client**: 添加技能 / 添加订阅弹窗改为「成功才关窗」——提交失败时保留已填来源、探测结果与勾选，弹窗内就地显示错误并可重试；请求进行中锁定弹窗、按钮显示「处理中…」（#79）

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.5...v0.5.6

## [v0.5.5] - 2026-10-28

### Features

- **plugin-update**: 检查并更新插件自身——页头新增刷新按钮，检查 npm 上的最新版本；有新版本时弹窗展示版本对比与 GitHub Release 发布说明正文，支持一键重装（走宿主 `pluginManager.installBundle`，未提供时给可复制的手动命令）；检查按宿主 `pluginManager.registries()` 的 registry 计划（继承镜像/私有源配置），启动后静默热身一次。

### Fixes

- **hash**: 内容哈希的路径排序改为与进程 locale 无关的 code unit 序（此前用 `localeCompare`，同一目录在不同 LANG / ICU 版本下会排出不同顺序、算出两个 digest；目录里同时有 ASCII 与中日文文件名时，换启动环境会被误报成「安装后有改动」）。升级后启动时做一次性重基线：只有旧口径能精确复现记录值时才改写 `installedHash`（日志 `state.hash-order.rebaseline`），内容真动过的不碰。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.4...v0.5.5

## [v0.5.4] - 2026-10-28

### Features

- **updates**: add periodic auto update check via host timer (#74)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.3...v0.5.4

## [v0.5.3] - 2026-10-26

### Features

- **intro**: 简介写清触发方式，入口改居中弹窗 (#71)

### Docs

- **readme**: add English README with Chinese as default (#70)
- **readme**: add screenshots and align header layout (#69)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.2...v0.5.3

## [v0.5.2] - 2026-10-26

### Fixes

- **client**: 订阅状态去对钩，调用策略改用居中弹窗 (#63)
- **client**: 调用策略弹层固定头尾、补回侧边栏入口开关样式 (#62)
- **client**: 订阅条目的「操作」表头与破折号对到按钮中轴 (#61)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.5.1...v0.5.2

## [v0.5.1] - 2026-10-26

### Features

- **技能介绍（AI 生成）**：已安装列表每行技能名旁新增 `✨ 介绍`，点开浮层就能看到模型写的「这个技能能做什么、什么时候用」——2–3 句能力介绍，不是逐字翻译。生成过的直接读本地缓存；首次点「生成介绍」才调模型，语言跟随界面（zh / en）。
  - 只发送 `SKILL.md`（按 `maxInputBytes` 截断）与文件名清单（≤30 个），不读其他文件正文；同一时间全局只允许一个生成。
  - 结果缓存在 `$DSH_HOME/skills-console/intros.json`，按技能名 + 语言分开；`SKILL.md` 内容哈希变化时标「可能过期」，失败不缓存。
  - 新增 `GET/POST /skills/:name/intro`；`config.intro.*` 可关闭、指定模型、调整输入 / 输出上限与超时。错误按 409 / 413 / 429 / 501 / 502 / 504 / 499 区分，关闭浮层时 abort 模型调用。
  - **订阅候选也能看**：展开条目行加 `✨ 介绍`，按快照 `commit` 拉远端 `SKILL.md` 再生成；缓存 key 为 `source@commit:path`，不挡「安装」。新增 `GET/POST /subscriptions/:id/entries/:name/intro`（路径由服务端反查快照，不收客户端路径）。
  - 订阅条目行新增作者 frontmatter 描述（存进快照，不调模型），装不装先看原文。

## [v0.5.0] - 2026-10-26

### Breaking Changes

- **状态格式升到 v4**：`installs[].mode` = `auto` / `manual` / `hidden` 成为调用策略的权威记录；旧版本读到 v4 只读降级。v3→v4 是纯函数迁移：补 `mode:'auto'`，`enabled=false` 补 `legacy:'dsh-off'`，清掉与 `auto` 冲突的 `manual`/`hidden`。
- **「仅手动」会写 canonical `SKILL.md`**：只增删/改 frontmatter 的 `disable-model-invocation`，保留 BOM / CRLF / 注释 / 引号 / 块标量；写前备份，原子替换。作者已写 `true` 时只记只读来源，不改写。这是「启停不碰文件」的唯一例外。
- **「完全停用」采用 A′ park**：`SKILL.md` 改名为 `SKILL.md.disabled` + `.dsh-skills-console.park.json` marker，内容字节不变；停用期间拒绝安装 / 更新 / 回滚，恢复时回到停用前的模式。
- **旧 `/mode` 只服务 legacy**：`dsh-off` 仍由 policy provider 隐藏；manual / hidden 行调用旧接口返回 409，避免两套开关打架。

### Features

- 行内单一策略 chip（自动 / 仅手动 / 完全停用 / 需修复 / 仅 DSH 隐藏 / 未纳入追踪），点开三档弹层；显示客户端覆盖表、风险说明与完全停用二次确认；作者声明行只读。
- 新增 `POST /skills/:name/invocation`（auto / manual / hidden）与 `POST /skills/:name/unpark`（含 `keep=current|parked` 冲突处理）。
- manual 写入失败 / 外部改文件时标 `drift`，不猜、不覆盖；更新、回滚、重装后按状态重放，失败不回滚已成功的更新。
- 归一化内容哈希：比较 `installedHash` 前先按 state 还原插件写入的那一行，避免「仅手动」被误判成本地改动；作者声明原样计入。
- 恢复时默认拒绝两份不同内容，可用 `keep` 明确保留当前或停用前版本，冲突副本留在目录里。
- 已安装列表四列（技能 / 共享 Agent / 调用策略 / 操作），窄屏收为两列；订阅列表四列 + 展开条目子表头；表头 sticky。
- 界面术语统一为「共享」：列名与共享设置弹层改为「共享 Agent」，安装提示用「共享至」；行内共享图标换成「一份方框分发到多个」。
- 设置页手动写入的原文备份到 `backups/invocation/`。

### Fixes

- 订阅列表按「仓库 + 名称」识别已装技能：账本里没有订阅关联、或从同一仓库直接安装的记录不再重复给安装入口，已装条目操作列用破折号占位。
- 停用行不再出现在 `enabledButHidden` 诊断里；`legacy dsh-off` 与三档状态互斥。
- 状态里 manual 标记缺失 / 值被改时按 drift 报告，不把作者或用户的编辑覆盖掉。

### UI / Docs

- README、AGENTS、开发文档同步 state v4、新接口、文件边界与验收口径。

## [v0.4.0] - 2026-10-26

### Breaking Changes

- **启停改为本地策略**：`installs[].enabled` 成为唯一开关；停用只写 `state.json`，由每个 live agent scope 的 policy provider 条件覆盖 canonical 候选，不再往 `~/.dsh/skills` 写停用桩，不改 canonical / v3 lock / 导出链。
- **只对 DSH 生效**：DSH 的模型调用与 `/` 手动调用看不到停用技能；读 `~/.agents/skills` 的其他 Agent（OpenCode / Cursor 等）仍会看到 canonical。全机停用不在本期。
- **状态格式升到 v3**：`shadows[]` 退休，`legacyShadows[]` 只记录迁移删不掉的旧桩与 orphan；旧版本读到 v3 只读降级。v2→v3 会清理旧版本写过的停用桩，删不掉的如实报告；v1 跨级升级时先备份 v1 / v2 两份快照。
- **项目级启停移除**：`scope: 'project:*'` 返回 400；项目副本仍按 rank 优先，停用 canonical 不会隐藏项目副本。
- **导出与可见性解耦**：`exports` 默认空，只给不读共享根的 Agent 建链；没有任何导出的技能照样对 DSH 可见。
- **移除 export 模式**：`DSH_AGENTS_HOME` 指到别处、canonical 不在 DSH 扫描根里时，插件不再往 `~/.dsh/skills` 建可见性链兜底，改为在 `/diagnostics` 报 `canonical-not-scanned`。

### Features

- policy provider 注册到每个 live agent 自己的 scope（preset scope 的子层），只在 canonical 是 native winner 时发 `modelInvocable=false` + `userInvocable=false` 的同名候选；项目 100/200、user-dsh 400 有同名副本时保持沉默，副本继续可见。
- 停用后模型目录与 `skill` 工具都拒绝该技能；启用后恢复原生候选。
- 新增 `findProjectRoot()`（向上找 `.git`），与宿主 `skill-filesystem` 的项目根口径一致。
- 可见性按扫描根合并（rank 100/200/300/400/500，宿主 `snapshot()` 作 rank 600 垫底），技能身份取 frontmatter `name`，与宿主一致。
- 目标注册表新增 `exportable` / `exportBlocked`：读共享根、DSH 自己的扫描根、canonical 自己都不会被当成导出目标。
- 旧停用桩带出处标记 `.dsh-skills-console.json`；v2→v3 迁移只删带标记的桩，`foreign` / `link` 一律保留并报告。
- v1→v2→v3 迁移带 manifest、7 天备份，幂等、fail-open，中断可续跑。

### Refactors

- 启停从「写扫描根文件」收敛为「一次 state 写入 + provider 失效」，删掉建桩/删桩的 IO 分支。
- 导出资格从 `kind === 'dsh'` 之类的身份判断收敛为一个字段，服务端与 Web Client 共用，不再三处各写一份。
- 页面可见性改为中性状态点（实心 = 模型可见，空心 = 模型不可见）；行内不再有 DSH 专属 chip、`+n` 气泡里的 DSH、分组标题与横幅里的 DSH 身份。

### UI / Docs

- 删除导出弹窗底部两段“读共享根，不在此列”说明（zh/en、两个 modal、`section.js` 计算与测试断言）；读共享根的 Agent 仍不进列表，只是不再解释。
- **行内 Agent 列只显示显式导出**：只有「不支持共享根、且真的建了导出链」的 Agent 出现；直读共享根的 Agent 不再逐行展示，没有导出时显示「未导出」（悬停说明共享根 Agent 装好即见），不再用「未导出到任何 Agent」。按 Agent 视图也只给有导出的 Agent 分组，抽屉信息 tab 只列「已导出」。
- `mode.offHint` / `visibility.scopeMismatch` / 空态文案改成用户语言，不再提“扫描根/停用桩/provider”。
- README、AGENTS、开发文档同步新机制；旧 host-wide 文档标记为备选。

### Fixes

- **v1 遗留的 `links[]` 不再常驻 state**：v1→v2 升级拆成 `exports[]` + `migration.legacyLinks` 后立即删除原字段；已经写进 v3 state 的旧字段会在加载时剪掉并原子写回（原文件先备份到 `migrations/state-v3-links-*.json`）。
- **导出清单只认指向 canonical 的链**：`installs[].exports` 不再把共享根 Agent（OpenCode / Cursor 等）目录里的链、`foreign-link` 和 `real` 当成导出。历史遗留的 OpenCode 链——无论指向 canonical 还是别的仓库——都不再显示成「已导出」，也不再进入行内 Agent 列；`saveExports` 也因此不会去动别人的链。
- **删除不再误拦别人的同名链**：体检只检查导出记账里的目标；OpenCode 等 Agent 自己指向其他仓库的同名链不再阻止删除，也不会被谎称「会连带删掉」。
- **manual-only 技能不再显示成「丢了」**：技能自己在 frontmatter 声明 `disable-model-invocation` 时，行内用「仅手动」标志提示（tooltip 说明模型不可见、手动 `/` 仍可用）；诊断不再把它算进 `enabledButHidden`。
- **大仓库更新**：codeload tarball 上限 50MB → 100MB，修复带设计素材的仓库（如 `tt-a1i/archify`，52.7MB）更新报 `tarball-too-large`。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.8...v0.4.0

## [v0.3.8] - 2026-10-25

### Fixes

- **client**: 查看器文件 tab 左树右预览，长描述可展开 (#47)

### Refactors

- **client**: 拆开弹窗外壳与添加技能流程 (#51)
- **client**: 收拢滚动容器探测，抽出正文渲染器 (#49)

### Docs

- **agents**: 把本地 link 验证固化为标准流程（验证后即回退） (#48)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.7...v0.3.8

## [v0.3.7] - 2026-10-25

### Fixes

- **client**: 滚动只留在列表区，修复设置页查看器浮层 (#44)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.6...v0.3.7

## [v0.3.6] - 2026-10-25

### Fixes

- **client**: 页头按内容换行，避免窄面板截断安装标识 (#42)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.5...v0.3.6

## [v0.3.5] - 2026-10-25

### Fixes

- **client**: 页头动作固定右上，页面断点与滚动条解耦 (#40)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.4...v0.3.5

## [v0.3.4] - 2026-10-25

### Refactors

- **skills**: 页头安装标识改为只读无边框展示 (#38)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.3...v0.3.4

## [v0.3.3] - 2026-10-25

### Features

- **skills**: 页头身份改为可复制的安装标识 (#36)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.2...v0.3.3

## [v0.3.2] - 2026-10-25

### Features

- **skills**: 查看技能内容 —— 列表行新增「查看」，右侧抽屉速览、可升级为整页深读；正文渲染 / 原文切换、文件树与单文件预览、信息 tab；新增 `GET /skills/:name?path=` 与 `GET /skills/:name/files` 两个只读接口，并补上原先缺失的技能名与相对路径校验 (#34)
- **skills**: 清单状态区分「待检查」与「无上游」—— 没有可用订阅来源的技能不再混进待检查计数

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.1...v0.3.2

## [v0.3.1] - 2026-10-25

### Fixes

- **autolink**: show dsh global as a checked, locked row (#30)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.0...v0.3.1

## [v0.3.0] - 2026-10-24

### Features

- **installer**: native-only 0.3.0 installer（去 CLI/git） (#28)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.4...v0.3.0

## [v0.2.4] - 2026-10-24

### Features

- **skills**: bundle CLI dependency for no-Node setups (#26)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.3...v0.2.4

## [v0.2.3] - 2026-10-24

### Features

- **updates**: 探测与更新改走 git，修复限流下的哈希形态判定 (#22)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.2...v0.2.3

## [v0.2.2] - 2026-10-24

### Fixes

- **skills**: 订阅跟随仓库默认分支，添加技能先探测再选择 (#18)

### Docs

- 补充本地 link 验证与回退步骤 (#19)
- 聚焦当前插件说明，移除旧包名与迁移内容 (#17)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.1...v0.2.2

## [v0.2.1] - 2026-10-23

### Features

- **client**: 重排技能控制台页头与浮层，统一接入文案 (#11)
- 页头展示插件身份与版本并收敛首屏文案 (#9)

### Refactors

- **client**: 拆分 Web Client 为多模块并引入 esbuild 构建链 (#12)

### Docs

- 重写 README 为插件介绍 (#13)
- 复核发布流程文档，修正事实性错误与失效引用 (#8)
- 把 npm 发包流程整理成完整端到端手册 (#7)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.0...v0.2.1

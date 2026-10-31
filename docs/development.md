# 开发与测试

> 面向在本仓写代码的人。发布流程见 [publishing.md](publishing.md)；可见性与数据边界见 [internals.md](internals.md)；agent 侧检查矩阵见 [docs/agents/verification-release.md](agents/verification-release.md)。

## 1. 环境

- Node.js ≥ 22.20（`engines`：`^22.20.0 || >=24.0.0`），npm 随 Node。
- **`dependencies` 只有 `tar@7.5.22` 与 `@morehao/dsh-plugin-kit`（`>=0.1.0 <0.2.0`）**：`tar` 随插件安装、精确锁版本，供 native installer 解压；`@morehao/dsh-plugin-kit` 是插件自更新引擎（查 npm 最新版 + 经宿主 `pluginManager` 重装），零 `@deepseek-ai` 运行时依赖、宿主能力全部注入，不再自实现自更新。DSH 宿主自带的能力（`@deepseek-ai/dsh-home-paths` / `dsh-skill` / `dsh-skill-filesystem` / `schemastery`，及 YAML 解析用的 `yaml`）走 `peerDependencies`（宿主 runtime resolution 提供，不打包），`devDependencies` 锁版本仅供本仓测试；构建期 devDependency 是 `typescript` + `esbuild`（`package-lock.json` 已提交），`@types/node` / `@types/react` 供类型检查。**Host 用 tsc 编译到 `dist/`，客户端用 esbuild 打包到根 `client.js`，两个产物都不入库**（`npm install` 的 `prepare` 会自动构建一次）。`npm test` 仍离线；`npm run check` 含构建，开发机需要先 `npm install`。
- 安装/更新/删除都由 native installer 独立完成（下载 → 安全解压 → 发现 → tree SHA → 原子 promote → lock），运行时不调用任何外部命令。REST 403/429 时，探测与更新检查用 Atom commit feed + codeload tarball 兜底，在 `os.tmpdir()` 解压扫描后即删。

## 2. 目录结构

```
lib/index.ts        Host 入口：装配 paths / state / registry / installer / service / routes
lib/routes.ts       HTTP 路由（prefix /api/morehao/skills-console）
lib/core/           领域逻辑（TS）：清单、软链、native installer（下载/解压/发现/tree/lock）、
                    更新、删除、订阅、哈希、状态、日志、Atom/codeload 限流兜底
lib/contract/       跨 Host/Client 的类型契约（纯 .d.ts，不产出、不进 dist）
client/             Web Client 源码（TS）：host / copy / styles / api / icons /
                    hooks / actions / markdown / scroll / views/* / section / surface / app / index
dist/               Host 构建产物（tsc 1:1 输出，npm run build:host 生成，不入库）
client.js           Web Client 构建产物（npm run build:client 生成，不入库）
tsconfig.host.json / tsconfig.client.json  两套 TS 配置
scripts/build-host.mjs    tsc 保结构编译 + 复制运行时 JSON 资产（--check / --watch）
scripts/build-client.mjs  esbuild 打包脚本（--check 校验漂移 / --watch / --sourcemap）
scripts/check-cycles.mjs  静态 import 图循环检测（client/ 与 lib/）
locale/{zh,en}.json 分区标题与描述
scripts/            语法自检、循环依赖检测、命名/打包校验、agent 表导出、发布与 Release 正文投影
test/               node:test 用例（离线）
docs/               人类向文档；docs/agents/ 是 agent 任务手册
.dsh/               本地过程文档（specs / plans / notes / 原型），gitignored
```

## 3. 测试

```bash
npm test            # node --test "test/*.test.mjs"（pretest 会先 npm run build）
npm run build       # tsc(lib → dist) + esbuild(client → client.js)
npm run check:cycles # 只跑 import 图循环检测（client/ 与 lib/，支持 .ts）
npm run check       # 类型检查 + 循环 + 构建 + 命名 + 打包 + Release 说明投影
```

两条硬规矩：

1. **离线**：不联网。GitHub Trees API 走 stub（`updates.test.mjs` 直接喂 200 / 304 / 401 / 404 响应）；Atom/codeload 兜底也走同一个 `fetchImpl` stub，tar 由本地 fixture 生成，真 git 进程 / 真网络都不参与。
2. **不碰真实目录**：每个用例自建 `mkdtemp` 出来的临时 `HOME` / `DSH_HOME`；安装/更新/删除用 fake installer 或本地 tar fixture，探测/更新的限流兜底用 Atom/codeload stub。

| 用例文件 | 覆盖什么 |
|---|---|
| `hash.test.mjs` | 内容哈希稳定（与文件顺序、路径大小写无关）、跳过 `.git` / `node_modules`、排序与进程 locale 无关（子进程换 LANG 对拍）、旧口径基线可被 `matchesLegacyHash` 识别 |
| `state.test.mjs` | 原子写、坏 JSON → 只读、未来版本 → 只读、缺字段补默认、v2→v3（退休 `shadows[]`、保留 `legacyShadows[]`）、旧版本读 v3 只读、`autoLinkAgents` → `autoLinkTargets` 旧字段升级、`placement` 回退 |
| `agents.test.mjs` | 注册表探测、排除 universal 伪路径、OpenCode / XDG config、Agent 目录被删 |
| `links.test.mjs` | 软链四态判定、幂等建链、不覆盖 `real` / `foreign-link` |
| `installer.test.mjs` | native installer：codeload→解压→发现→canonical→lock 事务、根级/subpath、重名/危险条目、重装备份、lock 写失败回滚、strict tree 校验、readiness、remove |
| `shadow.test.mjs` | legacy 停用桩：三字段 + marker、幂等、遇 foreign/link 保留并报告、`broken` 判态、删桩不留残骸、扫描根口径（目录包/平铺/软链/点文件）；只服务迁移，不再新建 |
| `policy.test.mjs` | policy provider：disabled canonical → 1 候选、enabled → 0；project 100 / user-dsh 400 副本 → 0（条件发候选）；`get` 重校验 enabled/winner；rank 498、invocation 全 false；per-agent 注册/失效/清理；无 `registerProvider` 时 409 |
| `migrations.test.mjs` | v1→v2→v3：删历史可见性链/留外来链与真实目录/剪悬空导出、写 manifest 与 v1/v2 副本、幂等、**不再补桩**、v2→v3 清理 legacy 桩（foreign/link/orphan 保留）、迁移可续跑、备份 7 天清理 |
| `discovery.test.mjs` | SKILL.md 发现：frontmatter/目录名/根级、subpath、重名、非法名、隐藏目录 |
| `native-install.test.mjs` | Service + 真实 installer 端到端（stub REST/codeload）：安装→state/导出链→删除→回收站/lock |
| `native-update.test.mjs` | Service + 真实 installer：REST 限流→Atom/codeload 快照→plan/apply→lock/state/备份/导出链存活→rollback 还原 lock 基线 |
| `remote.test.mjs` | codeload 限额/超时/重定向/token；Atom 解析与错误；tarball 快照扫描与 tree SHA |
| `native-only.test.mjs` | 0.3 守卫：runtime 依赖最小（`tar` + `@morehao/dsh-plugin-kit`），`lib/` 不 spawn、不引用 CLI/git 模块、不读旧 CLI/git 环境变量 |
| `updates.test.mjs` | 快照解析、subpath 过滤、L0–L3 判定、哈希形态（40 位 tree / 64 位内容哈希）与安装基线回退、默认分支失败分流（限流 reset 时间 / 404 / 403 / 网络）、计划 token 稳定性、Trees 200/304/401/404 |
| `service.test.mjs` | 编排：安装（lock 断言 + 记账 + 默认不建链）、64 位 lock 不误报并按 `treeSha` 判定、导出目标设置、停用只写 `enabled=false` / 不写 `~/.dsh/skills`、启用只改状态、legacy 桩删除失败 409、删除体检只拦记账导出目标（别人的同名链不拦）、删除（回收站）并清 legacy、Agent 目录删掉后导出降级、自动接管（幂等）、无来源接管、只读拒绝且不对账写盘、探测 REST 优先 / Atom+codeload 兜底 / 双通道失败、刷新按 Atom commit 短路、codeload 更新计划；`setInvocation` 三档 + 作者只读 + 归一化哈希 + park 期间拒绝更新/安装 + `reconcileInvocations` 重放；旧 locale 哈希基线一次性重基线（没改过的自动改写、改过的保留）、旧停用哈希不算内容漂移；安装/更新/删除改用 fake installer / 真实 installer |
| `invocation.test.mjs` | 文件侧：frontmatter 插入/替换/删除、BOM/CRLF/注释/块标量保留、重复 key/无 frontmatter/无闭合拒绝、原子写权限、归一化哈希、park/unpark 内容字节与 hash 校验、park 冲突 `keep=current`、marker 半状态收敛 |
| `client.test.mjs` | 读**已提交的** `client.js` 产物，在 React 存根里渲染正常 / 空态 / 只读 / 未追踪 / 可见性差异 / 共享根 Agent（行内不显示、未导出时给中性占位、按 Agent 不分组、抽屉不列共享根）/ 自动导出多选（DSH 不进导出列表，且不再显示“读共享根”说明）/ 导出设置弹窗 / 入口位置切换（先开「插件设置」面板）/ 页头安装标识（`@scope/name@version`，只读展示）与 ⚙·GitHub 工具组 / Agent `+n` 悬浮列表 / 设置导航图标认领与卸载还原 / 调用策略 chip + 三档弹窗 + 作者只读 + 停用恢复确认，并检查主按钮反色、chip 语义色、弹窗表面色、方形复选框圆点 |
| `client-copy.test.mjs` | 直接 import `client/copy.js`：zh / en 键集合一致、`{n}` / `{path}` 占位符一致、文案非空 |
| `client-scroll.test.mjs` | 滚动容器口径：4px 容差、跳过非滚动父级、`document.scrollingElement` 兜底、`scrollHost` 先自身后父级 |
| `check-cycles.test.mjs` | import 图：静态 / 副作用 / export-from / 动态 import 提取、注释与字符串排除、环检测、自引用、链式非环、外部模块忽略、相对路径解析失败归类 |
| `routes.test.mjs` | `/state` 下发插件身份（短名 + 带 scope 的 `fullName` + 版本，与 `package.json` 同源）、缺鉴权头 → 403、`/skills/:name/invocation` 与 `/unpark` 的透传与 409 |

### 3.1 类型检查与约定

- **`npm run check` 与 `check:host` / `check:client` 的分工**：`npm run check` 里的 `npm run build`（`tsc` 编译 host + `esbuild` 打包 client）遇到类型错误会直接失败，所以**不**再把 `check:host` / `check:client` 挂进 `npm run check`——它们只做「`dist/`、`client.js` 是否落后于源码」的产物漂移检查（本地 `link:` 前自检也会用）。不要为了「重复做一次类型检查」把两者塞回 `check`，那是重复构建。
- **客户端类型已收窄**：`tsconfig.client.json` 开启 `noImplicitAny: true`——视图 props、API 数据行、`apiCall<T>` 调用点都有显式类型；共享形状定义在 `client/api.ts`，跨 half 契约复用 `lib/contract/*.d.ts` 的 `LedgerRow` / `ExportRow` 等。
- **Host 侧仍是 `noImplicitAny: false`**：`lib/**` 的隐式 `any` 按模块逐块收窄，属后续独立轮次（先拿结构类型收益，避免一次性大 diff）。收窄时优先有明确契约的模块（`paths` / `state` / `lock` / `installer` / `routes`），再编排层。
- **`useUnknownInCatchVariables` 两套 tsconfig 仍为 `false`**：Host 约 204 处 `catch (err)` 直接把 `err` 当 `any`（读 `.message` / `.code` / `.detail`）。开启要逐处补 `unknown` 收窄或断言，属独立一轮，不在本轮范围。

## 4. 调试

- **事件日志**：`$DSH_HOME/skills-console/dsh-skills-console.log`（JSONL，1MB 滚动到 `.1`），每条带 `at` / `event` / 上下文。
- **状态文件**：`$DSH_HOME/skills-console/state.json`（`version: 4`）；坏掉时插件降级只读（写接口 409），删掉重建即可恢复。`DSH_SKILLS_CONSOLE_HOME` 可整体挪到临时目录做实验。
- **state v4 形状**：`installs[]`（`mode` = `auto`/`manual`/`hidden` 是调用策略权威记录；`manual` = `{origin:'plugin'|'author', original:'absent'|'true'|'false', appliedAt, drift?}`；`hidden` = `{disabledFile, marker, previousMode, canonicalHash, at}`；`legacy:'dsh-off'` 标记旧 `/mode` 停用；`enabled` 仍供 provider 读，`auto` 以外归一为 `true`；不含任何链路径）、`exports[]`（`{skill,target,agentDir,linkPath,mode,at}`，只记给别的 Agent 建的链）、`legacyShadows[]`（只放迁移删不掉的旧桩与 orphan，`{skill,stubPath,reason,at}`）、`settings.exportTargets`（默认 `[]`）、`migration`。`shadows[]` 已退休，不再写入。
- **v1→v2→v3 迁移**（`service.ensureMigrated()`，插件 `apply()` 时先跑一次）：v1 先备份原始 JSON 到 `migrations/state-v1-<ts>.json`；v2 再备份到 `migrations/state-v2-<ts>.json`。v1→v2 照旧把 `dsh-global` 链删掉、`agent:*` 链转 `exports`、`mode:off` 保留 `enabled=false`，但**不再补停用桩**。v3→v4 是纯函数：补 `mode:'auto'`、`enabled=false` 补 `legacy:'dsh-off'`、清掉与 `auto` 冲突的 `manual`/`hidden`；旧客户端读到 v4 只读。v2→v3 先把含全部待清理行的 v3 状态原子写入（`legacyShadows` 即待办清单），再逐条删 legacy 桩：成功从数组移除；`foreign`/`link`/`locked` 保留并写原因；`orphan`（找不到对应 install）不删，避免原本隐藏的技能突然可见。清理完再写一次 v3，manifest 写 `migrations/v2-to-v3-<ts>.json`（`planned` → `done`），7 天后自动清理。全过程幂等，中断可续跑。
- **诊断**：`GET /diagnostics` 的 `drift` 会列出 `exportsMissing` / `legacyShadows` / `disabledButVisible` / `enabledButHidden`，另有顶层 `policy`（`available` / `agents` / `liveAgents` / `errors` / `blindSpots`）；技能自己声明 `disable-model-invocation`、或账本 `mode:'hidden'` 时不算 `enabledButHidden`；不再有 `shadowOrphans` / `shadowBroken` / `shadowUnrecorded`。`GET /state` 的 `visible` 是真扫扫描根 + 宿主 `snapshot()`，再叠加 `policyHiddenPaths` 得到的，不是从账本推的。
- **可见性模型**：见 [实现与数据边界 §2](internals.md#2-可见性模型)——canonical `~/.agents/skills`（rank 500）是真身；每个 live agent 的 scope 里有一个 policy provider，只在 canonical 是 native winner 时发 `modelInvocable=false` 的候选。项目级副本（100/200）或 user-dsh 副本（400）优先时 provider 沉默，副本继续可见；`~/.dsh/skills`（rank 400）v0.4.0 起不再写入，只留迁移清理。customSkillDirs 与 plugin runtime 技能是盲区，诊断标注。
- **接口**：所有路由要带 `x-dsh-skills-console: 1` 请求头，否则 403。
- **生效方式**：`plugin_manager install_bundle(target = 本仓绝对路径)` 时是 `link:`：改 `client/` 后跑 `npm run dev:client`（宿主只 watch 根 `client.js`），改 `lib/` 后跑 `npm run dev:host`（或 `npm run build:host`）；**装 link 前必须先 `npm run build`，`dsh plugin add` 不会替你构建**。npm 安装版是拷贝，需要重新 `npm run build`、重装并重启 dsh web。本地 link 验证的安装、生效与回退步骤见 §5。
- **别在本机真实目录上试破坏性操作**：删除、更新 apply 会动 `~/.agents/skills` 与各 Agent 的软链；用临时 `HOME` 起一个干净宿主更安全。接管只补记账、不碰文件。
- **自动接管**：`GET /state` 会扫描 canonical，把账本里还没有的技能补成 `installs`（有 lock 来源时顺带建订阅）；只读状态或在途写操作时跳过。

## 5. 本地验证（link: 安装）

把某个 profile 里的 `@morehao/dsh-skills-console` 换成指向本仓的 `link:`，用真实宿主验证 Host 接口与 Web Client；验证完按 §5.3 回退。

### 5.1 安装

```bash
PROFILE=~/.dsh/profiles/desktop              # 换成要验证的 profile
mkdir -p .dsh/link-preview
cp "$PROFILE/package.json" .dsh/link-preview/package.json.bak
cp "$PROFILE/pnpm-lock.yaml" .dsh/link-preview/pnpm-lock.yaml.bak
cp -R "$PROFILE/node_modules/@morehao/dsh-skills-console" .dsh/link-preview/dsh-skills-console-installed

dsh plugin --profile desktop add "link:$PWD"
```

`dsh plugin` 把参数转发给 profile 目录里的 pnpm；`link:` 装出来是指向本仓的软链，不是拷贝。校验：

```bash
readlink ~/.dsh/profiles/desktop/node_modules/@morehao/dsh-skills-console   # 应指向本仓
grep '"@morehao/dsh-skills-console"' ~/.dsh/profiles/desktop/package.json   # 值应为 link:/...
```

### 5.2 生效

- **切换后要完全退出宿主再重开**（桌面端 ⌘Q，不是关窗口）：profile 的 bundle 在启动时装载，改 `node_modules` 不会热替换已加载的模块，只刷新页面不够。
- 启动后进 设置 → 技能控制台 → 添加技能：应出现「检测技能」；`alchaincyf/huashu-design` 检出 1 个技能，`morehao/agent-skills` 检出 7 个、可多选。
- 之后改 `client/`：`npm run dev:client`（宿主 watch 根 `client.js`，产物一变页面自动刷新）；改 `lib/`：刷新页面。
- link 绑定当前工作树：验证期间不要切分支、移动或删除 checkout，否则宿主下次启动会静默丢掉这个插件（设置分区消失且无报错）。

### 5.3 回退

```bash
# 方式一：从 npm 重装验证前的版本（把 0.2.1 换成实际版本）
dsh plugin --profile desktop add @morehao/dsh-skills-console@0.2.1

# 方式二：用备份还原（package.json / lock 被改乱，或方式一失败时）
cp .dsh/link-preview/package.json.bak ~/.dsh/profiles/desktop/package.json
cp .dsh/link-preview/pnpm-lock.yaml.bak ~/.dsh/profiles/desktop/pnpm-lock.yaml
dsh plugin --profile desktop install --frozen-lockfile
```

回退后同样**完全退出再重开**宿主，确认 `readlink` 不再指向本仓、`grep link:` 无输出。

**收尾是强制的**：验证结束（通过或放弃）都要回退，`link:` 不允许留在 profile 里；确认回退无误后删除 `.dsh/link-preview/` 备份（只在验证期间保留）。完整标准流程（备份内容、权限、逐步校验点、失败还原）见 [AGENTS.md](../AGENTS.md) §6。

### 5.4 注意

- `dsh plugin` 要写 `~/.dsh/profiles/<name>`；在 agent 沙箱里会报 `EPERM ... package.json.lock`，在终端执行或申请更高权限。
- 验证前先 `npm run build`（或 `npm run check:host` + `npm run check:client`），确保 link 读到的是最新 `dist/` 与 `client.js`。
- 回退时 pnpm 替换 `link:` 可能连带清掉工作树的 `node_modules`；回退后若 `npm run check` 报 `Cannot find package 'esbuild'`，`npm install` 恢复即可。
- 别在真实 HOME 上做破坏性验证（删除技能、更新 apply）：用临时 `HOME` / `DSH_HOME` 起干净宿主，见 §3。
- 只验证 Host 逻辑不必装 link，直接跑 `npm test` / `npm run check`。

## 6. 常见坑

| 症状 | 原因与处理 |
|---|---|
| 改了 `client/` 页面没变化 | 忘了重建：`npm run build:client`；`link:` 调试时挂着 `npm run dev:client` |
| 改了源码但产物没更新 | 跑 `npm run build`；`check:host` / `check:client` 报产物与源码不一致时同理 |
| `npm run check` 报找不到 `esbuild` | 构建期依赖还没装：`npm install`（`npm test` 不需要） |
| `client/` 出现在 `npm pack` 清单里 | 源码目录不入包，`check-pack.mjs` 会红；不要把 `client/` 加进 `package.json.files` |
| 想调试 `client/` 但产物不可读 | `npm run build:client -- --sourcemap`（或 `npm run dev:client -- --sourcemap`）生成 `client.js.map`；它不提交，`client.js` 也会因此与正常产物不同，提交前重跑不带 `--sourcemap` 的构建 |
| 面板显示「本地安装器不可用」 | lock 版本过高/损坏或 canonical 不可写。先看事件日志里的 `readiness`/lock 错误，再修权限或把 lock 备份后重建；不要手改 lock 版本 |
| 手工改了 `state.json` 页面没反应 | 已改成每请求前重读，但若写入队列有在途写，会等 pending 归零再读 |
| `npm pack` 报 `EPERM ~/.npm/_cacache` | 本机 `~/.npm` 有 root 属主文件；`check-pack.mjs` 用临时 cache 规避，手动跑可 `sudo chown -R 501:20 ~/.npm` |
| 技能装了但 DSH 里没有 | 看是不是只建了项目级链（`scopeProjects`）或 `mode: off`；再跑 `GET /state` 看 `visible` 与 `ledger` 对账 |
| 装好的技能仍显示「未纳入追踪」 | 只读模式下不会对账；否则刷新一次 `GET /state` 即可自动补账。仍不行就看日志里的 `skills.reconcile` |
| 更新提示「安装后有改动」 | 内容哈希与安装基线不一致（`locally-modified`）；确认后再带 `overwrite` 应用，或先在终端看 `git diff` |
| 没改过却提示「安装后有改动」 | v0.6.x 之前的内容哈希按进程 locale 的 collation 排序：目录里同时有 ASCII 与中日文文件名时（如 `script.md` 与 `什么是token.html`），换启动环境（LANG / ICU 版本）就会算出不同的 digest 而误报。现在排序固定为与 locale 无关的 code unit 序，启动时会做一次重基线：**只有旧口径能精确复现记录值**时才改写 `installedHash`（日志 `state.hash-order.rebaseline`），内容真动过的不碰。升级后仍提示的，就是真改动 |
| 设置里的「技能控制台」图标和「通用设置」一样是齿轮 | dsh 的 `settings.section` 只投影 `id` / `order` / `label`，导航图标由 `dsh-client-ui-settings-general` 按 id 从固定映射里取，未知 id 一律回落到齿轮。`client.js` 的 `installSettingsNavIcon` 会在对话框挂载后按本插件分区标题认领那一行、换成自有标记；dsh 支持 `icon` 字段后可删掉这段 |

# 开发与测试

> 面向在本仓写代码的人。发布流程见 [publishing.md](publishing.md)；agent 侧检查矩阵见 [docs/agents/verification-release.md](agents/verification-release.md)。

## 1. 环境

- Node.js ≥ 22.20（`engines`：`^22.20.0 || >=24.0.0`），npm 随 Node。
- **零 runtime 依赖**：`package.json` 无 `dependencies`，只有一个构建期 devDependency `esbuild`（精确锁版本，`package-lock.json` 已提交）。`npm test` 不装依赖也能跑；`npm run check` 含 `check:client`（会重建 bundle），开发机需要先 `npm install`。
- `skills` CLI 不在本包内：运行时由宿主环境提供（四层探测：`DSH_SKILLS_CONSOLE_CLI` 覆盖 → `PATH` → `$DSH_HOME/profiles/*/node_modules/skills` → `npx`）。

## 2. 目录结构

```
lib/index.js        Host 入口：装配 paths / state / registry / cli / service / routes
lib/routes.js       HTTP 路由（prefix /api/morehao/skills-console）
lib/core/           领域逻辑：清单、软链、安装、更新、删除、订阅、哈希、状态、日志
client/             Web Client 源码（ESM）：host / copy / styles / api / icons /
                    hooks / actions / views/* / section / surface / app / index
client.js           Web Client 构建产物（npm run build:client 生成，不要手改，但要提交）
scripts/build-client.mjs  esbuild 打包脚本（--check 校验漂移 / --watch / --sourcemap）
locale/{zh,en}.json 分区标题与描述
scripts/            语法自检、命名/打包校验、agent 表导出、发布与 Release 正文投影
test/               node:test 用例（离线）
docs/               人类向文档；docs/agents/ 是 agent 任务手册
.dsh/               本地过程文档（specs / plans / notes / 原型），gitignored
```

## 3. 测试

```bash
npm test          # node --test "test/*.test.mjs"，96 例
npm run check     # 机械校验：语法 + 生成物一致性（check:client）+ 命名 + 打包 + Release 说明投影
```

两条硬规矩：

1. **离线**：不联网。GitHub Trees API 走 stub（`updates.test.mjs` 直接喂 200 / 304 / 401 / 404 响应）。
2. **不碰真实目录**：每个用例自建 `mkdtemp` 出来的临时 `HOME` / `DSH_HOME`；CLI 用 `DSH_SKILLS_CONSOLE_CLI="<node> <stub.cjs>"` 注入 stub（见 `test/cli.test.mjs`，覆盖成功 / 非零退出 / 超时 / 无 JSON 四种形态）。

| 用例文件 | 覆盖什么 |
|---|---|
| `hash.test.mjs` | 内容哈希稳定（与文件顺序、路径大小写无关）、跳过 `.git` / `node_modules` |
| `state.test.mjs` | 原子写、坏 JSON → 只读、未来版本 → 只读、缺字段补默认、`autoLinkAgents` → `autoLinkTargets` 旧字段升级、`placement` 回退 |
| `agents.test.mjs` | 注册表探测、排除 universal 伪路径、OpenCode / XDG config、Agent 目录被删 |
| `links.test.mjs` | 软链四态判定、幂等建链、不覆盖 `real` / `foreign-link` |
| `cli.test.mjs` | CLI 定位、argv 形状（`add` 带全参数 / `remove` 不带 `-a`）、能力位、硬超时、非零退出 |
| `updates.test.mjs` | 快照解析、subpath 过滤、L0–L3 判定、哈希形态不配对 → `unknown`、计划 token 稳定性、Trees 200/304/401/404 |
| `service.test.mjs` | 编排：安装（lock 断言 + 建链 + 记账）、自动接入多选、入口位置持久化、启停、删除（回收站）、Agent 删除后的链接降级、自动接管（幂等）、无来源接管、只读拒绝且不对账写盘 |
| `client.test.mjs` | 读**已提交的** `client.js` 产物，在 React 存根里渲染正常 / 空态 / 只读 / 未追踪 / 可见性差异 / 自动接入多选 / 工作区勾选 / 入口位置切换（先开「插件设置」面板）/ 页头身份与 ⚙·GitHub 工具组 / Agent `+n` 悬浮列表 / 设置导航图标认领与卸载还原，并检查主按钮反色、开关旋钮反色、弹窗表面色、方形复选框圆点与开关禁用 |
| `client-copy.test.mjs` | 直接 import `client/copy.js`：zh / en 键集合一致、`{n}` / `{path}` 占位符一致、文案非空 |
| `routes.test.mjs` | `/state` 下发插件身份（包名去 scope + 版本，与 `package.json` 同源）、缺鉴权头 → 403 |

## 4. 调试

- **事件日志**：`$DSH_HOME/skills-console/dsh-skills-console.log`（JSONL，1MB 滚动到 `.1`），每条带 `at` / `event` / 上下文。
- **状态文件**：`$DSH_HOME/skills-console/state.json`；坏掉时插件降级只读（写接口 409），删掉重建即可恢复。`DSH_SKILLS_CONSOLE_HOME` 可整体挪到临时目录做实验。
- **接口**：所有路由要带 `x-dsh-skills-console: 1` 请求头，否则 403。
- **生效方式**：`plugin_manager install_bundle(target = 本仓绝对路径)` 时是 `link:`：改 `client/` 后跑 `npm run dev:client`（宿主只 watch 根 `client.js`，产物一变就刷新），改 `lib/` 后刷新页面即可；npm 安装版是拷贝，需要重新 `npm run build:client`、重装并重启 dsh web。本地 link 验证的安装、生效与回退步骤见 §5。
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

### 5.4 注意

- `dsh plugin` 要写 `~/.dsh/profiles/<name>`；在 agent 沙箱里会报 `EPERM ... package.json.lock`，在终端执行或申请更高权限。
- 验证前先 `npm run build:client`（或 `npm run check:client`），确保 link 读到的是最新 `client.js`。
- 别在真实 HOME 上做破坏性验证（删除技能、更新 apply）：用临时 `HOME` / `DSH_HOME` 起干净宿主，见 §3。
- 只验证 Host 逻辑不必装 link，直接跑 `npm test` / `npm run check`。

## 6. 常见坑

| 症状 | 原因与处理 |
|---|---|
| 改了 `client/` 页面没变化 | 忘了重建：`npm run build:client`；`link:` 调试时挂着 `npm run dev:client` |
| 手改了 `client.js` | 不要改生成物；`npm run check` 的 `check:client` 会按 `client/` 重建并逐字节比对，直接报不一致 |
| `npm run check` 报找不到 `esbuild` | 构建期依赖还没装：`npm install`（`npm test` 不需要） |
| `client/` 出现在 `npm pack` 清单里 | 源码目录不入包，`check-pack.mjs` 会红；不要把 `client/` 加进 `package.json.files` |
| 想调试 `client/` 但产物不可读 | `npm run build:client -- --sourcemap`（或 `npm run dev:client -- --sourcemap`）生成 `client.js.map`；它不提交，`client.js` 也会因此与正常产物不同，提交前重跑不带 `--sourcemap` 的构建 |
| 面板里 CLI 显示 `npx` 且每次慢 2–3 秒 | GUI 启动的宿主进程拿不到 `DSH_PROFILE_DIR`；靠 `$DSH_HOME/profiles/*/node_modules/skills` 探测兜底，或显式设 `DSH_SKILLS_CONSOLE_CLI` |
| 手工改了 `state.json` 页面没反应 | 已改成每请求前重读，但若写入队列有在途写，会等 pending 归零再读 |
| `npm pack` 报 `EPERM ~/.npm/_cacache` | 本机 `~/.npm` 有 root 属主文件；`check-pack.mjs` 用临时 cache 规避，手动跑可 `sudo chown -R 501:20 ~/.npm` |
| 技能装了但 DSH 里没有 | 看是不是只建了项目级链（`scopeProjects`）或 `mode: off`；再跑 `GET /state` 看 `visible` 与 `ledger` 对账 |
| 装好的技能仍显示「未纳入追踪」 | 只读模式下不会对账；否则刷新一次 `GET /state` 即可自动补账。仍不行就看日志里的 `skills.reconcile` |
| 更新提示「本地已改」 | 内容哈希与 lock 不一致（`locally-modified`）；确认后再带 `overwrite` 应用，或先在终端看 `git diff` |
| 设置里的「技能控制台」图标和「通用设置」一样是齿轮 | dsh 的 `settings.section` 只投影 `id` / `order` / `label`，导航图标由 `dsh-client-ui-settings-general` 按 id 从固定映射里取，未知 id 一律回落到齿轮。`client.js` 的 `installSettingsNavIcon` 会在对话框挂载后按本插件分区标题认领那一行、换成自有标记；dsh 支持 `icon` 字段后可删掉这段 |

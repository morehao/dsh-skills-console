# 开发与测试

> 面向在本仓写代码的人。发布流程见 [publishing.md](publishing.md)；agent 侧检查矩阵见 [docs/agents/verification-release.md](agents/verification-release.md)。

## 1. 环境

- Node.js ≥ 22.20（`engines`：`^22.20.0 || >=24.0.0`），npm 随 Node。
- **没有依赖**：`package.json` 无 `dependencies`，克隆下来直接跑；`npm install` 只会在需要打包校验时读 `package.json`。
- `skills` CLI 不在本包内：运行时由宿主环境提供（四层探测：`DSH_SKILLS_CONSOLE_CLI` 覆盖 → `PATH` → `$DSH_HOME/profiles/*/node_modules/skills` → `npx`）。

## 2. 目录结构

```
lib/index.js        Host 入口：装配 paths / state / registry / cli / service / routes
lib/routes.js       HTTP 路由（prefix /api/morehao/skills-console）
lib/core/           领域逻辑：清单、软链、安装、更新、删除、订阅、哈希、状态、日志
client.js           Web Client half：设置页 settings.section（一页两 tab）
locale/{zh,en}.json 分区标题与描述
scripts/            语法自检、命名/打包校验、agent 表导出、发布与 Release 正文投影
test/               node:test 用例（离线）
docs/               人类向文档；docs/agents/ 是 agent 任务手册
.dsh/               本地过程文档（specs / plans / notes / 原型），gitignored
```

## 3. 测试

```bash
npm test          # node --test "test/*.test.mjs"，76 例
npm run check     # 机械校验：语法 + 命名 + 打包 + Release 说明投影
```

两条硬规矩：

1. **离线**：不联网。GitHub Trees API 走 stub（`updates.test.mjs` 直接喂 200 / 304 / 401 / 404 响应）。
2. **不碰真实目录**：每个用例自建 `mkdtemp` 出来的临时 `HOME` / `DSH_HOME`；CLI 用 `DSH_SKILLS_CONSOLE_CLI="<node> <stub.cjs>"` 注入 stub（见 `test/cli.test.mjs`，覆盖成功 / 非零退出 / 超时 / 无 JSON 四种形态）。

| 用例文件 | 覆盖什么 |
|---|---|
| `hash.test.mjs` | 内容哈希稳定（与文件顺序、路径大小写无关）、跳过 `.git` / `node_modules` |
| `state.test.mjs` | 原子写、坏 JSON → 只读、未来版本 → 只读、缺字段补默认、`autoLinkAgents` → `autoLinkTargets` 迁移、`placement` 回退 |
| `agents.test.mjs` | 注册表探测、排除 universal 伪路径、OpenCode / XDG config、Agent 目录被删 |
| `links.test.mjs` | 软链四态判定、幂等建链、不覆盖 `real` / `foreign-link` |
| `cli.test.mjs` | CLI 定位、argv 形状（`add` 带全参数 / `remove` 不带 `-a`）、能力位、硬超时、非零退出 |
| `updates.test.mjs` | 快照解析、subpath 过滤、L0–L3 判定、哈希形态不配对 → `unknown`、计划 token 稳定性、Trees 200/304/401/404 |
| `service.test.mjs` | 编排：安装（lock 断言 + 建链 + 记账）、自动链接多选、入口位置持久化、启停、删除（回收站）、Agent 删除后的链接降级、自动接管（幂等）、无来源接管、只读拒绝且不对账写盘 |
| `client.test.mjs` | `client.js` 在 React 存根里渲染正常 / 空态 / 只读 / 未追踪 / 可见性差异 / 自动链接多选 / 工作区勾选 / 入口位置切换（先开「插件设置」面板）/ 页头身份与 GitHub 右侧图标按钮 / 设置导航图标认领与卸载还原，并检查主按钮反色、开关旋钮反色、弹窗表面色、方形复选框圆点与开关禁用 |
| `routes.test.mjs` | `/state` 下发插件身份（包名去 scope + 版本，与 `package.json` 同源）、缺鉴权头 → 403 |

## 4. 调试

- **事件日志**：`$DSH_HOME/skills-console/dsh-skills-console.log`（JSONL，1MB 滚动到 `.1`），每条带 `at` / `event` / 上下文。
- **状态文件**：`$DSH_HOME/skills-console/state.json`；坏掉时插件降级只读（写接口 409），删掉重建即可恢复。`DSH_SKILLS_CONSOLE_HOME` 可整体挪到临时目录做实验。
- **接口**：所有路由要带 `x-dsh-skills-console: 1` 请求头，否则 403。
- **生效方式**：`plugin_manager install_bundle(target = 本仓绝对路径)` 时是 `link:`，改 `client.js` / `lib/` 后刷新页面即可；npm 安装版是拷贝，需要重装并重启 dsh web。
- **别在本机真实目录上试破坏性操作**：删除、更新 apply 会动 `~/.agents/skills` 与各 Agent 的软链；用临时 `HOME` 起一个干净宿主更安全。接管只补记账、不碰文件。
- **自动接管**：`GET /state` 会扫描 canonical，把账本里还没有的技能补成 `installs`（有 lock 来源时顺带建订阅）；只读状态或在途写操作时跳过。

## 5. 常见坑

| 症状 | 原因与处理 |
|---|---|
| 面板里 CLI 显示 `npx` 且每次慢 2–3 秒 | GUI 启动的宿主进程拿不到 `DSH_PROFILE_DIR`；靠 `$DSH_HOME/profiles/*/node_modules/skills` 探测兜底，或显式设 `DSH_SKILLS_CONSOLE_CLI` |
| 手工改了 `state.json` 页面没反应 | 已改成每请求前重读，但若写入队列有在途写，会等 pending 归零再读 |
| `npm pack` 报 `EPERM ~/.npm/_cacache` | 本机 `~/.npm` 有 root 属主文件；`check-pack.mjs` 用临时 cache 规避，手动跑可 `sudo chown -R 501:20 ~/.npm` |
| 技能装了但 DSH 里没有 | 看是不是只建了项目级链（`scopeProjects`）或 `mode: off`；再跑 `GET /state` 看 `visible` 与 `ledger` 对账 |
| 装好的技能仍显示「未纳入追踪」 | 只读模式下不会对账；否则刷新一次 `GET /state` 即可自动补账。仍不行就看日志里的 `skills.reconcile` |
| 更新提示「本地已改」 | 内容哈希与 lock 不一致（`locally-modified`）；确认后再带 `overwrite` 应用，或先在终端看 `git diff` |
| 设置里的「技能控制台」图标和「通用设置」一样是齿轮 | dsh 的 `settings.section` 只投影 `id` / `order` / `label`，导航图标由 `dsh-client-ui-settings-general` 按 id 从固定映射里取，未知 id 一律回落到齿轮。`client.js` 的 `installSettingsNavIcon` 会在对话框挂载后按本插件分区标题认领那一行、换成自有标记；dsh 支持 `icon` 字段后可删掉这段 |

# 公共 API：给其他插件 / 脚本复用技能安装与更新

`@morehao/dsh-skills-console` 暴露一个稳定的、可 `import` 的公共 API，让其他 dsh 插件（例如
`@morehao/dsh-commands`）或普通 Node 脚本复用「安装 / 更新 / 检查 / 列出」技能的能力，
**不要求启用技能控制台插件**，也不走 HTTP。

- 子路径：`@morehao/dsh-skills-console/api`（`package.json` 的 `exports["./api"]`）。
- 硬版本：`API_VERSION = 1`。
- 深路径（`dist/core/*`、`dist/contract/*`）不是契约，随时可改。

```js
import { API_VERSION, SkillsConsoleError, createSkillsConsole } from '@morehao/dsh-skills-console/api';

const api = createSkillsConsole();          // 命中插件实例，或创建 headless 实例
if (api.apiVersion !== 1) throw new Error('技能控制台版本不兼容');

const installed = await api.list({ names: ['git-kit', 'handoff', 'disk-cleanup'] });
const missing = ['git-kit', 'handoff', 'disk-cleanup'].filter(
  (name) => !installed.some((item) => item.name === name),
);
if (missing.length > 0) {
  await api.install({ source: 'morehao/agent-skills', skills: missing });
}
```

## 单写者：runtime registry

包内部维护一个进程级 runtime registry（`Symbol.for('@morehao/dsh-skills-console/runtime')`）。
`createSkillsConsole()` 的解析顺序：

1. 按当前 `env` 算出候选 `state.json`，registry 里**精确匹配**：`apiVersion` 兼容 → 复用插件
   的 PublicApi；不兼容 → 抛 `incompatible-runtime`（不回退 headless）。
2. 没有精确匹配、没显式指定 `home`/`dshHome`/`stateDir`，且 registry 里**只有一个**实例
   （插件配了自定义 `stateDir` 的常见情况）→ 跟随插件，记一条 `api.runtime.stateDir-override` 日志。
3. 没有精确匹配、显式指定了路径（测试 / 独立实例）→ 创建 headless。
4. registry 为空 → 创建 headless。
5. 多个实例且无法唯一确定 → 抛 `ambiguous-runtime`，绝不创建第二个写者。

所以「两个插件都装」时只有 console 插件那一个 `StateStore` 在写；「只装 commands」时
commands 的 headless 实例是唯一写者，之后装上 console 会从同一份 state 接管。

`createSkillsConsole()` **不负责登记**，只有插件 `apply()` 会登记；因此包在未被启用时是惰性的：
`import '@morehao/dsh-skills-console/api'` 不创建 `StateStore`、不写 state、不读技能目录。

## 工厂

```ts
interface SkillsConsoleOptions {
  env?: NodeJS.ProcessEnv;       // 默认 process.env；测试可注入合成 HOME / DSH_HOME
  paths?: { home?; dshHome?; stateDir?; cacheDir? }; // 显式覆盖路径（测试用）
  fetch?: typeof fetch;          // 默认 global fetch；测试注入 stub
  logger?: (event, detail?) => void; // 默认写 console 自己的 JSONL；传 () => {} 静默
  installer?: unknown;           // 测试替身；生产不要传
}
function createSkillsConsole(options?: SkillsConsoleOptions): SkillsConsoleApi;
```

工厂是同步的：命中 registry 直接返回插件实例；否则创建 paths / logger / StateStore，
`load()` 后 `reloadState()` 一次（做 state 文件侧迁移与旧哈希重基线），**不**在构造时跑
`reconcileInvocations`（那会改 `SKILL.md`）。

## 方法

| 方法 | 说明 |
| --- | --- |
| `list(input?: { names?: string[] })` | 只读列出已纳管技能；`mode` 归一为 `auto` / `manual` / `hidden` / `off`；`store.readOnly` 时抛 `read-only`。 |
| `adopt(input: { name })` | 把 canonical 里已存在、账本没有的技能补记账（不碰文件）；有 lock 来源时顺带建订阅；`already` / `not-found`。 |
| `install(input)` | 确保订阅、按需刷新、调用 native installer。`skills` 必填非空；`targets` 默认 `[]`（不建任何导出链，显式 `[]` 不会被当成「未传」）。失败抛 `SkillsConsoleError`。 |
| `check(input?)` | 包装上游检查，只覆盖有订阅的记录；网络失败按 `unknown` 返回不抛。 |
| `update(input?)` | 逐技能 plan → apply；单技能失败不抛，返回逐项 `status`。 |

### 返回形状

```ts
interface InstalledSkill { name; mode: 'auto'|'manual'|'hidden'|'off'; commit; treeSha; installedAt; updatedAt; subscriptionId }
interface AdoptResult { name; already: boolean; subscriptionId: string|null; tracked: boolean }
interface InstallResult { ok: true; source; subscriptionId; commit; installed: { name; treeSha }[]; warnings: { name; warning }[] }
interface CheckResult { ok: boolean; checks: { name; status; detail; checkedAt }[] }
interface UpdateResult { ok: boolean; results: { name; status; fromCommit; toCommit; code?; message? }[] }
// UpdateStatus = updated | current | locally-modified | parked | not-managed | no-subscription | failed
```

`update` 的 `overwrite` 由调用方在用户二次确认后传 `true`；`locally-modified` 表示磁盘有改动、
未覆盖。`parked` 表示技能处于完全停用（`SKILL.md.disabled`），`apply` 拒绝写回，应先在控制台恢复。

## 错误契约

`SkillsConsoleError extends Error`，字段 `code` / `detail`。**跨副本不要用 `instanceof`**，
只判 `error.code` 与 `error.detail`。

| code | 触发 |
| --- | --- |
| `invalid-input` | 参数缺失 / 类型不对 / `skills` 为空 |
| `bad-source` | 不是 `owner/repo` 或 GitHub URL |
| `read-only` | state 损坏 / 版本未知 / 写入被拒（`detail.problem`） |
| `upstream-failed` | 探测 / 下载 / 限流兜底失败 |
| `install-failed` | installer 失败并已回滚 |
| `not-managed` / `no-subscription` | 更新一个没有安装记录 / 没有订阅的技能 |
| `not-found` | `adopt` 的目标不在 canonical |
| `parked` | 目标技能完全停用，install / update 拒绝写回 |
| `incompatible-runtime` | 命中进程内 console runtime，但 `apiVersion` 不兼容 |
| `ambiguous-runtime` | 进程内多个 console runtime、当前路径又无法唯一匹配 |
| `internal` | 未预期异常（`detail.serviceCode` 保留原始 `error.skills.*` 码） |

## cordis 服务（可选）

插件 `apply()` 会把同一套 PublicApi 登记进 registry，并（无同名服务冲突时）通过
`ctx.provide('skillsConsole', api)` 暴露给其他 cordis 插件。**`@morehao/dsh-commands` 不使用
`ctx.get('skillsConsole')`**——它只 import 包、调用 `createSkillsConsole()`，这样 console 插件
装不装、启不启用都一样工作。服务只是给其他 cordis 插件的便利入口。

## 版本与兼容

- `apiVersion` 是硬版本：破坏性变更加 1；新增方法 / 字段走 minor。
- registry 可能返回同 `apiVersion` 但较早 minor 的实例；对非核心方法做 `typeof api.xxx === 'function'`
  检测。v1 核心 `list` / `install` / `update` 必定存在。
- 0.7.0 之前的版本没有 registry / 服务：消费方应先用 profile 顶层版本守卫（版本 < 0.7.0 且
  bundle 启用 → 提示升级、不要创建第二个写者）。

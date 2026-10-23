# 验证与发布（Agent）

> 读这篇的时机：提交前、改 CI / 脚本、改 `package.json` / `exports` / `files`、打包、发版。
> 人类向完整流程见 [发布流程](../publishing.md)；这里只给 agent 的检查矩阵与门禁。

## 1. 提交前验证矩阵

| 改动 | 必跑 | 说明 |
|---|---|---|
| `lib/core/*` | `npm run check` + `npm test` | 48 个离线用例覆盖 hash / state / agents / links / cli / paths / updates / service |
| `lib/routes.js` | 同上 + 手工打一次接口 | 路由无单测，改 `matchRoute` 后按 §2 的 curl 自测 |
| `client/**` | `npm run build:client` + `npm run check` + `npm test` | 源码是唯一事实来源；改完必须重建并一起提交。`test/client.test.mjs` 用 React 存根跑「渲染 → effect → 再渲染」，能抓未定义变量与字段名错，但**不替代真浏览器** |
| 根 `client.js` | `npm run check:client` | 生成物：不要手改；改 `client/**` 后重建 |
| `package.json` / `exports` / `files` / 命名 | `node scripts/check-naming.mjs` + `node scripts/check-pack.mjs` | CI 也跑；`exports` 缺 `./client`、`files` 缺 `client.js` 会导致「能装、页面白屏」 |
| `scripts/*.mjs` | `node --check <file>` + 对应冒烟 | `release-notes` 有自己的冒烟 |
| CI / release workflow | 本地跑对应脚本 + `bash -n scripts/ci-publish.sh` | 不要只改 YAML 不验证 |
| 纯文档 | 链接与事实核对 | 不跑代码检查 |

## 2. 接口自测（改路由时）

Host 侧路由要带自定义头，否则 403：

```bash
# 需要 dsh web 在跑（或自己起一个带 webServer 服务的最小宿主）
curl -s -H 'x-dsh-skills-console: 1' 'http://127.0.0.1:<port>/api/morehao/skills-console/state?cwd=' | jq '.readOnly, (.ledger|keys)'
curl -s -H 'x-dsh-skills-console: 1' -X POST 'http://127.0.0.1:<port>/api/morehao/skills-console/updates/check' -d '{}' | jq
```

无头请求应返回 `403 error.skills.forbidden`；错误码统一 `error.skills.<code>`，新增错误码时同步 `client.js` 的文案映射。

## 3. CI 实际跑什么（`check.yml`）

PR 与 push `main` 触发，**只装构建期依赖**（esbuild），不跑发布构建、不联网：

1. `npm ci`（`check:client` 需要 esbuild）
2. `bash -n scripts/ci-publish.sh`
3. `npm run check` → `check-syntax.mjs`（lib/、client/、scripts/、test/、client.js 逐文件 `node --check`）→ `check:client`（按 `client/` 重建并与提交的 `client.js` 逐字节比对）→ `check-naming` → `check-pack` → `smoke-release-notes`
4. `npm test` → 95 个 `node:test` 用例（临时 HOME / DSH_HOME + stub CLI）

注意：

- 需要真实 `skills` CLI 或 GitHub 的动作（`npm run sync:agents`、真实安装/更新）**不在 CI**，本地跑并如实说明。
- `check-pack` 用临时 `npm_config_cache`；本机手动 `npm pack` 若报 `EPERM ~/.npm/_cacache`，是 `~/.npm` 里有 root 属主文件，不是包的问题。
- workflow 用 `actions/checkout@v7` + `actions/setup-node@v7`，且**不设 `registry-url`**（v7 移除了 dummy `NODE_AUTH_TOKEN` 兜底，registry 由 `ci-publish.sh` 显式 `--registry` 指定），并显式 `package-manager-cache: false`。改这两处前先读 [发布流程 §7](../publishing.md)。
- `runs-on` 写**显式版本** `ubuntu-24.04`，不用 `ubuntu-latest`：`ubuntu-latest` 自 2026-10-19 起分批迁到 26.04（11-19 完成），校验与发布结果不该随镜像漂移。要试新镜像就单独改成 `ubuntu-26.04` 跑一轮再切；`check` job 另有 `permissions: contents: read`（只读校验）。

## 4. 打包与命名

- 白名单校验（[check-pack.mjs](../../scripts/check-pack.mjs)）允许：`package.json`、`README.md`、`LICENSE`、`cordis.patch.yml`、`icon.svg`、`client.js`、`lib/`、`locale/`；必备文件少一个就红。
- 不允许：`.dsh/`、`docs/`、`scripts/`、`test/`、`client/`、`node_modules`、`*.tgz`。`client/` 是源码目录，npm 只发根 `client.js`（生成物）。
- 命名与接线（[check-naming.mjs](../../scripts/check-naming.mjs)）：
  - `package.json.name` == `cordis.patch.yml` 的 `insert[0].name`
  - `lib/index.js` 的 `export const name` == `insert[0].id`
  - `publishConfig.access === "public"`
  - `exports` 含 `.`、`./client`、`./locale/*.json`、`./icon`、`./package.json`，且 `./client` → `./client.js`
  - `files` 含 `client.js` 与 `lib`；`dsh.bundle.patch` + `dsh.client` 在位
- `docs/` 与 `.dsh/` **不入包**：README 里指向它们的相对链接在 npm 页面没有对应文件，新增内容时注意。

## 5. 发版清单

> `main` 不直推；升版本也走 PR。优先用 git-kit 的 `/git-release`（它只做 `pr-merge` 之后那段）。

- [ ] 改 `package.json.version`，同步 `README.md` / `docs/`。
- [ ] `npm run check` + `npm test` 本地全绿。
- [ ] 分支 → PR → 合并 `main`。
- [ ] 在合并后 `main` 最新提交上打**注记** tag `vX.Y.Z`（去 `v` == `package.json.version`），正文含变更说明（= Release body）。
- [ ] 推送 tag → `release.yml`：版本校验 → 已发布则跳过（幂等）→ OIDC 发布 → 成功后用注记正文建 Release（已存在跳过）。
- [ ] 发布失败先看 <https://status.npmjs.org>；`ci-publish.sh` 有 3 次退避重试，恢复后 `gh run rerun <run-id>`，**不要删 tag 重打**。
- [ ] 不要设 `NODE_AUTH_TOKEN`（会覆盖 OIDC）；job 需 `id-token: write` + `contents: write`。
- [ ] `release.yml` 的 `name:` 必须是 `release.yml`（匹配 npm Trusted Publisher 的 Workflow 字段）。
- [ ] `gh release create` 必须留在 `release.yml`（git-kit 预检靠 grep 它判定 Release 后效）。
- [ ] tag 推送、npm 发布、Release 创建都要**用户明确确认后**执行。

## 6. 常见失败对照

| 症状 | 先查 |
|---|---|
| `check-pack` 多出文件 | 本地残留 `*.tgz`、`node_modules`，或新增目录未加白名单（`client/` 绝不能进包） |
| `check:client` 报生成物不一致 | 改了 `client/**` 没重建：`npm run build:client` 后把两者一起提交 |
| `npm ci` / `npm run check` 报找不到 `esbuild` | `package-lock.json` 与 `package.json` 不同步，或本地没装构建期依赖 |
| `check-naming` 失败 | 三处命名不一致 / `exports` 缺 `./client` / `files` 缺 `client.js` |
| `npm test` 碰到真实目录 | 用例忘了把 `HOME` / `DSH_HOME` 指到临时目录 |
| OIDC `404` | workflow `name:` 是否等于 `release.yml`；npm registry 是否降级 |
| OIDC `403 permission denied` | Trusted Publisher 的 Allowed actions 是否允许 `npm publish` |
| 发布成功但无 Release | Release 步骤是否被删或被替换；tag 是否为轻量 tag（无正文） |
| Release body 为空或报错 | `node scripts/release-notes.mjs <tag>` 本地复现 |
| npm 上版本已存在 | 正常幂等跳过；不要改 tag 重发同版本 |

## 7. 相关文档

- [发布流程](../publishing.md)
- [开发与测试](../development.md)
- [README](../../README.md)

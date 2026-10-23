# npm 发包流程（`@morehao/dsh-skills-manager`，OIDC / Trusted Publishing）

> 本仓把「tag → 自动发布 → 自动建 Release」这一套与 [`morehao/dsh-commands`](https://github.com/morehao/dsh-commands) 对齐：
> **打注记 tag + OIDC 免长效 token**，npm 与 GitHub Release 都只由 CI 写。文末是排障速查。
>
> 过程性文档（specs / plans / notes / 原型）在 `.dsh/` 下，已 gitignore，不进版本库也不进包。

## 1. 总览

- **发布包**：`@morehao/dsh-skills-manager`（**本仓根即包根**：根 `package.json` 就是包清单，无 workspace、无子包）。
- **发布模型**：打 `vX.Y.Z` 注记 tag → GitHub Actions OIDC（Trusted Publishing）发布 → 用注记正文建 GitHub Release。
- **零 runtime 依赖**：不 `npm install` 任何东西也能跑（`skills` CLI 由宿主环境提供，四层探测 + `npx` 兜底）。
- **范围**：全仓仅此一个包；`.dsh/`、`docs/`、`scripts/`、`test/` 一律不入包。

| 文件 | 作用 |
|---|---|
| `.github/workflows/check.yml` | PR / push `main`：`bash -n scripts/ci-publish.sh` + `npm run check` + `npm test` |
| `.github/workflows/release.yml` | `on: push: tags: ['v*']`；`id-token: write` + `contents: write`；跑 `bash ./scripts/ci-publish.sh`，成功后建 Release |
| `scripts/ci-publish.sh` | 读 `RELEASE_TAG` → 校验 tag 版本 == `package.json.version` → 已发布则跳过 → OIDC 发布（3 次退避重试） |
| `scripts/release-notes.mjs` | 从注记 tag 原样投影 Release body（不重算、不改写） |
| `scripts/check-naming.mjs` | 三处命名 + `publishConfig.access` + `exports`/`files` 接线 |
| `scripts/check-pack.mjs` | `npm pack --dry-run` 白名单与必备文件 |

## 2. 首次建包（一次性，只在包不存在时做）

> 前置：npm 账号 `morehao` 可用、`@morehao` scope 已存在（`curl -s https://registry.npmjs.org/-/org/morehao/package` 返回 200）。

1. **先让包「存在」**（Trusted Publisher 要求包已存在才能配置）：

   ```bash
   # 账号开了「发布需 2FA」时，必须用带 bypass-2FA 的 granular token（classic npm_ token 绕不过 2FA）
   read -s NPM_TOKEN && export NPM_TOKEN
   npx --yes setup-npm-trusted-publish @morehao/dsh-skills-manager --registry https://registry.npmjs.org
   ```

   会发一个 `0.0.0` 占位包；正式版发布后 `latest` 被覆盖。用完立即撤销该 token。

2. **配置 Trusted Publisher**：<https://www.npmjs.com/package/@morehao/dsh-skills-manager/access>

   | 字段 | 值 |
   |---|---|
   | Provider | GitHub Actions |
   | Owner | `morehao` |
   | Repository | `dsh-skills-manager` |
   | **Workflow** | **`release.yml`**（文件名；workflow 的 `name:` 也必须等于 `release.yml`，否则 OIDC claim 对不上） |
   | Environment | 留空 |
   | **Allowed actions** | **必须允许 `npm publish` 直接发布**（2026-09-03 后新建默认只允许 `npm stage publish`） |

3. **清理**：GitHub 侧不需要 `NPM_TOKEN` secret（OIDC 免 token）。

## 3. 日常发新版

> **`main` 不直推；升版本也走分支 + PR。** 建议用 git-kit 的 `/git-release`：它只做 `pr-merge` 之后那段
> （只读预检 → 计划卡 → 打注记 tag → 校验 Release → 回执），本仓的后效是「`release.yml` + npm + CI 建 Release」。

1. **升版本**：改 `package.json.version`（如 `0.1.0` → `0.2.0`），按影响面同步 `README.md` / `docs/`；
   在分支上提交 → PR → 合并到 `main`。
2. **打注记 tag**（合并后的 `main` 最新提交上；去掉 `v` 必须等于 `package.json.version`）：

   ```bash
   git switch main && git pull --ff-only origin main
   git tag -a v0.2.0 -m "release: v0.2.0
   <中文摘要层 + 折叠的原文层；这段正文就是 Release body>"
   git push origin v0.2.0
   ```

   > 轻量 tag（`git tag v0.2.0` 不带 `-a`）没有正文，`release-notes.mjs` 会拒绝投影，Release 步骤失败。

3. **CI 自动完成**：校验版本一致 → npm 已存在则跳过（幂等）→ `npm publish --provenance --access public`；
   成功后用注记正文建 Release（已存在则跳过）。顺序是「先有包、再有 Release」，发布失败不会留下悬挂 Release。
4. **回执核对**：`gh run watch` / `gh release view v0.2.0` / `npm view @morehao/dsh-skills-manager@0.2.0 version`。

## 4. DSH 侧安装方式（发布后）

```bash
# 在 Harness 里
plugin_manager install_bundle(target = '@morehao/dsh-skills-manager@latest')
# 或本地开发：target = 本仓库绝对路径（link 源码即时生效，npm 版是拷贝）
```

## 5. 排障速查

| 症状 | 根因 | 解决 |
|---|---|---|
| OIDC `404 Not found` | workflow 名对不上：npm 表单要文件名 `release.yml`，OIDC claim 取 workflow 的 `name:` | 把 `name:` 写成 `release.yml` |
| OIDC `404 Not found`（名字已对） | npm registry 降级（`Package publishing` 非 operational）时 PUT 直接 404，与权限问题同形 | 查 <https://status.npmjs.org>；`ci-publish.sh` 已重试 3 次，恢复后 `gh run rerun <run-id>`，**不要删 tag 重打** |
| OIDC `403 permission denied for this action` | Allowed actions 只允许 stage | 勾选**允许 `npm publish`**（无视 “Not recommended”） |
| OIDC `401/403` | job 缺 `id-token: write`，或设了 `NODE_AUTH_TOKEN`（会覆盖 OIDC） | 加 `id-token: write`；删掉 `NODE_AUTH_TOKEN` |
| `403 Two-factor … bypass 2fa` | 建包用了 classic `npm_` token | 换**带 bypass-2FA 的 granular token** |
| `npm login` / publish 弹 CNPM、npmmirror | 全局 `~/.npmrc` 的 registry 是 npmmirror | 一律显式 `--registry https://registry.npmjs.org` |
| publish 绿色但没发出去 | `@actions/exec` 不做 shell 解析，`a && b` 只跑 `a` | 用**单一命令** `bash ./scripts/ci-publish.sh` |
| 发布成功但没有 Release | 注记 tag 无正文 / tag 是轻量 tag | 本地 `node scripts/release-notes.mjs vX.Y.Z` 复现，补注记 tag 后重跑该 run |
| `check-pack` 报非白名单文件 | 本地残留 `*.tgz`、`node_modules`、新目录未加白名单 | 清残留或更新 `files` + `scripts/check-pack.mjs` |
| `npm view` 还是旧版本 | npm 读端点 CDN 缓存 1–2 分钟 | 看**单版本端点** `.../dsh-skills-manager/0.2.0`，稍等再确认 |
| `npm pack` 本机报 `EPERM ~/.npm/_cacache` | `~/.npm` 里有 root 属主文件 | `check-pack.mjs` 用临时 `npm_config_cache`；手动跑可 `sudo chown -R 501:20 ~/.npm` |

## 6. 发版清单（贴 PR / Release 说明用）

- [ ] `package.json.version` 已升，README / docs 与该版本一致。
- [ ] `npm run check` + `npm test` 本地全绿。
- [ ] 分支 → PR → 合并 `main`（`main` 上没有直接提交）。
- [ ] `main` 最新提交上打**注记** tag `vX.Y.Z`，正文含变更说明（= Release body）。
- [ ] 推送 tag 前确认（不可撤销）；推送后看 `release.yml` 结果。
- [ ] npm 上 `X.Y.Z` 可见，GitHub Release 正文与注记一致。

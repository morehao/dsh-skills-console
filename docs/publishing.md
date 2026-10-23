# npm 发包流程（`@morehao/dsh-skills-manager`，OIDC / Trusted Publishing）

> 这份文档的目的是「下次发版不用再想」。核心只有一条：**打注记 tag → CI 用 OIDC 发 npm → 成功后用 tag 正文建 GitHub Release**，全程不需要任何长效 token。
> 首次建包的一次性配置见 §3（已在本仓完成，2026-10-23），日常发版看 §4，出问题先看 §6。

## 1. 三条速查

| 我要做什么 | 跳到 |
|---|---|
| 发个新版本（99% 的情况） | §4（升版本 → PR → 注记 tag → 看 CI） |
| 换机器 / 包还没在 npm 上存在 | §3（一次性：建包 + 配 Trusted Publisher） |
| 发失败了 / npm 上看不到新版本 | §6（排障表） |

## 2. 链路总览

```
改版本号 → 分支 → PR → 合并 main
                            │
                            └─ 打注记 tag vX.Y.Z（正文＝变更说明）并推送
                                   │
                                   ├─ .github/workflows/release.yml
                                   │    ├─ 校验 tag 版本 == package.json.version（不等即拒发）
                                   │    ├─ npm 上该版本已存在则跳过（幂等）
                                   │    ├─ OIDC 换短时令牌 → npm publish --provenance --access public
                                   │    └─ 发布成功后 → 用 tag 注记正文建 GitHub Release（已存在则跳过）
                                   │
                                   └─ 产物：npm 包（带 SLSA provenance）+ GitHub Release + Actions run
```

| 环节 | 由谁做 | 产物 / 证据 |
|---|---|---|
| 版本号 | 人（走 PR） | `package.json.version`，tag 去 `v` 后必须等于它 |
| tag | 人（打 + 推） | 注记 tag（`-a`），正文＝Release body 的唯一真源 |
| 发布 | `.github/workflows/release.yml` + `scripts/ci-publish.sh` | npm 包 + provenance |
| Release | 同一 job（`gh release create` 必须留在 workflow 里） | GitHub Release |
| 凭据 | npm Trusted Publisher（OIDC） | `_npmUser: GitHub Actions` / `trustedPublisher` |

CI 侧前置校验由 `check.yml` 负责（PR / push main）：`bash -n scripts/ci-publish.sh` + `npm run check` + `npm test`。

## 3. 一次性：让包「存在」并配好 Trusted Publisher

> Trusted Publisher 要求**包已在 npm 上存在**才能配置，而建包这一步还没有 OIDC 可用——所以需要一次人工凭据，发完就撤。

### 3.1 建包（二选一，推荐 A）

**A. 交互登录（本仓实际走的这条，最稳）**

```bash
# 先清掉 ~/.npmrc 里可能已失效的 npmjs token，否则失败时报的是误导性的 404
npm config delete //registry.npmjs.org/:_authToken

npm login --registry https://registry.npmjs.org      # 开浏览器授权
mkdir -p /tmp/placeholder && printf '{"name":"@morehao/dsh-skills-manager","version":"0.0.0","description":"placeholder for OIDC trusted publishing","license":"MIT"}' > /tmp/placeholder/package.json
cd /tmp/placeholder && npm publish --registry https://registry.npmjs.org --access public   # 会要 6 位 OTP
cd ~ && npm logout --registry https://registry.npmjs.org && npm config get //registry.npmjs.org/:_authToken   # 期望 undefined
```

**B. 一次性 granular token（npm 正在收紧这类 token，见 §6）**

```bash
read -s NPM_TOKEN && export NPM_TOKEN
npx --yes setup-npm-trusted-publish @morehao/dsh-skills-manager --registry https://registry.npmjs.org
# 关键判据：输出里必须有「🔑 Using NPM_TOKEN for authentication」
unset NPM_TOKEN    # 用完去 npm 页面删掉该 token
```

两种方式都只发一个 `0.0.0` 占位包：它临时占住 `dist-tags.latest`，正式版发布后即被覆盖。**不要**把仓库源码发上去（占位包只有 `package.json` + 一行 README）。

### 3.2 配置 Trusted Publisher

打开 <https://www.npmjs.com/package/@morehao/dsh-skills-manager/access>：

| 字段 | 值 | 备注 |
|---|---|---|
| Provider | GitHub Actions | |
| Owner | `morehao` | |
| Repository | `dsh-skills-manager` | 换仓/改名必须同步改这里，否则 OIDC 被拒 |
| Workflow filename | `release.yml` | **必须是文件名**；且 workflow 的 `name:` 也写成 `release.yml`，两边才精确匹配 |
| Environment | 留空 | 用了 environment 才填 |
| Allowed actions | **勾上 `npm publish`** | 默认只允许 `npm stage publish`，不勾会 `403 permission denied` |

### 3.3 一次性核对清单

- [ ] `curl -s -o /dev/null -w '%{http_code}' https://registry.npmjs.org/@morehao%2Fdsh-skills-manager/0.0.0` → `200`
- [ ] `curl -s https://registry.npmjs.org/-/package/@morehao/dsh-skills-manager/dist-tags` → 有输出
- [ ] `~/.npmrc` 已无 `_authToken`（`npm logout`）
- [ ] npm Access 页面能看到 trusted publisher 记录，Allowed actions 含 `npm publish`
- [ ] GitHub 仓库没有残留 `NPM_TOKEN` secret（OIDC 不需要）

## 4. 日常发新版

> **`main` 不直推，升版本也走分支 + PR。** 推荐用 git-kit 的 `/git-release`：它只做 `pr-merge` 之后那段（只读预检 → 计划卡 → 打注记 tag → 校验 Release → 跟踪后效 → 回执）。

1. **升版本**：改 `package.json.version`（如 `0.1.0` → `0.2.0`），按影响面同步 `README.md` / `docs/`；分支 → PR → 合并 `main`。
2. **打注记 tag**（在合并后的 `main` 最新提交上）：

   ```bash
   git fetch origin --tags
   NOTES=$(mktemp); cat > "$NOTES" <<'EOF'
   release: v0.2.0

   ## 本次发布

   <一句概述>

   ### 新增
   - ...

   <details><summary>原始变更记录（自动生成，未改写）</summary>

   ### Features
   - ...（changelog.sh 原样输出）
   </details>
   EOF
   git tag -a --cleanup=verbatim v0.2.0 -F "$NOTES" origin/main
   git push origin v0.2.0
   ```

   **两个不可省的点**：
   - `--cleanup=verbatim`：否则 git 按 `strip` 清理，`## 本次发布` / `### 新增` 这类 `#` 开头的行会被当注释整行删掉。
   - 必须是**注记** tag（`-a`）：轻量 tag 没有正文，`release-notes.mjs` 会拒绝投影，Release 步骤失败。

   原文层用 `bash ~/.agents/skills/git-kit/scripts/changelog.sh --all --to origin/main --link-to v0.2.0` 生成；摘要层自己写（中文、面向用户、每条能对上原文层至少一条 commit、每组 ≤5 条、原文层折叠保留）。
3. **CI 自动完成**：校验版本 → 幂等跳过或 OIDC 发布 → 成功后建 Release。
4. **验证**（见 §5）。**不要**为一次失败删 tag 重打：`ci-publish.sh` 已内置 3 次退避重试，registry 恢复后 `gh run rerun <run-id>` 即可；幂等保证重跑不会重复发布。

## 5. 发布后验证（照抄即可）

```bash
# 1) 版本是否真的上线（单版本端点最准）
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@morehao%2Fdsh-skills-manager/0.2.0   # 期望 200
curl -s https://registry.npmjs.org/-/package/@morehao/dsh-skills-manager/dist-tags                     # 期望 {"latest":"0.2.0"}

# 2) 产物元信息（fileCount 应与本地 check-pack 数目一致；attestations 存在说明是 OIDC 发的）
curl -s https://registry.npmjs.org/@morehao/dsh-skills-manager/0.2.0 \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.dist.fileCount,'files',j.dist.unpackedSize,'bytes',JSON.stringify(j._npmUser),Object.keys(j.dist.attestations||{}))})"

# 3) Release 正文是否与注记一致
gh release view v0.2.0 --json tagName,body --jq '{tag:.tagName,len:(.body|length)}'
git for-each-ref --format='%(contents)' refs/tags/v0.2.0 | tail -n +2 | head -5

# 4) 每一步的结论（日志下载受限时用这个）
gh api repos/morehao/dsh-skills-manager/actions/runs/<run-id>/jobs \
  --jq '.jobs[].steps[] | {name, conclusion}'
```

## 6. 排障速查

| 症状 | 根因 | 解决 |
|---|---|---|
| **`404 Not Found` - PUT**（首次建包时） | ① 没带凭据；② 带的是失效 token；③ token 对 scope 无写权限。npm 对「不存在的 scoped 包」三种都回 404，不区分 | 先 `npm whoami --registry https://registry.npmjs.org`；不通就 `npm login` 或换新 token；确认 token 有 `@morehao` 读写权限 |
| 工具没打印 `🔑 Using NPM_TOKEN` | `NPM_TOKEN` 没进子进程环境（多行粘贴被 `read` 吃掉、换了 shell、`read` 读到空） | 读入与发布写进同一条命令；或改用 §3.1 的 A 方案（`npm login`） |
| `401 Unauthorized` | `~/.npmrc` 里残留失效 token，或 token 过期 | `npm config delete //registry.npmjs.org/:_authToken`，重新 login / 换 token |
| `403 ... bypass 2fa` / 提示 bypass-2FA 正在受限 | 账号发布需 2FA 而 token 没勾 bypass；npm 也在收紧 bypass-2FA token 的直接发布 | 优先走 `npm login` + OTP；CI 侧不受影响（走 OIDC） |
| `403 permission denied for this action` | Trusted Publisher 的 Allowed actions 只允许 stage | 勾上**允许 `npm publish`**（无视 “Not recommended”） |
| OIDC `404 Not found`（配置看似无误） | ① workflow `name:` 与 npm 里填的文件名不一致；② Owner/Repo 与实际仓库不符；③ registry 降级（PUT 直接 404） | 对齐 `name: release.yml`；核对仓库名；查 <https://status.npmjs.org> |
| `publish` 绿色但没发出去 | `@actions/exec` 不做 shell 解析，`a && b` 只执行 `a` | 用**单一命令** `bash ./scripts/ci-publish.sh` |
| 发布成功但 `npm view` 还是旧的 | 读端点 CDN 缓存（1–2 分钟，偶尔完整 packument 直接 404） | 看**单版本端点** `.../dsh-skills-manager/0.2.0` 与 `/-/package/<name>/dist-tags` |
| 发布成功但没有 Release | 注记 tag 没正文（轻量 tag / 只有首行） | 本地 `node scripts/release-notes.mjs vX.Y.Z` 复现；补注记后重跑该 run |
| `npm pack` 本机报 `EPERM ~/.npm/_cacache` | `~/.npm` 里有 root 属主文件 | `check-pack.mjs` 已用临时 cache 规避；手动跑可 `sudo chown -R 501:20 ~/.npm` |
| 本地 `npm login` 弹 CNPM/npmmirror | 全局 `~/.npmrc` 的 registry 是 npmmirror | 所有 npm 命令显式 `--registry https://registry.npmjs.org` |

## 7. 本仓的 CI 约定（改 workflow 前先看）

- **actions 版本**：`actions/checkout@v7` + `actions/setup-node@v7`。
  - setup-node v7 **移除了 dummy `NODE_AUTH_TOKEN` 的兜底**：设了 `registry-url` 却不给 token 时，老 npm / Yarn Classic / pnpm 可能报错。本仓因此**不设 `registry-url`**，registry 由 `scripts/ci-publish.sh` 里显式 `--registry` 指定。
  - v5 起会按 `packageManager` 字段自动开依赖缓存；本包零依赖，显式 `package-manager-cache: false`（发布 job 更必须，避免缓存投毒波及 OIDC 令牌）。
  - checkout v6 起把凭据写到独立文件、v7 起转 ESM 并阻止 `pull_request_target` / `workflow_run` 下检 fork PR；本仓用 `push: tags` + `pull_request`，不受影响。
- **OIDC 前置**：发布 job 需要 `permissions: id-token: write`；**不要**设 `NODE_AUTH_TOKEN`（会盖掉 OIDC）。
- **npm 版本**：OIDC 发布要求 npm ≥ 11.5.1；Node 22 自带 npm 10.x，所以 release job 有一步 `npm install -g npm@latest`。
- **`gh release create` 必须留在 `release.yml`**：git-kit 的 `/git-release` 预检靠 grep workflow 判定 `EFFECT_RELEASE=workflow`，挪进 `scripts/` 会让它误判成「流程自己建 Release」。
- **不要给发布 job 加依赖安装 / 构建步骤**：本包无构建、无依赖，多一步就多一个失外面。

## 8. 相关文件

| 文件 | 作用 |
|---|---|
| `.github/workflows/check.yml` | PR / push `main`：发布脚本语法 + 机械校验 + 单测 |
| `.github/workflows/release.yml` | tag `v*` → OIDC 发布 → 建 Release |
| `scripts/ci-publish.sh` | 版本一致性守卫、幂等跳过、`npm publish --provenance`（3 次退避重试） |
| `scripts/release-notes.mjs` | 注记 tag → Release body 投影（不重算、不改写） |
| `scripts/check-naming.mjs` · `scripts/check-pack.mjs` | 命名与 `exports`/`files` 接线、打包白名单 |
| `package.json` | `version`、`publishConfig.access`、`files` 白名单、`dsh.bundle` / `dsh.client` |
| `cordis.patch.yml` | 插件注册 patch（`id` / `name` 与包名、`export const name` 三处一致） |
| `AGENTS.md` · `docs/agents/verification-release.md` | agent 侧硬约束与提交前检查矩阵 |

## 9. 本仓 `v0.1.0` 实录（2026-10-23，作为参照）

| 步骤 | 动作 | 结果 |
|---|---|---|
| 1 | `setup-npm-trusted-publish`（token 路线） | ❌ `404 PUT`：token 没进子进程（输出缺 `🔑`），回落到 `~/.npmrc` 里的失效 token |
| 2 | `npm login --registry https://registry.npmjs.org` + 手发占位包 | ✅ `@morehao/dsh-skills-manager@0.0.0` |
| 3 | 配 Trusted Publisher（Owner / Repo / `release.yml` / 允许 `npm publish`） | ✅ |
| 4 | `npm logout` 清凭据 | ✅ `~/.npmrc` 无 `_authToken` |
| 5 | 打注记 tag `v0.1.0` 并推送（正文＝摘要层 + 折叠原文层） | ✅ `TAG_PUSH_OK` |
| 6 | `release.yml` run `39926359691` | ✅ 18s，Publish + Create Release 均 success |
| 7 | 验证 | `dist-tags.latest=0.1.0`、22 files / 145,878 bytes、SLSA provenance、`_npmUser: GitHub Actions` |

Release：<https://github.com/morehao/dsh-skills-manager/releases/tag/v0.1.0>

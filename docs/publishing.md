# npm 发包完整流程（`@morehao/dsh-skills-console`）

> **一句话**：升版本走 PR → 合并后在 `main` 上打**注记** tag → CI 用 OIDC（Trusted Publishing）发布到 npm → 用 tag 注记正文建 GitHub Release。全链路**不需要任何长效 npm token**，也不在本地跑 `npm publish` 发正式版。
>
> 阅读顺序：日常发版只看 §4；换机器 / 换包名看 §3；发失败了看 §6；改 workflow 前看 §7。

## 0. 名词与前提

| 名词 | 含义 |
|---|---|
| 注记 tag（annotated tag） | `git tag -a`，自带正文。Release body 的**唯一真源**；轻量 tag 没有正文，会被 `scripts/release-notes.mjs` 拒绝 |
| Trusted Publisher（TP） | npm 侧的 OIDC 信任关系：GitHub Actions 的 `release.yml` 可代表本包发布，无需 token |
| provenance | npm 发布时附带的构建来源证明（SLSA），由 OIDC 自动生成；`dist.attestations` 存在即说明是 CI 发的 |
| staging / `*-stage` | npm 的「暂存发布」（staged publishing）：需要 2FA 的手工发布先落一个 `<version>-stage`，网页授权后再转正。正常现象，不影响 `latest` |

**前提**：Node `^22.20.0 || >=24.0.0`（与 `package.json` 的 `engines` 一致）、`gh` 已登录（发布后验证与排障用；CI 建 Release 走 `GITHUB_TOKEN`）、本机 `~/.npmrc` 的 registry 是 npmmirror（**所有 npm 命令都要显式 `--registry https://registry.npmjs.org`**，否则读写都打到镜像）。

## 1. 速查

| 我要做什么 | 跳到 |
|---|---|
| 发个新版本（99% 的情况） | §4（升版本 → PR → 注记 tag → 看 CI） |
| 首次发布（新包名）/ 换机器 | §3（一次性：建包 + 配 TP） |
| 发布成功了但 npm 上看不到 | §5 + §6（先等几分钟，看单版本端点；packument 更慢） |
| 改 workflow / 发布脚本 | §7（先读约束） |

## 2. 链路总览

```
改版本号 → 分支 → PR → 合并 main
                            │
                            └─ 打注记 tag vX.Y.Z（正文＝变更说明）并推送
                                   │
                                   ├─ .github/workflows/release.yml（name 必须等于文件名）
                                   │    ├─ 校验 tag 版本 == package.json.version（不等即拒发）
                                   │    ├─ npm 上该版本已存在则跳过（幂等）
                                   │    ├─ OIDC 换短时令牌 → npm publish --provenance --access public
                                   │    └─ 发布成功后 → 用 tag 注记正文建 GitHub Release（已存在则跳过）
                                   │
                                   └─ 产物：npm 包（带 provenance）+ GitHub Release + Actions run
```

| 环节 | 由谁做 | 产物 / 证据 |
|---|---|---|
| 版本号 | 人（走 PR，`main` 不直推） | `package.json.version`；tag 去掉 `v` 必须等于它 |
| tag | 人（打 + 推） | 注记 tag，正文＝Release body |
| 发布 | `release.yml` + `scripts/ci-publish.sh` | npm 包 + provenance；失败最多重试到 3 次（第 n 次失败后等 n×30s，且每次先回读 registry） |
| Release | 同一 job 的 `gh release create`（**必须留在 workflow 里**） | GitHub Release |
| 凭据 | npm Trusted Publisher（OIDC） | 版本元信息里 `_npmUser: GitHub Actions` + `trustedPublisher.id` |
| PR 门禁 | `.github/workflows/check.yml` | `bash -n scripts/ci-publish.sh` + `npm run check` + `npm test` |

## 3. 一次性基建：让包「存在」并配好 Trusted Publisher

> TP 只能配在**已存在**的包上，而「建包」这一步还没有 OIDC 可用，所以必须借一次人工凭据（登录 + 2FA），发完就退出登录。
> **只在以下情况需要再做**：包名变了、换了 npm 账号/scope、或包被下架后重新建。日常发版不需要。

### 3.1 登录 + 发布占位包（建包）

```bash
# 0) 先确认没有失效 token 混在里面（带失效 token 时，npm 会回误导性的 404）
npm whoami --registry https://registry.npmjs.org        # 期望输出 morehao；报 ENEEDAUTH 就先 login

# 1) 网页授权登录（浏览器点一下即可）
npm login --registry https://registry.npmjs.org

# 2) 发一个 0.0.0 占位包：只占名字，不含仓库源码
mkdir -p /tmp/placeholder
printf '{"name":"@morehao/dsh-skills-console","version":"0.0.0","description":"placeholder for OIDC trusted publishing","license":"MIT"}' \
  > /tmp/placeholder/package.json
cd /tmp/placeholder && npm publish --registry https://registry.npmjs.org --access public
```

发布时若要求 2FA，npm 会打印 `https://www.npmjs.com/auth/cli/<id>`：浏览器授权后命令自己继续。
**非交互环境（CI / 脚本 / 无 TTY）** 会直接以 `EOTP` 退出，而且 URL 被打码成 `***`。要么手工带 `--otp=<6 位>`，要么用伪 TTY 把完整 URL 捞出来：

```bash
# macOS：伪 TTY 下运行，日志里能拿到未打码的授权 URL
script -q /tmp/pub.log npm publish --registry https://registry.npmjs.org --access public
# Linux：语法不同，命令要放进 -c
# script -q -c "npm publish --registry https://registry.npmjs.org --access public" /tmp/pub.log
# 另开终端：cat /tmp/pub.log | tr -d '\r' | tail -5   → 复制 auth/cli 链接到浏览器授权
```

> 需要 2FA 的 `npm publish` 会先落一个 `0.0.0-stage` 版本，网页授权通过后再生效成 `0.0.0`（暂存发布机制）。它不影响 `latest`，可留可删。

### 3.2 配置 Trusted Publisher（CLI，不用点网页）

```bash
npm trust github @morehao/dsh-skills-console \
  --file release.yml \
  --repo morehao/dsh-skills-console \
  --allow-publish -y \
  --registry https://registry.npmjs.org
```

| 参数 | 必须这样填 | 填错的后果 |
|---|---|---|
| `--file` | `release.yml`（**文件名**，不是路径） | 与 workflow 的 `name:` 对不上 → OIDC 被拒 |
| `--repo` | `morehao/dsh-skills-console`（**仓库全名**） | 与 npm 里填的 Repository 不一致 → OIDC 被拒 |
| `--allow-publish` | 必须带 | 默认只给 `stage publish`，CI 直接 `npm publish` 会被 403 拒 |

成功输出关键行（记录下来，便于日后核对）：

```
type: github
file: release.yml
repository: morehao/dsh-skills-console
permissions: publish, stage publish
```

`npm trust list` 会再要一次 2FA；不想折腾就以这条成功输出 + 一次 tag 发布为证。

### 3.3 建包后核对（约 2–5 分钟内完成，见 §5 的「processing 窗口」）

```bash
curl -s -o /dev/null -w 'version doc: %{http_code}\n' https://registry.npmjs.org/@morehao%2Fdsh-skills-console/0.0.0  # 200
curl -s https://registry.npmjs.org/-/package/@morehao/dsh-skills-console/dist-tags                                  # {"latest":"0.0.0"}
npm access list packages morehao --registry https://registry.npmjs.org        # 包在列表里（read-write）
```

- [ ] 包能在 registry 上读到（单版本端点 200；packument 可能还在 processing，见 §5「processing 窗口」）
- [ ] TP 的 `file` / `repo` / `permissions` 与 3.2 一致
- [ ] 本仓 `package.json` 的 `name`、`cordis.patch.yml` 的 `name`、`lib/index.js` 的 `export const name` 与新包名一致（`npm run check` 会兜住）
- [ ] 仓库没有残留 `NPM_TOKEN` secret（OIDC 不需要；有也要删）

### 3.4 收尾：退出登录

```bash
npm logout --registry https://registry.npmjs.org
# npm ≥11 会拒绝用 `npm config get` 读 _authToken（"option is protected"），直接看文件：
grep -q 'registry.npmjs.org/:_authToken' ~/.npmrc && echo '还有 token，检查是否残留' || echo '已无 npmjs token'
```

之后只剩 CI 的 OIDC，本机不再持有任何可发布的凭据。

## 4. 日常发新版

```bash
# 1) 升版本（分支 → PR → 合并 main）。main 不直推，升版本也不例外。
#    同步按影响面改 README / CHANGELOG 摘要（如果这次有面向用户的变化）

# 2) 在合并后的 main 最新提交上打注记 tag
git fetch origin --tags
NOTES=$(mktemp)
cat > "$NOTES" <<'EOF'
release: v0.2.0

## 本次发布

<一句话概述>

### 新增 / 变更 / 修复
- ...

<details><summary>原始变更记录（自动生成，未改写）</summary>

### Features
- ...
</details>
EOF

git tag -a --cleanup=verbatim v0.2.0 -F "$NOTES" origin/main
git push origin v0.2.0
```

两个不可省的点：

- **`--cleanup=verbatim`**：默认 `strip` 会把 `## 本次发布`、`### 新增` 这类 `#` 开头的行当注释删掉。
- **必须是注记 tag（`-a`）**：轻量 tag 没有正文，Release 步骤会拒绝投影并失败。

正文写法（git-kit 约定）：摘要层自己写（中文、面向用户、每组 ≤5 条），原文层用
`bash ~/.agents/skills/git-kit/scripts/changelog.sh --all --to origin/main --link-to v0.2.0` 生成后折叠保留。

推荐用 git-kit 的 `/git-release`：它只做 `pr-merge` 之后那段（只读预检 → 计划卡 → 打注记 tag → 校验 Release → 跟踪后效）。

**发布失败不要删 tag 重打**：`ci-publish.sh` 最多尝试 3 次（第 n 次失败等 n×30s，每次失败先回读 registry），registry 恢复后 `gh run rerun <run-id>` 即可；版本存在即跳过，重跑不会重复发布。

> 反面教材：本仓 `v0.2.0` 的注记就是漏了 `--cleanup=verbatim` 打的，`## 本次发布`、`### 新增` 等以 `#` 开头的行被 `strip` 全部吃掉，Release 正文只剩段落和表格。打之前用 `git for-each-ref --format='%(contents)' refs/tags/vX.Y.Z | head` 自查一眼。

## 5. 发布后验证

```bash
# 1) 版本是否真的上线（单版本端点最准，且不受 packument 缓存影响）
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@morehao%2Fdsh-skills-console/0.2.0   # 期望 200
curl -s https://registry.npmjs.org/-/package/@morehao/dsh-skills-console/dist-tags                     # {"latest":"0.2.0"}

# 2) 产物元信息：文件数 / 体积 / 发布者 / provenance
curl -s https://registry.npmjs.org/@morehao%2Fdsh-skills-console/0.2.0 \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);
      console.log(j.dist.fileCount,'files',j.dist.unpackedSize,'bytes');
      console.log('npmUser',JSON.stringify(j._npmUser));
      console.log('attestations',Object.keys(j.dist.attestations||{}));})"

# 3) 拉下来真的能装（防止 files 白名单漏东西）
mkdir -p /tmp/packtest && cd /tmp/packtest && npm pack @morehao/dsh-skills-console@0.2.0 --registry https://registry.npmjs.org   # 之后几条若还在跑，先 cd 回仓库

# 4) Release 正文与注记一致
gh release view v0.2.0 --json tagName,body --jq '{tag:.tagName,len:(.body|length)}'
git for-each-ref --format='%(contents)' refs/tags/v0.2.0 | tail -n +2 | head -5

# 5) 逐步结论（日志下载受限时用这个）
gh api repos/morehao/dsh-skills-console/actions/runs/<run-id>/jobs --jq '.jobs[].steps[] | {name, conclusion}'
```

### processing 窗口（重要）

npm 对**新包名/新版本**的首次可见有几分钟延迟，且两个读端点不同步：单版本端点多在 2 分钟内出现，完整 packument 要更久（本次实测 0.2.0 单版本端点约 2.5 分钟；0.0.0 的 packument 约 5 分钟）。窗口内的典型表现：

- `POST/PUT` 已返回 `+ @morehao/dsh-skills-console@0.2.0`，CI 绿；
- 但 `npm view`、完整 packument 仍 404，`dist-tags` 还是旧版本。

**这不是失败**，不要重发、不要动 tag。用单版本端点轮询判断：

```bash
for i in $(seq 1 10); do
  printf '%s ' "$(date +%H:%M:%S)"
  curl -s -o /dev/null -w 'v0.2.0=%{http_code}\n' https://registry.npmjs.org/@morehao%2Fdsh-skills-console/0.2.0
  sleep 30
done
```

## 6. 排障速查

| 症状 | 根因 | 解决 |
|---|---|---|
| `EOTP` / `This operation requires a one-time password` | 账号写操作要 2FA，当前是非交互环境 | 交互终端直接跟浏览器；脚本里用 `--otp=<6 位>`，或用 `script -q` 造伪 TTY 拿未打码的 `auth/cli` URL（§3.1） |
| `E404` + `GET …?write=true` | 写路径判断「包不存在」：没带凭据、token 失效、或包真的不在了 | 先 `npm whoami --registry https://registry.npmjs.org`；再 `npm access list packages morehao` |
| 登录后仍 404 / 报无权限 | `~/.npmrc` 里残留失效 token，或 token 对 `@morehao` 没有写权限 | `npm config delete //registry.npmjs.org/:_authToken` 后重新 `npm login` |
| `403 … bypass 2fa` | 账号要求 2FA，token 没勾 bypass；npm 也在收紧带 bypass 的 token | 走 `npm login` + OTP/网页授权；CI 侧不受影响（OIDC） |
| `403 permission denied for this action` | TP 只允许 `npm stage publish` | 重建 TP 时带 `--allow-publish`（§3.2），或网页勾上允许 `npm publish` |
| OIDC `404 Not found`（配置看着没问题） | ① workflow 的 `name:` ≠ npm 里填的文件名；② `--repo` 与真实仓库不符（改过名）；③ registry 降级 | 对齐 `name: release.yml`；核对仓库名；查 <https://status.npmjs.org> |
| 发布成功但 `npm view` 404 / 版本不在 `versions` 里 | 新版本 processing 窗口（§5） | 只认单版本端点；2–5 分钟后自然恢复 |
| 发布成功但 `npm view` 还是旧版本号 | 读端点 CDN 缓存 | 用 `/-/package/<name>/dist-tags` 与单版本端点，别用完整 packument 判断 |
| `publish` 绿色但没发出去 | `@actions/exec` 不做 shell 解析，`a && b` 只执行 `a` | workflow 里只用单一命令 `bash ./scripts/ci-publish.sh` |
| 发布成功但没有 Release | 注记 tag 没正文（轻量 tag / 只有首行） | 本地 `node scripts/release-notes.mjs vX.Y.Z` 复现；补注记后重跑该 run |
| `npm deprecate` 404 | 包在 npmjs 上不存在（被下架/从未落成），或 token 无写权限 | 先 `curl -s -o /dev/null -w '%{http_code}' https://registry.npmjs.org/@morehao%2F<包名>`；404 就别再试 deprecate |
| 本地 `npm login` 弹 CNPM/npmmirror | 全局 registry 是 npmmirror | 所有命令显式 `--registry https://registry.npmjs.org` |
| `npm pack` 报 `EPERM ~/.npm/_cacache` | `~/.npm` 里有 root 属主文件 | `check-pack.mjs` 已用临时 cache 规避；手动跑可 `sudo chown -R $(id -u):$(id -g) ~/.npm` |

## 7. 本仓 CI 约定（改 workflow 前先看）

- **actions 版本**：`actions/checkout@v7` + `actions/setup-node@v7`。
  - setup-node v7 **移除了 dummy `NODE_AUTH_TOKEN` 兜底**：设了 `registry-url` 却不给 token 时，老 npm / Yarn Classic / pnpm 可能报错。本仓因此**不设 `registry-url`**，registry 由 `ci-publish.sh` 显式 `--registry` 指定。
  - v5 起按 `packageManager` 自动开依赖缓存；本包**零 runtime 依赖**，但 check job 需要构建期 esbuild，显式 `package-manager-cache: false`，依赖只从 lockfile 装一次（发布 job 更必须关，避免缓存投毒波及 OIDC 令牌）。
  - checkout v6 起把凭据写到独立文件、v7 起转 ESM 并阻止 `pull_request_target` / `workflow_run` 下检 fork PR；本仓用 `push: tags` + `pull_request`，不受影响。
- **runner 钉版本**：`runs-on: ubuntu-24.04`（不用 `ubuntu-latest`）。`ubuntu-latest` 自 2026-10-19 起分批迁到 26.04（11-19 完成），发布链路失败只能补发，不该跟着浮动标签漂；要升级就显式改成 `ubuntu-26.04` 先跑一轮 CI 与一次发布验证。
- **OIDC 前置**：发布 job 需要 `permissions: id-token: write`；**不要**设 `NODE_AUTH_TOKEN`（会盖掉 OIDC）。
- **npm 版本**：OIDC 发布要求 npm ≥ 11.5.1；Node 22 自带 npm 10.x，所以 release job 有一步 `npm install -g npm@latest`（实测拉到的 npm 12 行为正常）。
- **`name:` 必须等于文件名**：`release.yml` 的 `name: release.yml`，与 TP 的 Workflow 字段精确匹配。
- **`gh release create` 必须留在 `release.yml`**：git-kit 的 `/git-release` 预检靠 grep workflow 判定 `EFFECT_RELEASE=workflow`，挪进 `scripts/` 会让它误判成「流程自己建 Release」。
- **不要给发布 job 加依赖安装 / 构建步骤**：运行时零依赖，客户端 bundle（根 `client.js`）是提交进仓的生成物；发布 job 只发已提交的产物，生成物保鲜由 PR 阶段的 `check:client`（`npm run check` 内）负责，多一步就多一个失外面。

## 8. 相关文件

| 文件 | 作用 |
|---|---|
| `.github/workflows/check.yml` | PR / push `main`：发布脚本语法 + 机械校验 + 单测 |
| `.github/workflows/release.yml` | tag `v*` → OIDC 发布 → 建 Release（`name:` 必须等于文件名） |
| `scripts/ci-publish.sh` | 版本一致性守卫、幂等跳过、`npm publish --provenance`（最多 3 次尝试、指数退避） |
| `scripts/release-notes.mjs` | 注记 tag → Release body 投影（不重算、不改写） |
| `scripts/check-naming.mjs` · `scripts/check-pack.mjs` | 三处命名一致、`exports`/`files` 接线与打包白名单 |
| `scripts/build-client.mjs` | `client/` → 根 `client.js` 的 esbuild 构建（`--check` 在 CI 里保证生成物不漂移） |
| `package.json` | `version`、`publishConfig.access`、`files`、`dsh.bundle` / `dsh.client` |
| `cordis.patch.yml` | 插件注册 patch（`id` / `name` 与包名、`export const name` 三处一致） |
| `AGENTS.md` · `docs/agents/verification-release.md` | agent 侧硬约束与提交前检查矩阵 |

## 9. 实操记录：2026-10-23 的 0.2.0 首发

用于校准预期，不代表固定流程。

| 时间（+08:00） | 事件 | 证据 |
|---|---|---|
| 18:13:45 | 本地发 0.0.0 占位包（网页 2FA 授权；非交互 EOTP → 伪 TTY 取 URL） | `+ @morehao/dsh-skills-console@0.0.0`；随后出现 `0.0.0-stage` |
| 18:14:2x | `npm trust github … --allow-publish`（同样走网页授权） | `permissions: publish, stage publish`，`file: release.yml` |
| 18:17:47 | 推注记 tag `v0.2.0` | run 39938083185 |
| 18:18:05 | CI OIDC 发布 0.2.0 + 建 Release | `+ @morehao/dsh-skills-console@0.2.0`，provenance 已签 |
| 18:20:39 | 单版本端点转 200；`dist-tags.latest=0.2.0` | 约 2.5 分钟 processing 窗口 |

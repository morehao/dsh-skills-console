# 查看技能内容（只读接口）

技能控制台的查看器读的是 canonical 里的真身：`~/.agents/skills/<name>/`（目录包）或 `~/.agents/skills/<name>.md`（平铺）。
正文与文件接口是**只读**，不写 canonical、不写 v3 lock、不受 `state.json` 只读降级影响；
技能简介的 `GET` 只读本地缓存，`POST` 才会调用模型（只写插件自己的 `intros.json`）。

- 前缀：`/api/morehao/skills-console`
- 鉴权：所有请求必须带 `x-dsh-skills-console: 1`（缺头 → 403）；跨源请求会先触发预检，等于顺带挡住 CSRF。
- 错误响应：`{ ok: false, code, message, detail }`，HTTP 400。

## GET /skills/:name

读技能正文，或技能目录里的任意文本文件。

| 查询参数 | 说明 |
| --- | --- |
| `path` | 技能根内的相对路径。省略时：目录包读 `SKILL.md`，平铺读 `<name>.md` |

```json
{
  "ok": true,
  "name": "project-insight",
  "kind": "dir",
  "relPath": "SKILL.md",
  "path": "/Users/…/.agents/skills/project-insight/SKILL.md",
  "content": "---\nname: project-insight\n…",
  "meta": { "name": "project-insight", "description": "开源项目深度解读…" },
  "size": 19208,
  "truncated": false,
  "mtime": "2026-10-23T10:57:23.136Z"
}
```

- `content` 是**原文**，包含 frontmatter；`meta` 是 `skill-md.js` 解析出的 `name` / `description`，供标题区用。
- `size` 是真实字节数；`truncated: true` 表示只返回了前 256 KB。
- `kind`：`dir`（目录包）或 `file`（平铺 `.md`）。

## GET /skills/:name/files

列技能目录的文件树（不读内容）。

```json
{
  "ok": true,
  "name": "project-insight",
  "root": "/Users/…/.agents/skills/project-insight",
  "kind": "dir",
  "body": "SKILL.md",
  "hasSkillMd": true,
  "files": [
    { "path": "references", "kind": "dir" },
    { "path": "references/grounding-guide.md", "kind": "file", "size": 7555 }
  ],
  "totalBytes": 348909,
  "truncated": false
}
```

- 目录在前、文件在后，各自按名称排序；`path` 一律是技能根内的相对路径。
- 跳过符号链接、点文件、`node_modules`、`.git`；深度 ≤ 8，条目 ≤ 500（超出 `truncated: true`）。
- 平铺技能：`kind: "file"`、`body: "<name>.md"`，`files` 只有这一项。
- `hasSkillMd: false`（`body: null`）表示目录存在但没有 `SKILL.md`——DSH 解析不到这个技能，前端给提示，文件 tab 仍可用。

## GET /skills/:name/intro

读缓存的技能简介，**绝不调用模型**。入口在已安装列表每行的 ✨，不在查看器里。

| 查询参数 | 说明 |
| --- | --- |
| `lang` | `zh`（默认）或 `en`；其他值回落 `zh` |

```json
{
  "ok": true,
  "name": "project-insight",
  "lang": "zh",
  "intro": {
    "text": "深读开源项目源码，逐条给出可点开的「文件:行号」……",
    "stale": false,
    "generatedAt": "2026-10-26T03:20:00.000Z",
    "provider": "deepseek-official",
    "model": "deepseek-flash",
    "truncated": false,
    "usage": { "inputTokens": 1200, "outputTokens": 180 }
  },
  "capability": { "enabled": true, "available": true, "langs": ["zh", "en"], "timeoutMs": 30000 }
}
```

- 没有缓存时 `intro: null`，前端给「生成简介」按钮。
- `stale: true` 表示 `SKILL.md` 的内容哈希变了：仍然返回旧文本，前端提示「可能过期」。
- `capability.available: false` 表示宿主没有 `llm` 服务（生成接口会 501）；`enabled: false` 表示配置关掉了。

## POST /skills/:name/intro

生成（或复用）简介。请求体：`{ "lang": "zh", "force": false }`。

```json
{
  "ok": true,
  "name": "project-insight",
  "lang": "zh",
  "cached": false,
  "intro": { "text": "……", "stale": false, "provider": "yygu", "model": "deepseek-flash", "generatedAt": "…" },
  "usage": { "inputTokens": 1200, "outputTokens": 180 }
}
```

行为：

- **命中缓存且未过期**（`force !== true`）→ 直接返回 `cached: true`，不调模型。
- 发送给模型的是 `SKILL.md`（按 `maxInputBytes` 截断）与文件**名**清单（最多 30 个），不读其他文件正文；产出是 2–3 句能力简介（做什么 / 什么时候用），其中必须有一句写清**怎么触发**——触发关键词、可直接照说的示例请求，或技能名 / 斜杠命令调用；原文没写触发词时按 description 归纳。不是逐字翻译。
- 路由：`config.intro.provider/model` > DSH 默认模型（`agentDefaultModel.currentSelection()`）；都没有 → 409 `intro-no-model`。
- 同一时间全局只允许一个生成；并发请求 → 409 `intro-busy`。
- 失败不写缓存；成功但写盘失败仍返回文本（只记日志）。
- 客户端断开（关浮层 / 换技能）会 abort 模型调用；超时由服务端计时，返回 504。

## GET/POST /subscriptions/:id/entries/:name/intro

订阅候选的简介。形态与本地那对接口一致，区别是正文来自远端：

- `name` 必须是该订阅**快照**里的条目名；服务端按 `subscription.id` + 条目名反查 `skillPath`，**不接受客户端传路径**。
- `GET` 只读缓存；`POST`（请求体 `{ "lang": "zh", "force": false }`）会先按快照 `commit` 拉 `raw.githubusercontent.com/<source>/<commit>/<skillPath>`（≤512 KB、20s 超时），再调模型。
- 缓存 key 是 `remote:<source>@<commit>:<skillPath>`，所以快照换 commit 就是新条目，不存在「过期」提示；同一时间仍受全局单飞限制。
- 响应额外带 `source` / `commit` / `skillPath` / `description`（快照里作者的 frontmatter 描述）；拉不到远端只影响这次简介，不影响「安装」。

```json
{
  "ok": true,
  "subscriptionId": "sub-1",
  "name": "alpha",
  "lang": "zh",
  "source": "morehao/ai-kit",
  "commit": "cccc…",
  "skillPath": "skills/alpha/SKILL.md",
  "description": "Alpha skill",
  "intro": { "text": "……", "stale": false, "provider": "yygu", "model": "deepseek-flash", "generatedAt": "…" },
  "capability": { "enabled": true, "available": true, "langs": ["zh", "en"], "timeoutMs": 30000 }
}
```

## 错误码

| code | 场景 |
| --- | --- |
| `error.skills.not-found` | 技能不在 canonical；技能名非法（含 `/`、`\`、`..`、控制字符） |
| `error.skills.no-skill-md` | 目录存在，但没有 `SKILL.md` |
| `error.skills.bad-path` | `path` 越界 / 绝对路径 / 盘符 / 反斜杠 / NUL / 经过符号链接 |
| `error.skills.file-not-found` | 相对路径不存在 |
| `error.skills.not-a-file` | 目标是目录或特殊文件 |
| `error.skills.binary` | 暂不支持预览：已知二进制扩展名（图片 / 音视频 / 压缩包 / 字体 / 可执行文件），或前 8 KB 含 NUL、整体不是合法 UTF-8 |
| `error.skills.file-unreadable` | 权限不足或读取失败 |
| `error.skills.intro-disabled` | 配置关闭了技能简介（501） |
| `error.skills.intro-unavailable` | 宿主没有 `llm` 服务，或缓存层不可用（501） |
| `error.skills.intro-no-model` | 没有可用的默认模型（409） |
| `error.skills.intro-busy` | 已有另一个生成在跑（409） |
| `error.skills.intro-auth` | 模型提供方认证失败（502） |
| `error.skills.intro-rate-limit` / `-quota` | 限流或额度不足（429） |
| `error.skills.intro-too-large` | 正文超出模型上下文（413） |
| `error.skills.intro-timeout` | 生成超时（504） |
| `error.skills.intro-empty` | 模型没有返回文本（502） |
| `error.skills.intro-aborted` | 客户端断开 / 主动取消（499） |
| `error.skills.intro-failed` | 其他模型失败（502） |
| `error.skills.subscription-not-found` | 订阅不存在（404） |
| `error.skills.intro-no-source` | 快照里找不到这个条目 / 快照缺 commit（409） |
| `error.skills.intro-source` | 拉不到远端 `SKILL.md`（404 / 私有 / 网络，502） |
| `error.skills.intro-source-timeout` | 拉远端 `SKILL.md` 超时（504） |
| `error.skills.intro-source-too-large` | 远端 `SKILL.md` 超过 512 KB（413） |

## 路径安全

实现在 [`lib/core/skill-files.js`](../lib/core/skill-files.js)，规则与仓库「不接收任意路径」的硬约束一致：

- **根只能反查**：`<canonical>/<name>/` 或 `<canonical>/<name>.md`；根自身是符号链接直接 `bad-path`（v1 不跟随根链）。
- **名字先校验**：`assertSafeSkillName` 在拼任何路径之前执行（`%2F` 解码出的 `/` 也拦得住）。
- **相对路径逐段校验**：长度 ≤ 300；拒绝 NUL、反斜杠、绝对路径、盘符、任何 `..` 段；`path.posix.normalize` 之后再检查一次。
- **双重包含判断**：lexic `isInside` + `realpath` 包含判断，中间层目录是符号链接也逃不出去。
- **不跟随符号链接**：`lstat` 拒绝 + `fs.open(O_NOFOLLOW)` + `fstat` 复核是普通文件。
- **只读**：本层从不写文件系统。

## 限制

- **按内容判断能否预览**，不靠扩展名白名单：`.md` / `.html` / `.jsx` / `.css` / `.sh` / `.rb` / 无扩展名的脚本都能看源码；
  只有已知二进制扩展名（`.png` `.jpg` `.mp3` `.zip` `.woff2` `.wasm` …）或内容里出现 NUL / 不是合法 UTF-8 才拒绝，前端显示「暂不支持预览」+ 文件名与大小。
- 文件 tab 的预览：`.md` / `.markdown` **默认渲染**（可切「原文」，也能「在正文中打开」以带目录读），其他文本给源码。
- 单文件上限 256 KB（`truncated: true`，前端提示只显示前一部分）；文件树 500 条目 / 8 层。截断时只嗅探前 8 KB，避免把多字节字符的截断误判成二进制。
- 不做缓存与 ETag：每次打开重新读；同一会话内切文件不重拉树；更新成功后前端按 `commit` / 哈希变化自动重拉。
- 不提供写入、重命名、上传；编辑正文不在范围内（安装 / 更新会整份覆盖）。

## 前端实现

- 数据：`client/hooks.js` 的 `useSkillReader(row)`，并行拉正文与文件树，请求带序号丢弃过期响应。
- 简介：`useSkillIntro({ name, lang, stamp, enabled })` 在 `client/views/intro-modal.js` 里使用：弹窗走标准 `Overlay`（居中遮罩 + 标题 + 底栏，和调用策略 / 共享设置一致），打开只 `GET` 缓存，点「生成简介」才 `POST`；关闭 / 换技能用 `AbortController` 取消在跑的生成。文案在 `client/copy.js` 的 `intro.*`（中英双语），错误码在同一个弹窗组件里映射成对应语言。
- 渲染：`client/markdown.js`（无依赖的最小 Markdown 解析）+ `client/views/markdown-view.js` 的 `Markdown` 组件（`h` 建节点，不使用 `innerHTML`）。
  - 链接协议白名单：`http` / `https` / `mailto` 新窗口；`#anchor` 文内滚动；相对路径交给查看器内部打开；`javascript:` / `data:` 只显示文字。
  - 图片一律占位（路径 + alt），不请求本地文件。
- 外壳：抽屉 `role="dialog"` + `aria-modal` + 焦点陷阱 + Esc；整页带返回条与目录。窄面板（≤860px 容器宽，与列表两列回落同一断点）隐藏行内「查看」与整页目录，技能名仍可点。
- 布局：整页的目录轨只在正文 tab 真有目录（≥2 个标题）时出现；文件 tab 在整页（宽容器）里左树右预览，抽屉与窄容器里上下排。
- 描述：默认按行数截断（抽屉 2 行、整页 hero 3 行）；按真实渲染高度判断是否溢出，溢出时给「展开 / 收起」，宽度变化（抽屉 / 整页 / 改窗口）会重新量。换技能自动收起。

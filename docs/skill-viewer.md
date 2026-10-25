# 查看技能内容（只读接口）

技能控制台的查看器读的是 canonical 里的真身：`~/.agents/skills/<name>/`（目录包）或 `~/.agents/skills/<name>.md`（平铺）。
两个接口都是**只读**，不写 canonical、不写 v3 lock、不受 `state.json` 只读降级影响。

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

## 错误码

| code | 场景 |
| --- | --- |
| `error.skills.not-found` | 技能不在 canonical；技能名非法（含 `/`、`\`、`..`、控制字符） |
| `error.skills.no-skill-md` | 目录存在，但没有 `SKILL.md` |
| `error.skills.bad-path` | `path` 越界 / 绝对路径 / 盘符 / 反斜杠 / NUL / 经过符号链接 |
| `error.skills.file-not-found` | 相对路径不存在 |
| `error.skills.not-a-file` | 目标是目录或特殊文件 |
| `error.skills.binary` | 扩展名不在白名单，或前 8 KB 含 NUL（二进制） |
| `error.skills.file-unreadable` | 权限不足或读取失败 |

## 路径安全

实现在 [`lib/core/skill-files.js`](../lib/core/skill-files.js)，规则与仓库「不接收任意路径」的硬约束一致：

- **根只能反查**：`<canonical>/<name>/` 或 `<canonical>/<name>.md`；根自身是符号链接直接 `bad-path`（v1 不跟随根链）。
- **名字先校验**：`assertSafeSkillName` 在拼任何路径之前执行（`%2F` 解码出的 `/` 也拦得住）。
- **相对路径逐段校验**：长度 ≤ 300；拒绝 NUL、反斜杠、绝对路径、盘符、任何 `..` 段；`path.posix.normalize` 之后再检查一次。
- **双重包含判断**：lexic `isInside` + `realpath` 包含判断，中间层目录是符号链接也逃不出去。
- **不跟随符号链接**：`lstat` 拒绝 + `fs.open(O_NOFOLLOW)` + `fstat` 复核是普通文件。
- **只读**：本层从不写文件系统。

## 限制

- 文本扩展名白名单：`.md` `.markdown` `.txt` `.json` `.yaml` `.yml` `.mjs` `.js` `.ts` `.sh` `.py` `.toml` `.csv`。
- 单文件上限 256 KB（`truncated: true`，前端提示只显示前一部分）；文件树 500 条目 / 8 层。
- 不做缓存与 ETag：每次打开重新读；同一会话内切文件不重拉树；更新成功后前端按 `commit` / 哈希变化自动重拉。
- 不提供写入、重命名、上传；编辑正文不在范围内（安装 / 更新会整份覆盖）。

## 前端实现

- 数据：`client/hooks.js` 的 `useSkillReader(row)`，并行拉正文与文件树，请求带序号丢弃过期响应。
- 渲染：`client/markdown.js`（无依赖的最小 Markdown 解析）+ `client/views/skill-reader.js` 的 `Markdown` 组件（`h` 建节点，不使用 `innerHTML`）。
  - 链接协议白名单：`http` / `https` / `mailto` 新窗口；`#anchor` 文内滚动；相对路径交给查看器内部打开；`javascript:` / `data:` 只显示文字。
  - 图片一律占位（路径 + alt），不请求本地文件。
- 外壳：抽屉 `role="dialog"` + `aria-modal` + 焦点陷阱 + Esc；整页带返回条与目录。窄面板（≤900px 容器宽）隐藏行内「查看」与整页目录，技能名仍可点。

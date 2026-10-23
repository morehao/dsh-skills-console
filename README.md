# dsh-skills-manager

DeepSeek Harness（dsh）的技能管理插件：**装 / 更新 / 删除 / 接入其他 Agent / 启停**，配一个订阅列表。

## 定位

- **技能真身只认 `skills` CLI**：下载、解析、落盘到 canonical（`~/.agents/skills`）、写 lock，全部交给 [`skills`](https://www.npmjs.com/package/skills) CLI，本插件不代理来源、不写 lock。
- **DSH 侧只靠原生根**：往原生 `user-dsh` 根（`~/.dsh/skills`，rank 400）建软链让 DSH 发现；项目维度写 `project-dsh` 根（rank 100）。不注册自有 provider、不改 DSH 配置。
- **其他 Agent 靠软链分发**：Claude Code / Codex / Cursor … 各自 `skills` 目录里放指向 canonical 的软链。
- **启停 = DSH 侧链接的有/无**：不动 `SKILL.md`（`add` 会整份覆盖，改文件还会让更新被锁死）。

## 状态

设计阶段，尚无代码。文档见：

- [设计文档](.dsh/docs/specs/2026-10-23-dsh-skills-manager-design.md)（架构、数据模型、CLI 契约、原生对接、风险）
- [界面原型设计](.dsh/docs/specs/2026-10-23-dsh-skills-manager-prototype-design.md)
- [可点原型](.dsh/docs/prototypes/2026-10-23-dsh-skills-manager-prototype.html)（单文件，浏览器直接打开）

## 许可

MIT

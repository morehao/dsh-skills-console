# Changelog

## [v0.4.0] - 2026-10-25

### Breaking Changes

- **状态格式升到 v2**：`state.json` 用 `installs[].enabled` + `exports[]` + `shadows[]` + `settings.exportTargets` 取代 v1 的 `links[]` / `mode` / `scopeProjects`。首次启动自动迁移（先把原始 v1 备份到 `migrations/`，保留 7 天），并清理历史上为「提升 rank」而建的 `~/.dsh/skills` 可见性链。旧版插件读到 v2 状态会只读降级。
- **停用不再删链**：启用/停用只写/删扫描根里的停用桩（`~/.dsh/skills/<name>` 或 `<项目>/.dsh/skills/<name>`），`~/.agents/skills` 的真身与 v3 lock 一个字节都不动。
- **导出与可见性解耦**：`exports` 默认空，只给不读共享根的 Agent 建链；`/links` 保留为 `/exports` 的别名。
- **移除 export 模式**：`DSH_AGENTS_HOME` 指到别处、canonical 不在 DSH 扫描根里时，插件不再往 `~/.dsh/skills` 建可见性链兜底，改为在 `/diagnostics` 报 `canonical-not-scanned`。

### Features

- 可见性按扫描根合并（rank 100/200/300/400/500，宿主 `snapshot()` 作 rank 600 垫底），技能身份取 frontmatter `name`，与宿主一致。
- 目标注册表新增 `exportable` / `exportBlocked`：读共享根、DSH 自己的扫描根、canonical 自己都不会被当成导出目标。
- 停用桩带出处标记 `.dsh-skills-console.json`；外来目录与外部链一律 409，不覆盖。
- v1→v2 迁移带 manifest、7 天备份，幂等、fail-open，中断可续跑。

### Refactors

- 导出资格从 `kind === 'dsh'` 之类的身份判断收敛为一个字段，服务端与 Web Client 共用，不再三处各写一份。
- 页面可见性改为中性状态点（实心 = 模型可见，空心 = 模型不可见）；行内不再有 DSH 专属 chip、`+n` 气泡里的 DSH、分组标题与横幅里的 DSH 身份。

### Docs

- README 补 `DSH_AGENTS_HOME` 的可见性边界，以及可见性在界面上的展示口径。

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.8...v0.4.0

## [v0.3.8] - 2026-10-25

### Fixes

- **client**: 查看器文件 tab 左树右预览，长描述可展开 (#47)

### Refactors

- **client**: 拆开弹窗外壳与添加技能流程 (#51)
- **client**: 收拢滚动容器探测，抽出正文渲染器 (#49)

### Docs

- **agents**: 把本地 link 验证固化为标准流程（验证后即回退） (#48)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.7...v0.3.8

## [v0.3.7] - 2026-10-25

### Fixes

- **client**: 滚动只留在列表区，修复设置页查看器浮层 (#44)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.6...v0.3.7

## [v0.3.6] - 2026-10-25

### Fixes

- **client**: 页头按内容换行，避免窄面板截断安装标识 (#42)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.5...v0.3.6

## [v0.3.5] - 2026-10-25

### Fixes

- **client**: 页头动作固定右上，页面断点与滚动条解耦 (#40)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.4...v0.3.5

## [v0.3.4] - 2026-10-25

### Refactors

- **skills**: 页头安装标识改为只读无边框展示 (#38)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.3...v0.3.4

## [v0.3.3] - 2026-10-25

### Features

- **skills**: 页头身份改为可复制的安装标识 (#36)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.2...v0.3.3

## [v0.3.2] - 2026-10-25

### Features

- **skills**: 查看技能内容 —— 列表行新增「查看」，右侧抽屉速览、可升级为整页深读；正文渲染 / 原文切换、文件树与单文件预览、信息 tab；新增 `GET /skills/:name?path=` 与 `GET /skills/:name/files` 两个只读接口，并补上原先缺失的技能名与相对路径校验 (#34)
- **skills**: 清单状态区分「待检查」与「无上游」—— 没有可用订阅来源的技能不再混进待检查计数

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.1...v0.3.2

## [v0.3.1] - 2026-10-25

### Fixes

- **autolink**: show dsh global as a checked, locked row (#30)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.3.0...v0.3.1

## [v0.3.0] - 2026-10-24

### Features

- **installer**: native-only 0.3.0 installer（去 CLI/git） (#28)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.4...v0.3.0

## [v0.2.4] - 2026-10-24

### Features

- **skills**: bundle CLI dependency for no-Node setups (#26)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.3...v0.2.4

## [v0.2.3] - 2026-10-24

### Features

- **updates**: 探测与更新改走 git，修复限流下的哈希形态判定 (#22)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.2...v0.2.3

## [v0.2.2] - 2026-10-24

### Fixes

- **skills**: 订阅跟随仓库默认分支，添加技能先探测再选择 (#18)

### Docs

- 补充本地 link 验证与回退步骤 (#19)
- 聚焦当前插件说明，移除旧包名与迁移内容 (#17)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.1...v0.2.2

## [v0.2.1] - 2026-10-23

### Features

- **client**: 重排技能控制台页头与浮层，统一接入文案 (#11)
- 页头展示插件身份与版本并收敛首屏文案 (#9)

### Refactors

- **client**: 拆分 Web Client 为多模块并引入 esbuild 构建链 (#12)

### Docs

- 重写 README 为插件介绍 (#13)
- 复核发布流程文档，修正事实性错误与失效引用 (#8)
- 把 npm 发包流程整理成完整端到端手册 (#7)

**Full Changelog**: https://github.com/morehao/dsh-skills-console/compare/v0.2.0...v0.2.1

# Changelog

## [Unreleased]

### Features

- **技能介绍（AI 生成）**：已安装列表每行技能名旁新增 `✨ 介绍`，点开浮层就能看到模型写的「这个技能能做什么、什么时候用」——2–3 句能力介绍，不是逐字翻译。生成过的直接读本地缓存；首次点「生成介绍」才调模型，语言跟随界面（zh / en）。
  - 只发送 `SKILL.md`（按 `maxInputBytes` 截断）与文件名清单（≤30 个），不读其他文件正文；同一时间全局只允许一个生成。
  - 结果缓存在 `$DSH_HOME/skills-console/intros.json`，按技能名 + 语言分开；`SKILL.md` 内容哈希变化时标「可能过期」，失败不缓存。
  - 新增 `GET/POST /skills/:name/intro`；`config.intro.*` 可关闭、指定模型、调整输入 / 输出上限与超时。错误按 409 / 413 / 429 / 501 / 502 / 504 / 499 区分，关闭浮层时 abort 模型调用。
  - **订阅候选也能看**：展开条目行加 `✨ 介绍`，按快照 `commit` 拉远端 `SKILL.md` 再生成；缓存 key 为 `source@commit:path`，不挡「安装」。新增 `GET/POST /subscriptions/:id/entries/:name/intro`（路径由服务端反查快照，不收客户端路径）。
  - 订阅条目行新增作者 frontmatter 描述（存进快照，不调模型），装不装先看原文。

## [v0.5.0] - 2026-10-26

### Breaking Changes

- **状态格式升到 v4**：`installs[].mode` = `auto` / `manual` / `hidden` 成为调用策略的权威记录；旧版本读到 v4 只读降级。v3→v4 是纯函数迁移：补 `mode:'auto'`，`enabled=false` 补 `legacy:'dsh-off'`，清掉与 `auto` 冲突的 `manual`/`hidden`。
- **「仅手动」会写 canonical `SKILL.md`**：只增删/改 frontmatter 的 `disable-model-invocation`，保留 BOM / CRLF / 注释 / 引号 / 块标量；写前备份，原子替换。作者已写 `true` 时只记只读来源，不改写。这是「启停不碰文件」的唯一例外。
- **「完全停用」采用 A′ park**：`SKILL.md` 改名为 `SKILL.md.disabled` + `.dsh-skills-console.park.json` marker，内容字节不变；停用期间拒绝安装 / 更新 / 回滚，恢复时回到停用前的模式。
- **旧 `/mode` 只服务 legacy**：`dsh-off` 仍由 policy provider 隐藏；manual / hidden 行调用旧接口返回 409，避免两套开关打架。

### Features

- 行内单一策略 chip（自动 / 仅手动 / 完全停用 / 需修复 / 仅 DSH 隐藏 / 未纳入追踪），点开三档弹层；显示客户端覆盖表、风险说明与完全停用二次确认；作者声明行只读。
- 新增 `POST /skills/:name/invocation`（auto / manual / hidden）与 `POST /skills/:name/unpark`（含 `keep=current|parked` 冲突处理）。
- manual 写入失败 / 外部改文件时标 `drift`，不猜、不覆盖；更新、回滚、重装后按状态重放，失败不回滚已成功的更新。
- 归一化内容哈希：比较 `installedHash` 前先按 state 还原插件写入的那一行，避免「仅手动」被误判成本地改动；作者声明原样计入。
- 恢复时默认拒绝两份不同内容，可用 `keep` 明确保留当前或停用前版本，冲突副本留在目录里。
- 已安装列表四列（技能 / 共享 Agent / 调用策略 / 操作），窄屏收为两列；订阅列表四列 + 展开条目子表头；表头 sticky。
- 界面术语统一为「共享」：列名与共享设置弹层改为「共享 Agent」，安装提示用「共享至」；行内共享图标换成「一份方框分发到多个」。
- 设置页手动写入的原文备份到 `backups/invocation/`。

### Fixes

- 订阅列表按「仓库 + 名称」识别已装技能：账本里没有订阅关联、或从同一仓库直接安装的记录不再重复给安装入口，已装条目操作列用破折号占位。
- 停用行不再出现在 `enabledButHidden` 诊断里；`legacy dsh-off` 与三档状态互斥。
- 状态里 manual 标记缺失 / 值被改时按 drift 报告，不把作者或用户的编辑覆盖掉。

### UI / Docs

- README、AGENTS、开发文档同步 state v4、新接口、文件边界与验收口径。

## [v0.4.0] - 2026-10-26

### Breaking Changes

- **启停改为本地策略**：`installs[].enabled` 成为唯一开关；停用只写 `state.json`，由每个 live agent scope 的 policy provider 条件覆盖 canonical 候选，不再往 `~/.dsh/skills` 写停用桩，不改 canonical / v3 lock / 导出链。
- **只对 DSH 生效**：DSH 的模型调用与 `/` 手动调用看不到停用技能；读 `~/.agents/skills` 的其他 Agent（OpenCode / Cursor 等）仍会看到 canonical。全机停用不在本期。
- **状态格式升到 v3**：`shadows[]` 退休，`legacyShadows[]` 只记录迁移删不掉的旧桩与 orphan；旧版本读到 v3 只读降级。v2→v3 会清理旧版本写过的停用桩，删不掉的如实报告；v1 跨级升级时先备份 v1 / v2 两份快照。
- **项目级启停移除**：`scope: 'project:*'` 返回 400；项目副本仍按 rank 优先，停用 canonical 不会隐藏项目副本。
- **导出与可见性解耦**：`exports` 默认空，只给不读共享根的 Agent 建链；没有任何导出的技能照样对 DSH 可见。
- **移除 export 模式**：`DSH_AGENTS_HOME` 指到别处、canonical 不在 DSH 扫描根里时，插件不再往 `~/.dsh/skills` 建可见性链兜底，改为在 `/diagnostics` 报 `canonical-not-scanned`。

### Features

- policy provider 注册到每个 live agent 自己的 scope（preset scope 的子层），只在 canonical 是 native winner 时发 `modelInvocable=false` + `userInvocable=false` 的同名候选；项目 100/200、user-dsh 400 有同名副本时保持沉默，副本继续可见。
- 停用后模型目录与 `skill` 工具都拒绝该技能；启用后恢复原生候选。
- 新增 `findProjectRoot()`（向上找 `.git`），与宿主 `skill-filesystem` 的项目根口径一致。
- 可见性按扫描根合并（rank 100/200/300/400/500，宿主 `snapshot()` 作 rank 600 垫底），技能身份取 frontmatter `name`，与宿主一致。
- 目标注册表新增 `exportable` / `exportBlocked`：读共享根、DSH 自己的扫描根、canonical 自己都不会被当成导出目标。
- 旧停用桩带出处标记 `.dsh-skills-console.json`；v2→v3 迁移只删带标记的桩，`foreign` / `link` 一律保留并报告。
- v1→v2→v3 迁移带 manifest、7 天备份，幂等、fail-open，中断可续跑。

### Refactors

- 启停从「写扫描根文件」收敛为「一次 state 写入 + provider 失效」，删掉建桩/删桩的 IO 分支。
- 导出资格从 `kind === 'dsh'` 之类的身份判断收敛为一个字段，服务端与 Web Client 共用，不再三处各写一份。
- 页面可见性改为中性状态点（实心 = 模型可见，空心 = 模型不可见）；行内不再有 DSH 专属 chip、`+n` 气泡里的 DSH、分组标题与横幅里的 DSH 身份。

### UI / Docs

- 删除导出弹窗底部两段“读共享根，不在此列”说明（zh/en、两个 modal、`section.js` 计算与测试断言）；读共享根的 Agent 仍不进列表，只是不再解释。
- **行内 Agent 列只显示显式导出**：只有「不支持共享根、且真的建了导出链」的 Agent 出现；直读共享根的 Agent 不再逐行展示，没有导出时显示「未导出」（悬停说明共享根 Agent 装好即见），不再用「未导出到任何 Agent」。按 Agent 视图也只给有导出的 Agent 分组，抽屉信息 tab 只列「已导出」。
- `mode.offHint` / `visibility.scopeMismatch` / 空态文案改成用户语言，不再提“扫描根/停用桩/provider”。
- README、AGENTS、开发文档同步新机制；旧 host-wide 文档标记为备选。

### Fixes

- **v1 遗留的 `links[]` 不再常驻 state**：v1→v2 升级拆成 `exports[]` + `migration.legacyLinks` 后立即删除原字段；已经写进 v3 state 的旧字段会在加载时剪掉并原子写回（原文件先备份到 `migrations/state-v3-links-*.json`）。
- **导出清单只认指向 canonical 的链**：`installs[].exports` 不再把共享根 Agent（OpenCode / Cursor 等）目录里的链、`foreign-link` 和 `real` 当成导出。历史遗留的 OpenCode 链——无论指向 canonical 还是别的仓库——都不再显示成「已导出」，也不再进入行内 Agent 列；`saveExports` 也因此不会去动别人的链。
- **删除不再误拦别人的同名链**：体检只检查导出记账里的目标；OpenCode 等 Agent 自己指向其他仓库的同名链不再阻止删除，也不会被谎称「会连带删掉」。
- **manual-only 技能不再显示成「丢了」**：技能自己在 frontmatter 声明 `disable-model-invocation` 时，行内用「仅手动」标志提示（tooltip 说明模型不可见、手动 `/` 仍可用）；诊断不再把它算进 `enabledButHidden`。
- **大仓库更新**：codeload tarball 上限 50MB → 100MB，修复带设计素材的仓库（如 `tt-a1i/archify`，52.7MB）更新报 `tarball-too-large`。

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

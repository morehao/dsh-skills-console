# Changelog

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

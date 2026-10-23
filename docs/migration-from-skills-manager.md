# 从 `dsh-skills-manager` 迁移

> 适用于把本机从旧名（0.1.x）升到 `v0.2.0` 及以后。新装用户不需要读这篇。

`v0.2.0` 起，包名、插件 id、路由前缀、状态目录与环境变量统一改为 `skills-console`，**不提供兼容读旧值**：

| 层面 | 旧 | 新 |
| --- | --- | --- |
| npm 包 / 模块标识符 | `@morehao/dsh-skills-manager` | `@morehao/dsh-skills-console` |
| 插件 id（配置树键） | `dsh-skills-manager` | `dsh-skills-console` |
| 路由前缀 / 鉴权头 | `/api/morehao/skills-manager` · `x-dsh-skills-manager` | `/api/morehao/skills-console` · `x-dsh-skills-console` |
| 状态目录 | `$DSH_HOME/skills-manager/` | `$DSH_HOME/skills-console/` |
| 环境变量 | `DSH_SKILLS_MANAGER_*` | `DSH_SKILLS_CONSOLE_*` |

## 保住现有账本

订阅、回收站、链接记录、版本缓存都在状态目录里。升到新名之前搬一次即可：

```bash
mv ~/.dsh/skills-manager ~/.dsh/skills-console
```

## 不搬会怎样

插件仍然能用，但账本等于从空开始：

- 软链四态判定会把已有链接读成 `managed-external`（指向 canonical 但账本无记录），在设置页点一次「接管」就能恢复，**不会误删、也不会覆盖**；
- 代价是订阅列表、回收站快照与「已停用」状态丢失，需要重新添加订阅 / 重新停用。

## 安装侧

profile 的 `package.json` 依赖键要从 `@morehao/dsh-skills-manager` 换成 `@morehao/dsh-skills-console`；`link:` 本地接入时同步改路径。否则 bundle 不会加载，页面不会出现分区。

## 别和「技能管理」插件搞混

`@michengai/dsh-skills-manager`（显示名「技能管理」）是**另一个插件**，不是本插件的前身。两者天然隔离（包名、插件 id、路由前缀、状态目录都不同），可以同时安装，只是会各出一个设置分区；只想留一个时把另一个 `plugin_manager set_plugin enabled:false` 即可。

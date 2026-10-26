/**
 * Client half 入口：设置页「技能控制台」分区。
 * 一页两 tab：已安装 / 订阅。行内操作列 = 开关 + 更新 + 共享设置 + 删除。
 * 所有数据来自 Host 的 /api/morehao/skills-console/*，这里只做展示与提交。
 *
 * 源码在 client/，根 client.js 由 `npm run build:client` 生成，不要手改产物。
 */
export { apply, inject } from './app.js';

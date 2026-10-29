/**
 * 服务层对外错误类型：路由只认 `ServiceError`（默认 400；能力缺失/状态冲突用 409）。
 * 拆分前定义在 `lib/core/service.ts` 顶部，`lib/routes.ts` / `lib/core/plugin-update.ts`
 * 与测试都从 `.../core/service.js` 桶里取它——桶继续从本文件 re-export。
 */
export class ServiceError extends Error {
  code: string;
  detail: any;
  status: number;
  [key: string]: any;
  constructor(code: string, message: string, detail: any = null, status = 400) {
    super(message);
    this.code = code;
    this.detail = detail;
    // 路由默认按 400 返回；少数「能力缺失/状态冲突」用 409，调用方显式传入。
    this.status = status;
  }
}

/**
 * 薄 re-export 桶：`lib/core/service/*` 拆分后，外部（`routes.ts` / `index.ts` /
 * `plugin-update.ts` / `test/*.mjs`）仍从 `.../core/service.js` 取这两个符号。
 * 真正实现见 `./service/index.ts` 与 `./service/errors.ts`。
 */
export { createService } from './service/index.js';
export { ServiceError } from './service/errors.js';

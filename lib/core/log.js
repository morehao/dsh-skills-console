import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_BYTES = 1024 * 1024;

/** JSONL 事件日志：1MB 滚动一次（`.1` 覆盖）。写失败不影响主流程。 */
export function createLogger(file) {
  return function log(event, detail) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
        fs.renameSync(file, `${file}.1`);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(
        file,
        `${JSON.stringify({ at: new Date().toISOString(), event, ...(detail || {}) })}\n`,
        'utf8',
      );
    } catch {
      // 日志永远不该让操作失败
    }
  };
}

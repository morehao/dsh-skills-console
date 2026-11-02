/**
 * 浏览器侧最小本地存储：只服务两件「跨进程存活」的小事，与 Host 的 state.json 完全无关。
 *
 * - `pending`（「我刚点了更新」记号）：已收敛到共享包 `@morehao/dsh-plugin-kit/update/restore`
 *   的 `createPendingStore`——一键更新会先卸载运行中的插件、面板随之消失，把记号记进
 *   localStorage，重开的新进程读回来渲染不随面板消失的恢复提示。这里只做**本插件的 key 前缀
 *   绑定 + 对外函数包装**（保持 `writePendingUpdate` / `readPendingUpdate` / `clearPendingUpdate`
 *   的旧签名，调用方无需改），凭证与清理语义都在 kit 里。
 * - `layout-selected`（最近选中的主面板 key）：本插件私有，留在本文件自己读写。
 *
 * 边界（硬性）：全程 fail-open——localStorage 不存在（SSR / 测试 vm）/ 隐私模式抛错 / JSON 损坏
 * 一律当空处理，绝不影响插件正常挂载；只做前端展示，不碰 Host 权威状态。
 */
import { createPendingStore, type PendingUpdate, PENDING_TTL_MS } from '@morehao/dsh-plugin-kit/update/restore';

const PREFIX = 'dsh-skills-console:';
const KEY_LAYOUT = PREFIX + 'layout-selected';

export { PENDING_TTL_MS };
export type { PendingUpdate };

/** 取浏览器 localStorage；拿不到（无 window / 抛错）返回 undefined，交由 kit fail-open。 */
function browserStorage() {
  try {
    const w: any = typeof window !== 'undefined' ? window : undefined;
    return w?.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 本插件的 pending store 单例：前缀沿用 `dsh-skills-console:`，因此旧的
 * `dsh-skills-console:update-pending` 键继续可读（平滑迁移）。
 */
const pendingStore = createPendingStore({ keyPrefix: PREFIX, storage: browserStorage() });

/** 写入「刚点了更新」的记号。 */
export function writePendingUpdate(from: string, to: string): void {
  pendingStore.write(from, to);
}

/** 读取「刚点了更新」的记号。结构不符 / 过期 / 损坏返回 null（并清理）。 */
export function readPendingUpdate(): PendingUpdate | null {
  return pendingStore.read();
}

/** 清除记号（用户点「知道了」或已确认重开）。 */
export function clearPendingUpdate(): void {
  pendingStore.clear();
}

/* ---------- layout-selected：本插件私有，自己读写 ---------- */

function readJson(key: string): any {
  const s = browserStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    // 损坏就当没有，顺手清掉避免反复解析失败
    try { s.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const s = browserStorage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    // 配额满 / 隐私模式：记不上就算了，不影响主流程
  }
}

/** 记录最近选中的主面板 key；回会话页（selectPanel(null)）时写空串。 */
export function writeLayoutSelected(key: string | null | undefined): void {
  writeJson(KEY_LAYOUT, { key: typeof key === 'string' ? key : '' });
}

/** 读最近选中的主面板 key；没有则返回空串（表示「无」）。 */
export function readLayoutSelected(): string {
  const value = readJson(KEY_LAYOUT);
  if (!value || typeof value !== 'object') return '';
  return typeof (value as any).key === 'string' ? (value as any).key : '';
}

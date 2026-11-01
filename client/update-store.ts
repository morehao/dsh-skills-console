/**
 * 浏览器侧最小本地存储：只服务两件「跨进程存活」的小事，与 Host 的 state.json 完全无关。
 *
 * 存在的理由：插件自更新会先把运行中的自己卸载，面板随之消失，弹窗里的「请重启」提示也一起没了。
 * 把「我刚才点过更新」记在 localStorage，重开（新进程重新装载 client、重新 apply）时就能读回，
 * 渲染一条不随面板消失的恢复提示——这正是宿主界面里唯一能承载这句提示的位置。
 *
 * 两条记录：
 * - `update-pending`：点一键更新、动手前写入 `{ from, to, at }`；恢复提示读到后即清除。
 * - `layout-selected`：最近一次 `selectPanel(mainKey)` 的 key（回会话页时写空串），
 *   供启动时做一次「上次选中的主面板当前没注册 → 回退会话页」的卫生处理。
 *
 * 边界（硬性）：
 * - 全程 try/catch：localStorage 不存在（SSR / 测试 vm）/ 隐私模式抛错 / JSON 损坏 → 一律当空处理，
 *   绝不影响插件正常挂载。读写都 fail-open。
 * - 只做前端展示，不参与任何写判据，也不碰 Host 的权威状态。
 */
const PREFIX = 'dsh-skills-console:';
const KEY_PENDING = PREFIX + 'update-pending';
const KEY_LAYOUT = PREFIX + 'layout-selected';

/** 恢复提示最多保留 24h：更久之前的记号多半是没重开就换了别的事，忽略掉免打扰。 */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingUpdate {
  /** 更新前版本（展示用）。 */
  from: string;
  /** 更新目标版本（展示用）。 */
  to: string;
  /** 写入时刻（毫秒时间戳），用于过期判定。 */
  at: number;
}

/** 拿到可用的 Storage；拿不到（无 window / 抛错）返回 null。 */
function storage(): Storage | null {
  try {
    const w: any = typeof window !== 'undefined' ? window : undefined;
    const s = w?.localStorage;
    // 探一次读写，隐私模式可能抛错
    if (!s) return null;
    const probe = `${PREFIX}__probe__`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s as Storage;
  } catch {
    return null;
  }
}

function readJson(key: string): any {
  const s = storage();
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
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    // 配额满 / 隐私模式：记不上就算了，不影响主流程
  }
}

function removeKey(key: string): void {
  const s = storage();
  if (!s) return;
  try { s.removeItem(key); } catch { /* ignore */ }
}

/** 写入「刚点了更新」的记号。 */
export function writePendingUpdate(from: string, to: string, now: number = Date.now()): void {
  writeJson(KEY_PENDING, { from: String(from || ''), to: String(to || ''), at: now });
}

/**
 * 读取「刚点了更新」的记号。结构不符 / 过期 / 损坏返回 null（并清理损坏/过期记录）。
 * @param now 当前时刻，测试可注入。
 */
export function readPendingUpdate(now: number = Date.now()): PendingUpdate | null {
  const value = readJson(KEY_PENDING);
  if (!value || typeof value !== 'object') return null;
  const { from, to, at } = value as any;
  if (typeof at !== 'number' || !Number.isFinite(at)) {
    removeKey(KEY_PENDING);
    return null;
  }
  // 过期（含未来时间戳这种明显异常）：清掉，不展示
  if (now - at > PENDING_TTL_MS || at > now + 60 * 1000) {
    removeKey(KEY_PENDING);
    return null;
  }
  return { from: typeof from === 'string' ? from : '', to: typeof to === 'string' ? to : '', at };
}

/** 清除记号（用户点「知道了」或已确认重开）。 */
export function clearPendingUpdate(): void {
  removeKey(KEY_PENDING);
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

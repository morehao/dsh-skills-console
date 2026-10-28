/** Host API：统一前缀、鉴权头、JSON 错误码。 */
export const API = '/api/morehao/skills-console';

export function short(sha) {
  return sha ? String(sha).slice(0, 7) : '';
}

/**
 * 统一请求入口。
 * `options.signal` 用于可取消的请求（技能简介生成：关抽屉就中止模型调用）。
 */
export async function apiCall(method, path, body, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dsh-skills-console': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    ...(options.signal ? { signal: options.signal } : {}),
  });
  let json = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  if (!response.ok || json.ok === false) {
    const error = new Error(json.message || `HTTP ${response.status}`);
    error.code = json.code;
    error.detail = json.detail;
    throw error;
  }
  return json;
}

export const GITHUB_URL = 'https://github.com/morehao/dsh-skills-console';

/** 插件自身版本检查（GET）。`fresh` 跳过 Host 端 5 分钟缓存。 */
export function checkPluginUpdate({ fresh = false } = {}) {
  return apiCall('GET', `/plugin-update${fresh ? '?fresh=1' : ''}`);
}

/** 把本插件重装到最新版（POST）。不可自动更新时抛 error.plugin-update.manual，detail 是手动命令。 */
export function applyPluginUpdate() {
  return apiCall('POST', '/plugin-update/apply', {});
}

/** 拉某版本的发布说明（GitHub Release 正文）。没有则返回 null。 */
export function fetchPluginRelease(version) {
  return apiCall('GET', `/plugin-update/release?version=${encodeURIComponent(version || '')}`);
}

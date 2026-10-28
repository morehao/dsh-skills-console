/**
 * 插件自更新：检查 npm 上的最新版本，并按需把**本插件自己**重装到最新版。
 *
 * 与 `updates.js` 的区别：那是「技能」的上游检测（走 GitHub Trees），这里是
 * 「插件包自身」的版本检查（走 npm registry），两条链路互不相干。
 *
 * 为什么不用宿主 `pluginManager.inspect` 查最新版：`inspect` 对**已安装的包名**会直接
 * 拒绝 `already-installed`（它只答「我马上要装的 spec 指向什么」，不是「查已装包的最新版」），
 * 宿主 `listBundles` 也不为第三方插件解析最新版（`installTarget` 只给官方目录条目）。
 * 所以最新版只能自己查 registry —— 但**走宿主 `pluginManager.registries()` 拿到的 registry
 * 计划**（继承 profile 的镜像 / 私有源 / token 配置），拿不到才退回官方 registry。
 *
 * 设计取舍（对齐本机同类插件 archive-manager / ds-bot 的轻量做法，但更保守）：
 * - 依次问 registry 计划里的 `<base><pkg>/latest`，8s 超时，只取 `version` 字段；失败不抛，返回 null。
 * - 版本比较手写（本仓 runtime 依赖只有 tar，不引入 semver）；结构非法一律判「不更新」。
 * - 安装只走宿主 `pluginManager.installBundle`（桌面端官方能力）；拿不到就抛
 *   `error.plugin-update.manual`，把手动命令放进 detail 让前端展示/复制。
 * - 不落盘、不加锁：一次点击只触发一次，`applying` 由路由层单飞守住；重启由用户决定。
 */
import { readFileSync } from 'node:fs';

import { ServiceError } from './service.js';

export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;

/** 插件身份：包名与当前版本。从 package.json 读一次，避免和 page 头硬编码漂移。 */
export const PLUGIN_META = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    const match = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(String(repo || ''));
    return {
      name: String(pkg.name || ''),
      version: String(pkg.version || ''),
      repo: match ? match[1] : null,
    };
  } catch {
    return { name: '', version: '', repo: null };
  }
})();

/** 解析 semver：`v1.2.3` / `1.2.3-beta.1` / `1.2.3+build`。非法返回 undefined。 */
function parseSemver(value) {
  const text = String(value ?? '').trim();
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text);
  if (match === null) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const an = BigInt(a);
      const bn = BigInt(b);
      if (an !== bn) return an > bn ? 1 : -1;
      continue;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

/** `candidate` 是否严格新于 `current`。任一方不是合法 semver 都判 false（宁可不更新）。 */
export function isNewerVersion(current, candidate) {
  const a = parseSemver(current);
  const b = parseSemver(candidate);
  if (a === undefined || b === undefined) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b.core[index] !== a.core[index]) return b.core[index] > a.core[index];
  }
  return comparePrerelease(b.prerelease, a.prerelease) > 0;
}

/** npm 包名转成 registry 路径：`@scope/name` → `@scope%2Fname`。 */
function encodePackageName(name) {
  return name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

/** 手动更新命令（前端展示/复制用），按已发布包 + 当前 profile 拼。 */
function manualCommand(meta, profileName) {
  const spec = `${meta.name}@latest`;
  return profileName
    ? `dsh plugin --profile ${profileName} add ${spec}`
    : `dsh plugin add ${spec}`;
}

/** registry 归一成 `https://host/` 形式；非法返回 null。 */
function normalizeRegistry(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(`${text}/`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * 由宿主 `registries()` 结果拼出要问的 registry 顺序：
 * `resolved`（pnpm 实际用的）→ `registry` → `fallbackRegistries`，去重；空则回退官方 registry。
 */
function registryPlan(registries) {
  const ordered = [];
  const push = (value) => {
    const normalized = normalizeRegistry(value);
    if (normalized && !ordered.includes(normalized)) ordered.push(normalized);
  };
  if (registries && typeof registries === 'object') {
    push(registries.resolved);
    push(registries.registry);
    for (const item of Array.isArray(registries.fallbackRegistries) ? registries.fallbackRegistries : []) push(item);
  }
  if (ordered.length === 0) ordered.push(OFFICIAL_REGISTRY);
  return ordered;
}

/**
 * @param {object} deps
 * @param {() => any} deps.getPluginManager  取宿主 `pluginManager`（可能 undefined）
 * @param {() => string | null} [deps.getProfileName]  取当前 profile 名（仅用于手动命令）
 * @param {typeof fetch} [deps.fetchImpl]  测试注入
 * @param {() => number} [deps.now]  测试注入
 */
export function createPluginUpdate({ getPluginManager, getProfileName, fetchImpl = globalThis.fetch, now = Date.now, meta = PLUGIN_META } = {}) {
  let cache = null; // { version, expiresAt }
  let applying = false; // 路由层单飞：同一时刻只允许一次安装

  /**
   * 依次问 registry 计划里的 `<base><pkg>/latest`；第一个给出合法版本的为准。
   * 全部失败返回 null（不抛，交给视图标 checkFailed）。
   */
  async function latestVersion() {
    if (!meta.name) return null;
    if (cache && now() < cache.expiresAt) return cache.version;
    const plan = registryPlan(await readRegistries());
    for (const base of plan) {
      try {
        const response = await fetchImpl(`${base}${encodePackageName(meta.name)}/latest`, {
          headers: { accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) continue;
        const value = await response.json();
        const version = typeof value?.version === 'string' ? value.version.trim() : '';
        if (parseSemver(version) === undefined) continue;
        cache = { version, expiresAt: now() + CACHE_TTL_MS, registry: base };
        return version;
      } catch {
        // 这个 registry 不通 / 超时：试下一个
      }
    }
    return null;
  }

  /** 从宿主 `pluginManager.registries()` 取 registry 配置；拿不到返回 null（走官方 registry）。 */
  async function readRegistries() {
    const service = rawService();
    if (service === null || typeof service.registries !== 'function') return null;
    try {
      return await service.registries();
    } catch {
      return null;
    }
  }

  /** 宿主的 `pluginManager` 服务（任意能力）；拿不到返回 null。 */
  function rawService() {
    try {
      const value = typeof getPluginManager === 'function' ? getPluginManager() : undefined;
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  /** 能做安装的 `pluginManager`（需 `installBundle`）；拿不到返回 null。 */
  function manager() {
    const service = rawService();
    return service && typeof service.installBundle === 'function' ? service : null;
  }

  function profileName() {
    try {
      const value = typeof getProfileName === 'function' ? getProfileName() : null;
      return typeof value === 'string' && value ? value : null;
    } catch {
      return null;
    }
  }

  /** 组一份给前端的视图；`canAutoUpdate=false` 时前端只展示手动命令。 */
  function view({ latest, checkFailed = false } = {}) {
    const current = meta.version;
    const updateAvailable = latest !== null && latest !== undefined && isNewerVersion(current, latest);
    return {
      packageName: meta.name,
      currentVersion: current,
      latestVersion: latest ?? null,
      updateAvailable,
      checkFailed,
      canAutoUpdate: manager() !== null,
      manualCommand: manualCommand(meta, profileName()),
      applying,
    };
  }

  /** GET：读最新版本并返回视图。网络失败不抛，用 checkFailed 标记。 */
  async function check({ fresh = false } = {}) {
    if (fresh) cache = null;
    const latest = await latestVersion();
    return view({ latest, checkFailed: latest === null });
  }

  /**
   * POST：把本插件重装到最新版。
   * - 先再查一次，确认确实落后，避免拿过期信息装一个「已是最新」；
   * - 没有 pluginManager → 抛 manual，带手动命令；
   * - 安装中重复点击 → 抛 busy。
   */
  async function apply() {
    if (applying) {
      throw new ServiceError('error.plugin-update.busy', '插件正在更新，请稍候', null, 409);
    }
    const latest = await latestVersion();
    if (latest === null) {
      throw new ServiceError('error.plugin-update.check-failed', '暂时无法获取最新版本，请稍后再试', manualCommand(meta, profileName()), 503);
    }
    if (!isNewerVersion(meta.version, latest)) {
      return { ...view({ latest }), updatedVersion: null };
    }
    const pm = manager();
    if (pm === null) {
      throw new ServiceError(
        'error.plugin-update.manual',
        '当前环境不支持自动更新，请手动执行命令',
        manualCommand(meta, profileName()),
        409,
      );
    }
    applying = true;
    try {
      // 用查到最新版的那个 registry 去装，和「问」保持一致；没有就用宿主默认（不传 options）
      const registry = cache?.version === latest ? cache.registry : undefined;
      const result = await pm.installBundle(
        `${meta.name}@${latest}`,
        registry ? { registry } : undefined,
      );
      if (result?.error || !['applied', 'restart-required', 'overridden'].includes(result?.application)) {
        const message = result?.error?.diagnostic || result?.error?.message || result?.error?.code || '更新失败';
        throw new ServiceError('error.plugin-update.install-failed', String(message).slice(0, 600), manualCommand(meta, profileName()), 500);
      }
      cache = { version: latest, expiresAt: now() + CACHE_TTL_MS, registry };
      return {
        ...view({ latest }),
        updateAvailable: false,
        updatedVersion: latest,
        restartRequired: true,
      };
    } finally {
      applying = false;
    }
  }

  // GitHub Release 正文缓存：key = version
  const releaseCache = new Map();

  /**
   * 拉某个版本的 GitHub Release 正文（发布说明）。
   * - tag 用 `vX.Y.Z`（本仓发布约定），请求 `api.github.com/repos/<repo>/releases/tags/vX`;
   * - 失败（无 repo / 网络 / 404 / 超时）返回 null，不抛；前端据此退回「查看发布说明」链接；
   * - 只读 GitHub 公开 API，不读本机任何文件。
   */
  async function releaseNotes(version) {
    const target = String(version || '').trim();
    if (!meta.repo || parseSemver(target) === undefined) return null;
    const cached = releaseCache.get(target);
    if (cached && now() < cached.expiresAt) return cached.value;
    const tag = `v${target.replace(/^v/, '')}`;
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${meta.repo}/releases/tags/${tag}`, {
        headers: { accept: 'application/vnd.github+json' },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const value = response.ok
        ? await response.json().then((release) => ({
            version: target,
            body: typeof release?.body === 'string' ? release.body : '',
            htmlUrl: typeof release?.html_url === 'string' ? release.html_url : null,
            name: typeof release?.name === 'string' ? release.name : null,
          }))
        : null;
      releaseCache.set(target, { value, expiresAt: now() + RELEASE_CACHE_TTL_MS });
      return value;
    } catch {
      // 失败也短缓存，避免连点重复打网络；10 分钟后自然重试
      releaseCache.set(target, { value: null, expiresAt: now() + RELEASE_CACHE_TTL_MS });
      return null;
    }
  }

  return { check, apply, releaseNotes };
}

/**
 * 插件自更新：检查 npm 上的最新版本，并按需把**本插件自己**重装到最新版。
 *
 * 与 `updates.js` 的区别：那是「技能」的上游检测（走 GitHub Trees），这里是
 * 「插件包自身」的版本检查（走 npm registry），两条链路互不相干。
 *
 * 引擎已经收敛到共享包 `@morehao/dsh-plugin-kit`（semver / registry 计划 / 超时 / 缓存 /
 * 依次问 registry / `installBundle` + `already-installed` 先 remove 再 install 的重装流程都在包里）。
 * 本文件只保留 dsh-skills-console 特有的三件事：
 *   - 本仓的对外契约：`check()` 返回 `canAutoUpdate` 视图、`apply()` 抛 `ServiceError`
 *     （`error.plugin-update.*`），路由回执与前端字段都依赖这套形状；
 *   - GitHub Release 正文（`releaseNotes`）：走 kit `./github` 的 `createReleaseReader`
 *     （v<version> tag / accept vnd.github+json / 失败短缓存 / 非法版本不发请求，与历史逐字对齐）；
 *   - 旧符号 re-export（`isNewerVersion` / `parseSemver` / `registryPlan` / `OFFICIAL_REGISTRY`），
 *     让 `routes.ts` / `service.ts` / `test/*.mjs` 不用一起改。
 *
 * kit 的 `createPluginUpdater` 是 host 引擎：`check()` 出视图、`apply()` 经宿主 `pluginManager`
 * 重装，错误统一为 `PluginUpdateError`（`NO_MANAGER` / `NOT_CHECKED` / `NO_UPDATE` /
 * `INSTALL_FAILED` 等）。本文件把它的错误码映射回本仓的 `ServiceError` 码，保证 HTTP 回执
 * 与前端错误提示不变。
 */
import {
  OFFICIAL_REGISTRY,
  isNewerVersion,
  manualCommand as kitManualCommand,
  parseSemver,
  registryPlan,
} from '@morehao/dsh-plugin-kit';
import { createReleaseReader } from '@morehao/dsh-plugin-kit/github';
import { createPluginMeta } from '@morehao/dsh-plugin-kit/meta';
import { createPluginUpdater } from '@morehao/dsh-plugin-kit/update';

import { ServiceError } from './service.js';

export { OFFICIAL_REGISTRY, isNewerVersion, parseSemver, registryPlan };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;

/** 本插件 `package.json` 的导入地址：供 kit 每次 check 现读「磁盘已安装版本」。 */
export const PLUGIN_PKG_URL = new URL('../../package.json', import.meta.url);

/** 插件身份：包名与当前版本。从 package.json 读一次，避免和 page 头硬编码漂移。 */
export const PLUGIN_META = createPluginMeta({
  pkgUrl: PLUGIN_PKG_URL,
  defaultName: '@morehao/dsh-skills-console',
});

/** 手动更新命令（前端展示/复制用），按已发布包 + 当前 profile 拼。 */
function manualCommand(meta, profileName) {
  return kitManualCommand(meta.name, profileName);
}

/**
 * kit 错误码 → 本仓 `ServiceError`。detail 一律放手动命令，方便前端复制兜底。
 * - NO_MANAGER / LINKED_INSTALL：不能一键更新，给手动命令；
 * - NOT_CHECKED / INVALID_VERSION：拿不到可用最新版；
 * - APPLY_IN_PROGRESS：正在更新；
 * - 其余（INSTALL_FAILED / REMOVE_FAILED / ROLLBACK_FAILED / UNSUPPORTED_RESULT）：安装失败。
 */
function toServiceError(error, manual) {
  const code = error?.code;
  const message = String(error?.message ?? error);
  switch (code) {
    case 'NO_MANAGER':
    case 'LINKED_INSTALL':
      return new ServiceError('error.plugin-update.manual', message.slice(0, 600), manual, 409);
    case 'NOT_CHECKED':
    case 'INVALID_VERSION':
      return new ServiceError('error.plugin-update.check-failed', message.slice(0, 600), manual, 503);
    case 'APPLY_IN_PROGRESS':
      return new ServiceError('error.plugin-update.busy', '插件正在更新，请稍候', null, 409);
    default:
      // REMOVE_FAILED：宿主在当前 profile 未启用 HMR 时会以 stop-profile 拒绝卸载，
      // 这是「要先完全退出 DSH 再手动更新」的信号，给一句人能看懂的提示。
      if (code === 'REMOVE_FAILED' && /stop-profile/.test(message)) {
        return new ServiceError(
          'error.plugin-update.install-failed',
          '插件正在运行且当前 profile 未启用 HMR，请完全退出 DSH 后手动更新',
          manual,
          500,
        );
      }
      return new ServiceError('error.plugin-update.install-failed', message.slice(0, 600), manual, 500);
  }
}

/**
 * @param {object} deps
 * @param {() => any} deps.getPluginManager  取宿主 `pluginManager`（可能 undefined）
 * @param {() => string | null} [deps.getProfileName]  取当前 profile 名（仅用于手动命令）
 * @param {typeof fetch} [deps.fetchImpl]  测试注入
 * @param {() => number} [deps.now]  测试注入
 * @param {(event: string, detail?: object) => void} [deps.logger]  事件日志（缺省丢弃）
 */
export function createPluginUpdate({ getPluginManager, getProfileName, fetchImpl = globalThis.fetch, now = Date.now, meta = PLUGIN_META, stateStore, readInstalledVersion, logger = () => {} }: any = {}) {
  // 默认身份补齐 pkgUrl：让 kit 每次 check 现读磁盘已安装版本（唯一真相）。
  const metaWithUrl = meta.pkgUrl === undefined && meta === PLUGIN_META ? { ...meta, pkgUrl: PLUGIN_PKG_URL } : meta;
  // 单飞由 kit 引擎内部维护（applying），这里只在 apply 前再查一次保证最新。
  let applying = false; // 本仓视图里的 applying 标记，与 kit 的 isApplying 对齐

  // 「当前版本 / 是否落后 / 是否待重启」全部由 kit 按磁盘真身判定（kit 0.5.0 起）。
  // 本仓不再自维护 appliedVersion 内存变量：那是历史半吊子收敛，只在「同进程 apply」时生效，
  // 重启即失效，正是「更新完仍提示有新版本」的根源。
  const updater = createPluginUpdater({
    meta: {
      name: metaWithUrl.name,
      version: metaWithUrl.version,
      // pkgUrl：让 kit 每次 check 现读磁盘已安装版本（唯一真相）。显式给才有；测试可省略以回退 meta.version。
      ...(metaWithUrl.pkgUrl === undefined ? {} : { pkgUrl: metaWithUrl.pkgUrl }),
      ...(metaWithUrl.repository === undefined ? {} : { repository: metaWithUrl.repository }),
    },
    ...(typeof getPluginManager === 'function' ? { getPluginManager } : {}),
    ...(typeof getProfileName === 'function' ? { getProfileName } : {}),
    ...(stateStore === undefined ? {} : { stateStore }),
    ...(typeof readInstalledVersion === 'function' ? { readInstalledVersion } : {}),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
    ...(now === undefined ? {} : { now }),
    cacheTtlMs: CACHE_TTL_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    logger,
  });

  function profileName() {
    try {
      const value = typeof getProfileName === 'function' ? getProfileName() : null;
      return typeof value === 'string' && value ? value : null;
    } catch {
      return null;
    }
  }

  /** 把手动命令 / applying / 磁盘版本真相叠到 kit 视图上，得到本仓前端契约的形状。 */
  function view(raw) {
    return {
      packageName: raw.packageName,
      currentVersion: raw.currentVersion, // 磁盘已安装版本
      runtimeVersion: raw.runtimeVersion, // 本进程加载的代码版本（诊断用）
      latestVersion: raw.latestVersion,
      updateAvailable: raw.updateAvailable,
      restartRequired: Boolean(raw.restartRequired),
      checkFailed: raw.checkFailed,
      canAutoUpdate: raw.canApply,
      manualCommand: raw.manualCommand || manualCommand(meta, profileName()),
      applying: raw.applying || applying,
    };
  }

  /**
   * GET：读最新版本并返回视图。网络失败不抛，用 checkFailed 标记。
   * 「是否有新版」由 kit 基于磁盘已安装版本判定——更新完未重启不再谎报；真正生效需重启由
   * `restartRequired` 如实表达，前端据此展示「已更新 · 重启生效」。
   */
  async function check({ fresh = false }: any = {}) {
    return view(await updater.check({ fresh }));
  }

  /**
   * POST：把本插件重装到最新版。
   * - 先再查一次（fresh），确认确实落后：kit 的 apply 依赖上一次 check 的视图；
   * - 没有 pluginManager → 映射为 manual（带手动命令）；
   * - 安装中重复点击 → 映射为 busy；
   * - 磁盘已是最新 → 直接返回 updatedVersion: null（kit 会抛 NO_UPDATE，这里前置挡掉）。
   */
  async function apply() {
    if (applying) {
      logger('plugin.update.apply.busy', { version: meta.version });
      throw new ServiceError('error.plugin-update.busy', '插件正在更新，请稍候', null, 409);
    }
    applying = true;
    const manual = manualCommand(meta, profileName());
    try {
      // 先查一次：既刷新 latestView（kit apply 依赖它），也避免拿过期信息装一个「已是最新」。
      const raw = await updater.check({ fresh: true });
      if (raw.checkFailed || raw.latestVersion === null) {
        throw new ServiceError('error.plugin-update.check-failed', '暂时无法获取最新版本，请稍后再试', manual, 503);
      }
      // 磁盘已是最新（updateAvailable 基于磁盘版本）→ 不再重装，避免重复卸载重装同一版本。
      if (!raw.updateAvailable || !isNewerVersion(raw.currentVersion, raw.latestVersion)) {
        return { ...view(raw), updateAvailable: false, updatedVersion: null, applying: false };
      }
      try {
        const result = await updater.apply();
        // 用 check() 统一收敛 view：kit 按磁盘版本判定，apply 后磁盘已最新 → updateAvailable=false、
        // restartRequired=true（若进程仍是旧代码）。重启后新进程同样如此。
        return {
          ...(await check({ fresh: false })),
          updateAvailable: false,
          updatedVersion: result.updatedVersion,
          restartRequired: result.restartRequired !== false,
          applying: false,
        };
      } catch (error) {
        throw toServiceError(error, manual);
      }
    } finally {
      applying = false;
    }
  }

  // GitHub Release 正文读取器（懒建，repo 缺失时不建）。语义走 kit `./github`：
  // - tag 用 `vX.Y.Z`（本仓发布约定），请求 `api.github.com/repos/<repo>/releases/tags/vX`；
  // - 失败（无 repo / 网络 / 404 / 超时 / 非法版本）返回 null，不抛；前端据此退回「查看发布说明」链接；
  // - 成功与失败都按 version 短缓存（10 分钟），非法版本不发请求；只读 GitHub 公开 API。
  const repoSlug = typeof meta.repo === 'string' ? meta.repo.trim() : '';
  const releaseReader = repoSlug
    ? createReleaseReader({
        repo: repoSlug,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
        ...(now === undefined ? {} : { now }),
        ttlMs: RELEASE_CACHE_TTL_MS,
        timeoutMs: FETCH_TIMEOUT_MS,
      })
    : null;

  /** 拉某个版本的 GitHub Release 正文（发布说明）。无 repo / 非法版本 / 失败 → null，不抛。 */
  async function releaseNotes(version) {
    if (!releaseReader) return null;
    return releaseReader.release(version);
  }

  return { check, apply, releaseNotes };
}

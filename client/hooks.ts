/**
 * Section 的数据与交互 hooks：只依赖 React 与 api，不渲染任何 DOM。
 * 状态尽量收在这里，让 Section 只做派生值与拼装。
 */
import React from 'react';
import { createUpdateController } from '@morehao/dsh-plugin-kit/update/client';

import { apiCall, checkPluginUpdate, applyPluginUpdate, fetchPluginRelease } from './api.js';
import type {
  AgentTipPosition,
  AgentTipState,
  RunFn,
  SettingsPlacement,
  SkillRow,
  SkillsState,
  Toast,
} from './api.js';

const TOAST_MS = 4200;

/** 清单 / 错误 / 忙碌 / toast：挂载即拉一次 /state，变更动作统一走 run。 */
export function useSkillsData() {
  const [data, setData] = React.useState<SkillsState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<Toast | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const next = await apiCall('GET', '/state');
      setData(next);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // `toastError: false` 用于「错误由调用方在弹窗内联展示」的动作：仍统一走 busy / reload，
  // 但不弹全局错误 toast，避免和弹窗内提示重复。默认 true，其余调用点不用改。
  const run = React.useCallback<RunFn>(
    async (label, task, { toastError = true } = {}) => {
      setBusy(label);
      try {
        const result = await task();
        await reload();
        return result;
      } catch (err) {
        if (toastError) setToast({ kind: 'err', text: err.message });
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  return { data, error, busy, toast, setToast, setBusy, reload, run };
}

/** 页头设置浮层：开关、锚点、按左右余量选边与宽度。 */
export function useSettingsPopover() {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<Element | null>(null);
  // 面板朝哪边展开、多宽：齿轮不在标题行右端，固定 left/right 在窄面板里会出界
  const [settingsPlacement, setSettingsPlacement] = React.useState<SettingsPlacement>({ side: 'left', width: 286 });

  // 点外面或按 Esc 关掉；用 closest 判断，避免按钮自己把自己关掉
  React.useEffect(() => {
    if (!settingsOpen || typeof document === 'undefined') return undefined;
    const close = () => setSettingsOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event?.target as Element | null;
      if (target && typeof target.closest === 'function'
        && (target.closest('.dshsc-settings') || target.closest('.dshsc-pop'))) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event?.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // 宽度按打开时的余量算，窗口变了就收起，避免重新计算时机太散
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [settingsOpen]);

  function toggleSettings() {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    const anchor = settingsRef.current;
    if (anchor && typeof window !== 'undefined') {
      const rect = anchor.getBoundingClientRect();
      const root = typeof anchor.closest === 'function' ? anchor.closest('.dshsc-root') : null;
      const rootRect = root ? root.getBoundingClientRect() : { left: 8, right: window.innerWidth - 8 };
      const spaceRight = rootRect.right - rect.left;
      const spaceLeft = rect.right - rootRect.left;
      const side = spaceRight >= spaceLeft ? 'right' : 'left';
      const width = Math.max(180, Math.min(286, (side === 'right' ? spaceRight : spaceLeft) - 8));
      setSettingsPlacement({ side, width });
    }
    setSettingsOpen(true);
  }

  return { settingsOpen, settingsRef, settingsPlacement, closeSettings: () => setSettingsOpen(false), toggleSettings };
}

/** “+n” 的悬浮列表：labels + 锚点矩形；位置在 layout effect 里量出来再落。 */
export function useAgentTip() {
  const [agentTip, setAgentTip] = React.useState<AgentTipState | null>(null);
  const [agentTipPos, setAgentTipPos] = React.useState<AgentTipPosition | null>(null);
  const agentTipRef = React.useRef<HTMLElement | null>(null);

  // 滚动 / 改窗口 / 点别处 / Esc 都关掉，避免它停在旧位置
  React.useEffect(() => {
    if (!agentTip) return undefined;
    const close = () => {
      setAgentTip(null);
      setAgentTipPos(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (agentTip.anchor && event?.target === agentTip.anchor) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event?.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown);
      }
    };
  }, [agentTip]);

  // 先渲染（隐藏）再量宽高：贴着锚点底部，出屏就翻到上方
  React.useLayoutEffect(() => {
    if (!agentTip || typeof window === 'undefined') return;
    const node = agentTipRef.current;
    if (!node) return;
    const width = node.offsetWidth || 0;
    const height = node.offsetHeight || 0;
    const { left, right, top, bottom } = agentTip.rect;
    const nextLeft = Math.max(8, Math.min(left + (right - left) / 2 - width / 2, window.innerWidth - width - 8));
    let nextTop = bottom + 6;
    if (nextTop + height > window.innerHeight - 8) nextTop = Math.max(8, top - height - 6);
    setAgentTipPos({ left: nextLeft, top: nextTop });
  }, [agentTip]);

  function openAgentTip(event: React.SyntheticEvent, rowName: string, labels: string[]) {
    if (agentTip?.rowName === rowName) return;
    const anchor = event?.currentTarget;
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    const rect = anchor.getBoundingClientRect();
    setAgentTipPos(null);
    setAgentTip({
      anchor,
      rowName,
      labels,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    });
  }

  function closeAgentTip() {
    setAgentTip(null);
    setAgentTipPos(null);
  }

  return { agentTip, agentTipPos, agentTipRef, openAgentTip, closeAgentTip };
}

/**
 * 查看器数据：并行拉正文与文件树，`loadFile` 按需拉单个文件。
 * 只读接口，绝不触发写动作；请求带序号，晚到的响应直接丢弃（切技能 / 关闭时不会串数据）。
 */
export function useSkillReader(row: SkillRow | null) {
  const name = row?.name || null;
  // 同一技能的 commit / 哈希 / 更新时间变了（更新过、启停过）就重拉，避免显示旧正文
  const stamp = row
    ? [row.commit || '', row.currentHash || '', row.updatedAt || '', row.status || ''].join('|')
    : '';
  const [state, setState] = React.useState<any>({ loading: true, body: null, tree: null, bodyError: null, treeError: null });
  const [file, setFile] = React.useState<any>({ relPath: null, content: '', size: 0, truncated: false, loading: false, error: null });
  const [tick, setTick] = React.useState(0);
  const seq = React.useRef(0);
  const fileSeq = React.useRef(0);

  React.useEffect(() => {
    if (!name) {
      setState({ loading: false, body: null, tree: null, bodyError: null, treeError: null });
      return;
    }
    const ticket = seq.current + 1;
    seq.current = ticket;
    setState({ loading: true, body: null, tree: null, bodyError: null, treeError: null });
    const encoded = encodeURIComponent(name);
    void (async () => {
      const [bodyResult, treeResult] = await Promise.allSettled([
        apiCall('GET', `/skills/${encoded}`),
        apiCall('GET', `/skills/${encoded}/files`),
      ]);
      if (ticket !== seq.current) return;
      setState({
        loading: false,
        body: bodyResult.status === 'fulfilled' ? bodyResult.value : null,
        tree: treeResult.status === 'fulfilled' ? treeResult.value : null,
        // 没有 SKILL.md 时正文失败但树还在：文件 tab 仍可用
        bodyError: bodyResult.status === 'rejected'
          ? { code: bodyResult.reason?.code || null, message: bodyResult.reason?.message || '读取失败' }
          : null,
        treeError: treeResult.status === 'rejected'
          ? { code: treeResult.reason?.code || null, message: treeResult.reason?.message || '读取失败' }
          : null,
      });
    })();
  }, [name, stamp, tick]);

  const loadFile = React.useCallback(async (relPath: string) => {
    if (!name || !relPath) return;
    const ticket = fileSeq.current + 1;
    fileSeq.current = ticket;
    setFile({ relPath, content: '', size: 0, truncated: false, loading: true, error: null });
    try {
      const result = await apiCall('GET', `/skills/${encodeURIComponent(name)}?path=${encodeURIComponent(relPath)}`);
      if (ticket !== fileSeq.current) return;
      setFile({
        relPath: result.relPath || relPath,
        content: result.content || '',
        size: result.size || 0,
        truncated: Boolean(result.truncated),
        loading: false,
        error: null,
        mtime: result.mtime || null,
      });
    } catch (error) {
      if (ticket !== fileSeq.current) return;
      setFile({
        relPath,
        content: '',
        size: 0,
        truncated: false,
        loading: false,
        error: { code: error?.code || null, message: error?.message || '读取失败' },
      });
    }
  }, [name]);

  const retry = React.useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  return { state, file, loadFile, retry };
}

/**
 * 技能简介（模型生成）：点行内 ✨ 只 GET 缓存，点「生成简介」才 POST。
 * - 换技能 / 换语言 / 技能内容变了 → 重新读缓存；
 * - 浮层关闭或换技能 → abort 在跑的生成（Host 侧会因此取消模型调用）。
 */
export interface SkillIntroOptions {
  name: string;
  lang: string;
  stamp: string;
  enabled?: boolean;
  endpoint?: string | null;
}

export function useSkillIntro({ name, lang, stamp, enabled = true, endpoint = null }: SkillIntroOptions) {
  const base = endpoint || `/skills/${encodeURIComponent(name)}/intro`;
  const [state, setState] = React.useState<any>({ loading: true, intro: null, capability: null, error: null });
  const [generating, setGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState<any>(null);
  const seq = React.useRef(0);
  const controller = React.useRef<any>(null);

  React.useEffect(() => {
    if (!name || !enabled) {
      setState({ loading: false, intro: null, capability: null, error: null });
      return;
    }
    const ticket = seq.current + 1;
    seq.current = ticket;
    setState({ loading: true, intro: null, capability: null, error: null });
    void (async () => {
      try {
        const result = await apiCall('GET', `${base}?lang=${encodeURIComponent(lang || 'zh')}`);
        if (ticket !== seq.current) return;
        setState({ loading: false, intro: result.intro || null, capability: result.capability || null, error: null });
      } catch (error) {
        if (ticket !== seq.current) return;
        setState({
          loading: false,
          intro: null,
          capability: null,
          error: { code: error?.code || null, message: error?.message || '读取失败' },
        });
      }
    })();
  }, [name, lang, stamp, enabled, base]);

  // 换技能 / 换语言 / 关闭浮层：取消还在跑的生成（Host 侧会把 abort 传给模型）
  React.useEffect(() => () => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
    }
  }, [name, lang, base]);

  const generate = React.useCallback(async (force = false) => {
    if (!name) return null;
    if (controller.current) return null; // 已经有一个在跑，别重复点
    const ctrl = new AbortController();
    controller.current = ctrl;
    setGenerating(true);
    setGenError(null);
    try {
      const result = await apiCall(
        'POST',
        base,
        { lang: lang || 'zh', force: Boolean(force) },
        { signal: ctrl.signal },
      );
      setState({ loading: false, intro: result.intro || null, capability: result.capability || null, error: null });
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      setGenError({ code: error?.code || null, message: error?.message || '生成失败' });
      return null;
    } finally {
      if (controller.current === ctrl) controller.current = null;
      setGenerating(false);
    }
  }, [name, lang, base]);

  return { ...state, generating, genError, generate };
}

/**
 * 插件自身版本检查 / 更新。
 *
 * 状态机复用 `@morehao/dsh-plugin-kit/update/client` 的 `createUpdateController`（与
 * dsh-github-trending 同一套）：`idle → checking → available | current | failed →
 * applying → applied | restart-required`，单飞 / 并发保护 / 错误收敛都由 kit 负责，本文件
 * 只做三件本仓特有的事：
 *   1. 把 Host 的视图字段（`canAutoUpdate` 而非 kit 的 `canApply`）适配成 kit 的 request；
 *   2. 保留对外 `status` 形状（组件按 `pluginUpdate.status.xxx` 读取），由 kit state.view 派生；
 *   3. Release 正文加载（`release` / `loadRelease`）——kit controller 不含这块。
 *
 * controller 是**模块级单例**：页头胶囊与更新弹窗共享同一份状态，不会各打一次网络。
 */
function pluginUpdateRequest() {
  return {
    // Host 视图带 canAutoUpdate / appliedVersion；kit 期望 canApply / installKind。
    // 缺字段时给保守默认（能 auto 但 installKind 未知 → kit 规则 registry|unknown 允许 apply）。
    check: async (options: { fresh?: boolean } = {}) => {
      const raw = await checkPluginUpdate({ fresh: options.fresh === true });
      return {
        packageName: raw.packageName || '',
        currentVersion: raw.currentVersion || '',
        latestVersion: raw.latestVersion ?? null,
        updateAvailable: Boolean(raw.updateAvailable),
        checkFailed: Boolean(raw.checkFailed),
        canApply: raw.canAutoUpdate !== false,
        installKind: raw.canAutoUpdate === false ? 'link' : 'unknown',
        manualCommand: raw.manualCommand || '',
        applying: Boolean(raw.applying),
        // 本进程内已装成的目标版本（跨版本自更新后的过渡态），供 status 派生时收敛。
        appliedVersion: raw.appliedVersion ?? null,
      } as any;
    },
    apply: async () => {
      const raw = await applyPluginUpdate();
      const application: 'applied' | 'restart-required' = raw.restartRequired ? 'restart-required' : 'applied';
      return { application, updatedVersion: String(raw.updatedVersion || ''), restartRequired: Boolean(raw.restartRequired) };
    },
  };
}

let pluginUpdateController: any = null;
function getPluginUpdateController() {
  if (pluginUpdateController === null) {
    pluginUpdateController = createUpdateController({ request: pluginUpdateRequest() });
  }
  return pluginUpdateController;
}

/**
 * 把 kit state 派生成组件消费的 `status` 视图（字段名沿用 Host / 旧实现）。
 * `error.code === 'CHECK_FAILED'` 时 `checkFailed` 置真，与旧 `status.checkFailed` 语义一致。
 */
function statusFromControllerState(state: any) {
  const view = state?.view;
  if (!view) return null;
  const applying = state.status === 'applying';
  const restartRequired = state.status === 'restart-required' || state.status === 'applied';
  return {
    packageName: view.packageName,
    currentVersion: view.currentVersion,
    latestVersion: view.latestVersion,
    updateAvailable: view.updateAvailable,
    checkFailed: Boolean(view.checkFailed) || state.status === 'failed',
    canAutoUpdate: view.canApply !== false,
    manualCommand: view.manualCommand || '',
    applying,
    restartRequired,
    updatedVersion: restartRequired ? view.latestVersion : null,
  };
}

export function usePluginUpdate() {
  const controller = getPluginUpdateController();
  const [state, setState] = React.useState<any>(() => controller.getState());
  // 某版本的发布说明：{ loading, data: {version, body, htmlUrl, name} | null }
  const [release, setRelease] = React.useState<any>({ loading: false, data: null, version: null });

  React.useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    // 首个订阅者挂载时静默检查一次（有 Host 端 5 分钟缓存，连续打开不重复打网络）。
    if (controller.getState().status === 'idle') void controller.check();
    return unsubscribe;
  }, [controller]);

  const check = React.useCallback(async (fresh = false) => {
    await controller.check({ fresh });
    return statusFromControllerState(controller.getState());
  }, [controller]);

  const apply = React.useCallback(async () => {
    await controller.apply();
    return statusFromControllerState(controller.getState());
  }, [controller]);

  const loadRelease = React.useCallback(async (version: string | null | undefined) => {
    const target = String(version || '').trim();
    if (!target) return null;
    setRelease({ loading: true, data: null, version: target });
    try {
      const data = await fetchPluginRelease(target);
      setRelease({ loading: false, data: data || null, version: target });
      return data;
    } catch {
      // 发布说明拉不到（无 Release / 离线）不算错误：前端退回「查看发布说明」链接
      setRelease({ loading: false, data: null, version: target });
      return null;
    }
  }, []);

  const status = statusFromControllerState(state);
  const checking = state.status === 'checking';
  const applying = state.status === 'applying';
  // 统一错误：kit 把 check / apply 的失败都收敛到 state.error；按当前 status 归到 checkError / applyError，
  // 供组件区分「查不到最新版」和「安装失败」两种提示语。
  const failed = state.status === 'failed';
  const checkError = failed && (state.error?.code === 'CHECK_FAILED' || state.error?.code === null || state.error?.code === undefined)
    ? state.error
    : null;
  const applyError = failed && checkError === null ? state.error : null;

  return { status, checking, applying, checkError, applyError, check, apply, release, loadRelease };
}

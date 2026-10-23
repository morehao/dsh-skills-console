/**
 * Section 的数据与交互 hooks：只依赖 React 与 api，不渲染任何 DOM。
 * 状态尽量收在这里，让 Section 只做派生值与拼装。
 */
import React from 'react';

import { apiCall } from './api.js';

const TOAST_MS = 4200;

/** 清单 / 错误 / 忙碌 / toast：挂载即拉一次 /state，变更动作统一走 run。 */
export function useSkillsData() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [toast, setToast] = React.useState(null);

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

  const run = React.useCallback(
    async (label, task) => {
      setBusy(label);
      try {
        const result = await task();
        await reload();
        return result;
      } catch (err) {
        setToast({ kind: 'err', text: err.message });
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
  const settingsRef = React.useRef(null);
  // 面板朝哪边展开、多宽：齿轮不在标题行右端，固定 left/right 在窄面板里会出界
  const [settingsPlacement, setSettingsPlacement] = React.useState({ side: 'left', width: 286 });

  // 点外面或按 Esc 关掉；用 closest 判断，避免按钮自己把自己关掉
  React.useEffect(() => {
    if (!settingsOpen || typeof document === 'undefined') return undefined;
    const close = () => setSettingsOpen(false);
    const onPointerDown = (event) => {
      const target = event?.target;
      if (target && typeof target.closest === 'function'
        && (target.closest('.dshsc-settings') || target.closest('.dshsc-pop'))) return;
      close();
    };
    const onKeyDown = (event) => {
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
  const [agentTip, setAgentTip] = React.useState(null);
  const [agentTipPos, setAgentTipPos] = React.useState(null);
  const agentTipRef = React.useRef(null);

  // 滚动 / 改窗口 / 点别处 / Esc 都关掉，避免它停在旧位置
  React.useEffect(() => {
    if (!agentTip) return undefined;
    const close = () => {
      setAgentTip(null);
      setAgentTipPos(null);
    };
    const onPointerDown = (event) => {
      if (agentTip.anchor && event?.target === agentTip.anchor) return;
      close();
    };
    const onKeyDown = (event) => {
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

  function openAgentTip(event, rowName, labels) {
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

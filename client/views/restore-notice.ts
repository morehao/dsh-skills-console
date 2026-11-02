/**
 * 自更新后的「恢复提示」：一条出现在右下角、几秒后自动消失的提示条。
 *
 * 为什么单独成视图、且不挂在 Section 里：插件一键更新会先卸载自己，`settings.section` /
 * `sidebar.panellist` 注册随之注销、面板消失，「请重启」的提示也会一起没掉。这条提示改由
 * `app.ts` 在 apply 时独立挂载（生命周期跟插件 apply 绑定，不跟某个入口绑定），并且只在
 * `localStorage` 里读到「刚点过更新」的记号时出现——即重开后的新进程才会看到它。
 *
 * 它**不常驻**：出现几秒后自动收起（同时清除记号）；用户也可点「知道了」立即收起，
 * 或点「重新检查更新」去更新弹窗（面板回来了，交给正常入口）。
 */
import React from 'react';
import type { ReactNode } from 'react';

import { h, overlayHost, portalize } from '../host.js';
import type { Translate } from '../copy.js';

/** 自动收起前的停留时长（毫秒）。 */
const AUTO_DISMISS_MS = 6000;

export interface RestoreNoticeProps {
  t: Translate;
  /** 目标版本（展示用）；空则只说「已更新」。 */
  version?: string;
  onDismiss: () => void;
  /** 打开更新弹窗（可选）；没给就不渲染该按钮。 */
  onRecheck?: () => void;
}

export function RestoreNotice({ t, version, onDismiss, onRecheck }: RestoreNoticeProps): ReactNode {
  const title = version
    ? t('restoreNotice.title').replace('{version}', version)
    : t('restoreNotice.title').replace('{version}', '');
  const body = t('restoreNotice.body').replace(/\{version\}/g, version || '');
  // 不常驻：停留几秒后自动收起（清除记号）。用户提前点「知道了」/「重新检查更新」也会触发卸载。
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return portalize(
    h('div', { className: 'dshsc-restore', role: 'status', 'aria-live': 'polite' },
      h('div', { className: 'dshsc-restore-text' },
        h('div', { className: 'dshsc-restore-title' }, title.trim()),
        h('div', { className: 'dshsc-restore-body' }, body.trim()),
      ),
      h('div', { className: 'dshsc-restore-actions' },
        onRecheck
          ? h('button', { className: 'dshsc-btn ghost', type: 'button', onClick: () => onRecheck() }, t('restoreNotice.recheck'))
          : null,
        h('button', { className: 'dshsc-btn primary', type: 'button', onClick: () => onDismiss() }, t('restoreNotice.dismiss')),
      ),
    ),
    overlayHost(),
  );
}

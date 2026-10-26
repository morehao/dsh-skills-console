/**
 * 所有写操作：统一经 run 包住 busy / reload / toast，视图只拿回调。
 * 纯工厂（内部不用 React hook），只依赖 api。
 */
import { apiCall, short } from './api.js';

export function useSkillActions({ t, rows, reload, run, setBusy, setToast, setModal }) {
  async function adopt(row) {
    await run(`adopt:${row.name}`, async () => {
      const result = await apiCall('POST', `/skills/${encodeURIComponent(row.name)}/adopt`, {});
      setToast({ kind: 'ok', text: `${row.name} · ${result.tracked ? t('adopt.done') : t('adopt.noUpstream')}` });
      return result;
    });
  }

  async function toggleMode(row) {
    const mode = row.enabled === false ? 'on' : 'off';
    await run(`mode:${row.name}`, () => apiCall('POST', `/skills/${encodeURIComponent(row.name)}/mode`, { mode }));
  }

  /** 三档调用策略：auto / manual / hidden；失败由 run 统一 toast。 */
  async function setInvocation(row, mode) {
    await run(`invocation:${row.name}`, async () => {
      const result = await apiCall('POST', `/skills/${encodeURIComponent(row.name)}/invocation`, { mode });
      const saved = mode === 'hidden'
        ? t('policy.savedHidden')
        : mode === 'manual'
          ? t('policy.savedManual')
          : t('policy.savedAuto');
      setToast({ kind: 'ok', text: `${row.name} · ${saved}` });
      return result;
    });
  }

  async function unpark(row) {
    await run(`unpark:${row.name}`, async () => {
      const result = await apiCall('POST', `/skills/${encodeURIComponent(row.name)}/unpark`, {});
      setToast({
        kind: result.hashMismatch ? 'err' : 'ok',
        text: result.kept
          ? `${row.name} · ${t('policy.unparkKept').replace('{path}', result.kept)}`
          : result.hashMismatch
            ? `${row.name} · ${t('policy.unparkDrift')}`
            : `${row.name} · ${t('policy.unparkDone')}`,
      });
      return result;
    });
  }

  function requestUnpark(row) {
    setModal({
      type: 'confirm-unpark',
      row,
      onConfirm: () => {
        setModal(null);
        void unpark(row);
      },
    });
  }

  async function updateOne(row, overwrite) {
    await run(`update:${row.name}`, async () => {
      const result = await apiCall('POST', '/updates/apply', { name: row.name, overwrite });
      setToast({ kind: 'ok', text: `${row.name} → ${short(result.toCommit) || 'latest'}` });
      return result;
    });
  }

  function requestUpdate(row) {
    if (row.status === 'locally-modified' || row.status === 'conflict') {
      setModal({
        type: 'confirm-update',
        row,
        onConfirm: () => {
          setModal(null);
          void updateOne(row, true);
        },
      });
      return;
    }
    void updateOne(row, false);
  }

  async function updateAll() {
    const pending = rows.filter((row) => row.status === 'update-available');
    for (const row of pending) {
      try {
        await run(`update:${row.name}`, () => apiCall('POST', '/updates/apply', { name: row.name }));
      } catch {
        // 单条失败不阻断其余
      }
    }
    setToast({ kind: 'ok', text: t('action.updateAll') });
  }

  async function checkUpdates() {
    await run('check', async () => {
      const result = await apiCall('POST', '/updates/check', {});
      setToast({ kind: 'ok', text: `${t('toast.checked')} · ${result.checks.length}` });
    });
  }

  function requestDelete(row) {
    setModal({
      type: 'confirm-delete',
      row,
      onConfirm: async () => {
        setModal(null);
        setBusy(`delete:${row.name}`);
        try {
          await apiCall('DELETE', `/skills/${encodeURIComponent(row.name)}`);
          setToast({ kind: 'ok', text: `${row.name} · ${t('action.delete')} ✓` });
          await reload();
        } catch (err) {
          if (err.code === 'error.skills.remove-conflict') {
            setModal({ type: 'conflict', row, detail: err.detail, message: err.message });
          } else {
            setToast({ kind: 'err', text: err.message });
          }
        } finally {
          setBusy(null);
        }
      },
    });
  }


  /**
   * 保存共享选择：增量发给 `/exports`。
   * 共享只影响「其他 agent 看不看得见」，与 DSH 可见性无关，所以这里不再有作用范围。
   */
  async function saveExports(row, targets) {
    const current = new Set(row.exports.map((item) => item.target));
    const desired = new Set(targets);
    const toRemove = [...current].filter((target) => !desired.has(target));
    const toAdd = [...desired].filter((target) => !current.has(target));
    await run(`exports:${row.name}`, async () => {
      if (toRemove.length > 0) {
        await apiCall('POST', '/exports', { skill: row.name, targets: toRemove, action: 'remove' });
      }
      if (toAdd.length > 0) {
        await apiCall('POST', '/exports', { skill: row.name, targets: toAdd, action: 'add' });
      }
    });
    setToast({ kind: 'ok', text: `${row.name} · ${t('action.exports')} ✓` });
  }

  function requestAddSkill() {
    setModal({ type: 'add-skill' });
  }

  function requestAddSubscription() {
    setModal({ type: 'add-subscription' });
  }

  /** 只读探测：列出仓库里的技能，供弹窗多选；失败由弹窗自己展示。 */
  async function probeSkills(source) {
    return apiCall('POST', '/probe', { source: String(source || '').trim() });
  }

  async function installSkills({ source, skills }) {
    setModal(null);
    await run('install', async () => {
      const result = await apiCall('POST', '/install', { source: String(source || '').trim(), skills });
      const warnings = result.warnings?.length || 0;
      setToast({
        kind: warnings ? 'err' : 'ok',
        text: `${result.installed?.length || 0} ${t('skillCount')}${warnings ? ` · ${warnings} 条提示` : ''}`,
      });
    });
  }

  async function addSubscription(form) {
    setModal(null);
    await run('subscribe', async () => {
      const result = await apiCall('POST', '/subscriptions', {
        source: form.source.trim(),
        ref: form.ref.trim() || undefined,
        subpath: form.subpath.trim() || undefined,
      });
      setToast({ kind: 'ok', text: result.subscription?.source || form.source });
    });
  }

  async function refreshSubscription(row) {
    await run(`refresh:${row.id}`, async () => {
      const result = await apiCall('POST', `/subscriptions/${encodeURIComponent(row.id)}/refresh`, {});
      setToast({ kind: 'ok', text: `${row.source} · ${result.changed ? 'snapshot updated' : 'unchanged'}` });
    });
  }

  async function deleteSubscription(row) {
    await run(`unsubscribe:${row.id}`, async () => {
      await apiCall('DELETE', `/subscriptions/${encodeURIComponent(row.id)}`, { keepInstalled: true });
      setToast({ kind: 'ok', text: `${row.source} · ${t('action.delete')} ✓` });
    });
  }

  async function installFromSubscription(subscription, entry) {
    await run(`install:${entry.name}`, async () => {
      await apiCall('POST', '/install', { subscriptionId: subscription.id, skills: [entry.name] });
      setToast({ kind: 'ok', text: `${entry.name} ✓` });
    });
  }

  return {
    adopt,
    toggleMode,
    setInvocation,
    requestUnpark,
    requestUpdate,
    updateAll,
    checkUpdates,
    requestDelete,
    saveExports,
    requestAddSkill,
    requestAddSubscription,
    probeSkills,
    installSkills,
    addSubscription,
    refreshSubscription,
    deleteSubscription,
    installFromSubscription,
  };
}

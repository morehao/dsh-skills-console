/**
 * Client half：设置页「技能控制台」分区。
 * 一页两 tab：已安装 / 订阅。行内操作列 = 开关 + 更新 + 接入设置 + 删除。
 * 所有数据来自 Host 的 /api/morehao/skills-console/*，这里只做展示与提交。
 */
import React from 'react';

import { h, portalize } from './host.js';
import { buildTranslate } from './copy.js';
import { CSS } from './styles.js';
import { GITHUB_URL, apiCall, short } from './api.js';
import {
  Logo,
  PanelIcon,
  installSettingsNavIcon,
  GitHubIcon,
  GearIcon,
  TrashIcon,
  InfoIcon,
  RefreshIcon,
  CaretIcon,
  SearchIcon,
} from './icons.js';

export function apply(ctx) {
        const locale = ctx.get('locale');
        const t = buildTranslate(locale);
        const slots = ctx.get('slots');
        if (!slots?.register) return;

        // 设置分区在 Host 的导航里默认拿齿轮；换成插件自己的标记（语言切换时重认领）。
        installSettingsNavIcon(ctx, () => t('section.title'));

        function Section(props) {
          const page = Boolean(props?.page);
          const [data, setData] = React.useState(null);
          const [error, setError] = React.useState(null);
          const [tab, setTab] = React.useState('installed');
          const [view, setView] = React.useState('flat');
          const [busy, setBusy] = React.useState(null);
          const [toast, setToast] = React.useState(null);
          const [modal, setModal] = React.useState(null);
          const [expanded, setExpanded] = React.useState({});
          const [placementBusy, setPlacementBusy] = React.useState(null);
          // POST /settings 成功后 data 还是旧的；用本地覆盖值，避免开关弹回旧状态（重开面板时尤其明显）
          const [placementOverride, setPlacementOverride] = React.useState(null);
          const [settingsOpen, setSettingsOpen] = React.useState(false);
          const settingsRef = React.useRef(null);
          // 面板朝哪边展开、多宽：齿轮不在标题行右端，固定 left/right 在窄面板里会出界
          const [settingsPlacement, setSettingsPlacement] = React.useState({ side: 'left', width: 286 });
          // “+n” 的悬浮列表：labels + 锚点矩形；位置在 layout effect 里量出来再落
          const [agentTip, setAgentTip] = React.useState(null);
          const [agentTipPos, setAgentTipPos] = React.useState(null);
          const agentTipRef = React.useRef(null);
          const [query, setQuery] = React.useState('');
          const [filter, setFilter] = React.useState('all');
          const [builtinOpen, setBuiltinOpen] = React.useState(false);

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
            const timer = setTimeout(() => setToast(null), 4200);
            return () => clearTimeout(timer);
          }, [toast]);

          // 设置面板：点外面或按 Esc 关掉；用 closest 判断，避免按钮自己把自己关掉
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

          // 悬浮气泡：滚动 / 改窗口 / 点别处 / Esc 都关掉，避免它停在旧位置
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

          const rows = data?.installs || [];
          const writable = Boolean(data) && !data?.readOnly && data?.cli?.usable;
          const updatable = (row) => row.status === 'update-available' || row.status === 'locally-modified' || row.status === 'conflict';
          const updateCount = rows.filter(updatable).length;
          // 批量更新只处理无本地改动、可直接 fast-forward 的行；有本地改动仍需逐个确认
          const bulkCount = rows.filter((row) => row.status === 'update-available').length;
          const unknownCount = rows.filter((row) => row.status === 'unknown').length;
          const offCount = rows.filter((row) => row.mode === 'off').length;
          const counts = { all: rows.length, update: updateCount, unknown: unknownCount, off: offCount };
          const queryText = query.trim().toLowerCase();
          const visibleRows = rows.filter((row) => {
            if (filter === 'update' && !updatable(row)) return false;
            if (filter === 'unknown' && row.status !== 'unknown') return false;
            if (filter === 'off' && row.mode !== 'off') return false;
            if (!queryText) return true;
            const agentLabels = row.links.map((link) => (link.target === 'dsh-global' ? 'DSH' : link.label));
            return [row.name, row.source || '', ...agentLabels].join(' ').toLowerCase().includes(queryText);
          });

          async function adopt(row) {
            await run(`adopt:${row.name}`, async () => {
              const result = await apiCall('POST', `/skills/${encodeURIComponent(row.name)}/adopt`, {});
              setToast({ kind: 'ok', text: `${row.name} · ${result.tracked ? t('adopt.done') : t('adopt.noUpstream')}` });
              return result;
            });
          }

          async function toggleMode(row) {
            const mode = row.mode === 'on' ? 'off' : 'on';
            await run(`mode:${row.name}`, () => apiCall('POST', `/skills/${encodeURIComponent(row.name)}/mode`, { mode }));
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

          async function saveLinks(row, targets, scopeProjects) {
            const current = new Set(row.links.map((link) => link.target));
            // 作用范围非空 = 只写项目链，全局链要被摘掉（两条同时存在没有额外效果）
            const desired = new Set(scopeProjects.length > 0 ? targets.filter((target) => target !== 'dsh-global') : targets);
            const toRemove = [...current].filter((target) => !desired.has(target));
            await run(`links:${row.name}`, async () => {
              if (toRemove.length > 0) {
                await apiCall('POST', '/links', { skill: row.name, targets: toRemove, action: 'remove' });
              }
              await apiCall('POST', '/links', { skill: row.name, targets: [...desired], action: 'add', scopeProjects });
            });
            setToast({ kind: 'ok', text: `${row.name} · ${t('action.links')} ✓` });
          }

          function requestAddSkill() {
            setModal({ type: 'add-skill' });
          }

          function requestAddSubscription() {
            setModal({ type: 'add-subscription' });
          }

          async function addSkill(form) {
            const names = form.skills
              .split(/[,，\s]+/)
              .map((item) => item.trim())
              .filter(Boolean);
            setModal(null);
            await run('install', async () => {
              const result = await apiCall('POST', '/install', { source: form.source.trim(), skills: names });
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

          function statusTag(row) {
            // 「待检查」不逐行刷：由列表头的计数与底部提示承接
            if (row.status === 'unknown') return null;
            const map = {
              current: ['status.current', 'ok', true],
              'update-available': ['status.update', 'warn'],
              'locally-modified': ['status.local', 'warn'],
              conflict: ['status.conflict', 'warn'],
              'upstream-deleted': ['status.deleted', 'warn'],
              'broken-link': ['status.broken', 'err'],
              unmanaged: ['status.unmanaged', ''],
            };
            const [key, cls, check] = map[row.status] || ['status.unknown', ''];
            return h('span', { className: `dshsc-tag ${cls}` }, check ? `✓ ${t(key)}` : t(key));
          }

          function sourceLine(row) {
            if (!row.source) {
              return h('div', { className: 'dshsc-src', title: t('meta.noUpstream') }, t('meta.noUpstream'));
            }
            const ref = row.commit ? `#${short(row.commit)}` : row.ref ? `#${row.ref}` : '';
            const text = `${row.source}${ref}`;
            return h('div', { className: 'dshsc-src', title: text },
              h('span', null, `${t('meta.from')} `),
              h('span', { className: 'dshsc-code' }, text));
          }

          function agentChips(row) {
            const links = row.links.filter((link) => !link.broken);
            // project:* 链接本身就是「仅某项目可见」，用后面的 scope chip 表达，不再重复一枚同名 chip
            const projectLinks = links.filter((link) => String(link.target).startsWith('project:'));
            const labels = links
              .filter((link) => !String(link.target).startsWith('project:'))
              .map((link) => (link.target === 'dsh-global' ? 'DSH' : link.label));
            if (projectLinks.length > 0 && !labels.includes('DSH')) labels.unshift('DSH');
            const projects = row.scopeProjects || [];
            const scopeNames = projects.length > 0
              ? projects.map((project) => project.split('/').pop())
              : projectLinks.map((link) => link.label);
            if (labels.length === 0 && scopeNames.length === 0) {
              return h('span', { className: 'dshsc-unlinked' }, t('meta.unlinked'));
            }
            const chips = labels.slice(0, 3).map((label, index) => h('span', {
              className: `dshsc-agent${label === 'DSH' ? ' dsh' : ''}`,
              key: `agent-${index}`,
              title: label,
            }, label === 'DSH' ? h('i', { className: 'dshsc-dot' }) : null, label));
            if (labels.length > 3) {
              const open = agentTip?.rowName === row.name;
              chips.push(h('button', {
                type: 'button',
                className: 'dshsc-agent more',
                key: 'more',
                'aria-label': `${t('meta.agentsAll')}：${labels.join('、')}`,
                'aria-describedby': open ? 'dshsc-agenttip' : undefined,
                'aria-expanded': String(open),
                onClick: (event) => openAgentTip(event, row.name, labels),
                onMouseEnter: (event) => openAgentTip(event, row.name, labels),
                onFocus: (event) => openAgentTip(event, row.name, labels),
                onMouseLeave: closeAgentTip,
                onBlur: closeAgentTip,
              }, `+${labels.length - 3}`));
            }
            if (scopeNames.length > 0) {
              chips.push(h('span', {
                className: 'dshsc-agent scope',
                key: 'scope',
                title: `${t('meta.scope')}：${projects.length > 0 ? projects.join('、') : scopeNames.join('、')}`,
              }, `${t('meta.onlyProject')} ${scopeNames.join('、')}`));
            }
            return chips;
          }

          function rowView(row) {
            const off = row.mode === 'off';
            const tracked = row.status !== 'unmanaged';
            const canUpdate = writable && updatable(row);
            return h(
              'div',
              { className: `dshsc-row${off ? ' off' : ''}`, key: row.name },
              h(
                'div',
                { className: 'dshsc-cell' },
                h(
                  'div',
                  { className: 'dshsc-namerow' },
                  h('span', { className: 'dshsc-name', title: row.name }, row.name),
                  statusTag(row),
                  off ? h('span', { className: 'dshsc-tag off' }, t('status.off')) : null,
                ),
                sourceLine(row),
                off ? h('div', { className: 'dshsc-note' }, t('mode.offHint')) : null,
                row.status === 'broken-link' ? h('div', { className: 'dshsc-note warn' }, t('status.brokenHint')) : null,
              ),
              h('div', { className: 'dshsc-agents' }, agentChips(row)),
              h(
                'div',
                { className: 'dshsc-actions' },
                h('button', {
                  className: 'dshsc-switch',
                  role: 'switch',
                  'aria-checked': String(tracked && row.mode === 'on'),
                  'aria-label': `${row.name} ${t('mode.on')}/${t('mode.off')}`,
                  // 未纳入追踪时调 setMode 只会报「没有安装记录」，不如直接禁用
                  disabled: busy !== null || !tracked,
                  onClick: () => void toggleMode(row),
                  title: tracked ? (row.mode === 'on' ? t('mode.off') : t('mode.on')) : t('adopt.switchHint'),
                }, h('span', { className: 'dshsc-knob' })),
                row.status === 'unmanaged'
                  ? h('button', {
                      className: 'dshsc-btn ghost',
                      disabled: !writable || busy !== null,
                      title: row.source ? row.source : t('meta.none'),
                      onClick: () => void adopt(row),
                    }, t('action.adopt'))
                  : h('button', {
                      className: `dshsc-btn ghost${canUpdate ? ' dshsc-update' : ''}`,
                      disabled: !canUpdate || busy !== null,
                      onClick: () => requestUpdate(row),
                    }, t('action.update')),
                h('button', { className: 'dshsc-btn ghost', disabled: busy !== null, onClick: () => setModal({ type: 'links', row }) }, t('action.links')),
                h('button', {
                  className: 'dshsc-btn ghost danger sq',
                  disabled: !writable || busy !== null,
                  title: t('action.delete'),
                  'aria-label': `${t('action.delete')} ${row.name}`,
                  onClick: () => requestDelete(row),
                }, h(TrashIcon, { size: 13 })),
              ),
            );
          }

          function groupedRows() {
            const groups = [];
            const hasLink = (row, prefix) => row.links.some((link) => !link.broken && String(link.target).startsWith(prefix));
            const dshRows = visibleRows.filter((row) => row.mode === 'on' && !row.scopeProjects?.length && hasLink(row, 'dsh-global'));
            const projectRows = visibleRows.filter((row) => row.mode === 'on' && row.scopeProjects?.length);
            const offRows = visibleRows.filter((row) => row.mode === 'off');
            const unlinkedRows = visibleRows.filter((row) => row.mode === 'on' && !row.scopeProjects?.length
              && !row.links.some((link) => !link.broken));
            groups.push({ key: 'dsh-global', title: t('group.dshGlobal'), rows: dshRows, dot: true });
            if (projectRows.length) groups.push({ key: 'dsh-project', title: t('group.dshProject'), rows: projectRows, dot: true });
            if (offRows.length) groups.push({ key: 'off', title: t('group.off'), rows: offRows });
            if (unlinkedRows.length) groups.push({ key: 'unlinked', title: t('group.unlinked'), rows: unlinkedRows });
            for (const agent of data?.agents?.detected || []) {
              if (agent.kind !== 'agent') continue;
              const matched = visibleRows.filter((row) => row.links.some((link) => link.target === agent.target));
              if (matched.length) groups.push({ key: agent.target, title: agent.label, rows: matched });
            }
            return groups.filter((group) => group.rows.length > 0);
          }

          function filterChip(id, label, dot) {
            return h('button', {
              key: id,
              type: 'button',
              className: `dshsc-fchip${filter === id ? ' active' : ''}`,
              'aria-pressed': String(filter === id),
              title: id === 'unknown' && counts.unknown
                ? t('hint.unknown').replace('{n}', String(counts.unknown))
                : undefined,
              onClick: () => setFilter(id),
            }, dot, h('span', null, label), h('span', { className: 'n' }, counts[id]));
          }

          function listBar() {
            return h('div', { className: 'dshsc-listbar' },
              h('div', { className: 'dshsc-filters' },
                filterChip('all', t('filter.all')),
                filterChip('update', t('filter.update'), h('i', { className: 'dshsc-fdot' })),
                filterChip('unknown', t('filter.unknown')),
                filterChip('off', t('filter.off'))),
              h('div', { className: 'dshsc-listbar-actions' },
                h('button', {
                  className: 'dshsc-btn sq',
                  disabled: busy !== null,
                  title: t('action.checkUpdates'),
                  'aria-label': t('action.checkUpdates'),
                  onClick: () => void checkUpdates(),
                }, h(RefreshIcon, { size: 14 })),
                bulkCount > 0
                  ? h('button', { className: 'dshsc-btn tint', disabled: !writable || busy !== null, onClick: () => void updateAll() }, `${t('action.updateAll')} · ${bulkCount}`)
                  : null));
          }

          function filteredEmpty() {
            return h('div', { className: 'dshsc-empty' },
              h('div', { className: 'dshsc-name' }, t('empty.filtered')),
              h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.filteredHint')),
              h('div', { style: { marginTop: 10 } },
                h('button', {
                  className: 'dshsc-btn',
                  onClick: () => { setQuery(''); setFilter('all'); },
                }, t('search.clear'))));
          }

          function installedTab() {
            if (!data) return h('div', { className: 'dshsc-empty' }, t('empty.loading'));
            if (rows.length === 0) {
              return h(
                'div',
                { className: 'dshsc-empty' },
                h('div', { className: 'dshsc-name' }, t('empty.skills')),
                h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.skillsHint')),
                h('div', { style: { marginTop: 10 } },
                  h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: requestAddSkill }, t('action.addSkill'))),
              );
            }
            const body = view === 'agent'
              ? h('div', { className: 'dshsc-groupstack' }, groupedRows().map((group) =>
                  h('div', { key: group.key },
                    h('div', { className: 'dshsc-group-head' },
                      group.dot ? h('i', { className: 'dshsc-gdot' }) : null,
                      h('span', null, group.title),
                      h('span', { className: 'n' }, group.rows.length)),
                    h('div', { className: 'dshsc-list' }, group.rows.map(rowView)))))
              : h('div', { className: 'dshsc-list' }, visibleRows.map(rowView));
            return h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              visibleOnlyBanners(),
              builtinNotice(),
              listBar(),
              visibleRows.length === 0 ? filteredEmpty() : body,
            );
          }

          function builtinNotice() {
            // 内置技能是说明，不是告警：默认折叠成一行句子 + 查看入口，点开才列出名字
            const items = (data?.visibleOnly || []).filter((item) => item.source === 'bundled');
            if (items.length === 0) return null;
            const listId = 'dshsc-builtin-list';
            return h('div', { className: 'dshsc-notice' },
              h('div', { className: 'dshsc-notice-row' },
                h(InfoIcon, { size: 13 }),
                h('span', { className: 'dshsc-notice-text' },
                  t('visibleOnlyBuiltin'),
                  ' ',
                  h('button', {
                    className: 'dshsc-linkbtn',
                    'aria-expanded': String(builtinOpen),
                    'aria-controls': builtinOpen ? listId : undefined,
                    onClick: () => setBuiltinOpen((prev) => !prev),
                  }, builtinOpen
                    ? t('builtin.hide')
                    : t('builtin.view').replace('{n}', String(items.length))))),
              builtinOpen
                ? h('div', { className: 'dshsc-notice-list', id: listId }, items.map((item) => item.name).join('、'))
                : null);
          }

          function visibleOnlyBanners() {
            // 只有「visible but not canonical」的其他来源才需要告警；bundled 已收进 builtinNotice
            const others = (data?.visibleOnly || []).filter((item) => item.source !== 'bundled');
            return others.length > 0
              ? h('div', { className: 'dshsc-banner warn' },
                  `${t('visibleOnlyOther')}：${others.map((item) => item.name).join('、')}`)
              : null;
          }

          function subscriptionsTab() {
            const subs = data?.subscriptions || [];
            if (subs.length === 0) {
              return h(
                'div',
                { className: 'dshsc-empty' },
                h('div', { className: 'dshsc-name' }, t('empty.subs')),
                h('div', { className: 'dshsc-meta', style: { justifyContent: 'center' } }, t('empty.subsHint')),
                h('div', { style: { marginTop: 10 } },
                  h('button', { className: 'dshsc-btn primary', disabled: !writable, onClick: requestAddSubscription }, t('action.addSubscription'))),
              );
            }
            return h('div', { className: 'dshsc-list' }, subs.map((subscription) => {
              const entries = subscription.snapshot?.entries || [];
              const installedNames = new Set(rows.filter((row) => row.subscriptionId === subscription.id).map((row) => row.name));
              const open = Boolean(expanded[subscription.id]);
              return h(
                'div',
                { className: 'dshsc-sub-block', key: subscription.id },
                h('div', { className: 'dshsc-sub-row' },
                  h('button', {
                    className: 'dshsc-caret',
                    'aria-expanded': String(open),
                    'aria-label': `${subscription.source} ${open ? t('action.collapse') : t('action.expand')}`,
                    onClick: () => setExpanded((prev) => ({ ...prev, [subscription.id]: !open })),
                  }, h(CaretIcon, { open })),
                  h('span', { className: 'dshsc-name' }, subscription.source),
                  h('span', { className: 'dshsc-tag' }, subscription.ref || 'default'),
                  h('span', { className: 'dshsc-substat' },
                    `${entries.length} ${t('skillCount')} · ${t('installed')} ${installedNames.size}`),
                  h('div', { className: 'dshsc-actions' },
                    h('button', {
                      className: 'dshsc-btn sq',
                      disabled: busy !== null,
                      title: t('action.checkUpdates'),
                      'aria-label': `${t('action.checkUpdates')} ${subscription.source}`,
                      onClick: () => void refreshSubscription(subscription),
                    }, h(RefreshIcon, { size: 13 })),
                    h('button', { className: 'dshsc-btn ghost danger', disabled: busy !== null, onClick: () => void deleteSubscription(subscription) }, t('action.unsubscribe')))),
                open
                  ? h('div', { className: 'dshsc-sub-list' }, entries.map((entry) => {
                      const installedAlready = installedNames.has(entry.name);
                      return h('div', { className: 'dshsc-sub-entry', key: entry.name },
                        h('span', { className: 'dshsc-name' }, entry.name),
                        h('span', { className: `dshsc-state${installedAlready ? ' ok' : ''}` },
                          installedAlready ? '✓ ' : '', installedAlready ? t('installed') : t('notInstalled')),
                        h('div', { className: 'dshsc-actions' },
                          installedAlready
                            ? null
                            : h('button', {
                                className: 'dshsc-btn',
                                disabled: !writable || busy !== null,
                                onClick: () => void installFromSubscription(subscription, entry),
                              }, t('action.install'))));
                    }))
                  : null,
              );
            }));
          }

          const autolinkTargets = (data?.agents?.detected || []).filter((agent) => agent.kind === 'agent');
          const autoLinkSelection = data?.settings?.autoLinkTargets;
          const autoLinkAgents = Array.isArray(autoLinkSelection)
            ? autolinkTargets.filter((agent) => autoLinkSelection.includes(agent.target))
            : autolinkTargets;
          const autoLinkLabel = [t('links.dshGlobal'), ...autoLinkAgents.map((agent) => agent.label)].join('、');
          const placement = (placementOverride ?? data?.settings?.placement) === 'sidebar' ? 'sidebar' : 'settings';

          async function changePlacement(next) {
            if (next === placement || placementBusy) return;
            setPlacementBusy(next);
            try {
              await apiCall('POST', '/settings', { placement: next });
              setPlacementOverride(next);
              setSettingsOpen(false);
              props?.onPlacementChange?.(next);
              setPlacementBusy(null);
            } catch (err) {
              setToast({ kind: 'err', text: err.message });
              setPlacementBusy(null);
            }
          }

          // 插件级工具跟身份胶囊同组：设置开面板、GitHub 开仓库；业务动作留在右侧
          const headTools = h('div', { className: 'dshsc-tools' },
            // 先源码、后设置：GitHub 紧挨包名，齿轮留在工具组最外侧
            h('a', {
              className: 'dshsc-tool',
              href: GITHUB_URL,
              target: '_blank',
              rel: 'noopener noreferrer',
              title: t('github.open'),
              'aria-label': t('github.open'),
            }, h(GitHubIcon, { size: 15 })),
            h('div', { className: 'dshsc-settings' },
              h('button', {
                ref: settingsRef,
                className: 'dshsc-tool',
                'aria-haspopup': 'dialog',
                'aria-expanded': String(settingsOpen),
                type: 'button',
                'aria-label': t('settings.title'),
                title: t('settings.title'),
                onClick: () => {
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
                },
              }, h(GearIcon, { size: 15 })),
              settingsOpen
                ? h('div', {
                    className: 'dshsc-pop',
                    role: 'dialog',
                    'aria-label': t('settings.title'),
                    style: settingsPlacement.side === 'right'
                      ? { left: 0, width: `${settingsPlacement.width}px` }
                      : { right: 0, width: `${settingsPlacement.width}px` },
                  },
                    h('div', { className: 'dshsc-pop-title' }, t('settings.title')),
                    h('div', { className: 'dshsc-pop-label' },
                      h('span', { className: 'dshsc-pop-name' },
                        t('placement.label'), h('em', null, t('placement.effect'))),
                      h('button', {
                        className: 'dshsc-switch',
                        role: 'switch',
                        'aria-checked': String(placement === 'sidebar'),
                        'aria-label': `${t('placement.label')}：${placement === 'sidebar' ? t('placement.on') : t('placement.off')}`,
                        title: t('placement.hint'),
                        disabled: Boolean(placementBusy) || Boolean(data?.readOnly),
                        onClick: () => void changePlacement(placement === 'sidebar' ? 'settings' : 'sidebar'),
                      }, h('span', { className: 'dshsc-knob' }))),
                    h('div', { className: 'dshsc-pop-hint' }, t('placement.hint')))
                : null));

          const root = h(
            'div',
            { className: 'dshsc-root' },
            h('style', null, CSS),
            h('div', { className: 'dshsc-head' },
              h('div', { className: 'dshsc-heading' },
                h(Logo, { size: page ? 36 : 30 }),
                h('div', { className: 'dshsc-heading-text' },
                  h('div', { className: 'dshsc-title-row' },
                    h('h2', { className: 'dshsc-title' }, page ? t('page.title') : t('section.title')),
                    // 身份：包名 + 版本合成一枚低调 chip，由 Host 从 package.json 注入
                    data?.plugin?.name
                      ? h('span', { className: 'dshsc-id' },
                          h('span', { className: 'dshsc-pkg' }, data.plugin.name),
                          data?.plugin?.version ? h('span', { className: 'dshsc-idsep' }, '|') : null,
                          data?.plugin?.version
                            ? h('span', { className: 'dshsc-ver', title: `${t('version.label')} v${data.plugin.version}` },
                                `v${data.plugin.version}`)
                            : null)
                      : null,
                    headTools),
                  h('p', { className: 'dshsc-sub' }, t('section.subtitle')))),
              // 右侧只留业务动作；主按钮仍在最右
              h('div', { className: 'dshsc-head-actions' },
                h('button', {
                  className: 'dshsc-btn',
                  disabled: !writable,
                  title: `${t('autoLink')}：${autoLinkLabel}`,
                  'aria-label': `${t('autoLink')}：${autoLinkLabel}`,
                  onClick: () => setModal({ type: 'autolink' }),
                }, `${t('autoLink')} · ${autoLinkAgents.length + 1} ▾`),
                h('button', {
                  className: 'dshsc-btn primary',
                  disabled: !writable,
                  onClick: tab === 'installed' ? requestAddSkill : requestAddSubscription,
                }, tab === 'installed' ? t('action.addSkill') : t('action.addSubscription')))),

            error ? h('div', { className: 'dshsc-banner err' }, `${error} · `, h('button', { className: 'dshsc-btn ghost', onClick: () => void reload() }, t('action.retry'))) : null,
            data?.readOnly ? h('div', { className: 'dshsc-banner warn' }, t('banner.readonly')) : null,
            data && !data.cli?.usable ? h('div', { className: 'dshsc-banner err' }, `${t('banner.cli')} · ${data.cli?.source || ''} ${data.cli?.version || ''}`) : null,

            h('div', { className: 'dshsc-toolbar' },
              h('div', { className: 'dshsc-tabs' },
                h('button', { className: `dshsc-tab${tab === 'installed' ? ' active' : ''}`, onClick: () => setTab('installed') },
                  h('span', null, t('tab.installed')), h('span', { className: 'n' }, rows.length)),
                h('button', { className: `dshsc-tab${tab === 'subscriptions' ? ' active' : ''}`, onClick: () => setTab('subscriptions') },
                  h('span', null, t('tab.subscriptions')), h('span', { className: 'n' }, data?.subscriptions?.length || 0))),
              h('div', { className: 'dshsc-spacer' }),
              tab === 'installed' ? [
                h('div', { key: 'search', className: 'dshsc-search' },
                  h(SearchIcon, { size: 13 }),
                  h('input', {
                    type: 'search',
                    value: query,
                    placeholder: t('search.placeholder'),
                    'aria-label': t('search.placeholder'),
                    onChange: (event) => setQuery(event.target.value),
                  }),
                  query
                    ? h('button', {
                        className: 'dshsc-search-clear',
                        'aria-label': t('search.clear'),
                        title: t('search.clear'),
                        onClick: () => setQuery(''),
                      }, '×')
                    : null),
                h('div', { key: 'view', className: 'dshsc-segment' },
                  h('button', { className: 'dshsc-btn', 'aria-pressed': String(view === 'flat'), onClick: () => setView('flat') }, t('view.flat')),
                  h('button', { className: 'dshsc-btn', 'aria-pressed': String(view === 'agent'), onClick: () => setView('agent') }, t('view.agent'))),
              ] : null),

            tab === 'installed' ? installedTab() : subscriptionsTab(),

            busy ? h('div', { className: 'dshsc-meta' }, `${t('busy.working')} ${busy}`) : null,
            toast ? h('div', { className: `dshsc-toast ${toast.kind}` }, toast.text) : null,
            modal ? renderModal() : null,
            agentTip ? renderAgentTip() : null,
          );
          return page ? h('div', { className: 'dshsc-page' }, root) : root;

          function renderAgentTip() {
            const node = h('div', {
              ref: agentTipRef,
              id: 'dshsc-agenttip',
              role: 'tooltip',
              className: 'dshsc-agenttip',
              style: agentTipPos
                ? { left: `${agentTipPos.left}px`, top: `${agentTipPos.top}px` }
                : { left: 0, top: 0, visibility: 'hidden' },
            },
              h('div', { className: 'dshsc-agenttip-head' },
                h('span', null, t('meta.agentsAll')),
                h('span', { className: 'dshsc-agenttip-n' }, agentTip.labels.length)),
              h('div', { className: 'dshsc-agenttip-list' },
                agentTip.labels.map((label, index) => h('span', {
                  className: `dshsc-agent${label === 'DSH' ? ' dsh' : ''}`,
                  key: `agenttip-${index}`,
                }, label === 'DSH' ? h('i', { className: 'dshsc-dot' }) : null, label))));
            // 列表容器 overflow:hidden，必须挂到 body 才能浮在行外
            return portalize(node);
          }

          function renderModal() {
            if (modal.type === 'add-skill') {
              return h(FormModal, {
                title: t('action.addSkill'),
                hint: t('form.hint'),
                fields: [
                  { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
                  { key: 'skills', label: t('form.skills'), placeholder: 'git-kit, handoff' },
                ],
                onCancel: () => setModal(null),
                onSubmit: (form) => void addSkill(form),
              });
            }
            if (modal.type === 'add-subscription') {
              return h(FormModal, {
                title: t('action.addSubscription'),
                hint: t('form.subHint'),
                fields: [
                  { key: 'source', label: t('form.source'), placeholder: t('form.sourceHint') },
                  { key: 'ref', label: t('form.ref'), placeholder: 'main' },
                  { key: 'subpath', label: t('form.subpath'), placeholder: 'skills' },
                ],
                onCancel: () => setModal(null),
                onSubmit: (form) => void addSubscription(form),
              });
            }
            if (modal.type === 'links') {
              return h(LinksModal, {
                row: modal.row,
                agents: data?.agents?.all || [],
                workspaces: data?.workspaces || [],
                onCancel: () => setModal(null),
                onSave: (targets, scopeProjects) => {
                  setModal(null);
                  void saveLinks(modal.row, targets, scopeProjects);
                },
              });
            }
            if (modal.type === 'autolink') {
              return h(AutoLinkModal, {
                settings: data?.settings || {},
                agents: autolinkTargets,
                onCancel: () => setModal(null),
                onSave: async (targets) => {
                  setModal(null);
                  await run('settings', () => apiCall('POST', '/settings', { autoLinkTargets: targets }));
                },
              });
            }
            if (modal.type === 'confirm-delete') {
              return h(ConfirmModal, {
                title: t('confirm.deleteTitle'),
                body: t('confirm.deleteBody'),
                danger: true,
                onCancel: () => setModal(null),
                onConfirm: modal.onConfirm,
              });
            }
            if (modal.type === 'confirm-update') {
              return h(ConfirmModal, {
                title: t('confirm.updateTitle'),
                body: t('confirm.updateBody'),
                onCancel: () => setModal(null),
                onConfirm: modal.onConfirm,
              });
            }
            if (modal.type === 'conflict') {
              const conflicts = modal.detail?.conflicts || [];
              return h(ConfirmModal, {
                title: t('error.conflictTitle'),
                body: `${modal.message}\n${conflicts.map((item) => `${item.label}: ${item.linkPath}`).join('\n')}`,
                onCancel: () => setModal(null),
                onConfirm: () => setModal(null),
                confirmLabel: t('action.cancel'),
              });
            }
            return null;
          }
        }

        function Overlay({ title, children, footer, onCancel }) {
          React.useEffect(() => {
            const onKey = (event) => {
              if (event.key === 'Escape') onCancel?.();
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
          }, [onCancel]);
          return h('div', { className: 'dshsc-overlay', onClick: (event) => { if (event.target === event.currentTarget) onCancel?.(); } },
            h('div', { className: 'dshsc-modal', role: 'dialog', 'aria-modal': 'true' },
              h('button', {
                className: 'dshsc-modal-close',
                'aria-label': t('action.cancel'),
                onClick: (event) => { event.stopPropagation(); onCancel?.(); },
              }, '×'),
              h('h3', null, title),
              children,
              h('div', { className: 'dshsc-modal-foot' }, footer)));
        }

        function FormModal({ title, hint, fields, onCancel, onSubmit }) {
          const [form, setForm] = React.useState(() => Object.fromEntries(fields.map((field) => [field.key, ''])));
          return h(Overlay, {
            title,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', {
                key: 's',
                className: 'dshsc-btn primary',
                disabled: !form[fields[0].key]?.trim?.() || (fields.some((f) => f.key === 'skills') && !form.skills?.trim()),
                onClick: () => onSubmit(form),
              }, t('action.save')),
            ],
          },
          hint ? h('p', { className: 'dshsc-sub' }, hint) : null,
          ...fields.map((field) =>
            h('label', { className: 'dshsc-field', key: field.key },
              h('span', null, field.label),
              h('input', {
                value: form[field.key],
                placeholder: field.placeholder,
                onChange: (event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value })),
              }))));
        }

        function ConfirmModal({ title, body, onCancel, onConfirm, danger, confirmLabel }) {
          return h(Overlay, {
            title,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', { key: 'o', className: `dshsc-btn${danger ? ' danger' : ' primary'}`, onClick: onConfirm }, confirmLabel || t('action.save')),
            ],
          }, h('p', { className: 'dshsc-sub', style: { whiteSpace: 'pre-wrap' } }, body));
        }

        function LinksModal({ row, agents, workspaces, onCancel, onSave }) {
          // 本机没有目录的 Agent 不展示；dsh（全局）必选，永远显示
          const candidates = agents.filter(
            (agent) => agent.kind === 'dsh' || (agent.kind !== 'project' && agent.exists),
          );
          const [targets, setTargets] = React.useState(() => {
            // 只保留还能展示的目标：agent 目录都没了就别在保存时把它重新建出来
            const visible = new Set(candidates.map((agent) => agent.target));
            const initial = new Set(row.links.map((link) => link.target).filter((target) => visible.has(target)));
            initial.add('dsh-global');
            return initial;
          });
          const [scopeProjects, setScopeProjects] = React.useState(row.scopeProjects || []);
          const [scopeMode, setScopeMode] = React.useState((row.scopeProjects || []).length > 0 ? 'projects' : 'global');
          const workspacePaths = new Set(workspaces.map((workspace) => workspace.path));
          const otherProjects = scopeProjects.filter((project) => !workspacePaths.has(project));
          const toggle = (target) => setTargets((prev) => {
            const next = new Set(prev);
            if (next.has(target)) next.delete(target);
            else next.add(target);
            return next;
          });
          const toggleProject = (project) => setScopeProjects((prev) =>
            prev.includes(project) ? prev.filter((item) => item !== project) : [...prev, project]);
          const pickDirectory = async () => {
            const picker = ctx.get('uiWorkspace');
            const dir = await picker?.pickDirectory?.();
            if (!dir) return;
            setScopeProjects((prev) => (prev.includes(dir) ? prev : [...prev, dir]));
          };
          return h(Overlay, {
            title: `${t('action.links')} · ${row.name}`,
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', {
                key: 's',
                className: 'dshsc-btn primary',
                onClick: () => onSave([...targets], scopeMode === 'projects' ? scopeProjects.filter((item) => item.trim()) : []),
              }, t('action.save')),
            ],
          },
          h('div', { className: 'dshsc-group' }, t('links.targets')),
          h('p', { className: 'dshsc-sub' }, t('links.detectedHint')),
          h('p', { className: 'dshsc-sub' }, t('links.canonical').replace('{path}', `~/.agents/skills/${row.name}`)),
          ...candidates.map((agent) =>
            h('label', { className: 'dshsc-check', key: agent.target },
              h('input', {
                type: 'checkbox',
                checked: agent.target === 'dsh-global' ? true : targets.has(agent.target),
                disabled: agent.target === 'dsh-global',
                onChange: () => toggle(agent.target),
              }),
              h('span', null, agent.kind === 'dsh' ? t('links.dshGlobal') : agent.label),
              agent.target === 'dsh-global' ? h('small', null, t('links.required')) : null,
              h('small', { title: agent.dir }, agent.dir))),
          h('div', { className: 'dshsc-group' }, t('links.scope')),
          h('label', { className: 'dshsc-check' },
            h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'global', onChange: () => setScopeMode('global') }),
            h('span', null, t('links.scopeGlobal'))),
          h('label', { className: 'dshsc-check' },
            h('input', { type: 'radio', name: `scope-${row.name}`, checked: scopeMode === 'projects', onChange: () => setScopeMode('projects') }),
            h('span', null, t('links.scopeProjects'))),
          scopeMode === 'projects'
            ? h('div', null,
                h('div', { className: 'dshsc-group' }, t('links.workspaces')),
                workspaces.length === 0
                  ? h('p', { className: 'dshsc-sub' }, t('links.noWorkspaces'))
                  : h('div', { className: 'dshsc-panel' }, workspaces.map((workspace) =>
                      h('label', { className: 'dshsc-check', key: workspace.id },
                        h('input', {
                          type: 'checkbox',
                          checked: scopeProjects.includes(workspace.path),
                          onChange: () => toggleProject(workspace.path),
                        }),
                        h('span', null, workspace.title),
                        h('small', null, workspace.path)))),
                otherProjects.length > 0
                  ? h('div', { className: 'dshsc-group' }, t('links.selected'))
                  : null,
                ...otherProjects.map((project) =>
                  h('div', { className: 'dshsc-sub-entry', key: project },
                    h('span', { className: 'dshsc-code' }, project),
                    h('div', { className: 'dshsc-actions' },
                      h('button', {
                        className: 'dshsc-btn ghost danger',
                        onClick: () => setScopeProjects((prev) => prev.filter((item) => item !== project)),
                      }, t('action.delete'))))),
                h('button', { className: 'dshsc-btn', style: { alignSelf: 'flex-start', marginTop: 6 }, onClick: () => void pickDirectory() }, t('links.pickDirectory')))
            : null,
          h('p', { className: 'dshsc-sub' }, t('links.hint')));
        }

        function AutoLinkModal({ settings, agents, onCancel, onSave }) {
          const [targets, setTargets] = React.useState(() => new Set(
            Array.isArray(settings.autoLinkTargets) ? settings.autoLinkTargets : agents.map((agent) => agent.target),
          ));
          const toggle = (target) => setTargets((prev) => {
            const next = new Set(prev);
            if (next.has(target)) next.delete(target);
            else next.add(target);
            return next;
          });
          return h(Overlay, {
            title: t('autoLink'),
            onCancel,
            footer: [
              h('button', { key: 'c', className: 'dshsc-btn ghost', onClick: onCancel }, t('action.cancel')),
              h('button', { key: 's', className: 'dshsc-btn primary', onClick: () => onSave([...targets]) }, t('action.save')),
            ],
          },
          h('p', { className: 'dshsc-sub' }, t('links.dshGlobal') + ' · ' + t('links.required')),
          h('div', { className: 'dshsc-group' }, t('autoLink.detected')),
          agents.length === 0
            ? h('p', { className: 'dshsc-sub' }, t('autoLink.none'))
            : h('div', { className: 'dshsc-panel' }, agents.map((agent) =>
                h('label', { className: 'dshsc-check', key: agent.target },
                  h('input', {
                    type: 'checkbox',
                    checked: targets.has(agent.target),
                    onChange: () => toggle(agent.target),
                  }),
                  h('span', null, agent.label),
                  h('small', null, agent.dir)))),
          h('p', { className: 'dshsc-sub' }, t('autoLink.hint')));
        }

        const PANEL_ID = 'dsh-skills-console';
        const layout = ctx.get('layout');
        let surface = null;
        let userSelected = false;
        const surfaceDisposers = [];

        function SettingsSurface(props) {
          return h(Section, {
            ...props,
            page: false,
            onPlacementChange: (next) => changeSurface(next, props?.close),
          });
        }

        function PageSurface() {
          return h(Section, { page: true, onPlacementChange: (next) => changeSurface(next) });
        }

        function SurfaceIcon(props) {
          return h(PanelIcon, { size: props?.size || 16 });
        }

        function clearSurface() {
          while (surfaceDisposers.length > 0) {
            const dispose = surfaceDisposers.pop();
            try {
              dispose();
            } catch {
              // 单个卸载失败不阻塞另一个入口
            }
          }
        }

        function mount(next) {
          const target = next === 'sidebar' ? 'sidebar' : 'settings';
          if (surface === target) return;
          clearSurface();
          surface = target;
          if (target === 'sidebar') {
            // 先注册 main 再注册侧栏按钮：按钮出现时 main 一定可选
            surfaceDisposers.push(slots.inject('main', () => {
              const disposeMain = slots.register({ name: 'main', key: PANEL_ID }, PageSurface);
              const disposeIcon = slots.inject('sidebar.panellist', () => slots.register({
                name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => t('page.title'),
              }, SurfaceIcon));
              return [disposeMain, disposeIcon];
            }));
          } else {
            surfaceDisposers.push(slots.inject('settings.section', () =>
              slots.register({
                name: 'settings.section', id: PANEL_ID, order: 26, label: () => t('section.title'),
              }, SettingsSurface)));
          }
        }

        function changeSurface(next, close) {
          userSelected = true;
          mount(next);
          try {
            if (next === 'sidebar') {
              layout?.selectPanel?.(PANEL_ID);
              close?.();
            } else {
              // 离开已消失的自定义主面板，回到会话；用户从侧栏底部打开设置即可看到分区
              layout?.selectPanel?.('conversation');
            }
          } catch {
            // main 声明尚未就绪时 select 会抛错；侧栏按钮/设置分区随后仍可点开
          }
        }

        mount('settings');
        ctx.effect(() => () => {
          clearSurface();
          surface = null;
        }, 'dsh-skills-console:surface');

        // 读取入口偏好；晚到的响应不能覆盖用户刚才在页面里的选择
        apiCall('GET', '/state')
          .then((state) => {
            if (!userSelected && state?.settings?.placement === 'sidebar') mount('sidebar');
          })
          .catch(() => {});
}

import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomicSync } from './fs-atomic.js';

/**
 * 状态版本史：
 * - v1：`installs[].mode` + `installs[].scopeProjects` + 顶层 `links[]`（DSH 侧软链 = 可见性）。
 * - v2：`installs[].enabled` + `exports[]`（只给其他 agent 的显式导出）+ `shadows[]`（DSH 扫描根里的停用标记）。
 * - v3：`installs[].enabled` 是**唯一**启停开关；`shadows[]` 退休，`legacyShadows[]` 只放
 *   迁移时删不掉的旧桩与 orphan（v0.4.0 起启停由每个 live agent scope 的 policy provider 负责）。
 * - v4：`installs[].mode`（auto / manual / hidden）成为调用策略；`enabled` 只保留给 legacy
 *   `dsh-off`（旧版 DSH-only 停用），manual / hidden 不再借助 provider。`manual` 记录
 *   frontmatter 的原始值与来源，`hidden` 记录 A′ park 的 marker / 内容哈希。
 *
 * 迁移分三步：`upgradeStateV1` / `upgradeStateV2` / `upgradeStateV3` 只做**纯结构**改写
 * （可测、无副作用），删链/删旧桩/剪悬空导出这类要做 IO 的事在 `migrations.js` 里按 manifest 执行。
 */
export const STATE_VERSION = 4;

export function emptyState() {
  return {
    version: STATE_VERSION,
    settings: {
      exportTargets: [],
      placement: 'settings',
      // 定时上游检测的开关与上次跑批概览（仅 README 展示，不影响写路径）
      autoCheck: { enabled: true, lastRunAt: null, lastResult: null },
    },
    agents: { custom: [], dismissed: [] },
    subscriptions: [],
    installs: [],
    exports: [],
    legacyShadows: [],
    checks: {},
    migration: null,
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isoOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

/**
 * v1 的 `autoLinkTargets` → v2 的 `exportTargets`。
 * - `null` / 缺失：v1 语义是「全部已装 agent」，v2 默认是「一个都不导出」——**不继承**，
 *   否则升级会把「以前默认全都接」变成「以后默认全都导出」，与 v2 的设计前提相反。
 * - 显式数组：用户点选过，原样继承（只保留 `agent:*`，其余目标在 v2 里已无意义）。
 */
function legacyExportTargets(settings) {
  const raw = settings?.autoLinkTargets;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((target) => typeof target === 'string' && target.startsWith('agent:')))];
}

/**
 * v1 → v2 的结构升级。**不读写任何文件**，只决定数据怎么摆：
 * - `mode: 'off'` → `enabled: false`（v3 起只靠它启停，不再建标记）；
 * - 顶层 `links[]` 拆成 `exports[]`（agent 链，保留）+ `migration.legacyLinks`（DSH 链/项目链，待删）；
 * - `scopeProjects` 先挂在 `legacyScopeProjects` 上，migrations.js 处理完再删。
 */
export function upgradeStateV1(value, { now = new Date().toISOString() } = {}) {
  const links = Array.isArray(value.links) ? value.links : [];
  const exportsRows = [];
  const legacyLinks = [];
  for (const link of links) {
    if (!isPlainObject(link) || typeof link.skill !== 'string' || typeof link.target !== 'string') continue;
    const row = {
      skill: link.skill,
      target: link.target,
      agentDir: typeof link.agentDir === 'string' ? link.agentDir : null,
      linkPath: typeof link.linkPath === 'string' ? link.linkPath : null,
      mode: link.mode === 'junction' ? 'junction' : 'relative',
      createdAt: isoOrNull(link.createdAt) || now,
    };
    if (link.target.startsWith('agent:')) exportsRows.push(row);
    else if (link.target === 'dsh-global' || link.target.startsWith('project:')) legacyLinks.push(row);
  }

  const installs = (Array.isArray(value.installs) ? value.installs : []).map((item) => {
    const { mode, scopeProjects, ...rest } = isPlainObject(item) ? item : {};
    const next = { ...rest, enabled: mode !== 'off' };
    if (Array.isArray(scopeProjects) && scopeProjects.length > 0) next.legacyScopeProjects = scopeProjects;
    return next;
  });

  const next = {
    ...value,
    version: 2,
    settings: {
      exportTargets: legacyExportTargets(value.settings),
      placement: value.settings?.placement === 'sidebar' ? 'sidebar' : 'settings',
      autoCheck: { enabled: true, lastRunAt: null, lastResult: null },
    },
    installs,
    exports: exportsRows,
    shadows: [],
    migration: { from: 1, at: now, status: 'links-pending', legacyLinks },
  };
  // 拆完就删：v2/v3 不再有顶层 links[]，留着会被后续 upgrade 一层层带下去
  delete next.links;
  return next;
}

/**
 * v2 → v3 的结构升级。**不读写任何文件**：
 * - `shadows[]` 全部搬进 `legacyShadows[]` 当待办清单（`reason` 先写占位，文件侧迁移再改成
 *   `locked` / `foreign` / `link` 或删除成功）；
 * - `scope === 'user'` 且能找到同名 install → 同步 `enabled = false`（幂等）；
 * - `scope === 'user'` 却找不到 install → 不凭空造 install，标 `orphan`；
 * - `project:*` 只清理桩，**不**转成全局停用；
 * - 删除 `shadows`，版本写 3；v1 遗留的链清理任务保留在 `migration` 里。
 */
export function upgradeStateV2(value, { now = new Date().toISOString() } = {}) {
  const installs = Array.isArray(value.installs) ? value.installs.map((item) => ({ ...item })) : [];
  const known = new Set(installs.map((item) => item.name));
  const legacyShadows = [];
  for (const row of Array.isArray(value.shadows) ? value.shadows : []) {
    if (!isPlainObject(row) || typeof row.skill !== 'string' || typeof row.stubPath !== 'string') continue;
    const scope = typeof row.scope === 'string' ? row.scope : 'user';
    const at = isoOrNull(row.createdAt) || isoOrNull(row.at) || now;
    let reason = 'pending';
    if (scope.startsWith('project:')) {
      reason = 'project-scope';
    } else if (scope === 'user') {
      if (known.has(row.skill)) {
        const install = installs.find((item) => item.name === row.skill);
        if (install) install.enabled = false;
      } else {
        reason = 'orphan';
      }
    }
    legacyShadows.push({ skill: row.skill, stubPath: row.stubPath, reason, at });
  }

  const previous = isPlainObject(value.migration) ? value.migration : null;
  const previousPending = Boolean(previous && previous.status !== 'done');
  const pending = previousPending || legacyShadows.length > 0;
  const migration = previousPending
    ? { ...previous, to: 3, status: 'pending' }
    : {
        from: 2,
        at: now,
        to: 3,
        status: pending ? 'pending' : 'done',
        ...(pending ? {} : { completedAt: now }),
      };

  const next = {
    ...value,
    version: 3,
    installs,
    legacyShadows,
    migration,
  };
  delete next.shadows;
  return next;
}

const INVOCATION_MODES = new Set(['auto', 'manual', 'hidden']);

/**
 * v3 → v4 的结构升级。**不读写任何文件**：
 * - 老记录没有 `mode` → `auto`（行为与 v3 完全一致）；
 * - `enabled === false` → 额外 `legacy: 'dsh-off'`，仍由 provider 隐藏，绝不静默改成 manual；
 * - `manual` / `hidden` 只做形状占位（null），真实值由后续写操作填充。
 *
 * 不写 `migration`：v1→v2→v3 的 migration 是文件侧待办清单，v4 只是字段迁移，没有 IO。
 */
export function upgradeStateV3(value) {
  const installs = (Array.isArray(value.installs) ? value.installs : []).map((item) => {
    const next = isPlainObject(item) ? { ...item } : {};
    if (!INVOCATION_MODES.has(next.mode)) next.mode = 'auto';
    if (next.mode === 'auto') {
      if (next.enabled === false) next.legacy = 'dsh-off';
      else delete next.legacy;
    } else {
      // manual / hidden 都不再依赖 provider：enabled 必须是 true，否则会双重隐藏。
      next.enabled = true;
      delete next.legacy;
    }
    if (next.mode === 'auto') {
      next.manual = null;
      next.hidden = null;
    }
    return next;
  });
  return { ...value, version: 4, installs };
}

function validateV3(state) {
  for (const key of ['subscriptions', 'installs', 'exports', 'legacyShadows']) {
    if (!Array.isArray(state[key])) return { ok: false, reason: `state.${key} is not an array` };
  }
  if (!isPlainObject(state.settings)) return { ok: false, reason: 'state.settings is not an object' };
  if (!isPlainObject(state.agents)) return { ok: false, reason: 'state.agents is not an object' };
  if (!isPlainObject(state.checks)) state.checks = {};
  if (!Array.isArray(state.agents.custom)) state.agents.custom = [];
  if (!Array.isArray(state.agents.dismissed)) state.agents.dismissed = [];
  if (state.migration !== null && state.migration !== undefined && !isPlainObject(state.migration)) {
    state.migration = null;
  }
  if (state.migration === undefined) state.migration = null;

  const settings = state.settings;
  if (!Array.isArray(settings.exportTargets)) {
    // v1 的老字段在升级时已经丢掉；这里只兜手工编辑把类型写坏的情况。
    settings.exportTargets = [];
  }
  settings.exportTargets = [
    ...new Set(
      settings.exportTargets.filter((item) => typeof item === 'string' && item.startsWith('agent:')),
    ),
  ];
  if (settings.placement !== 'sidebar') settings.placement = 'settings';

  // autoCheck 是纯增量字段：老 state 没有它时补默认值，类型写坏也只做宽松归一（不 fail）。
  if (!isPlainObject(settings.autoCheck)) settings.autoCheck = { enabled: true, lastRunAt: null, lastResult: null };
  if (typeof settings.autoCheck.enabled !== 'boolean') settings.autoCheck.enabled = true;
  if (typeof settings.autoCheck.lastRunAt !== 'string') settings.autoCheck.lastRunAt = null;
  if (!isPlainObject(settings.autoCheck.lastResult)) settings.autoCheck.lastResult = null;

  for (const row of state.installs) {
    if (!isPlainObject(row) || typeof row.name !== 'string' || !row.name) {
      return { ok: false, reason: 'state.installs[] has a row without name' };
    }
    if (typeof row.enabled !== 'boolean') row.enabled = true;
  }
  for (const [key, fields] of [
    ['exports', ['skill', 'target']],
    ['legacyShadows', ['skill', 'stubPath']],
  ]) {
    for (const row of state[key]) {
      if (!isPlainObject(row)) return { ok: false, reason: `state.${key}[] is not an object` };
      for (const field of fields) {
        if (typeof row[field] !== 'string' || !row[field]) {
          return { ok: false, reason: `state.${key}[] is missing ${field}` };
        }
      }
      if (key === 'legacyShadows') {
        if (typeof row.reason !== 'string' || !row.reason) row.reason = 'pending';
        if (typeof row.at !== 'string' || !row.at) row.at = new Date().toISOString();
      }
    }
  }
  return { ok: true, state };
}

/**
 * v4 的形状校验。只修「缺省即可推断」的字段（mode 缺省 auto、hidden 的固定文件名），
 * 不猜冲突语义：mode 写错、manual 缺 origin / original 一律只读，避免拿坏状态去写文件。
 */
function validateV4(state) {
  for (const row of state.installs) {
    if (row.mode === undefined) row.mode = 'auto';
    if (!INVOCATION_MODES.has(row.mode)) {
      return { ok: false, reason: `state.installs[] ${row.name} has invalid mode ${String(row.mode)}` };
    }
    if (row.legacy !== undefined && row.legacy !== 'dsh-off') {
      return { ok: false, reason: `state.installs[] ${row.name} has invalid legacy ${String(row.legacy)}` };
    }
    if (row.mode === 'auto') {
      row.manual = null;
      row.hidden = null;
      if (row.legacy === 'dsh-off') row.enabled = false;
      else delete row.legacy;
      continue;
    }
    row.enabled = true;
    delete row.legacy;
    if (row.mode === 'manual') {
      row.hidden = null;
      if (!isPlainObject(row.manual)) {
        return { ok: false, reason: `state.installs[] ${row.name} manual metadata is missing` };
      }
      if (row.manual.origin !== 'plugin' && row.manual.origin !== 'author') {
        return { ok: false, reason: `state.installs[] ${row.name} manual.origin is invalid` };
      }
      if (!['absent', 'true', 'false'].includes(row.manual.original)) {
        return { ok: false, reason: `state.installs[] ${row.name} manual.original is invalid` };
      }
      if (typeof row.manual.appliedAt !== 'string' || !row.manual.appliedAt) {
        row.manual.appliedAt = new Date().toISOString();
      }
      continue;
    }
    // hidden
    if (!isPlainObject(row.hidden)) {
      return { ok: false, reason: `state.installs[] ${row.name} hidden metadata is missing` };
    }
    if (row.hidden.previousMode !== 'auto' && row.hidden.previousMode !== 'manual') {
      return { ok: false, reason: `state.installs[] ${row.name} hidden.previousMode is invalid` };
    }
    if (typeof row.hidden.disabledFile !== 'string' || !row.hidden.disabledFile) {
      row.hidden.disabledFile = 'SKILL.md.disabled';
    }
    if (typeof row.hidden.marker !== 'string' || !row.hidden.marker) {
      row.hidden.marker = '.dsh-skills-console.park.json';
    }
    if (row.hidden.canonicalHash !== undefined && row.hidden.canonicalHash !== null
      && typeof row.hidden.canonicalHash !== 'string') {
      return { ok: false, reason: `state.installs[] ${row.name} hidden.canonicalHash is invalid` };
    }
    if (typeof row.hidden.at !== 'string' || !row.hidden.at) row.hidden.at = new Date().toISOString();
    if (row.manual !== undefined && row.manual !== null && !isPlainObject(row.manual)) {
      return { ok: false, reason: `state.installs[] ${row.name} manual metadata is invalid` };
    }
  }
  return { ok: true, state };
}

export function validateState(value) {
  if (!isPlainObject(value)) return { ok: false, reason: 'state is not an object' };
  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    return { ok: false, reason: 'state.version missing' };
  }
  if (value.version > STATE_VERSION) {
    return { ok: false, reason: `state.version ${value.version} newer than ${STATE_VERSION}` };
  }
  if (value.version < 1) return { ok: false, reason: `state.version ${value.version} invalid` };

  // v2 的旧桩清单在结构升级时会被搬进 legacyShadows；先按原结构校验，
  // 避免「少字段的旧桩」被静默丢掉、状态却看起来正常。
  if (value.version === 2 && value.shadows !== undefined && !Array.isArray(value.shadows)) {
    return { ok: false, reason: 'state.shadows is not an array' };
  }
  if (value.version === 2 && Array.isArray(value.shadows)) {
    for (const row of value.shadows) {
      if (!isPlainObject(row) || typeof row.skill !== 'string' || !row.skill) {
        return { ok: false, reason: 'state.shadows[] is missing skill' };
      }
      if (typeof row.stubPath !== 'string' || !row.stubPath) {
        return { ok: false, reason: 'state.shadows[] is missing stubPath' };
      }
    }
  }

  let upgraded;
  if (value.version === 1) upgraded = upgradeStateV3(upgradeStateV2(upgradeStateV1(value)));
  else if (value.version === 2) upgraded = upgradeStateV3(upgradeStateV2(value));
  else if (value.version === 3) upgraded = upgradeStateV3(value);
  else upgraded = value;

  const state = { ...emptyState(), ...upgraded };
  delete state.shadows;
  // v1 的顶层 links[] 在 v2 升级时已拆成 exports[] + migration.legacyLinks；
  // 旧版本只搬家没删原字段，v3 里读到就剪掉，不再往外写。
  delete state.links;
  const v3 = validateV3(state);
  if (!v3.ok) return v3;
  const verdict = validateV4(v3.state);
  if (!verdict.ok) return verdict;
  state.version = STATE_VERSION;
  return { ok: true, state: verdict.state };
}

/**
 * 状态读写。写入规则：全量读 → 校验 → 临时文件 → rename。
 * 损坏时**只读降级**，绝不 fail-open：宁可只读，也不要拿坏状态去覆盖链接。
 */
export class StateStore {
  constructor(paths, logger = () => {}) {
    this.paths = paths;
    this.logger = logger;
    this.readOnly = false;
    this.problem = null;
    this.state = emptyState();
  }

  load() {
    const file = this.paths.stateFile;
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        this.state = emptyState();
        this.readOnly = false;
        this.problem = null;
        return this.state;
      }
      this.readOnly = true;
      this.problem = `state unreadable: ${error.message}`;
      return this.state;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.readOnly = true;
      this.problem = `state not JSON: ${error.message}`;
      this.logger('state.corrupt', { reason: this.problem });
      return this.state;
    }

    const verdict = validateState(parsed);
    if (!verdict.ok) {
      this.readOnly = true;
      this.problem = verdict.reason;
      this.logger('state.corrupt', { reason: verdict.reason });
      return this.state;
    }

    this.state = verdict.state;
    this.readOnly = false;
    this.problem = null;
    const versionUpgrade = parsed.version !== STATE_VERSION;
    // v1 迁移漏删的顶层 links：v3 不再有它，读到就写回干净状态，否则会一直留在文件里
    const hasLegacyLinks = 'links' in parsed;
    const legacyLinks = hasLegacyLinks ? parsed.links : null;
    // 升级过的状态还没落盘：必须立刻写回，否则下一次 load 又按旧版升级一遍。
    // 写回之前先留原文件副本——迁移是单向的，没有副本就没有回滚。
    if (versionUpgrade || hasLegacyLinks) {
      if (versionUpgrade) {
        if (!this.backupRaw(raw, parsed.version)) {
          this.readOnly = true;
          this.problem = `state upgrade aborted: cannot back up v${parsed.version} state`;
          return this.state;
        }
        // v1→v3 跨两级：额外留一份 v2 形状的快照，出问题能看到中间态。
        if (parsed.version === 1) this.backupValue(upgradeStateV1(parsed), 2);
      }
      try {
        this.save(this.state);
        if (versionUpgrade) this.logger('state.upgraded', { from: parsed.version, to: STATE_VERSION });
        else {
          this.logger('state.links.pruned', {
            count: Array.isArray(legacyLinks) ? legacyLinks.length : 0,
          });
        }
      } catch (error) {
        // 剪 v1 残留失败不该把整个状态打成只读：内存里已经是干净结构，下次写入会再试
        if (versionUpgrade) {
          this.readOnly = true;
          this.problem = `state upgrade failed: ${error.message}`;
          this.logger('state.upgrade.failed', { reason: this.problem });
        } else {
          this.logger('state.links.prune.failed', { message: error.message });
        }
      }
    }
    return this.state;
  }

  /** 迁移前把原文件整份留一份（`migrations/state-v<n>-<ts>.json`）。 */
  backupRaw(raw, fromVersion) {
    try {
      fs.mkdirSync(this.paths.migrationsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(this.paths.migrationsDir, `state-v${fromVersion}-${stamp}.json`), raw, 'utf8');
      return true;
    } catch (error) {
      this.logger('state.backup.failed', { message: error.message });
      return false;
    }
  }

  /** 把升级中间态写一份副本（`migrations/state-v<n>-<ts>.json`）。 */
  backupValue(value, version) {
    try {
      fs.mkdirSync(this.paths.migrationsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(this.paths.migrationsDir, `state-v${version}-${stamp}.json`);
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      return true;
    } catch (error) {
      this.logger('state.backup.failed', { message: error.message });
      return false;
    }
  }

  save(next) {
    if (this.readOnly) throw new StateReadOnlyError(this.problem);
    const state = { ...next, version: STATE_VERSION };
    delete state.shadows;
    // v1 的顶层 links[] 已退休；任何调用方误带也不能再写回文件
    delete state.links;
    fs.mkdirSync(this.paths.stateDir, { recursive: true });
    writeFileAtomicSync(this.paths.stateFile, `${JSON.stringify(state, null, 2)}\n`);
    this.state = state;
    return state;
  }

  /** 便捷读改写：mutator 直接改传入对象，返回值写回。 */
  update(mutator) {
    const draft = structuredClone(this.state);
    const result = mutator(draft);
    const next = result && typeof result === 'object' && result.version ? result : draft;
    return this.save(next);
  }

  get installs() {
    return this.state.installs;
  }

  findInstall(name) {
    return this.state.installs.find((item) => item.name === name);
  }
}

export class StateReadOnlyError extends Error {
  constructor(problem) {
    super(problem || 'state is read-only');
    this.code = 'error.skills.state-readonly';
    this.problem = problem;
  }
}

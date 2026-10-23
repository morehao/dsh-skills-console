import fs from 'node:fs';
import path from 'node:path';

export const STATE_VERSION = 1;

export function emptyState() {
  return {
    version: STATE_VERSION,
    settings: { autoLinkAgents: true },
    agents: { custom: [], dismissed: [] },
    subscriptions: [],
    installs: [],
    links: [],
    checks: {},
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    return this.state;
  }

  save(next) {
    if (this.readOnly) throw new StateReadOnlyError(this.problem);
    const state = { ...next, version: STATE_VERSION };
    fs.mkdirSync(this.paths.stateDir, { recursive: true });
    const tmp = path.join(this.paths.stateDir, `.state.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, this.paths.stateFile);
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

export function validateState(value) {
  if (!isPlainObject(value)) return { ok: false, reason: 'state is not an object' };
  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    return { ok: false, reason: 'state.version missing' };
  }
  if (value.version > STATE_VERSION) {
    return { ok: false, reason: `state.version ${value.version} newer than ${STATE_VERSION}` };
  }
  if (value.version < 1) return { ok: false, reason: `state.version ${value.version} invalid` };

  const state = { ...emptyState(), ...value };
  for (const key of ['subscriptions', 'installs', 'links']) {
    if (!Array.isArray(state[key])) return { ok: false, reason: `state.${key} is not an array` };
  }
  if (!isPlainObject(state.settings)) return { ok: false, reason: 'state.settings is not an object' };
  if (!isPlainObject(state.agents)) return { ok: false, reason: 'state.agents is not an object' };
  if (!isPlainObject(state.checks)) state.checks = {};
  if (!Array.isArray(state.agents.custom)) state.agents.custom = [];
  if (!Array.isArray(state.agents.dismissed)) state.agents.dismissed = [];
  if (typeof state.settings.autoLinkAgents !== 'boolean') state.settings.autoLinkAgents = true;
  state.version = STATE_VERSION;
  return { ok: true, state };
}

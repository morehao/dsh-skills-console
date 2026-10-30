import fs from 'node:fs';
import path from 'node:path';
import { ROOT_RANKS, scanSkillRoot } from './roots.js';

/**
 * 可见性判定：**扫描根里有什么 + 每个 live agent 真正看得见什么**。
 *
 * 合并规则（与宿主 registry 对齐，见设计 §4.5）：
 * 1. 同一个根内同名：取一个（本插件不做同根多候选）；
 * 2. 跨根同名：rank 最小者胜（100 > 200 > 300 > 400 > 500 > 600 的优先级）；
 * 3. winner 是 canonical 且被本地策略停用 → 对模型不可见；
 * 4. winner 自己写着 `disable-model-invocation: true`（旧版遗留停用桩 / 别人写的同名
 *    停用技能）→ 也不可见，避免把「假技能」当成真身；
 *
 * **两种数据来源，二选一：**
 * - `scopedSkills`（首选）：`agent.ctx.get('skills').snapshot()` 的并集。这是宿主对该 agent
 *   合并后的权威结果——已经包含项目/user 根、`customSkillDirs`、bundled、以及本插件的
 *   policy provider。传了它（哪怕是空数组）就**不再做本地 rank 合并**：宿主说谁赢就谁赢、
 *   宿主没报的同名技能就判不可见。本地扫描此时只用于给 UI 补 `sources/shadowedBy` 诊断。
 * - `hostSkills`（回退）：根 context 的 `ctx.skills.snapshot()`，只含 global 层（bundled/插件）。
 *   没有 live agent 时用；本地扫描仍是合并主体，这些只作为 rank 600 的额外候选。
 *
 * 本地扫描始终执行：即便把合并权交给宿主，也需要它提供「每个根里有什么、哪几份被盖住」
 * 这类宿主快照给不出的诊断信息。
 */

/** 真实路径优先用于比较：仓库/临时目录可能是软链，raw 拼写会不一致。 */
function realOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

function samePath(left, right) {
  if (!left || !right) return false;
  return realOrSelf(path.resolve(left)) === realOrSelf(path.resolve(right));
}

/** 技能根目录：`.../SKILL.md` 取 dirname，平铺 `.md` 保持文件路径。 */
function skillRootOf(target) {
  if (!target || typeof target !== 'string') return null;
  const abs = path.resolve(target);
  return path.basename(abs) === 'SKILL.md' ? path.dirname(abs) : abs;
}

function rankOfSource(source) {
  if (source === 'bundled') return ROOT_RANKS.bundled;
  return ROOT_RANKS[source] ?? ROOT_RANKS.bundled;
}

function isPolicyHidden(entry, policyHiddenPaths) {
  for (const hidden of policyHiddenPaths) {
    if (samePath(hidden, entry.path)) return true;
  }
  return false;
}

/**
 * @param {object} options
 * @param {Array}  options.roots              `roots.listRoots()` 的结果（永远用于诊断/回退）
 * @param {Array}  options.hostSkills         根 context 的 snapshot（仅 global 层，rank 600 回退）
 * @param {Array|null} options.scopedSkills   live agent 的 snapshot 并集；数组（含空数组）即为权威
 * @param {Set}    options.policyHiddenPaths  `enabled === false` 的 canonical 目录（回退路径用）
 * @returns {{byName: Map, roots: Array, complete: boolean, errors: Array}}
 */
export function resolveVisibility({
  roots = [],
  hostSkills = [],
  scopedSkills = null,
  policyHiddenPaths = new Set<any>(),
}: {
  roots?: any[];
  hostSkills?: any[];
  scopedSkills?: any[] | null;
  policyHiddenPaths?: Set<any>;
}) {
  const byName = new Map<string, any>();
  const errors: any[] = [];
  const useScoped = Array.isArray(scopedSkills);

  const rootStats = roots.map((root) => {
    const stat: any = { source: root.source, rank: root.rank, path: root.path, label: root.label, exists: root.exists, count: 0 };
    if (!root.exists) return stat;
    const scanned = scanSkillRoot(root.path, (error) => {
      errors.push({ source: root.source, path: root.path, error: error.message || String(error) });
    });
    const { entries, ignored = [] } = scanned;
    stat.count = entries.length;
    if (ignored.length > 0) stat.ignored = ignored;
    for (const entry of entries) {
      const policyHidden = isPolicyHidden(entry, policyHiddenPaths);
      const foreignHidden = entry.modelInvocable === false;
      const candidate = {
        source: root.source,
        rank: root.rank,
        path: entry.path,
        dirName: entry.dirName || null,
        kind: entry.kind,
        hasSkillFile: entry.hasSkillFile,
        linked: Boolean(entry.linked),
        // `shadowed` 保留旧名字给 UI/诊断用：它现在表示「这一份对模型不可见」。
        shadowed: policyHidden || foreignHidden,
        policyHidden,
        foreignHidden,
        host: false,
      };
      push(byName, entry.name, candidate);
    }
    return stat;
  });

  // 回退路径：根 context snapshot 的 global 层（bundled/插件）当 rank 600 候选。
  if (!useScoped) {
    for (const skill of hostSkills) {
      if (!skill || typeof skill.name !== 'string' || !skill.name) continue;
      push(byName, skill.name, {
        source: 'bundled',
        rank: ROOT_RANKS.bundled,
        path: skill.path || null,
        kind: 'dir',
        hasSkillFile: true,
        linked: false,
        shadowed: false,
        policyHidden: false,
        foreignHidden: false,
        host: true,
        provider: skill.provider || null,
        hostSource: skill.source || null,
      });
    }
  }

  // 权威路径：宿主对每个 live agent 的合并结果。
  const scopedByName = new Map<string, any>();
  if (useScoped) {
    for (const skill of scopedSkills as any[]) {
      if (!skill || typeof skill.name !== 'string' || !skill.name) continue;
      scopedByName.set(skill.name, skill);
    }
  }

  const resolved = new Map<string, any>();
  const names = new Set<string>([...byName.keys(), ...scopedByName.keys()]);
  for (const name of names) {
    const candidates: any[] = byName.get(name) || [];

    if (useScoped && scopedByName.has(name)) {
      // 宿主报了这个名字：以宿主的 winner/invocation 为准。
      const scoped = scopedByName.get(name);
      const scopedRoot = skillRootOf(scoped.path);
      const localMatch = candidates.find((item) => item.path && samePath(item.path, scopedRoot)) || null;
      const modelInvocable = scoped.invocation ? scoped.invocation.modelInvocable !== false : true;
      // 禁用来自 frontmatter（作者/停用桩）还是来自外部策略：本地候选的 foreignHidden 已经
      // 按 frontmatter 判过；两者都 false 但宿主说不可调用 = 外部策略（policy provider）。
      const localForeign = Boolean(localMatch?.foreignHidden);
      const foreignHidden = !modelInvocable && localForeign;
      const policyHidden = !modelInvocable && !localForeign;
      const winner = localMatch
        ? { ...localMatch, shadowed: !modelInvocable, policyHidden, foreignHidden }
        : {
            source: scoped.source || 'host',
            rank: rankOfSource(scoped.source),
            path: scopedRoot,
            dirName: null,
            kind: scopedRoot && /SKILL\.md$/.test(String(scoped.path || '')) ? 'dir' : 'file',
            hasSkillFile: Boolean(scopedRoot),
            linked: false,
            shadowed: !modelInvocable,
            policyHidden,
            foreignHidden,
            host: true,
            provider: scoped.provider || null,
            hostSource: scoped.source || null,
          };
      const cands = localMatch ? candidates.map((item) => (item === localMatch ? winner : item)) : [winner];
      resolved.set(name, makeEntry(name, winner, cands));
      continue;
    }

    // 权威路径下、宿主没报这个本地同名技能：说明该 agent 看不到它（例如 preset 没挂这个根）。
    if (useScoped && candidates.length > 0) {
      const sorted = [...candidates].sort((left, right) => left.rank - right.rank);
      const winner = { ...sorted[0], shadowed: true, policyHidden: false, foreignHidden: false, scopeHidden: true };
      resolved.set(name, makeEntry(name, winner, sorted.map((item) => (item === sorted[0] ? winner : item))));
      continue;
    }

    // 回退路径：本地 rank 合并（旧行为）。
    const sorted = [...candidates].sort((left, right) => left.rank - right.rank);
    const winner = sorted[0];
    resolved.set(name, makeEntry(name, winner, sorted));
  }

  return { byName: resolved, roots: rootStats, complete: errors.length === 0, errors };
}

/** 由 winner + 全部候选拼出对外的可见性条目（字段与拆分前一致，另加 scopeHidden）。 */
function makeEntry(name: string, winner: any, candidates: any[]) {
  // 每个根里的状态，供 UI 解释「为什么看不见」
  const sources = {};
  for (const candidate of candidates) {
    const state = candidate.shadowed ? 'shadowed' : 'present';
    if (!sources[candidate.source] || state === 'shadowed') sources[candidate.source] = state;
  }
  // 同名但目录名不同 = 有一份「伪装成同名技能」的副本（如 `x.bak-2026…/`），
  // 宿主按 frontmatter name 去重，所以它们真的会互相遮盖。这条必须让 UI 说出来。
  const nameConflict = candidates.some(
    (item) => item.dirName && winner.dirName && item.dirName !== winner.dirName,
  );
  const hiddenKind = winner.policyHidden ? 'policy' : winner.scopeHidden ? 'scope' : 'foreign';
  return {
    name,
    visible: !winner.shadowed,
    shadowed: winner.shadowed,
    policyHidden: Boolean(winner.policyHidden),
    foreignHidden: Boolean(winner.foreignHidden),
    hiddenBy: winner.shadowed ? [{ kind: hiddenKind, path: winner.path }] : [],
    winnerSource: winner.source,
    winnerPath: winner.path,
    winnerDirName: winner.dirName || null,
    path: winner.path,
    kind: winner.kind,
    hasSkillFile: winner.hasSkillFile,
    hostOnly: winner.host,
    scopeHidden: Boolean(winner.scopeHidden),
    nameConflict,
    // 同名多份里被盖住的那几份，UI 要能列出「它们没生效」
    shadowedBy: nameConflict
      ? candidates
          .filter((item) => !(item.source === winner.source && samePath(item.path, winner.path)))
          .map((item) => ({
            source: item.source,
            rank: item.rank,
            path: item.path,
            dirName: item.dirName || null,
            shadowed: item.shadowed,
          }))
      : [],
    sources,
    candidates,
  };
}

function push(map, name, candidate) {
  const list = map.get(name);
  if (list) list.push(candidate);
  else map.set(name, [candidate]);
}

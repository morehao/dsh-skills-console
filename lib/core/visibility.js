import path from 'node:path';
import { scanSkillRoot } from './roots.js';

/**
 * 可见性判定：**扫描根里有什么 + 本地策略隐藏了哪一份**，而不是「链在不在」。
 *
 * 合并规则（与宿主 registry 对齐，见设计 §4.5）：
 * 1. 同一个根内同名：取一个（本插件不做同根多候选）；
 * 2. 跨根同名：rank 最小者胜（100 > 200 > 300 > 400 > 500 > 600 的优先级）；
 * 3. winner 是 canonical 且被本地策略停用 → 对模型不可见；
 * 4. winner 自己写着 `disable-model-invocation: true`（旧版遗留停用桩 / 别人写的同名
 *    停用技能）→ 也不可见，避免把「假技能」当成真身；
 * 5. 宿主 `snapshot()` 里的 bundled/插件技能作为 rank 600 的额外候选，
 *    任何本地根的同名技能都盖过它。
 */

function samePath(left, right) {
  if (!left || !right) return false;
  return path.resolve(left) === path.resolve(right);
}

function isPolicyHidden(entry, policyHiddenPaths) {
  for (const hidden of policyHiddenPaths) {
    if (samePath(hidden, entry.path)) return true;
  }
  return false;
}

/**
 * @param {object} options
 * @param {Array}  options.roots              `roots.listRoots()` 的结果
 * @param {Array}  options.hostSkills         `ctx.skills.snapshot()` 的技能
 * @param {Set}    options.policyHiddenPaths  `enabled === false` 的 canonical 目录
 * @returns {{byName: Map, roots: Array, complete: boolean, errors: Array}}
 */
export function resolveVisibility({ roots = [], hostSkills = [], policyHiddenPaths = new Set() }) {
  const byName = new Map();
  const errors = [];

  const rootStats = roots.map((root) => {
    const stat = { source: root.source, rank: root.rank, path: root.path, label: root.label, exists: root.exists, count: 0 };
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

  for (const skill of hostSkills) {
    if (!skill || typeof skill.name !== 'string' || !skill.name) continue;
    push(byName, skill.name, {
      source: 'bundled',
      rank: 600,
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

  const resolved = new Map();
  for (const [name, candidates] of byName) {
    candidates.sort((left, right) => left.rank - right.rank);
    const winner = candidates[0];
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
    resolved.set(name, {
      name,
      visible: !winner.shadowed,
      shadowed: winner.shadowed,
      policyHidden: Boolean(winner.policyHidden),
      foreignHidden: Boolean(winner.foreignHidden),
      hiddenBy: winner.shadowed
        ? [{ kind: winner.policyHidden ? 'policy' : 'foreign', path: winner.path }]
        : [],
      winnerSource: winner.source,
      winnerPath: winner.path,
      winnerDirName: winner.dirName || null,
      path: winner.path,
      kind: winner.kind,
      hasSkillFile: winner.hasSkillFile,
      hostOnly: winner.host,
      nameConflict,
      // 同名多份里被盖住的那几份，UI 要能列出「它们没生效」
      shadowedBy: nameConflict
        ? candidates
            .filter((item) => item !== winner)
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
    });
  }

  return { byName: resolved, roots: rootStats, complete: errors.length === 0, errors };
}

function push(map, name, candidate) {
  const list = map.get(name);
  if (list) list.push(candidate);
  else map.set(name, [candidate]);
}

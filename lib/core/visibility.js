import { readShadowMarker } from './shadow.js';
import { scanSkillRoot } from './roots.js';

/**
 * 可见性判定：**扫描根里有什么**，而不是「链在不在」。
 *
 * 合并规则（与宿主 registry 对齐，见 design §2.3）：
 * 1. 同一个根内同名：取一个（本插件不做同根多候选）；
 * 2. 跨根同名：rank 最小者胜（100 > 200 > 300 > 400 > 500 > 600 的优先级）；
 * 3. 胜者是停用标记 → 对模型不可见；
 * 4. 宿主 `snapshot()` 里的 bundled/插件技能作为 rank 600 的额外候选，
 *    任何本地根的同名技能都盖过它。
 */

function isShadowEntry(entry, shadowPaths) {
  if (shadowPaths.has(entry.path)) return true;
  // 没记账的同名标记也算停用：它本来就写着 `disable-model-invocation: true`，
  // 宿主会照这个事实执行；我们只是不认它「属于自己」。
  if (entry.kind !== 'dir' || entry.linked) return false;
  return readShadowMarker(entry.path) !== null;
}

/**
 * @param {object} options
 * @param {Array}  options.roots        `roots.listRoots()` 的结果
 * @param {Array}  options.hostSkills   `ctx.skills.snapshot()` 的技能
 * @param {Set}    options.shadowPaths  账本里登记的 stubPath
 * @returns {{byName: Map, roots: Array, complete: boolean, errors: Array}}
 */
export function resolveVisibility({ roots = [], hostSkills = [], shadowPaths = new Set() }) {
  const byName = new Map();
  const errors = [];

  const rootStats = roots.map((root) => {
    const stat = { source: root.source, rank: root.rank, path: root.path, label: root.label, exists: root.exists, count: 0 };
    if (!root.exists) return stat;
    const entries = scanSkillRoot(root.path, (error) => {
      errors.push({ source: root.source, path: root.path, error: error.message || String(error) });
    });
    stat.count = entries.length;
    for (const entry of entries) {
      const candidate = {
        source: root.source,
        rank: root.rank,
        path: entry.path,
        kind: entry.kind,
        hasSkillFile: entry.hasSkillFile,
        linked: Boolean(entry.linked),
        shadowed: isShadowEntry(entry, shadowPaths),
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
    resolved.set(name, {
      name,
      visible: !winner.shadowed,
      shadowed: winner.shadowed,
      winnerSource: winner.source,
      path: winner.path,
      kind: winner.kind,
      hasSkillFile: winner.hasSkillFile,
      hostOnly: winner.host,
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

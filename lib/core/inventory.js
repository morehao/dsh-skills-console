import fs from 'node:fs';
import path from 'node:path';
import { agentPresence } from './exporter.js';
import { hashWithoutInvocation, inspectPark } from './invocation.js';

/**
 * CLI 全局 lock（v3）。读不到、版本不认识、结构损坏都返回空账 ——
 * CLI 自己也会在 `version` 缺失或过低时丢弃整个文件（:3755/:3761-3771），这里保持一致。
 */
export function readLock(paths) {
  let raw;
  try {
    raw = fs.readFileSync(paths.lockFile, 'utf8');
  } catch {
    return { present: false, version: null, skills: {}, problem: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
      return { present: true, version: null, skills: {}, problem: 'lock.version missing' };
    }
    if (parsed.version < 3) {
      return { present: true, version: parsed.version, skills: {}, problem: `lock.version ${parsed.version} too old` };
    }
    const skills = parsed.skills && typeof parsed.skills === 'object' ? parsed.skills : {};
    return { present: true, version: parsed.version, skills, problem: null };
  } catch (error) {
    return { present: true, version: null, skills: {}, problem: `lock not JSON: ${error.message}` };
  }
}

/** canonical 扫描：`<name>/SKILL.md` 目录包，或 `<name>.md` 平铺（原生刻意不支持嵌套）。 */
export function scanCanonical(paths) {
  const dir = paths.canonical;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {
        out.push({ name: entry.name, path: full, kind: 'broken', hasSkillFile: false });
        continue;
      }
    }
    if (isDir) {
      const hasSkill = fs.existsSync(path.join(full, 'SKILL.md'));
      out.push({ name: entry.name, path: full, kind: 'dir', hasSkillFile: hasSkill });
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push({ name: entry.name.slice(0, -3), path: full, kind: 'file', hasSkillFile: true });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function readFrontmatterDescription(skillPath) {
  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const line = match[1].split('\n').find((item) => item.trim().startsWith('description:'));
    if (!line) return null;
    return line.slice(line.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '') || null;
  } catch {
    return null;
  }
}

function statusOf({ install, check, locallyModified, brokenExports, subscribed }) {
  if (!install) return 'unmanaged';
  if (locallyModified && check?.status === 'update-available') return 'conflict';
  if (locallyModified) return 'locally-modified';
  if (check?.status === 'upstream-deleted') return 'upstream-deleted';
  if (check?.status === 'update-available') return 'update-available';
  if (brokenExports.length > 0) return 'broken-link';
  if (check?.status === 'current') return 'current';
  // 没有可用的上游订阅 = 永远拿不到更新结论（检查更新只覆盖有订阅的技能）。
  // 这跟「这次没判定出来」是两件事，混进 unknown 会让待检查计数永远降不下来。
  if (!subscribed) return 'no-upstream';
  return 'unknown';
}

/**
 * 右栏账本：canonical + installs + exports + legacyShadows。
 * 左栏（模型可见）由 `visibility.js` 扫根 + policy 判定得出，两侧差异就是诊断数据，
 * 不做自动修复。
 */
export function buildLedger({ paths, state, registry, lock, visibility, now = new Date().toISOString() }) {
  const scanned = scanCanonical(paths);
  const installs = new Map(state.installs.map((item) => [item.name, item]));
  const subscriptions = new Set((state.subscriptions || []).map((item) => item.id));
  const exportsBySkill = new Map();
  for (const row of state.exports || []) {
    const list = exportsBySkill.get(row.skill);
    if (list) list.push(row);
    else exportsBySkill.set(row.skill, [row]);
  }

  const rows = scanned.map((entry) => {
    const install = installs.get(entry.name);
    const lockEntry = lock.skills?.[entry.name] || null;
    const recordExports = exportsBySkill.get(entry.name) || [];
    const presence = agentPresence({ paths, registry, name: entry.name });

    // 导出矩阵：账本里的记录 + 各 agent 目录里真的指向 canonical 的链
    // （`agentPresence` 已滤掉 foreign-link / real / 共享根 Agent，它们都不算导出）
    const exportsRows = [];
    for (const item of presence) {
      const recorded = recordExports.find((row) => row.target === item.target) || null;
      exportsRows.push({
        target: item.target,
        label: item.label,
        dir: item.dir,
        linkPath: item.linkPath,
        state: recorded && item.state === 'managed-external' ? 'managed' : item.state,
        recorded: Boolean(recorded),
        broken: Boolean(item.broken),
      });
    }

    const brokenExports = exportsRows.filter((item) => item.broken);
    const park = install && entry.kind === 'dir' ? inspectPark(entry.path) : null;
    // A′ 停用期间目录里没有 SKILL.md，但多了一个 marker 与 disabled 文件；不能按「真身缺失」算。
    const parked = Boolean(park?.parked);
    const manual = install?.mode === 'manual' ? install.manual : null;
    const visible = visibility?.byName?.get(entry.name) || null;
    // 只要存在 winner 就判「赢的是不是这一份」：技能自己声明 manual-only 时也不可见，
    // 但它确实在扫描根里，不能被 UI 说成「扫描目录里没有它」。
    const winnerIsCanonical = visible?.winnerPath
      ? path.resolve(visible.winnerPath) === path.resolve(entry.path)
      : null;
    // 作者在 frontmatter 声明了 true、但账本还是 auto：展示层按作者只读处理，不改 state。
    // （state 里的 manual 才是插件写过的；这里纯推断，避免把作者声明显示成「自动」。）
    const authorOnly = !parked && !manual && entry.kind === 'dir'
      && Boolean(visible?.foreignHidden) && winnerIsCanonical === true;
    let currentHash = null;
    let locallyModified = false;
    if (install && entry.kind === 'dir' && !parked) {
      // manual 的标记行是插件写的，比较前先按 state 还原；还原失败按「本地有改动」保守处理。
      currentHash = hashWithoutInvocation(entry.path, manual);
      locallyModified = Boolean(install.installedHash)
        && (currentHash === null || currentHash !== install.installedHash);
    }

    const check = state.checks?.[entry.name] || null;
    const subscribed = Boolean(install?.subscriptionId) && subscriptions.has(install.subscriptionId);
    const enabled = install ? install.enabled !== false : true;
    const mode = parked ? 'hidden' : authorOnly ? 'manual' : (install?.mode || 'auto');
    const legacy = install?.legacy === 'dsh-off' ? 'dsh-off' : null;
    return {
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      hasSkillFile: entry.hasSkillFile,
      description: entry.hasSkillFile
        ? readFrontmatterDescription(entry.kind === 'file' ? entry.path : path.join(entry.path, 'SKILL.md'))
        : null,
      managed: Boolean(install),
      subscriptionId: install?.subscriptionId ?? null,
      source: lockEntry?.source ?? install?.source ?? null,
      sourceUrl: lockEntry?.sourceUrl ?? null,
      sourceType: lockEntry?.sourceType ?? null,
      ref: lockEntry?.ref ?? install?.ref ?? null,
      skillPath: lockEntry?.skillPath ?? install?.skillPath ?? null,
      commit: install?.commit ?? null,
      lockHash: lockEntry?.skillFolderHash ?? null,
      installedHash: install?.installedHash ?? null,
      currentHash,
      installedAt: install?.installedAt ?? null,
      updatedAt: install?.updatedAt ?? null,
      enabled,
      /** auto / manual / hidden；hidden 以目录里的 marker 为准，state 丢了也能恢复 */
      mode,
      legacy,
      manual: manual || null,
      origin: authorOnly ? 'author' : (manual?.origin || null),
      drift: Boolean(manual?.drift),
      hidden: install?.hidden || null,
      park: park
        ? {
            parked,
            recorded: Boolean(park.marker),
            marker: park.marker || null,
            previousMode: park.marker?.previousMode || install?.hidden?.previousMode || 'auto',
            disabledFile: park.marker?.disabledFile || 'SKILL.md.disabled',
          }
        : null,
      exports: exportsRows,
      brokenExports: brokenExports.length,
      status: statusOf({ install, check, locallyModified, brokenExports, subscribed }),
      check,
      visible: Boolean(visible?.visible),
      visibleSource: visible?.winnerSource ?? null,
      visibility: {
        dsh: Boolean(visible?.visible),
        shadowed: Boolean(visible?.shadowed),
        winnerSource: visible?.winnerSource ?? null,
        sources: visible?.sources ?? {},
        winnerPath: visible?.winnerPath ?? null,
        // 模型看到的那份不是这一份（同名副本在更小的 rank 上，例如 `x.bak-2026…/`）
        winnerIsCanonical,
        nameConflict: Boolean(visible?.nameConflict),
        shadowedBy: visible?.shadowedBy ?? [],
        // 被本地策略停用（键名保留一版，客户端文案已同步）
        policyHidden: !enabled && Boolean(visible?.policyHidden),
        // canonical 自己在 frontmatter 里声明 disable-model-invocation：
        // 只影响模型调用，`/` 手动调用仍可用，不是「技能丢了」。
        selfHidden: Boolean(visible?.foreignHidden && winnerIsCanonical === true),
        hiddenBy: visible?.hiddenBy ?? [],
        // 界面停用、但更靠前的同名副本仍然可见（项目 100/200 或 user-dsh 400）：
        // 这条差异必须让 UI 说得出来。键名保留一版，语义改为「停用不了副本」。
        shadowScopeMismatch: !enabled && winnerIsCanonical === false,
      },
      note: parked
        ? '已完全停用：所有 Agent 都看不到；恢复后回到原来的模式'
        : entry.kind === 'broken'
          ? '技能目录里是一条失效的链接'
          : entry.hasSkillFile
            ? null
            : '缺少技能文件，DSH 无法解析',
      scannedAt: now,
    };
  });

  // 左栏有、右栏无：别人装的 / 别的 root 里的
  const visibleOnly = [];
  for (const [name, item] of visibility?.byName || []) {
    if (!item.visible) continue;
    if (rows.some((row) => row.name === name)) continue;
    visibleOnly.push({ name, source: item.winnerSource, path: item.path, hostOnly: item.hostOnly });
  }

  return { rows, visibleOnly, scannedAt: now };
}

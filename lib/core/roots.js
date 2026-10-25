import fs from 'node:fs';
import path from 'node:path';

/**
 * DSH 的文件系统扫描根，rank 与宿主 `@deepseek-ai/dsh-skill-filesystem` 一致
 * （**数字越小优先级越高**，与 CLI agent 表的 `rank` 方向相反）。
 *
 * 600 `bundled` 是构建期资源，磁盘上没有对应目录，只能从 `ctx.skills.snapshot()` 拿，
 * 所以在 `visibility.js` 里作为「额外候选」参与合并。
 */
export const ROOT_RANKS = Object.freeze({
  'project-dsh': 100,
  'project-agents': 200,
  custom: 300,
  'user-dsh': 400,
  'user-agents': 500,
  bundled: 600,
});

function isDir(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 当前环境下的扫描根。`projectRoot` 为空时只有两个 user 根。
 * `customDirs` 是 `Config.customSkillDirs`；本插件读不到宿主配置，默认空。
 */
export function listRoots({ paths, projectRoot = null, customDirs = [] }) {
  const roots = [];
  if (projectRoot) {
    roots.push({
      source: 'project-dsh',
      rank: ROOT_RANKS['project-dsh'],
      path: path.join(projectRoot, '.dsh', 'skills'),
      label: '本项目 .dsh/skills',
    });
    roots.push({
      source: 'project-agents',
      rank: ROOT_RANKS['project-agents'],
      path: path.join(projectRoot, '.agents', 'skills'),
      label: '本项目 .agents/skills',
    });
  }
  customDirs
    .filter((dir) => typeof dir === 'string' && path.isAbsolute(dir))
    .forEach((dir, index) => {
      roots.push({ source: 'custom', rank: ROOT_RANKS.custom, path: dir, label: `自定义目录 ${index + 1}` });
    });
  roots.push({
    source: 'user-dsh',
    rank: ROOT_RANKS['user-dsh'],
    path: paths.dshGlobalSkills,
    label: '~/.dsh/skills',
  });
  roots.push({
    source: 'user-agents',
    rank: ROOT_RANKS['user-agents'],
    path: paths.userAgentsSkills,
    label: '~/.agents/skills',
  });
  return roots.map((root) => ({ ...root, exists: isDir(root.path) }));
}

/**
 * 扫一个根：`<name>/SKILL.md` 目录包，或 `<name>.md` 平铺。
 * 与 `inventory.scanCanonical` 同一套口径，但**不跳软链**——导出模式下这里本来就是软链。
 */
export function scanSkillRoot(dir, onError = null) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (onError) onError(error);
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    let isDirectory = entry.isDirectory();
    let linked = false;
    if (entry.isSymbolicLink()) {
      try {
        isDirectory = fs.statSync(full).isDirectory();
        linked = true;
      } catch {
        out.push({ name: entry.name, path: full, kind: 'broken', hasSkillFile: false, linked: true });
        continue;
      }
    }
    if (isDirectory) {
      out.push({
        name: entry.name,
        path: full,
        kind: 'dir',
        hasSkillFile: fs.existsSync(path.join(full, 'SKILL.md')),
        linked,
      });
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push({ name: entry.name.slice(0, -3), path: full, kind: 'file', hasSkillFile: true, linked: false });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

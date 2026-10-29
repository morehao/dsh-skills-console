import fs from 'node:fs';
import path from 'node:path';
import { isSkillName } from '@deepseek-ai/dsh-skill';
import { parseSkillFrontmatter, resolveInvocation } from './skill-md.js';
import { findProjectRoot } from './paths.js';

/**
 * 项目根 = 最近含 `.git` 的祖先，无则 null（与宿主 `skill-filesystem` 一致）。
 * 实现在 `paths.js`（那里也做 env/override 归一），这里再导出一次，让
 * `roots.js` 成为「扫描根 + 项目根口径」的唯一入口。
 */
export { findProjectRoot };

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
  const roots: any[] = [];
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
 * DSH 扫描根的**路径**（只含 project / user 四个本地根）。
 *
 * 用途：判断「这个目录是不是 DSH 自己的扫描根」——往扫描根里建导出链是「用链接伪装
 * 可见性」，而扫描根本身已经决定可见性（见 AGENTS.md §2）。`customDirs` 不在此列：
 * 那是宿主配置，本插件读不到，也不会成为导出目标。
 *
 * 与 `listRoots` 的 project-dsh / project-agents / user-dsh / user-agents 一一对应，
 * `test/agents.test.mjs` 有一条用例交叉校验两者的路径集合，别只改一边。
 */
export function dshScanRootPaths(paths, { projectRoot = null }: any = {}) {
  const roots: any[] = [];
  if (projectRoot) {
    roots.push(path.join(projectRoot, '.dsh', 'skills'));
    roots.push(path.join(projectRoot, '.agents', 'skills'));
  }
  roots.push(paths.dshGlobalSkills);
  roots.push(paths.userAgentsSkills);
  return roots.map((root) => path.resolve(root));
}

/**
 * 扫一个根：`<name>/SKILL.md` 目录包，或 `<name>.md` 平铺。
 * 与 `inventory.scanCanonical` 同一套口径，但**不跳软链**——扫描根里可能有别人建的链
 * （历史上的可见性链、或用户手工放的），按目录解析才能如实反映「模型看得见什么」。
 *
 * **技能身份取 frontmatter 的 `name`，不是目录名**：宿主就是这么认的
 * （`@deepseek-ai/dsh-skill-filesystem` 的 `discoverRoot` → `parseSkillFile` →
 * `stringField(parsed.data, 'name')`）。所以 `project-insight.bak-20261008-113007/`
 * 这种目录，在宿主眼里就叫 `project-insight`，会和 canonical 的同名技能抢同一个名字。
 *
 * 与宿主一致地忽略：没有 `SKILL.md`、没有 frontmatter、缺 `name`/`description`、
 * 名字不合法。被忽略的条目放进返回值的 `ignored` 里，供诊断用（不计入可见技能）。
 */
export function scanSkillRoot(dir: string, onError: any = null) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (onError) onError(error);
    return { entries: [], ignored: [] };
  }
  const out: any[] = [];
  const ignored: any[] = [];
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
        ignored.push({ name: entry.name, path: full, reason: 'broken-link' });
        continue;
      }
    }
    let skillFile;
    if (isDirectory) skillFile = path.join(full, 'SKILL.md');
    else if (entry.isFile() && entry.name.endsWith('.md')) skillFile = full;
    else continue;

    const meta = readFrontmatter(skillFile);
    if (!meta.name) {
      ignored.push({ name: entry.name, path: full, reason: meta.reason || 'no-skill-file' });
      continue;
    }
    out.push({
      // 身份 = frontmatter name；宿主也按它去重
      name: meta.name,
      dirName: entry.name,
      path: full,
      skillFile,
      kind: isDirectory ? 'dir' : 'file',
      hasSkillFile: true,
      linked,
      description: meta.description || '',
      // 宿主按 frontmatter 决定能不能被模型调用；`disable-model-invocation: true`
      // 的技能（含 旧版的停用桩）在模型目录里就是不可见/不可调用。
      modelInvocable: meta.modelInvocable !== false,
      userInvocable: meta.userInvocable !== false,
      nameMismatch: meta.name !== entry.name.replace(/\.md$/, ''),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return { entries: out, ignored };
}

function readFrontmatter(skillFile) {
  let text;
  try {
    text = fs.readFileSync(skillFile, 'utf8');
  } catch (error) {
    return { reason: error && error.code === 'ENOENT' ? 'no-skill-file' : 'unreadable' };
  }
  const fields = parseSkillFrontmatter(text);
  if (typeof fields.name !== 'string' || typeof fields.description !== 'string'
    || fields.name.length === 0 || fields.description.length === 0) {
    return { reason: 'incomplete-frontmatter' };
  }
  // 名规则直接复用宿主的 `isSkillName`（kebab-case），与 `dsh-skill-filesystem` 同口径。
  if (!isSkillName(fields.name)) return { reason: 'invalid-name' };
  let invocation;
  try {
    invocation = resolveInvocation(fields);
  } catch {
    return { reason: 'invalid-invocation' };
  }
  return {
    name: fields.name,
    description: fields.description,
    modelInvocable: invocation.modelInvocable,
    userInvocable: invocation.userInvocable,
  };
}

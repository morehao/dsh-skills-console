import fs from 'node:fs';
import path from 'node:path';
import { isSkillName } from '@deepseek-ai/dsh-skill';
import { readSkillFrontmatter } from './skill-md.js';

/**
 * 解压目录里的技能发现（纯只读，不落盘）。
 *
 * 规则与设计 §槽位一致：
 * - 遍历（含 subpath 前缀）所有 `SKILL.md`，每个所在目录算一个技能；
 * - 名字优先 frontmatter `name`，没有则用目录名，根级用仓库名；
 * - 名字必须非空且不含 `/`、`\`、`..`、控制字符；
 * - 重名直接报错，绝不静默择一；
 * - 根级 `SKILL.md` 的 `skillPath` 是 `SKILL.md`，嵌套的是相对仓库根的 POSIX 路径。
 *
 * 返回 `[{ name, skillPath, dirPath, description }]`，按 name 排序。
 */

const SKIP_DIRS = new Set(['.git', 'node_modules']);

export class DiscoveryError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'DiscoveryError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizeSubpath(subpath) {
  if (subpath === null || subpath === undefined || subpath === '') return null;
  if (typeof subpath !== 'string') throw new DiscoveryError('invalid-subpath', 'subpath 必须是字符串');
  const cleaned = subpath.trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned) return null;
  if (cleaned.includes('\\') || /^[A-Za-z]:/.test(cleaned)) {
    throw new DiscoveryError('invalid-subpath', `subpath 不是 POSIX 相对路径: ${subpath}`);
  }
  const segments = cleaned.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new DiscoveryError('invalid-subpath', `subpath 含非法段: ${subpath}`);
  }
  return segments.join('/');
}

function assertSkillName(name, dirPath) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new DiscoveryError('invalid-name', `技能名为空: ${dirPath}`, { dirPath });
  }
  if (name.length > 120) {
    throw new DiscoveryError('invalid-name', `技能名过长: ${name}`, { name, dirPath });
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new DiscoveryError('invalid-name', `技能名含路径分隔符: ${name}`, { name, dirPath });
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new DiscoveryError('invalid-name', `技能名含控制字符: ${JSON.stringify(name)}`, { name, dirPath });
  }
  // 与宿主 `isSkillName` 同口径（kebab-case）：DSH 会忽略非 kebab 名的技能，
  // 安装期就拒绝，避免"装上了却对模型不可见"。
  if (!isSkillName(name)) {
    throw new DiscoveryError('invalid-name', `技能名必须是 kebab-case（小写字母/数字/连字符）: ${name}`, { name, dirPath });
  }
  return name;
}

/**
 * @param {{ dir: string, subpath?: string|null, repoName?: string|null }} options
 */
export function discoverSkills({ dir, subpath = null, repoName = null } = {}) {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new DiscoveryError('invalid-dir', 'discoverSkills 需要解压目录');
  }
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new DiscoveryError('invalid-dir', `不是目录: ${dir}`);
  }

  const normalizedSubpath = normalizeSubpath(subpath);
  const scanRoot = normalizedSubpath ? path.join(root, ...normalizedSubpath.split('/')) : root;
  let scanStat;
  try {
    scanStat = fs.statSync(scanRoot);
  } catch {
    throw new DiscoveryError('subpath-not-found', `subpath 不存在: ${normalizedSubpath}`, {
      subpath: normalizedSubpath,
    });
  }
  if (!scanStat.isDirectory()) {
    throw new DiscoveryError('subpath-not-found', `subpath 不是目录: ${normalizedSubpath}`, {
      subpath: normalizedSubpath,
    });
  }

  const fallbackRootName = repoName || path.basename(root);
  const found = [];

  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      throw new DiscoveryError('read-failed', `无法读取 ${current}: ${error.message}`, { cause: error });
    }

    const skillFile = entries.find((entry) => entry.name === 'SKILL.md' && entry.isFile());
    if (skillFile) {
      const skillDir = current;
      const skillMd = path.join(skillDir, 'SKILL.md');
      const frontmatter = readSkillFrontmatter(skillDir);
      const fallback = skillDir === root ? fallbackRootName : path.basename(skillDir);
      const name = assertSkillName(
        typeof frontmatter.name === 'string' && frontmatter.name.trim()
          ? frontmatter.name.trim()
          : fallback,
        skillDir,
      );
      found.push({
        name,
        skillPath: toPosix(path.relative(root, skillMd)),
        dirPath: skillDir,
        description: typeof frontmatter.description === 'string' ? frontmatter.description : null,
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      // 隐藏目录（.github、.vscode 等）里不会有技能；跳过也能避开 macOS 的 .DS_Store 目录
      if (entry.name.startsWith('.')) continue;
      walk(path.join(current, entry.name));
    }
  };

  walk(scanRoot);

  const byName = new Map();
  for (const skill of found) {
    const previous = byName.get(skill.name);
    if (previous) {
      throw new DiscoveryError('duplicate-name', `发现重名技能 ${skill.name}`, {
        name: skill.name,
        paths: [previous.skillPath, skill.skillPath],
      });
    }
    byName.set(skill.name, skill);
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

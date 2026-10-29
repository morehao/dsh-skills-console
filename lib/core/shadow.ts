import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 停用标记（shadow）：在某个 DSH 扫描根里放一个**真实目录**，用官方 frontmatter 语义
 * 把同名技能挡在模型目录之外。
 *
 * 为什么不是软链、也不是改 canonical：
 * - 改 canonical 的 `SKILL.md` 会被安装/更新整份覆盖（F13），停用态会丢；
 * - 软链在这里没有意义：扫描器只看目录内容，链接指向的仍是可用的 SKILL.md；
 * - 停用必须是「可见性」事实，而不是「链接存在与否」的推断。
 */

export const SHADOW_MARKER = '.dsh-skills-console.json';
export const SHADOW_TOOL = '@morehao/dsh-skills-console';
export const SHADOW_DESCRIPTION = '已停用（由 DSH 技能控制台生成，请勿使用）';

const MARKER_VERSION = 1;

/** 停用态 SKILL.md：三个字段缺一不可，见 design §5.2。 */
export function shadowSkillMd({ name, description = SHADOW_DESCRIPTION }) {
  return [
    '---',
    `name: ${name}`,
    `description: "${description}"`,
    'disable-model-invocation: true',
    'user-invocable: false',
    '---',
    '',
    `# ${name}（已停用）`,
    '',
    '本目录由 DSH 技能控制台生成，用来在当前扫描根内隐藏同名技能。',
    '技能真身仍在 `~/.agents/skills`，没有删除。',
    '',
    '恢复方式二选一：',
    '- 在技能控制台里点「启用」；',
    '- 直接删除本目录（会退化为「可见」，不会丢技能）。',
    '',
  ].join('\n');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读标记；不存在或不是本工具的标记都返回 null。 */
export function readShadowMarker(dirPath) {
  try {
    const raw = fs.readFileSync(path.join(dirPath, SHADOW_MARKER), 'utf8');
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if (parsed.tool !== SHADOW_TOOL || parsed.kind !== 'shadow') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 判定一个路径是不是「我们建的停用标记」。
 * - `absent`：什么都没有（可以建）；
 * - `ours`：标记与 SKILL.md 都在（幂等）；
 * - `broken`：标记在但 SKILL.md 丢了/被改（要修，不能当成功）；
 * - `foreign`：同名目录是别的东西（真实技能 / 别人的目录）——不覆盖；
 * - `link`：是软链（export 模式下的导出链），要先摘链才能建标记。
 */
export function inspectShadow(stubPath, name) {
  let st;
  try {
    st = fs.lstatSync(stubPath);
  } catch {
    return { state: 'absent', stubPath };
  }
  if (st.isSymbolicLink()) return { state: 'link', stubPath };
  if (!st.isDirectory()) return { state: 'foreign', stubPath, reason: 'not-a-directory' };

  const marker = readShadowMarker(stubPath);
  if (!marker) return { state: 'foreign', stubPath, reason: 'no-marker' };
  if (marker.skill !== name) return { state: 'foreign', stubPath, reason: 'marker-name-mismatch' };

  const skillMdPath = path.join(stubPath, 'SKILL.md');
  let raw;
  try {
    raw = fs.readFileSync(skillMdPath, 'utf8');
  } catch {
    return { state: 'broken', stubPath, reason: 'skill-md-missing', marker };
  }
  if (!/^disable-model-invocation:\s*true\s*$/m.test(raw)) {
    return { state: 'broken', stubPath, reason: 'flag-missing', marker };
  }
  if (!new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(raw)) {
    return { state: 'broken', stubPath, reason: 'name-mismatch', marker };
  }
  return { state: 'ours', stubPath, marker };
}

/**
 * 建停用标记：同层临时目录写完再 rename，避免扫描器看到半个目录。
 * `stubPath` 已存在且不是 ours 时直接拒绝（调用方转 409，带 detail）。
 */
export function createShadow({ stubPath, name, scope, canonicalHash = null, now = new Date().toISOString() }) {
  const current = inspectShadow(stubPath, name);
  if (current.state === 'ours') return { created: false, already: true, stubPath };
  if (current.state !== 'absent') {
    const error = new Error(`无法在 ${stubPath} 建停用标记：${current.state}${current.reason ? `/${current.reason}` : ''}`);
    (error as any).code = 'error.skills.shadow-conflict';
    (error as any).detail = { stubPath, state: current.state, reason: current.reason || null };
    throw error;
  }

  const parent = path.dirname(stubPath);
  fs.mkdirSync(parent, { recursive: true });
  const staging = path.join(parent, `.shadow-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(staging, { recursive: false });
  try {
    fs.writeFileSync(path.join(staging, 'SKILL.md'), shadowSkillMd({ name }), 'utf8');
    const marker = {
      tool: SHADOW_TOOL,
      kind: 'shadow',
      version: MARKER_VERSION,
      skill: name,
      scope,
      createdAt: now,
      canonicalHash,
      description: SHADOW_DESCRIPTION,
    };
    fs.writeFileSync(path.join(staging, SHADOW_MARKER), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    if (fs.existsSync(stubPath)) {
      // 竞态：staging 期间有人抢先建了同名目录
      const error = new Error(`无法在 ${stubPath} 建停用标记：已被占用`);
      (error as any).code = 'error.skills.shadow-conflict';
      (error as any).detail = { stubPath, state: 'race' };
      throw error;
    }
    fs.renameSync(staging, stubPath);
    return { created: true, stubPath, marker };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * 删停用标记：先 rename 出扫描根（原子），再递归删。
 * 删不掉就返回 removed:false 让调用方保留记账——**不许先清账再删**。
 *
 * v0.4.0 起只服务迁移与 legacy 清理：`foreign` / `link` 一律保留并报告，绝不替用户
 * 拆掉别人的软链或真实目录。
 */
export function removeShadow({ stubPath, name }) {
  const current = inspectShadow(stubPath, name);
  if (current.state === 'absent') return { removed: false, reason: 'absent', stubPath };
  if (current.state === 'foreign') return { removed: false, reason: 'not-managed', stubPath };
  if (current.state === 'link') return { removed: false, reason: 'link', stubPath };

  const parent = path.dirname(stubPath);
  const graveyard = path.join(parent, `.shadow-trash-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    fs.renameSync(stubPath, graveyard);
  } catch (error) {
    // Windows 上被占用时 rename 会失败；退回原地删，删不掉就如实返回
    try {
      fs.rmSync(stubPath, { recursive: true, force: false });
      return { removed: true, stubPath, via: 'rm' };
    } catch (rmError) {
      return { removed: false, reason: 'locked', stubPath, error: rmError.message || String(rmError) };
    }
  }
  try {
    fs.rmSync(graveyard, { recursive: true, force: true });
  } catch {
    /* 已移出扫描根，删不掉也不影响可见性 */
  }
  return { removed: true, stubPath };
}

/** 回收 `.shadow-*` 残骸（进程中断留下的 staging / trash 目录）。 */
export function reapShadowLeftovers(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const reaped: any[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith('.shadow-')) continue;
    fs.rmSync(path.join(dirPath, entry.name), { recursive: true, force: true });
    reaped.push(entry.name);
  }
  return reaped;
}

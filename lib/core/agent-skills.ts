/**
 * 把可见性合并交给**每个 live agent 自己的 skill registry**。
 *
 * 为什么不在根 context 直接 `ctx.skills.snapshot()`：文件系统 provider 挂在 agent preset 的
 * scope 层，根 context 的 skills 服务只看到 global 层（bundled/插件技能），看不到磁盘根。
 * 而 `agent.ctx.get('skills')` 属于该 agent 的 scope，`snapshot({ cwd })` 返回的正是它
 * 真正看到的合并结果（global + preset + 本插件的 policy provider），也就是「这个 agent
 * 到底能看见什么」的唯一权威。
 *
 * 本模块只做「遍历 live agent 取快照 + 按名并集」这一件事，保持与 cordis 解耦、可离线测试。
 * 没有 live agent（例如刚打开设置、还没开任何会话）时返回 `available:false`，调用方回退到
 * 本地扫描（保持旧行为），不会因为拿不到 agent 就把所有技能判成不可见。
 */

/** 单个 agent 的技能服务快照形状（只取我们需要的字段）。 */
export interface AgentSkill {
  name: string;
  path?: string;
  description?: string;
  source?: string;
  provider?: string;
  invocation?: { modelInvocable?: boolean; userInvocable?: boolean };
  resourceBase?: unknown;
}

export interface AgentSkillsResult {
  /** 至少成功取到一个 agent 快照时才为 true：调用方据此决定是否把合并权交给宿主。 */
  available: boolean;
  /** 所有 live agent 快照按名并集（同一名字取先出现的 agent，通常是主 agent）。 */
  skills: AgentSkill[];
  /** 所有参与并集的快照是否都 `complete`。任何一次失败/不完整都置 false。 */
  complete: boolean;
  /** 参与并集的 agent 数（成功取到 snapshot 的）。 */
  agents: number;
  /** 失败摘要（只有 agent id 与错误信息，不含技能正文）。 */
  errors: Array<{ agent: string | null; message: string }>;
}

const EMPTY: AgentSkillsResult = { available: false, skills: [], complete: false, agents: 0, errors: [] };

/**
 * 遍历 `agentsService.list()` 的每个 live agent，取 `agent.ctx.get('skills').snapshot({cwd})`
 * 并按技能名并集。任何单个 agent 失败只记错误、不影响其余 agent（fail-open 到部分结果）。
 *
 * @param agentsService 宿主 `ctx.get('agents')`（可能为 undefined）
 * @param options.cwd    查询工作区；原样透传给每个 agent 的 snapshot
 * @param options.logger 可选事件日志 `(event, detail) => void`
 */
export async function collectAgentSkills(
  agentsService: any,
  { cwd, logger = () => {} }: { cwd?: string | null; logger?: (event: string, detail?: any) => void } = {},
): Promise<AgentSkillsResult> {
  let list: any[] = [];
  try {
    list = typeof agentsService?.list === 'function' ? agentsService.list() || [] : [];
  } catch (error: any) {
    logger('visible.agents.list.failed', { message: error?.message || String(error) });
    return { ...EMPTY, errors: [{ agent: null, message: error?.message || String(error) }] };
  }
  if (!Array.isArray(list) || list.length === 0) return { ...EMPTY };

  const byName = new Map<string, AgentSkill>();
  const errors: Array<{ agent: string | null; message: string }> = [];
  let complete = true;
  let agents = 0;

  for (const agent of list) {
    const id = agent?.id ?? null;
    let skills: any;
    try {
      skills = agent?.ctx?.get?.('skills') ?? agent?.ctx?.skills;
    } catch (error: any) {
      errors.push({ agent: id, message: error?.message || String(error) });
      continue;
    }
    if (typeof skills?.snapshot !== 'function') continue;
    try {
      const snapshot = await skills.snapshot({ cwd: cwd || undefined });
      agents += 1;
      if (snapshot?.complete === false) complete = false;
      for (const item of snapshot?.skills || []) {
        if (!item || typeof item.name !== 'string' || !item.name) continue;
        if (!byName.has(item.name)) byName.set(item.name, item);
      }
    } catch (error: any) {
      complete = false;
      errors.push({ agent: id, message: error?.message || String(error) });
      logger('visible.agents.snapshot.failed', { agent: id, message: error?.message || String(error) });
    }
  }

  if (agents === 0) return { ...EMPTY, errors };
  return { available: true, skills: [...byName.values()], complete, agents, errors };
}

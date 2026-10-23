/** “+n” 气泡：fixed 定位 + portal 到 body，列表的 overflow:hidden 裁不到。 */
import { h, portalize } from '../host.js';

export function AgentTip({ t, agentTip, agentTipPos, nodeRef }) {
  const node = h('div', {
    ref: nodeRef,
    id: 'dshsc-agenttip',
    role: 'tooltip',
    className: 'dshsc-agenttip',
    style: agentTipPos
      ? { left: `${agentTipPos.left}px`, top: `${agentTipPos.top}px` }
      : { left: 0, top: 0, visibility: 'hidden' },
  },
    h('div', { className: 'dshsc-agenttip-head' },
      h('span', null, t('meta.agentsAll')),
      h('span', { className: 'dshsc-agenttip-n' }, agentTip.labels.length)),
    h('div', { className: 'dshsc-agenttip-list' },
      agentTip.labels.map((label, index) => h('span', {
        className: `dshsc-agent${label === 'DSH' ? ' dsh' : ''}`,
        key: `agenttip-${index}`,
      }, label === 'DSH' ? h('i', { className: 'dshsc-dot' }) : null, label))));
  // 列表容器 overflow:hidden，必须挂到 body 才能浮在行外
  return portalize(node);
}

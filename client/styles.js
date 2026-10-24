/** 客户端全部样式：一个字符串，由根节点注入 <style>。 */
export const CSS = `
  /* 主面板形态：与 DSH 自带管理页同一边距/滚动方式 */
  .dshsc-page { box-sizing: border-box; width: 100%; height: 100%; overflow: auto;
    padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) clamp(24px, 4vw, 48px) 48px; }
  .dshsc-page .dshsc-root { max-width: 980px; margin: 0 auto; }
  .dshsc-page .dshsc-title { font-size: 20px; font-weight: 500; line-height: 28px; }
  .dshsc-page .dshsc-sub { font-size: 13px; line-height: 20px; }
  .dshsc-root { display: flex; flex-direction: column; gap: 14px; color: var(--dsw-alias-label-primary);
    container-type: inline-size; container-name: dshsc; }
  .dshsc-head { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
  .dshsc-heading { display: flex; align-items: flex-start; gap: 10px; min-width: 0; flex: 1; }
  .dshsc-heading-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dshsc-logo { flex: none; display: block; border-radius: 8px; }
  .dshsc-title { font-size: 17px; font-weight: 600; letter-spacing: -.01em; margin: 0; }
  .dshsc-sub { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; max-width: 64ch; }
  .dshsc-spacer { flex: 1; }
  .dshsc-head-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
  .dshsc-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }

  /* 身份：包名 + 版本合成一枚低调 chip，不再各占一段 */
  .dshsc-id { display: inline-flex; align-items: center; gap: 6px; min-width: 0; height: 22px; padding: 0 7px;
    border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); }
  .dshsc-pkg { font-size: 11px; line-height: 1; color: var(--dsw-alias-label-tertiary); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace); }
  .dshsc-idsep { flex: none; font-size: 10px; color: var(--dsw-alias-border-l3); }
  .dshsc-ver { flex: none; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

  /* 插件级工具（设置 / GitHub）：跟在身份胶囊后面，用细线分组；鬼影按钮不和业务按钮抢权重 */
  .dshsc-tools { display: inline-flex; align-items: center; gap: 2px; flex: none; margin-left: 2px;
    padding-left: 9px; border-left: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-tool { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
    width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent;
    color: var(--dsw-alias-label-secondary); cursor: pointer; text-decoration: none;
    transition: background .12s ease, color .12s ease; }
  .dshsc-tool:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-tool:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
  .dshsc-tool[aria-expanded="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-settings { position: relative; display: inline-flex; }
  /* 设置面板留在 Host 对话框内（焦点陷阱 / 层级都跟着走）；开启时按左右余量选边和宽度 */
  .dshsc-pop { position: absolute; top: calc(100% + 8px); z-index: 30; box-sizing: border-box;
    max-width: calc(100vw - 16px); max-height: calc(100vh - 24px); overflow: auto;
    display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px;
    border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, .35); }
  .dshsc-pop-title { font-size: 11px; letter-spacing: .06em; color: var(--dsw-alias-label-tertiary); }
  .dshsc-pop-label { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    font-size: 12px; color: var(--dsw-alias-label-primary); }
  .dshsc-pop-label em { font-style: normal; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-pop-name { display: inline-flex; align-items: baseline; gap: 6px; }
  .dshsc-pop-hint { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }

  .dshsc-btn { font: inherit; font-size: 12px; line-height: 1; padding: 7px 11px; border-radius: 8px; cursor: pointer;
    white-space: nowrap;
    border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
    transition: background .12s ease, border-color .12s ease, color .12s ease; }
  /* 页头动作按钮：显式同高（border-box），文案换行 / 字体回退都不会让其中一个变高 */
  .dshsc-head-actions .dshsc-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
    height: 28px; padding: 0 11px; }
  .dshsc-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
  .dshsc-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-btn:disabled { opacity: .42; cursor: not-allowed; }
  /* brand-primary 与 bg-base 在明暗主题里互为反色：文字用 bg-base 才不会是白底白字 */
  .dshsc-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); font-weight: 600; }
  .dshsc-btn.primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); opacity: .9; }
  .dshsc-btn.tint { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); border-color: transparent;
    color: var(--dsw-alias-brand-primary); font-weight: 500; }
  .dshsc-btn.tint:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
  .dshsc-btn.ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); padding: 6px 8px; }
  .dshsc-btn.ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-btn.ghost.danger { color: var(--dsw-alias-state-error-primary); }
  .dshsc-btn.ghost.danger:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
  .dshsc-btn.ghost.dshsc-update { color: var(--dsw-alias-brand-primary); }
  .dshsc-btn.ghost.dshsc-update:hover:not(:disabled) { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }

  .dshsc-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dshsc-tabs { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 9px; background: var(--dsw-alias-bg-layer-1); }
  .dshsc-tab { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; padding: 5px 10px;
    border: 0; border-radius: 7px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
  .dshsc-tab:hover { color: var(--dsw-alias-label-primary); }
  .dshsc-tab.active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
    box-shadow: 0 0 0 1px var(--dsw-alias-border-l1), 0 1px 2px rgba(0,0,0,.12); }
  .dshsc-tab .n { min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 999px;
    background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary);
    font-size: 10px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
  .dshsc-tab.active .n { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); }

  .dshsc-search { position: relative; display: inline-flex; align-items: center; }
  .dshsc-search > svg { position: absolute; left: 8px; pointer-events: none; color: var(--dsw-alias-label-tertiary); }
  .dshsc-search input { box-sizing: border-box; width: 210px; height: 30px; padding: 0 27px 0 27px;
    border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; outline: none; }
  .dshsc-search input::placeholder { color: var(--dsw-alias-label-tertiary); }
  .dshsc-search input:focus { border-color: var(--dsw-alias-brand-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
  .dshsc-search input::-webkit-search-cancel-button { display: none; }
  .dshsc-search-clear { position: absolute; right: 4px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 13px; line-height: 1; }
  .dshsc-search-clear:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

  .dshsc-segment { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
    background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
  .dshsc-segment .dshsc-btn { display: inline-flex; align-items: center; height: 28px; border: 0; border-radius: 0;
    background: transparent; padding: 0 10px; font-size: 11.5px; }
  .dshsc-segment .dshsc-btn + .dshsc-btn { border-left: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-segment .dshsc-btn[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

  .dshsc-listbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dshsc-filters { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
  .dshsc-fchip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border: 1px solid transparent;
    border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px;
    cursor: pointer; white-space: nowrap; }
  .dshsc-fchip:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-fchip.active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
  .dshsc-fchip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-fchip .n { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
  .dshsc-fchip.active .n { color: var(--dsw-alias-label-secondary); }
  .dshsc-fdot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-state-warn-primary); flex: none; }
  .dshsc-listbar-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .dshsc-listbar .dshsc-btn { display: inline-flex; align-items: center; height: 26px; padding: 0 9px; font-size: 11.5px; }

  .dshsc-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
  .dshsc-row { display: grid; grid-template-columns: 300px minmax(0, 1fr) 218px; gap: 14px; align-items: center;
    padding: 8px 12px 8px 14px; min-height: 54px; border-top: 1px solid var(--dsw-alias-border-l1);
    transition: background .12s ease; }
  .dshsc-list > .dshsc-row:first-child { border-top: 0; }
  .dshsc-row:hover { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 48%, transparent); }
  .dshsc-row.off { opacity: .7; }
  .dshsc-cell { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .dshsc-namerow { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .dshsc-name { font-size: 13px; font-weight: 600; letter-spacing: -.005em; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dshsc-src { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 11.5px; line-height: 16px;
    color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dshsc-src .dshsc-code { color: var(--dsw-alias-label-secondary); font-size: 11px; }
  .dshsc-note { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
  .dshsc-note.warn { color: var(--dsw-alias-state-warn-primary); }

  .dshsc-tag { display: inline-flex; align-items: center; gap: 3px; flex: none; height: 18px; padding: 0 6px;
    border-radius: 5px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
    font-size: 10.5px; line-height: 1; white-space: nowrap; }
  .dshsc-tag.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent); color: var(--dsw-alias-state-success-primary); }
  .dshsc-tag.warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 13%, transparent); color: var(--dsw-alias-state-warn-primary); }
  .dshsc-tag.err { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent); color: var(--dsw-alias-state-error-primary); }
  .dshsc-tag.off { color: var(--dsw-alias-label-tertiary); }

  .dshsc-agents { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
  .dshsc-agent { display: inline-flex; align-items: center; gap: 5px; flex: none; height: 20px; padding: 0 7px;
    border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; color: var(--dsw-alias-label-secondary);
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, transparent); font-size: 11px; white-space: nowrap; }
  .dshsc-agent.dsh { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, var(--dsw-alias-border-l1));
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
  .dshsc-agent .dshsc-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .8; }
  .dshsc-agent.more, .dshsc-agent.scope { border-style: dashed; background: transparent; color: var(--dsw-alias-label-tertiary); }
  .dshsc-agent.more { margin: 0; font: inherit; font-size: 11px; line-height: 1; cursor: pointer;
    -webkit-appearance: none; appearance: none; }
  .dshsc-agent.more:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-tertiary); }
  .dshsc-agent.more[aria-expanded="true"] { color: var(--dsw-alias-label-primary);
    border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); }
  .dshsc-agent.more:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
  .dshsc-unlinked { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }

  /* “+n” 的悬浮气泡：portal 到 body + fixed 定位，列表的 overflow:hidden 裁不到 */
  .dshsc-agenttip { position: fixed; z-index: 10000; box-sizing: border-box; width: max-content;
    max-width: min(340px, calc(100vw - 24px)); padding: 9px 10px; display: flex; flex-direction: column; gap: 7px;
    border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, .32), 0 2px 6px rgba(0, 0, 0, .18); pointer-events: none; }
  .dshsc-agenttip-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-agenttip-n { min-width: 16px; height: 15px; padding: 0 5px; box-sizing: border-box; border-radius: 999px;
    background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 20%, transparent);
    color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 15px; text-align: center;
    font-variant-numeric: tabular-nums; }
  .dshsc-agenttip-list { display: flex; flex-wrap: wrap; gap: 4px; }

  .dshsc-row .dshsc-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; flex-wrap: nowrap; }
  .dshsc-row .dshsc-btn { display: inline-flex; align-items: center; justify-content: center; height: 24px;
    padding: 0 7px; font-size: 11.5px; border-radius: 6px; }
  /* 行内图标按钮：删除 / 检查更新 24–26px；页头工具入口见 .dshsc-tool */
  .dshsc-btn.sq { box-sizing: border-box; width: 24px; padding: 0; justify-content: center; }
  .dshsc-btn.sq svg { display: block; }
  .dshsc-listbar .dshsc-btn.sq { width: 26px; padding: 0; }
  .dshsc-sub-row .dshsc-btn.sq { width: 24px; padding: 0; }

  .dshsc-groupstack { display: flex; flex-direction: column; gap: 12px; }
  .dshsc-group-head { display: flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid var(--dsw-alias-border-l1);
    border-bottom: 0; border-radius: 10px 10px 0 0; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 48%, transparent);
    font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-primary); }
  .dshsc-group-head + .dshsc-list { border-radius: 0 0 10px 10px; }
  .dshsc-group-head .n { min-width: 16px; height: 15px; padding: 0 5px; box-sizing: border-box; border-radius: 999px;
    background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 20%, transparent); color: var(--dsw-alias-label-secondary);
    font-size: 10px; line-height: 15px; text-align: center; font-weight: 500; font-variant-numeric: tabular-nums; }
  .dshsc-gdot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-brand-primary); opacity: .8; flex: none; }

  /* 说明会是一整句，窄面板必然折行：图标单独成列并贴住首行，正文列负责换行，避免图标被挤成孤行 */
  .dshsc-notice { display: flex; flex-direction: column; font-size: 11.5px;
    color: var(--dsw-alias-label-tertiary); line-height: 1.5; }
  .dshsc-notice-row { display: flex; align-items: flex-start; gap: 6px; }
  .dshsc-notice-row > svg { flex: none; margin-top: 2px; }
  .dshsc-notice-text { flex: 1 1 auto; min-width: 0; color: var(--dsw-alias-label-secondary); }
  .dshsc-notice-text .dshsc-linkbtn { margin-left: 2px; white-space: nowrap; }
  .dshsc-linkbtn { border: 0; background: none; padding: 0 2px; font: inherit; font-size: 11.5px;
    color: var(--dsw-alias-brand-primary); cursor: pointer; }
  .dshsc-linkbtn:hover { text-decoration: underline; }
  .dshsc-linkbtn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 4px; }
  .dshsc-notice-list { margin: 4px 0 0 19px; padding: 7px 10px; border-radius: 8px;
    border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.7; }
  .dshsc-empty { text-align: center; padding: 30px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px;
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent); }
  .dshsc-empty .dshsc-name { font-size: 14px; }
  .dshsc-empty .dshsc-meta { justify-content: center; margin-top: 6px; }
  .dshsc-meta { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); display: flex; flex-wrap: wrap; }

  .dshsc-banner { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 9px 12px; font-size: 12px;
    line-height: 1.55; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dshsc-banner.err { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
  .dshsc-banner.warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); }

  .dshsc-sub-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 52px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-sub-block:first-child .dshsc-sub-row { border-top: 0; }
  .dshsc-sub-block + .dshsc-sub-block { border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-caret { flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent;
    color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
  .dshsc-caret:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
  .dshsc-caret:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-sub-row .dshsc-name { font-size: 12.5px; }
  .dshsc-substat { font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
  .dshsc-sub-row .dshsc-actions { margin-left: auto; display: flex; align-items: center; gap: 2px; }
  .dshsc-sub-row .dshsc-btn { height: 24px; padding: 0 7px; font-size: 11.5px; display: inline-flex; align-items: center; }
  .dshsc-sub-list { display: flex; flex-direction: column; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 22%, transparent); }
  .dshsc-sub-entry { display: flex; align-items: center; gap: 8px;
    font-size: 12px; padding: 6px 12px 6px 44px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-sub-entry:first-child { border-top: 0; }
  .dshsc-sub-entry .dshsc-name { font-size: 12px; font-weight: 500; }
  .dshsc-state { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
  .dshsc-state.ok svg { color: var(--dsw-alias-state-success-primary); }
  .dshsc-sub-entry .dshsc-actions { margin-left: auto; display: flex; justify-content: flex-end; }
  .dshsc-sub-entry .dshsc-btn { height: 24px; padding: 0 9px; font-size: 11.5px; }
  /* 设置页的真实宽度常常远小于窗口（侧栏 + 页面缩放），视口 media query 不可靠；
     以 .dshsc-root 自身宽度为准，窄面板时切两列，避免固定列把 Agent 标签挤成竖排。 */
  @container dshsc (max-width: 900px) {
    .dshsc-head-actions { width: 100%; justify-content: flex-end; }
    .dshsc-search input { width: 180px; }
    .dshsc-row { grid-template-columns: minmax(0, 1fr) 196px; row-gap: 3px; padding: 9px 12px; }
    .dshsc-cell { grid-column: 1; }
    .dshsc-agents { grid-column: 1; }
    .dshsc-row .dshsc-actions { grid-column: 2; grid-row: 1 / span 2; }
    .dshsc-row .dshsc-btn { padding: 0 5px; }
  }
  /* 窄面板里工具组会换到下一行，行首的分割线就没有意义了 */
  @container dshsc (max-width: 520px) {
    .dshsc-tools { border-left: 0; padding-left: 0; margin-left: 0; }
  }
  .dshsc-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

  /* 与 DSH 自带开关同尺寸/同 token：关是 border-l3 轨道，开是 brand-primary 轨道 */
  .dshsc-switch { box-sizing: border-box; position: relative; flex: none; width: 36px; height: 20px; padding: 2px;
    border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer;
    transition: background .14s ease; }
  .dshsc-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-switch:disabled { cursor: not-allowed; opacity: .5; }
  .dshsc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
  .dshsc-knob { display: block; width: 16px; height: 16px; border-radius: 50%;
    background: var(--dsw-alias-switch-thumb); box-shadow: 0 1px 2px rgba(0, 0, 0, .28);
    transition: transform .12s ease, background .12s ease; }
  .dshsc-switch[aria-checked="true"] .dshsc-knob { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }

  .dshsc-overlay { position: fixed; inset: 0; background: rgba(4,6,9,.55); display: flex; align-items: center; justify-content: center;
    z-index: 60; padding: 20px; backdrop-filter: blur(2px); }
  .dshsc-modal { position: relative; width: min(600px, 100%); max-height: calc(100vh - 40px); overflow: auto;
    background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
    padding: 18px; display: flex; flex-direction: column; gap: 14px;
    box-shadow: 0 20px 56px rgba(0,0,0,.38), 0 2px 8px rgba(0,0,0,.18); }
  /* 64ch 是主页面长文的舒适行长；弹窗说明只有一两句，用满弹窗宽度，避免没必要的折行 */
  .dshsc-modal .dshsc-sub { max-width: none; }
  .dshsc-modal h3 { margin: 0; font-size: 15px; font-weight: 600; padding-right: 26px; }
  .dshsc-modal-close { position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; border: 0; border-radius: 7px;
    background: transparent; color: var(--dsw-alias-label-secondary); font-size: 18px; line-height: 1; cursor: pointer; }
  .dshsc-modal-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

  .dshsc-group { margin: 2px 0 -2px; font-size: 11px; font-weight: 600; letter-spacing: .02em;
    color: var(--dsw-alias-label-secondary); }
  .dshsc-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
  .dshsc-field input { font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; }
  .dshsc-field input:focus { border-color: var(--dsw-alias-brand-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
  /* 来源输入 + 检测按钮同一行；输入框吃掉剩余宽度，按钮不被挤压 */
  .dshsc-inline { display: flex; gap: 6px; align-items: stretch; }
  .dshsc-inline input { flex: 1; min-width: 0; }
  .dshsc-inline .dshsc-btn { flex: none; }

  .dshsc-check { display: flex; align-items: center; gap: 9px; font-size: 13px; padding: 5px 8px; border-radius: 8px; cursor: pointer; }
  .dshsc-check:hover { background: var(--dsw-alias-bg-layer-1); }
  .dshsc-check input[type="checkbox"], .dshsc-check input[type="radio"] { appearance: none; -webkit-appearance: none;
    flex: none; position: relative; width: 15px; height: 15px; margin: 0; border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 4px; background: var(--dsw-alias-bg-layer-1); cursor: pointer; }
  .dshsc-check input[type="radio"] { border-radius: 50%; }
  .dshsc-check input[type="checkbox"]:checked { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
  /* 选中用反色圆点：品牌色可能是白色，白勾会消失 */
  .dshsc-check input[type="checkbox"]:checked::after { content: ''; position: absolute; left: 50%; top: 50%;
    width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-bg-base);
    transform: translate(-50%, -50%); }
  .dshsc-check input[type="radio"]:checked { border: 5px solid var(--dsw-alias-brand-primary); }
  .dshsc-check input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
  .dshsc-check input:disabled { opacity: .55; cursor: not-allowed; }
  .dshsc-check small { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dshsc-check span { white-space: nowrap; }
  /* 添加技能：每个技能一行，名字 + 两行描述 + 路径；描述太长时截断，不把弹窗撑高 */
  .dshsc-skill { align-items: flex-start; }
  .dshsc-skill input[type="checkbox"] { margin-top: 3px; }
  .dshsc-skill-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .dshsc-skill-name { font-weight: 600; }
  .dshsc-check .dshsc-skill-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; white-space: normal; line-height: 1.4; }
  .dshsc-check .dshsc-skill-path { font-size: 11px; opacity: .75; }

  .dshsc-panel { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1);
    padding: 4px; max-height: 300px; overflow: auto; display: flex; flex-direction: column; }
  .dshsc-panel .dshsc-check:hover { background: var(--dsw-alias-bg-layer-2); }
  /* 必选项（dsh 全局）：勾着但不可改，别让它看起来能点 */
  .dshsc-panel .dshsc-check.locked { cursor: default; }
  .dshsc-panel .dshsc-check.locked:hover { background: transparent; }

  .dshsc-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .dshsc-toast { position: fixed; right: 18px; bottom: 18px; z-index: 70; font-size: 12px; padding: 10px 13px; border-radius: 9px;
    background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2);
    box-shadow: 0 8px 24px rgba(0,0,0,.22); max-width: 420px; }
  .dshsc-toast.err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
  .dshsc-toast.ok { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, var(--dsw-alias-border-l2)); }
`;

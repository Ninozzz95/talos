/*
 * FE-048, the redesign: ONE function decides the shape of the frame, as budget.ts decides its heights. Pure. The thresholds are the
 * approved mockup's (`misure`, bozzetto-cli/src/guscio.js). From 150 columns the left bar and the right panel stand together; from 110 one
 * of them, the one asked for last; under that there is only the chat, and the one with the focus takes the whole width above the footer.
 */
import {FOOTER_TWO_ROWS_FROM} from '../components/chrome-rows.ts';

export const BAR_COLUMNS=26;
export const PANEL_COLUMNS=42;
export const ONE_COLUMN_FROM=110;
const BOTH_FROM=150,FULL_ROWS_FROM=80;

export type FrameView='zen'|'essential'|'full';
export type FrameSide='bar'|'panel';
export type FrameState={view:FrameView;bar:boolean;panel:boolean;side:FrameSide;focus?:FrameSide|null};
export type FrameShape={bar:number;panel:number;centre:number;whole:boolean;footerRows:1|2;compact:boolean};

export function frameShape({columns}:{columns:number;rows:number},state:FrameState):FrameShape{
  let bar=0,panel=0,whole=false;
  if(columns>=BOTH_FROM){bar=state.bar?BAR_COLUMNS:0;panel=state.panel?PANEL_COLUMNS:0;}
  else if(columns>=ONE_COLUMN_FROM){if(state.side==='panel'&&state.panel)panel=PANEL_COLUMNS;else if(state.bar)bar=BAR_COLUMNS;}
  else if(state.focus==='bar'&&state.bar){bar=columns;whole=true;}
  else if(state.focus==='panel'&&state.panel){panel=columns;whole=true;}
  /* a whole page leaves the chat laid out at full width, only hidden: nothing is measured again when it closes */
  return{bar,panel,centre:whole?columns:columns-bar-panel,whole,footerRows:state.view!=='zen'&&columns>=FOOTER_TWO_ROWS_FROM?2:1,compact:columns<FULL_ROWS_FROM};
}

/** Zen on or off: out of Zen it goes back to the view it left. */
export function nextFrameView(view:FrameView,before:FrameView):FrameView{return view==='zen'?before:'zen';}

/** The columns a view starts with: Full opens both, the others close them. */
export function viewColumns(view:FrameView):Pick<FrameState,'bar'|'panel'|'side'>{
  const open=view==='full';
  return{bar:open,panel:open,side:'bar'};
}

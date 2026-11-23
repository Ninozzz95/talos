/*
 * FE-048: the right panel (the mockup's `righeDestra`): one column of folding cards, on the `band` surface, pure rows. Only the cards with
 * data are drawn: a card with nothing behind it would be a fake feature. When the rows run out the least recent open card folds, and no
 * row is ever cut in half. A card's head is one element; its body lights up nowhere (SCHEDA, last section): only what has its own action.
 */
import {t} from '../../i18n/index.ts';
import type {UsageSnapshot} from '../../runtime/usage-snapshot.ts';
import {agentDoing,type AgentCard} from '../agents-panel.ts';
import {activityClock} from '../activity-line.ts';
import type {StyledSegment} from '../components/styled-rows.ts';
import {compactTokens,percentText} from '../status-bar.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';

/** The cards the panel can show, in order: Alt+1 and Alt+2 open them. */
export const PANEL_CARDS=['context','agents'] as const;
export type PanelCard={id:string;title:string;summary:string;rows:readonly (readonly StyledSegment[])[]};
export type PanelState={width:number;height:number;title:string;cards:readonly PanelCard[];open:ReadonlySet<string>;selected:number;focused:boolean};

const band=(text:string,...roles:string[]):StyledSegment=>({text,roles:[...roles,'band']});
const fill=(row:readonly StyledSegment[],width:number,role='band'):StyledSegment[]=>{
  const used=row.reduce((sum,segment)=>sum+displayWidth(segment.text),0);
  return[...row,{text:' '.repeat(Math.max(0,width-used)),roles:[role]}];
};
const onBand=(segment:StyledSegment):StyledSegment=>segment.roles.includes('band')?segment:{...segment,roles:[...segment.roles,'band']};

/** The cards that keep their body in `height` rows: the selected one always, the others from the first. */
export function openBodies({height,cards,open,selected}:Pick<PanelState,'height'|'cards'|'open'|'selected'>):ReadonlySet<string>{
  const bodies=new Set(cards.filter(card=>open.has(card.id)&&card.rows.length>0).map(card=>card.id));
  const used=()=>1+cards.length+cards.reduce((sum,card)=>sum+(bodies.has(card.id)?card.rows.length+1:0),0);
  for(const card of [...cards].reverse()){
    if(used()<=height)break;
    if(cards.indexOf(card)!==selected)bodies.delete(card.id);
  }
  return bodies;
}

export function sidePanelRows(state:PanelState):StyledSegment[][]{
  const {width,height}=state;const bodies=openBodies(state);
  /* owner 01/11: every column closes with a button too, the ✕ of the sheets */
  const rows:StyledSegment[][]=[[...fill([band(` ${state.title}`,'acc','b')],width-3),{text:' ✕ ',roles:['faint','band'],action:'frame:close-panel',element:'frame:close-panel'}]];
  state.cards.forEach((card,index)=>{
    const selected=state.focused&&index===state.selected;const role=selected?'hl':'band';
    const left:StyledSegment[]=[{text:selected?' › ':'   ',roles:['acc',role]},{text:bodies.has(card.id)?'▾ ':'▸ ',roles:['faint',role]},{text:card.title,roles:['b',role]}];
    const leftWidth=left.reduce((sum,segment)=>sum+displayWidth(segment.text),0);
    const summary=truncateDisplay(card.summary,Math.max(0,width-leftWidth-2));
    const head=[...left,{text:' '.repeat(Math.max(1,width-leftWidth-displayWidth(summary)-1)),roles:[role]},{text:summary,roles:['dim',role]},{text:' ',roles:[role]}];
    rows.push(head.map(segment=>({...segment,action:`card:${card.id}`,element:`card:${card.id}`})));
    if(bodies.has(card.id)){
      for(const row of card.rows)rows.push(fill([band('   '),...row.map(onBand)],width));
      rows.push(fill([],width));
    }
  });
  while(rows.length<height)rows.push(fill([],width));
  return rows.slice(0,height);
}

/** The context card (the mockup's `carta-contesto`): the bar, then how much of the window is in use. */
export function contextCard(snapshot:UsageSnapshot|null|undefined,width:number):PanelCard{
  const percent=typeof snapshot?.percent==='number'?snapshot.percent:null;
  const used=typeof snapshot?.contextTokens==='number'?snapshot.contextTokens:null,window=typeof snapshot?.windowTokens==='number'?snapshot.windowTokens:null;
  const room=Math.max(1,width-1);
  const full=percent===null?0:Math.max(0,Math.min(room,Math.round(percent/100*room)));
  const tone=percent===null?'faint':percent>=80?'err':percent>=50?'warn':'acc';
  const rows:StyledSegment[][]=[[{text:'█'.repeat(full),roles:[tone]},{text:'░'.repeat(room-full),roles:['faint']}]];
  if(used!==null&&window)rows.push([{text:truncateDisplay(t('screen.panel.contextOf',{used:compactTokens(used),window:compactTokens(window)}),room),roles:['dim']}]);
  return{id:'context',title:t('screen.panel.context'),summary:percent===null?'?':`${percentText(percent)}%`,rows};
}

/** The agents card: the live ones, each with what it is doing. */
export function agentsCard(cards:readonly AgentCard[],width:number,{now=0,glyph='⠿'}:{now?:number;glyph?:string}={}):PanelCard{
  const live=cards.filter(card=>card.state==='working'||card.state==='needs');
  const waiting=live.filter(card=>card.state==='needs').length;
  const room=Math.max(1,width-1);
  return{id:'agents',title:t('screen.panel.agents'),summary:waiting?t('screen.panel.agentsWaiting',{count:live.length,waiting}):t('screen.panel.agentsRunning',{count:live.length}),
    rows:live.slice(0,4).flatMap(card=>{
      const opens={action:`agentpage:${card.id}`,element:`agentpage:${card.id}`},doing=agentDoing(card);
      /* the row at work moves and counts, as in the bar; the seconds keep their column (the mockup's `carta-agenti`) */
      const clock=activityClock(now-card.startMs),task=truncateDisplay(`${card.state==='needs'?'?':glyph} ${card.task}`,Math.max(1,room-displayWidth(clock)-1));
      return[[{text:task+' '.repeat(Math.max(1,room-displayWidth(task)-displayWidth(clock))),roles:[card.state==='needs'?'warn':'dim'],...opens},{text:clock,roles:['faint'],...opens}],...(doing?[[{text:truncateDisplay(`  ${doing}`,room),roles:['faint'],...opens}]]:[])];
    })};
}

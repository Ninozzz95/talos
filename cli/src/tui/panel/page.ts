/*
 * B2 of MAPPA-RIDISEGNO (the mockup's `righeFoglio` on a page, `rigaSchede`, `rigaFiltri`, `righeTasti`): a section that takes the centre, under
 * the header and over the footer. It is a sheet with more room, so bodies, keys and effects stay sheet.ts's; here live what only a page
 * has: tabs and filters that slide in a window, one row of keys with the rest behind `?`, and a toast row.
 */
import {t} from '../../i18n/index.ts';
import type {StyledSegment} from '../components/styled-rows.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';
import {hintRow,renderBody,type ListBody,type Panel,type SegRow} from './sheet.ts';

const S=(text:string,roles:string,action?:string):StyledSegment=>({text,roles:roles.split(' ').filter(Boolean),...(action?{action}:{})});
const width=(row:readonly StyledSegment[])=>row.reduce((sum,segment)=>sum+displayWidth(segment.text),0);
/** From this width the list and its detail stand side by side on a page, when the terminal is at least 100 columns wide. */
const WIDE_PAGE_FROM=84,WIDE_TERMINAL_FROM=100;
export const pageWideFrom=(terminalColumns:number)=>terminalColumns>=WIDE_TERMINAL_FROM?WIDE_PAGE_FROM:Number.POSITIVE_INFINITY;

/** The voices that fit around the active one, with `‹ ›` where more are hidden (the mockup's `aFinestra`). */
export function slidingRow(voices:readonly (readonly StyledSegment[])[],active:number,w:number):SegRow{
  const total=voices.reduce((sum,voice)=>sum+width(voice),0);
  if(total+1<=w)return[S(' ',''),...voices.flat()];
  const limit=w-5;let from=Math.max(0,active),used=width(voices[from]??[]);
  while(from>0&&used+width(voices[from-1]!)<=limit){from-=1;used+=width(voices[from]!);}
  let to=from===active?active+1:Math.max(active+1,from+1);
  while(to<voices.length&&used+width(voices[to]!)<=limit){used+=width(voices[to]!);to+=1;}
  return[S(from>0?'‹ ':'  ','acc'),...voices.slice(from,to).flat(),S(to<voices.length?' ›':'','acc')];
}

export function tabsRow(panel:Panel,w:number):SegRow{
  return slidingRow(panel.tabs.map((tab,index)=>[S(` ${tab.name} `,index===panel.tab?'inv':'dim',`ptab:${index}`),S(' ','')]),panel.tab,w);
}

/** The filters of a list: the chosen one in the accent on the band, `[` and `]` change it. */
export function filtersRow(body:ListBody,w:number):SegRow{
  const filters=body.filters??[];
  return slidingRow(filters.map((filter,index)=>[S(` ${filter.name} `,index===(body.filterAt??0)?'acc b band':'dim',`pfilter:${index}`),S(' ','')]),body.filterAt??0,w);
}

/** One row of keys: what does not fit stands behind `?`, and Esc always stays. `?` opens the second row. */
export function pageKeyRows(panel:Panel,w:number):SegRow[]{
  const row=hintRow(panel);
  if(width(row)<=w)return[row];
  const pairs:SegRow[]=[];for(let index=1;index<row.length;index+=2)pairs.push(row.slice(index,index+2));
  if(panel.moreKeys){
    const first:SegRow=[S(' ','')],second:SegRow=[S(' ','')];let target=first;
    for(const pair of pairs){if(target===first&&first.length>1&&width([...first,...pair])>w)target=second;target.push(...pair);}
    return[first,second];
  }
  const last=pairs.at(-1)??[];const more:SegRow=[S('?','acc','pkey:?'),S(` ${t('panel.page.more')}   `,'faint','pkey:?')];
  /* tester N6: Tab changes what the page shows, so like Esc it never stands behind `?` */
  const tab=pairs.slice(0,-1).find(pair=>pair[0]?.text==='tab')??[];
  const out:SegRow=[S(' ','')];
  for(const pair of pairs.slice(0,-1)){if(pair===tab)continue;if(width([...out,...pair,...more,...tab,...last])>w)break;out.push(...pair);}
  return[[...out,...more,...tab,...last]];
}

/** The commands that are pages (owner 01/11): the quick ones, /effort, /plan, /rename, /clear, /copy, /export, /undo, /queue, /busy and /retry, stay cards. */
export const COMMAND_PAGES:ReadonlySet<string>=new Set(['home','shelf','usage','context','board','capability','automations','forge','research','projects','doctor','devices','processes','help','diff','memory','notes','tasks','library','model','provider','resume','fork','history','settings','permissions']);

/** A sheet as a page: its files start at the top, and it says when one goes on below. */
export function asPage<T extends {panel:Panel}>(sheet:T):T{
  return{...sheet,panel:{...sheet.panel,page:true,tabs:sheet.panel.tabs.map(tab=>tab.body.kind==='diff'?{...tab,body:{...tab.body,off:0}}:tab)}};
}

export function pageRows(panel:Panel,w:number,H:number,{now=0,toast=null,note=null,noteTone=null,terminalColumns=w}:{now?:number;toast?:string|null;/* what the chat behind was told */note?:string|null;/* the mockup's warning notice (index.html:509, 2532): its mark in the theme warning */noteTone?:'warn'|null;terminalColumns?:number}={}):SegRow[]{
  const body=panel.tabs[panel.tab]!.body;const rows:SegRow[]=[];
  const title=` ${panel.title} `,line=panel.tabs[panel.tab]?.sub??panel.sub,sub=line?truncateDisplay(`${line} `,Math.max(0,w-8-displayWidth(title))):'';
  rows.push([S('──','acc'),S(title,'acc b'),S(sub,'dim'),S('─'.repeat(Math.max(0,w-4-displayWidth(title)-displayWidth(sub))),'acc'),S(' ✕','faint','pkey:Escape')]);
  if(panel.tabs.length>1)rows.push(tabsRow(panel,w));
  rows.push(...panel.head?.(w)??[]);
  const keys=pageKeyRows(panel,w);
  const room=Math.max(1,H-rows.length-1-keys.length);
  const drawn=renderBody(body,w,room,now,pageWideFrom(terminalColumns));
  /* a body taller than the page scrolls, and says what is left: never text that vanishes with no sign (the mockup's `conScorrimento`) */
  const off=body.kind==='info'?Math.max(0,Math.min(body.off??0,drawn.length-room+1)):0;
  const shown=body.kind==='info'&&drawn.length>room?[...drawn.slice(off,off+room-1),[S(`   ${off>0?`${t('panel.page.moreAbove',{count:off})}  `:''}${off+room-1<drawn.length?t('panel.page.moreBelow',{count:drawn.length-off-room+1}):''}`,'faint')]]:drawn;
  for(let index=0;index<room;index+=1)rows.push(shown[index]??[S('','')]);
  const edit=panel.edit;
  rows.push(edit?[S(` ${edit.label} `,'acc b'),S(`${edit.mask?'•'.repeat(displayWidth(edit.value)):edit.value}▍`,'code')]:toast?[S(' ✓ ','ok'),S(truncateDisplay(toast,Math.max(0,w-4)),'dim')]:note?[S(' · ',noteTone??'faint'),S(truncateDisplay(note,Math.max(0,w-4)),'dim')]:[S('','')]);
  rows.push(...keys);
  return rows.slice(0,H);
}

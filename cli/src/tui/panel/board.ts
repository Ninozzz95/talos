/*
 * C6b of the redesign: the Board (the mockup's `bacheca`, the PC's words): what is running, how it went. The table comes first; the lanes are its
 * second view, four as the owner decided: In progress, Waiting for you, To resume (with how many of them were interrupted), Concluded. Under 84
 * columns the lanes are a list by groups, one card to a row. No «3 of 7 steps»: that figure does not exist. The columns are those with true data.
 * Pure: rows of sessions in, rows of cells out; a whole card is one element, for the hover and the click (owner 01/11).
 */
import {compactTokens} from '../status-bar.ts';
import {t,tn} from '../../i18n/index.ts';
import {sessionMark,sessionStateWord,SESSION_FILTERS,type SessionState} from '../session-state.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';
import {fit,S,type Seg,type SegRow} from './sheet.ts';

export type BoardRow={id:string;title:string;state:SessionState;model:string|null;tokens:number|null;when:string};
export const BOARD_LANES_FROM=84;
const LANE_STATES:ReadonlyArray<readonly SessionState[]>=[['progress'],['waiting'],['toResume','interrupted'],['concluded']];
const LANE_WORDS:readonly SessionState[]=['progress','waiting','toResume','concluded'];
const pad=(text:string,size:number)=>text+' '.repeat(Math.max(0,size-displayWidth(text)));
const cut=(text:string,size:number)=>truncateDisplay(text,Math.max(1,size));
const modelOf=(model:string|null)=>{if(!model)return'';const at=model.indexOf(':');return at>0?model.slice(at+1):model;};

/** The filters of both views, with the rows they hold; an index past the end means every row. */
export const boardMatches=(rows:readonly BoardRow[],filter:number)=>filter===0?rows:rows.filter(row=>row.state===SESSION_FILTERS[filter-1]);
export function boardFilterRow(rows:readonly BoardRow[],filter:number,width:number):SegRow{
  const names=[`${t('panel.board.all')} ${rows.length}`,...SESSION_FILTERS.map(state=>`${t(sessionStateWord(state))} ${rows.filter(row=>row.state===state).length}`)];
  return fit([S(' '),...names.flatMap((name,i)=>[S(` ${name} `,i===filter?'inv':'dim',`bfilter:${i}`),S(' ')])],width);
}

/** The table's columns: as wide as there is room for; State and the session never go. */
function tableColumns(width:number){
  const model=width>=64?14:0,tokens=width>=52?7:0,when=width>=84?12:0,state=16;
  return{state,model,tokens,when,title:Math.max(16,width-4-state-(model?model+1:0)-(tokens?tokens+1:0)-(when?when+1:0))};
}
export function boardTableRows(rows:readonly BoardRow[],{width,selected,glyph,unicode=true}:{width:number;selected:number;glyph?:string;unicode?:boolean}):SegRow[]{
  const c=tableColumns(width);
  const head=[pad(t('panel.board.session'),c.title),' ',pad(t('panel.board.state'),c.state),...(c.model?[' ',pad(t('panel.board.model'),c.model)]:[]),...(c.tokens?[' ',t('panel.board.tokens').padStart(c.tokens)]:[]),...(c.when?[' ',pad(t('panel.board.started'),c.when)]:[])].join('');
  const out:SegRow[]=[[S(` ${head}`,'faint')],[S(` ${'─'.repeat(Math.max(0,width-2))}`,'faint')]];
  if(!rows.length)out.push([S(`  ${t('panel.board.empty')}`,'dim')]);
  rows.forEach((row,index)=>{
    const [mark,role]=sessionMark(row.state,{...(glyph?{glyph}:{}),unicode}),mine=index===selected,action=`bcard:${index}`;
    const seg=(text:string,roles:string|readonly string[]=''):Seg=>({...S(text,mine?['b']:roles,action),element:action});
    out.push(fit([S(mine?'›':' ','acc'),seg(pad(cut(row.title,c.title),c.title)),S(' '),seg(`${mark} `,role),seg(pad(cut(t(sessionStateWord(row.state)),c.state-2),c.state-2),role),
      ...(c.model?[S(' '),seg(pad(cut(modelOf(row.model),c.model),c.model),'dim')]:[]),...(c.tokens?[S(' '),seg((row.tokens===null?'':compactTokens(row.tokens)).padStart(c.tokens),'dim')]:[]),...(c.when?[S(' '),seg(pad(cut(row.when,c.when),c.when),'faint')]:[])],width));
  });
  return out;
}

/** The chosen card, as a column and a place in it; both follow the arrows and stay inside what is there. */
export type BoardPick={lane:number;card:number};
const inLane=(rows:readonly BoardRow[],lane:number)=>rows.filter(row=>LANE_STATES[lane]!.includes(row.state));
export function boardCardAt(rows:readonly BoardRow[],pick:BoardPick):BoardRow|null{const list=inLane(rows,pick.lane);return list[Math.min(pick.card,list.length-1)]??null;}
/**
 * review 01/11 (MEDIO 7): the Board is read again at the end of a turn; the chosen conversation stays chosen by its id, in the table and in
 * its lane, so Enter never resumes the one that slid into its place. A conversation that left the filter keeps the old place.
 */
export function boardKeep(before:readonly BoardRow[],after:readonly BoardRow[],{filter=0,pick={lane:0,card:0},table=0}:{filter?:number;pick?:BoardPick;table?:number}):{pick:BoardPick;table:number}{
  const tableId=boardMatches(before,filter)[table]?.id,cardId=boardCardAt(boardMatches(before,filter),pick)?.id;
  const nowTable=boardMatches(after,filter).findIndex(row=>row.id===tableId);
  const lanes=LANE_STATES.map((_,lane)=>inLane(boardMatches(after,filter),lane));
  const lane=lanes.findIndex(list=>list.some(row=>row.id===cardId));
  return{table:nowTable>=0?nowTable:table,pick:lane>=0?{lane,card:lanes[lane]!.findIndex(row=>row.id===cardId)}:pick};
}
export function boardMove(rows:readonly BoardRow[],pick:BoardPick,key:string):BoardPick{
  const count=inLane(rows,pick.lane).length;
  if(key==='ArrowUp')return{...pick,card:Math.max(0,Math.min(pick.card,count-1)-1)};
  if(key==='ArrowDown')return{...pick,card:Math.min(Math.max(0,count-1),pick.card+1)};
  if(key==='ArrowLeft')return{lane:Math.max(0,pick.lane-1),card:0};
  if(key==='ArrowRight')return{lane:Math.min(LANE_STATES.length-1,pick.lane+1),card:0};
  return pick;
}
const laneHead=(rows:readonly BoardRow[],lane:number):SegRow=>{
  const interrupted=lane===2?rows.filter(row=>row.state==='interrupted').length:0;
  return[S(` ${t(sessionStateWord(LANE_WORDS[lane]!))} `,'b'),S(String(inLane(rows,lane).length),'faint'),S(interrupted?` · ${tn('panel.board.interrupted',interrupted)}`:'','faint')];
};

function laneCard(row:BoardRow,chosen:boolean,width:number,action:string,{glyph,unicode}:{glyph?:string;unicode:boolean}):SegRow[]{
  const [mark,role]=sessionMark(row.state,{...(glyph?{glyph}:{}),unicode}),band=chosen?'hl':'band';
  const roles=(...more:string[])=>[...more,band];
  const line=(segments:readonly Seg[]):SegRow=>fit(segments,width,band).map(segment=>({...segment,action,element:action}));
  return[line([S(` ${cut(row.title,width-2)}`,roles('b'))]),line([S(` ${mark} `,roles(role)),S(cut(t(sessionStateWord(row.state)),width-4),roles(role))]),line([S(` ${cut([modelOf(row.model),row.when].filter(Boolean).join(' · '),width-2)}`,roles('faint'))])];
}

export function boardLaneRows(rows:readonly BoardRow[],{width,height,pick,glyph,unicode=true,columns=width}:{width:number;height:number;pick:BoardPick;glyph?:string;unicode?:boolean;/* the terminal's own */columns?:number}):SegRow[]{
  const look={...(glyph?{glyph}:{}),unicode};
  if(width<BOARD_LANES_FROM||columns<100){
    const out:SegRow[]=[];
    LANE_STATES.forEach((_,lane)=>{
      const list=inLane(rows,lane);if(!list.length)return;
      out.push(laneHead(rows,lane));
      list.forEach((row,card)=>{const [mark,role]=sessionMark(row.state,look),mine=pick.lane===lane&&Math.min(pick.card,list.length-1)===card,action=`blane:${lane}:${card}`;
        out.push(fit([S(mine?' › ':'   ','acc'),{...S(`${mark} `,role,action),element:action},{...S(cut(row.title,width-16),mine?'b':'',action),element:action}],width));});
    });
    return out.length?out:[[S(`  ${t('panel.board.empty')}`,'dim')]];
  }
  const laneWidth=Math.floor((width-(LANE_STATES.length-1))/LANE_STATES.length);
  const lanes=LANE_STATES.map((_,lane):SegRow[]=>{
    const list=inLane(rows,lane),out:SegRow[]=[laneHead(rows,lane),[S('─'.repeat(laneWidth),'faint')]];
    const first=pick.lane===lane?Math.max(0,Math.min(pick.card,list.length-1)-1):0;
    list.slice(first).forEach((row,index)=>{out.push(...laneCard(row,pick.lane===lane&&first+index===Math.min(pick.card,list.length-1),laneWidth,`blane:${lane}:${first+index}`,look),[S('')]);});
    if(!list.length)out.push([S(` ${t('panel.board.nothingHere')}`,'faint')]);
    return out.length>height?[...out.slice(0,height-1),[S(` ${t('panel.board.more')}`,'faint')]]:out;
  });
  return Array.from({length:Math.max(...lanes.map(lane=>lane.length))},(_,y)=>lanes.flatMap((lane,x)=>[...fit(lane[y]??[S('')],laneWidth),...(x<lanes.length-1?[S(' ')]:[])]));
}

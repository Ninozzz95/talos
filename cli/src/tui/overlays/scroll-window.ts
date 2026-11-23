import {displayWidth,splitGraphemes} from '../text-width.ts';
import type {HitRegister} from '../components/styled-rows.ts';

/*
 * R1 lane O — ONE FIT FOR EVERY OVERLAY (owner decision Q-R1-3, gate E1/E3/E4).
 *
 * An overlay or menu gets at most `maxRows` rows (lane L computes frame − composer − 1 status row) and scrolls inside
 * them; when the budget is below 6 lane L hands it the whole frame, and this file still only renders within what it
 * receives. Review D-02 measured the failure this replaces: `? help` at 100×30 was 125 rows tall and printed its last
 * lines over its own border and the composer.
 *
 * Heights are EXACT, never estimated (E4): every line is wrapped here with the TUI's `displayWidth`, and each wrapped
 * row is its own `Text` with `wrap:'truncate-end'`, so Ink can shorten a row but never add one. The number of rows on
 * screen is the number of rows this file returns — the Pi pattern, whose renderer throws on a line wider than the
 * screen (gate §1, `pi-tui/tui.ts:1175-1183`, 2026-09-03). Where `displayWidth` reads a grapheme narrower than Ink's
 * `string-width` (text-width.ts, lane L, E4), Ink cuts the end of that row: the row count is unchanged.
 *
 * What does not fit scrolls, and says so: a list keeps its selected item in the window (centred when it can be, the
 * `pickerWindow` convention) and a text body scrolls by an offset; either way one row reads "↑ N more · ↓ M more"
 * (Pi `maxHeight` + its "(3/20)" count; Claude Code 2.1.281 scrollbars on long lists — gate §1, B2).
 */

export type OverlayTone='title'|'accent'|'plain'|'dim'|'strong'|'selected';
/* R5a (owner 2026-09-25, /effort's slider): `accentTo` draws the line's first N columns in the accent, the rest in its tone. */
/* R5b D4: `accentColor` draws those columns in a colour of the line's own (the /theme swatches) instead of the accent. */
/* Stage 6c: `action` is the mockup's `data-a` — a click on any row the line wraps to runs it (hit-map.ts) */
/* `hang`: the cells a wrapped line's continuation rows start under (a picker row's text after its «› » marker). */
export type OverlayLine={text:string;tone?:OverlayTone|undefined;accentTo?:number|undefined;accentColor?:string|undefined;action?:string|undefined;hang?:number|undefined};
/** A scrollable region. `selected` (a line index) keeps that line in the window; otherwise `offset` is the first line shown. */
export type OverlaySection={lines:readonly OverlayLine[];selected?:number|undefined;offset?:number|undefined};
export type OverlayContent={head?:readonly OverlayLine[]|undefined;sections:readonly OverlaySection[];foot?:readonly OverlayLine[]|undefined;borderStyle?:'round'|'single'|undefined};
export type OverlayRow={text:string;tone:OverlayTone;role:'head'|'body'|'more'|'foot';selected:boolean;accentTo?:number;accentColor?:string;action?:string};
export type SectionView={start:number;end:number;above:number;below:number;maxOffset:number};
export type FittedOverlay={border:boolean;borderStyle:'round'|'single';rows:OverlayRow[];sections:SectionView[];cut:boolean;dropped:number};

const BORDER_ROWS=2,BORDER_COLUMNS=2;
// Below this a border costs more than it shows: 4 rows keep top, bottom and two rows of content.
const MIN_BORDERED_ROWS=4;

/** Lossless word wrap by display width: the rows join back to the text; a word longer than a row is broken inside it. */
export function wrapDisplay(text:string,width:number):string[]{
  const limit=Math.max(1,Math.floor(width));const rows:string[]=[];
  let row='',used=0;
  const push=()=>{rows.push(row);row='';used=0;};
  const breakInside=(token:string)=>{for(const grapheme of splitGraphemes(token)){const cells=displayWidth(grapheme);if(row!==''&&used+cells>limit)push();row+=grapheme;used+=cells;}};
  for(const token of text.split(/( +)/u)){
    if(token==='')continue;
    const cells=displayWidth(token);
    if(used+cells<=limit){row+=token;used+=cells;continue;}
    if(token.startsWith(' ')||cells>limit){breakInside(token);continue;}
    if(row!=='')push();
    row=token;used=cells;
  }
  if(row!==''||!rows.length)rows.push(row);
  return rows;
}
/** A line may carry its own line breaks (help text, previews): each is wrapped on its own. */
function wrapLine(text:string,width:number,hang=0):string[]{return String(text).split(/\r?\n/u).flatMap(part=>hangRows(wrapDisplay(part,width),width,hang));}
/* R14 (03/11/2026, 80×24): a picker row too long for the box went on at column 1, under the «›» marker («│revoke one»). Its
   continuation now starts under the text, like a list item's. Hermes keeps one row per command and cuts the rest (prompt_toolkit
   layout/menus.py `_trim_formatted_text`); TALOS keeps every word, so it lines them up instead. A box too narrow keeps the plain wrap. */
function hangRows(rows:string[],width:number,hang:number):string[]{
  const indent=Math.max(0,Math.floor(hang));
  if(rows.length<2||indent<1||width-indent<8)return rows;
  const rest=rows.slice(1).join('').replace(/^ +/u,'');
  return[rows[0]!,...wrapDisplay(rest,width-indent).map(row=>' '.repeat(indent)+row)];
}

export function moreIndicator(above:number,below:number):string{
  return [above>0?`↑ ${above} more`:'',below>0?`↓ ${below} more`:''].filter(Boolean).join(' · ');
}

/*
 * The window over items of known heights. `budget` counts every row, the marker included: when anything is cut one
 * row is the "↑/↓ N more" marker (if the budget has room for it next to the selected item). `clip` is set only when the
 * one item in the window is taller than the window by itself.
 */
export function sliceByHeights(heights:readonly number[],{budget,selected,offset}:{budget:number;selected?:number|undefined;offset?:number|undefined}):SectionView&{clip:number|null}{
  const count=heights.length,total=heights.reduce((sum,value)=>sum+value,0),rows=Math.max(0,Math.floor(budget));
  if(total<=rows)return{start:0,end:count,above:0,below:0,maxOffset:0,clip:null};
  const room=rows>=2?rows-1:rows;
  // The last start whose tail fits the window: scrolling past it would only show blank rows.
  let maxOffset=count,used=0;
  for(let index=count-1;index>=0;index--){if(used+heights[index]!>room)break;used+=heights[index]!;maxOffset=index;}
  if(maxOffset===count)maxOffset=Math.max(0,count-1);
  let start:number,end:number;
  if(selected!==undefined&&count>0){
    const anchor=Math.max(0,Math.min(count-1,Math.trunc(selected)||0));
    start=anchor;end=anchor+1;used=heights[anchor]!;
    // Alternate above/below, above first: uniform rows give `pickerWindow`'s floor(size/2) rows above the selection.
    let turn:'above'|'below'='above',blocked={above:false,below:false};
    while(!(blocked.above&&blocked.below)){
      const side:'above'|'below'=blocked[turn]?(turn==='above'?'below':'above'):turn;
      const index=side==='above'?start-1:end;
      if(index<0||index>=count||used+heights[index]!>room)blocked[side]=true;
      else{used+=heights[index]!;if(side==='above')start=index;else end=index+1;}
      turn=turn==='above'?'below':'above';
    }
  }else{
    start=Math.max(0,Math.min(maxOffset,Math.trunc(offset??0)||0));end=start;used=0;
    while(end<count&&used+heights[end]!<=room){used+=heights[end]!;end++;}
    if(end===start&&count>0)end=start+1;
  }
  const clip=end-start===1&&heights[start]!>room?room:null;
  return{start,end,above:start,below:count-end,maxOffset,clip};
}

/*
 * Chrome that does not fit is dropped in a fixed order and counted in `dropped`: the title (head[0]) is the last to
 * go after the first foot line (the key hints), and the other lines go before either. Sections share what is left:
 * each gets what it needs if the sum fits; otherwise a selected section is served first, then the rest is shared.
 */
export function fitOverlay(content:OverlayContent,{maxRows,columns}:{maxRows?:number|undefined;columns:number}):FittedOverlay{
  const limit=maxRows===undefined||!Number.isFinite(maxRows)?Number.POSITIVE_INFINITY:Math.max(0,Math.floor(maxRows));
  const border=limit>=MIN_BORDERED_ROWS;
  const inner=Math.max(1,Math.floor(columns)-(border?BORDER_COLUMNS:0));
  const available=Math.max(0,limit-(border?BORDER_ROWS:0));
  const head=(content.head??[]).map(line=>wrapLine(line.text,inner));
  const foot=(content.foot??[]).map(line=>wrapLine(line.text,inner));
  const sections=content.sections.map(section=>section.lines.map(line=>wrapLine(line.text,inner,line.hang)));
  const need=sections.map(blocks=>blocks.reduce((sum,rows)=>sum+rows.length,0));
  const chromeRows=[...head,...foot].reduce((sum,rows)=>sum+rows.length,0);
  const bodyNeed=need.reduce((sum,value)=>sum+value,0);
  let keepHead=head.map(rows=>rows.length),keepFoot=foot.map(rows=>rows.length),dropped=0;
  if(chromeRows+bodyNeed>available){
    // Every section keeps at least one row plus its marker (or less, if it needs less).
    const reserve=need.reduce((sum,value)=>sum+Math.min(value,2),0);
    let left=Math.max(0,available-reserve);
    keepHead=head.map(()=>0);keepFoot=foot.map(()=>0);
    const order:Array<['head'|'foot',number]>=[...(head.length?[['head',0] as ['head',number]]:[]),...foot.map((_,index)=>['foot',index] as ['foot',number]),...head.slice(1).map((_,index)=>['head',index+1] as ['head',number])];
    for(const [where,index] of order){
      const rows=(where==='head'?head:foot)[index]!.length,take=Math.min(rows,left);
      if(where==='head')keepHead[index]=take;else keepFoot[index]=take;
      left-=take;
    }
    dropped=[...head,...foot].reduce((sum,rows)=>sum+rows.length,0)-[...keepHead,...keepFoot].reduce((sum,value)=>sum+value,0);
  }
  let bodyLeft=Math.max(0,available-[...keepHead,...keepFoot].reduce((sum,value)=>sum+value,0));
  const budgets=need.map(()=>0);
  if(need.reduce((sum,value)=>sum+value,0)<=bodyLeft)need.forEach((value,index)=>{budgets[index]=value;});
  else{
    const order=need.map((_,index)=>index).sort((a,b)=>Number(content.sections[b]!.selected!==undefined)-Number(content.sections[a]!.selected!==undefined));
    for(const index of order){const take=Math.min(need[index]!,2,bodyLeft);budgets[index]=take;bodyLeft-=take;}
    for(let active=order.filter(index=>budgets[index]!<need[index]!);active.length&&bodyLeft>0;active=active.filter(index=>budgets[index]!<need[index]!)){
      const share=Math.max(1,Math.floor(bodyLeft/active.length));
      for(const index of active){const take=Math.min(need[index]!-budgets[index]!,share,bodyLeft);budgets[index]=budgets[index]!+take;bodyLeft-=take;}
    }
  }
  const rows:OverlayRow[]=[];const views:SectionView[]=[];let cut=false;
  const chrome=(lines:readonly OverlayLine[],wrapped:string[][],keep:number[],role:'head'|'foot')=>wrapped.forEach((pieces,index)=>{
    for(const text of pieces.slice(0,keep[index]))rows.push({text,tone:lines[index]!.tone??(role==='head'&&index===0?'title':'dim'),role,selected:false});
  });
  chrome(content.head??[],head,keepHead,'head');
  sections.forEach((blocks,index)=>{
    const section=content.sections[index]!,budget=budgets[index]!;
    if(budget<=0){views.push({start:0,end:0,above:0,below:blocks.length,maxOffset:0});if(blocks.length)cut=true;return;}
    const view=sliceByHeights(blocks.map(pieces=>pieces.length),{budget,selected:section.selected,offset:section.offset});
    views.push({start:view.start,end:view.end,above:view.above,below:view.below,maxOffset:view.maxOffset});
    let used=0;
    for(let line=view.start;line<view.end;line++){
      const pieces=view.clip!==null?blocks[line]!.slice(0,view.clip):blocks[line]!;
      const selected=section.selected!==undefined&&line===Math.max(0,Math.min(blocks.length-1,Math.trunc(section.selected)||0));
      const {accentTo,accentColor,action}=section.lines[line]!;
      pieces.forEach((text,piece)=>rows.push({text,tone:section.lines[line]!.tone??'plain',role:'body',selected,...(action?{action}:{}),...(piece===0&&typeof accentTo==='number'&&accentTo>0?{accentTo,...(accentColor?{accentColor}:{})}:{})}));
      used+=pieces.length;
    }
    if(view.above||view.below||view.clip!==null){
      cut=true;
      if(used<budget)rows.push({text:moreIndicator(view.above,view.below)||`↓ ${blocks[view.start]!.length-(view.clip??0)} more`,tone:'dim',role:'more',selected:false});
    }
  });
  chrome(content.foot??[],foot,keepFoot,'foot');
  return{border,borderStyle:content.borderStyle??'round',rows,sections:views,cut,dropped};
}

function toneStyle(tone:OverlayTone,accentColor:string|undefined):Record<string,unknown>{
  if(tone==='title')return{bold:true,color:accentColor};
  if(tone==='accent')return{color:accentColor};
  if(tone==='selected')return{inverse:true,color:accentColor};
  if(tone==='strong')return{bold:true};
  if(tone==='dim')return{dimColor:true};
  return{};
}

/** The fitted overlay as Ink elements: one `Text` per row, cut rather than wrapped by Ink, so its height is exact. */
export function renderFittedOverlay(h:(...args:any[])=>unknown,Ink:{Box:unknown;Text:unknown},fitted:FittedOverlay,{accentColor,hit,hitKey='overlay'}:{accentColor?:string|undefined;hit?:HitRegister|undefined;hitKey?:string|undefined}={}):unknown{
  /* stage 6c: a panel with targets says where it was laid out; its rows start inside the border (one row down, one cell in) */
  const targets=hit&&fitted.rows.some(row=>row.action)?{ref:(node:unknown)=>hit(hitKey,node,[...(fitted.border?[[]]:[]),...fitted.rows.map(row=>[...(fitted.border?[{text:' ',roles:[]}]:[]),{text:row.text,roles:[],...(row.action?{action:row.action}:{})}])])}:{};
  // `flexShrink:0`: inside lane L's fixed-height root a shrinking box is exactly how a border ends up under content.
  const box={...(fitted.border?{borderStyle:fitted.borderStyle,flexDirection:'column',flexShrink:0}:{flexDirection:'column',flexShrink:0}),...targets};
  return h(Ink.Box,box,...fitted.rows.map((row,index)=>typeof row.accentTo==='number'&&row.accentTo>0&&row.text
    ?h(Ink.Text,{key:index,wrap:'truncate-end'},h(Ink.Text,toneStyle('accent',row.accentColor??accentColor),row.text.slice(0,row.accentTo)),h(Ink.Text,toneStyle(row.tone,accentColor),row.text.slice(row.accentTo)))
    :h(Ink.Text,{key:index,wrap:'truncate-end',...toneStyle(row.tone,accentColor)},row.text||' ')));
}

/** `maxRows` absent: the whole overlay, as tall as its wrapped content (today's behaviour until lane L passes the budget). */
export function renderOverlay(h:(...args:any[])=>unknown,Ink:{Box:unknown;Text:unknown},content:OverlayContent,{maxRows,columns,accentColor}:{maxRows?:number|undefined;columns:number;accentColor?:string|undefined}):unknown{
  return renderFittedOverlay(h,Ink,fitOverlay(content,{maxRows,columns}),{accentColor});
}

/** Splits an overlay's own line list into chrome and one selectable list (+ an optional detail section after it). */
export function listOverlay(lines:readonly string[],{head,list,selected,foot,tones}:{head:number;list:number;selected:number;foot:number;tones?:((line:string,index:number)=>OverlayTone|undefined)|undefined}):OverlayContent{
  const toned=lines.map((text,index)=>({text,tone:tones?.(text,index)}));
  const headLines=toned.slice(0,head),listLines=toned.slice(head,head+list);
  const footLines=foot?toned.slice(Math.max(head+list,toned.length-foot)):[];
  const detail=toned.slice(head+list,toned.length-footLines.length);
  const sections:OverlaySection[]=[];
  if(listLines.length)sections.push({lines:listLines,selected:Math.max(0,Math.min(listLines.length-1,selected))});
  if(detail.length)sections.push({lines:detail,offset:0});
  return{head:headLines,sections,foot:footLines};
}

/** The control centers' look: the title in the accent colour, every other line dim (as app.ts draws them today). */
export const centerTones=(_line:string,index:number):OverlayTone=>index===0?'accent':'dim';
/** A picker's rows as app.ts draws them: `›` and inverse on the selected row, the accent colour on the others. */
/* stage 6c: `action` names what a click on a row does (the command menu's `slash:/name`, a picker's `pick:i`) */
export function pickerSection<T>(rows:readonly T[],selected:number,label:(row:T)=>string,action?:(row:T,index:number)=>string):OverlaySection{
  return{lines:rows.map((row,index)=>({text:`${index===selected?'›':' '} ${label(row)}`,hang:2,tone:index===selected?'selected':'accent',...(action?{action:action(row,index)}:{})})),selected};
}

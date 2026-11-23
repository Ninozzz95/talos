import {t,tn} from '../../i18n/index.ts';
import {displayWidth,truncateDisplay,wrapDisplay,wrapReadable} from '../text-width.ts';
import {toolRowView} from './tool-row.ts';
import {ANSWER_INDENT,TURN_INDENT,promptRows} from './conversation-rows.ts';
import {transcriptItemRaw,type TranscriptItem} from '../transcript-model.ts';
import {parseMarkdownBlocks,markdownBlockLines,markdownBlockWidth} from './markdown.ts';
import {agentResultLines} from './agent-result.ts';
import {answersRows} from './question-receipt.ts';
import {planReceiptRows} from './plan-receipt.ts';
import {dialogueRows} from './agent-dialogue.ts';

export type TranscriptMeasurementSnapshot={version:number};
export type TranscriptMeasurementStore={
  getSnapshot:()=>TranscriptMeasurementSnapshot;
  subscribe:(listener:()=>void)=>(()=>void);
  height:(key:string)=>(number|null);
  measure:(key:string,height:number)=>boolean;
};

const MAX_TRANSCRIPT_MEASUREMENTS=4096;

export function transcriptMeasurementKey(itemId:string,width:number,variant:string):string{
  const normalizedWidth=Math.max(1,Math.floor(Number.isFinite(width)?width:1));
  return JSON.stringify([String(itemId),normalizedWidth,String(variant)]);
}

export function createTranscriptMeasurementStore():TranscriptMeasurementStore{
  let snapshot:TranscriptMeasurementSnapshot={version:0};
  const heights=new Map<string,number>();
  const listeners=new Set<()=>void>();
  const publish=()=>{snapshot={version:snapshot.version+1};for(const listener of [...listeners])listener();};
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    height(key){return heights.get(String(key))??null;},
    measure(key,height){
      const id=String(key);
      if(!id||!Number.isFinite(height)||height<=0)return false;
      const normalized=Math.max(1,Math.ceil(height));
      if(heights.get(id)===normalized)return false;
      if(!heights.has(id)&&heights.size>=MAX_TRANSCRIPT_MEASUREMENTS){
        const oldest=heights.keys().next().value;
        if(typeof oldest==='string')heights.delete(oldest);
      }
      heights.set(id,normalized);
      publish();
      return true;
    },
  };
}

export type TranscriptVirtualWindow<T>={
  start:number;
  end:number;
  rows:T[];
  estimatedRows:number;
};

export function planTranscriptVirtualWindow<T>(input:{
  items:readonly T[];
  offset:number;
  rowBudget:number;
  heightOf:(item:T,index:number)=>number;
  revealIndex?:number;
  legacyPageSize?:number;
  /* R1 (Q-R1-2): when given, the window is ROW-based (see planTranscriptRows); `offset` and `legacyPageSize` are
     ignored, and a reveal scrolls the target into the view instead of widening a window the region would clip. */
  scrollRows?:number;
}):TranscriptVirtualWindow<T>&Partial<TranscriptRowWindow<T>>{
  if(input.scrollRows!==undefined){
    const rows=planTranscriptRows({items:input.items,rowBudget:input.rowBudget,scrollRows:input.scrollRows,heightOf:input.heightOf,...(input.revealIndex!==undefined?{revealIndex:input.revealIndex}:{})});
    return{...rows,estimatedRows:rows.totalRows};
  }
  const {items,heightOf}=input;
  const offset=Number.isFinite(input.offset)?Math.max(0,Math.floor(input.offset)):0;
  const end=Math.max(0,Math.min(items.length,items.length-offset));
  if(end===0)return{start:0,end:0,rows:[],estimatedRows:0};
  const budget=Number.isFinite(input.rowBudget)?Math.max(1,Math.floor(input.rowBudget)):1;
  let start=end;
  let used=0;
  while(start>0){
    const index=start-1;
    const raw=Number(heightOf(items[index]!,index));
    const height=Number.isFinite(raw)&&raw>0?Math.max(1,Math.ceil(raw)):1;
    if(start<end&&used+height>budget)break;
    start=index;
    used+=height;
    if(used>=budget)break;
  }

  const revealIndex=Number.isFinite(input.revealIndex)?Math.floor(input.revealIndex!):-1;
  const legacyPageSize=Number.isFinite(input.legacyPageSize)?Math.max(1,Math.floor(input.legacyPageSize!)):0;
  if(revealIndex>=0&&revealIndex<start&&revealIndex<end&&legacyPageSize>0){
    const legacyStart=Math.max(0,end-legacyPageSize);
    if(revealIndex>=legacyStart){
      let legacyRows=0;
      for(let index=legacyStart;index<end;index++){
        const raw=Number(heightOf(items[index]!,index));
        legacyRows+=Number.isFinite(raw)&&raw>0?Math.max(1,Math.ceil(raw)):1;
      }
      return{start:legacyStart,end,rows:items.slice(legacyStart,end),estimatedRows:legacyRows};
    }
  }
  return{start,end,rows:items.slice(start,end),estimatedRows:used};
}

/* R1 gate E4: the rows a text takes at `width`, counted with the width function Ink lays out with (text-width.ts). It
   replaces the old `ceil(width / (0.75 × columns))` estimate, which under-counted prose and let the planner walk back
   into rows that did not exist (review D-04). Only items never mounted use it: a mounted item reports its measured
   height (`useBoxMetrics`), and a measurement always wins. */
export function textRows(text:string,width:number):number{return Math.max(1,wrapDisplay(String(text),Math.max(1,Math.floor(width))).length);}

export type TranscriptRowWindow<T>={
  start:number;end:number;rows:T[];
  /* Rows of the last mounted item that lie below the view (scrolled up inside a tall item). */
  clipBelow:number;
  /* Every item above the first mounted one: none of their rows is on screen. */
  hiddenAbove:number;
  totalRows:number;maxScroll:number;scrollRows:number;
  /* Rows from the bottom where each item starts (its first row), for the sticky prompt row. */
  firstRowFromBottom:(index:number)=>number;
  /* Rows below each item (0 for the newest): moves only when content BELOW it changes, so it anchors a scrolled view. */
  rowsBelow:(index:number)=>number;
};

/*
 * R1 (Q-R1-2, E9, E15): a ROW-based window. `scrollRows` counts rows scrolled up from the newest row; the region that
 * renders the window is bottom-anchored with its overflow hidden, so the mounted items may be taller than the view and
 * the view still shows exactly `rowBudget` rows: those between `scrollRows` and `scrollRows + rowBudget` from the
 * bottom. Unlike the item-offset planner above, the top of an item taller than the screen is reachable with PageUp.
 */
export function planTranscriptRows<T>(input:{
  items:readonly T[];rowBudget:number;scrollRows:number;heightOf:(item:T,index:number)=>number;revealIndex?:number;
}):TranscriptRowWindow<T>{
  const {items}=input;
  const budget=Number.isFinite(input.rowBudget)?Math.max(0,Math.floor(input.rowBudget)):0;
  const heights=items.map((item,index)=>{const raw=Number(input.heightOf(item,index));return Number.isFinite(raw)&&raw>0?Math.max(1,Math.ceil(raw)):1;});
  const below:number[]=new Array(items.length);let acc=0;
  for(let index=items.length-1;index>=0;index--){below[index]=acc;acc+=heights[index]!;}
  const totalRows=acc,maxScroll=Math.max(0,totalRows-budget);
  let scroll=Number.isFinite(input.scrollRows)?Math.max(0,Math.min(maxScroll,Math.floor(input.scrollRows))):0;
  const reveal=Number.isFinite(input.revealIndex)?Math.floor(input.revealIndex!):-1;
  if(reveal>=0&&reveal<items.length&&budget>0){
    /* A search or jump target is brought into view: its first row at the top of the view when it is taller than it. */
    const top=below[reveal]!+heights[reveal]!,bottom=below[reveal]!;
    if(top>scroll+budget||bottom<scroll)scroll=Math.max(0,Math.min(maxScroll,top-budget));
  }
  const firstRowFromBottom=(index:number)=>below[index]!+heights[index]!-1;
  const rowsBelow=(index:number)=>below[index]!;
  if(items.length===0||budget===0)return{start:items.length,end:items.length,rows:[],clipBelow:0,hiddenAbove:items.length,totalRows,maxScroll,scrollRows:scroll,firstRowFromBottom,rowsBelow};
  let end=items.length;
  while(end>0&&below[end-1]!+heights[end-1]!<=scroll)end--;
  let start=end;
  while(start>0&&below[start-1]!<scroll+budget)start--;
  const clipBelow=end>0?Math.max(0,scroll-below[end-1]!):0;
  return{start,end,rows:items.slice(start,end),clipBelow,hiddenAbove:start,totalRows,maxScroll,scrollRows:scroll,firstRowFromBottom,rowsBelow};
}

/*
 * R1 E9 / Q-R1-9: the one dim row that keeps the person's message in sight. When the latest user message starts above
 * the view it is named ("You: …"); when whole messages are above the view they are counted. Returns null when neither
 * is true, so the row costs nothing on a short conversation.
 */
export function transcriptAnnouncement(input:{hiddenAbove:number;hiddenMessagesAbove:number;latestPrompt:string|null;promptAboveView:boolean;width:number}):string|null{
  return transcriptAnnouncementRow(input)?.text??null;
}
/* Stage 6c (mockup `jumpprompt`; Claude Code fullscreen: a click on the row jumps to that prompt): the row, and the cell where
   its «You: …» part starts — the only part a click takes — or null when the row has no prompt part, or it was cut away. */
export function transcriptAnnouncementRow(input:{hiddenAbove:number;hiddenMessagesAbove:number;latestPrompt:string|null;promptAboveView:boolean;width:number}):{text:string;promptFrom:number|null}|null{
  const parts:string[]=[];let prompted=false;
  if(input.hiddenAbove>0){
    const messages=input.hiddenMessagesAbove;
    parts.push(messages>0?tn('screen.transcript.earlierMessages',messages):tn('screen.transcript.earlierItems',input.hiddenAbove));
  }
  if(input.promptAboveView&&input.latestPrompt){
    const prompt=input.latestPrompt.replace(/\s+/gu,' ').trim();
    if(prompt){parts.push(t('screen.transcript.youSaid',{prompt}));prompted=true;}
  }
  if(!parts.length)return null;
  const alone=parts.length===1&&!parts[0]!.startsWith('↑');
  const text=truncateDisplay(alone?`↑ ${parts[0]}`:parts.join(' · '),Math.max(1,input.width));
  const from=!prompted?null:alone?displayWidth('↑ '):displayWidth(`${parts[0]} · `);
  return{text,promptFrom:from!==null&&from<displayWidth(text)?from:null};
}

/* Long chats, tappa D: what is above the view, without the row that offers the beginning of the conversation (it is the first item, but it is not
   one of the conversation's items), and how many of those are messages - the two numbers the announcement row says. */
export function countAboveView(items:ReadonlyArray<{kind:string}>,hiddenAbove:number):{hidden:number;messages:number}{
  const skip=items[0]?.kind==='earlier'?1:0,hidden=Math.max(0,hiddenAbove-skip);
  return{hidden,messages:items.slice(skip,skip+hidden).filter(item=>item.kind==='message').length};
}

/* Tappa 8 C2 (g-q23, left to stage 8 by s48-clicks.scenario.ts:156; dossier
   RICERCA-5x5x5x5-TAPPA8-CONFORMITA-2026-10-07): true only when the prompt's header is entirely above the view.
   `firstRowFromBottom` counts the transcript rows strictly below the header and the topmost visible row is the one
   with `scrollRows + rowBudget - 1` rows below it, so a header EXACTLY there is visible: the announcement must not
   name it (hermes ui-tui viewport.ts:31-41 — if a user message is in the visible range, no announcement). */
export function promptStartsAboveView(firstRowFromBottom:number,scrollRows:number,rowBudget:number):boolean{
  return firstRowFromBottom>scrollRows+Math.max(0,rowBudget)-1;
}

/* Tappa 8 C1 (mockup :699-702, :1122; dossier RICERCA-5x5x5x5-TAPPA8-CONFORMITA-2026-10-07): the pill on the last
   row of the transcript window, shown only while scrolled above the tail (`visible`); the label itself is the click
   target (mockup :1122: scroll=0, follow=true, newAway=0 — what `reduceViewport('jump-tail')` already does).
   Right-aligned like the mockup with two columns of margin; a narrow transcript clamps the padding at zero. */
export function transcriptJumpPillRow(input:{columns:number;unseen:number;visible:boolean}):{text:string;targetFrom:number}|null{
  if(!input.visible)return null;
  const label=` ↓ ${t('screen.transcript.jumpToBottom')}${input.unseen>0?` · ${input.unseen} ${t('screen.transcript.jumpNew')}`:''} `;
  /* owner 09/10/2026: «in basso al centro» (the 0.5.0 drew it at the top right) */
  const pad=Math.max(0,Math.floor((input.columns-displayWidth(label))/2));
  return{text:' '.repeat(pad)+label,targetFrom:pad};
}

/* Rows an item takes before it has been measured. Exact for plain text, raw mode, warnings, run rows and tools (the
   same line lists the renderer draws, wrapped at the same width); a Markdown message is counted from its source text
   and corrected by the first measurement (E4). */
type EstimateOptions={raw?:boolean;expandedTools?:boolean;now?:number;reasoningVisible?:boolean;maxProseWidth?:number|null};
/* 08/10/2026 (long sessions; Pi `Markdown.render` keeps its lines per (text, width), Codex `ActiveCellTranscriptKey` keeps a cached
   layout per (revision, width) and only the cell whose output depends on time is recomputed, Hermes `MessageLine` is a `memo`).
   Every plan counts the rows of every item that was never mounted, and a render plans up to three times: the Markdown of every
   assistant message and the wrapped lines of every tool row were re-counted on each frame of a long transcript. A transcript item is
   never changed in place (the model replaces it with a new object), so the count is kept per item object and layout. The one row
   whose text reads the clock is a tool that is queued, running or streaming ("running for 12 s"): it is never kept. */
const KEPT_ESTIMATES=new WeakMap<object,Map<string,number>>();
const KEPT_LAYOUTS_PER_ITEM=8;
const readsTheClock=(item:TranscriptItem)=>item.kind==='tool'&&(item.status==='queued'||item.status==='running'||item.status==='streaming');
export function estimateTranscriptItemRows(item:TranscriptItem,width:number,options:EstimateOptions={}):number{
  if(!item||typeof item!=='object'||readsTheClock(item))return countTranscriptItemRows(item,width,options);
  const normalizedWidth=Math.max(1,Math.floor(Number.isFinite(width)?width:80));
  const layout=`${normalizedWidth}|${options.raw?1:0}|${options.expandedTools?1:0}|${options.reasoningVisible===false?0:1}|${options.maxProseWidth??'-'}`;
  let layouts=KEPT_ESTIMATES.get(item);
  const kept=layouts?.get(layout);
  if(kept!==undefined)return kept;
  const rows=countTranscriptItemRows(item,width,options);
  if(!layouts){layouts=new Map();KEPT_ESTIMATES.set(item,layouts);}
  else if(layouts.size>=KEPT_LAYOUTS_PER_ITEM)layouts.clear();
  layouts.set(layout,rows);
  return rows;
}
function countTranscriptItemRows(item:TranscriptItem,width:number,options:EstimateOptions):number{
  const normalizedWidth=Math.max(1,Math.floor(Number.isFinite(width)?width:80));
  if(options.raw)return textRows(transcriptItemRaw(item),normalizedWidth);
  if(item.kind==='message'){
    /* F-Q1: a queued message is its gray header and its plain text (app.ts draws it without Markdown) */
    if(item.queued)return textRows(item.queued,normalizedWidth)+(item.text?textRows(item.text,normalizedWidth):0);
    /* The approved mockup (components/conversation-rows.ts): a blank row, then the prompt's rows or the answer indented two */
    /* 0.6.13: a request not sent (too large for the model) has one more row, its mark (app.ts draws it truncated, one row) */
    /* 0.6.15 T5: a message from a device has one more row, «from “<device>”» (app.ts draws it truncated, one row) */
    if(item.role==='user')return 1+promptRows(item.text,normalizedWidth).length+(item.notSent?1:0)+(item.device!==undefined?1:0);
    const answerWidth=Math.max(1,normalizedWidth-ANSWER_INDENT);
    if(options.maxProseWidth!=null)return 1+parseMarkdownBlocks(item.text).reduce((rows,block)=>{
      const room=markdownBlockWidth(block,answerWidth,options.maxProseWidth);
      return rows+markdownBlockLines(block,room).lines.reduce((sum,line)=>sum+textRows(line,room),0);
    },0);
    return 1+textRows(item.text,answerWidth);
  }
  /* The approved mockup: a closed reasoning block is its one row (components/thinking-row.ts); open, the row and the text
     under `    │ ` (six cells). */
  if(item.kind==='reasoning')return options.reasoningVisible===false?1:1+textRows(item.text||' ',Math.max(1,normalizedWidth-6));
  /* R3 gate E1: the tool row's height comes from the ONE row formatter — the same header line app.ts draws (`line` is
     `title · statusLabel`) and the same detail lines — so the estimate and the render cannot disagree. */
  if(item.kind==='tool'){const turnWidth=Math.max(1,normalizedWidth-TURN_INDENT),view=toolRowView(item,turnWidth,Boolean(options.expandedTools),options.now);return textRows(view.line,turnWidth)+view.detailLines.reduce((rows:number,line:string)=>rows+wrapReadable(line,turnWidth).length,0);}
  /* A warning, and since R3 (Q-R3-9) the one outcome line of a turn that did not end normally (a warning with `outcome`). */
  /* R13: the same rows app.ts draws, laid out by wrapReadable (never Ink's mid-word cut) */
  if(item.kind==='warning')return wrapReadable(item.text,Math.max(1,normalizedWidth-TURN_INDENT)).length;
  /* ASYNC step 2: an agent row is the lines the ONE formatter draws (each truncated to the width, so one row each). */
  if(item.kind==='agent')return agentResultLines(item,normalizedWidth,{unicode:true,expanded:Boolean(options.expandedTools)}).length;
  /* Stage 3: the receipt is the rows its ONE formatter draws (wrapped under its indent). */
  if(item.kind==='answers')return answersRows(item,normalizedWidth,{unicode:true}).length;
  if(item.kind==='plan')return planReceiptRows(item,normalizedWidth,{unicode:true}).length;
  if(item.kind==='dialogue')return dialogueRows(item,normalizedWidth).length;
  /* Long chats, tappa D: the row that offers the older messages is one line (components/earlier-row.ts) */
  if(item.kind==='earlier')return 1;
  /* Legacy `run` items are no longer produced (Q-R3-9); counted the way app.ts still draws one. */
  return textRows(t('screen.transcript.run',{status:item.status})+(item.message?' · '+item.message:''),normalizedWidth);
}

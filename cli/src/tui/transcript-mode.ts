/*
 * Stage 7.12 (mockup «transcript mode with less-style search», `transcriptFrame`/`transcriptKey`; Claude Code fullscreen:
 * «Ctrl+o toggles between the normal prompt and transcript mode»; Codex's transcript pager): the whole conversation on the
 * whole screen. ↑/↓ (j/k) move item by item, { } jump between your prompts, / searches (Enter keeps the matches, Esc drops
 * them), n/N go through the matches, [ hands the conversation to the terminal's own scrollback, v opens it in the editor,
 * q / Esc / Ctrl+O go back. Pure: the state after a key and what the app does with it; the rows of its top and bottom.
 */
import {t,type MessageId} from '../i18n/index.ts';
import {S,type SegRow} from './panel/sheet.ts';

/* `at`: the item the view is on (null: the end); `hits`: the items that match, newest first as n walks back.
   Stage 7.12 «+1 completa» (owner 03/10; Claude Code «transcript mode … shows the full output of every tool call»; Codex's
   details toggle; Hermes `/details`): `full` opens every item (tools with input, output and diff, reasoning), `d` switches to
   the compact view; `flipped` holds the items o/Enter turned the other way from the view's default; `help` is the `?` list. */
export type TranscriptModeState={at:string|null;query:string;editing:boolean;hits:readonly string[];hi:number;full:boolean;flipped:readonly string[];help:boolean};
export type TranscriptModeItem={id:string;prompt:boolean;text:string};
export type TranscriptModeEffect='none'|'close'|'scrollback'|'editor'|'fork';

export function openTranscriptMode({search=false}:{search?:boolean}={}):TranscriptModeState{return{at:null,query:'',editing:search,hits:[],hi:0,full:true,flipped:[],help:false};}

/** The items drawn open: in the full view every item but the ones closed with o; in the compact view only the ones opened. */
export function transcriptModeOpen(state:Pick<TranscriptModeState,'full'|'flipped'>,ids:readonly string[]):ReadonlySet<string>{
  const flipped=new Set(state.flipped);
  return new Set(state.full?ids.filter(id=>!flipped.has(id)):ids.filter(id=>flipped.has(id)));
}

/** The items whose words hold the query, ignoring case (the mockup's search walks text, not rows). */
export function transcriptModeHits(items:readonly TranscriptModeItem[],query:string):string[]{
  const q=query.trim().toLowerCase();if(!q)return[];
  return items.filter(item=>item.text.toLowerCase().includes(q)).map(item=>item.id);
}
/* the newest match first, as the mockup's n walks back from the end */
function searched(state:TranscriptModeState,items:readonly TranscriptModeItem[],query:string):TranscriptModeState{
  const hits=transcriptModeHits(items,query);const hi=hits.length?hits.length-1:0;
  return{...state,query,hits,hi,at:hits.length?hits[hi]!:state.at};
}

export function transcriptModeKey(state:TranscriptModeState,key:{name:string;ctrl?:boolean},items:readonly TranscriptModeItem[]):{state:TranscriptModeState;effect:TranscriptModeEffect}{
  const k=key.name;const keep=(next:TranscriptModeState=state)=>({state:next,effect:'none' as const});
  if(state.editing){
    if(k==='Enter')return keep({...searched(state,items,state.query),editing:false});
    if(k==='Escape')return keep({...state,editing:false,query:'',hits:[],hi:0});
    if(k==='Backspace')return keep(searched({...state},items,[...state.query].slice(0,-1).join('')));
    if([...k].length===1&&!key.ctrl)return keep(searched(state,items,state.query+k));
    return keep();
  }
  /* the help list closes first: ?, q and Esc put it away, and every other key still works under it */
  if(state.help&&(k==='?'||k==='q'||k==='Escape'))return keep({...state,help:false});
  if(k==='?')return keep({...state,help:true});
  if(k==='q'||k==='Escape'||(key.ctrl&&(k==='o'||k==='O')))return{state,effect:'close'};
  if(k==='/')return keep({...state,editing:true,query:'',hits:[],hi:0});
  if(k==='d')return keep({...state,full:!state.full,flipped:[]});
  const current=state.at??items.at(-1)?.id??null;
  if(k==='o'||k==='Enter'){
    if(current===null)return keep();
    return keep({...state,flipped:state.flipped.includes(current)?state.flipped.filter(id=>id!==current):[...state.flipped,current]});
  }
  /* f on one of your prompts: a new conversation that starts before it (the app asks the kernel, when it can) */
  if(k==='f')return items.find(item=>item.id===current)?.prompt?{state,effect:'fork'}:keep();
  if((k==='n'||k==='N')&&state.hits.length){const hi=(state.hi+(k==='n'?-1:1)+state.hits.length)%state.hits.length;return keep({...state,hi,at:state.hits[hi]!});}
  const index=Math.max(0,state.at===null?items.length-1:items.findIndex(item=>item.id===state.at));
  if(k==='{'||k==='}'){
    const prompts=items.map((item,i)=>item.prompt?i:-1).filter(i=>i>=0);
    const next=k==='{'?[...prompts].reverse().find(i=>i<index):prompts.find(i=>i>index);
    return next===undefined?keep():keep({...state,at:items[next]!.id});
  }
  if((k==='ArrowUp'||k==='k')&&items.length)return keep({...state,at:items[Math.max(0,index-1)]!.id});
  if((k==='ArrowDown'||k==='j')&&items.length){const next=Math.min(items.length-1,index+1);return keep({...state,at:next===items.length-1?null:items[next]!.id});}
  if(k==='g'||k==='Home')return items.length?keep({...state,at:items[0]!.id}):keep();
  if(k==='G'||k==='End')return keep({...state,at:null});
  if(k==='[')return{state,effect:'scrollback'};
  if(k==='v')return{state,effect:'editor'};
  return keep();
}

/** The mockup's top row: «Transcript · 8 messages» and its keys. */
export function transcriptModeHeader(messages:number):SegRow{
  return[S(` ${t('screen.transcriptMode.title')}`,'acc b'),S(` · ${t(messages===1?'screen.transcriptMode.messages.one':'screen.transcriptMode.messages.other',{count:messages})}`,'dim'),S(`   ${t('screen.transcriptMode.keys')}`,'faint')];
}
/** The `?` list: every key of the transcript mode, the mockup's and the ones «+1 completa» adds. */
export function transcriptModeHelp(state:Pick<TranscriptModeState,'full'>):SegRow[]{
  const keys:Array<[string,MessageId]>=[['d',state.full?'screen.transcriptMode.help.compact':'screen.transcriptMode.help.full'],['o Enter','screen.transcriptMode.help.toggle'],
    ['↑ ↓ j k','screen.transcriptMode.help.move'],['{ }','screen.transcriptMode.help.prompts'],['g G','screen.transcriptMode.help.ends'],['/ n N','screen.transcriptMode.help.search'],
    ['f','screen.transcriptMode.help.fork'],['[','screen.transcriptMode.help.scrollback'],['v','screen.transcriptMode.help.editor'],['q Esc','screen.transcriptMode.help.back']];
  return[[S(` ${t('screen.transcriptMode.help.title')}`,'b')],...keys.map(([key,word]):SegRow=>[S(`   ${key.padEnd(8)}`,'acc'),S(t(word),'dim')])];
}
/** The row under the title while the view is up the conversation: the prompt the item in view answers. */
export function transcriptModePromptRow(prompt:string|null,width:number):SegRow{
  if(!prompt)return[S('')];
  const line=prompt.replace(/\s+/gu,' ').trim(),room=Math.max(1,width-4),chars=[...line];
  return[S(' › ','acc'),S(chars.length>room?chars.slice(0,room-1).join('')+'…':line,'dim')];
}
/** The prompt the item `at` belongs to: the nearest of your prompts at or above it; none at the end or above the first. */
export function transcriptModePromptOf(items:readonly TranscriptModeItem[],at:string|null):string|null{
  if(at===null)return null;
  const index=items.findIndex(item=>item.id===at);
  for(let i=index;i>=0;i--)if(items[i]!.prompt)return i===index?null:items[i]!.text;
  return null;
}
/** The search's words split into the pieces that match and the ones that do not, ignoring case. */
export function transcriptModeMarks(text:string,query:string):Array<{text:string;hit:boolean}>{
  const q=query.trim().toLowerCase();if(!q||!text)return[{text,hit:false}];
  const lower=text.toLowerCase(),out:Array<{text:string;hit:boolean}>=[];let from=0;
  for(let at=lower.indexOf(q);at>=0;at=lower.indexOf(q,at+q.length)){if(at>from)out.push({text:text.slice(from,at),hit:false});out.push({text:text.slice(at,at+q.length),hit:true});from=at+q.length;}
  if(from<text.length)out.push({text:text.slice(from),hit:false});
  return out;
}
/** The answer's time and model in the full view, «14:32 · gpt-5-mini» (Claude Code's transcript shows both). */
export function transcriptModeStamp(stamp:{at:number;model:string}|undefined):string{
  if(!stamp)return'';const date=new Date(stamp.at);
  return ` · ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')} · ${stamp.model}`;
}
/** The run before which `f` forks: your prompt's turn in the conversation the kernel kept, matched by its words and by how
 *  many times the same words came before it (`turns` newest first, as the /fork sheet reads them). */
export function transcriptModeTurn(prompts:readonly string[],index:number,turns:readonly {runId:string;text:string}[]):string|null{
  const words=(text:string)=>text.replace(/\s+/gu,' ').trim();
  const target=words(prompts[index]??'');if(!target)return null;
  const nth=prompts.slice(0,index).filter(text=>words(text)===target).length;
  return[...turns].reverse().filter(turn=>words(turn.text)===target)[nth]?.runId??null;
}
/** The bottom row: the search being typed and its count, or where n/N are, or how to search. */
export function transcriptModeStatus(state:TranscriptModeState):SegRow{
  if(state.editing)return[S(' /','acc'),S(`${state.query}▍`),S(state.query?`   ${t(state.hits.length===1?'screen.transcriptMode.matches.one':'screen.transcriptMode.matches.other',{count:state.hits.length})}`:'','dim')];
  if(state.query)return[S(` ${state.hits.length?t('screen.transcriptMode.match',{at:state.hi+1,count:state.hits.length,query:state.query}):t('screen.transcriptMode.noMatch',{query:state.query})}`,'dim')];
  return[S(` ${t('screen.transcriptMode.search')}`,'dim')];
}

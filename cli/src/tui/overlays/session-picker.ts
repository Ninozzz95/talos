import {t,tn} from '../../i18n/index.ts';
import type {CliSessionSummary} from '../../runtime/types.ts';
import {normalizeSessionSummary} from '../../runtime/session-summary.ts';
import {createSessionMetadataStore} from '../../sessions/metadata-store.ts';
import {moveSelection,type SelectionState} from '../selection-list.ts';
import {pickerSection,type OverlayContent} from './scroll-window.ts';

/* R5b D2: `forkDepth` places a fork under the conversation it came from (sessionTree). */
export type TuiSessionSummary=CliSessionSummary&{title:string;tags:string[];pinned:boolean;forkDepth?:number};
function isTyped(row:any):row is CliSessionSummary{return Boolean(row&&typeof row.id==='string'&&typeof row.sessionId==='string'&&typeof row.depth==='number'&&typeof row.outcome==='string'&&Array.isArray(row.collisions));}
export function normalizeSessions(rows:readonly any[]):TuiSessionSummary[]{
  return rows.map((row:any)=>{
    const summary=isTyped(row)?row:normalizeSessionSummary(row);
    const tags=Array.isArray((row as any)?.tags)?(row as any).tags.filter((value:any)=>typeof value==='string'):[];
    /* R5b D2: the person's own name (/rename, kept in the metadata) wins over the kernel's short name. */
    const named=typeof (row as any)?.metadataName==='string'&&(row as any).metadataName?(row as any).metadataName:null;
    /* UI Phase 0 D23: then the first message (metadata-store.ts), then the id; the id stays in the search (filterSessions). */
    const first=typeof (row as any)?.firstMessage==='string'&&(row as any).firstMessage?(row as any).firstMessage:null;
    return{...summary,title:named??summary.name??first??summary.id,tags,pinned:(row as any)?.pinned===true};
  }).filter(row=>row.id).sort((a,b)=>{
    if(a.pinned!==b.pinned)return a.pinned?-1:1;
    const aTime=a.updatedAt??a.startedAt,bTime=b.updatedAt??b.startedAt;
    if(aTime===bTime)return 0;if(aTime===null)return 1;if(bTime===null)return-1;return bTime.localeCompare(aTime);
  });
}
export function filterSessions(rows:readonly TuiSessionSummary[],query:string){const q=query.trim().toLowerCase();return q?rows.filter(row=>[row.id,row.title,row.project??'',row.path??'',...(Array.isArray(row.tags)?row.tags:[])].some(value=>String(value??'').toLowerCase().includes(q))):[...rows];}

export type SessionPickerController={listSessions():Promise<TuiSessionSummary[]>;resumeSession(id:string,prompt?:string):Promise<string>;forkSession(id:string,prompt?:string):Promise<string>};
export type SessionPickerModel={open():Promise<void>;move(action:'up'|'down'|'page-up'|'page-down'|'home'|'end'):void;select(index:number):void;confirm():Promise<string|null>;action():'resume'|'fork';cancel():void;rows():readonly TuiSessionSummary[];selected():number;setQuery(query:string):void};
export function createSessionPickerModel(controller:SessionPickerController,action:'resume'|'fork',options:{metadataRoot?:string}={}):SessionPickerModel{
  let all:TuiSessionSummary[]=[];let visible:TuiSessionSummary[]=[];let state:SelectionState={query:'',selected:0,pageSize:10};let cancelled=false;
  return{
    async open(){cancelled=false;const source=await controller.listSessions();if(options.metadataRoot){const rows=normalizeSessions(source);const store=createSessionMetadataStore({rootDir:options.metadataRoot});all=normalizeSessions(await Promise.all(rows.map(async row=>{const metadata=await store.get(row.id);return{...row,tags:metadata?.tags??[],pinned:metadata?.pinned??false,...(metadata?.name?{metadataName:metadata.name}:{}),...(metadata?.firstMessage?{firstMessage:metadata.firstMessage}:{})};})));all=sessionTree(all);}else all=source.map(row=>({...row,tags:Array.isArray((row as any).tags)?(row as any).tags:[],pinned:(row as any).pinned===true}));
      /* Rule 17 measure (03/11/2026): a delegated agent's conversation is not one to resume or fork from here — Enter took the newest
         row, the agent's. Like the Board (app.ts `boardRowsOf`) and Hermes (`exclude_children`): agents are reached from their chat. */
      all=all.filter(row=>!(row as any).parentId);visible=all;state={query:'',selected:0,pageSize:10};},
    move(next){state=moveSelection(state,visible.length,next);},
    select(index){state={...state,selected:Math.max(0,Math.min(Math.max(0,visible.length-1),Math.trunc(index)))};},
    /* R5b: the session it attached (the fork's new id), so the screen can say where a fork came from. */
    async confirm(){if(cancelled)return null;const row=visible[state.selected];if(!row)return null;return action==='resume'?await controller.resumeSession(row.id):await controller.forkSession(row.id);},
    action:()=>action,
    cancel(){cancelled=true;},rows:()=>visible,selected:()=>state.selected,
    setQuery(query){visible=filterSessions(all,query);state={...state,query,selected:0};},
  };
}

/* R5b D2 (Q-R5-12): how long ago, as a person says it; a date after a month. */
export function sessionAge(iso:string|null|undefined,now=Date.now()):string{
  const at=typeof iso==='string'?Date.parse(iso):Number.NaN;if(Number.isNaN(at))return '';
  const minutes=Math.floor(Math.max(0,now-at)/60_000);
  if(minutes<1)return t('screen.session.ageNow');
  if(minutes<60)return t('screen.session.ageMinutes',{count:minutes});
  const hours=Math.floor(minutes/60);if(hours<24)return t('screen.session.ageHours',{count:hours});
  const days=Math.floor(hours/24);if(days<31)return t('screen.session.ageDays',{count:days});
  return new Date(at).toISOString().slice(0,10);
}
/* R5b D2 (Q-R5-12, "the branch tree"): each fork right under the conversation it came from (depth +1), in the list's own
   order; a fork whose origin is not listed stays where it was. */
export function sessionTree(rows:readonly TuiSessionSummary[]):TuiSessionSummary[]{
  const ids=new Set(rows.map(row=>row.id));const children=new Map<string,TuiSessionSummary[]>();const roots:TuiSessionSummary[]=[];
  for(const row of rows){const from=row.forkedFrom;if(from&&from!==row.id&&ids.has(from)){const list=children.get(from)??[];list.push(row);children.set(from,list);}else roots.push(row);}
  const out:TuiSessionSummary[]=[];const seen=new Set<string>();
  const visit=(row:TuiSessionSummary,depth:number)=>{if(seen.has(row.id))return;seen.add(row.id);out.push({...row,forkDepth:depth});for(const child of children.get(row.id)??[])visit(child,Math.min(depth+1,4));};
  for(const row of roots)visit(row,0);
  for(const row of rows)if(!seen.has(row.id))visit(row,0);
  return out;
}
function sessionRowText(row:TuiSessionSummary,now:number){
  const depth=row.forkDepth??0;
  const parts=[`${row.title||row.id}`,sessionAge(row.updatedAt??row.startedAt,now),row.usage?.turns?tn('screen.session.turns',row.usage.turns):'',row.model??''].filter(Boolean);
  return `${row.pinned?'★ ':''}${'  '.repeat(depth)}${depth||row.forkedFrom?'⑂ ':''}${parts.join(' · ')}${row.tags?.length?` · ${row.tags.map((tag:string)=>`#${tag}`).join(' ')}`:''}`;
}

// R1 Q-R1-3: the picker as app.ts draws it, capped and scrolled by overlays/scroll-window.ts.
// R4 Q-R4-13: with nothing to list it says so and how to start one (review D-10 s09: the empty picker had no text; Claude
// Code "No conversations found in this project.", Codex "No sessions yet", Pi "No sessions in current folder", gate §5.2).
export function sessionPickerOverlay({action,query,rows,selected,now=Date.now()}:{action:'resume'|'fork';query:string;rows:readonly TuiSessionSummary[];selected:number;now?:number}):OverlayContent{
  const empty=query.trim()?t('screen.session.noMatch',{query:query.trim()}):t('screen.session.empty');
  return{
    head:[{text:t(action==='resume'?'screen.session.resumeTitle':'screen.session.forkTitle'),tone:'title'},{text:t('screen.picker.search',{query:query||t('screen.none')}),tone:'dim'}],
    sections:[rows.length
      ?pickerSection(rows,selected,row=>sessionRowText(row,now))
      :{lines:[{text:empty,tone:'dim'}]}],
  };
}

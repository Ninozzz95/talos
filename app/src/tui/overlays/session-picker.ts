import type {CliSessionSummary} from '../../runtime/types.ts';
import {normalizeSessionSummary} from '../../runtime/session-summary.ts';
import {createSessionMetadataStore} from '../../sessions/metadata-store.ts';
import {moveSelection,type SelectionState} from '../selection-list.ts';

export type TuiSessionSummary=CliSessionSummary&{title:string;tags:string[];pinned:boolean};
function isTyped(row:any):row is CliSessionSummary{return Boolean(row&&typeof row.id==='string'&&typeof row.sessionId==='string'&&typeof row.depth==='number'&&typeof row.outcome==='string'&&Array.isArray(row.collisions));}
export function normalizeSessions(rows:readonly any[]):TuiSessionSummary[]{
  return rows.map((row:any)=>{
    const summary=isTyped(row)?row:normalizeSessionSummary(row);
    const tags=Array.isArray((row as any)?.tags)?(row as any).tags.filter((value:any)=>typeof value==='string'):[];
    return{...summary,title:summary.name??summary.id,tags,pinned:(row as any)?.pinned===true};
  }).filter(row=>row.id).sort((a,b)=>{
    if(a.pinned!==b.pinned)return a.pinned?-1:1;
    const aTime=a.updatedAt??a.startedAt,bTime=b.updatedAt??b.startedAt;
    if(aTime===bTime)return 0;if(aTime===null)return 1;if(bTime===null)return-1;return bTime.localeCompare(aTime);
  });
}
export function filterSessions(rows:readonly TuiSessionSummary[],query:string){const q=query.trim().toLowerCase();return q?rows.filter(row=>[row.id,row.title,row.project??'',row.path??'',...(Array.isArray(row.tags)?row.tags:[])].some(value=>String(value??'').toLowerCase().includes(q))):[...rows];}

export type SessionPickerController={listSessions():Promise<TuiSessionSummary[]>;resumeSession(id:string,prompt?:string):Promise<string>;forkSession(id:string,prompt?:string):Promise<string>};
export type SessionPickerModel={open():Promise<void>;move(action:'up'|'down'|'page-up'|'page-down'|'home'|'end'):void;select(index:number):void;confirm():Promise<void>;cancel():void;rows():readonly TuiSessionSummary[];selected():number;setQuery(query:string):void};
export function createSessionPickerModel(controller:SessionPickerController,action:'resume'|'fork',options:{metadataRoot?:string}={}):SessionPickerModel{
  let all:TuiSessionSummary[]=[];let visible:TuiSessionSummary[]=[];let state:SelectionState={query:'',selected:0,pageSize:10};let cancelled=false;
  return{
    async open(){cancelled=false;const source=await controller.listSessions();if(options.metadataRoot){const rows=normalizeSessions(source);const store=createSessionMetadataStore({rootDir:options.metadataRoot});all=normalizeSessions(await Promise.all(rows.map(async row=>{const metadata=await store.get(row.id);return{...row,tags:metadata?.tags??[],pinned:metadata?.pinned??false};})));}else all=source.map(row=>({...row,tags:Array.isArray((row as any).tags)?(row as any).tags:[],pinned:(row as any).pinned===true}));visible=all;state={query:'',selected:0,pageSize:10};},
    move(next){state=moveSelection(state,visible.length,next);},
    select(index){state={...state,selected:Math.max(0,Math.min(Math.max(0,visible.length-1),Math.trunc(index)))};},
    async confirm(){if(cancelled)return;const row=visible[state.selected];if(!row)return;if(action==='resume')await controller.resumeSession(row.id);else await controller.forkSession(row.id);},
    cancel(){cancelled=true;},rows:()=>visible,selected:()=>state.selected,
    setQuery(query){visible=filterSessions(all,query);state={...state,query,selected:0};},
  };
}

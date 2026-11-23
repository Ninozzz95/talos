/*
 * P13, owner decision 8 (2026-09-26): an approval a sub-agent asks for opens on top, whatever is being watched, and says who
 * asks. Measured before this file (the built CLI, manual mode, a child that runs a shell command): the child inherits the
 * parent's permissions (subagent-orchestrator.mjs:388-438) and writes `ApprovalRequested` on ITS OWN session; the TUI listened
 * only to the parent, nobody answered, and the turn waited forever on "1 agent working".
 * Claude Code shows such a prompt in the main UI with its origin ("from a subagent", read in the 2.1.283 binary); Hermes' CLI
 * instead denies every child's dangerous command (tools/delegate_tool_config.py:35-58). The owner chose Claude Code's way.
 *
 * The descendants are found in the session list (Cline polls its roster every 2.5 s while a turn runs, Hermes its live tail
 * every 1.5 s). ASYNC (owner 01/10): the unified kernel's delegations run in the background and the kernel now announces each
 * child to its ancestors (`talos.agenti`, v2 `agent.changed`), so the watch starts on that event too and lasts while a
 * descendant is alive, not only while the parent's run is open (`release`).
 * Each descendant, grandchildren included, is subscribed once; its replayed history hands over the approvals still waiting,
 * and its live events the new ones. Only approval events leave this file: the child's transcript is P13's viewer.
 */
import type {CliRuntime} from '../runtime/types.ts';
import {createTuiEventAdapter,type TuiEvent} from './event-adapter.ts';

export type ApprovalRequired=Extract<TuiEvent,{type:'approval.required'}>;
/* Stage 6b (owner 02/10): with the host's `domandeDeiFigli` a descendant may ask the person; its question is on ITS session. */
export type QuestionRequired=Extract<TuiEvent,{type:'question.required'}>;
export type DescendantOrigin={sessionId:string;task:string|null;depth:number};
type SessionRow={sessionId?:unknown;id?:unknown;parentId?:unknown;name?:unknown;delegatedTask?:unknown;depth?:unknown;endedAt?:unknown;outcome?:unknown};

/** The sessions below `rootId`, at every level, from a session list. */
export function descendantsOf(rows:readonly SessionRow[],rootId:string):DescendantOrigin[]{
  const idOf=(row:SessionRow)=>typeof row.sessionId==='string'&&row.sessionId?row.sessionId:typeof row.id==='string'&&row.id?row.id:null;
  const below=new Set([rootId]),found:DescendantOrigin[]=[];
  for(let grew=true;grew;){
    grew=false;
    for(const row of rows){
      const id=idOf(row);
      if(!id||below.has(id)||typeof row.parentId!=='string'||!below.has(row.parentId))continue;
      below.add(id);grew=true;
      /* 0.6.8 L3-17: a sub-agent is called by its name («-N» among sisters), its task when it has none */
      const label=[row.name,row.delegatedTask].find((value:unknown):value is string=>typeof value==='string'&&value.trim()!=='')??null;
      found.push({sessionId:id,task:label,depth:typeof row.depth==='number'?row.depth:1});
    }
  }
  return found;
}

export function createDescendantApprovals({runtime,secretValues=[],intervalMs=500,onRequired,onResolved,onQuestion,onQuestionResolved,onError=()=>{}}:{
  runtime:Pick<CliRuntime,'listSessions'|'subscribe'>;
  secretValues?:readonly string[];
  intervalMs?:number;
  onRequired:(origin:DescendantOrigin,event:ApprovalRequired)=>void;
  onResolved:(origin:DescendantOrigin,requestId:string)=>void;
  onQuestion?:(origin:DescendantOrigin,event:QuestionRequired)=>void;
  onQuestionResolved?:(origin:DescendantOrigin,requestId:string)=>void;
  onError?:(error:unknown)=>void;
}){
  /* ASYNC (owner 01/10): with the unified kernel's asynchronous delegations the parent's run ends while its children work.
     `release` marks that no run of the root is open; the watch then lasts while a descendant is alive (outcome `running`,
     or no outcome and no end yet) and stops by itself after the last one ends. */
  let rootId:string|null=null,timer:ReturnType<typeof setInterval>|null=null,syncing=false,generation=0,released=false;
  const alive=(row:SessionRow)=>row.outcome==='running'||(row.outcome==null&&row.endedAt==null);
  const watched=new Map<string,()=>void>();

  function watch(origin:DescendantOrigin){
    const adapter=createTuiEventAdapter(secretValues);adapter.bindSession(origin.sessionId);
    /* The replay is synchronous inside `subscribe`: what it asks and answers is settled first, and only the requests still
       waiting at its end are handed over. */
    let replaying=true;const waiting=new Map<string,ApprovalRequired>();const asking=new Map<string,QuestionRequired>();
    const handle=(event:TuiEvent)=>{
      if(event.type==='approval.required'){if(replaying)waiting.set(event.requestId,event);else onRequired(origin,event);}
      else if(event.type==='approval.resolved'){if(replaying)waiting.delete(event.requestId);else onResolved(origin,event.requestId);}
      else if(event.type==='question.required'){if(replaying)asking.set(event.requestId,event);else onQuestion?.(origin,event);}
      else if(event.type==='question.resolved'){if(replaying)asking.delete(event.requestId);else onQuestionResolved?.(origin,event.requestId);}
      else if(replaying&&(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled')){waiting.clear();asking.clear();}
    };
    let off=()=>{};
    try{off=runtime.subscribe(origin.sessionId,raw=>{for(const event of adapter.translateAll(raw))handle(event);});}
    finally{replaying=false;}
    watched.set(origin.sessionId,off);
    for(const event of waiting.values())onRequired(origin,event);
    for(const event of asking.values())onQuestion?.(origin,event);
  }

  async function sync(){
    if(!rootId||syncing)return;
    syncing=true;const mine=generation;
    try{
      const rows=await runtime.listSessions({scope:'loaded'}) as SessionRow[];
      if(mine!==generation||!rootId)return;
      const below=descendantsOf(rows,rootId);
      for(const origin of below)if(!watched.has(origin.sessionId))watch(origin);
      if(released){
        const ids=new Set(below.map(origin=>origin.sessionId));
        const living=rows.filter(row=>{const id=typeof row.sessionId==='string'?row.sessionId:typeof row.id==='string'?row.id:null;return id!==null&&ids.has(id)&&alive(row);});
        if(!living.length)stop();
      }
    }catch(error){onError(error);}
    finally{syncing=false;}
  }

  function stop(){
    generation++;rootId=null;released=false;
    if(timer){clearInterval(timer);timer=null;}
    for(const off of watched.values()){try{off();}catch{/* an unsubscribe that fails leaves nothing to undo */}}
    watched.clear();
  }
  /** Watches the descendants of `sessionId` until `stop`; a second call for the same session changes nothing. */
  function start(sessionId:string){
    if(rootId===sessionId&&timer){released=false;return;}
    stop();rootId=sessionId;
    timer=setInterval(()=>void sync(),Math.max(50,intervalMs));timer.unref?.();
    void sync();
  }
  /** No run of the root is open any more: keep watching while a descendant is alive, then stop. */
  function release(){if(!rootId)return;released=true;void sync();}
  /** `sync` asks the session list now (tests, and a delegation that has just started). */
  return{start,stop,release,sync,watching:()=>[...watched.keys()]};
}

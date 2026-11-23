/*
 * P13 (owner, 2026-09-25: open the sub-agents and watch their conversation live; decisions of 2026-09-26). The chosen agent's
 * REAL transcript takes the main view, as Claude Code (`viewingAgentTaskId`, "Viewing agent"), Codex (a sub-agent's thread
 * attached to the chat), OpenCode (leader+↓/→ into the child session) and Cline (`onOpenAgentSession`) do; Hermes polls a
 * 16 KiB text tail every 1.5 s instead. Here the child's own events are subscribed to (`runtime.subscribe`, the replay first,
 * then live), translated by an adapter of its own and folded by the same transcript model as the main session's, so the
 * view is the same rendering and no polling. Only watching (decision 2): nothing here sends, stops or answers.
 * The session controller is not touched: the current session, its queue, its approvals and Ctrl+C stay the parent's.
 */
import type {CliRuntime} from '../runtime/types.ts';
import {createTuiEventAdapter,type TuiEvent} from './event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent,type TranscriptModel} from './transcript-model.ts';

export type AgentViewTarget={sessionId:string;task:string|null};
export type AgentViewState=AgentViewTarget&{transcript:TranscriptModel;running:boolean;done:boolean};

const TERMINAL=new Set<TuiEvent['type']>(['run.completed','run.failed','run.cancelled']);

/** Folds a child's events into its view: the transcript, and whether its run is running or over. */
export function reduceAgentView(state:AgentViewState,event:TuiEvent):AgentViewState{
  const transcript=reduceTranscriptEvent(state.transcript,event);
  if(event.type==='run.started')return{...state,transcript,running:true,done:false};
  if(TERMINAL.has(event.type))return{...state,transcript,running:false,done:true};
  return transcript===state.transcript?state:{...state,transcript};
}

export function createAgentView({runtime,target,secretValues=[],onChange,batchMs=16}:{
  runtime:Pick<CliRuntime,'subscribe'>;
  target:AgentViewTarget;
  secretValues?:readonly string[];
  onChange:(state:AgentViewState)=>void;
  batchMs?:number;
}){
  const adapter=createTuiEventAdapter(secretValues);adapter.bindSession(target.sessionId);
  let state:AgentViewState={...target,transcript:createTranscriptModel(),running:false,done:false};
  let replaying=true,closed=false,timer:ReturnType<typeof setTimeout>|null=null;
  /* A streamed answer is many small events: the screen is told at most once per frame. */
  const notify=()=>{
    if(closed||replaying||timer)return;
    timer=setTimeout(()=>{timer=null;if(!closed)onChange(state);},batchMs);
  };
  let off=()=>{};
  try{
    off=runtime.subscribe(target.sessionId,raw=>{
      if(closed)return;
      for(const event of adapter.translateAll(raw))state=reduceAgentView(state,replaying&&event.type==='run.started'?{...event,history:true}:event);
      notify();
    });
  }finally{replaying=false;}
  if(!closed)onChange(state);
  return{
    state:()=>state,
    close(){if(closed)return;closed=true;if(timer){clearTimeout(timer);timer=null;}try{off();}catch{/* nothing left to undo */}},
  };
}

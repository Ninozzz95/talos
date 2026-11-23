import {t,tn} from '../i18n/index.ts';
import {toolDisplay} from './tool-display.ts';
import type {ToolLifecycleStatus,ToolOutcomeEvidence} from '../events/bridge.ts';
import type {TuiEvent} from './event-adapter.ts';
import type {TurnOutcome} from './live-activity.ts';
import {EMPTY_PULSE,reducePulse,type ActivityPulse} from './activity-pulse.ts';
import {reduceLiveAgents,type LiveAgent} from './live-agents.ts';
import {createTranscriptModel,reduceTranscriptEvent,windowTranscript,type TranscriptModel} from './transcript-model.ts';

const MAX_RENDER_MESSAGES=512;
const MAX_RENDER_TOOLS=256;
const MAX_RENDER_WARNINGS=128;
const MAX_MESSAGE_CHARS=256*1024;
const MAX_TOOL_SUMMARY_CHARS=8*1024;
const MAX_WARNING_CHARS=2048;
function tail(value:string,limit:number){if(value.length<=limit)return value;return `${t('screen.state.truncated')}\n${value.slice(-(limit-22))}`;}

export type TuiMessage={id:string;role:'user'|'assistant';text:string};
export type TuiToolStatus='queued'|'approval'|'running'|'streaming'|ToolLifecycleStatus;
/*
 * R5a S4 (owner decision Q-R5-6, gate E5): the provider attempt TALOS is waiting on, from lane R's `provider.attempt`.
 * Read as the owner's line reads it: `attempt` is the attempt about to be made (2 = the first retry) of `maxAttempts`,
 * `status` the HTTP status of the attempt that failed (null: no response), `waitMs` the wait before it when known and
 * `retryAfterMs` what the provider asked for; `at` is when the screen learned it (the countdown's origin). Cleared by the
 * model's next output or the end of the turn, so it is never shown as "thinking" and never outlives its wait.
 */
export type TuiRetry={attempt:number;maxAttempts:number;status:number|null;retryAfterMs:number|null;waitMs:number|null;at:number;planLimit?:true;resumesAt?:number|null};
export type TuiToolRow={id:string;name:string;status:TuiToolStatus;argsText:string;liveOutput:string;finalOutput:string;startedAt:number|null;endedAt:number|null;outcome:ToolOutcomeEvidence|null};
export type TuiState={
  sessionId:string|null;
  running:boolean;
  /* R3 Q-R3-7 (gate E7): `sentAt` = a prompt was sent and its run has not started (status `starting`); `waitingForPerson` =
     the approval dialog is open (status `waiting for you`); `lastTurn` = how the last turn ended (status after the turn). */
  sentAt:number|null;
  waitingForPerson:boolean;
  lastTurn:null|{outcome:TurnOutcome;durationMs:number|null};
  turnStartedAt:number|null;
  retry:TuiRetry|null;
  /* R5a wiring (Q-R5-4): the compactions named in this session, counted from `context.compacted` (live and replayed). */
  compactions:number;
  messages:TuiMessage[];
  streamingAssistant:null|{id:string;text:string};
  reasoning:null|{id:string;text:string};
  /** A6: the title of the kernel's beat while the model reasons; it leaves with the first text, tool or the end of the turn. */
  reasoningTitle?:string|null;
  tools:TuiToolRow[];
  approval:null|{requestId:string;label:string;detail:string;payload:Record<string,unknown>;toolCallId:string|null};
  usage:unknown;
  warnings:string[];
  transcript:TranscriptModel;
  status:{model:string;permissionMode:string;branch:string|null;contextLabel:string|null};
  /* ASYNC step 3: this session's delegated agents as the kernel announces them (live-agents.ts). */
  agents:readonly LiveAgent[];
  /* Stage 4: the turn's pulse for the activity line (tokens, the wait on the model, the facts of its summary). */
  pulse:ActivityPulse;
};

export function initialTuiState(x:{model:string;permissionMode:string}):TuiState{return{sessionId:null,running:false,sentAt:null,waitingForPerson:false,lastTurn:null,turnStartedAt:null,retry:null,compactions:0,messages:[],streamingAssistant:null,reasoning:null,tools:[],approval:null,usage:null,warnings:[],transcript:createTranscriptModel(),status:{model:x.model,permissionMode:x.permissionMode,branch:null,contextLabel:null},agents:[],pulse:EMPTY_PULSE};}
/* Riga 224 (T3, T4): the one place a conversation's view starts (/clear, /resume, /fork): all of it empty, a field added later too; kept are the run's control and model, mode and branch */
export function freshConversationView(s:TuiState):TuiState{const e=initialTuiState(s.status);return{...e,sessionId:s.sessionId,running:s.running,sentAt:s.sentAt,waitingForPerson:s.waitingForPerson,turnStartedAt:s.turnStartedAt,approval:s.approval,status:{...e.status,branch:s.status.branch}};}

function finalizeStreaming(state:TuiState,messageId:string):TuiState{
  const live=state.streamingAssistant;
  if(!live||live.id!==messageId)return state;
  const base=state.messages.length>=MAX_RENDER_MESSAGES?state.messages.slice(-(MAX_RENDER_MESSAGES-1)):state.messages;
  return{...state,streamingAssistant:null,messages:[...base,{id:live.id,role:'assistant',text:tail(live.text,MAX_MESSAGE_CHARS)}]};
}
function endTurn(state:TuiState,outcome:TurnOutcome):Pick<TuiState,'sentAt'|'waitingForPerson'|'lastTurn'|'turnStartedAt'|'retry'>{
  return{sentAt:null,waitingForPerson:false,retry:null,lastTurn:{outcome,durationMs:state.turnStartedAt===null?(state.lastTurn?.durationMs??null):Math.max(0,Date.now()-state.turnStartedAt)},turnStartedAt:null};
}
function activeToolStatus(status:TuiToolStatus){return status==='queued'||status==='approval'||status==='running'||status==='streaming';}
function closeRunningTools(state:TuiState,status:'cancelled'|'failed'='cancelled'){return state.tools.map(row=>activeToolStatus(row.status)?{...row,status,endedAt:row.endedAt??Date.now()}:row);}

const whole=(value:unknown,fallback:number|null=null)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value):fallback;
/* The model answered again: a retry, if any, is over (message, reasoning or a tool call). */
const PROGRESS=new Set(['message.started','message.delta','reasoning.started','reasoning.delta','tool.started']);
const RUN_ENDS=new Set(['run.completed','run.cancelled','run.failed']);
/* Stage 4: every event also moves the turn's pulse, read against the state BEFORE the event (its tools, its approval). */
export function reduceTuiEvent(state:TuiState,event:TuiEvent):TuiState{
  const before=state.pulse??EMPTY_PULSE,pulse=reducePulse(before,state,event,Date.now());
  const next=reduceScreenEvent(state,event);
  return pulse===before&&next.pulse===before?next:{...next,pulse};
}
function reduceScreenEvent(state:TuiState,event:TuiEvent):TuiState{
  if(event.type==='history.window')return{...state,transcript:windowTranscript(state.transcript,event.turns)};
  state={...state,transcript:reduceTranscriptEvent(state.transcript,event)};
  if(event.type==='provider.attempt'){
    const attempt=whole(event.attempt,1)!,maxAttempts=Math.max(attempt,whole(event.maxAttempts,attempt)!);
    return{...state,retry:{attempt,maxAttempts,status:whole(event.status),retryAfterMs:whole(event.retryAfterMs),waitMs:whole(event.waitMs),at:Date.now(),...(event.planLimit===true?{planLimit:true as const,resumesAt:whole(event.resumesAt)}:{})}};
  }
  if(state.retry&&PROGRESS.has(event.type))state={...state,retry:null};
  if(state.reasoningTitle&&(PROGRESS.has(event.type)||RUN_ENDS.has(event.type)))state={...state,reasoningTitle:null};
  if(event.type==='context.compacted')return{...state,compactions:(state.compactions??0)+1};
  if(event.type==='agent.changed'||event.type==='run.started'){const agents=reduceLiveAgents(state.agents??[],event);if(agents!==state.agents)state={...state,agents};if(event.type==='agent.changed')return state;}
  if(event.type==='run.started')return{...state,sessionId:event.sessionId||state.sessionId,running:true,sentAt:null,lastTurn:null,turnStartedAt:event.history?null:Date.now(),retry:null};
  if(event.type==='message.started'){
    if(event.role!=='assistant')return state;
    const live=state.streamingAssistant,next=live&&live.id!==event.messageId?finalizeStreaming(state,live.id):state;
    return next.streamingAssistant?.id===event.messageId?next:{...next,streamingAssistant:{id:event.messageId,text:''}};
  }
  if(event.type==='message.delta'){
    const live=state.streamingAssistant;
    if(live?.id===event.messageId)return{...state,streamingAssistant:{...live,text:tail(live.text+event.delta,MAX_MESSAGE_CHARS)}};
    const next=live?finalizeStreaming(state,live.id):state;
    return{...next,streamingAssistant:{id:event.messageId,text:tail(event.delta,MAX_MESSAGE_CHARS)}};
  }
  if(event.type==='message.end')return finalizeStreaming(state,event.messageId);
  if(event.type==='reasoning.pulse')return event.title&&event.title!==state.reasoningTitle?{...state,reasoningTitle:event.title}:state;
  if(event.type==='reasoning.started')return state.reasoning?.id===event.messageId?state:{...state,reasoning:{id:event.messageId,text:''}};
  if(event.type==='reasoning.delta'){
    const current=state.reasoning;
    return{...state,reasoning:current?.id===event.messageId?{...current,text:tail(current.text+event.delta,MAX_MESSAGE_CHARS)}:{id:event.messageId,text:tail(event.delta,MAX_MESSAGE_CHARS)}};
  }
  if(event.type==='reasoning.end')return state.reasoning?.id===event.messageId?{...state,reasoning:null}:state;
  if(event.type==='tool.started'){
    const row:TuiToolRow={id:event.toolCallId,name:event.toolName,status:'queued',argsText:'',liveOutput:'',finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null};
    const existing=state.tools.findIndex(x=>x.id===event.toolCallId);
    if(existing>=0){const tools=state.tools.slice();tools[existing]=row;return{...state,tools};}
    return{...state,tools:[...state.tools.slice(-(MAX_RENDER_TOOLS-1)),row]};
  }
  if(event.type==='tool.args')return{...state,tools:state.tools.map(row=>row.id===event.toolCallId?{...row,argsText:tail(row.argsText+event.delta,MAX_TOOL_SUMMARY_CHARS)}:row)};
  if(event.type==='tool.output')return{...state,tools:state.tools.map(row=>row.id===event.toolCallId&&activeToolStatus(row.status)?{...row,status:'streaming',liveOutput:tail(row.liveOutput+event.delta,MAX_TOOL_SUMMARY_CHARS)}:row)};
  if(event.type==='tool.completed')return{...state,tools:state.tools.map(row=>row.id===event.toolCallId?{...row,status:event.outcome?.status??'completed',finalOutput:tail(event.content,MAX_TOOL_SUMMARY_CHARS),endedAt:Date.now(),outcome:event.outcome??null}:row)};
  if(event.type==='approval.required'){
    /* R2 (gate E3): the tool is named by lane T's display table, never by its kernel name (`scrivi`, `shell`). */
    const p=event.payload;const tool=p.tool??p.tipo;const label=tool?toolDisplay(String(tool)).label:t('screen.approval.label');const detail=String(p.command??p.comando??p.resource??p.percorso??p.path??'');const toolCallId=event.toolCallId??null;
    return{...state,tools:toolCallId?state.tools.map(row=>row.id===toolCallId&&activeToolStatus(row.status)?{...row,status:'approval'}:row):state.tools,approval:{requestId:event.requestId,label,detail,payload:p,toolCallId}};
  }
  if(event.type==='approval.resolved'){
    const approval=state.approval;if(!approval||approval.requestId!==event.requestId)return state;
    const tools=approval.toolCallId?state.tools.map(row=>{
      if(row.id!==approval.toolCallId||!activeToolStatus(row.status))return row;
      if(event.approved===true)return{...row,status:'running' as const};
      if(event.approved===false)return{...row,status:'failed' as const,endedAt:row.endedAt??Date.now()};
      return row;
    }):state.tools;
    return{...state,tools,approval:null};
  }
  if(event.type==='usage.updated')return{...state,usage:event.value,status:{...state.status,contextLabel:usageLabel(event.value)}};
  if(event.type==='warning')return{...state,warnings:[...state.warnings.slice(-(MAX_RENDER_WARNINGS-1)),tail(event.message,MAX_WARNING_CHARS)]};
  if(event.type==='run.cancelled')return{...state,...endTurn(state,'interrupted'),running:false,approval:null,streamingAssistant:null,reasoning:null,tools:closeRunningTools(state,'cancelled')};
  if(event.type==='run.failed')return{...state,...endTurn(state,'failed'),running:false,approval:null,streamingAssistant:null,reasoning:null,tools:closeRunningTools(state,'failed'),warnings:[...state.warnings.slice(-(MAX_RENDER_WARNINGS-1)),tail(event.message,MAX_WARNING_CHARS)]};
  if(event.type==='run.completed'){
    const finalized=state.streamingAssistant?finalizeStreaming(state,state.streamingAssistant.id):state;
    return{...finalized,...endTurn(state,'done'),running:false,approval:null,reasoning:null};
  }
  return state;
}

function usageLabel(value:unknown){if(!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;const prompt=numberValue(row.prompt_tokens??row.promptTokens??row.input_tokens??row.inputTokens);const completion=numberValue(row.completion_tokens??row.completionTokens??row.output_tokens??row.outputTokens);if(prompt===null&&completion===null)return null;return `${prompt??0}+${completion??0}`;}
function numberValue(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function objectValue(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function firstMeasuredNumber(...values:unknown[]):number|null{for(const value of values){const measured=numberValue(value);if(measured!==null)return measured;}return null;}
export type ReasoningUsageEvidence={reasoningTokens:number|null;reasoningCostUsd:number|null};
export function reasoningUsageEvidence(value:unknown):ReasoningUsageEvidence{
  const row=objectValue(value);if(!row)return{reasoningTokens:null,reasoningCostUsd:null};
  const completion=objectValue(row.completion_tokens_details??row.completionTokensDetails);
  const output=objectValue(row.output_tokens_details??row.outputTokensDetails);
  const reasoning=objectValue(row.reasoning);
  return{
    reasoningTokens:firstMeasuredNumber(row.reasoning_tokens,row.reasoningTokens,completion?.reasoning_tokens,completion?.reasoningTokens,output?.reasoning_tokens,output?.reasoningTokens,reasoning?.tokens),
    reasoningCostUsd:firstMeasuredNumber(row.reasoning_cost_usd,row.reasoningCostUsd,reasoning?.cost_usd,reasoning?.costUsd),
  };
}
export function reasoningUsageLabel(value:unknown):string{
  const evidence=reasoningUsageEvidence(value);
  if(evidence.reasoningTokens===null&&evidence.reasoningCostUsd===null)return t('screen.reasoning.notReported');
  const parts:string[]=[];
  parts.push(evidence.reasoningTokens===null?t('screen.reasoning.tokensNotReported'):tn('screen.reasoning.tokens',evidence.reasoningTokens));
  if(evidence.reasoningCostUsd!==null)parts.push(t('screen.reasoning.cost',{cost:evidence.reasoningCostUsd}));
  return parts.join(' · ');
}

// Temporary compatibility for the old composition root while Task 14 migrates it.
export const reduceCliEvent=reduceTuiEvent;

export function selectVisibleTranscript(s:TuiState,{rows}:{rows:number}){return s.transcript.items.slice(-Math.max(1,rows*3));}

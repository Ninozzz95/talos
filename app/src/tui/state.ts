import type {ToolLifecycleStatus,ToolOutcomeEvidence} from '../events/bridge.ts';
import type {TuiEvent} from './event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent,type TranscriptModel} from './transcript-model.ts';

const MAX_RENDER_MESSAGES=512;
const MAX_RENDER_TOOLS=256;
const MAX_RENDER_WARNINGS=128;
const MAX_MESSAGE_CHARS=256*1024;
const MAX_TOOL_SUMMARY_CHARS=8*1024;
const MAX_WARNING_CHARS=2048;
function tail(value:string,limit:number){if(value.length<=limit)return value;return `…[truncated in TUI]\n${value.slice(-(limit-22))}`;}

export type TuiMessage={id:string;role:'user'|'assistant';text:string};
export type TuiToolStatus='queued'|'approval'|'running'|'streaming'|ToolLifecycleStatus;
export type TuiToolRow={id:string;name:string;status:TuiToolStatus;argsText:string;liveOutput:string;finalOutput:string;startedAt:number|null;endedAt:number|null;outcome:ToolOutcomeEvidence|null};
export type TuiState={
  sessionId:string|null;
  running:boolean;
  messages:TuiMessage[];
  streamingAssistant:null|{id:string;text:string};
  reasoning:null|{id:string;text:string};
  tools:TuiToolRow[];
  approval:null|{requestId:string;label:string;detail:string;payload:Record<string,unknown>;toolCallId:string|null};
  usage:unknown;
  warnings:string[];
  transcript:TranscriptModel;
  status:{model:string;permissionMode:string;branch:string|null;contextLabel:string|null};
};

export function initialTuiState(x:{model:string;permissionMode:string}):TuiState{return{sessionId:null,running:false,messages:[],streamingAssistant:null,reasoning:null,tools:[],approval:null,usage:null,warnings:[],transcript:createTranscriptModel(),status:{model:x.model,permissionMode:x.permissionMode,branch:null,contextLabel:null}};}

function finalizeStreaming(state:TuiState,messageId:string):TuiState{
  const live=state.streamingAssistant;
  if(!live||live.id!==messageId)return state;
  const base=state.messages.length>=MAX_RENDER_MESSAGES?state.messages.slice(-(MAX_RENDER_MESSAGES-1)):state.messages;
  return{...state,streamingAssistant:null,messages:[...base,{id:live.id,role:'assistant',text:tail(live.text,MAX_MESSAGE_CHARS)}]};
}
function activeToolStatus(status:TuiToolStatus){return status==='queued'||status==='approval'||status==='running'||status==='streaming';}
function closeRunningTools(state:TuiState,status:'cancelled'|'failed'='cancelled'){return state.tools.map(row=>activeToolStatus(row.status)?{...row,status,endedAt:row.endedAt??Date.now()}:row);}

export function reduceTuiEvent(state:TuiState,event:TuiEvent):TuiState{
  state={...state,transcript:reduceTranscriptEvent(state.transcript,event)};
  if(event.type==='run.started')return{...state,sessionId:event.sessionId||state.sessionId,running:true};
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
    const p=event.payload;const label=String(p.tool??p.tipo??'Approval');const detail=String(p.command??p.comando??p.resource??p.percorso??p.path??'');const toolCallId=event.toolCallId??null;
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
  if(event.type==='run.cancelled')return{...state,running:false,approval:null,streamingAssistant:null,reasoning:null,tools:closeRunningTools(state,'cancelled')};
  if(event.type==='run.failed')return{...state,running:false,approval:null,streamingAssistant:null,reasoning:null,tools:closeRunningTools(state,'failed'),warnings:[...state.warnings.slice(-(MAX_RENDER_WARNINGS-1)),tail(event.message,MAX_WARNING_CHARS)]};
  if(event.type==='run.completed'){
    const finalized=state.streamingAssistant?finalizeStreaming(state,state.streamingAssistant.id):state;
    return{...finalized,running:false,approval:null,reasoning:null};
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
  if(evidence.reasoningTokens===null&&evidence.reasoningCostUsd===null)return'Reasoning usage not reported';
  const parts:string[]=[];
  parts.push(evidence.reasoningTokens===null?'reasoning tokens not reported':`${evidence.reasoningTokens} reasoning tokens`);
  if(evidence.reasoningCostUsd!==null)parts.push(`reasoning cost $${evidence.reasoningCostUsd}`);
  return parts.join(' · ');
}

// Temporary compatibility for the old composition root while Task 14 migrates it.
export const reduceCliEvent=reduceTuiEvent;

export function selectVisibleTranscript(s:TuiState,{rows}:{rows:number}){return s.transcript.items.slice(-Math.max(1,rows*3));}

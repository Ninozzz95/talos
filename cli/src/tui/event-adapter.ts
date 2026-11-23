import {deviceNameText} from '../remote/device-name.ts';
import type {ToolOutcomeEvidence} from '../events/bridge.ts';
import type {FileChange,ToolDecision,ToolDenial,ToolFacts,ToolIsolation,ToolOrigin} from './tool-facts.ts';
import {createRedactor} from '../diagnostics/redact.ts';
import {createV2EventBridge} from '../protocol/v2/events.ts';
import {describeError,describeKernelNotice,describeKernelRefusalReason,describeKernelToolText,errorViewLines} from '../i18n/error-view.ts';
import {t,type MessageId} from '../i18n/index.ts';
import {REFUSAL_VIA,looksItalian} from '../i18n/kernel-map.ts';
import {MCP_START_FAILED,mcpStartFailedWithoutReason} from '../runtime/provider-attempts.ts';
import {toolDisplay} from './tool-display.ts';
import type {TalosV2Error,TalosV2Event,TalosV2ToolResult} from '../protocol/v2/types.ts';
import type {DelegationResult} from '../protocol/v2/delegation.ts';
import {englishDelegationText} from '../i18n/delegation-text.ts';
import {textForScreen} from './data-boundary.ts';
import type {CardQuestion} from './question-card.ts';

type EventIdentity={eventId?:string};
/* F-Q1 (owner 03/10): a queued item as the screen sees it. A person's words are shown; a sub-agent's result only as its parsed
   fields (`result`); a dialogue message only as who sent it. */
/* 0.6.15 T5: `device` is the name of the device a person's message came from through remote control ('' when it has none) */
export type TuiKernelQueueItem={id:string;origin:'person'|'delegation'|'dialogue'|'background'|'workflow';text?:string;images?:number;childId?:string;device?:string;result?:{status:'completed'|'failed';task:string|null;summary?:string}};
export type TuiEvent=
 | ({type:'run.started';sessionId:string;runId?:string;prompt?:string;device?:string;history?:true;delegation?:DelegationResult[]}&EventIdentity)
 | ({type:'message.started';messageId:string;role:'user'|'assistant'}&EventIdentity)
 | ({type:'message.delta';messageId:string;delta:string}&EventIdentity)
 | ({type:'message.end';messageId:string}&EventIdentity)
 | ({type:'reasoning.started';messageId:string}&EventIdentity)
 | ({type:'reasoning.delta';messageId:string;delta:string}&EventIdentity)
 | ({type:'reasoning.end';messageId:string}&EventIdentity)
 | ({type:'reasoning.pulse';title:string|null}&EventIdentity)
 /* Long chats, tappa D: raised by the controller once a history replay is over, never by the kernel. The conversation keeps its last `turns` turns on the list; the older ones wait (transcript-model.ts `windowTranscript`). */
 | ({type:'history.window';turns:number}&EventIdentity)
 | ({type:'tool.started';toolCallId:string;toolName:string}&EventIdentity)
 | ({type:'tool.args';toolCallId:string;delta:string}&EventIdentity)
 | ({type:'tool.output';toolCallId:string;delta:string}&EventIdentity)
 | ({type:'tool.completed';toolCallId:string;content:string;outcome?:ToolOutcomeEvidence;result?:TalosV2ToolResult}&EventIdentity)
 /* R3 contract (tui/tool-facts.ts): produced by lane S+P, reduced by lane R+D. */
 | ({type:'tool.origin';toolCallId:string;origin:ToolOrigin}&EventIdentity)
 | ({type:'tool.decision';toolCallId:string;decision:ToolDecision}&EventIdentity)
 | ({type:'tool.facts';toolCallId:string;facts:ToolFacts}&EventIdentity)
 /* R5 CONTRACT (lane R produces, lane S renders): Q-R5-6 each provider attempt; Q-R5-4 a compaction is named; Q-R5-10 a
    long output kept in a private file; Q-R5-11 the read tool's cut. */
 | ({type:'provider.attempt';attempt:number;maxAttempts:number;status:number|null;retryAfterMs:number|null;waitMs:number|null;planLimit?:true;resumesAt?:number|null}&EventIdentity)
 | ({type:'context.summary.requested'}&EventIdentity)
 /* 0.6.13 (contract with the Desktop, 22/10/2026): the person's request that did not fit the model was kept as not sent (v2
    `request.not_sent`); the transcript marks that message, live and in a replay. `index` is the kernel's raw-history position. */
 | ({type:'request.not_sent';index:number|null}&EventIdentity)
 | ({type:'context.compaction.paused';noticeId:string|null;code:string;attempts:number|null;waitSeconds:number|null;retryAfter:string}&EventIdentity)
 /* ASYNC (owner 01/10): a delegated agent was created, changed what it does, or ended (v2 `agent.changed`). */
 | ({type:'agent.changed';childId:string;parentId:string|null;reason:'created'|'updated'|'completed';kind:string|null;status:string|null;task:string|null;tool:string|null;startedAt:string|null;interrupted:boolean;count:number|null;ended:boolean;prompt:string|null;endedAt:string|null;tokens:number|null;model:string|null;approvalsPending:number|null}&EventIdentity)
 | ({type:'context.compacted';engine:'kernel'|'context-engine';messagesSummarized:number|null;tokensBefore:number|null;tokensAfter:number|null;
    /* R5a lane R (optional addition): `manual` for /compact, `automatic` for the kernel's own; absent when not known. */
    trigger?:'automatic'|'manual';
    /* 0.6.13 review 9 F5 (additive): no summary, only older tool results shortened (`tool-results`) or, Z F1, only older images
       replaced with a placeholder (`images`); `imagesReplaced` counts those images */
    method?:'tool-results'|'images'|'without-model';imagesReplaced?:number;
    /* Z piece C: why the summary was written without the model (provider-attempts.ts CompactionFallbackReason) */
    fallbackReason?:string;
    /* review 10 R10-9: started by the provider's «too long», not by the automatic threshold */
    afterRefusal?:true;
    /* 0.6.14: the kernel compacted at its emergency line, not at the normal one */
    emergency?:true;
    /* judge v1541, v1597: the emergency line as the kernel wrote it; absent when it wrote none */
    emergencyThreshold?:number;
    /* judge v1597: the kernel's rows do not say why it compacted */
    causeUnknown?:true;
    /* the kernel record's identity, for a later annulment */
    at?:string;
    /* review 14 R14-1 of 0.6.13 (screen only): counted by the run's result and named by no event, so nothing is known about it */
    factsUnknown?:true}&EventIdentity)
 /* 0.6.13 (kernel a2739656d): the compaction named with this `at` was annulled because its turn failed */
 | ({type:'context.compaction.undone';at:string}&EventIdentity)
 | ({type:'tool.output.saved';toolCallId:string;path:string;keptChars:number;totalChars:number}&EventIdentity)
 | ({type:'tool.read.cut';toolCallId:string;shownLines:number;totalLines:number|null;limitChars:number}&EventIdentity)
 | ({type:'file.changed';change:FileChange}&EventIdentity)
 | ({type:'file.changed';data:Record<string,unknown>}&EventIdentity)
 | ({type:'approval.required';requestId:string;payload:Record<string,unknown>;toolCallId?:string}&EventIdentity)
 | ({type:'approval.resolved';requestId:string;approved?:boolean}&EventIdentity)
 /* Stage 3 (owner 01-02/10): the model asks the person (v2 `question.required`, the kernel contract's questions) and how the
    questions closed (`question.resolved`: answered, skipped, cancelled, expired, unanswerable; who and why). */
 | ({type:'question.required';requestId:string;questions:CardQuestion[];toolCallId?:string;origin?:{mode?:string;agent?:string}}&EventIdentity)
 /* Stage 3 (owner 02/10): the model proposes a plan (v2 `plan.required`) and how it closed (`plan.resolved`). */
 | ({type:'plan.required';requestId:string;hash:string;content:string;revision?:number;toolCallId?:string;restorable?:boolean}&EventIdentity)
 /* Stage 3, pezzo 13c: the kernel changed the mode by itself; the screen follows (ACP current_mode_update). */
 /* Stage 3 (owner 02/10): a parent↔child question and its close. */
 /* Stage 3: an MCP server asks the person (form or url) and how it closed. */
 | ({type:'elicitation.required';requestId:string;server:string;mode:'form'|'url';message:string;requestedSchema?:Record<string,unknown>;url?:string;domain?:string;elicitationId?:string}&EventIdentity)
 | ({type:'elicitation.resolved';requestId:string;action:string;by?:string;reason?:string}&EventIdentity)
 | ({type:'agent.dialogue';requestId:string;childId:string;direction:'child-to-parent'|'parent-to-child';status:'requested'|'answered'|'cancelled';question:string;answer?:string;reason?:string}&EventIdentity)
 | ({type:'session.mode.changed';mode:string;reason?:string;version?:number}&EventIdentity)
 /* Owner 27/10/2026: the session's whole settings, changed here or from a paired device; `version` only grows */
 | ({type:'session.settings.changed';version:number;reason:string;model:string|null;reasoningEffort:string|null;mode?:string;name:string|null;
     origin:{kind:'computer'}|{kind:'model'}|{kind:'device';deviceId:string}}&EventIdentity)
 /* F-Q1 (owner 03/10): the kernel's queue changed, and one queued item entered the conversation. */
 | ({type:'queue.changed';items:TuiKernelQueueItem[];paused:boolean}&EventIdentity)
 | ({type:'queue.delivered'}&TuiKernelQueueItem&EventIdentity)
 | ({type:'plan.resolved';requestId:string;status:string;decision?:string;feedback?:string;newSessionId?:string;by?:string;reason?:string}&EventIdentity)
 | ({type:'question.resolved';requestId:string;status:string;answers?:Record<string,string|string[]>;skipped?:string[];notes?:Record<string,string>;by?:string;reason?:string}&EventIdentity)
 | ({type:'usage.updated';value:unknown}&EventIdentity)
 | ({type:'warning';message:string;raw?:string}&EventIdentity)
 | ({type:'session.snapshot';data:Record<string,unknown>}&EventIdentity)
 | ({type:'run.completed';runId?:string}&EventIdentity)
 | ({type:'run.failed';message:string;error?:TalosV2Error;runId?:string}&EventIdentity)
 | ({type:'run.cancelled';runId?:string;reason?:string;interrupted?:true}&EventIdentity);

function objectValue(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function queueItemOf(raw:unknown):TuiKernelQueueItem|null{
  const row=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;if(!row)return null;
  const origin=row.origin==='delegation'||row.origin==='dialogue'||row.origin==='background'||row.origin==='workflow'?row.origin:'person';
  const id=typeof row.id==='string'?row.id:'';const text=typeof row.text==='string'?row.text:undefined;
  if(origin==='person'&&!text)return null;
  const childId=typeof row.childId==='string'&&row.childId?row.childId:undefined;
  const r=row.result&&typeof row.result==='object'?row.result as Record<string,unknown>:null;
  /* 0.6.8 L3-17: a finished agent is called by its name, its task when it has none */
  const result=r?{status:r.status==='failed'?'failed' as const:'completed' as const,task:typeof r.name==='string'&&r.name?r.name:typeof r.task==='string'?r.task:null,...(typeof r.summary==='string'?{summary:r.summary}:{})}:undefined;
  const device=origin==='person'?deviceOf(row.bubble):undefined;
  return{id,origin,...(text!==undefined&&origin==='person'?{text}:{}),...(device!==undefined?{device}:{}),...(Number.isSafeInteger(row.images)&&Number(row.images)>0?{images:Number(row.images)}:{}),...(childId?{childId}:{}),...(result?{result}:{})};
}
/** 0.6.15 T5: the device a message came from (v2 `bubble.origin`, Italian `bolla.origine` too): its name, '' unnamed, else none. */
export function deviceOf(bubble:unknown):string|undefined{
  const row=objectValue(bubble);const origin=objectValue(row?.origin??row?.origine);
  if(!origin||(origin.kind!=='device'&&origin.tipo!=='telefono'))return undefined;
  const name=typeof origin.name==='string'?origin.name:typeof origin.nome==='string'?origin.nome:'';
  /* review 6 C4 / block 10 E-R2: the one filter for a device's name (remote/device-name.ts) */
  return deviceNameText(name);
}
function stringValue(value:unknown):string|undefined{
  return typeof value==='string'&&value.length>0?value:undefined;
}
function booleanValue(value:unknown):boolean|undefined{
  return typeof value==='boolean'?value:undefined;
}
function isCanonicalEvent(value:unknown):value is TalosV2Event{
  if(!value||typeof value!=='object')return false;
  const row=value as Partial<TalosV2Event>;
  return row.schema==='talos.cli.event.v2'&&row.version===2&&typeof row.sessionId==='string'
    &&typeof row.eventId==='string'&&typeof row.type==='string'&&Boolean(row.data&&typeof row.data==='object');
}
function asToolResult(data:Record<string,unknown>):TalosV2ToolResult|null{
  const receipt=objectValue(data.receipt);
  const status=data.status;
  if(typeof data.toolCallId!=='string'||typeof data.content!=='string'||typeof status!=='string'||!receipt)return null;
  return data as unknown as TalosV2ToolResult;
}
function compactToolOutcome(result:TalosV2ToolResult):ToolOutcomeEvidence|undefined{
  const structured=result.status!=='completed'||result.receipt.status!==null||result.receipt.allowed!==null
    ||result.receipt.via!==null||result.receipt.reason!==null||result.receipt.risk!==null||result.enforcement!==null;
  if(!structured)return undefined;
  return{
    toolCallId:result.toolCallId,
    /* the row of a tool lost in a dropped connection is a failed one, in the kernel's words; v2 says interrupted */
    status:result.status==='interrupted'?'failed':result.status,
    content:result.content,
    receiptStatus:result.receipt.status,
    exitCode:result.enforcement?.exitCode??null,
    enforcement:result.enforcement?.sandbox??null,
    allowed:result.receipt.allowed,
    permissionVia:result.receipt.via,
    permissionReason:result.receipt.reason,
    risk:result.receipt.risk,
  };
}
function canonicalError(data:Record<string,unknown>):TalosV2Error|undefined{
  const row=objectValue(data.error);
  const envelope=objectValue(row?.envelope);
  return row&&typeof row.message==='string'&&envelope?row as unknown as TalosV2Error:undefined;
}
function identity(event:TalosV2Event):EventIdentity{return{eventId:event.eventId};}
/*
 * R1 lane R (D-04, gate E9): the kernel records the person's prompt ONLY as `RunStarted.input.consegna` (measured through the
 * real composition, r1-resume-history.test.ts); no `TextMessageStart role:user` exists, so a replay rebuilt no user message.
 * The prompt is shown as it was typed: the project-reference blocks `renderPromptWithAttachments` appends
 * (runtime/attachments.ts:65-70) are cut, the `@path` the person wrote stays. The local runtime passes chat messages instead.
 */
const REFERENCE_BLOCKS='\n\n[TALOS project reference: ',REFERENCE_END='[End TALOS project reference]';
function typedPrompt(value:string){const cut=value.indexOf(REFERENCE_BLOCKS);return cut>=0&&value.endsWith(REFERENCE_END)?value.slice(0,cut):value;}
function messageText(content:unknown){
  if(typeof content==='string')return content;
  if(!Array.isArray(content))return undefined;
  const parts=content.map(part=>objectValue(part)).filter(part=>part?.type==='text'&&typeof part.text==='string').map(part=>String(part!.text));
  return parts.length?parts.join('\n'):undefined;
}
/** ASYNC step 2: the parsed results of a woken turn (v2 `input.origin: 'delegation'`), or null for any other turn. */
function delegationOf(input:unknown):DelegationResult[]|null{
  const row=input&&typeof input==='object'?input as Record<string,unknown>:null;
  if(row?.origin!=='delegation'||!Array.isArray(row.delegationResults))return null;
  const results=row.delegationResults.filter((entry:any):entry is DelegationResult=>typeof entry?.childId==='string'&&(entry.status==='completed'||entry.status==='failed')&&typeof entry.summary==='string'&&(entry.task===null||typeof entry.task==='string'));
  /* 0.6.8 L3-17: each result is called by its agent's name, its task when it has none */
  return results.length?results.map(entry=>typeof entry.name==='string'&&entry.name?{...entry,task:entry.name}:entry):null;
}
export function runPrompt(input:unknown):string|undefined{
  if(Array.isArray(input)){for(let i=input.length-1;i>=0;i--){const row=objectValue(input[i]);if(row?.role==='user')return stringValue(messageText(row.content));}return undefined;}
  /* R2 lane J (E11): protocol v2 renames `consegna` to `prompt`; the TUI reads both. */
  const text=stringValue(objectValue(input)?.prompt)??stringValue(objectValue(input)?.consegna);
  return text===undefined?undefined:stringValue(typedPrompt(text));
}
function role(value:unknown):'user'|'assistant'{return value==='user'?'user':'assistant';}
function countOrNull(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;}
/* R5a lane R (S10): a kernel tool id in the screen's words, for the English refusal reasons. */
const toolLabel=(id:string)=>{try{return toolDisplay(id).label;}catch{return id;}};
/** The screen's copy of a tool result: the kernel's Italian refusal reason in English (display only; v2 keeps the kernel's). */
function displayReceipt(result:TalosV2ToolResult):TalosV2ToolResult{
  const reason=result.receipt.reason;if(!reason)return result;
  const english=describeKernelRefusalReason(reason,{toolLabel});
  return english&&english!==reason?{...result,receipt:{...result.receipt,reason:english}}:result;
}

function projectCanonical(event:TalosV2Event):TuiEvent|null{
  const id=identity(event);
  const data=event.data;
  switch(event.type){
    case 'run.started':{
      const runId=stringValue(data.runId);
      /* ASYNC step 2: a turn that hands the parent its agents' results draws agent rows, not the person's prompt */
      const delegation=delegationOf(data.input);
      const prompt=delegation?null:runPrompt(data.input);
      const device=prompt?deviceOf(objectValue(data.input)?.bubble):undefined;
      return{type:'run.started',sessionId:event.sessionId,...(runId?{runId}:{}),...(prompt?{prompt}:{}),...(device!==undefined?{device}:{}),...(delegation?{delegation}:{}),...id};
    }
    case 'message.started':
      return{type:'message.started',messageId:String(data.messageId??'assistant'),role:role(data.role),...id};
    case 'message.delta':{
      /* R2 lane E (gate E4): a kernel notice arrives as one whole assistant message (no code); only its exact template is
         replaced, so the model's own words are never touched. */
      const delta=String(data.delta??'');
      return{type:'message.delta',messageId:String(data.messageId??'assistant'),delta:describeKernelNotice(delta)??delta,...id};
    }
    case 'message.completed':
      return{type:'message.end',messageId:String(data.messageId??'assistant'),...id};
    case 'reasoning.started':
      return{type:'reasoning.started',messageId:String(data.messageId??'reasoning'),...id};
    case 'reasoning.delta':
      return{type:'reasoning.delta',messageId:String(data.messageId??'reasoning'),delta:String(data.delta??''),...id};
    case 'reasoning.completed':
      return{type:'reasoning.end',messageId:String(data.messageId??'reasoning'),...id};
    case 'reasoning.pulse':
      return{type:'reasoning.pulse',title:typeof data.title==='string'&&data.title?data.title:null,...id};
    case 'tool.started':
      return{type:'tool.started',toolCallId:String(data.toolCallId??''),toolName:String(data.toolName??'tool'),...id};
    case 'tool.args':
      return{type:'tool.args',toolCallId:String(data.toolCallId??''),delta:String(data.delta??''),...id};
    case 'tool.output':
      return{type:'tool.output',toolCallId:String(data.toolCallId??''),delta:String(data.delta??''),...id};
    case 'tool.completed':{
      const canonical=asToolResult(data);
      if(!canonical)return null;
      /* R3 Q-R3-8 (R3-INT): the kernel's stop sentences in English, on the display copy only; a tool the person stopped is
         `cancelled` (shown as interrupted), never `failed`. The canonical v2 result is untouched. */
      /* Kernel merge (F-027): the data boundary the kernel puts around a result is for the model; the screen shows the content */
      const stop=describeKernelToolText(textForScreen(canonical.content));
      /* ASYNC step 2: the kernel's delegation sentences (start, refusal) in English, on the display copy only */
      const shown={...stop,text:englishDelegationText(stop.text)??stop.text};
      const result=displayReceipt(shown.text===canonical.content&&!shown.stopped?canonical:{...canonical,content:shown.text,...(shown.stopped?{status:'cancelled' as const}:{})});
      const outcome=compactToolOutcome(result);
      return{
        type:'tool.completed',toolCallId:result.toolCallId,content:result.content,result,
        ...(outcome?{outcome}:{}),...id
      };
    }
    case 'file.changed':
      return{type:'file.changed',data:{...data},...id};
    case 'approval.required':{
      const payload=objectValue(data.azione??data.action)??{};
      const toolCallId=stringValue(payload.toolCallId);
      return{
        type:'approval.required',
        requestId:String(data.requestId??''),
        payload:{...payload},
        ...(toolCallId?{toolCallId}:{}),
        ...id
      };
    }
    case 'approval.resolved':{
      const approved=booleanValue(data.approvato)??booleanValue(data.approved);
      return{type:'approval.resolved',requestId:String(data.requestId??''),...(approved!==undefined?{approved}:{}),...id};
    }
    case 'question.required':{
      const toolCallId=stringValue(data.toolCallId);const origin=objectValue(data.origin);
      return{type:'question.required',requestId:String(data.requestId??''),questions:Array.isArray(data.questions)?data.questions as CardQuestion[]:[],
        ...(toolCallId?{toolCallId}:{}),...(origin?{origin:{...(stringValue(origin.mode)?{mode:String(origin.mode)}:{}),...(stringValue(origin.agent)?{agent:String(origin.agent)}:{})}}:{}),...id};
    }
    case 'plan.required':{
      const toolCallId=stringValue(data.toolCallId);
      return{type:'plan.required',requestId:String(data.requestId??''),hash:String(data.hash??''),content:String(data.content??''),
        ...(Number.isSafeInteger(data.revision)?{revision:data.revision as number}:{}),...(toolCallId?{toolCallId}:{}),
        ...(typeof data.restorable==='boolean'?{restorable:data.restorable}:{}),...id};
    }
    case 'elicitation.required':{
      const schema=objectValue(data.requestedSchema),url=stringValue(data.url),domain=stringValue(data.domain),elicitationId=stringValue(data.elicitationId);
      return{type:'elicitation.required',requestId:String(data.requestId??''),server:String(data.server??'mcp'),mode:data.mode==='url'?'url':'form',message:String(data.message??''),
        ...(schema?{requestedSchema:schema}:{}),...(url?{url}:{}),...(domain?{domain}:{}),...(elicitationId?{elicitationId}:{}),...id};
    }
    case 'elicitation.resolved':{
      const by=stringValue(data.by),reason=stringValue(data.reason);
      return{type:'elicitation.resolved',requestId:String(data.requestId??''),action:String(data.action??''),...(by?{by}:{}),...(reason?{reason}:{}),...id};
    }
    case 'queue.changed':{
      const items=Array.isArray(data.items)?data.items.map(queueItemOf).filter((row:TuiKernelQueueItem|null):row is TuiKernelQueueItem=>row!==null):[];
      return{type:'queue.changed',items,paused:data.paused===true&&items.length>0,...id};
    }
    case 'queue.delivered':{const item=queueItemOf(data);return item?{type:'queue.delivered',...item,...id}:null;}
    case 'agent.dialogue':{
      const answer=stringValue(data.answer),reason=stringValue(data.reason);
      return{type:'agent.dialogue',requestId:String(data.requestId??''),childId:String(data.childId??''),direction:data.direction==='parent-to-child'?'parent-to-child':'child-to-parent',
        status:data.status==='answered'?'answered':data.status==='cancelled'?'cancelled':'requested',question:String(data.question??''),...(answer?{answer}:{}),...(reason?{reason}:{}),...id};
    }
    case 'session.mode.changed':{
      const mode=stringValue(data.mode);const reason=stringValue(data.reason);
      const version=Number.isSafeInteger(data.version)?data.version as number:undefined;
      return mode?{type:'session.mode.changed',mode,...(reason?{reason}:{}),...(version!==undefined?{version}:{}),...id}:null;
    }
    case 'session.settings.changed':{
      if(!Number.isSafeInteger(data.version))return null;
      const text=(key:string)=>stringValue(data[key])??null;const mode=stringValue(data.mode);const origin=objectValue(data.origin);
      const deviceId=origin?.kind==='device'?stringValue(origin.deviceId):undefined;
      return{type:'session.settings.changed',version:data.version as number,reason:text('reason')??'settings',model:text('model'),reasoningEffort:text('reasoningEffort'),
        ...(mode?{mode}:{}),name:text('name'),origin:deviceId?{kind:'device',deviceId}:origin?.kind==='model'?{kind:'model'}:{kind:'computer'},...id};
    }
    case 'plan.resolved':{
      const pick=(key:string)=>{const value=stringValue(data[key]);return value?{[key]:value}:{};};
      return{type:'plan.resolved',requestId:String(data.requestId??''),status:String(data.status??''),...pick('decision'),...pick('feedback'),...pick('newSessionId'),...pick('by'),...pick('reason'),...id};
    }
    case 'question.resolved':{
      const answers=objectValue(data.answers),notes=objectValue(data.notes),by=stringValue(data.by),reason=stringValue(data.reason);
      return{type:'question.resolved',requestId:String(data.requestId??''),status:String(data.status??''),
        ...(answers?{answers:answers as Record<string,string|string[]>}:{}),...(Array.isArray(data.skipped)?{skipped:data.skipped.map(String)}:{}),
        ...(notes?{notes:notes as Record<string,string>}:{}),...(by?{by}:{}),...(reason?{reason}:{}),...id};
    }
    case 'usage.updated':{
      /* R5a lane R (S1): the last request's own usage and the run's declared cost ride inside the value (additive keys), so the
         state keeps one usage object and `usageSnapshot` reads them there. */
      const value=objectValue(data.value);const lastRequest=objectValue(data.lastRequest);const declared=countOrNull(data.declaredCostUsd)===null?null:Number(data.declaredCostUsd);
      if(!value||(!lastRequest&&declared===null))return{type:'usage.updated',value:data.value,...id};
      return{type:'usage.updated',value:{...value,...(lastRequest?{lastRequest:{...lastRequest}}:{}),...(declared!==null?{declaredCostUsd:declared}:{})},...id};
    }
    case 'provider.attempt':{
      const attempt=countOrNull(data.attempt),maxAttempts=countOrNull(data.maxAttempts);
      if(attempt===null||maxAttempts===null)return null;
      return{type:'provider.attempt',attempt,maxAttempts,status:countOrNull(data.status),retryAfterMs:countOrNull(data.retryAfterMs),waitMs:countOrNull(data.waitMs),...(data.planLimit===true?{planLimit:true as const,resumesAt:countOrNull(data.resumesAt)}:{}),...id};
    }
    case 'context.summary.requested':return{type:'context.summary.requested',...id};
    case 'request.not_sent':return{type:'request.not_sent',index:countOrNull(data.index),...id};
    case 'agent.changed':{
      const childId=typeof data.childId==='string'?data.childId:'';if(!childId)return null;
      const text=(value:unknown)=>typeof value==='string'&&value?value:null;
      const whole=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0?value:null;
      const reason=data.reason==='created'||data.reason==='completed'?data.reason:'updated';
      return{type:'agent.changed',childId,parentId:text(data.parentId),reason,kind:text(data.kind),status:text(data.status),/* 0.6.8 L3-17: the agent is called by its name, its task when it has none */task:text(data.name)??text(data.task),tool:text(data.tool),startedAt:text(data.startedAt),interrupted:data.interrupted===true,count:typeof data.count==='number'&&Number.isInteger(data.count)&&data.count>=0?data.count:null,ended:data.ended===true,
        prompt:text(data.prompt),endedAt:text(data.endedAt),tokens:whole(data.tokens),model:text(data.model),approvalsPending:whole(data.approvalsPending),...id};
    }
    case 'context.compaction.paused':{
      const code=typeof data.code==='string'?data.code:'',retryAfter=typeof data.retryAfter==='string'?data.retryAfter:'';
      if(!code||!Number.isFinite(Date.parse(retryAfter)))return null;
      return{type:'context.compaction.paused',noticeId:typeof data.noticeId==='string'?data.noticeId:null,code,attempts:countOrNull(data.attempts),waitSeconds:countOrNull(data.waitSeconds),retryAfter,...id};
    }
    case 'context.compaction.undone':return typeof data.at==='string'&&data.at?{type:'context.compaction.undone',at:data.at,...id}:null;
    case 'context.compacted':{
      const trigger=data.trigger==='manual'||data.trigger==='automatic'?data.trigger:null;
      return{type:'context.compacted',engine:data.engine==='context-engine'?'context-engine':'kernel',messagesSummarized:countOrNull(data.messagesSummarized),
        tokensBefore:countOrNull(data.tokensBefore),tokensAfter:countOrNull(data.tokensAfter),...(trigger?{trigger}:{}),...(data.method==='tool-results'||data.method==='images'||data.method==='without-model'?{method:data.method}:{}),...(typeof data.fallbackReason==='string'&&/^[a-z]{1,16}$/u.test(data.fallbackReason)?{fallbackReason:data.fallbackReason}:{}),...(data.afterRefusal===true?{afterRefusal:true as const}:{}),...(data.emergency===true?{emergency:true as const,...(countOrNull(data.emergencyThreshold)?{emergencyThreshold:countOrNull(data.emergencyThreshold)!}:{})}:{}),...(data.causeUnknown===true&&data.emergency!==true&&data.afterRefusal!==true?{causeUnknown:true as const}:{}),...(typeof data.at==='string'&&data.at?{at:data.at}:{}),...(countOrNull(data.imagesReplaced)?{imagesReplaced:countOrNull(data.imagesReplaced)!}:{}),...id};
    }
    case 'warning':{
      /* R2 lane E (Q-R2-2): a kernel notice has no code (`onAvviso`, RuntimeFallback): Italian text is replaced by one English
         sentence and kept as `raw` for the expanded view and the log; the CLI's own English notices pass unchanged. */
      const message=String(data.message??'warning');
      /* 0.6.9 (the bugfixer's review, N2): an MCP server that did not start keeps its name and its check command on the screen;
         only a reason that is not English is left out (kept as `raw`). A server named `codice` or `sessione` is not Italian text. */
      if(data.code===MCP_START_FAILED&&typeof data.serverId==='string'){
        const reason=typeof data.reason==='string'?data.reason:'';
        return reason&&looksItalian(reason)?{type:'warning',message:mcpStartFailedWithoutReason(data.serverId),raw:message,...id}:{type:'warning',message,...id};
      }
      return looksItalian(message)?{type:'warning',message:t('error.warning.untranslated'),raw:message,...id}:{type:'warning',message,...id};
    }
    case 'session.snapshot':
      return{type:'session.snapshot',data:{...data},...id};
    case 'run.completed':{
      const runId=stringValue(data.runId);
      return{type:'run.completed',...(runId?{runId}:{}),...id};
    }
    case 'run.failed':{
      const error=canonicalError(data);
      const runId=stringValue(data.runId);
      /* R2 lane E (gate E4, Q-R2-4): the message is the English three-part view of the CODE; the kernel's text rides along
         only inside `error` (the transcript keeps it as the row's raw detail). */
      const view=describeError(error??{message:String(data.message??'run failed'),code:data.code},{screen:true});
      return{
        type:'run.failed',
        message:errorViewLines(view).join('\n'),
        ...(error?{error}:{}),
        ...(runId?{runId}:{}),
        ...id
      };
    }
    case 'run.cancelled':{
      const runId=stringValue(data.runId);
      const reason=stringValue(data.reason);
      return{type:'run.cancelled',...(runId?{runId}:{}),...(reason?{reason}:{}),...id};
    }
    default:
      return null;
  }
}

/*
 * R3 gate E3 (Q-R3-1/2): the facts of a finished tool, from structured fields only: the receipt's exit code, the kernel's
 * measured `durataMs` (v2 `details.durationMs`, talosHarness.mjs:8661), and the isolation named by the glyph the CLI's own
 * executor puts first in its annotation (`EXECUTION_TEXT.isolation`: ⛉ sandbox, ⛶ host). An absent fact stays absent: a
 * zero would say "instant" or "exit 0" where the truth is unknown (agui-events.mjs OSS-1).
 */
const SANDBOX_GLYPH='⛉',HOST_GLYPH='⛶';
export function isolationOf(enforcement:unknown):ToolIsolation|null{
  if(typeof enforcement!=='string')return null;
  const head=enforcement.trimStart();
  return head.startsWith(SANDBOX_GLYPH)?'sandbox':head.startsWith(HOST_GLYPH)?'host':null;
}
function toolFacts(result:TalosV2ToolResult,noted:ToolDenial|null=null):ToolFacts|null{
  const exitCode=result.enforcement?.exitCode,durationMs=objectValue(result.details)?.durationMs,isolation=isolationOf(result.enforcement?.sandbox);
  const denial=noted??kernelDenial(result);
  const facts:ToolFacts={
    ...(typeof exitCode==='number'&&Number.isInteger(exitCode)?{exitCode}:{}),
    ...(typeof durationMs==='number'&&Number.isFinite(durationMs)&&durationMs>=0?{durationMs:Math.round(durationMs)}:{}),
    ...(isolation?{isolation}:{}),
    ...(denial?{denial}:{}),
    ...(result.duplicate===true?{duplicate:true}:{}),
  };
  return Object.keys(facts).length?facts:null;
}
/*
 * R5a lane R (S10, gate finding 15). Why a refused tool did not run, from the receipt alone, only when the receipt can say
 * it: the session's own level (read-only, research, workspace writes, a tool turned off) is `mode`; the kernel's floors (a
 * command that cannot be undone, the checkpoint guard) are `policy`. An "asked" via is NOT decided here: the kernel writes
 * the same via and the same sentence whether the person said no or the permission engine answered alone (finding 15), so
 * only the session controller, which asked, can say which (`noteDenial`). A stop is not a denial.
 */
const MODE_VIAS=new Set(['toolOff','readOnly','research','workspaceWrite']);const POLICY_VIAS=new Set(['noRecovery','checkpoint']);
/* K1 (Desktop 6d9cf7be1): the kernel's EARLY refusals, before the permission gate. Their `motivo` is the model's long sentence
   («REFUSED. Nothing was written: …»), so the row says the CLI's own short reason; a network path the person refused is the person's no. */
const EARLY_REASONS:Readonly<Record<string,MessageId>>={blockedFolder:'tool.denied.reason.blockedFolder',ntPath:'tool.denied.reason.ntPath',
  networkUnconfirmed:'tool.denied.reason.networkUnconfirmed',hostCredential:'tool.denied.reason.hostCredential',
  unknownMode:'tool.denied.reason.unknownMode',textOverBinary:'tool.denied.reason.textOverBinary',unreadOverwrite:'tool.denied.reason.unreadOverwrite'};
function kernelDenial(result:TalosV2ToolResult):ToolDenial|null{
  if(result.receipt.allowed!==false&&result.receipt.status!=='denied')return null;
  const key=result.receipt.via?REFUSAL_VIA[result.receipt.via]:undefined;
  if(key==='networkDenied')return{by:'person'};
  if(key&&Object.hasOwn(EARLY_REASONS,key))return{by:'policy',reason:t(EARLY_REASONS[key]!)};
  if(!key||(!MODE_VIAS.has(key)&&!POLICY_VIAS.has(key)))return null;
  const english=result.receipt.reason?describeKernelRefusalReason(result.receipt.reason,{toolLabel}):null;
  const reason=english??(result.receipt.reason&&!looksItalian(result.receipt.reason)?result.receipt.reason:null);
  return{by:MODE_VIAS.has(key)?'mode':'policy',...(reason?{reason}:{})};
}
/**
 * R5a lane R (S10): the denial fact for a decision the permission engine made ALONE (`ApprovalDecision` deny,
 * security/permission-engine.ts:36-44), in English. A matched deny rule is `rule` with its text (`explain.rule`, e.g. the
 * rule `simulatePermission` names) and scope; a command the policy cannot split (`unsupported shell composition`,
 * security/evaluate.ts:134-140) or a path outside the project is `policy`; plan mode, a mode that never asks and the automatic
 * classifier are `mode`. The person's own "no" is `{by:'person'}`, and nothing else is.
 */
export function denialFromEngine(decision:{code:string;message:string},explain:{rule?:()=>string|null;scope?:(rule:string)=>string|null}={}):ToolDenial{
  const code=String(decision?.code??'');const message=String(decision?.message??'');
  const because=(id:MessageId):ToolDenial=>({by:code==='PATH_NOT_ALLOWED'||id==='error.denial.reason.unsupportedShell'||id==='error.denial.reason.pathOutside'?'policy':'mode',reason:t(id)});
  if(code==='PLAN_MODE_READ_ONLY')return because('error.denial.reason.planMode');
  if(code==='PERMISSION_REQUIRED')return because('error.denial.reason.noAsking');
  if(code==='NETWORK_PATH_NEEDS_PERSON')return because('error.denial.reason.networkPath');
  if(code==='PERMISSION_AUTO_DENIED')return because('error.denial.reason.autoDenied');
  if(code==='PATH_NOT_ALLOWED')return because('error.denial.reason.pathOutside');
  if(/(?:^|: )matched deny rule$/u.test(message)){
    let rule:string|null=null;try{rule=explain.rule?.()??null;}catch{rule=null;}
    let scope:string|null=null;try{scope=rule?explain.scope?.(rule)??null:null;}catch{scope=null;}
    return{by:'rule',...(rule?{rule}:{}),...(scope?{scope}:{})};
  }
  if(/unsupported shell composition$/u.test(message))return because('error.denial.reason.unsupportedShell');
  if(/write path is outside the authorized project$/u.test(message))return because('error.denial.reason.pathOutside');
  return{by:'policy',...(message&&!looksItalian(message)?{reason:message}:{})};
}
/*
 * R3 gate E10 (Q-R3-4): a file the kernel wrote arrives as `StateDelta` rows `/file/<path>` with the text after and, for a
 * file that existed, the text before (`prima`) (agui-events.mjs:427-436); the v2 bridge keeps only `/usage`, so the TUI
 * reads the rows here, through the same redactor as every v2 string. A replaced file whose before is unknown is skipped
 * (it must not look new); texts over MAX_FILE_CHANGE_CHARS are skipped (the diff of a huge file is not a screen). The change
 * belongs to the open tool call whose arguments name the same path, or else to the only open call.
 */
const MAX_FILE_CHANGE_CHARS=1_000_000,MAX_OPEN_ARGS_CHARS=65_536;
function samePath(value:string){return value.replace(/\\/gu,'/').replace(/^\.\//u,'');}
function argsPath(args:string):string|null{
  try{const parsed=objectValue(JSON.parse(args));const value=parsed?.percorso??parsed?.path??parsed?.file_path;return typeof value==='string'&&value?samePath(value):null;}catch{return null;}
}

export function createTuiEventAdapter(secretValues:readonly string[]=[]){
  let currentSessionId:string|null=null;
  let bridge:ReturnType<typeof createV2EventBridge>|null=null;
  const redactor=createRedactor(secretValues);
  const openTools=new Map<string,string>();
  /* R5a lane R (S10): the denial facts the session controller noted, by tool call, until the tool's result arrives. */
  const noted=new Map<string,ToolDenial>();
  /* R5a lane R (S3): the kernel compactions seen live in this run (the fetch observer's event). */
  let liveKernelCompactions=0;
  /* Review 15 R15-1 of 0.6.13: `fresh` (a history attach, the screen redrawn from the start) drops the bridge even for the same id,
     so the journal rows it had named are named again and the brake is said again where it happened; the denials still waiting
     for a result of the same session stay. */
  function bindSession(sessionId:string,{fresh=false}:{fresh?:boolean}={}){
    if(typeof sessionId!=='string'||sessionId.length===0)throw new Error('SESSION_ID_REQUIRED');
    if(sessionId===currentSessionId&&bridge&&!fresh)return;
    if(sessionId!==currentSessionId)noted.clear();
    currentSessionId=sessionId;openTools.clear();liveKernelCompactions=0;
    bridge=createV2EventBridge(sessionId,undefined,secretValues);
  }
  function canonicalOf(raw:unknown):TalosV2Event|null{
    if(isCanonicalEvent(raw))return raw;
    if(!raw||typeof raw!=='object'||!bridge)return null;
    return bridge.translate(raw);
  }
  function translate(raw:unknown):TuiEvent|null{
    const canonical=canonicalOf(raw);
    return canonical?projectCanonical(canonical):null;
  }
  /**
   * R5a lane R (S10): the session controller tells the adapter who refused a tool BEFORE its result arrives — the person
   * (`{by:'person'}`, only after asking) or the engine alone (`denialFromEngine`). The next `tool.facts` of that call carries it.
   */
  function noteDenial(toolCallId:string,denial:ToolDenial|null){
    if(typeof toolCallId!=='string'||!toolCallId||!denial)return;
    noted.set(toolCallId,denial);if(noted.size>256)noted.delete(noted.keys().next().value!);
  }
  function fileChanges(raw:Record<string,unknown>):TuiEvent[]{
    if(raw.type!=='StateDelta'||!Array.isArray(raw.delta))return[];
    const out:TuiEvent[]=[];
    for(const entry of raw.delta){
      const row=objectValue(entry);const where=stringValue(row?.path);
      if(!row||!where?.startsWith('/file/')||typeof row.value!=='string'||(row.op!=='add'&&row.op!=='replace'))continue;
      const before=row.op==='add'?null:typeof row.prima==='string'?row.prima:undefined;
      if(before===undefined||row.value.length>MAX_FILE_CHANGE_CHARS||(before?.length??0)>MAX_FILE_CHANGE_CHARS)continue;
      const path=where.slice('/file/'.length);
      const owners=[...openTools].filter(([,args])=>argsPath(args)===samePath(path)).map(([id])=>id);
      /* The call whose arguments name the path; failing that, the only open call (lane RD matches by path otherwise). */
      const owner=owners.length===1?owners[0]:owners.length===0&&openTools.size===1?[...openTools.keys()][0]:undefined;
      const change:FileChange={path:redactor.text(path),before:before===null?null:redactor.text(before),after:redactor.text(row.value),...(owner?{toolCallId:owner}:{})};
      out.push({type:'file.changed',change});
    }
    return out;
  }
  function translateAll(raw:unknown):TuiEvent[]{
    const canonical=canonicalOf(raw);
    const event=canonical?projectCanonical(canonical):null;
    const out:TuiEvent[]=event?[event]:[];
    if(event?.type==='run.started')liveKernelCompactions=0;
    else if(event?.type==='context.compacted'&&event.engine==='kernel'&&event.trigger!=='manual')liveKernelCompactions++;
    if(event?.type==='run.completed'){
      /* R5a lane R (S3): the kernel counts its own compactions in the run's result (`compattazioni` → v2 `compactions`,
         agent-service.mjs:182). A compaction the live observer did not report is named here, before the run ends, with what is
         known: nothing but that it happened. Review 14 R14-1 of 0.6.13: a replay names each in-turn one from the journal's row
         (protocol/v2/events.ts), so what is left here has no facts, and is said neutrally (never «summarized», never «at 75%»). */
      const total=countOrNull(objectValue(objectValue(canonical?.data)?.result)?.compactions)??0;
      const missing=Math.max(0,total-liveKernelCompactions);
      for(let i=0;i<missing;i++)out.unshift({type:'context.compacted',engine:'kernel',messagesSummarized:null,tokensBefore:null,tokensAfter:null,trigger:'automatic',factsUnknown:true});
      liveKernelCompactions=0;
    }
    if(event?.type==='tool.started')openTools.set(event.toolCallId,'');
    else if(event?.type==='run.completed'||event?.type==='run.failed'||event?.type==='run.cancelled')openTools.clear();
    else if(event?.type==='tool.args'&&openTools.has(event.toolCallId))openTools.set(event.toolCallId,(openTools.get(event.toolCallId)!+event.delta).slice(0,MAX_OPEN_ARGS_CHARS));
    else if(event?.type==='tool.completed'){
      openTools.delete(event.toolCallId);
      const denial=noted.get(event.toolCallId)??null;noted.delete(event.toolCallId);
      const facts=event.result?toolFacts(event.result,denial):null;
      if(facts)out.push({type:'tool.facts',toolCallId:event.toolCallId,facts});
      /* R5a lane R (Q-R5-10/11): the cut the model read, as facts the row states (the v2 result carries them). */
      const saved=event.result?.outputSaved;
      if(saved?.path)out.push({type:'tool.output.saved',toolCallId:event.toolCallId,path:saved.path,keptChars:saved.keptChars,totalChars:saved.totalChars});
      const cut=event.result?.readCut;
      if(cut)out.push({type:'tool.read.cut',toolCallId:event.toolCallId,shownLines:cut.shownLines,totalLines:cut.totalLines,limitChars:cut.limitChars});
    }
    const row=objectValue(raw);
    if(row&&!isCanonicalEvent(raw))out.push(...fileChanges(row));
    return out;
  }
  return{bindSession,translate,translateAll,noteDenial};
}

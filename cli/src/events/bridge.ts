import {createRedactor} from '../diagnostics/redact.ts';
import {KERNEL_CLASSES} from '../i18n/kernel-map.ts';
import {sensitivityOfClass} from '../security/from-approval.ts';
import {MCP_START_FAILED} from '../runtime/provider-attempts.ts';
import {createCompactionWarnings} from '../protocol/v2/events.ts';
import {requestTooLargeOf} from '../runtime/request-too-large.ts';
import {contextFullOf} from '../runtime/context-full.ts';

export type ToolLifecycleStatus='completed'|'failed'|'cancelled'|'unknown';
export type ToolOutcomeEvidence={
  toolCallId:string;
  status:ToolLifecycleStatus;
  content:string;
  receiptStatus:string|null;
  exitCode:number|null;
  enforcement:string|null;
  allowed:boolean|null;
  permissionVia:string|null;
  permissionReason:string|null;
  risk:string|null;
};

export type CliEvent={schema:'talos.cli.event.v1';seq:number;ts:string;sessionId:string;type:'run.started'|'message.delta'|'reasoning.delta'|'tool.started'|'tool.args'|'tool.completed'|'file.changed'|'approval.required'|'approval.resolved'|'usage.updated'|'warning'|'run.completed'|'run.failed';data:Record<string,unknown>;toolOutcomes?:ToolOutcomeEvidence[]};
const MAP:Record<string,CliEvent['type']|undefined>={RunStarted:'run.started',TextMessageContent:'message.delta',ReasoningMessageContent:'reasoning.delta',ToolCallStart:'tool.started',ToolCallArgs:'tool.args',ToolCallOutput:'tool.completed',ApprovalRequested:'approval.required',ApprovalResolved:'approval.resolved',RunFinished:'run.completed',RunError:'run.failed'};
const SECRET=/api[_-]?key|authorization|password|secret|token/iu;
const FAILED_RECEIPT_STATUSES=new Set(['denied','premise_absent','failed','refused_busy']);

function clean(v:unknown,redactText:(value:string)=>string):unknown{
  if(Array.isArray(v))return v.map(value=>clean(value,redactText));
  if(v&&typeof v==='object'){
    const o:Record<string,unknown>={};
    for(const[k,x]of Object.entries(v as Record<string,unknown>)){
      if(SECRET.test(k))continue;
      o[k]=clean(x,redactText);
    }
    return o;
  }
  return typeof v==='string'?redactText(v):v;
}
function objectValue(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function stringValue(value:unknown):string|null{return typeof value==='string'&&value.length>0?value:null;}
function numberValue(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
function booleanValue(value:unknown):boolean|null{return typeof value==='boolean'?value:null;}

export function normalizeToolOutcome(raw:Record<string,unknown>):ToolOutcomeEvidence|null{
  const toolCallId=stringValue(raw.toolCallId);
  if(!toolCallId)return null;
  const receipt=objectValue(raw.receipt);
  const evidence=objectValue(receipt?.evidence);
  const receiptStatus=stringValue(receipt?.status);
  const explicitCancelled=raw.outcome==='cancelled';
  const status:ToolLifecycleStatus=explicitCancelled
    ?'cancelled'
    :receiptStatus==='effect_unknown'
      ?'unknown'
      :receiptStatus==='succeeded'
        ?'completed'
        :receiptStatus&&FAILED_RECEIPT_STATUSES.has(receiptStatus)
          ?'failed'
          :'completed';
  return{
    toolCallId,
    status,
    content:String(raw.content??''),
    receiptStatus,
    exitCode:numberValue(evidence?.exitCode),
    enforcement:stringValue(evidence?.sandboxEnforcement),
    allowed:booleanValue(receipt?.consentito),
    permissionVia:stringValue(receipt?.via),
    permissionReason:stringValue(receipt?.motivo),
    risk:stringValue(receipt?.risk),
  };
}

const HIDDEN_TOOL_OUTCOMES=Symbol.for('talos.cli.toolOutcomes');
const HIDDEN_TOOL_OUTCOME_CARRIER=Symbol.for('talos.cli.toolOutcomeCarrier');
type ToolOutcomeCarrier=Map<string,ToolOutcomeEvidence>;
function attachToolOutcomeCarrier<T extends CliEvent>(event:T,carrier:ToolOutcomeCarrier):T{
  Object.defineProperty(event.data,HIDDEN_TOOL_OUTCOME_CARRIER,{value:carrier,enumerable:false,configurable:false,writable:false});
  return event;
}
function hiddenToolOutcomes<T extends CliEvent>(event:T,outcomes:readonly ToolOutcomeEvidence[]):T{
  if(outcomes.length===0)return event;
  const snapshot=[...outcomes];
  Object.defineProperty(event,'toolOutcomes',{value:snapshot,enumerable:false,configurable:false,writable:false});
  Object.defineProperty(event.data,HIDDEN_TOOL_OUTCOMES,{value:snapshot,enumerable:false,configurable:false,writable:false});
  return event;
}
export function hasToolOutcomeCarrier(event:CliEvent):boolean{
  if(Array.isArray(event.toolOutcomes))return true;
  const data=event.data as Record<PropertyKey,unknown>;
  return Array.isArray(data[HIDDEN_TOOL_OUTCOMES])||data[HIDDEN_TOOL_OUTCOME_CARRIER] instanceof Map;
}
export function toolOutcomesFromCliEvent(event:CliEvent):readonly ToolOutcomeEvidence[]{
  const direct=event.toolOutcomes;
  if(Array.isArray(direct))return direct;
  const data=event.data as Record<PropertyKey,unknown>;
  const snapshot=data[HIDDEN_TOOL_OUTCOMES];
  if(Array.isArray(snapshot))return snapshot as ToolOutcomeEvidence[];
  const carrier=data[HIDDEN_TOOL_OUTCOME_CARRIER];
  return carrier instanceof Map?[...carrier.values()] as ToolOutcomeEvidence[]:[];
}

export function createEventBridge(sessionId:string,clock:()=>string=()=>new Date().toISOString(),secretValues:readonly string[]=[]){
  let seq=0;
  const redactor=createRedactor(secretValues);
  const pendingToolOutcomes=new Map<string,ToolOutcomeEvidence>();
  /* F-ENG-5: the calls whose result was already reported, so a later, richer copy of the same result is not a second event. */
  const reportedResults=new Set<string>();
  /* 0.6.13 contract (c): the compaction brake is said once per arming, as v2 says it */
  const compactionWarnings=createCompactionWarnings();
  return{translate(raw:unknown):CliEvent|null{
    if(!raw||typeof raw!=='object')return null;
    const r=raw as Record<string,unknown>;
    if(r.type==='ToolCallResult'){
      const sanitized=clean(r,redactor.text) as Record<string,unknown>;
      const outcome=normalizeToolOutcome(sanitized);
      if(outcome){
        const previous=pendingToolOutcomes.get(outcome.toolCallId);
        const shouldReplace=!previous
          ||(previous.receiptStatus===null&&outcome.receiptStatus!==null)
          ||(previous.status==='completed'&&outcome.status!=='completed');
        if(shouldReplace)pendingToolOutcomes.set(outcome.toolCallId,outcome);
      }
      /*
       * F-ENG-5 (stress test of 0.5.0, 08/10/2026): in v1 only the shell's output chunks (`ToolCallOutput`) ever became
       * `tool.completed`, so a read, an edit or a search had no result event (280 tool.started, 72 tool.completed). Every
       * call now ends with one `tool.completed` carrying its result and status, as Codex `exec --json` (`item.completed`)
       * and OpenCode `run --format json` (`tool_use` once completed or failed). Additive: a chunk keeps `delta`, a result
       * has `content` and `status`.
       */
      if(!outcome||reportedResults.has(outcome.toolCallId))return null;
      reportedResults.add(outcome.toolCallId);
      seq+=1;
      /* A call the receipt says was not allowed (a hook, a rule, a person) or that the kernel marked as an error did not complete. */
      const status=outcome.status==='completed'&&(outcome.allowed===false||sanitized.isError===true)?'failed':outcome.status;
      return attachToolOutcomeCarrier<CliEvent>({schema:'talos.cli.event.v1',seq,ts:clock(),sessionId,type:'tool.completed',data:{
        toolCallId:outcome.toolCallId,content:outcome.content,status,
        ...(outcome.exitCode!==null?{exitCode:outcome.exitCode}:{}),
      }},pendingToolOutcomes);
    }
    /* 0.6.13: a compaction that did not happen, as v2 says it (compactionFailureWarning): one warning with code, reason, message
       and the kernel's code. A compaction that happened, its start and nothing to compact are no event (the v1 schema is
       append-only: a `warning` with new fields in `data`). */
    if(r.type==='CUSTOM'&&r.name==='talos.compattazione'){
      const value=clean(r.value,redactor.text) as Record<string,unknown>|null;
      const warning=compactionWarnings.warningFor(value);if(!warning)return null;
      seq+=1;return{schema:'talos.cli.event.v1',seq,ts:clock(),sessionId,type:'warning',data:{...warning}};
    }
    /* D1: the CLI's own notice (`talos.cli.notice`, provider-attempts.ts CLI_EVENT.notice), as v2 shows it: a warning */
    if(r.type==='CUSTOM'&&r.name==='talos.cli.notice'){
      const value=r.value as Record<string,unknown>|undefined;const message=value?.message;if(typeof message!=='string')return null;
      /* 0.6.9: a trusted MCP server that did not start keeps its own code and its server (MCP_START_FAILED) */
      const mcp=value?.code===MCP_START_FAILED&&typeof value?.serverId==='string'?{code:MCP_START_FAILED,serverId:value.serverId}:null;
      seq+=1;return{schema:'talos.cli.event.v1',seq,ts:clock(),sessionId,type:'warning',data:clean(mcp?{...mcp,message}:{code:'CLI_NOTICE',message},redactor.text) as Record<string,unknown>};
    }
    let type=MAP[String(r.type)];
    let source:Record<string,unknown>={...r};
    if(r.type==='StateDelta'&&Array.isArray(r.delta)){
      const usage=(r.delta as Array<Record<string,unknown>>).find(d=>d.path==='/usage');
      if(usage){type='usage.updated';source={...source,value:usage.value};}
    }
    if(!type)return null;
    const data=clean(source,redactor.text) as Record<string,unknown>;
    delete data.type;
    if(type==='approval.required')data.requestId=r.requestId;
    /* Stress test 0.5.5, F-L-003 (S4): the secret class of an approval is a VALUE ("segreto"); it goes out in the CLI's English
       (from-approval.ts sensitivityOfClass, the words `sensitive` already uses). The key stays: F-L-001 is deferred by the owner. */
    if(type==='approval.required'){const azione=data.azione as Record<string,unknown>|undefined;const segreto=azione?.segreto as Record<string,unknown>|undefined;
      if(segreto&&typeof segreto.classe==='string')data.azione={...azione,segreto:{...segreto,classe:sensitivityOfClass(segreto.classe)}};}
    /* F-L-002 (stress test 0.5.4): the kernel's class of a failure is a VALUE the reader sees ("credenziale"); it goes out in the
       English the screen and protocol v2 use. The key itself stays: F-L-001 (key names) is deferred by the owner. */
    if(type==='run.failed'&&typeof data.classe==='string'&&Object.hasOwn(KERNEL_CLASSES,data.classe))data.classe=KERNEL_CLASSES[data.classe];
    /* 0.6.13 (additive): a request too large for the model keeps its four numbers. Read from the kernel's own row: `clean` drops
       every key with «token» in it (tokensRichiesta, tokensCornice), so the English field (runtime/request-too-large.ts) is added
       after it — numbers and one English word only. */
    if(type==='run.failed'){const tooLarge=requestTooLargeOf(r);if(tooLarge)data.requestTooLarge={...tooLarge};
      /* Z piece C (additive): the context-full diagnosis in English beside the kernel's own; its class VALUE in English (F-L-002) */
      const contextFull=contextFullOf(r);if(contextFull)data.contextFull={...contextFull};
      /* review 10 R10-11: the kernel's own new keys (`contestoPieno`, `classificazione`) are not added to v1; `contextFull` says it */
      delete data.contestoPieno;delete data.classificazione;
      /* review 9 F8 of 0.6.13: the kernel's `fonte` is a VALUE the reader sees ("stima"/"fornitore"); it goes out in the English of
         `requestTooLarge.source`, as F-L-002 does for `classe`. The key stays (F-L-001, deferred by the owner). */
      for(const row of [data,data.dati,data.messageParams]){const facts=row&&typeof row==='object'?row as Record<string,unknown>:null;
        if(facts&&(facts.fonte==='stima'||facts.fonte==='fornitore'))facts.fonte=facts.fonte==='fornitore'?'provider':'estimate';}}
    seq+=1;
    const event=attachToolOutcomeCarrier<CliEvent>({schema:'talos.cli.event.v1',seq,ts:clock(),sessionId,type,data},pendingToolOutcomes);
    if(type==='run.completed'||type==='run.failed'){
      const outcomes=[...pendingToolOutcomes.values()];
      const terminal=hiddenToolOutcomes(event,outcomes);
      pendingToolOutcomes.clear();
      return terminal;
    }
    return event;
  },
  /* C-005: an event the CLI itself adds to the stream (a denial answered to the model) takes the next number of the same
     sequence and the same redaction, so it can never share a `seq` with a kernel event or show a secret. */
  synthesize(type:CliEvent['type'],data:Record<string,unknown>):CliEvent{
    seq+=1;
    return{schema:'talos.cli.event.v1',seq,ts:clock(),sessionId,type,data:clean(data,redactor.text) as Record<string,unknown>};
  }};
}

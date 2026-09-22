import {createRedactor} from '../../diagnostics/redact.ts';
import {safeTalosFailure} from '../../errors.ts';
import type {CliContextStatus,CliSessionSummary} from '../../runtime/types.ts';
import type {
  TalosV2Cursor,
  TalosV2Durability,
  TalosV2EnforcementEvidence,
  TalosV2Event,
  TalosV2EventType,
  TalosV2RunResult,
  TalosV2ToolReceipt,
  TalosV2ToolResult,
} from './types.ts';

const SECRET=/api[_-]?key|authorization|password|secret|token/iu;
const FAILED_RECEIPT_STATUSES=new Set(['denied','premise_absent','failed','refused_busy']);
const TOOL_RECEIPT_KEYS=new Set(['status','consentito','allowed','via','motivo','reason','risk','evidence']);
const ENFORCEMENT_KEYS=new Set([
  'exitCode','requestedEnforcement','appliedEnforcement','sandboxEnforcement','backend','appContainer',
  'filesystem','network','processTree','processTreeEvidence','sandboxSpecVersion'
]);
const TOOL_TOP_LEVEL_KEYS=new Set(['type','_sequenza','toolCallId','content','receipt','outcome','isError']);

function objectValue(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function stringValue(value:unknown):string|null{return typeof value==='string'&&value.length>0?value:null;}
function numberValue(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
function booleanValue(value:unknown):boolean|null{return typeof value==='boolean'?value:null;}
function detailsOutside(source:Record<string,unknown>|null,known:Set<string>):Record<string,unknown>|undefined{
  if(!source)return undefined;
  const details=Object.fromEntries(Object.entries(source).filter(([key])=>!known.has(key)));
  return Object.keys(details).length?details:undefined;
}
function clean(value:unknown,redactText:(value:string)=>string):unknown{
  if(Array.isArray(value))return value.map(item=>clean(item,redactText));
  if(value&&typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>)){
      if(SECRET.test(key))continue;
      out[key]=clean(item,redactText);
    }
    return out;
  }
  return typeof value==='string'?redactText(value):value;
}
function nativeSequence(value:unknown):number|null{
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return value;
  if(typeof value==='string'&&/^\d+$/u.test(value)){
    const parsed=Number(value);
    if(Number.isSafeInteger(parsed))return parsed;
  }
  return null;
}
function cursorFor(sessionId:string,sequence:number|null):TalosV2Cursor|null{
  return sequence===null?null:{sessionId,sequence};
}
function eventIdFor(sessionId:string,sequence:number|null,synthetic:number){
  const identity=encodeURIComponent(sessionId||'none');
  return sequence===null?'talos:'+identity+':transient:'+synthetic:'talos:'+identity+':native:'+sequence;
}
function baseEvent(input:{
  sessionId:string;
  sequence:number|null;
  synthetic:number;
  clock:()=>string;
  durability:TalosV2Durability;
  type:TalosV2EventType;
  data:Record<string,unknown>;
}):TalosV2Event{
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.sessionId,
    eventId:eventIdFor(input.sessionId,input.sequence,input.synthetic),
    cursor:cursorFor(input.sessionId,input.sequence),
    ts:input.clock(),
    durability:input.durability,
    type:input.type,
    data:input.data,
  };
}

function toolStatus(raw:Record<string,unknown>,receiptStatus:string|null):TalosV2ToolResult['status']{
  if(raw.outcome==='cancelled')return'cancelled';
  if(receiptStatus==='effect_unknown')return'unknown';
  if(receiptStatus==='succeeded')return'completed';
  if(receiptStatus&&FAILED_RECEIPT_STATUSES.has(receiptStatus))return'failed';
  if(raw.isError===true)return'failed';
  return'completed';
}
function enforcementFrom(receipt:Record<string,unknown>|null):TalosV2EnforcementEvidence|null{
  const evidence=objectValue(receipt?.evidence);
  if(!evidence)return null;
  const extra=detailsOutside(evidence,ENFORCEMENT_KEYS);
  return{
    exitCode:numberValue(evidence.exitCode),
    requested:stringValue(evidence.requestedEnforcement),
    applied:stringValue(evidence.appliedEnforcement),
    sandbox:stringValue(evidence.sandboxEnforcement),
    backend:stringValue(evidence.backend),
    appContainer:booleanValue(evidence.appContainer),
    filesystem:stringValue(evidence.filesystem),
    network:stringValue(evidence.network),
    processTree:stringValue(evidence.processTree),
    sandboxSpecVersion:stringValue(evidence.sandboxSpecVersion),
    ...(evidence.processTreeEvidence!==undefined?{processTreeEvidence:evidence.processTreeEvidence}:{}),
    ...(extra?{details:extra}:{}),
  };
}
function toolResultFromNative(raw:Record<string,unknown>):TalosV2ToolResult|null{
  const toolCallId=stringValue(raw.toolCallId);
  if(!toolCallId)return null;
  const receipt=objectValue(raw.receipt);
  const receiptStatus=stringValue(receipt?.status);
  const receiptExtra=detailsOutside(receipt,TOOL_RECEIPT_KEYS);
  const topExtra=detailsOutside(raw,TOOL_TOP_LEVEL_KEYS);
  const normalizedReceipt:TalosV2ToolReceipt={
    status:receiptStatus,
    allowed:booleanValue(receipt?.consentito??receipt?.allowed),
    via:stringValue(receipt?.via),
    reason:stringValue(receipt?.motivo??receipt?.reason),
    risk:stringValue(receipt?.risk),
    ...(receiptExtra?{details:receiptExtra}:{}),
  };
  return{
    toolCallId,
    status:toolStatus(raw,receiptStatus),
    content:String(raw.content??''),
    receipt:normalizedReceipt,
    enforcement:enforcementFrom(receipt),
    ...(topExtra?{details:topExtra}:{}),
  };
}

function withoutMeta(raw:Record<string,unknown>,redactText:(value:string)=>string){
  const cleaned=clean(raw,redactText) as Record<string,unknown>;
  delete cleaned.type;
  delete cleaned._sequenza;
  return cleaned;
}
function transient(type:TalosV2EventType){
  return type==='message.started'||type==='message.delta'||type==='message.completed'
    ||type==='reasoning.started'||type==='reasoning.delta'||type==='reasoning.completed'
    ||type==='tool.started'||type==='tool.args'||type==='tool.output'
    ||type==='usage.updated'||type==='warning';
}

export function createV2EventBridge(
  sessionId:string,
  clock:()=>string=()=>new Date().toISOString(),
  secretValues:readonly string[]=[]
){
  let synthetic=0;
  const redactor=createRedactor(secretValues);
  const messageBuffers=new Map<string,string>();
  const reasoningBuffers=new Map<string,string>();
  return{
    translate(raw:unknown):TalosV2Event|null{
      if(!raw||typeof raw!=='object')return null;
      const original=raw as Record<string,unknown>;
      const r=clean(original,redactor.text) as Record<string,unknown>;
      const sequence=nativeSequence(original._sequenza);
      const next=(type:TalosV2EventType,data:Record<string,unknown>,durability:TalosV2Durability=transient(type)?'transient':'durable')=>
        baseEvent({sessionId,sequence,synthetic:++synthetic,clock,durability,type,data});
      switch(String(r.type)){
        case 'RunStarted':
          return next('run.started',withoutMeta(r,redactor.text),'durable');
        case 'TextMessageStart':{
          const messageId=String(r.messageId??'assistant');messageBuffers.set(messageId,'');
          return next('message.started',{messageId,role:r.role==='user'?'user':'assistant'});
        }
        case 'TextMessageContent':{
          const messageId=String(r.messageId??'assistant');const delta=redactor.text(String(r.delta??''));
          messageBuffers.set(messageId,(messageBuffers.get(messageId)??'')+delta);
          return next('message.delta',{messageId,delta});
        }
        case 'TextMessageEnd':{
          const messageId=String(r.messageId??'assistant');const text=messageBuffers.get(messageId)??'';messageBuffers.delete(messageId);
          return next('message.completed',{messageId,text},'durable');
        }
        case 'ReasoningMessageStart':{
          const messageId=String(r.messageId??'reasoning');reasoningBuffers.set(messageId,'');
          return next('reasoning.started',{messageId});
        }
        case 'ReasoningMessageContent':{
          const messageId=String(r.messageId??'reasoning');const delta=redactor.text(String(r.delta??''));
          reasoningBuffers.set(messageId,(reasoningBuffers.get(messageId)??'')+delta);
          return next('reasoning.delta',{messageId,delta});
        }
        case 'ReasoningMessageEnd':{
          const messageId=String(r.messageId??'reasoning');const text=reasoningBuffers.get(messageId)??'';reasoningBuffers.delete(messageId);
          return next('reasoning.completed',{messageId,text},'durable');
        }
        case 'ToolCallStart':
          return next('tool.started',{toolCallId:String(r.toolCallId??''),toolName:String(r.toolCallName??r.name??'tool')});
        case 'ToolCallArgs':
          return next('tool.args',{toolCallId:String(r.toolCallId??''),delta:redactor.text(String(r.delta??''))});
        case 'ToolCallOutput':
          return next('tool.output',{toolCallId:String(r.toolCallId??''),delta:redactor.text(String(r.delta??''))});
        case 'ToolCallResult':{
          const result=toolResultFromNative(r);
          return result?next('tool.completed',result as unknown as Record<string,unknown>,'durable'):null;
        }
        case 'FileChanged':
          return next('file.changed',withoutMeta(r,redactor.text),'durable');
        case 'ApprovalRequested':
          return next('approval.required',withoutMeta(r,redactor.text),'durable');
        case 'ApprovalResolved':
          return next('approval.resolved',withoutMeta(r,redactor.text),'durable');
        case 'StateDelta':{
          const rows=Array.isArray(r.delta)?r.delta as Array<Record<string,unknown>>:[];
          const usage=rows.find(row=>row?.path==='/usage');
          return usage?next('usage.updated',{value:usage.value}):null;
        }
        case 'RuntimeFallback':
          return next('warning',{message:redactor.text(String(r.message??r.reason??'runtime fallback'))});
        case 'RunFinished':
          return next('run.completed',withoutMeta(r,redactor.text),'durable');
        case 'RunError':{
          const traceId=stringValue(r.traceId);
          const failure=safeTalosFailure(r,{
            component:stringValue(r.component)??'runtime',
            retryable:typeof r.retryable==='boolean'?r.retryable:false,
            ...(traceId?{traceId}:{})
          },secretValues);
          const runId=stringValue(r.runId);
          return next('run.failed',{error:{message:failure.message,envelope:failure.envelope},...(runId?{runId}:{})},'durable');
        }
        case 'RunCancelled':{
          const runId=stringValue(r.runId);
          return next('run.cancelled',{reason:redactor.text(String(r.reason??r.message??'cancelled')),...(runId?{runId}:{})},'durable');
        }
        default:
          return null;
      }
    }
  };
}

export function createV2SyntheticEvent(input:{
  sessionId:string;
  eventId:string;
  type:TalosV2EventType;
  data?:Record<string,unknown>;
  durability?:TalosV2Durability;
  clock?:()=>string;
}):TalosV2Event{
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.sessionId,
    eventId:input.eventId,
    cursor:null,
    ts:(input.clock??(()=>new Date().toISOString()))(),
    durability:input.durability??'transient',
    type:input.type,
    data:input.data??{},
  };
}

export function createV2FailureEvent(input:{
  sessionId:string;
  error:unknown;
  component?:string;
  retryable?:boolean;
  details?:Record<string,unknown>;
  secretValues?:readonly string[];
  clock?:()=>string;
}):TalosV2Event{
  const secrets=input.secretValues??[];
  const redactor=createRedactor(secrets);
  const safeDetails=input.details?clean(input.details,redactor.text) as Record<string,unknown>:undefined;
  const failure=safeTalosFailure(input.error,{
    component:input.component??'runtime',
    retryable:input.retryable??false,
  },secrets);
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.sessionId,
    eventId:'talos:'+encodeURIComponent(input.sessionId||'none')+':failure:'+failure.envelope.traceId,
    cursor:null,
    ts:(input.clock??(()=>new Date().toISOString()))(),
    durability:'durable',
    type:'run.failed',
    data:{
      error:{message:failure.message,envelope:failure.envelope},
      ...(safeDetails&&Object.keys(safeDetails).length?{details:safeDetails}:{}),
    },
  };
}

export function createV2SessionSnapshot(input:{
  summary:CliSessionSummary;
  context?:CliContextStatus|null;
  cursor:TalosV2Cursor;
  clock?:()=>string;
}):TalosV2Event{
  if(input.cursor.sessionId!==input.summary.sessionId)throw Object.assign(new Error('Replay cursor is bound to a different session'),{code:'PROTOCOL_CURSOR_SESSION_MISMATCH'});
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.summary.sessionId,
    eventId:eventIdFor(input.summary.sessionId,input.cursor.sequence,0),
    cursor:{...input.cursor},
    ts:(input.clock??(()=>new Date().toISOString()))(),
    durability:'durable',
    type:'session.snapshot',
    data:{summary:input.summary,...(input.context!==undefined?{context:input.context}:{})},
  };
}

function toolResultFromEvent(event:TalosV2Event):TalosV2ToolResult|null{
  if(event.type!=='tool.completed')return null;
  const data=event.data as Partial<TalosV2ToolResult>;
  return typeof data.toolCallId==='string'&&typeof data.content==='string'&&typeof data.status==='string'&&data.receipt
    ?data as TalosV2ToolResult
    :null;
}

export function createV2RunResultAccumulator(){
  let text='';
  const changed=new Set<string>();
  let usage:unknown=null;
  const warnings:string[]=[];
  const tools=new Map<string,TalosV2ToolResult>();
  let sessionId:string|null=null;
  let cursor:TalosV2Cursor|null=null;
  let outcome:TalosV2RunResult['outcome']='completed';
  let error:TalosV2RunResult['error']|undefined;
  return{
    add(event:TalosV2Event){
      sessionId=event.sessionId||sessionId;
      if(event.cursor&&(!cursor||event.cursor.sequence>=cursor.sequence))cursor={...event.cursor};
      if(event.type==='message.delta')text+=String(event.data.delta??'');
      if(event.type==='file.changed'&&typeof event.data.path==='string')changed.add(event.data.path);
      if(event.type==='usage.updated')usage=event.data.value??event.data;
      if(event.type==='warning')warnings.push(String(event.data.message??'warning'));
      const tool=toolResultFromEvent(event);if(tool)tools.set(tool.toolCallId,tool);
      if(event.type==='run.failed'){
        outcome='failed';
        const candidate=objectValue(event.data.error);
        const envelope=objectValue(candidate?.envelope);
        if(candidate&&envelope&&typeof candidate.message==='string')error={message:candidate.message,envelope:envelope as any};
      }
      if(event.type==='run.cancelled'){
        outcome='cancelled';
        const reason=String(event.data.reason??'cancelled');
        const failure=safeTalosFailure({code:'CANCELLED',message:reason,component:'runtime',retryable:false},{component:'runtime'});
        error={message:failure.message,envelope:failure.envelope};
      }
      if(event.type==='run.completed')outcome='completed';
    },
    result():TalosV2RunResult{
      if(outcome==='failed'||outcome==='cancelled'){
        const fallback=error??(()=>{
          const code=outcome==='cancelled'?'CANCELLED':'AGENT_FAILED';
          const message=outcome==='cancelled'?'cancelled':'Agent run failed';
          const failure=safeTalosFailure({code,message,component:'runtime',retryable:false},{component:'runtime'});
          return{message:failure.message,envelope:failure.envelope};
        })();
        return{
          schema:'talos.cli.result.v2',version:2,ok:false,sessionId,cursor,outcome,error:fallback,
          warnings:[...warnings],toolResults:[...tools.values()]
        };
      }
      return{
        schema:'talos.cli.result.v2',version:2,ok:true,sessionId,cursor,outcome:'completed',
        result:{text,changedFiles:[...changed],usage},warnings:[...warnings],toolResults:[...tools.values()]
      };
    }
  };
}

export function withV2RunWarnings(result:TalosV2RunResult,warnings:string[]):TalosV2RunResult{
  return{...result,warnings:[...warnings]};
}

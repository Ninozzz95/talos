import {createRedactor} from '../diagnostics/redact.ts';

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
      return null;
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
    seq+=1;
    const event=attachToolOutcomeCarrier<CliEvent>({schema:'talos.cli.event.v1',seq,ts:clock(),sessionId,type,data},pendingToolOutcomes);
    if(type==='run.completed'||type==='run.failed'){
      const outcomes=[...pendingToolOutcomes.values()];
      const terminal=hiddenToolOutcomes(event,outcomes);
      pendingToolOutcomes.clear();
      return terminal;
    }
    return event;
  }};
}

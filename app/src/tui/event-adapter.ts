import type {ToolOutcomeEvidence} from '../events/bridge.ts';
import {createV2EventBridge} from '../protocol/v2/events.ts';
import type {TalosV2Error,TalosV2Event,TalosV2ToolResult} from '../protocol/v2/types.ts';

type EventIdentity={eventId?:string};
export type TuiEvent=
 | ({type:'run.started';sessionId:string;runId?:string}&EventIdentity)
 | ({type:'message.started';messageId:string;role:'user'|'assistant'}&EventIdentity)
 | ({type:'message.delta';messageId:string;delta:string}&EventIdentity)
 | ({type:'message.end';messageId:string}&EventIdentity)
 | ({type:'reasoning.started';messageId:string}&EventIdentity)
 | ({type:'reasoning.delta';messageId:string;delta:string}&EventIdentity)
 | ({type:'reasoning.end';messageId:string}&EventIdentity)
 | ({type:'tool.started';toolCallId:string;toolName:string}&EventIdentity)
 | ({type:'tool.args';toolCallId:string;delta:string}&EventIdentity)
 | ({type:'tool.output';toolCallId:string;delta:string}&EventIdentity)
 | ({type:'tool.completed';toolCallId:string;content:string;outcome?:ToolOutcomeEvidence;result?:TalosV2ToolResult}&EventIdentity)
 | ({type:'file.changed';data:Record<string,unknown>}&EventIdentity)
 | ({type:'approval.required';requestId:string;payload:Record<string,unknown>;toolCallId?:string}&EventIdentity)
 | ({type:'approval.resolved';requestId:string;approved?:boolean}&EventIdentity)
 | ({type:'usage.updated';value:unknown}&EventIdentity)
 | ({type:'warning';message:string}&EventIdentity)
 | ({type:'session.snapshot';data:Record<string,unknown>}&EventIdentity)
 | ({type:'run.completed';runId?:string}&EventIdentity)
 | ({type:'run.failed';message:string;error?:TalosV2Error;runId?:string}&EventIdentity)
 | ({type:'run.cancelled';runId?:string;reason?:string}&EventIdentity);

function objectValue(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
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
    status:result.status,
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
function role(value:unknown):'user'|'assistant'{return value==='user'?'user':'assistant';}

function projectCanonical(event:TalosV2Event):TuiEvent|null{
  const id=identity(event);
  const data=event.data;
  switch(event.type){
    case 'run.started':{
      const runId=stringValue(data.runId);
      return{type:'run.started',sessionId:event.sessionId,...(runId?{runId}:{}),...id};
    }
    case 'message.started':
      return{type:'message.started',messageId:String(data.messageId??'assistant'),role:role(data.role),...id};
    case 'message.delta':
      return{type:'message.delta',messageId:String(data.messageId??'assistant'),delta:String(data.delta??''),...id};
    case 'message.completed':
      return{type:'message.end',messageId:String(data.messageId??'assistant'),...id};
    case 'reasoning.started':
      return{type:'reasoning.started',messageId:String(data.messageId??'reasoning'),...id};
    case 'reasoning.delta':
      return{type:'reasoning.delta',messageId:String(data.messageId??'reasoning'),delta:String(data.delta??''),...id};
    case 'reasoning.completed':
      return{type:'reasoning.end',messageId:String(data.messageId??'reasoning'),...id};
    case 'tool.started':
      return{type:'tool.started',toolCallId:String(data.toolCallId??''),toolName:String(data.toolName??'tool'),...id};
    case 'tool.args':
      return{type:'tool.args',toolCallId:String(data.toolCallId??''),delta:String(data.delta??''),...id};
    case 'tool.output':
      return{type:'tool.output',toolCallId:String(data.toolCallId??''),delta:String(data.delta??''),...id};
    case 'tool.completed':{
      const result=asToolResult(data);
      if(!result)return null;
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
    case 'usage.updated':
      return{type:'usage.updated',value:data.value,...id};
    case 'warning':
      return{type:'warning',message:String(data.message??'warning'),...id};
    case 'session.snapshot':
      return{type:'session.snapshot',data:{...data},...id};
    case 'run.completed':{
      const runId=stringValue(data.runId);
      return{type:'run.completed',...(runId?{runId}:{}),...id};
    }
    case 'run.failed':{
      const error=canonicalError(data);
      const runId=stringValue(data.runId);
      return{
        type:'run.failed',
        message:error?.message??String(data.message??'run failed'),
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

export function createTuiEventAdapter(secretValues:readonly string[]=[]){
  let currentSessionId:string|null=null;
  let bridge:ReturnType<typeof createV2EventBridge>|null=null;
  function bindSession(sessionId:string){
    if(typeof sessionId!=='string'||sessionId.length===0)throw new Error('SESSION_ID_REQUIRED');
    if(sessionId===currentSessionId&&bridge)return;
    currentSessionId=sessionId;
    bridge=createV2EventBridge(sessionId,undefined,secretValues);
  }
  return{
    bindSession,
    translate(raw:unknown):TuiEvent|null{
      if(isCanonicalEvent(raw))return projectCanonical(raw);
      if(!raw||typeof raw!=='object'||!bridge)return null;
      const canonical=bridge.translate(raw);
      return canonical?projectCanonical(canonical):null;
    }
  };
}

import type {ToolOutcomeEvidence,ToolLifecycleStatus} from '../events/bridge.ts';
import type {TuiEvent} from './event-adapter.ts';

export const MAX_TRANSCRIPT_ITEMS=768;
const MAX_MESSAGE_CHARS=256*1024;
const MAX_TOOL_SUMMARY_CHARS=8*1024;
const MAX_WARNING_CHARS=2048;
function tail(value:string,limit:number){if(value.length<=limit)return value;return '…[truncated in TUI]\n'+value.slice(-(limit-22));}

export type TranscriptMessageItem={kind:'message';id:string;role:'user'|'assistant';text:string;streaming:boolean};
export type TranscriptReasoningItem={kind:'reasoning';id:string;text:string;streaming:boolean};
export type TranscriptToolStatus='queued'|'approval'|'running'|'streaming'|ToolLifecycleStatus;
export type TranscriptToolItem={kind:'tool';id:string;name:string;status:TranscriptToolStatus;argsText:string;liveOutput:string;finalOutput:string;startedAt:number|null;endedAt:number|null;outcome:ToolOutcomeEvidence|null};
export type TranscriptWarningItem={kind:'warning';id:string;text:string};
export type TranscriptRunItem={kind:'run';id:string;status:'running'|'completed'|'failed'|'cancelled';sessionId:string|null;runId:string|null;message:string};
export type TranscriptItem=TranscriptMessageItem|TranscriptReasoningItem|TranscriptToolItem|TranscriptWarningItem|TranscriptRunItem;
export type TranscriptModel={items:TranscriptItem[];nextLocalId:number;pendingApproval:null|{requestId:string;toolCallId:string}};

const UNSAFE_DISPLAY=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}]/gu;
function visibleEscape(character:string){const code=character.codePointAt(0)!;return code>0xffff?'\\u{'+code.toString(16)+'}':'\\u'+code.toString(16).padStart(4,'0');}
export function sanitizeTranscriptText(value:string):string{return String(value).replace(/\r\n?/gu,'\n').replace(UNSAFE_DISPLAY,visibleEscape);}
export function transcriptItemText(item:TranscriptItem):string{
  if(item.kind==='message')return sanitizeTranscriptText((item.role==='user'?'You':'TALOS')+'\n'+item.text);
  if(item.kind==='reasoning')return sanitizeTranscriptText('Reasoning\n'+item.text);
  if(item.kind==='tool'){
    const output=item.finalOutput||item.liveOutput;
    return sanitizeTranscriptText(['Tool '+item.name+' · '+item.status,item.argsText?'Args\n'+item.argsText:'',output?'Output\n'+output:''].filter(Boolean).join('\n'));
  }
  if(item.kind==='warning')return sanitizeTranscriptText('Warning\n'+item.text);
  return sanitizeTranscriptText('Run · '+item.status+(item.runId?' · '+item.runId:'')+(item.message?'\n'+item.message:''));
}
export function transcriptItemRaw(item:TranscriptItem):string{
  return JSON.stringify(item,null,2).replace(/[\x7f-\x9f\u2028\u2029\p{Bidi_Control}]/gu,visibleEscape);
}

export function createTranscriptModel():TranscriptModel{return{items:[],nextLocalId:1,pendingApproval:null};}
export function clearTranscript(model:TranscriptModel):TranscriptModel{return{items:[],nextLocalId:model.nextLocalId,pendingApproval:null};}
function activeTool(status:TranscriptToolStatus){return status==='queued'||status==='approval'||status==='running'||status==='streaming';}
function active(item:TranscriptItem){return(item.kind==='message'&&item.streaming)||(item.kind==='reasoning'&&item.streaming)||(item.kind==='tool'&&activeTool(item.status))||(item.kind==='run'&&item.status==='running');}
function trim(model:TranscriptModel):TranscriptModel{
  const items=[...model.items];
  while(items.length>MAX_TRANSCRIPT_ITEMS){
    const index=items.findIndex(item=>!active(item));
    if(index<0)break;
    items.splice(index,1);
  }
  return{...model,items};
}
function put(model:TranscriptModel,item:TranscriptItem):TranscriptModel{
  const index=model.items.findIndex(row=>row.id===item.id);
  if(index>=0){const items=model.items.slice();items[index]=item;return trim({...model,items});}
  return trim({...model,items:[...model.items,item]});
}
function localId(model:TranscriptModel,prefix:string){return{id:prefix+':local:'+model.nextLocalId,model:{...model,nextLocalId:model.nextLocalId+1}};}
function existing<T extends TranscriptItem['kind']>(model:TranscriptModel,id:string,kind:T):Extract<TranscriptItem,{kind:T}>|null{
  const item=model.items.find(row=>row.id===id);
  return item?.kind===kind?item as Extract<TranscriptItem,{kind:T}>:null;
}
function toolId(toolCallId:string){return'tool:'+toolCallId;}
function terminalTool(model:TranscriptModel,toolCallId:string,content:string,outcome:ToolOutcomeEvidence|null):TranscriptModel{
  const id=toolId(toolCallId),current=existing(model,id,'tool');
  const status=outcome?.status??'completed';
  const row:TranscriptToolItem=current
    ?{...current,status,finalOutput:tail(content,MAX_TOOL_SUMMARY_CHARS),endedAt:Date.now(),outcome}
    :{kind:'tool',id,name:'tool',status,argsText:'',liveOutput:'',finalOutput:tail(content,MAX_TOOL_SUMMARY_CHARS),startedAt:null,endedAt:Date.now(),outcome};
  const next=put(model,row);
  return next.pendingApproval?.toolCallId===toolCallId?{...next,pendingApproval:null}:next;
}
function runTarget(model:TranscriptModel,event:{runId?:string;eventId?:string}){
  if(event.runId){const id='run:'+event.runId;const row=existing(model,id,'run');if(row)return{id,row};}
  for(let i=model.items.length-1;i>=0;i--){const row=model.items[i]!;if(row.kind==='run'&&row.status==='running')return{id:row.id,row};}
  return null;
}

export function appendTranscriptMessage(model:TranscriptModel,input:{id?:string;role:'user'|'assistant';text:string}):TranscriptModel{
  let base=model,id=input.id?'message:'+input.id:'';
  if(!id){const next=localId(model,'message');id=next.id;base=next.model;}
  const current=existing(base,id,'message');
  return put(base,current?{...current,role:input.role,text:tail(input.text,MAX_MESSAGE_CHARS),streaming:false}:{kind:'message',id,role:input.role,text:tail(input.text,MAX_MESSAGE_CHARS),streaming:false});
}
export function appendTranscriptWarning(model:TranscriptModel,text:string,id?:string):TranscriptModel{
  let base=model,itemId=id?'warning:'+id:'';
  if(!itemId){const next=localId(model,'warning');itemId=next.id;base=next.model;}
  return put(base,{kind:'warning',id:itemId,text:tail(text,MAX_WARNING_CHARS)});
}

export function reduceTranscriptEvent(model:TranscriptModel,event:TuiEvent):TranscriptModel{
  if(event.type==='message.started'){
    const id='message:'+event.messageId,current=existing(model,id,'message');
    return put(model,current?{...current,role:event.role}:{kind:'message',id,role:event.role,text:'',streaming:true});
  }
  if(event.type==='message.delta'){
    const id='message:'+event.messageId,current=existing(model,id,'message');
    return put(model,current?{...current,text:tail(current.text+event.delta,MAX_MESSAGE_CHARS),streaming:true}:{kind:'message',id,role:'assistant',text:tail(event.delta,MAX_MESSAGE_CHARS),streaming:true});
  }
  if(event.type==='message.end'){
    const id='message:'+event.messageId,current=existing(model,id,'message');
    return current?put(model,{...current,streaming:false}):model;
  }
  if(event.type==='reasoning.started'){
    const id='reasoning:'+event.messageId,current=existing(model,id,'reasoning');
    return current?model:put(model,{kind:'reasoning',id,text:'',streaming:true});
  }
  if(event.type==='reasoning.delta'){
    const id='reasoning:'+event.messageId,current=existing(model,id,'reasoning');
    return put(model,current?{...current,text:tail(current.text+event.delta,MAX_MESSAGE_CHARS),streaming:true}:{kind:'reasoning',id,text:tail(event.delta,MAX_MESSAGE_CHARS),streaming:true});
  }
  if(event.type==='reasoning.end'){
    const id='reasoning:'+event.messageId,current=existing(model,id,'reasoning');
    return current?put(model,{...current,streaming:false}):model;
  }
  if(event.type==='tool.started'){
    const id=toolId(event.toolCallId),current=existing(model,id,'tool');
    return current?model:put(model,{kind:'tool',id,name:event.toolName,status:'queued',argsText:'',liveOutput:'',finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null});
  }
  if(event.type==='tool.args'){
    const id=toolId(event.toolCallId),current=existing(model,id,'tool');
    return current?put(model,{...current,argsText:tail(current.argsText+event.delta,MAX_TOOL_SUMMARY_CHARS)}):put(model,{kind:'tool',id,name:'tool',status:'queued',argsText:tail(event.delta,MAX_TOOL_SUMMARY_CHARS),liveOutput:'',finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null});
  }
  if(event.type==='tool.output'){
    const id=toolId(event.toolCallId),current=existing(model,id,'tool');
    return current?put(model,{...current,status:'streaming',liveOutput:tail(current.liveOutput+event.delta,MAX_TOOL_SUMMARY_CHARS)}):put(model,{kind:'tool',id,name:'tool',status:'streaming',argsText:'',liveOutput:tail(event.delta,MAX_TOOL_SUMMARY_CHARS),finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null});
  }
  if(event.type==='tool.completed')return terminalTool(model,event.toolCallId,event.content,event.outcome??null);
  if(event.type==='approval.required'){
    if(!event.toolCallId)return model;
    const id=toolId(event.toolCallId),current=existing(model,id,'tool');
    const next=current?put(model,{...current,status:'approval'}):model;
    return{...next,pendingApproval:{requestId:event.requestId,toolCallId:event.toolCallId}};
  }
  if(event.type==='approval.resolved'){
    const pending=model.pendingApproval;
    if(!pending||pending.requestId!==event.requestId)return model;
    const id=toolId(pending.toolCallId),current=existing(model,id,'tool');
    let next=model;
    if(current){
      if(event.approved===true)next=put(model,{...current,status:'running'});
      else if(event.approved===false)next=put(model,{...current,status:'failed',endedAt:current.endedAt??Date.now()});
    }
    return{...next,pendingApproval:null};
  }
  if(event.type==='warning')return appendTranscriptWarning(model,event.message,event.eventId);
  if(event.type==='run.started'){
    let base=model,id=event.runId?'run:'+event.runId:event.eventId?'run:'+event.eventId:'';
    if(!id){const next=localId(model,'run');id=next.id;base=next.model;}
    const current=existing(base,id,'run');
    return current?put(base,{...current,status:'running',sessionId:event.sessionId||current.sessionId,runId:event.runId??current.runId}):put(base,{kind:'run',id,status:'running',sessionId:event.sessionId||null,runId:event.runId??null,message:''});
  }
  if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled'){
    const target=runTarget(model,event);
    const status=event.type==='run.completed'?'completed':event.type==='run.failed'?'failed':'cancelled';
    const message=event.type==='run.failed'?tail(event.message,MAX_WARNING_CHARS):'';
    if(target)return put(model,{...target.row,status,message:message||target.row.message});
    let base=model,id=event.runId?'run:'+event.runId:event.eventId?'run:'+event.eventId:'';
    if(!id){const next=localId(model,'run');id=next.id;base=next.model;}
    return put(base,{kind:'run',id,status,sessionId:null,runId:event.runId??null,message});
  }
  return model;
}

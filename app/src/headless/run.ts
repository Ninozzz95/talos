import {createEventBridge,type CliEvent} from '../events/bridge.ts';
import type {CliRuntime} from '../runtime/types.ts';
import {canonicalizeFailureEvent,createFailedRunResult,createRunResultAccumulator,type RunResult} from './result.ts';
import {createPermissionEngine,type AutoClassifier} from '../security/permission-engine.ts';
import type {PermissionMode,RuleSetInput} from '../security/types.ts';
import {permissionActionFromApproval} from '../security/from-approval.ts';
import {secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {keyOriginForRun,keyOriginNotice,missingKeyMessage} from '../provider/environment-keys.ts';
import {checkpointMutationAllowed} from '../workspace/checkpoint.ts';
import {createCheckpointStore,type CheckpointHandle,type CheckpointOperation} from '../workspace/checkpoint-store.ts';
import {createV2EventBridge,createV2FailureEvent,createV2RunResultAccumulator,createV2SyntheticEvent} from '../protocol/v2/events.ts';
import type {TalosProtocolVersion,TalosV2Event,TalosV2RunResult} from '../protocol/v2/types.ts';

type CommonInput={projectRoot:string;model:string;permissionMode:PermissionMode;timeoutSeconds?:number;permissionRules?:RuleSetInput;autoClassifier?:AutoClassifier;from?:number;checkpointsRoot?:string;protocolVersion?:TalosProtocolVersion};
type EventSink=(event:CliEvent)=>void;
type V2EventSink=(event:TalosV2Event)=>void;
type AnyEventSink=(event:any)=>void;
type V1Collected={events:CliEvent[];result:RunResult};
type V2Collected={events:TalosV2Event[];result:TalosV2RunResult};
type V1Input=CommonInput&{protocolVersion?:'v1'};
type V2Input=CommonInput&{protocolVersion:'v2'};

function noticeEvent(sessionId:string,seq:number,message:string):CliEvent{return{schema:'talos.cli.event.v1',seq,ts:new Date().toISOString(),sessionId,type:'warning',data:{code:'PROVIDER_KEY_ORIGIN',message}};}
async function beginTurnCheckpoint(runtime:CliRuntime,input:CommonInput,operation:CheckpointOperation,sessionId?:string|null):Promise<CheckpointHandle|null>{
  if(!input.checkpointsRoot)return null;
  if(operation==='start'&&!checkpointMutationAllowed(input.permissionMode))return null;
  const store=createCheckpointStore({rootDir:input.checkpointsRoot,projectRoot:input.projectRoot});
  return store.begin({operation,...(sessionId?{sessionId}:{})});
}

function collectV1(runtime:CliRuntime,id:string,input:CommonInput,onEvent?:EventSink,notices:readonly string[]=[],checkpoint:CheckpointHandle|null=null):Promise<{events:CliEvent[];result:RunResult}>{
  const engine=createPermissionEngine({projectRoot:input.projectRoot,rules:input.permissionRules??{allow:[],ask:[],deny:[]},mode:input.permissionMode,...(input.autoClassifier?{classifier:input.autoClassifier}:{})});
  const bridge=createEventBridge(id,undefined,secretValuesFromEnvironment(process.env));const events:CliEvent[]=[];const accumulator=createRunResultAccumulator();const offset=notices.length;
  for(const [index,message] of notices.entries()){const event=noticeEvent(id,index+1,message);if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);}
  return new Promise((resolve)=>{
    let done=false;let settling=false;let timer:NodeJS.Timeout|undefined;let unsub=()=>{};let lastSeq=offset;
    const finish=(result:RunResult)=>{if(done)return;done=true;if(timer)clearTimeout(timer);unsub();resolve({events,result});};
    const emit=(event:CliEvent)=>{lastSeq=Math.max(lastSeq,event.seq);if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);};
    const fail=(code:string,message:string,details:Record<string,unknown>={},component='runtime')=>{if(done)return;const event=canonicalizeFailureEvent({schema:'talos.cli.event.v1',seq:lastSeq+1,ts:new Date().toISOString(),sessionId:id,type:'run.failed',data:{...details,code,message}},component);emit(event);finish(accumulator.result());};
    unsub=runtime.subscribe(id,(raw)=>{
      if(done||settling)return;checkpoint?.observe(raw);
      const translated=bridge.translate(raw);if(!translated)return;const shifted=offset?{...translated,seq:translated.seq+offset}:translated;const event=canonicalizeFailureEvent(shifted);
      if(event.type==='approval.required'){emit(event);void (async()=>{const decision=await engine.decide(permissionActionFromApproval(event.data),{interactive:false,mode:input.permissionMode});if(decision.kind==='allow'){await runtime.answerApproval(id,String(event.data.requestId),true);return;}fail(decision.kind==='deny'?decision.code:'PERMISSION_REQUIRED',decision.kind==='deny'?decision.message:'Operation requires approval in non-interactive mode',event.data,'permission-engine');void runtime.answerApproval(id,String(event.data.requestId),false).finally(()=>runtime.cancel(id)).catch(()=>{});})().catch(error=>{fail('PERMISSION_ENGINE_ERROR',error instanceof Error?error.message:String(error),{},'permission-engine');void runtime.cancel(id).catch(()=>{});});return;}
      if(event.type==='run.completed'||event.type==='run.failed'){if(!checkpoint){emit(event);finish(accumulator.result());return;}settling=true;void checkpoint.finalize().then(()=>{if(done)return;emit(event);finish(accumulator.result());}).catch(error=>{settling=false;fail('CHECKPOINT_FINALIZE_FAILED',error instanceof Error?error.message:String(error),{},'checkpoint');});return;}
      emit(event);
    },input.from??0);
    const ms=(input.timeoutSeconds??180)*1000;timer=setTimeout(()=>{fail('RUN_TIMEOUT','Run timed out after '+ms+' ms',{},'runtime');void runtime.cancel(id).catch(()=>{});},ms);
  });
}

function collectV2(runtime:CliRuntime,id:string,input:CommonInput,onEvent?:V2EventSink,notices:readonly string[]=[],checkpoint:CheckpointHandle|null=null):Promise<{events:TalosV2Event[];result:TalosV2RunResult}>{
  const engine=createPermissionEngine({projectRoot:input.projectRoot,rules:input.permissionRules??{allow:[],ask:[],deny:[]},mode:input.permissionMode,...(input.autoClassifier?{classifier:input.autoClassifier}:{})});
  const secrets=secretValuesFromEnvironment(process.env);const bridge=createV2EventBridge(id,undefined,secrets);const events:TalosV2Event[]=[];const accumulator=createV2RunResultAccumulator();
  for(const [index,message] of notices.entries()){const event=createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':provider-notice:'+(index+1),type:'warning',data:{code:'PROVIDER_KEY_ORIGIN',message}});if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);}
  return new Promise((resolve)=>{
    let done=false;let settling=false;let timer:NodeJS.Timeout|undefined;let unsub=()=>{};
    const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);unsub();resolve({events,result:accumulator.result()});};
    const emit=(event:TalosV2Event)=>{if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);};
    const fail=(code:string,message:string,details:Record<string,unknown>={},component='runtime')=>{if(done)return;emit(createV2FailureEvent({sessionId:id,error:{code,message,component,retryable:false},component,details,secretValues:secrets}));finish();};
    unsub=runtime.subscribe(id,(raw)=>{
      if(done||settling)return;checkpoint?.observe(raw);const event=bridge.translate(raw);if(!event)return;
      if(event.type==='approval.required'){emit(event);void (async()=>{const decision=await engine.decide(permissionActionFromApproval(event.data),{interactive:false,mode:input.permissionMode});if(decision.kind==='allow'){await runtime.answerApproval(id,String(event.data.requestId??''),true);return;}fail(decision.kind==='deny'?decision.code:'PERMISSION_REQUIRED',decision.kind==='deny'?decision.message:'Operation requires approval in non-interactive mode',event.data,'permission-engine');void runtime.answerApproval(id,String(event.data.requestId??''),false).finally(()=>runtime.cancel(id)).catch(()=>{});})().catch(error=>{fail('PERMISSION_ENGINE_ERROR',error instanceof Error?error.message:String(error),{},'permission-engine');void runtime.cancel(id).catch(()=>{});});return;}
      if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled'){if(!checkpoint){emit(event);finish();return;}settling=true;void checkpoint.finalize().then(()=>{if(done)return;emit(event);finish();}).catch(error=>{settling=false;fail('CHECKPOINT_FINALIZE_FAILED',error instanceof Error?error.message:String(error),{},'checkpoint');});return;}
      emit(event);
    },input.from??0);
    const ms=(input.timeoutSeconds??180)*1000;timer=setTimeout(()=>{fail('RUN_TIMEOUT','Run timed out after '+ms+' ms',{},'runtime');void runtime.cancel(id).catch(()=>{});},ms);
  });
}

async function collectHeadlessRunV1(runtime:CliRuntime,input:CommonInput&{prompt:string},onEvent?:EventSink){
  const origin=keyOriginForRun(runtime,input.model);
  if(origin?.required&&origin.origin==='none'){const message=missingKeyMessage(origin);const failed=canonicalizeFailureEvent({schema:'talos.cli.event.v1',seq:1,ts:new Date().toISOString(),sessionId:'',type:'run.failed',data:{code:'PROVIDER_KEY_MISSING',message,provider:origin.provider}},'provider');onEvent?.(failed);return{events:onEvent?[]:[failed],result:createFailedRunResult({sessionId:null,code:String(failed.data.code),message:String(failed.data.message),details:{provider:origin.provider},component:'provider'})};}
  const notice=origin?keyOriginNotice(origin):null;const checkpoint=await beginTurnCheckpoint(runtime,input,'start');const id=await runtime.start(input);checkpoint?.bindSession(id);return collectV1(runtime,id,input,onEvent,notice?[notice]:[],checkpoint);
}
async function collectHeadlessRunV2(runtime:CliRuntime,input:CommonInput&{prompt:string},onEvent?:V2EventSink){
  const origin=keyOriginForRun(runtime,input.model);
  if(origin?.required&&origin.origin==='none'){const message=missingKeyMessage(origin);const event=createV2FailureEvent({sessionId:'',error:{code:'PROVIDER_KEY_MISSING',message,component:'provider',retryable:false},component:'provider',details:{provider:origin.provider},secretValues:secretValuesFromEnvironment(process.env)});const accumulator=createV2RunResultAccumulator();accumulator.add(event);onEvent?.(event);return{events:onEvent?[]:[event],result:accumulator.result()};}
  const notice=origin?keyOriginNotice(origin):null;const checkpoint=await beginTurnCheckpoint(runtime,input,'start');const id=await runtime.start(input);checkpoint?.bindSession(id);return collectV2(runtime,id,input,onEvent,notice?[notice]:[],checkpoint);
}

export function collectHeadlessRun(runtime:CliRuntime,input:V1Input&{prompt:string},onEvent?:EventSink):Promise<V1Collected>;
export function collectHeadlessRun(runtime:CliRuntime,input:V2Input&{prompt:string},onEvent?:V2EventSink):Promise<V2Collected>;
export function collectHeadlessRun(runtime:CliRuntime,input:CommonInput&{prompt:string},onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>;
export async function collectHeadlessRun(runtime:CliRuntime,input:CommonInput&{prompt:string},onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>{
  return input.protocolVersion==='v2'?collectHeadlessRunV2(runtime,input,onEvent as V2EventSink|undefined):collectHeadlessRunV1(runtime,input,onEvent as EventSink|undefined);
}

export function collectHeadlessResume(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:V1Input,onEvent?:EventSink):Promise<V1Collected>;
export function collectHeadlessResume(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:V2Input,onEvent?:V2EventSink):Promise<V2Collected>;
export function collectHeadlessResume(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>;
export async function collectHeadlessResume(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>{
  const checkpoint=await beginTurnCheckpoint(runtime,input,'resume',sessionId);const id=await runtime.resume(sessionId,prompt);checkpoint?.bindSession(id);return input.protocolVersion==='v2'?collectV2(runtime,id,input,onEvent as V2EventSink|undefined,[],checkpoint):collectV1(runtime,id,input,onEvent as EventSink|undefined,[],checkpoint);
}

export function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:V1Input,onEvent?:EventSink):Promise<V1Collected>;
export function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:V2Input,onEvent?:V2EventSink):Promise<V2Collected>;
export function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>;
export async function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>{
  const checkpoint=await beginTurnCheckpoint(runtime,input,'fork',sessionId);const id=await runtime.fork(sessionId,prompt);checkpoint?.bindSession(id);return input.protocolVersion==='v2'?collectV2(runtime,id,input,onEvent as V2EventSink|undefined,[],checkpoint):collectV1(runtime,id,input,onEvent as EventSink|undefined,[],checkpoint);
}

export function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:V1Input,onEvent?:EventSink):Promise<V1Collected>;
export function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:V2Input,onEvent?:V2EventSink):Promise<V2Collected>;
export function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>;
export async function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>{
  return input.protocolVersion==='v2'?collectV2(runtime,sessionId,input,onEvent as V2EventSink|undefined):collectV1(runtime,sessionId,input,onEvent as EventSink|undefined);
}

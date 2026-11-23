import {rememberSessionMode} from '../runtime/session-modes.ts';
import {createEventBridge,type CliEvent} from '../events/bridge.ts';
import {BACKGROUND_STOP_WAIT_MS,CliRuntimeError,type CliRuntime} from '../runtime/types.ts';
import {BACKGROUND_COMMANDS_STOPPED,backgroundStopNotice,stopBackgroundCommands} from './background.ts';
import {canonicalizeFailureEvent,createFailedRunResult,createRunResultAccumulator,resumesAfterContextStop,type RunResult} from './result.ts';
import {createPermissionEngine,type AutoClassifier} from '../security/permission-engine.ts';
import type {PermissionMode,RuleSetInput} from '../security/types.ts';
import {permissionActionFromApproval} from '../security/from-approval.ts';
import {automaticApproval} from '../tui/approval.ts';
import {backslashGlobSecretCheck,kernelSecretClassifier} from '../security/permission-dry-run.ts';
import {findTalosRepoRoot} from '../runtime/repo.ts';
/* F-P-004 (stress test 0.5.5): the kernel's secret check, asked again with cmd's reading of `\` (permission-dry-run.ts). */
export function sessionSecretRecheck(projectRoot:string){return backslashGlobSecretCheck(kernelSecretClassifier(findTalosRepoRoot(process.cwd()),projectRoot));}
import {secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {keyOriginForRun,keyOriginNotice} from '../provider/environment-keys.ts';
/* R2 (E8 / Q-R2-7): the one missing-key sentence, also the JSON `message` of v1 and v2; the code stays PROVIDER_KEY_MISSING. */
import {missingKeyText} from '../provider/missing-key.ts';
import {checkpointMutationAllowed} from '../workspace/checkpoint.ts';
import {checkpointChanges,createCheckpointStore,sessionCheckpoints,type CheckpointHandle,type CheckpointOperation} from '../workspace/checkpoint-store.ts';
import {createV2EventBridge,createV2FailureEvent,createV2RunResultAccumulator,createV2SyntheticEvent} from '../protocol/v2/events.ts';
import {t} from '../i18n/index.ts';
import type {TalosProtocolVersion,TalosV2Event,TalosV2RunResult} from '../protocol/v2/types.ts';
import {resolve} from 'node:path';
import {createChildrenTracker} from './children.ts';
import {denialNotice,denialReasonForModel,permissionDenial,TOOL_PERMISSION_DENIED} from './denials.ts';
import {redactObject} from '../diagnostics/redact.ts';

/* R3 Q-R3-8b: `signal` = the person pressed Ctrl+C (main.ts); `interruptGraceMs` = how long the kernel may take to end the run. */
/* C-006: `toolOutputRoot` = `<dataRoot>/tool-output`; the run's session may read its own saved outputs there. */
/* `attachIfTooLarge` (0.6.13, `--attach-if-too-large`): a request too large for the model goes as an attachment (kernel `allegaSeTroppoGrande`) */
type CommonInput={attachIfTooLarge?:boolean;toolOutputRoot?:string;projectRoot:string;model:string;explicitModel?:string;permissionMode:PermissionMode;timeoutSeconds?:number;permissionRules?:RuleSetInput;autoClassifier?:AutoClassifier;from?:number;checkpointsRoot?:string;protocolVersion?:TalosProtocolVersion;signal?:AbortSignal;interruptGraceMs?:number;agentWakeGraceMs?:number;backgroundStopWaitMs?:number};
const INTERRUPT_GRACE_MS=5_000;
/*
 * R3 Q-R3-8b, gate E8. Ctrl+C on `talos -p` asks the runtime to stop the run and waits for its terminal event (at most
 * `interruptGraceMs`), then ends the output with an interrupted run: v1 a failure with code INTERRUPTED, v2 a
 * `run.cancelled` (outcome `cancelled`, envelope INTERRUPTED); both exit 130 (`exitCodeForEnvelope`, errors.ts). A run that
 * completed before the stop took effect stays completed; any other failure stays that failure. Precedents in the window:
 * Hermes `-q` exit 130 (`cli_single_query.py:148-167`), Gemini/Qwen `FatalCancellationError` exit 130 (gate §6.2).
 */
function watchInterrupt(input:CommonInput,onStop:()=>void,onGiveUp:()=>void){
  let timer:NodeJS.Timeout|undefined;let stopped=false;let disposed=false;
  /* ASYNC step 6: `onStop` may end the run at once (an idle session, children.ts); then no grace is armed — it would only
     hold the process open for its whole length. */
  const stop=()=>{if(stopped)return;stopped=true;onStop();if(!disposed)timer=setTimeout(onGiveUp,input.interruptGraceMs??INTERRUPT_GRACE_MS);};
  input.signal?.addEventListener('abort',stop,{once:true});
  return{start(){if(input.signal?.aborted)stop();},get stopped(){return stopped;},dispose(){disposed=true;if(timer)clearTimeout(timer);input.signal?.removeEventListener('abort',stop);}};
}
/* C-005: what a non-allow decision refuses with. `ask` cannot happen here (the engine never asks when not interactive), and
   is read as the same PERMISSION_REQUIRED the engine gives. */
const refusal=(decision:{kind:string;code?:string;message?:string}):{code:string;message:string}=>decision.kind==='deny'&&decision.code?{code:decision.code,message:decision.message??''}:{code:'PERMISSION_REQUIRED',message:'Operation requires approval in non-interactive mode'};
/*
 * C-007 (benchmark ticket, owner 01/10): a checkpoint that cannot be saved never changes the run's outcome — the work is done
 * and the answer was given (in both trials the last event was message.completed). It is a warning that says what it costs:
 * /undo cannot go back to before this turn. Before, CHECKPOINT_FINALIZE_FAILED replaced run.completed and exited non-zero.
 */
const CHECKPOINT_FINALIZE_FAILED='CHECKPOINT_FINALIZE_FAILED';
const checkpointNotSavedNotice=(error:unknown)=>`The run went on, but its checkpoint could not be saved (${CHECKPOINT_FINALIZE_FAILED}: ${error instanceof Error?error.message:String(error)}): /undo cannot go back to before this turn.`;
const isKernelStop=(code:unknown)=>code==='fermato'||code==='INTERRUPTED'||code==='CANCELLED';
/*
 * ASYNC step 6 (owner 01/10: «talos -p aspetta i figli»). After a completed turn the run goes on while delegated agents
 * work or their results are not answered yet (children.ts), and ends when the session is idle with nothing to wait for.
 * Whatever ends the run otherwise — a failure, Ctrl+C, the timeout — stops the children still working: in a one-shot
 * run nobody would read them (Claude Code's print mode stops its background tasks at its ceiling too).
 */
/*
 * 0.6.8 (second review of 0.6.8, finding 4, S3): a sub-agent's approval was never answered in `talos -p` — only the root's — so a
 * child that read `.env` held the run until RUN_TIMEOUT (180 s), in every mode. The children are known from the root's events
 * (the tracker); each one's own events are now followed, and an approval still waiting at the end of the replay, or asked later,
 * goes to the same decision as the root's (`onChildApproval`). Like the screen's descendant-approvals.ts, without its polling.
 */
/* 0.6.8 (gate on a81793871, s59): with nobody in front the kernel closes some person-only requests itself (the repeated-call
   question) before the CLI's answer arrives; that answer then meets APPROVAL_NOT_PENDING. The kernel's turn says its own reason,
   so a request it already closed is no failure of the run (the screen ignores the same refusal). */
const alreadyClosed=(error:unknown)=>(error as {code?:unknown}|null)?.code==='APPROVAL_NOT_PENDING';
function childWait(runtime:CliRuntime,input:CommonInput,onSettled:()=>void,onChildApproval?:(childId:string,raw:Record<string,unknown>)=>void){
  const children=createChildrenTracker(input.agentWakeGraceMs!==undefined?{graceMs:input.agentWakeGraceMs}:{});
  const followed=new Map<string,()=>void>();
  const follow=(rootId:string|null)=>{
    if(!onChildApproval)return;
    for(const child of children.known()){
      if(child===rootId||followed.has(child))continue;
      let replaying=true;const waiting=new Map<string,Record<string,unknown>>();let off=()=>{};
      try{off=runtime.subscribe(child,(raw:unknown)=>{
        const row=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;const requestId=typeof row?.requestId==='string'?row.requestId:null;
        if(!row||!requestId)return;
        if(row.type==='ApprovalRequested'){if(replaying)waiting.set(requestId,row);else onChildApproval(child,row);}
        else if(row.type==='ApprovalResolved')waiting.delete(requestId);
      });}catch{continue;}
      finally{replaying=false;}
      followed.set(child,off);
      for(const row of waiting.values())onChildApproval(child,row);
    }
  };
  let idle=false,later=false,poll:NodeJS.Timeout|undefined;
  const check=()=>{if(idle&&!children.waiting(Date.now()))onSettled();};
  const stopped=new Set<string>();
  /* 05/11/2026: Ctrl+C stops the children as the person; the end of the run (timeout, failure, nobody to read them) as the system */const stopChildren=(by:'person'|'system'='person')=>{for(const child of children.working())if(!stopped.has(child)){stopped.add(child);void runtime.cancel(child,by==='system'?{by}:undefined).catch(()=>{});}};
  return{
    observe(raw:unknown,rootId:string|null=null){children.observe(raw);if((raw as {type?:unknown}|null)?.type==='RunStarted')idle=false;follow(rootId);},
    get idle(){return idle;},
    /** A turn of this run has already ended: the later ones are the kernel's wakes. */
    get later(){return later;},
    turnEnded(){idle=true;later=true;if(!children.waiting(Date.now())){onSettled();return;}poll??=setInterval(check,250);},
    /** F-ENG-2: whether the turn that just ended is the run's last one (nothing left to wait for). */
    settlesNow:()=>!children.waiting(Date.now()),
    /** F-ENG-2: the run's session and every delegated agent it has seen: whose background commands the end stops. */
    sessionIds:(id:string)=>[id,...children.known().filter(child=>child!==id)],
    stopChildren,
    dispose(){if(poll)clearInterval(poll);poll=undefined;stopChildren('system');for(const off of followed.values()){try{off();}catch{/* nothing to undo */}}followed.clear();},
  };
}
type EventSink=(event:CliEvent)=>void;
type V2EventSink=(event:TalosV2Event)=>void;
type AnyEventSink=(event:any)=>void;
type V1Collected={events:CliEvent[];result:RunResult};
type V2Collected={events:TalosV2Event[];result:TalosV2RunResult};
type V1Input=CommonInput&{protocolVersion?:'v1'};
type V2Input=CommonInput&{protocolVersion:'v2'};

function noticeEvent(sessionId:string,seq:number,message:string):CliEvent{return{schema:'talos.cli.event.v1',seq,ts:new Date().toISOString(),sessionId,type:'warning',data:{code:'PROVIDER_KEY_ORIGIN',message}};}
type HeadlessTurnCheckpoint=Pick<CheckpointHandle,'bindSession'|'observe'>&{finalize():Promise<unknown>;since:string};
async function beginTurnCheckpoint(runtime:CliRuntime,input:CommonInput,operation:CheckpointOperation,sessionId?:string|null):Promise<HeadlessTurnCheckpoint|null>{
  if(!input.checkpointsRoot)return null;
  const since=new Date().toISOString();
  const owner=runtime.modelCheckpoints;
  if(owner&&resolve(owner.projectRoot)===resolve(input.projectRoot)&&resolve(owner.rootDir)===resolve(input.checkpointsRoot)&&await(owner.canDefer?.()??true)){
    let id=sessionId??null;
    // The composition snapshots at the pre-mutation barrier. Still wait for its durable post-state.
    return{since,bindSession(sessionId){id=sessionId;},observe(){},async finalize(){if(!id)throw new Error('CHECKPOINT_SESSION_MISSING');await owner.settle(id);}};
  }
  if(operation==='start'&&!checkpointMutationAllowed(input.permissionMode))return null;
  const store=createCheckpointStore({rootDir:input.checkpointsRoot,projectRoot:input.projectRoot});
  /* D1: a checkpoint that cannot be taken never stops the run; it runs without /undo */
  try{return Object.assign(await store.begin({operation,...(sessionId?{sessionId}:{})}),{since});}catch{return null;}
}
/*
 * Stress test 0.5.3/0.5.4, known issue (i): the `-p` result always said `changedFiles: []`. The result is built from `file.changed`
 * events, but the kernel has no such event: it broadcasts `WorkspaceChanged` from a debounced folder watcher, which a short run
 * outlives and which also sees changes nobody in the run made. The turn's own checkpoints know exactly what the run changed
 * (`checkpointChanges`, the comparison `/undo` restores): after they are final, their paths become the run's `file.changed` events.
 */
export async function turnChangedFiles(input:Pick<CommonInput,'checkpointsRoot'|'projectRoot'>,sessionId:string,since:string):Promise<string[]>{
  if(!input.checkpointsRoot)return[];
  try{
    const store=createCheckpointStore({rootDir:input.checkpointsRoot,projectRoot:input.projectRoot});
    const rows=(await sessionCheckpoints(store,sessionId)).filter(row=>String(row.createdAt)>=since);
    return[...new Set(rows.flatMap(row=>checkpointChanges(row).map(change=>change.path)))].sort();
  }catch{return[];}
}

function collectV1(runtime:CliRuntime,id:string,input:CommonInput,onEvent?:EventSink,notices:readonly string[]=[],checkpoint:HeadlessTurnCheckpoint|null=null):Promise<{events:CliEvent[];result:RunResult}>{
  const engine=createPermissionEngine({/* R2-F1 (cure 208 bis): trust taken away mid-run asks */askEverything:()=>runtime.folderTrust?.()===false,projectRoot:input.projectRoot,...(input.toolOutputRoot?{toolOutputRoot:input.toolOutputRoot}:{}),rules:input.permissionRules??{allow:[],ask:[],deny:[]},mode:input.permissionMode,...(input.autoClassifier?{classifier:input.autoClassifier}:{}),secretRecheck:sessionSecretRecheck(input.projectRoot)});
  const bridge=createEventBridge(id,undefined,secretValuesFromEnvironment(process.env));const events:CliEvent[]=[];const accumulator=createRunResultAccumulator();const offset=notices.length;
  for(const [index,message] of notices.entries()){const event=noticeEvent(id,index+1,message);if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);}
  return new Promise((resolve)=>{
    let done=false;let settling=false;let closing=false;let timer:NodeJS.Timeout|undefined;let unsub=()=>{};let lastSeq=offset;
    const wait=childWait(runtime,input,()=>close(),(childId,raw)=>{void (async()=>{const action=permissionActionFromApproval(raw);const requestId=String(raw.requestId);const decision=await engine.decide(action,{interactive:false,mode:input.permissionMode,sessionId:childId});if(decision.kind==='allow'){await runtime.answerApproval(childId,requestId,true,automaticApproval(decision.source));return;}const denial=permissionDenial(requestId,action,refusal(decision));if(!done)emit(shift(bridge.synthesize('warning',{code:TOOL_PERMISSION_DENIED,message:denialNotice(denial),denial})));await runtime.answerApproval(childId,requestId,false,denialReasonForModel(denial));})().catch(()=>{/* the child's turn reports its own end */});});
    const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);wait.dispose();interrupt.dispose();unsub();resolve({events,result:accumulator.result()});};
    /* F-ENG-2: every end — the last turn, a failure, the timeout, Ctrl+C — first stops the background commands (they would keep this
       process alive) and says so BEFORE the terminal event: nothing follows the terminal event, so the warning takes its place in the
       sequence and the terminal moves one on. Only an end found later by the children's grace has its terminal event already out. */
    const close=(terminal?:CliEvent)=>{if(done||closing)return;closing=true;if(timer)clearTimeout(timer);const waitMs=input.backgroundStopWaitMs??BACKGROUND_STOP_WAIT_MS;
      void stopBackgroundCommands(runtime,wait.sessionIds(id),waitMs).then(stops=>{
        if(stops.length){const warning=shift(bridge.synthesize('warning',{code:BACKGROUND_COMMANDS_STOPPED,message:backgroundStopNotice(stops,waitMs),stops}));if(terminal){warning.seq=terminal.seq;terminal.seq+=1;}emit(warning);}
        if(terminal)emit(terminal);finish();
      });};
    const shift=(event:CliEvent):CliEvent=>offset?{...event,seq:event.seq+offset}:event;
    const emit=(event:CliEvent)=>{lastSeq=Math.max(lastSeq,event.seq);if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);};
    const fail=(code:string,message:string,details:Record<string,unknown>={},component='runtime')=>{if(done||closing)return;close(canonicalizeFailureEvent({schema:'talos.cli.event.v1',seq:lastSeq+1,ts:new Date().toISOString(),sessionId:id,type:'run.failed',data:{...details,code,message}},component));};
    const interrupted=()=>fail('INTERRUPTED',t('error.run.interrupted.what'),{},'runtime');
    const interrupt=watchInterrupt(input,()=>{wait.stopChildren();void runtime.cancel(id).catch(()=>{});if(wait.idle)interrupted();},interrupted);
    unsub=runtime.subscribe(id,(raw)=>{
      wait.observe(raw,id);
      if(done||settling||closing)return;checkpoint?.observe(raw);
      /* C4(c) of decision 245: the answer that stopped for the context is not the result; the stream keeps both */
      if(resumesAfterContextStop(raw))accumulator.resumedAfterContextStop();
      const translated=bridge.translate(raw);if(!translated)return;const event=canonicalizeFailureEvent(shift(translated));
      if(interrupt.stopped&&event.type==='run.failed'&&isKernelStop((translated.data as any)?.code)){if(!checkpoint){interrupted();return;}settling=true;void checkpoint.finalize().then(interrupted,interrupted);return;}
      if(event.type==='approval.required'){emit(event);void (async()=>{/* 0.6.8 (stress test of 0.6.7, F-P-001, S0): decided from the KERNEL's event (`azione.segreto`, `percorsoDiRete`), never from the v2 translation, where the secret class was renamed and lost and a secret was read without asking */const action=permissionActionFromApproval(raw&&typeof raw==='object'&&(raw as Record<string,unknown>).azione?raw as Record<string,unknown>:event.data);const requestId=String(event.data.requestId);const decision=await engine.decide(action,{interactive:false,mode:input.permissionMode,sessionId:id});if(decision.kind==='allow'){await runtime.answerApproval(id,requestId,true,automaticApproval(decision.source));return;}const denial=permissionDenial(requestId,action,refusal(decision));if(!done)emit(shift(bridge.synthesize('warning',{code:TOOL_PERMISSION_DENIED,message:denialNotice(denial),denial})));await runtime.answerApproval(id,requestId,false,denialReasonForModel(denial));})().catch(error=>{if(alreadyClosed(error))return;fail('PERMISSION_ENGINE_ERROR',error instanceof Error?error.message:String(error),{},'permission-engine');void runtime.cancel(id,{by:'system'}).catch(()=>{});});return;}
      /* ASYNC step 6: a completed turn ends the run only when no delegated agent is left to wait for (childWait). */
      const end=()=>{if(event.type==='run.completed'&&!wait.settlesNow()){emit(event);wait.turnEnded();return;}close(event);};
      if(event.type==='run.completed'||event.type==='run.failed'){if(!checkpoint||wait.later){end();return;}settling=true;void checkpoint.finalize().then(()=>turnChangedFiles(input,id,checkpoint.since)).then(paths=>{if(done)return;settling=false;for(const path of paths)emit(shift(bridge.synthesize('file.changed',{path})));end();}).catch(error=>{if(done)return;settling=false;emit(shift(bridge.synthesize('warning',{code:CHECKPOINT_FINALIZE_FAILED,message:checkpointNotSavedNotice(error)})));end();});return;}
      emit(event);
    },input.from??0);
    interrupt.start();
    const ms=(input.timeoutSeconds??180)*1000;timer=setTimeout(()=>{fail('RUN_TIMEOUT','Run timed out after '+ms+' ms',{},'runtime');void runtime.cancel(id,{by:'system'}).catch(()=>{});},ms);
  });
}

function collectV2(runtime:CliRuntime,id:string,input:CommonInput,onEvent?:V2EventSink,notices:readonly string[]=[],checkpoint:HeadlessTurnCheckpoint|null=null):Promise<{events:TalosV2Event[];result:TalosV2RunResult}>{
  const engine=createPermissionEngine({/* R2-F1 (cure 208 bis): trust taken away mid-run asks */askEverything:()=>runtime.folderTrust?.()===false,projectRoot:input.projectRoot,...(input.toolOutputRoot?{toolOutputRoot:input.toolOutputRoot}:{}),rules:input.permissionRules??{allow:[],ask:[],deny:[]},mode:input.permissionMode,...(input.autoClassifier?{classifier:input.autoClassifier}:{}),secretRecheck:sessionSecretRecheck(input.projectRoot)});
  const secrets=secretValuesFromEnvironment(process.env);const bridge=createV2EventBridge(id,undefined,secrets);const events:TalosV2Event[]=[];const accumulator=createV2RunResultAccumulator();
  for(const [index,message] of notices.entries()){const event=createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':provider-notice:'+(index+1),type:'warning',data:{code:'PROVIDER_KEY_ORIGIN',message}});if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);}
  return new Promise((resolve)=>{
    let done=false;let settling=false;let closing=false;let timer:NodeJS.Timeout|undefined;let unsub=()=>{};let checkpointWarnings=0;
    const wait=childWait(runtime,input,()=>close(),(childId,raw)=>{void (async()=>{const action=permissionActionFromApproval(raw);const requestId=String(raw.requestId);const decision=await engine.decide(action,{interactive:false,mode:input.permissionMode,sessionId:childId});if(decision.kind==='allow'){await runtime.answerApproval(childId,requestId,true,automaticApproval(decision.source));return;}const denial=permissionDenial(requestId,action,refusal(decision));if(!done)emit(createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':permission-denied:'+encodeURIComponent(childId)+':'+encodeURIComponent(requestId),type:'warning',data:redactObject({code:TOOL_PERMISSION_DENIED,message:denialNotice(denial),denial},secrets) as Record<string,unknown>}));await runtime.answerApproval(childId,requestId,false,denialReasonForModel(denial));})().catch(()=>{/* the child's turn reports its own end */});});
    const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);wait.dispose();interrupt.dispose();unsub();resolve({events,result:accumulator.result()});};
    const emit=(event:TalosV2Event)=>{if(!onEvent)events.push(event);accumulator.add(event);onEvent?.(event);};
    /* F-ENG-2: as in v1 — the background commands are stopped and announced before the terminal event */
    const close=(terminal?:TalosV2Event)=>{if(done||closing)return;closing=true;if(timer)clearTimeout(timer);const waitMs=input.backgroundStopWaitMs??BACKGROUND_STOP_WAIT_MS;
      void stopBackgroundCommands(runtime,wait.sessionIds(id),waitMs).then(stops=>{
        if(stops.length)emit(createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':background-stopped',type:'warning',data:redactObject({code:BACKGROUND_COMMANDS_STOPPED,message:backgroundStopNotice(stops,waitMs),stops},secrets) as Record<string,unknown>}));
        if(terminal)emit(terminal);finish();
      });};
    const fail=(code:string,message:string,details:Record<string,unknown>={},component='runtime')=>{if(done||closing)return;close(createV2FailureEvent({sessionId:id,error:{code,message,component,retryable:false},component,details,secretValues:secrets}));};
    const interrupted=()=>{if(done||closing)return;close(createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':interrupted',type:'run.cancelled',data:{reason:t('error.run.interrupted.what'),interrupted:true},durability:'durable'}));};
    const interrupt=watchInterrupt(input,()=>{wait.stopChildren();void runtime.cancel(id).catch(()=>{});if(wait.idle)interrupted();},interrupted);
    unsub=runtime.subscribe(id,(raw)=>{
      wait.observe(raw,id);
      if(done||settling||closing)return;checkpoint?.observe(raw);
      /* C4(c) of decision 245, as in v1 */
      if(resumesAfterContextStop(raw))accumulator.resumedAfterContextStop();
      const event=bridge.translate(raw);if(!event)return;
      if(interrupt.stopped&&(event.type==='run.failed'||event.type==='run.cancelled')&&(event.type==='run.cancelled'||isKernelStop((event.data as any)?.error?.envelope?.code))){if(!checkpoint){interrupted();return;}settling=true;void checkpoint.finalize().then(interrupted,interrupted);return;}
      if(event.type==='approval.required'){emit(event);void (async()=>{/* 0.6.8 (stress test of 0.6.7, F-P-001, S0): decided from the KERNEL's event (`azione.segreto`, `percorsoDiRete`), never from the v2 translation, where the secret class was renamed and lost and a secret was read without asking */const action=permissionActionFromApproval(raw&&typeof raw==='object'&&(raw as Record<string,unknown>).azione?raw as Record<string,unknown>:event.data);const requestId=String(event.data.requestId??'');const decision=await engine.decide(action,{interactive:false,mode:input.permissionMode,sessionId:id});if(decision.kind==='allow'){await runtime.answerApproval(id,requestId,true,automaticApproval(decision.source));return;}const denial=permissionDenial(requestId,action,refusal(decision));if(!done)emit(createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':permission-denied:'+encodeURIComponent(requestId),type:'warning',data:redactObject({code:TOOL_PERMISSION_DENIED,message:denialNotice(denial),denial},secrets) as Record<string,unknown>}));await runtime.answerApproval(id,requestId,false,denialReasonForModel(denial));})().catch(error=>{if(alreadyClosed(error))return;fail('PERMISSION_ENGINE_ERROR',error instanceof Error?error.message:String(error),{},'permission-engine');void runtime.cancel(id,{by:'system'}).catch(()=>{});});return;}
      /* ASYNC step 6: a completed turn ends the run only when no delegated agent is left to wait for (childWait). */
      const end=()=>{if(event.type==='run.completed'&&!wait.settlesNow()){emit(event);wait.turnEnded();return;}close(event);};
      if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled'){if(!checkpoint||wait.later){end();return;}settling=true;void checkpoint.finalize().then(()=>turnChangedFiles(input,id,checkpoint.since)).then(paths=>{if(done)return;settling=false;for(const [index,path] of paths.entries())emit(createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':file-changed:'+checkpoint.since+':'+index,type:'file.changed',data:{path}}));end();}).catch(error=>{if(done)return;settling=false;emit(createV2SyntheticEvent({sessionId:id,eventId:'talos:'+encodeURIComponent(id)+':checkpoint-not-saved:'+(++checkpointWarnings),type:'warning',data:redactObject({code:CHECKPOINT_FINALIZE_FAILED,message:checkpointNotSavedNotice(error)},secrets) as Record<string,unknown>}));end();});return;}
      emit(event);
    },input.from??0);
    interrupt.start();
    const ms=(input.timeoutSeconds??180)*1000;timer=setTimeout(()=>{fail('RUN_TIMEOUT','Run timed out after '+ms+' ms',{},'runtime');void runtime.cancel(id,{by:'system'}).catch(()=>{});},ms);
  });
}

async function collectHeadlessRunV1(runtime:CliRuntime,input:CommonInput&{prompt:string},onEvent?:EventSink){
  const origin=keyOriginForRun(runtime,input.model);
  if(origin?.required&&origin.origin==='none'){const message=missingKeyText(origin.provider);const failed=canonicalizeFailureEvent({schema:'talos.cli.event.v1',seq:1,ts:new Date().toISOString(),sessionId:'',type:'run.failed',data:{code:'PROVIDER_KEY_MISSING',message,provider:origin.provider}},'provider');onEvent?.(failed);return{events:onEvent?[]:[failed],result:createFailedRunResult({sessionId:null,code:String(failed.data.code),message:String(failed.data.message),details:{provider:origin.provider},component:'provider'})};}
  const notice=origin?keyOriginNotice(origin):null;const checkpoint=await beginTurnCheckpoint(runtime,input,'start');const id=await runtime.start(input);checkpoint?.bindSession(id);return collectV1(runtime,id,input,onEvent,notice?[notice]:[],checkpoint);
}
async function collectHeadlessRunV2(runtime:CliRuntime,input:CommonInput&{prompt:string},onEvent?:V2EventSink){
  const origin=keyOriginForRun(runtime,input.model);
  if(origin?.required&&origin.origin==='none'){const message=missingKeyText(origin.provider);const event=createV2FailureEvent({sessionId:'',error:{code:'PROVIDER_KEY_MISSING',message,component:'provider',retryable:false,provider:origin.provider},component:'provider',details:{provider:origin.provider},secretValues:secretValuesFromEnvironment(process.env)});const accumulator=createV2RunResultAccumulator();accumulator.add(event);onEvent?.(event);return{events:onEvent?[]:[event],result:accumulator.result()};}
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
  /* ⛔ N1 (owner 05/10, misurato dal vivo, registro 05/10 pomeriggio): un resume SENZA prompt non deve far ripartire
     il giro pendente della sessione. Prima: `--resume <id> < NUL` arrivava qui con prompt vuoto, chiamava
     `runtime.resume(id,'')` e il kernel CONTINUAVA il giro pendente — una chiamata vera al modello con 283.386
     token di prompt e TTFT 59,7 s, ripetuta a ogni avvio (RunStarted 62 vs RunFinished 55 nel jsonl). Codex rifiuta
     senza prompt («Provide a prompt to continue»), claude rifiuta senza TTY; qui la risposta onesta è il REPLAY
     sincrono della sessione più un warning che dice che il giro NON è ripartito. Misura del 05/10 pomeriggio: il
     replay del kernel è SINCRONO dentro `subscribe` (TUI: `replayingHistory` attorno alla sola subscribe) — il
     collettore di giro aspetterebbe per sempre un terminale che non arriva (RUN_TIMEOUT 180 s misurato dal vivo),
     quindi qui si replaya, si conta e si risponde subito. Con un prompt il comportamento resta quello di prima. */
  if(!String(prompt??'').trim()){
    /* Revisione critica 07/10: un id che il runtime non conosce non è un replay. Il kernel risponde a `subscribe` di un id
       sconosciuto con zero eventi e senza errore, e senza questo controllo il comando dichiarava ok:true, exit 0 («the session
       is readable»); prima di N1 falliva con SESSION_NOT_FOUND (exit 15), come Codex («Session not found: {id}»,
       exec/src/lib.rs:1037) e OpenCode (run.ts:465). */
    if(typeof runtime.listSessions==='function'){
      const known=await runtime.listSessions();
      if(!known.some((row:any)=>row?.sessionId===sessionId||row?.id===sessionId))throw new CliRuntimeError('SESSION_NOT_FOUND','SESSION_NOT_FOUND',{sessionId});
    }
    /* review B #5: an explicitly typed --model that the replay discards must not vanish without a word. */
    const messaggioBase='No prompt given: the pending turn was not restarted; the session was replayed as-is. Pass a prompt or pipe one to continue the turn.';
    const messaggio=input.explicitModel?`${messaggioBase} The --model flag was ignored: without a prompt there is no turn to apply it to.`:messaggioBase;
    let riprodotti=0;
    const stopReplay=runtime.subscribe(sessionId,()=>{riprodotti+=1;},0);
    if(typeof stopReplay==='function'){try{stopReplay();}catch{/* il replay sincrono è già finito */}}
    const sintesi=`Replayed ${riprodotti} historical events; the session is readable and no model turn was started.`;
    if(input.protocolVersion==='v2'){
      const warning=createV2SyntheticEvent({sessionId,eventId:'talos:'+encodeURIComponent(sessionId)+':headless-resume-no-prompt',type:'warning',data:{code:'HEADLESS_RESUME_NO_PROMPT',message:messaggio}});
      if(onEvent){try{onEvent(warning);}catch{/* chi guarda non ferma il replay */}}
      const risultato:TalosV2RunResult={schema:'talos.cli.result.v2',version:2,ok:true,sessionId,cursor:null,outcome:'completed',result:{text:sintesi,changedFiles:[],usage:{historicalEvents:riprodotti}},warnings:[messaggio],toolResults:[]};
      return{events:[warning],result:risultato};
    }
    const warningV1={schema:'talos.cli.event.v1',seq:0,ts:new Date().toISOString(),sessionId,type:'warning',data:{code:'HEADLESS_RESUME_NO_PROMPT',message:messaggio}} as unknown as TalosV2Event;
    if(onEvent){try{onEvent(warningV1);}catch{/* chi guarda non ferma il replay */}}
    const risultatoV1={schema:'talos.cli.result.v1',ok:true,sessionId,result:{text:sintesi,outcome:'success' as const,changedFiles:[],usage:{historicalEvents:riprodotti}},warnings:[messaggio]} as unknown as RunResult;
    return{events:[warningV1 as unknown as CliEvent],result:risultatoV1};
  }
  const checkpoint=await beginTurnCheckpoint(runtime,input,'resume',sessionId);rememberSessionMode(sessionId,input.permissionMode);const id=await runtime.resume(sessionId,prompt,undefined,resumeOptions(input));checkpoint?.bindSession(id);return input.protocolVersion==='v2'?collectV2(runtime,id,input,onEvent as V2EventSink|undefined,[],checkpoint):collectV1(runtime,id,input,onEvent as EventSink|undefined,[],checkpoint);
}

export function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:V1Input,onEvent?:EventSink):Promise<V1Collected>;
export function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:V2Input,onEvent?:V2EventSink):Promise<V2Collected>;
export function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>;
export async function collectHeadlessFork(runtime:CliRuntime,sessionId:string,prompt:string|undefined,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>{
  const checkpoint=await beginTurnCheckpoint(runtime,input,'fork',sessionId);const id=await runtime.fork(sessionId,prompt,undefined,modelOverride(input));rememberSessionMode(id,input.permissionMode);checkpoint?.bindSession(id);return input.protocolVersion==='v2'?collectV2(runtime,id,input,onEvent as V2EventSink|undefined,[],checkpoint):collectV1(runtime,id,input,onEvent as EventSink|undefined,[],checkpoint);
}

/* RICERCA 5×5×5×5 cambio-modello (2026-10-05, dossier §5.1-5.2); review B #1 (2026-10-06): the flag travels in
   `explicitModel`, NOT in `model` — the entry point (main.ts) always fills `model` with the configured default
   (selectedModel = config ?? wired fallback), so reading `model` here persisted that default over the session's saved
   model on every resume/fork given without --model. Only a flag the person actually typed is an override; absent or
   blank = no option, and the runtime keeps the right precedence (saved session model > default), the same as Codex
   `ResumeModelSettings::RestoreFromThread` and the Claude Code doc (`cc-doc-model-config.md:141`). */
function modelOverride(input:CommonInput):{model:string}|undefined{
  const model=typeof input.explicitModel==='string'?input.explicitModel.trim():'';
  return model?{model}:undefined;
}
/* 0.6.13: `--attach-if-too-large` reaches a resumed turn too (a new one reads it from its start input, session-facade.ts `start`).
   A fork's prompt goes through the kernel's queue, which has no run options: there the flag is not carried. */
function resumeOptions(input:CommonInput):{model?:string;attachIfTooLarge?:boolean}|undefined{
  const options={...modelOverride(input),...(input.attachIfTooLarge===true?{attachIfTooLarge:true}:{})};
  return Object.keys(options).length?options:undefined;
}

export function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:V1Input,onEvent?:EventSink):Promise<V1Collected>;
export function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:V2Input,onEvent?:V2EventSink):Promise<V2Collected>;
export function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>;
export async function collectHeadlessSession(runtime:CliRuntime,sessionId:string,input:CommonInput,onEvent?:AnyEventSink):Promise<V1Collected|V2Collected>{
  return input.protocolVersion==='v2'?collectV2(runtime,sessionId,input,onEvent as V2EventSink|undefined):collectV1(runtime,sessionId,input,onEvent as EventSink|undefined);
}

import {randomUUID} from 'node:crypto';
import type {CliAttachment} from '../runtime/attachments.ts';
import type {CliRuntime} from '../runtime/types.ts';
import {buildAgentTree} from '../runtime/agent-tree.ts';
import type {PermissionAction,PermissionMode,RuleSetInput} from '../security/types.ts';
import type {AutoClassifier} from '../security/permission-engine.ts';
import {createPermissionEngine} from '../security/permission-engine.ts';
import {createApprovalCoordinator,type UserApprovalChoice} from './approval.ts';
import {createTuiEventAdapter,type TuiEvent} from './event-adapter.ts';
import {permissionActionFromApproval} from '../security/from-approval.ts';
import {persistPermissionRule} from '../security/persist.ts';
import type {CliPaths} from '../paths.ts';
import {EXECUTION_TEXT} from '../runtime/brokered-executor.ts';import {secretValuesFromEnvironment} from '../diagnostics/redact.ts';import {normalizeSessions} from './overlays/session-picker.ts';
import {explainApproval,type ApprovalExplanationData} from './overlays/approval-dialog.ts';
import {resolveProjectReferences} from './project-references.ts';
import {createQueueStore,type QueueStoreEntry} from './queue-store.ts';
import {checkpointMutationAllowed} from '../workspace/checkpoint.ts';
import {createCheckpointStore,type CheckpointHandle} from '../workspace/checkpoint-store.ts';

// `explanation`, `alwaysSimulation` and `explanationError` (B1 slice 13) are the per-segment account
// and the simulation of "allow always", computed once from the same rules the engine decided with.
/*
 * B1 slice 18 — a send asks before anything leaves the machine. `readiness` answers whether a provider has
 * been chosen, whether the model belongs to it and whether its key is usable; when it is not, the send throws
 * a coded error that names the provider and neither `start` nor `resume` is called.
 */
export type TuiSendReadiness={ready:true}|{ready:false;code:string;provider:string|null;message:string};
export class TuiNotReadyError extends Error{code:string;provider:string|null;constructor(code:string,provider:string|null,message:string){super(message);this.name='TuiNotReadyError';this.code=code;this.provider=provider;}}

export type PendingTuiApproval={requestId:string;sessionId:string;action:PermissionAction;rawPayload:Record<string,unknown>;reason:string;rule?:string;runtimeHint?:string}&ApprovalExplanationData;
export type TuiQueuedAction={kind:'prompt'|'command';text:string;attachments?:CliAttachment[]};
export type TuiQueueEntry={id:string;kind:'prompt'|'command';text:string;status:'pending'|'uncertain';attachments?:CliAttachment[]};
export type TuiSendOutcome={sessionId:string|null;kind:'prompt'|'command'|'none';queued:boolean;position:number};
export type TuiSteerState=
 | {status:'requested';redirectId:string}
 | {status:'applied';redirectId:string}
 | {status:'cancelled';redirectId:string}
 | {status:'failed';redirectId:string;code:string;message:string}
 | {status:'rejected';code:string;message:string};
export type TuiSteerOutcome={status:'requested';redirectId:string}|{status:'rejected';code:string;message:string};
export type TuiPreparationState={active:boolean;operation:'start'|'resume'|'fork'};

export function createTuiSessionController({runtime,projectRoot,model,mode,rules,paths,autoClassifier,readiness,onEvent,onApproval,onError=()=>{},onQueueChange,onQueueRestored,onQueuedDispatch,onSteerState,onPreparation}:{runtime:CliRuntime;projectRoot:string;model:string;mode:PermissionMode;rules:RuleSetInput;paths?:CliPaths;autoClassifier?:AutoClassifier;readiness?:(model:string)=>Promise<TuiSendReadiness>;onEvent:(e:TuiEvent)=>void;onApproval?:(p:PendingTuiApproval|null)=>void;onError?:(e:unknown)=>void;onQueueChange?:(queue:readonly TuiQueuedAction[])=>void;onQueueRestored?:(queue:readonly TuiQueueEntry[])=>void;onQueuedDispatch?:(action:TuiQueuedAction)=>void;onSteerState?:(state:TuiSteerState)=>void;onPreparation?:(state:TuiPreparationState)=>void}){
  let currentMode=mode;
  let currentModel=model;
  const engine=createPermissionEngine({projectRoot,rules,mode,...(autoClassifier?{classifier:autoClassifier}:{}),...(paths?{persistRule:async(effect,action)=>persistPermissionRule({paths,projectRoot,effect,action})}:{})});
  const coordinator=createApprovalCoordinator({engine,answer:(sid,rid,approved)=>runtime.answerApproval(sid,rid,approved),interactive:true,mode:()=>currentMode});
  const adapter=createTuiEventAdapter(secretValuesFromEnvironment(process.env));
  let unsubscribe=()=>{};
  let current:string|null=null;
  /*
   * ⭐⭐⭐ DECISIONE OWNER 16/09/2026 — UN COMANDO DIGITATO MENTRE UN GIRO E' IN CORSO SI ACCODA.
   *
   * Misurato sui due concorrenti: Claude Code accoda SEMPRE mentre un turno e' attivo, Hermes
   * esegue subito e lo documenta come regola. Sono opposti, quindi nessuna posizione di parita'
   * esisteva e l'owner ha scelto la prima.
   * ⇒ Conseguenza che TOGLIE lavoro: non serve nessun lucchetto sull'albero di lavoro, e un'intera
   *   classe di difetti da scrittura concorrente non puo' verificarsi per costruzione.
   */
  const queuedEntries:QueueStoreEntry[]=[];
  const queueStore=paths?.queueRoot?createQueueStore({rootDir:paths.queueRoot}):null;
  let queuePausedState=false,drainingQueue=false,boundaryWhileDraining=false,queueEpoch=0;
  let queueHydration:Promise<void>=Promise.resolve();
  let pendingSteer:{redirectId:string;text:string}|null=null;
  let steerInvocation:{text:string}|null=null;
  let cancelling=false;
  const checkpointStore=paths?.checkpointsRoot?createCheckpointStore({rootDir:paths.checkpointsRoot,projectRoot}):null;
  let modelCheckpoint:CheckpointHandle|null=null;
  const shellAwaitingStart:CheckpointHandle[]=[];
  const shellByCommandId=new Map<string,CheckpointHandle>();
  const shellCommandForCheckpoint=new Map<CheckpointHandle,string>();
  let checkpointBlockedError:Error|null=null;
  function checkpointFailure(code:string,error:unknown){
    const message=error instanceof Error?error.message:String(error);
    const blocked=Object.assign(new Error(`${code}: ${message}`),{code,cause:error});
    checkpointBlockedError=blocked;queuePausedState=true;onError(blocked);return blocked;
  }
  function assertCheckpointReady(){if(checkpointBlockedError)throw checkpointBlockedError;}
  function preparation(state:TuiPreparationState){try{onPreparation?.(state);}catch{/* UI observation cannot change send semantics. */}}
  async function runModelMutation(operation:'start'|'resume'|'fork',sessionId:string|null,invoke:()=>Promise<string>){
    assertCheckpointReady();
    if(!checkpointStore)return invoke();
    if(operation==='start'&&!checkpointMutationAllowed(currentMode))return invoke();
    if(modelCheckpoint)throw Object.assign(new Error('CHECKPOINT_TURN_ALREADY_OPEN'),{code:'CHECKPOINT_TURN_ALREADY_OPEN'});
    let checkpoint:CheckpointHandle;preparation({active:true,operation});
    try{checkpoint=await checkpointStore.begin({operation,...(sessionId?{sessionId}:{})});}
    finally{preparation({active:false,operation});}
    modelCheckpoint=checkpoint;
    try{const id=await invoke();checkpoint.bindSession(id);return id;}
    catch(error){if(modelCheckpoint===checkpoint)modelCheckpoint=null;try{await checkpoint.finalize();}catch(finalization){checkpointFailure('CHECKPOINT_FINALIZE_FAILED',finalization);}throw error;}
  }
  async function runShellMutation(sessionId:string,command:string){
    assertCheckpointReady();
    if(!checkpointStore){await runtime.shell(sessionId,command);return;}
    const checkpoint=await checkpointStore.begin({operation:'shell',sessionId});shellAwaitingStart.push(checkpoint);
    try{
      await runtime.shell(sessionId,command);
      if(!shellCommandForCheckpoint.has(checkpoint)){
        const index=shellAwaitingStart.indexOf(checkpoint);if(index>=0)shellAwaitingStart.splice(index,1);
        throw checkpointFailure('CHECKPOINT_SHELL_CORRELATION_FAILED',new Error('Direct shell returned without its synchronous ComandoUtenteIniziato correlation event.'));
      }
    }
    catch(error){
      if(!shellCommandForCheckpoint.has(checkpoint)){
        const index=shellAwaitingStart.indexOf(checkpoint);if(index>=0)shellAwaitingStart.splice(index,1);
        try{await checkpoint.finalize();}catch(finalization){checkpointFailure('CHECKPOINT_FINALIZE_FAILED',finalization);}
      }
      throw error;
    }
  }
  function processRawEvent(id:string,raw:unknown,allowDrain=true){
    handleRawSteerEvent(raw);
    const event=adapter.translate(raw);if(!event)return;
    onEvent(event);
    if(event.type==='approval.required'){
      const action=permissionActionFromApproval(event.payload);
      void coordinator.request(id,event.requestId,action).then(result=>{
        if(result.pending){const runtimeHint=event.payload.trifecta===true?'trifecta':undefined;onApproval?.({requestId:event.requestId,sessionId:id,action:result.action,rawPayload:event.payload,reason:result.reason,...(result.rule?{rule:result.rule}:{}),...(runtimeHint?{runtimeHint}:{}),...explainApproval({rules,action:result.action,projectRoot,persists:Boolean(paths)})});}else onApproval?.(null);
      }).catch(onError);
    }else if(event.type==='approval.resolved')onApproval?.(null);
    else if(allowDrain&&(event.type==='run.completed'||event.type==='run.failed')&&!pendingSteer&&!cancelling)requestQueuedDrain(id);
  }
  function handleCheckpointRaw(id:string,raw:unknown){
    if(!raw||typeof raw!=='object')return false;
    const row=raw as {type?:unknown;comandoId?:unknown};
    modelCheckpoint?.observe(raw);
    if(row.type==='ComandoUtenteIniziato'){
      const checkpoint=shellAwaitingStart.shift();
      if(checkpoint&&typeof row.comandoId==='string'&&row.comandoId){checkpoint.bindCommand(row.comandoId);shellByCommandId.set(row.comandoId,checkpoint);shellCommandForCheckpoint.set(checkpoint,row.comandoId);}
      return false;
    }
    if(row.type==='ComandoUtenteFinito'){
      let commandId=typeof row.comandoId==='string'&&row.comandoId?row.comandoId:null;
      let checkpoint=commandId?shellByCommandId.get(commandId)??null:null;
      if(!checkpoint&&commandId===null&&shellByCommandId.size===1){const only=[...shellByCommandId.entries()][0]!;commandId=only[0];checkpoint=only[1];}
      if(checkpoint&&commandId){shellByCommandId.delete(commandId);shellCommandForCheckpoint.delete(checkpoint);void checkpoint.finalize().catch(error=>checkpointFailure('CHECKPOINT_FINALIZE_FAILED',error));}
      else if(commandId===null&&shellByCommandId.size>1)checkpointFailure('CHECKPOINT_SHELL_CORRELATION_FAILED',new Error('Multiple direct shell checkpoints are active and the terminal event has no command id.'));
      return false;
    }
    if((row.type==='RunFinished'||row.type==='RunError'||row.type==='RunCancelled')&&modelCheckpoint){
      const checkpoint=modelCheckpoint;modelCheckpoint=null;
      void checkpoint.finalize().then(()=>processRawEvent(id,raw,true)).catch(error=>{checkpointFailure('CHECKPOINT_FINALIZE_FAILED',error);processRawEvent(id,raw,false);});
      return true;
    }
    return false;
  }
  function steerState(state:TuiSteerState){onSteerState?.(state);}
  function rejectSteer(code:string,message:string):TuiSteerOutcome{const outcome={status:'rejected' as const,code,message};steerState(outcome);return outcome;}
  function handleRawSteerEvent(raw:unknown){
    if(!raw||typeof raw!=='object')return;
    const row=raw as {type?:unknown;redirectId?:unknown;message?:unknown;code?:unknown};
    const type=typeof row.type==='string'?row.type:'',redirectId=typeof row.redirectId==='string'?row.redirectId:'';
    if(type==='RunRedirectRequested'){
      if(!steerInvocation||pendingSteer||!redirectId)return;
      pendingSteer={redirectId,text:steerInvocation.text};steerState({status:'requested',redirectId});return;
    }
    if(!pendingSteer||pendingSteer.redirectId!==redirectId)return;
    if(type==='RunRedirectApplied'){steerState({status:'applied',redirectId});pendingSteer=null;return;}
    if(type==='RunRedirectCancelled'){steerState({status:'cancelled',redirectId});pendingSteer=null;return;}
    if(type==='RunRedirectFailed'){
      const code=typeof row.code==='string'?row.code:'SESSION_STEER_FAILED',message=typeof row.message==='string'?row.message:'Steering failed.';
      steerState({status:'failed',redirectId,code,message});pendingSteer=null;
    }
  }
  function actionOf(entry:QueueStoreEntry):TuiQueuedAction{return{kind:entry.kind,text:entry.text,...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})};}
  function publicEntry(entry:QueueStoreEntry):TuiQueueEntry{return{id:entry.id,kind:entry.kind,text:entry.text,status:entry.status==='dispatching'?'uncertain':'pending',...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})};}
  function queueSnapshot():TuiQueuedAction[]{return queuedEntries.map(actionOf);}
  function queueEntriesSnapshot():TuiQueueEntry[]{return queuedEntries.map(publicEntry);}
  function notifyQueue(){onQueueChange?.(queueSnapshot());}
  async function persistFor(sessionId:string,entries:readonly QueueStoreEntry[]){if(queueStore)await queueStore.save(sessionId,entries);}
  async function replaceQueue(entries:readonly QueueStoreEntry[],sessionId:string=current??''){
    if(!sessionId)throw new Error('SESSION_NOT_FOUND');
    await persistFor(sessionId,entries);
    if(current!==sessionId)throw new Error('QUEUE_SESSION_CHANGED');
    queuedEntries.splice(0,queuedEntries.length,...entries.map(entry=>({...entry,...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})})));notifyQueue();
  }
  async function hydrateQueue(id:string,epoch:number){
    queuedEntries.length=0;queuePausedState=false;notifyQueue();if(!queueStore)return;
    try{const loaded=await queueStore.load(id);if(current!==id||epoch!==queueEpoch)return;queuedEntries.splice(0,queuedEntries.length,...loaded);queuePausedState=loaded.length>0;notifyQueue();if(loaded.length)onQueueRestored?.(queueEntriesSnapshot());}
    catch(error){if(current!==id||epoch!==queueEpoch)return;queuePausedState=true;onError(error);}
  }
  async function enqueue(action:TuiQueuedAction){
    await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');
    const entry:QueueStoreEntry={id:randomUUID(),kind:action.kind,text:action.text,status:'pending',...(action.attachments?.length?{attachments:action.attachments.map(row=>({...row}))}:{})};
    await replaceQueue([...queuedEntries,entry],current);return entry;
  }
  function queuePosition(entry:QueueStoreEntry){const index=queuedEntries.findIndex(row=>row.id===entry.id);return index<0?0:index+1;}
  async function dispatchQueuedActions(id:string){
    await queueHydration;if(current!==id||queuePausedState||drainingQueue)return;drainingQueue=true;
    try{
      while(current===id&&queuedEntries.length){
        const next=queuedEntries[0]!;if(next.kind==='prompt')await assertReady();
        const marked:QueueStoreEntry={...next,status:'dispatching',...(next.attachments?{attachments:next.attachments.map(row=>({...row}))}:{})},tail=queuedEntries.slice(1);
        await replaceQueue([marked,...tail],id);
        try{if(marked.kind==='command')await runShellMutation(id,marked.text);else await runModelMutation('resume',id,()=>runtime.resume(id,marked.text,marked.attachments));}
        catch(error){if(current===id)await replaceQueue([{...marked,status:'pending'},...tail],id).catch(onError);throw error;}
        await replaceQueue(tail,id);onQueuedDispatch?.(actionOf(marked));if(marked.kind==='prompt')return;
      }
    }finally{drainingQueue=false;if(boundaryWhileDraining){boundaryWhileDraining=false;requestQueuedDrain(id);}}
  }
  function requestQueuedDrain(id:string){
    if(queuePausedState||pendingSteer||cancelling)return;if(drainingQueue){boundaryWhileDraining=true;return;}
    void queueHydration.then(()=>{if(current===id&&!queuePausedState&&!pendingSteer&&!cancelling)return dispatchQueuedActions(id);}).catch(onError);
  }
  async function assertReady(){if(!readiness)return;const answer=await readiness(currentModel);if(!answer.ready)throw new TuiNotReadyError(answer.code,answer.provider,answer.message);}
  async function resolveId(id:string){if(id!=='last')return id;const rows=await runtime.listSessions();const row=rows.at(-1);if(!row?.sessionId)throw new Error('SESSION_NOT_FOUND');return String(row.sessionId);}
  function attach(id:string,from=0){
    unsubscribe();adapter.bindSession(id);current=id;const epoch=++queueEpoch;queueHydration=hydrateQueue(id,epoch);
    unsubscribe=runtime.subscribe(id,(raw)=>{if(handleCheckpointRaw(id,raw))return;processRawEvent(id,raw);},from);
    return id;
  }
  async function listSessions(){return normalizeSessions(await runtime.listSessions());}
  async function agentTree(){if(!current)return null;return buildAgentTree(await runtime.listSessions(),current);}
  /* B1 slice 18, fix round: a prompt makes resume and fork a send, so readiness is asked FIRST — before the session list, the
     subscription or the runtime call — and a not-ready answer reaches no runtime method. Without a prompt nothing is sent. */
  async function referencesFor(text:string){return resolveProjectReferences({projectRoot,prompt:text});}
  function promptAction(text:string,attachments:CliAttachment[]):TuiQueuedAction{return attachments.length?{kind:'prompt',text,attachments}:{kind:'prompt',text};}
  async function resumeSession(id:string,prompt?:string){const text=prompt?.trim();if(text)await assertReady();const attachments=text?await referencesFor(text):[];const resolved=await resolveId(id);attach(resolved,0);await queueHydration;if(text)await runModelMutation('resume',resolved,()=>runtime.resume(resolved,text,attachments));return resolved;}
  async function forkSession(id:string,prompt?:string){const text=prompt?.trim();if(text)await assertReady();const attachments=text?await referencesFor(text):[];const resolved=await resolveId(id);const child=await runModelMutation('fork',null,()=>runtime.fork(resolved,text,attachments));attach(child,0);await queueHydration;return child;}
  async function initialize({resume,fork,initialPrompt}:{resume?:string;fork?:string;initialPrompt?:string}={}){const text=initialPrompt?.trim();if(text)await assertReady();const attachments=text?await referencesFor(text):[];if(resume||fork)await runtime.restore();if(resume){const id=await resolveId(resume);attach(id,0);await queueHydration;if(text)await runModelMutation('resume',id,()=>runtime.resume(id,text,attachments));return id;}if(fork){const parent=await resolveId(fork);const id=await runModelMutation('fork',null,()=>runtime.fork(parent,text,attachments));attach(id,0);await queueHydration;return id;}if(text){const id=await runModelMutation('start',null,()=>runtime.start({projectRoot,prompt:text,model:currentModel,permissionMode:currentMode,...(attachments.length?{attachments}:{})}));attach(id,0);await queueHydration;return id;}return null;}
  /*
   * ⛔ IL PREFISSO `!` VA AL COMANDO, NON AL MODELLO. Nessun `start`/`resume` parte da questo ramo:
   *   il testo non diventa mai un messaggio per il modello.
   * ⛔ E senza sessione si RIFIUTA a voce alta: far sparire un comando digitato e' peggio che negarlo.
   */
  async function send(prompt:string,{running}:{model:string;running:boolean}):Promise<TuiSendOutcome>{
    await queueHydration;const text=prompt.trim();
    if(!text)return{sessionId:current,kind:'none',queued:false,position:0};
    if(text.startsWith('!')){
      const command=text.slice(1).trim();
      if(!command)return{sessionId:current,kind:'none',queued:false,position:0};
      if(!current)throw new Error(EXECUTION_TEXT.shellSessionRequired);
      if(running||queuedEntries.length){
        const action=await enqueue({kind:'command',text:command});
        if(!running&&!queuePausedState)await dispatchQueuedActions(current);
        const position=queuePosition(action);
        return{sessionId:current,kind:'command',queued:position>0,position};
      }
      await runShellMutation(current,command);
      return{sessionId:current,kind:'command',queued:false,position:0};
    }
    await assertReady();const attachments=await referencesFor(text);
    if(running||queuedEntries.length){
      if(!current)throw new Error('SESSION_NOT_FOUND');
      const action=await enqueue(promptAction(text,attachments));
      if(!running&&!queuePausedState)await dispatchQueuedActions(current);
      const position=queuePosition(action);
      return{sessionId:current,kind:'prompt',queued:position>0,position};
    }
    if(current){await runModelMutation('resume',current,()=>runtime.resume(current!,text,attachments));return{sessionId:current,kind:'prompt',queued:false,position:0};}
    const id=await runModelMutation('start',null,()=>runtime.start({projectRoot,prompt:text,model:currentModel,permissionMode:currentMode,...(attachments.length?{attachments}:{})}));attach(id,0);return{sessionId:id,kind:'prompt',queued:false,position:0};
  }
  async function steer(prompt:string,{running}:{running:boolean}):Promise<TuiSteerOutcome>{
    await queueHydration;const text=String(prompt??'').trim();
    if(!text)return rejectSteer('STEER_TEXT_REQUIRED','Steering text is required.');
    if(text.startsWith('!'))return rejectSteer('STEER_COMMAND_UNSUPPORTED','Shell commands cannot be used as steering input.');
    if(!current)return rejectSteer('SESSION_NOT_FOUND','There is no active session to steer.');
    if(!running)return rejectSteer('STEER_NOT_RUNNING','Steering requires an active run.');
    if(pendingSteer||steerInvocation)return rejectSteer('STEER_ALREADY_PENDING','A steering request is already waiting for a safe boundary.');
    try{
      await assertReady();const attachments=await referencesFor(text);steerInvocation={text};
      const accepted=await runtime.steer(current,text,attachments);
      if(pendingSteer&&pendingSteer.redirectId!==accepted.redirectId){
        const stale=pendingSteer;pendingSteer=null;steerState({status:'failed',redirectId:stale.redirectId,code:'STEER_CORRELATION_FAILED',message:'The runtime returned a different steering correlation id.'});
        return rejectSteer('STEER_CORRELATION_FAILED','The runtime returned a different steering correlation id.');
      }
      if(!pendingSteer){pendingSteer={redirectId:accepted.redirectId,text};steerState({status:'requested',redirectId:accepted.redirectId});}
      return{status:'requested',redirectId:accepted.redirectId};
    }catch(error){
      pendingSteer=null;const code=typeof (error as any)?.code==='string'?(error as any).code:'SESSION_STEER_REJECTED',message=error instanceof Error?error.message:String(error);
      return rejectSteer(code,message);
    }finally{steerInvocation=null;}
  }
  async function editQueue(id:string,text:string){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');const index=queuedEntries.findIndex(row=>row.id===id);if(index<0)throw new Error('QUEUE_ENTRY_NOT_FOUND');const value=text.trim();if(!value)throw new Error('QUEUE_TEXT_REQUIRED');const previous=queuedEntries[index]!,attachments=previous.kind==='prompt'?await referencesFor(value):[];const edited:QueueStoreEntry={id:previous.id,kind:previous.kind,text:value,status:'pending',...(attachments.length?{attachments}:{})};const next=[...queuedEntries];next[index]=edited;await replaceQueue(next,current);}
  async function moveQueue(id:string,direction:-1|1){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');const index=queuedEntries.findIndex(row=>row.id===id);if(index<0)throw new Error('QUEUE_ENTRY_NOT_FOUND');const target=Math.max(0,Math.min(queuedEntries.length-1,index+direction));if(target===index)return;const next=[...queuedEntries];const [entry]=next.splice(index,1);next.splice(target,0,entry!);await replaceQueue(next,current);}
  async function deleteQueue(id:string){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');const index=queuedEntries.findIndex(row=>row.id===id);if(index<0)return null;const next=[...queuedEntries];const [removed]=next.splice(index,1);await replaceQueue(next,current);if(next.length===0)queuePausedState=false;return removed?publicEntry(removed):null;}
  async function clearQueue(){await queueHydration;const dropped=queueSnapshot();if(current)await replaceQueue([],current);else{queuedEntries.length=0;notifyQueue();}queuePausedState=false;return dropped;}
  async function dispatchQueue(){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');if(!queuedEntries.length){queuePausedState=false;return 0;}const normalized=queuedEntries.map(row=>row.status==='dispatching'?{...row,status:'pending' as const}:row);await replaceQueue(normalized,current);queuePausedState=false;await dispatchQueuedActions(current);return queuedEntries.length;}
  return{initialize,attach,send,steer,listSessions,agentTree,resumeSession,forkSession,pendingCommands:()=>queuedEntries.filter(action=>action.kind==='command').length,pendingPrompts:()=>queuedEntries.filter(action=>action.kind==='prompt').length,queue:queueSnapshot,queueEntries:queueEntriesSnapshot,queuePaused:()=>queuePausedState,queueReady:()=>queueHydration,editQueue,moveQueue,deleteQueue,clearQueue,dispatchQueue,current:()=>current,mode:()=>currentMode,setMode(next:PermissionMode){currentMode=next;},model:()=>currentModel,setModel(next:string){if(typeof next!=='string'||!next.trim())throw new Error('MODEL_REQUIRED');currentModel=next.trim();},async compact(){if(!current)throw new Error('SESSION_NOT_FOUND');return runtime.compact(current);},async resolveApproval(requestId:string,choice:UserApprovalChoice){await coordinator.resolve(requestId,choice);onApproval?.(null);},async cancel(){if(!current)return[] as TuiQueuedAction[];const dropped=queueSnapshot();onEvent({type:'run.cancelled'});cancelling=true;try{await runtime.cancel(current);await clearQueue();return dropped;}catch(error){queuePausedState=true;onError(error);throw error;}finally{cancelling=false;}},close(){unsubscribe();}};
}

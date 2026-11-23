import {randomUUID} from 'node:crypto';
import type {ReasoningEffort} from '../config/types.ts';
import {CliRuntimeError,type CliRuntime,type CliRuntimeSupervisorEvidence,type CliSessionSummary,type RuntimeRestoreSelection,type RuntimeSubscribeOptions,type StartInput} from './types.ts';
import {developmentLog,developmentLogError} from '../diagnostics/development-log.ts';
import {forwardKeyOrigin} from '../provider/environment-keys.ts';
import {sayIfSlow,settleLeftBehind,TOKEN_WORK_NOTICE_MS,writeExitNotice} from '../provider/chatgpt-plan.ts';
import {t} from '../i18n/index.ts';
import {isReplayView} from './replay-coalescer.ts';
import {createRuntimeReplayBuffer,createStartOperationJournal,startOperationFingerprint,type StartOperationJournal} from './replay-buffer.ts';

export type RuntimeRetryRule={maxAttempts:number;backoffMs:number};
export type RuntimeSupervisorPolicy={restore:RuntimeRetryRule;start:RuntimeRetryRule;replay:RuntimeRetryRule};
export const DEFAULT_RUNTIME_SUPERVISOR_POLICY:RuntimeSupervisorPolicy={
  restore:{maxAttempts:2,backoffMs:50},
  start:{maxAttempts:2,backoffMs:50},
  replay:{maxAttempts:2,backoffMs:50},
};

type Options={
  runtimeFactory:()=>CliRuntime|Promise<CliRuntime>;
  initialRuntime?:CliRuntime;
  policy?:Partial<{restore:Partial<RuntimeRetryRule>;start:Partial<RuntimeRetryRule>;replay:Partial<RuntimeRetryRule>}>;
  sleep?:(ms:number)=>Promise<void>;
  operationId?:()=>string;
  journal?:StartOperationJournal|null;
  journalRoot?:string;
};

const RETRYABLE_CODES=new Set([
  'RUNTIME_ACK_LOST','RUNTIME_RESTORE_TRANSIENT','RUNTIME_UNAVAILABLE','RUNTIME_START_FAILED',
  'PROVIDER_REQUEST_ERROR','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMITED','NETWORK_ERROR',
]);

function errorCode(error:unknown):string|null{
  return typeof (error as any)?.code==='string'?(error as any).code:null;
}
function errorRetryable(error:unknown):boolean{
  if(typeof (error as any)?.retryable==='boolean')return (error as any).retryable;
  if(typeof (error as any)?.details?.retryable==='boolean')return (error as any).details.retryable;
  const code=errorCode(error);return code!==null&&RETRYABLE_CODES.has(code);
}
function errorDetails(error:unknown):Record<string,unknown>{
  const source=error&&typeof error==='object'?error as Record<string,unknown>:{};
  const nested=source.details&&typeof source.details==='object'&&!Array.isArray(source.details)?source.details as Record<string,unknown>:{};
  const direct=Object.fromEntries(Object.entries(source).filter(([key,value])=>
    !['name','message','stack','code','retryable','details'].includes(key)
    &&['string','number','boolean'].includes(typeof value)
  ));
  return{...nested,...direct};
}
function nativeSequence(event:unknown):number|null{
  const raw=(event as any)?._sequenza;
  return typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0?raw:null;
}

export function createRuntimeSupervisor(options:Options){
  const sleep=options.sleep??(async(ms:number)=>{if(ms>0)await new Promise(resolve=>setTimeout(resolve,ms));});
  const policy:RuntimeSupervisorPolicy={
    restore:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY.restore,...options.policy?.restore},
    start:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY.start,...options.policy?.start},
    replay:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY.replay,...options.policy?.replay},
  };
  const nextOperationId=options.operationId??randomUUID;
  const journal=options.journal??(options.journalRoot?createStartOperationJournal({rootDir:options.journalRoot,operationId:nextOperationId}):null);
  const replay=createRuntimeReplayBuffer();
  const evidence:CliRuntimeSupervisorEvidence[]=[];
  const generations=new Map<string,number>();
  const cancelInFlight=new Map<string,Promise<void>>();
  let current:CliRuntime|null=options.initialRuntime??null;
  let defaultReasoning:ReasoningEffort|null=null;
  let closed=false;

  function record(input:Omit<CliRuntimeSupervisorEvidence,'ts'>){
    const row={...input,ts:new Date().toISOString()};evidence.push(row);developmentLog('runtime.supervisor',row,input.outcome==='failed'?'error':input.outcome==='retrying'?'warning':'debug','runtime-supervisor');
    if(evidence.length>256)evidence.splice(0,evidence.length-256);
  }
  async function ensureRuntime(){
    if(closed)throw new CliRuntimeError('RUNTIME_SUPERVISOR_CLOSED','Runtime supervisor is closed.');
    if(!current){
      current=await options.runtimeFactory();
      current.setDefaultReasoningEffort(defaultReasoning);
    }
    return current;
  }
  async function replaceRuntime(){
    const old=current;current=null;
    try{await (old?.close as undefined|((input?:{replacing?:boolean})=>Promise<void>))?.call(old,{replacing:true});}catch(error){developmentLogError('runtime.replace.close_failure',error,{},'runtime-supervisor');}
    const next=await ensureRuntime();
    next.setDefaultReasoningEffort(defaultReasoning);
    return next;
  }
  function bump(sessionId:string){const next=(generations.get(sessionId)??0)+1;generations.set(sessionId,next);return next;}

  async function restore(selection?:RuntimeRestoreSelection){
    for(let attempt=1;attempt<=policy.restore.maxAttempts;attempt++){
      const runtime=await ensureRuntime();
      try{
        const result=await runtime.restore(selection);
        record({operation:'restore',attempt,outcome:'succeeded',code:null,retryable:false,fallback:null,sessionId:null,operationId:null,details:{}});
        return result;
      }catch(error){
        const retryable=errorRetryable(error);const code=errorCode(error);
        if(retryable&&attempt<policy.restore.maxAttempts){
          record({operation:'restore',attempt,outcome:'retrying',code,retryable:true,fallback:'runtime-restart',sessionId:null,operationId:null,details:errorDetails(error)});
          await sleep(policy.restore.backoffMs);await replaceRuntime();continue;
        }
        record({operation:'restore',attempt,outcome:'failed',code,retryable,fallback:null,sessionId:null,operationId:null,details:errorDetails(error)});
        throw error;
      }
    }
    throw new CliRuntimeError('RUNTIME_RESTORE_FAILED');
  }

  async function start(input:StartInput){
    const fingerprint=startOperationFingerprint(input);
    let operationId=input.operationId??null;let recovered=false;
    /* owner 02/10 («Chiave per invio»): the journal recognises a start by its key, never by its content (replay-buffer.ts) */
    if(journal){const claim=await journal.claim(fingerprint,operationId);operationId=claim.operationId;recovered=claim.recovered;}
    if(!operationId)operationId=nextOperationId();
    if(recovered)record({operation:'start',attempt:0,outcome:'recovered',code:null,retryable:false,fallback:null,sessionId:null,operationId,details:{fingerprint}});
    for(let attempt=1;attempt<=policy.start.maxAttempts;attempt++){
      const runtime=await ensureRuntime();
      try{
        const sessionId=await runtime.start({...input,operationId});
        bump(sessionId);
        if(recovered){
          const row=(await runtime.listSessions({scope:'loaded'})).find(candidate=>candidate.sessionId===sessionId||candidate.id===sessionId);
          if(row?.interrupted===true||row?.outcome==='interrupted'){
            record({operation:'start',attempt,outcome:'failed',code:'RUNTIME_OPERATION_INTERRUPTED',retryable:false,fallback:null,sessionId,operationId,details:{recovered:true}});
            throw new CliRuntimeError('RUNTIME_OPERATION_INTERRUPTED','The recovered start was interrupted by the previous process. Resume that session explicitly instead of starting it again.',{sessionId,operationId});
          }
        }
        record({operation:'start',attempt,outcome:'succeeded',code:null,retryable:false,fallback:null,sessionId,operationId,details:{recovered}});
        /* the start keeps the session it began, so a later process can name the turn if this one dies (owner 02/10) */
        try{await journal?.bind(operationId,sessionId);}catch(error){developmentLogError('runtime.journal.bind_failure',error,{},'runtime-supervisor');}
        return sessionId;
      }catch(error){
        if((error as any)?.code==='RUNTIME_OPERATION_INTERRUPTED')throw error;
        const retryable=errorRetryable(error);const code=errorCode(error);
        if(retryable&&attempt<policy.start.maxAttempts){
          record({operation:'start',attempt,outcome:'retrying',code,retryable:true,fallback:'runtime-restart',sessionId:null,operationId,details:errorDetails(error)});
          await sleep(policy.start.backoffMs);await replaceRuntime();continue;
        }
        record({operation:'start',attempt,outcome:'failed',code,retryable,fallback:null,sessionId:null,operationId,details:errorDetails(error)});
        throw error;
      }
    }
    throw new CliRuntimeError('RUNTIME_START_FAILED');
  }

  function subscribe(sessionId:string,sink:(event:unknown)=>void,from=0,options?:RuntimeSubscribeOptions){
    let active=true;let unsub=()=>{};let cursor=from;
    const deliver=(event:unknown)=>{
      if(!active)return;
      const sequence=nativeSequence(event);
      if(sequence!==null){
        /* P13 (2026-09-26): what this subscriber has seen is ITS cursor. The buffer is shared by every subscriber of the
           session, so "already in the buffer" dropped the whole history of a second subscriber (a reopened agent view came
           up empty); it still records the event, and a different event at a known sequence still throws a conflict. */
        if(sequence<=cursor)return;
        /* A folded replay event (replay-coalescer.ts) is a view that carries the LAST sequence of a run of deltas; another subscriber may hold that
           sequence as the raw delta, so it moves this cursor but is not recorded: the buffer keeps only the kernel's own events (s28, 08/10). */
        if(!isReplayView(event))replay.push(sessionId,event as Record<string,unknown>);
        cursor=sequence;
      }
      sink(event);
    };
    const terminalFailure=(error:unknown)=>{
      if(!active)return;
      sink({type:'RunError',code:'RUNTIME_REPLAY_FAILED',message:error instanceof Error?error.message:String(error),retryable:false,component:'runtime-supervisor'});
    };
    const attach=(runtime:CliRuntime,attempt:number)=>{
      if(!active)return;
      try{
        unsub=runtime.subscribe(sessionId,deliver,cursor,options);
        if(attempt>1)record({operation:'replay',attempt,outcome:'succeeded',code:null,retryable:false,fallback:null,sessionId,operationId:null,details:{from:cursor}});
      }catch(error){
        const retryable=errorRetryable(error);const code=errorCode(error);
        if(retryable&&attempt<policy.replay.maxAttempts){
          record({operation:'replay',attempt,outcome:'retrying',code,retryable:true,fallback:'runtime-restart',sessionId,operationId:null,details:{...errorDetails(error),from:cursor}});
          void (async()=>{
            try{
              await sleep(policy.replay.backoffMs);
              const next=await replaceRuntime();
              await next.restore();
              attach(next,attempt+1);
            }catch(recoveryError){
              record({operation:'replay',attempt:attempt+1,outcome:'failed',code:errorCode(recoveryError),retryable:errorRetryable(recoveryError),fallback:null,sessionId,operationId:null,details:errorDetails(recoveryError)});
              terminalFailure(recoveryError);
            }
          })();
          return;
        }
        record({operation:'replay',attempt,outcome:'failed',code,retryable,fallback:null,sessionId,operationId:null,details:errorDetails(error)});
        terminalFailure(error);
      }
    };
    if(current)attach(current,1);else void ensureRuntime().then(runtime=>attach(runtime,1)).catch(terminalFailure);
    return()=>{if(!active)return;active=false;try{unsub();}catch{}};
  }

  const supervised:CliRuntime&{supervisorEvidence():readonly CliRuntimeSupervisorEvidence[]}={
    get modelCheckpoints(){
      const owner=current?.modelCheckpoints;if(!owner)return undefined;
      return{projectRoot:owner.projectRoot,rootDir:owner.rootDir,async canDefer(){
        const next=(await ensureRuntime()).modelCheckpoints;
        if(!next||next.projectRoot!==owner.projectRoot||next.rootDir!==owner.rootDir)throw new CliRuntimeError('CHECKPOINT_OWNER_CHANGED','Runtime checkpoint ownership changed during the turn.');
        return next.canDefer?next.canDefer():true;
      },async settle(sessionId:string){
        const next=(await ensureRuntime()).modelCheckpoints;
        if(!next||next.projectRoot!==owner.projectRoot||next.rootDir!==owner.rootDir)throw new CliRuntimeError('CHECKPOINT_OWNER_CHANGED','Runtime checkpoint ownership changed during the turn.');
        await next.settle(sessionId);
      }};
    },
    restore,
    start,
    setDefaultReasoningEffort(effort){defaultReasoning=effort;current?.setDefaultReasoningEffort(effort);},
    async setPermissionMode(sessionId,mode){return (await ensureRuntime()).setPermissionMode(sessionId,mode);},
    async setReasoningEffort(sessionId,effort){return (await ensureRuntime()).setReasoningEffort(sessionId,effort);},
    async resume(sessionId,prompt,attachments,options){const id=await (await ensureRuntime()).resume(sessionId,prompt,attachments,options);bump(id);return id;},
    async fork(sessionId,prompt,attachments,options){const id=await (await ensureRuntime()).fork(sessionId,prompt,attachments,options);bump(id);return id;},
    /* RICERCA 5×5×5×5 cambio-modello (dossier §5.3): the /model choice on a live session rides the same proxy as every other setting. */
    async setSessionModel(sessionId,model){const runtime=await ensureRuntime();if(typeof runtime.setSessionModel!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE');return runtime.setSessionModel(sessionId,model);},
    async steer(sessionId,prompt,attachments){return (await ensureRuntime()).steer(sessionId,prompt,attachments);},
    async queueMessage(sessionId,prompt,attachments,options){const runtime=await ensureRuntime();if(!runtime.queueMessage)throw new CliRuntimeError('SESSION_QUEUE_UNAVAILABLE');return options?.attachIfTooLarge?runtime.queueMessage(sessionId,prompt,attachments,{attachIfTooLarge:true}):runtime.queueMessage(sessionId,prompt,attachments);},
    async unqueueMessage(sessionId,id){const runtime=await ensureRuntime();if(!runtime.unqueueMessage)throw new CliRuntimeError('SESSION_QUEUE_UNAVAILABLE');return runtime.unqueueMessage(sessionId,id);},
    async compact(sessionId){return (await ensureRuntime()).compact(sessionId);},
    async requestTools(sessionId){return (await ensureRuntime()).requestTools?.(sessionId)??null;},
    folderTrust(){return current?.folderTrust?.()??null;},
    async processes(){return (await ensureRuntime()).processes?.()??[];},
    async stopProcess(sessionId,toolCallId){return (await ensureRuntime()).stopProcess?.(sessionId,toolCallId)??'unknown';},
    async requestSent(sessionId){return (await ensureRuntime()).requestSent?.(sessionId)??null;},
    async machineCapacity(){return (await ensureRuntime()).machineCapacity?.()??null;},
    async modelPreferences(action){return (await ensureRuntime()).modelPreferences?.(action)??null;},
    async contextManager(sessionId,request){return (await ensureRuntime()).contextManager?.(sessionId,request)??null;},
    async contextStatus(sessionId){return (await ensureRuntime()).contextStatus?.(sessionId)??{schema:'talos.cli.context-status.v1',sessionId,available:false,reason:'runtime-unavailable',measurement:null,budget:null,autoCompaction:{enabled:false,triggerRatio:0.5,triggerPercent:50,targetRatio:null,provenance:'runtime-supervisor'},cache:{promptTokens:null,cachedTokens:null,percent:null,provenance:'unavailable'},cost:{usd:null,provenance:'unavailable'},sources:{activeVersionId:null,activeSourceCount:null,summaryCitationCount:null,provenance:'unavailable'}};},
    async listSessions(options){return (await ensureRuntime()).listSessions(options);},
    async deleteSession(sessionId){const runtime=await ensureRuntime();if(typeof runtime.deleteSession!=='function')throw new CliRuntimeError('SESSION_DELETE_UNAVAILABLE');return runtime.deleteSession(sessionId);},
    subscribe,
    async answerApproval(sessionId,requestId,approved,reason){return (await ensureRuntime()).answerApproval(sessionId,requestId,approved,reason);},
    async answerQuestion(sessionId,requestId,response){return (await ensureRuntime()).answerQuestion(sessionId,requestId,response);},
    async answerPlan(sessionId,choice){return (await ensureRuntime()).answerPlan(sessionId,choice);},
    async answerElicitation(sessionId,requestId,response){return (await ensureRuntime()).answerElicitation(sessionId,requestId,response);},
    async cancel(sessionId,options){
      const generation=generations.get(sessionId)??0;const key=`${sessionId}:${generation}`;
      const existing=cancelInFlight.get(key);if(existing)return existing;
      const task=(async()=>{try{await (await ensureRuntime()).cancel(sessionId,options);}catch(error){cancelInFlight.delete(key);throw error;}})();
      cancelInFlight.set(key,task);return task;
    },
    /* F-ENG-2: a runtime that cannot stop background commands has none to report */
    async backgroundCommandCount(sessionId){const runtime=await ensureRuntime();return typeof runtime.backgroundCommandCount==='function'?runtime.backgroundCommandCount(sessionId):0;},
    async stopBackgroundCommands(sessionIds,options){const runtime=await ensureRuntime();return typeof runtime.stopBackgroundCommands==='function'?runtime.stopBackgroundCommands(sessionIds,options):[];},
    async shell(sessionId,command){return (await ensureRuntime()).shell(sessionId,command);},
    export(sessionId){return current?.export(sessionId)??null;},
    capabilities(){return current?.capabilities?.()??{forkBeforeRun:false,modelCheck:false};},
    async checkModel(model){const runtime=await ensureRuntime();if(typeof runtime.checkModel!=='function')throw new CliRuntimeError('MODEL_CHECK_UNAVAILABLE');return runtime.checkModel(model);},
    async forkBeforeRun(sessionId,runId){const runtime=await ensureRuntime();if(typeof runtime.forkBeforeRun!=='function')throw new CliRuntimeError('FORK_CUT_UNAVAILABLE');return runtime.forkBeforeRun(sessionId,runId);},
    supervisorEvidence(){return evidence.map(row=>({...row,details:{...row.details}}));},
    /* Owner 02/10 («ripresa visibile»): the turns a dead TALOS left interrupted (a crash, a closed window), told once —
       the starts it left are read with their sessions, kept only where the session was really interrupted, then pruned. */
    async interruptedByPreviousProcess(){
      if(!journal)return[];
      const left=await journal.leftovers();if(!left.length)return[];
      const ids=new Set(left.map(row=>row.sessionId).filter((id):id is string=>typeof id==='string'));
      /* review of 0.6.4 (acceptance s49): a TALOS killed just as its answer began can die before `bind` names the session in its
         start (the answer is already on the screen when `start` returns). Such a start still says WHEN it began: a top-level
         conversation that started from then on and was interrupted is the turn it cut. */
      /* eighth review (S2): a start killed before `bind` can only be the LAST start of its process; an unbound record with a later
         start of the same process is a start that failed (it created no conversation), and must not take another TALOS's one */
      const latestOf=new Map<number,number>();
      for(const row of left){const at=Date.parse(String(row.createdAt));if(Number.isFinite(at)&&at>(latestOf.get(row.pid)??-Infinity))latestOf.set(row.pid,at);}
      const unboundSince=left.filter(row=>typeof row.sessionId!=='string').map(row=>({at:Date.parse(String(row.createdAt)),pid:row.pid}))
        .filter(row=>Number.isFinite(row.at)&&row.at===latestOf.get(row.pid)).map(row=>row.at);
      /* seventh review (S1): the journal and the session list span every project and every TALOS, and a failed start leaves an unbound
         record too. A start creates its conversation right after its claim: for each unbound record at most ONE conversation — the
         first top-level one begun within a minute of it — and only when that one was interrupted. */
      const WINDOW_MS=60_000;
      let rows:CliSessionSummary[]=[];
      try{if(ids.size||unboundSince.length){
        const all=await (await ensureRuntime()).listSessions();
        const cut=(row:CliSessionSummary)=>row.interrupted===true||row.outcome==='interrupted';
        const chosen=new Set<string>();
        for(const since of unboundSince){
          const first=all.filter(row=>row.parentId===null&&typeof row.startedAt==='string'&&Date.parse(row.startedAt)>=since-1_000&&Date.parse(row.startedAt)<=since+WINDOW_MS)
            .sort((a,b)=>Date.parse(a.startedAt!)-Date.parse(b.startedAt!))[0];
          if(first)chosen.add(first.sessionId??first.id);
        }
        rows=all.filter(row=>(ids.has(row.sessionId??row.id)||chosen.has(row.sessionId??row.id))&&cut(row));
      }}
      finally{await journal.prune(left);}
      return rows;
    },
    async close(){
      if(closed)return;closed=true;
      try{await current?.close();}
      finally{
        current=null;
        /* After the review of 0.6.3 (14/10/2026): a replacement that failed leaves no runtime here — the old one closed, the new one
           could not be composed — and the renewal the old one left on its way (chatgpt-plan.ts `keepLeftBehind`) was awaited by
           nobody: the exit returned at once and the backstop could cut it. The person's exit waits for it here too, with the same
           notice after a second; after a composed runtime's close nothing is left, and nothing is waited. */
        try{await sayIfSlow(settleLeftBehind(),TOKEN_WORK_NOTICE_MS,()=>{writeExitNotice(`${t('key.chatgpt.exit.finishing')}\n`);});}
        finally{await journal?.releaseOwned();}
      }
    },
  };
  /* The entries ask the runtime they hold, this supervisor, where a run's key comes from; the composed runtime inside knows. */
  forwardKeyOrigin(supervised,()=>current);
  return supervised;
}

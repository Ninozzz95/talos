import {randomUUID} from 'node:crypto';
import type {ReasoningEffort} from '../config/types.ts';
import {CliRuntimeError,type CliRuntime,type CliRuntimeSupervisorEvidence,type StartInput} from './types.ts';
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
    evidence.push({...input,ts:new Date().toISOString()});
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
    try{await old?.close();}catch{}
    const next=await ensureRuntime();
    next.setDefaultReasoningEffort(defaultReasoning);
    return next;
  }
  function bump(sessionId:string){const next=(generations.get(sessionId)??0)+1;generations.set(sessionId,next);return next;}

  async function restore(){
    for(let attempt=1;attempt<=policy.restore.maxAttempts;attempt++){
      const runtime=await ensureRuntime();
      try{
        const result=await runtime.restore();
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
    if(!operationId&&journal){const claim=await journal.claim(fingerprint);operationId=claim.operationId;recovered=claim.recovered;}
    if(!operationId)operationId=nextOperationId();
    if(recovered)record({operation:'start',attempt:0,outcome:'recovered',code:null,retryable:false,fallback:null,sessionId:null,operationId,details:{fingerprint}});
    for(let attempt=1;attempt<=policy.start.maxAttempts;attempt++){
      const runtime=await ensureRuntime();
      try{
        const sessionId=await runtime.start({...input,operationId});
        bump(sessionId);
        if(recovered){
          const row=(await runtime.listSessions()).find(candidate=>candidate.sessionId===sessionId||candidate.id===sessionId);
          if(row?.interrupted===true||row?.outcome==='interrupted'){
            record({operation:'start',attempt,outcome:'failed',code:'RUNTIME_OPERATION_INTERRUPTED',retryable:false,fallback:null,sessionId,operationId,details:{recovered:true}});
            throw new CliRuntimeError('RUNTIME_OPERATION_INTERRUPTED','The recovered start was interrupted by the previous process. Resume that session explicitly instead of starting it again.',{sessionId,operationId});
          }
        }
        record({operation:'start',attempt,outcome:'succeeded',code:null,retryable:false,fallback:null,sessionId,operationId,details:{recovered}});
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

  function subscribe(sessionId:string,sink:(event:unknown)=>void,from=0){
    let active=true;let unsub=()=>{};let cursor=from;
    const deliver=(event:unknown)=>{
      if(!active)return;
      const sequence=nativeSequence(event);
      if(sequence!==null){
        const added=replay.push(sessionId,event as Record<string,unknown>);
        if(!added||sequence<=cursor)return;
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
        unsub=runtime.subscribe(sessionId,deliver,cursor);
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
    restore,
    start,
    setDefaultReasoningEffort(effort){defaultReasoning=effort;current?.setDefaultReasoningEffort(effort);},
    async setReasoningEffort(sessionId,effort){return (await ensureRuntime()).setReasoningEffort(sessionId,effort);},
    async resume(sessionId,prompt,attachments){const id=await (await ensureRuntime()).resume(sessionId,prompt,attachments);bump(id);return id;},
    async fork(sessionId,prompt,attachments){const id=await (await ensureRuntime()).fork(sessionId,prompt,attachments);bump(id);return id;},
    async steer(sessionId,prompt,attachments){return (await ensureRuntime()).steer(sessionId,prompt,attachments);},
    async compact(sessionId){return (await ensureRuntime()).compact(sessionId);},
    async contextStatus(sessionId){return (await ensureRuntime()).contextStatus?.(sessionId)??{schema:'talos.cli.context-status.v1',sessionId,available:false,reason:'runtime-unavailable',measurement:null,budget:null,autoCompaction:{enabled:false,triggerRatio:0.5,triggerPercent:50,targetRatio:null,provenance:'runtime-supervisor'},cache:{promptTokens:null,cachedTokens:null,percent:null,provenance:'unavailable'},cost:{usd:null,provenance:'unavailable'},sources:{activeVersionId:null,activeSourceCount:null,summaryCitationCount:null,provenance:'unavailable'}};},
    async listSessions(){return (await ensureRuntime()).listSessions();},
    subscribe,
    async answerApproval(sessionId,requestId,approved){return (await ensureRuntime()).answerApproval(sessionId,requestId,approved);},
    async cancel(sessionId){
      const generation=generations.get(sessionId)??0;const key=`${sessionId}:${generation}`;
      const existing=cancelInFlight.get(key);if(existing)return existing;
      const task=(async()=>{try{await (await ensureRuntime()).cancel(sessionId);}catch(error){cancelInFlight.delete(key);throw error;}})();
      cancelInFlight.set(key,task);return task;
    },
    async shell(sessionId,command){return (await ensureRuntime()).shell(sessionId,command);},
    export(sessionId){return current?.export(sessionId)??null;},
    supervisorEvidence(){return evidence.map(row=>({...row,details:{...row.details}}));},
    async close(){
      if(closed)return;closed=true;
      try{await current?.close();}finally{current=null;await journal?.releaseOwned();}
    },
  };
  return supervised;
}

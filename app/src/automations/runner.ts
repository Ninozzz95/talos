import {decideAutomationSchedule,type AutomationDecision} from './schedule.ts';
import type {AutomationPolicy} from './policy-store.ts';
import type {AutomationHistoryEntry} from './history-store.ts';

export type Automation={id:string;enabled:boolean;nextRunAt:string;projectRoot:string;prompt:string;model:string;permissionMode:any};
export async function runDueAutomations(rows:Automation[],{now=Date.now(),runtime}:{now?:number;runtime:{start(x:any):Promise<string>}}){const ran:string[]=[];const failed:Array<{id:string;error:string}>=[];for(const r of rows){if(!r.enabled||Date.parse(r.nextRunAt)>now)continue;try{await runtime.start({projectRoot:r.projectRoot,prompt:r.prompt,model:r.model,permissionMode:r.permissionMode});ran.push(r.id);}catch(e){failed.push({id:r.id,error:e instanceof Error?e.message:String(e)});}}return{ran,failed};}

export type HarnessAutomationRow={id:string;taskId:string;attiva:boolean;prossimaEsecuzione?:string|null;limiteAlGiorno?:number;eseguiteOggi?:number;giornoContatore?:string|null};
const DEFAULT_BACKOFF={baseSeconds:30,maxSeconds:900,consecutiveFailures:0,nextRetryAt:null as string|null};
const DEFAULT_MISSED={mode:'skip' as const,graceMinutes:5,catchupWindowMinutes:0};

function legacyDecision(row:HarnessAutomationRow,now:number):AutomationDecision{
  if(!row.attiva)return{action:'wait',reason:'inactive',slot:null,nextAt:row.prossimaEsecuzione??null};
  if(!row.prossimaEsecuzione)return{action:'wait',reason:'no-next-run',slot:null,nextAt:null};
  const due=Date.parse(row.prossimaEsecuzione);if(Number.isNaN(due))return{action:'wait',reason:'invalid-next-run',slot:null,nextAt:null};
  if(due>now)return{action:'wait',reason:'future',slot:null,nextAt:new Date(due).toISOString()};
  return{action:'run',reason:'legacy-due',slot:{slotKey:'legacy:'+new Date(due).toISOString(),scheduledAt:new Date(due).toISOString(),adjustedForDst:false},nextAt:null};
}
export async function dryRunAutomation(input:{now?:number;row:HarnessAutomationRow;policy:AutomationPolicy|null;onMutation?:()=>void;onDispatch?:()=>void}):Promise<AutomationDecision>{
  const now=input.now??Date.now(),row=input.row,policy=input.policy;
  if(!row.attiva)return{action:'wait',reason:'inactive',slot:null,nextAt:row.prossimaEsecuzione??null};
  if(policy?.backoff.nextRetryAt&&Date.parse(policy.backoff.nextRetryAt)>now)return{action:'wait',reason:'backoff',slot:null,nextAt:policy.backoff.nextRetryAt};
  if(policy?.schedule.kind==='daily')return decideAutomationSchedule({schedule:policy.schedule,now,lastHandledSlot:policy.lastHandledSlot,policy:policy.missedRun});
  return legacyDecision(row,now);
}
function errorInfo(error:unknown){const e=error as any;return{code:typeof e?.code==='string'?e.code:'AUTOMATION_DISPATCH_FAILED',message:error instanceof Error?error.message:String(error)};}
function policyForFailure(row:HarnessAutomationRow,policy:AutomationPolicy|null):AutomationPolicy{
  return policy??{version:1,automationId:row.id,schedule:{kind:'legacy'},missedRun:DEFAULT_MISSED,backoff:{...DEFAULT_BACKOFF},lastHandledSlot:null};
}
function nextBackoff(policy:AutomationPolicy,now:number){
  const failures=policy.backoff.consecutiveFailures+1;
  const seconds=Math.min(policy.backoff.maxSeconds,policy.backoff.baseSeconds*(2**Math.min(failures-1,20)));
  return{...policy,backoff:{...policy.backoff,consecutiveFailures:failures,nextRetryAt:new Date(now+seconds*1000).toISOString()}};
}
function utcDay(ms:number){return new Date(ms).toISOString().slice(0,10);}
export async function runAutomationTick(input:{
  now?:number;rows:HarnessAutomationRow[];
  policyFor:(id:string)=>Promise<AutomationPolicy|null>;
  savePolicy:(id:string,policy:AutomationPolicy)=>Promise<unknown>;
  appendHistory:(id:string,entry:AutomationHistoryEntry)=>Promise<unknown>;
  recordExecution:(id:string)=>Promise<unknown>;
  registry:{avvia:(taskId:string,initial?:Record<string,unknown>,provenance?:Record<string,unknown>)=>unknown|Promise<unknown>};
}){
  const now=input.now??Date.now(),started:any[]=[],failed:any[]=[],skipped:any[]=[];
  for(const row of input.rows){
    let policy=await input.policyFor(row.id);const decision=await dryRunAutomation({now,row,policy});
    const count=row.giornoContatore===utcDay(now)?Number(row.eseguiteOggi??0):0;
    if(decision.action==='run'&&typeof row.limiteAlGiorno==='number'&&Number.isFinite(row.limiteAlGiorno)&&count>=row.limiteAlGiorno){skipped.push({id:row.id,reason:'daily-limit'});continue;}
    if(decision.action==='skip-missed'&&decision.slot){
      if(policy){policy={...policy,lastHandledSlot:decision.slot.slotKey};await input.savePolicy(row.id,policy);}
      await input.appendHistory(row.id,{attemptedAt:new Date(now).toISOString(),scheduledAt:decision.slot.scheduledAt,slotKey:decision.slot.slotKey,outcome:'missed-skipped',sessionId:null,errorCode:null,errorMessage:null,nextRetryAt:null});
      skipped.push({id:row.id,reason:decision.reason});continue;
    }
    if(decision.action!=='run'||!decision.slot){skipped.push({id:row.id,reason:decision.reason});continue;}
    let sessionId:string|null=null;
    try{
      const result:any=await input.registry.avvia(row.taskId,{}, {kind:'talos-cli-automation'});
      if(result?.erroreAvvio)throw Object.assign(new Error(String(result.erroreAvvio)),{code:result.code});
      sessionId=typeof result==='string'?result:typeof result?.sessionId==='string'?result.sessionId:null;
      if(!sessionId)throw Object.assign(new Error('AUTOMATION_SESSION_ID_MISSING'),{code:'AUTOMATION_SESSION_ID_MISSING'});
    }catch(error){
      policy=nextBackoff(policyForFailure(row,policy),now);await input.savePolicy(row.id,policy);const info=errorInfo(error);
      const history={attemptedAt:new Date(now).toISOString(),scheduledAt:decision.slot.scheduledAt,slotKey:decision.slot.slotKey,outcome:'dispatch-failed' as const,sessionId:null,errorCode:info.code,errorMessage:info.message,nextRetryAt:policy.backoff.nextRetryAt};await input.appendHistory(row.id,history);
      failed.push({id:row.id,taskId:row.taskId,...info,nextRetryAt:policy.backoff.nextRetryAt});continue;
    }
    const bookkeepingErrors:Array<{stage:string;code:string;message:string}>=[];
    const bookkeeping=async(stage:string,operation:()=>Promise<unknown>)=>{try{await operation();}catch(error){const info=errorInfo(error);bookkeepingErrors.push({stage,...info});}};
    const history={attemptedAt:new Date(now).toISOString(),scheduledAt:decision.slot.scheduledAt,slotKey:decision.slot.slotKey,outcome:'dispatch-started' as const,sessionId,errorCode:null,errorMessage:null,nextRetryAt:null};
    await bookkeeping('history',()=>input.appendHistory(row.id,history));
    if(policy){policy={...policy,lastHandledSlot:policy.schedule.kind==='daily'?decision.slot.slotKey:policy.lastHandledSlot,backoff:{...policy.backoff,consecutiveFailures:0,nextRetryAt:null}};const saved=policy;await bookkeeping('policy',()=>input.savePolicy(row.id,saved));}
    await bookkeeping('execution-store',()=>input.recordExecution(row.id));
    started.push({id:row.id,taskId:row.taskId,sessionId,slotKey:decision.slot.slotKey,bookkeepingErrors});
  }
  return{started,failed,skipped};
}

/*
 * 0.6.6: the CLI side of an automation run — the kernel's scheduler, given the registry of `registryForAutomations` (the CLI's
 * permission engine, non-interactive, in the automation's mode) and two checks of its own:
 * - the folder must be TRUSTED, as for `-p` (project-trust-gate.ts): an automation never loads the instructions, hooks or MCP
 *   servers of a folder nobody trusted. The kernel starts a run synchronously, so the folders' trust is read before each tick
 *   and a folder not read, or not trusted, refuses the run (the scheduler writes it in the history as skipped, with the code);
 * - `run` waits for the run it started to end, so the process that hosts the session does not leave in the middle.
 */
import {loadEffectiveConfig} from '../config/load.ts';
import {assessProjectTrust} from '../security/project-trust-gate.ts';
import {createPermissionEngine} from '../security/permission-engine.ts';
import {sessionSecretRecheck} from '../headless/run.ts';
import {toolOutputRoot} from '../runtime/output-store.ts';
import {importTalosModule} from '../runtime/repo.ts';
import type {CliPaths} from '../paths.ts';
import {t} from '../i18n/index.ts';
import {registryForAutomations,schedulerMembers,type AutomationEngine} from './kernel-runs.ts';
import type {KernelAutomationStore} from '../services/automation-facade.ts';
import type {HostLeaseHandle} from './host-lease.ts';

export const AUTOMATION_TICK_MS=30_000;
export const AUTOMATION_RUN_POLL_MS=500;
export const RUN_GONE_READS=3;
export const RUN_READ_FAILING_MS=120_000;

/**
 * Resolves when the run `runId` of `id` is no longer under way (the store has its end), or when `signal` stops the wait. It reads
 * the store only, so a process that asked the host for a run waits for it the same way the host does.
 */
export async function runEnded(store:Pick<KernelAutomationStore,'leggi'>,id:string,runId:string,signal?:AbortSignal,failingMs=RUN_READ_FAILING_MS){
  /* the store reads null for an entry deleted, and also for one it could not read this instant (written by another process):
     only RUN_GONE_READS nulls in a row say it is gone */
  for(let missing=0,failingSince:number|null=null;;){
    /* the kernel's next store throws AUTOMATION_STORE_READ_FAILED for a read it could not do (null only for an entry that is
       not there): a read that throws is tried again, never taken for a deleted entry — for RUN_READ_FAILING_MS at most (the
       fourth review's N-F: an entry that can never be read again must not hold the wait forever) */
    let row:any;
    try{row=await store.leggi(id);failingSince=null;}
    catch{
      failingSince??=Date.now();
      if(signal?.aborted||Date.now()-failingSince>=failingMs)return;
      await new Promise(resolve=>setTimeout(resolve,AUTOMATION_RUN_POLL_MS));continue;
    }
    missing=row?0:missing+1;
    if(missing>=RUN_GONE_READS||(row&&row.giroInCorso?.runId!==runId))return;
    if(signal?.aborted)return;
    await new Promise(resolve=>setTimeout(resolve,AUTOMATION_RUN_POLL_MS));
  }
}

/** The host answers the requests of the processes that do not host (automations/host-lease.ts): run an automation, stop its run. */
export async function answerHostRequests(host:{runNow:(id:string)=>Promise<any>;stopRun:(id:string)=>Promise<any>},lease:Pick<HostLeaseHandle,'take'|'answer'>){
  for(const request of lease.take()){
    let result:unknown;
    try{
      const value=request.op==='run'?await host.runNow(request.id):await host.stopRun(request.id);
      result=value??{ok:false,code:'AUTOMATION_NOT_FOUND'};
    }catch(error){result={ok:false,code:(error as {code?:string})?.code??'AUTOMATION_RUN_NOT_STARTED',erroreAvvio:error instanceof Error?error.message:String(error)};}
    if(request.op==='run')lease.answer(request.requestId,result);/* nobody reads a stop's answer: its asker waits on the store */
  }
}

export function folderTrustCache(){
  const trusted=new Map<string,boolean>();
  return{
    async refresh(folders:Iterable<string>,trustRoot:string,assess=assessProjectTrust){
      for(const folder of new Set(folders)){try{trusted.set(folder,(await assess({projectRoot:folder,trustRoot})).trusted===true);}catch{trusted.set(folder,false);}}
    },
    isTrusted(folder:string){return trusted.get(folder)===true;},
  };
}

export async function createCliAutomationScheduler(input:{repoRoot:string;paths:CliPaths;registry:any;store:KernelAutomationStore;engineFor?:(folder:string)=>AutomationEngine|Promise<AutomationEngine>;assess?:typeof assessProjectTrust;clock?:()=>Date}){
  const trust=folderTrustCache();
  const engineFor=input.engineFor??(async(folder:string)=>{
    const effective=await loadEffectiveConfig({paths:input.paths,projectRoot:folder});
    return createPermissionEngine({projectRoot:folder,toolOutputRoot:toolOutputRoot(input.paths.dataRoot),rules:effective.value.permissions??{allow:[],ask:[],deny:[]},secretRecheck:sessionSecretRecheck(folder)}) as unknown as AutomationEngine;
  });
  const permitted=registryForAutomations(input.registry,engineFor);
  /* the trust check goes in front of the CLI's registry: an untrusted folder never reaches the kernel; an entry of the old
     format (a task of a catalog the CLI does not have) never starts, even if something switched it on (the 0.6.6 review's F4) */
  const guarded={...schedulerMembers(permitted),avvia:()=>({erroreAvvio:t('error.code.AUTOMATION_LEGACY.what'),code:'AUTOMATION_LEGACY'}),avviaGiroAutomazione:(run:Record<string,unknown>)=>{
    const folder=String(run.cartella??'');
    if(!trust.isTrusted(folder))return{erroreAvvio:t('automation.trust.run',{folder}),code:'PROJECT_TRUST_REQUIRED'};
    return permitted.avviaGiroAutomazione(run);
  }};
  const mod:any=await importTalosModule(input.repoRoot,'automation-scheduler.mjs');
  const scheduler=mod.createAutomationScheduler({store:input.store,sessionRegistry:guarded,...(input.clock?{clock:input.clock}:{})});
  const refreshTrust=async()=>{const rows=await input.store.elenca();await trust.refresh(rows.filter(row=>row?.versione===2&&typeof row.cartella==='string').map(row=>row.cartella),input.paths.trust.projects,input.assess);};
  return{
    async tick(){await refreshTrust();await scheduler.unTick();},
    async runNow(id:string){await refreshTrust();return scheduler.eseguiOra(id);},
    stopRun:(id:string)=>scheduler.fermaGiro(id),
    /** Whether a run started here still has agents at work, or results waiting for its wake (kernel-runs.ts). */
    agentsWorking:()=>permitted.agentsWorking(),
    /** Stops the runs' sessions of THIS process through the registry, without the store (it is the next host's). */
    /* the agents first, then the runs; `sistema`, not `persona`: a stop that is not the person's admits no wake turn with the
       agents' results (session-registry.mjs `ferma`, K2) — nothing is left to work in a process that no longer hosts (fifth review) */
    stopHere(){for(const sessionId of permitted.liveSessions()){try{input.registry.ferma?.(sessionId,{daChi:'sistema'});}catch{/* already ended */}}},
    runEnded:(id:string,runId:string,signal?:AbortSignal)=>runEnded(input.store,id,runId,signal),
    /** The runs under way, to wait for before a one-shot `serve --once` leaves. */
    async running(){return (await input.store.elenca()).filter(row=>row?.versione===2&&row.giroInCorso).map(row=>({id:row.id as string,runId:row.giroInCorso.runId as string}));},
  };
}

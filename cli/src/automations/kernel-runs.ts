/*
 * 0.6.6 (owner 14/10/2026, «Comandi ora, schermata dopo»): the CLI's automations run on the kernel's own machinery — the store's
 * v2 entries (instructions, folder, schedule), the scheduler (`automation-scheduler.mjs`: never two runs of one automation at
 * once, a late run once, `[SILENT]` and `[AUTOMATION_FAILURE]` read from the answer, the history of runs) and the registry's
 * `avviaGiroAutomazione` (a real session in the chosen folder, nobody in front of it). Until 0.6.5 the CLI made v1 entries (a task
 * id from a catalog the CLI does not have) that never started: TASK_CATALOG_UNAVAILABLE on every run.
 *
 * What the CLI adds, the same rule as `-p` (headless/run.ts, F-P-001 owner 09/10): the kernel is given «On request» (or «Read
 * only» for plan) and every permission is decided by the CLI's own engine, in the automation's mode, NON-interactive — a request
 * that would ask the person is refused, never waited for (owner 14/10: «da sole non aspettano nessuno»; Hermes: a scheduled job
 * cannot wait for an approval). So secret files keep asking — and a run alone is refused them — even with «Full access» (owner
 * 13/10). The store keeps the mode as the kernel's permission word; the mapping is one table, both ways.
 */
import {createEventBridge} from '../events/bridge.ts';
import {permissionActionFromApproval} from '../security/from-approval.ts';
import type {PermissionMode} from '../security/types.ts';
import {denialReasonForModel,permissionDenial} from '../headless/denials.ts';
import {t} from '../i18n/index.ts';
import {withStartingMode} from '../runtime/model-permission.ts';
import {rememberSessionMode} from '../runtime/session-modes.ts';
import {createChildrenTracker} from '../headless/children.ts';
import {automaticApproval} from '../tui/approval.ts';

/** How often a run whose own turn ended checks whether its agents are done. */
export const AGENTS_CHECK_MS=500;

/** The CLI's mode ↔ the permission word the kernel's store keeps for an automation. */
export const AUTOMATION_MODES=Object.freeze({plan:'Read only',default:'On request',acceptEdits:'Workspace write',bypassPermissions:'Full access'} as const);
export type AutomationMode=keyof typeof AUTOMATION_MODES;
export const AUTOMATION_MODE_DEFAULT:AutomationMode='acceptEdits';/* the kernel's default word, «Workspace write» (owner D2, 08/10) */
export function storeWordFor(mode:AutomationMode):string{return AUTOMATION_MODES[mode];}
export function modeForStoreWord(word:unknown):AutomationMode{
  for(const [mode,stored] of Object.entries(AUTOMATION_MODES))if(stored===word)return mode as AutomationMode;
  return'plan';/* an unknown word is the narrowest mode, never a wider one */
}
export function parseAutomationMode(value:string):AutomationMode{
  const aliases:Record<string,AutomationMode>={plan:'plan','read-only':'plan',default:'default','ask':'default',acceptedits:'acceptEdits','accept-edits':'acceptEdits',bypasspermissions:'bypassPermissions','full-access':'bypassPermissions',full:'bypassPermissions'};
  const mode=aliases[value.trim().toLowerCase()];
  if(!mode)throw Object.assign(new Error(t('error.code.AUTOMATION_MODE_INVALID.what')),{code:'AUTOMATION_MODE_INVALID',value});
  return mode;
}

type Decision={kind:string;source?:string;code?:string;message?:string};
export type AutomationEngine={decide(action:unknown,context:{interactive:false;mode:PermissionMode;sessionId:string}):Promise<Decision>};
type Registry={
  avviaGiroAutomazione(input:Record<string,unknown>):any;
  iscriviti(sessionId:string,sink:(raw:unknown)=>void,from?:number):(()=>void)|undefined;
  rispondiApprovazione(sessionId:string,requestId:string,approved:boolean,reason?:string|{motivo:string}):unknown;
  [name:string]:any;
};

/**
 * The registry the kernel's scheduler is given: the same one, except that an automation run starts with the kernel's permission
 * word the CLI uses (`On request`, or `Read only` for plan) and every approval it asks is answered by the CLI's engine in the
 * automation's mode, non-interactive. `engineFor(folder)` builds the engine with that folder's rules.
 */
export function registryForAutomations(registry:Registry,engineFor:(folder:string)=>AutomationEngine|Promise<AutomationEngine>,options:{graceMs?:number}={}):Registry&{agentsWorking():boolean;liveSessions():string[]}{
  /*
   * The agents a run delegates to work in the background and outlive the run's own turn (the kernel ends the run there, and wakes
   * the run's session with their results later): what each run still waits for is read from its own stream, as `-p` does
   * (headless/children.ts, owner 01/10 «talos -p aspetta i figli»), so a host that leaves waits for them first.
   */
  const waiting=new Set<{waiting:(nowMs:number)=>boolean}>();
  /* the runs' own sessions while their turn is going, so a host that loses the lease stops them in its process (third review F3) */
  const live=new Set<string>();
  /* the agents those runs delegated to, while they work: separate sessions the kernel's stop of a root does not reach (fifth review) */
  const liveAgents=new Set<string>();
  /* the kernel's registry is frozen: a new object with the five members its scheduler uses (automation-scheduler.mjs) */
  const avviaGiroAutomazione=(input:Record<string,unknown>)=>{
    const mode=modeForStoreWord(input.permessi);
    /* the model reads the automation's real mode from its first turn (the 0.6.6 review's F3; runtime/model-permission.ts) */
    const started=withStartingMode(mode,()=>registry.avviaGiroAutomazione({...input,permessi:mode==='plan'?'Read only':'On request'}));
    if(!started||'erroreAvvio' in started)return started;
    const rootId=String(started.sessionId);const folder=String(input.cartella??'');
    rememberSessionMode(rootId,mode);live.add(rootId);
    const engine=Promise.resolve(engineFor(folder));
    /*
     * Every approval of the run is answered here: the root's, and those of the agents it delegates to (each asks on ITS OWN
     * session, tui/descendant-approvals.ts) — the kernel announces each one to its ancestors (`talos.agenti`), so the root's
     * stream says whom to watch. Unanswered, a child's request would wait forever with nobody in front.
     */
    const watched=new Map<string,()=>void>();
    /* 0.6.7 (sixth review of 0.6.6, N3): this run's agents, so the shared list lets them go when the run settles */
    const mine=new Set<string>();
    const children=createChildrenTracker(options.graceMs!==undefined?{graceMs:options.graceMs}:{});
    /* the wake turn that answers the agents is a turn of the run's session too: open, it is waited for */
    let runEnded=false,turnOpen=false;const busy=(nowMs:number)=>turnOpen||children.waiting(nowMs);
    const run={waiting:(nowMs:number)=>!runEnded||busy(nowMs)};waiting.add(run);
    const watch=(sessionId:string)=>{
      if(watched.has(sessionId))return;
      watched.set(sessionId,()=>{});
      const bridge=createEventBridge(sessionId,()=>new Date().toISOString());const resolved=new Set<string>();
      const answer=async(data:any)=>{
        const requestId=String(data?.requestId??'');if(!requestId)return;
        const action=permissionActionFromApproval(data);
        let decision:Decision;try{decision=await (await engine).decide(action,{interactive:false,mode:mode as PermissionMode,sessionId});}catch(error){decision={kind:'deny',code:'PERMISSION_ENGINE_ERROR',message:error instanceof Error?error.message:String(error)};}
        if(resolved.has(requestId))return;/* answered already (a replayed request) */
        if(decision.kind==='allow'){await registry.rispondiApprovazione(sessionId,requestId,true,automaticApproval(decision.source??'rule'));return;}
        const refusal=decision.kind==='deny'&&decision.code?{code:decision.code,message:decision.message??''}:{code:'PERMISSION_REQUIRED',message:t('automation.refused.nobody')};
        await registry.rispondiApprovazione(sessionId,requestId,false,denialReasonForModel(permissionDenial(requestId,action,refusal)));
      };
      const off=registry.iscriviti(sessionId,raw=>{
        const r=raw as {type?:unknown;requestId?:unknown;name?:unknown;value?:any}|null;
        if(sessionId===rootId){
          children.observe(raw);
          if(r?.type==='RunStarted')turnOpen=true;else if(r?.type==='RunFinished'||r?.type==='RunError')turnOpen=false;
        }
        if(r?.type==='ApprovalResolved'&&typeof r.requestId==='string'){resolved.add(r.requestId);return;}
        if(sessionId===rootId&&r?.type==='CUSTOM'&&r.name==='talos.agenti'){
          const childId=typeof r.value?.childId==='string'&&r.value.childId?r.value.childId:null;
          if(childId){
            const ended=r.value.agent?.conclusa===true||r.value.agent?.interrotta===true||r.value.reason==='completed';
            if(ended){liveAgents.delete(childId);mine.delete(childId);try{watched.get(childId)?.();}catch{/* already closed */}}else{liveAgents.add(childId);mine.add(childId);watch(childId);}
          }
          return;
        }
        const event=bridge.translate(raw) as any;if(event?.type==='approval.required')void answer(event.data).catch(()=>{});
      },0);
      watched.set(sessionId,()=>{try{off?.();}catch{/* already closed */}});
    };
    watch(rootId);
    /* the run's own turn ended: the watch lasts while its agents work or their results wait for the wake, then lets go */
    Promise.resolve(started.fine).finally(()=>{
      runEnded=true;
      let timer:ReturnType<typeof setInterval>|null=null;
      const settled=()=>{
        if(busy(Date.now()))return false;
        if(timer)clearInterval(timer);waiting.delete(run);live.delete(rootId);/* the fourth review N-E: kept while its agents or its wake are at work */
        for(const childId of mine)liveAgents.delete(childId);mine.clear();
        for(const close of watched.values()){try{close();}catch{/* already closed */}}
        return true;
      };
      if(!settled()){timer=setInterval(settled,AGENTS_CHECK_MS);timer.unref?.();}
    }).catch(()=>{});
    return started;
  };
  return{...schedulerMembers(registry),avviaGiroAutomazione,agentsWorking:()=>[...waiting].some(run=>run.waiting(Date.now())),liveSessions:()=>[...liveAgents,...live]} as Registry&{agentsWorking():boolean;liveSessions():string[]};
}
/** What the kernel's scheduler calls on the registry besides starting a run, passed through as they are. */
export function schedulerMembers(registry:Registry){
  return{
    iscriviti:(...args:any[])=>registry.iscriviti(...(args as [string,(raw:unknown)=>void,number?])),
    rispondiApprovazione:(...args:any[])=>registry.rispondiApprovazione(...(args as [string,string,boolean,(string|{motivo:string})?])),
    avvia:(...args:any[])=>registry.avvia?.(...args),
    ferma:(...args:any[])=>registry.ferma?.(...args),
    leggiEsitoSessioneDiPasso:(...args:any[])=>registry.leggiEsitoSessioneDiPasso?.(...args),
    statoGiroAutomazione:(...args:any[])=>registry.statoGiroAutomazione?.(...args),
  };
}

import {join} from 'node:path';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {createAutomationPolicyStore,type AutomationPolicy} from '../automations/policy-store.ts';
import {createAutomationHistoryStore} from '../automations/history-store.ts';
import {dryRunAutomation} from '../automations/runner.ts';
import {probeWindowsAutomationRunner} from '../automations/windows-task.ts';
import {validateTimeZone} from '../automations/schedule.ts';

type HarnessStore={elenca:()=>Promise<any[]>;leggi:(id:string)=>Promise<any|null>;imposta?:(id:string,active:boolean)=>Promise<any|null>};
type Deps={loadAutomationStore?:()=>Promise<HarnessStore>;policyStore?:ReturnType<typeof createAutomationPolicyStore>;historyStore?:ReturnType<typeof createAutomationHistoryStore>;dryRun?:typeof dryRunAutomation;probeHealth?:typeof probeWindowsAutomationRunner};

export type AutomationCenterRow={id:string;taskId:string;name:string;active:boolean;schedule:string;timezone:string|null;nextRunAt:string|null};
function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function rowOf(row:any,policy:AutomationPolicy|null):AutomationCenterRow{
  if(!row||typeof row.id!=='string'||typeof row.taskId!=='string')fail('AUTOMATION_STORE_INVALID');
  const daily=policy?.schedule.kind==='daily'?policy.schedule:null;
  return{id:row.id,taskId:row.taskId,name:typeof row.nome==='string'?row.nome:row.taskId,active:Boolean(row.attiva),schedule:daily?'daily '+daily.at:'interval '+String(row.intervalloMinuti??'?')+'m',timezone:daily?.timezone??null,nextRunAt:typeof row.prossimaEsecuzione==='string'?row.prossimaEsecuzione:null};
}
export function createAutomationFacade(input:{projectRoot:string;dataRoot:string;repoRoot?:string},deps:Deps={}){
  const policyStore=deps.policyStore??createAutomationPolicyStore(join(input.dataRoot,'automation-policies'));
  const historyStore=deps.historyStore??createAutomationHistoryStore(join(input.dataRoot,'automation-history'));
  let storePromise:Promise<HarnessStore>|null=null;
  const store=()=>storePromise??=(deps.loadAutomationStore?deps.loadAutomationStore():(async()=>{const mod:any=await importTalosModule(input.repoRoot??findTalosRepoRoot(input.projectRoot),'automation-store.mjs');return mod.createAutomationStore({cartella:join(input.dataRoot,'automations')});})());
  const dry=deps.dryRun??dryRunAutomation,healthProbe=deps.probeHealth??probeWindowsAutomationRunner;
  async function list(){
    try{const rows=await (await store()).elenca();const joined=[];for(const raw of rows){const policy=await policyStore.get(raw.id);joined.push(rowOf(raw,policy));}return{state:'ready' as const,rows:joined,error:null};}
    catch(error){return{state:'invalid' as const,rows:[],error:{code:'AUTOMATION_STORE_INVALID',message:error instanceof Error?error.message:String(error)}};}
  }
  async function read(id:string){
    const raw=await (await store()).leggi(id);if(!raw)fail('AUTOMATION_NOT_FOUND');const policy=await policyStore.get(id),base=rowOf(raw,policy);
    const [history,dryRun,adapterHealth]=await Promise.all([historyStore.list(id),dry({row:raw,policy,now:Date.now()} as any),healthProbe({platform:process.platform} as any)]);
    return{...base,policy,missedRun:policy?.missedRun??null,backoff:policy?.backoff??null,history,dryRun,adapterHealth};
  }
  async function configureDaily(id:string,options:{at:string;timezone:string;missed:'skip'|'latest';graceMinutes:number;catchupWindowMinutes:number;baseSeconds:number;maxSeconds:number}){
    const raw=await (await store()).leggi(id);if(!raw)fail('AUTOMATION_NOT_FOUND');validateTimeZone(options.timezone);
    const policy=await policyStore.put(id,{version:1,schedule:{kind:'daily',at:options.at,timezone:options.timezone},missedRun:{mode:options.missed,graceMinutes:options.graceMinutes,catchupWindowMinutes:options.catchupWindowMinutes},backoff:{baseSeconds:options.baseSeconds,maxSeconds:options.maxSeconds,consecutiveFailures:0,nextRetryAt:null},lastHandledSlot:null});
    return{...rowOf(raw,policy),policy};
  }
  async function dryRun(id:string){const raw=await (await store()).leggi(id);if(!raw)fail('AUTOMATION_NOT_FOUND');const policy=await policyStore.get(id);return dry({row:raw,policy,now:Date.now()} as any);}
  const history=(id:string)=>historyStore.list(id);
  const health=()=>healthProbe({platform:process.platform} as any);
  async function setEnabled(id:string,active:boolean){const s=await store();if(typeof s.imposta!=='function')fail('AUTOMATION_STORE_INVALID');const updated=await s.imposta(id,active);if(!updated)fail('AUTOMATION_NOT_FOUND');return rowOf(updated,await policyStore.get(id));}
  return{list,read,configureDaily,dryRun,history,health,setEnabled,policyStore,historyStore};
}

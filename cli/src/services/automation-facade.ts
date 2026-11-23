/*
 * 0.6.6 (owner 14/10/2026, «Comandi ora, schermata dopo»): the automations as the kernel's v2 store keeps them — instructions, a
 * folder, a schedule (written as a short phrase, automations/when.ts), a mode, the history of runs. An entry of the old format
 * (a task id of a catalog the CLI does not have, made by 0.6.5 and before) is shown as such: it cannot run and cannot be edited,
 * only deleted and made again with instructions. The running itself is the kernel scheduler's (automations/kernel-runs.ts).
 */
import {join} from 'node:path';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {t} from '../i18n/index.ts';
import {probeWindowsAutomationRunner} from '../automations/windows-task.ts';
import {describeWhen,parseWhen} from '../automations/when.ts';
import {automationStoreFs} from '../automations/store-fs.ts';
import {AUTOMATION_MODE_DEFAULT,modeForStoreWord,storeWordFor,type AutomationMode} from '../automations/kernel-runs.ts';

export type KernelAutomationStore={
  elenca:()=>Promise<any[]>;leggi:(id:string)=>Promise<any|null>;crea:(input:Record<string,unknown>)=>Promise<any>;modifica:(id:string,fields:Record<string,unknown>)=>Promise<any|null>;
  imposta:(id:string,active:boolean)=>Promise<any|null>;elimina:(id:string)=>Promise<unknown>;giri:(id:string,options?:{limite?:number})=>Promise<any[]>;
  /* C9: the runs with something to say and not yet seen, across the automations, and «seen» for one of them (automation-store.mjs) */
  daGuardare?:()=>Promise<any[]>;segnaLetto?:(id:string,runId:string)=>Promise<any|null>;
};
/** C9, the Calendar: for each active automation, the hours (from the start of `from`'s day) in which a run is already due. */
export type AutomationCalendar={from:string;days:number;rows:{id:string;name:string;hours:number[]}[]};
type PlanModule={prossimoGiro:(plan:any,options:{dopo:Date;fusoOrario:string;ultimoGiro?:Date|null})=>Date|null};
type Deps={loadAutomationStore?:()=>Promise<KernelAutomationStore>;probeHealth?:typeof probeWindowsAutomationRunner;loadPlan?:()=>Promise<PlanModule>};

export type AutomationCenterRow={id:string;name:string;active:boolean;legacy:boolean;schedule:string;timezone:string|null;nextRunAt:string|null;
  folder:string|null;mode:AutomationMode|null;model:string|null;instructions:string|null;runsLeft:number|null;running:boolean;lastRunAt:string|null;
  /* C9: the kernel's own schedule, for the Calendar (null for the old format) */plan?:unknown};
export type AutomationInput={instructions:string;when:string;name?:string;folder:string;model?:string|null;mode?:AutomationMode;repeat?:number|null;coordination?:boolean;timezone?:string};

function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
const text=(value:unknown)=>typeof value==='string'&&value?value:null;
/** A name from the instructions when none is given: their first words, as a chat title is. */
export function nameFromInstructions(instructions:string):string{const words=instructions.trim().replace(/\s+/gu,' ');return words.length>60?words.slice(0,59).trimEnd()+'…':words;}

function rowOf(raw:any):AutomationCenterRow{
  if(!raw||typeof raw.id!=='string')fail('AUTOMATION_STORE_INVALID');
  const legacy=raw.versione!==2;
  return{id:raw.id,name:text(raw.nome)??text(raw.taskId)??raw.id,active:Boolean(raw.attiva),legacy,
    schedule:legacy?t('automation.name.oldFormat',{task:text(raw.taskId)??'?',minutes:String(raw.intervalloMinuti??'?')}):describeWhen(raw.pianificazione),
    timezone:legacy?null:text(raw.fusoOrario),nextRunAt:text(raw.prossimaEsecuzione),folder:legacy?null:text(raw.cartella),
    mode:legacy?null:modeForStoreWord(raw.permessi),model:text(raw.modello),instructions:legacy?null:text(raw.istruzioni),
    runsLeft:legacy||typeof raw.ripeti!=='number'?null:Math.max(0,raw.ripeti-(Number(raw.eseguite)||0)),running:Boolean(raw.giroInCorso),lastRunAt:text(raw.ultimaEsecuzione),
    plan:legacy?null:raw.pianificazione??null};
}

/**
 * C9: the hours of the next `days` days (from the start of `from`'s day, local time) in which a run of each active automation is due, read
 * from the kernel's own `prossimoGiro`. After a run is found in an hour the search jumps to the next hour, so «every minute» costs at most
 * one look per hour: 24 × days per automation, never one per run. «Every N minutes» counts from the next run the store already wrote.
 */
/*
 * review 01/11 (MEDIO 4): a cell is a day of the local calendar and an hour of its clock, never a block of 24 hours from midnight: across a
 * change of the clock (25 Oct in Rome, 1 Nov in the US) the days keep their names and the runs their hours. The repeated hour of an autumn
 * change falls in one cell, the skipped hour of a spring one is empty.
 */
export function calendarDay(from:string|Date,day:number):Date{const start=new Date(from);return new Date(start.getFullYear(),start.getMonth(),start.getDate()+day);}
export function calendarCell(from:string|Date,at:number):number{
  const start=new Date(from),d=new Date(at);
  const days=Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()))/86_400_000);
  return days*24+d.getHours();
}
const nextLocalHour=(at:number)=>{const d=new Date(at);d.setMinutes(60,0,0);return d.getTime();};
export function automationCalendar(rows:readonly AutomationCenterRow[],plan:PlanModule,{now,days=7}:{now:Date;days?:number}):AutomationCalendar{
  const start=calendarDay(now,0);const end=calendarDay(start,days).getTime();const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hourOf=(at:number)=>calendarCell(start,at);
  const out:AutomationCalendar['rows']=[];
  for(const row of rows){
    const p=row.plan as {tipo?:string;minuti?:number}|null|undefined;
    if(!row.active||row.legacy||!p||p.tipo==='manuale')continue;
    const hours=new Set<number>();const next=row.nextRunAt?Date.parse(row.nextRunAt):NaN;
    if(p.tipo==='ogni-n-minuti'&&Number(p.minuti)>0){
      const step=Number(p.minuti)*60_000;const first=Number.isFinite(next)?next:now.getTime()+step;
      /* a next run the store left in the past (overdue) is counted from now, so a run later in this same hour is not skipped */
      for(let at=first;at<end;){
        if(at<now.getTime()){at=first+Math.max(1,Math.ceil((now.getTime()-first)/step))*step;continue;}
        hours.add(hourOf(at));const hourEnd=nextLocalHour(at);at=first+Math.max(1,Math.ceil((hourEnd-first)/step))*step;
      }
    }else if(p.tipo==='una-volta'){if(Number.isFinite(next)&&next>=now.getTime()&&next<end)hours.add(hourOf(next));}
    else{
      let cursor=new Date(now.getTime()-1);
      for(let looks=0;looks<=days*24;looks+=1){
        let at:Date|null=null;try{at=plan.prossimoGiro(p,{dopo:cursor,fusoOrario:row.timezone??zone});}catch{at=null;}
        if(!at||at.getTime()>=end)break;
        hours.add(hourOf(at.getTime()));cursor=new Date(nextLocalHour(at.getTime())-1);
      }
    }
    out.push({id:row.id,name:row.name,hours:[...hours].sort((a,b)=>a-b)});
  }
  return{from:start.toISOString(),days,rows:out};
}

/** The kernel store's options: the profile's folder, and files that wait for another process's handle (store-fs.ts). */
export function kernelStoreOptions(dataRoot:string){return{cartella:join(dataRoot,'automations'),fsAdapter:automationStoreFs};}

export function createAutomationFacade(input:{projectRoot:string;dataRoot:string;repoRoot?:string},deps:Deps={}){
  let storePromise:Promise<KernelAutomationStore>|null=null;
  const store=()=>storePromise??=(deps.loadAutomationStore?deps.loadAutomationStore():(async()=>{const mod:any=await importTalosModule(input.repoRoot??findTalosRepoRoot(input.projectRoot),'automation-store.mjs');return mod.createAutomationStore(kernelStoreOptions(input.dataRoot));})());
  const healthProbe=deps.probeHealth??probeWindowsAutomationRunner;
  const v2=async(id:string)=>{const raw=await (await store()).leggi(id);if(!raw)fail('AUTOMATION_NOT_FOUND');if(raw.versione!==2)fail('AUTOMATION_LEGACY',t('error.code.AUTOMATION_LEGACY.what'));return raw;};
  async function list():Promise<{state:'ready'|'invalid';rows:AutomationCenterRow[];error:{code:string;message:string}|null}>{
    try{const rows=(await (await store()).elenca()).map(rowOf);return{state:'ready' as const,rows,error:null};}
    catch(error){return{state:'invalid' as const,rows:[] as AutomationCenterRow[],error:{code:'AUTOMATION_STORE_INVALID',message:error instanceof Error?error.message:String(error)}};}
  }
  async function read(id:string){
    const s=await store();const raw=await s.leggi(id);if(!raw)fail('AUTOMATION_NOT_FOUND');
    const [runs,adapterHealth]=await Promise.all([raw.versione===2?s.giri(id,{limite:20}):Promise.resolve([]),healthProbe({platform:process.platform} as any)]);
    return{...rowOf(raw),runs,adapterHealth};
  }
  async function add(entry:AutomationInput){
    const instructions=String(entry.instructions??'').trim();if(!instructions)fail('AUTOMATION_INSTRUCTIONS_REQUIRED',t('error.code.AUTOMATION_INSTRUCTIONS_REQUIRED.what'));
    const schedule=parseWhen(entry.when);
    const created=await (await store()).crea({nome:entry.name?.trim()||nameFromInstructions(instructions),istruzioni:instructions,cartella:entry.folder,
      ...(entry.model?{modello:entry.model}:{}),permessi:storeWordFor(entry.mode??AUTOMATION_MODE_DEFAULT),coordinazione:entry.coordination===true,pianificazione:schedule,
      ...(entry.timezone?{fusoOrario:entry.timezone}:{}),...(entry.repeat!==undefined&&entry.repeat!==null?{ripeti:entry.repeat}:{}),origine:{tipo:'interfaccia'}});
    return rowOf(created);
  }
  async function edit(id:string,changes:Partial<AutomationInput>){
    await v2(id);const fields:Record<string,unknown>={};
    if(changes.instructions!==undefined){const value=changes.instructions.trim();if(!value)fail('AUTOMATION_INSTRUCTIONS_REQUIRED');fields.istruzioni=value;}
    if(changes.when!==undefined)fields.pianificazione=parseWhen(changes.when);
    if(changes.name!==undefined)fields.nome=changes.name;
    if(changes.folder!==undefined)fields.cartella=changes.folder;
    if(changes.model!==undefined)fields.modello=changes.model;
    if(changes.mode!==undefined)fields.permessi=storeWordFor(changes.mode);
    if(changes.repeat!==undefined)fields.ripeti=changes.repeat;
    if(changes.coordination!==undefined)fields.coordinazione=changes.coordination;
    if(changes.timezone!==undefined)fields.fusoOrario=changes.timezone;
    if(!Object.keys(fields).length)fail('AUTOMATION_NOTHING_TO_CHANGE',t('error.code.AUTOMATION_NOTHING_TO_CHANGE.what'));
    const updated=await (await store()).modifica(id,fields);if(!updated)fail('AUTOMATION_NOT_FOUND');return rowOf(updated);
  }
  async function setEnabled(id:string,active:boolean){if(active)await v2(id);const s=await store();const updated=await s.imposta(id,active);if(!updated)fail('AUTOMATION_NOT_FOUND');return rowOf(updated);}
  async function remove(id:string){const s=await store();if(!(await s.leggi(id)))fail('AUTOMATION_NOT_FOUND');await s.elimina(id);return{ok:true,id};}
  const history=async(id:string)=>{await v2(id);return (await store()).giri(id,{limite:50});};
  const health=()=>healthProbe({platform:process.platform} as any);
  /* C9: what the page reads, once, when it opens or after a change: the rows, the runs to review, the last runs of each, the week ahead */
  let planPromise:Promise<PlanModule>|null=null;
  const planModule=()=>planPromise??=(deps.loadPlan?deps.loadPlan():importTalosModule(input.repoRoot??findTalosRepoRoot(input.projectRoot),'automation-pianificazione.mjs') as Promise<PlanModule>);
  async function page(now=new Date()){
    const listed=await list();const s=await store();
    const review=listed.state==='ready'&&typeof s.daGuardare==='function'?await s.daGuardare().catch(()=>[] as any[]):[];
    const runs=new Map(await Promise.all(listed.rows.filter(row=>!row.legacy).map(async row=>[row.id,await s.giri(row.id,{limite:5}).catch(()=>[] as any[])] as const)));
    const calendar=automationCalendar(listed.rows,await planModule(),{now});
    return{...listed,review,runs,calendar};
  }
  /** «Seen» for the runs to review of one automation; a store without the verb says so. */
  async function markSeen(id:string,runIds:readonly string[]){const s=await store();if(typeof s.segnaLetto!=='function')fail('AUTOMATION_STORE_INVALID');for(const runId of runIds)await s.segnaLetto(id,runId);return{ok:true,id,count:runIds.length};}
  return{list,read,add,edit,setEnabled,remove,history,health,store,requireRunnable:v2,page,markSeen};
}

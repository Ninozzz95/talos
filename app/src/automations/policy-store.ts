import {mkdir,readFile,rename,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {AutomationSchedule,MissedRunPolicy} from './schedule.ts';
import {validateTimeZone} from './schedule.ts';

export type AutomationBackoff={baseSeconds:number;maxSeconds:number;consecutiveFailures:number;nextRetryAt:string|null};
export type AutomationPolicy={version?:1;automationId:string;schedule:AutomationSchedule;missedRun:MissedRunPolicy;backoff:AutomationBackoff;lastHandledSlot:string|null};
function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function safeId(id:string){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id))fail('AUTOMATION_ID_INVALID');return id;}
function positive(value:unknown,name:string,zero=false){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(zero?0:1))fail(name);return value;}
function normalize(id:string,value:any):AutomationPolicy{
  safeId(id);if(!value||typeof value!=='object'||Array.isArray(value))fail('AUTOMATION_POLICY_INVALID');
  let schedule:AutomationSchedule;
  if(value.schedule?.kind==='legacy')schedule={kind:'legacy'};
  else if(value.schedule?.kind==='daily'&&typeof value.schedule.at==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/u.test(value.schedule.at)&&typeof value.schedule.timezone==='string')schedule={kind:'daily',at:value.schedule.at,timezone:validateTimeZone(value.schedule.timezone)};
  else fail('AUTOMATION_POLICY_INVALID');
  const mode=value.missedRun?.mode;if(mode!=='skip'&&mode!=='latest')fail('AUTOMATION_POLICY_INVALID');
  const missedRun={mode,graceMinutes:positive(value.missedRun?.graceMinutes,'AUTOMATION_POLICY_INVALID',true),catchupWindowMinutes:positive(value.missedRun?.catchupWindowMinutes,'AUTOMATION_POLICY_INVALID',true)} as MissedRunPolicy;
  const baseSeconds=positive(value.backoff?.baseSeconds,'AUTOMATION_POLICY_INVALID'),maxSeconds=positive(value.backoff?.maxSeconds,'AUTOMATION_POLICY_INVALID');if(maxSeconds<baseSeconds)fail('AUTOMATION_POLICY_INVALID');
  const consecutiveFailures=positive(value.backoff?.consecutiveFailures,'AUTOMATION_POLICY_INVALID',true),nextRetryAt=value.backoff?.nextRetryAt===null?null:typeof value.backoff?.nextRetryAt==='string'&&!Number.isNaN(Date.parse(value.backoff.nextRetryAt))?new Date(value.backoff.nextRetryAt).toISOString():fail('AUTOMATION_POLICY_INVALID');
  return{version:1,automationId:id,schedule,missedRun,backoff:{baseSeconds,maxSeconds,consecutiveFailures,nextRetryAt},lastHandledSlot:value.lastHandledSlot===null?null:typeof value.lastHandledSlot==='string'?value.lastHandledSlot:fail('AUTOMATION_POLICY_INVALID')};
}
export function createAutomationPolicyStore(directory:string){
  const pathFor=(id:string)=>join(directory,safeId(id)+'.json');
  async function get(id:string):Promise<AutomationPolicy|null>{const path=pathFor(id);try{return normalize(id,JSON.parse(await readFile(path,'utf8')));}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}}
  async function put(id:string,value:Omit<AutomationPolicy,'automationId'>|AutomationPolicy){const row=normalize(id,{...value,automationId:id});await mkdir(directory,{recursive:true});const path=pathFor(id),tmp=path+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(row,null,2)+'\n','utf8');await rename(tmp,path);return row;}
  async function remove(id:string){await rm(pathFor(id),{force:true});}
  return{get,put,delete:remove};
}

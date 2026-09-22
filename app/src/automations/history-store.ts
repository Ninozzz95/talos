import {mkdir,readFile,rename,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
export type AutomationHistoryOutcome='dispatch-started'|'dispatch-failed'|'missed-skipped';
export type AutomationHistoryEntry={attemptedAt:string;scheduledAt:string|null;slotKey:string|null;outcome:AutomationHistoryOutcome;sessionId:string|null;errorCode:string|null;errorMessage:string|null;nextRetryAt:string|null};
function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function safeId(id:string){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id))fail('AUTOMATION_ID_INVALID');return id;}
function entry(value:any):AutomationHistoryEntry{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('AUTOMATION_HISTORY_INVALID');
  const outcome=value.outcome;if(!['dispatch-started','dispatch-failed','missed-skipped'].includes(outcome))fail('AUTOMATION_HISTORY_INVALID');
  const nullable=(v:any)=>v===null?null:typeof v==='string'?v:fail('AUTOMATION_HISTORY_INVALID');
  if(typeof value.attemptedAt!=='string'||Number.isNaN(Date.parse(value.attemptedAt)))fail('AUTOMATION_HISTORY_INVALID');
  return{attemptedAt:new Date(value.attemptedAt).toISOString(),scheduledAt:nullable(value.scheduledAt),slotKey:nullable(value.slotKey),outcome,sessionId:nullable(value.sessionId),errorCode:nullable(value.errorCode),errorMessage:nullable(value.errorMessage),nextRetryAt:nullable(value.nextRetryAt)};
}
export function createAutomationHistoryStore(directory:string,options:{limit?:number}={}){
  const limit=Number.isSafeInteger(options.limit)&&Number(options.limit)>0?Number(options.limit):200;
  const pathFor=(id:string)=>join(directory,safeId(id)+'.json');
  async function list(id:string):Promise<AutomationHistoryEntry[]>{const path=pathFor(id);try{const parsed=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(parsed))fail('AUTOMATION_HISTORY_INVALID');return parsed.map(entry);}catch(error:any){if(error?.code==='ENOENT')return[];throw error;}}
  async function append(id:string,value:AutomationHistoryEntry){const rows=await list(id);rows.push(entry(value));const kept=rows.slice(-limit);await mkdir(directory,{recursive:true});const path=pathFor(id),tmp=path+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(kept,null,2)+'\n','utf8');await rename(tmp,path);return kept.at(-1)!;}
  async function remove(id:string){await rm(pathFor(id),{force:true});}
  return{list,append,delete:remove};
}

import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {StartInput} from './types.ts';

function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    const source=value as Record<string,unknown>;
    return Object.fromEntries(Object.keys(source).sort().filter(key=>source[key]!==undefined).map(key=>[key,canonical(source[key])]));
  }
  return value===undefined?null:value;
}
function identity(value:unknown){return JSON.stringify(canonical(value));}

export function startOperationFingerprint(input:StartInput):string{
  const {operationId:_operationId,...material}=input;
  return createHash('sha256').update(identity(material)).digest('hex');
}

export function createRuntimeReplayBuffer(){
  const sessions=new Map<string,Map<number,{identity:string;event:Record<string,unknown>}>>();
  return{
    push(sessionId:string,event:Record<string,unknown>){
      const raw=(event as any)?._sequenza;
      const sequence=typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0?raw:null;
      if(sequence===null)return false;
      let rows=sessions.get(sessionId);
      if(!rows){rows=new Map();sessions.set(sessionId,rows);}
      const eventIdentity=identity(event);
      const existing=rows.get(sequence);
      if(existing){
        if(existing.identity===eventIdentity)return false;
        throw Object.assign(new Error('REPLAY_EVENT_CONFLICT'),{code:'REPLAY_EVENT_CONFLICT',sessionId,sequence});
      }
      rows.set(sequence,{identity:eventIdentity,event:structuredClone(event)});
      return true;
    },
    after(sessionId:string,sequence=0){
      return [...(sessions.get(sessionId)?.entries()??[])]
        .filter(([candidate])=>candidate>sequence)
        .sort(([a],[b])=>a-b)
        .map(([,row])=>structuredClone(row.event));
    },
    latest(sessionId:string){
      const keys=[...(sessions.get(sessionId)?.keys()??[])];
      return keys.length?Math.max(...keys):0;
    },
    clear(sessionId?:string){if(sessionId)sessions.delete(sessionId);else sessions.clear();},
  };
}

type JournalRecord={schema:'talos.cli.runtime-start-operation.v1';operationId:string;fingerprint:string;pid:number;createdAt:string};
type StartOperationJournalOptions={
  rootDir:string;
  pid?:number;
  isProcessAlive?:(pid:number)=>boolean;
  operationId?:()=>string;
  now?:()=>string;
};
function processAlive(pid:number){
  try{process.kill(pid,0);return true;}catch(error:any){return error?.code==='EPERM';}
}
function ownerPid(name:string):number|null{
  const match=/\.(\d+)\.json$/u.exec(name);
  if(!match)return null;
  const value=Number(match[1]);
  return Number.isSafeInteger(value)&&value>0?value:null;
}
function operationPath(root:string,operationId:string,pid:number){
  return join(root,`${encodeURIComponent(operationId)}.${pid}.json`);
}
async function readRecord(path:string):Promise<JournalRecord|null>{
  try{
    const value=JSON.parse(await readFile(path,'utf8'));
    if(value?.schema!=='talos.cli.runtime-start-operation.v1'||typeof value.operationId!=='string'||typeof value.fingerprint!=='string')return null;
    return value as JournalRecord;
  }catch{return null;}
}

export function createStartOperationJournal(options:StartOperationJournalOptions){
  const pid=options.pid??process.pid;
  const isProcessAlive=options.isProcessAlive??processAlive;
  const nextOperationId=options.operationId??randomUUID;
  const now=options.now??(()=>new Date().toISOString());
  const root=options.rootDir;
  async function ensure(){await mkdir(root,{recursive:true,mode:0o700});}
  return{
    async claim(fingerprint:string):Promise<{operationId:string;recovered:boolean}>{
      await ensure();
      let names:string[]=[];try{names=await readdir(root);}catch{}
      for(const name of names.sort()){
        if(!name.endsWith('.json'))continue;
        const oldPid=ownerPid(name);if(oldPid===null||oldPid===pid||isProcessAlive(oldPid))continue;
        const source=join(root,name);const record=await readRecord(source);
        if(!record||record.fingerprint!==fingerprint)continue;
        const target=operationPath(root,record.operationId,pid);
        try{await rename(source,target);}catch(error:any){if(error?.code==='ENOENT'||error?.code==='EEXIST')continue;throw error;}
        const claimed:JournalRecord={...record,pid};
        await writeFile(target,`${JSON.stringify(claimed)}\n`,{encoding:'utf8',mode:0o600});
        return{operationId:record.operationId,recovered:true};
      }
      for(let attempt=0;attempt<16;attempt++){
        const id=nextOperationId();
        const file=operationPath(root,id,pid);
        const record:JournalRecord={schema:'talos.cli.runtime-start-operation.v1',operationId:id,fingerprint,pid,createdAt:now()};
        try{
          await writeFile(file,`${JSON.stringify(record)}\n`,{encoding:'utf8',mode:0o600,flag:'wx'});
          return{operationId:id,recovered:false};
        }catch(error:any){if(error?.code==='EEXIST')continue;throw error;}
      }
      throw Object.assign(new Error('RUNTIME_OPERATION_ID_UNAVAILABLE'),{code:'RUNTIME_OPERATION_ID_UNAVAILABLE'});
    },
    async releaseOwned(){
      await ensure();
      let names:string[]=[];try{names=await readdir(root);}catch{return;}
      await Promise.all(names.filter(name=>ownerPid(name)===pid).map(name=>rm(join(root,name),{force:true})));
    },
  };
}
export type StartOperationJournal=ReturnType<typeof createStartOperationJournal>;
export type RuntimeReplayBuffer=ReturnType<typeof createRuntimeReplayBuffer>;

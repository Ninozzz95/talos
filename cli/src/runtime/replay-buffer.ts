import {createHash,hash,randomUUID} from 'node:crypto';
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

/* UI phase stage 2, cure 2b (heap probe 2, 01/10, owner: bounded window). The buffer kept a full copy of every event of
   a session for ever, streamed text fragments included. Now: a short fingerprint for EVERY sequence seen (a different event
   at a known sequence is still a conflict, anywhere in the session) and the whole event only for the last REPLAY_WINDOW
   sequences. A cursor older than the window is REPLAY_EVENTS_EXPIRED, said out loud, never a silent gap.
   Sources: Hermes gateway _RunStream (BACKLOG_LIMIT 1000, deque maxlen); Codex app-server bounded channels; Node 24
   crypto.hash; server-sent-events.com replay buffer for Last-Event-ID; open-design #5411 (silent gap, anti-pattern). */
export const REPLAY_WINDOW=1000;
type ReplaySession={fingerprints:Map<number,string>;events:Map<number,Record<string,unknown>>;expiredThrough:number;latest:number};
const fingerprintOf=(event:unknown)=>hash('sha256',identity(event),'base64').slice(0,22);
export function createRuntimeReplayBuffer({window=REPLAY_WINDOW}:{window?:number}={}){
  const sessions=new Map<string,ReplaySession>();
  return{
    /** Whole events held for the session (at most `window`). */
    retained(sessionId:string){return sessions.get(sessionId)?.events.size??0;},
    push(sessionId:string,event:Record<string,unknown>){
      const raw=(event as any)?._sequenza;
      const sequence=typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0?raw:null;
      if(sequence===null)return false;
      let session=sessions.get(sessionId);
      if(!session){session={fingerprints:new Map(),events:new Map(),expiredThrough:0,latest:0};sessions.set(sessionId,session);}
      const fingerprint=fingerprintOf(event);
      const existing=session.fingerprints.get(sequence);
      if(existing!==undefined){
        if(existing===fingerprint)return false;
        throw Object.assign(new Error('REPLAY_EVENT_CONFLICT'),{code:'REPLAY_EVENT_CONFLICT',sessionId,sequence});
      }
      session.fingerprints.set(sequence,fingerprint);
      session.events.set(sequence,structuredClone(event));
      if(sequence>session.latest)session.latest=sequence;
      while(session.events.size>window){
        const oldest=session.events.keys().next().value as number;
        session.events.delete(oldest);
        if(oldest>session.expiredThrough)session.expiredThrough=oldest;
      }
      return true;
    },
    after(sessionId:string,sequence=0){
      const session=sessions.get(sessionId);
      if(!session)return [];
      if(sequence<session.expiredThrough)throw Object.assign(new Error('REPLAY_EVENTS_EXPIRED'),{code:'REPLAY_EVENTS_EXPIRED',sessionId,sequence,oldestKept:session.expiredThrough+1});
      return [...session.events.entries()]
        .filter(([candidate])=>candidate>sequence)
        .sort(([a],[b])=>a-b)
        .map(([,event])=>structuredClone(event));
    },
    latest(sessionId:string){return sessions.get(sessionId)?.latest??0;},
    clear(sessionId?:string){if(sessionId)sessions.delete(sessionId);else sessions.clear();},
  };
}

export type JournalRecord={schema:'talos.cli.runtime-start-operation.v1';operationId:string;fingerprint:string;pid:number;createdAt:string;sessionId?:string};
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

/*
 * Owner 02/10 («Chiave per invio + ripresa visibile», registro 12): a start is recognised by the key of the SEND, as an
 * Idempotency-Key is (IETF draft-ietf-httpapi-idempotency-key-header: a unique client value that only recognises retries of
 * the same request; Stripe: a key per intent, never reused for other parameters). The M7-C journal reclaimed a dead
 * process's start whose CONTENT matched, so a person who typed the same message again after a crash got
 * RUNTIME_OPERATION_INTERRUPTED (reproduced on the built CLI, 02/10). Now:
 *   - a start without a key gets a new one: the same content after a crash is a new start;
 *   - a start that carries the key of a dead process's start is its retry and recovers it; the key with other content is
 *     refused (RUNTIME_OPERATION_KEY_REUSED, the draft's 422);
 *   - each start remembers the session it began (`bind`), so the next process reads what a dead one left (`leftovers`),
 *     says which turn was interrupted, and prunes it (`prune`); a clean close still releases this process's starts.
 */
export function createStartOperationJournal(options:StartOperationJournalOptions){
  const pid=options.pid??process.pid;
  const isProcessAlive=options.isProcessAlive??processAlive;
  const nextOperationId=options.operationId??randomUUID;
  const now=options.now??(()=>new Date().toISOString());
  const root=options.rootDir;
  async function ensure(){await mkdir(root,{recursive:true,mode:0o700});}
  async function names(){try{return (await readdir(root)).filter(name=>name.endsWith('.json')).sort();}catch{return[];}}
  /* fourth review of 0.6.4 (NIT): a rewrite killed between its temporary and the rename leaves `<record>.json.<uuid>.tmp`, which
     `names()` never reads: its owner removes it at a clean close, the next process when it prunes a dead one's starts */
  async function sweepTemporaries(remove:(owner:number)=>boolean){
    let all:string[]=[];try{all=await readdir(root);}catch{return;}
    await Promise.all(all.map(name=>{const match=/\.(\d+)\.json\.[0-9a-f-]+\.tmp$/u.exec(name);const owner=match?Number(match[1]):NaN;return Number.isSafeInteger(owner)&&owner>0&&remove(owner)?rm(join(root,name),{force:true}).catch(()=>{/* a temporary is litter: a file Windows holds (EPERM, EBUSY) is left for the next sweep, never fails a close or a prune */}):undefined;}));
  }
  const dead=(name:string)=>{const owner=ownerPid(name);return owner!==null&&owner!==pid&&!isProcessAlive(owner);};
  /* review of 0.6.4 (acceptance s49, 14/10/2026): a rewrite (`bind`, a recovered start) went through `writeFile`, which empties the
     record before writing it; a TALOS killed in that moment — the start binds its session just as the answer begins — left an EMPTY
     record, and the next TALOS never said which turn was cut. A rewrite is now a temporary file renamed over the record (a kill
     leaves the old record or the new one); the temporary name does not end in `.json`, so `names()` never reads it. A new record
     keeps `wx` (it must not take another start's name). */
  async function write(file:string,record:JournalRecord,flag?:'wx'){
    const text=`${JSON.stringify(record)}\n`;
    if(flag){await writeFile(file,text,{encoding:'utf8',mode:0o600,flag});return;}
    const temporary=`${file}.${randomUUID()}.tmp`;
    try{await writeFile(temporary,text,{encoding:'utf8',mode:0o600});await rename(temporary,file);}
    catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}
  }
  return{
    async claim(fingerprint:string,operationId?:string|null):Promise<{operationId:string;recovered:boolean}>{
      await ensure();
      if(operationId){
        for(const name of await names()){
          if(!dead(name))continue;
          const source=join(root,name);const record=await readRecord(source);
          if(!record||record.operationId!==operationId)continue;
          if(record.fingerprint!==fingerprint)throw Object.assign(new Error('RUNTIME_OPERATION_KEY_REUSED'),{code:'RUNTIME_OPERATION_KEY_REUSED'});
          const target=operationPath(root,record.operationId,pid);
          try{await rename(source,target);}catch(error:any){if(error?.code==='ENOENT'||error?.code==='EEXIST')continue;throw error;}
          await write(target,{...record,pid});
          return{operationId:record.operationId,recovered:true};
        }
        const record:JournalRecord={schema:'talos.cli.runtime-start-operation.v1',operationId,fingerprint,pid,createdAt:now()};
        await write(operationPath(root,operationId,pid),record);
        return{operationId,recovered:false};
      }
      for(let attempt=0;attempt<16;attempt++){
        const id=nextOperationId();
        const record:JournalRecord={schema:'talos.cli.runtime-start-operation.v1',operationId:id,fingerprint,pid,createdAt:now()};
        try{await write(operationPath(root,id,pid),record,'wx');return{operationId:id,recovered:false};}
        catch(error:any){if(error?.code==='EEXIST')continue;throw error;}
      }
      throw Object.assign(new Error('RUNTIME_OPERATION_ID_UNAVAILABLE'),{code:'RUNTIME_OPERATION_ID_UNAVAILABLE'});
    },
    /** The session a start of this process began, kept with it so a later process can name an interrupted turn. */
    async bind(operationId:string,sessionId:string){
      const file=operationPath(root,operationId,pid);const record=await readRecord(file);
      if(record)await write(file,{...record,sessionId});
    },
    /** The starts a dead process left behind (a crash, a closed window), with the session each began when it got that far. */
    async leftovers():Promise<JournalRecord[]>{
      const out:JournalRecord[]=[];
      for(const name of await names()){if(!dead(name))continue;const record=await readRecord(join(root,name));if(record)out.push(record);}
      return out;
    },
    /** Removes leftovers once they have been read: a dead process's interruption is said once. */
    async prune(records:readonly JournalRecord[]){
      await Promise.all(records.map(record=>rm(operationPath(root,record.operationId,record.pid),{force:true})));
      await sweepTemporaries(owner=>owner!==pid&&!isProcessAlive(owner));
    },
    async releaseOwned(){
      await ensure();
      await Promise.all((await names()).filter(name=>ownerPid(name)===pid).map(name=>rm(join(root,name),{force:true})));
      await sweepTemporaries(owner=>owner===pid);
    },
  };
}
export type StartOperationJournal=ReturnType<typeof createStartOperationJournal>;
export type RuntimeReplayBuffer=ReturnType<typeof createRuntimeReplayBuffer>;

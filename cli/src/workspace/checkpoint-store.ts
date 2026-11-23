import {randomUUID} from 'node:crypto';
import {chmod,mkdir,open,readdir,readFile,rename,rm} from 'node:fs/promises';
import {realpathTolerant as realpath} from '../security/real-path.ts';
import path from 'node:path';
import {resolveWorkspaceIdentity} from '../security/workspace-identity.ts';
import {autoPruneIfNeeded} from './checkpoint-prune.ts';
import {CHECKPOINT_LIMITS,captureWorkspaceSnapshot,extractWorkspaceWriteEvidence,sameGitSnapshot,sameSnapshotEntry,untouchablePath,type CheckpointLimits,type StatRow,type WorkspaceSnapshot,type WorkspaceWriteEvidence} from './checkpoint.ts';

export type CheckpointOperation='start'|'resume'|'fork'|'shell';
export type CheckpointState='open'|'complete'|'undone';
export type CheckpointTransition={kind:'created'|'finalized'|'undo'|'redo';at:string};
export type CheckpointRecord={
  schema:'talos.cli.checkpoint.v1';
  id:string;
  operation:CheckpointOperation;
  sessionId:string|null;
  commandId:string|null;
  state:CheckpointState;
  createdAt:string;
  finalizedAt:string|null;
  workspaceIdentityHash:string;
  canonicalRoot:string;
  pre:WorkspaceSnapshot;
  post:WorkspaceSnapshot|null;
  writeEvidence:WorkspaceWriteEvidence[];
  reversible:boolean;
  nonReversibleReason:string|null;
  finalizationError:string|null;
  transitions:CheckpointTransition[];
};
export type CheckpointBeginInput={operation:CheckpointOperation;sessionId?:string|null};
export type RestoreTransaction={schema:'talos.cli.checkpoint-restore.v1';checkpointId:string;direction:'undo'|'redo';expectedFinalState:CheckpointState;paths:string[];createdAt:string};
export type CheckpointHandle={
  readonly id:string;
  /* D1: what this checkpoint leaves out of /undo, in one sentence, or null when it covers everything */
  readonly coverageGap:string|null;
  bindSession(sessionId:string):void;
  bindCommand(commandId:string):void;
  observe(raw:unknown):void;
  finalize():Promise<CheckpointRecord>;
};
export type CheckpointStore={
  readonly projectRoot:string;
  readonly rootDir:string;
  readonly blobRoot:string;
  readonly limits:CheckpointLimits;
  begin(input:CheckpointBeginInput):Promise<CheckpointHandle>;
  list():Promise<CheckpointRecord[]>;
  show(id:string):Promise<CheckpointRecord>;
  latest(state:CheckpointState):Promise<CheckpointRecord|null>;
  capture():Promise<WorkspaceSnapshot>;
  replace(record:CheckpointRecord):Promise<void>;
  withRestoreLock<T>(fn:()=>Promise<T>):Promise<T>;
  readRestoreTransaction():Promise<RestoreTransaction|null>;
  writeRestoreTransaction(tx:RestoreTransaction):Promise<void>;
  clearRestoreTransaction():Promise<void>;
};

function coded(code:string,message=code):Error{return Object.assign(new Error(message===code?code:`${code}: ${message}`),{code});}
function validId(id:string){if(!/^[0-9]+-[0-9a-f-]{36}$/iu.test(id))throw coded('CHECKPOINT_ID_INVALID');return id;}
async function durableDir(dirname:string){try{const h=await open(dirname,'r');try{await h.sync();}finally{await h.close();}}catch(error){if(process.platform!=='win32')throw error;}}
async function ensurePrivateDir(dirname:string){await mkdir(dirname,{recursive:true,mode:0o700});try{await chmod(dirname,0o700);}catch(error){if(process.platform!=='win32')throw error;}}
/*
 * 14/10/2026: on Windows a rename over a file someone is reading fails with EPERM (measured: an open read handle, or a readFile
 * in flight, on the target), and the record of a checkpoint is read by anything that lists checkpoints (another
 * `talos checkpoint list`, the /rewind sheet) — a command's checkpoint then stayed open for good and lost its /undo. The rename is
 * retried while the reader lets go (graceful-fs does the same for EPERM/EACCES/EBUSY on win32), for about two seconds at most.
 */
const RENAME_RETRY_MS=2_000;
async function renameOver(from:string,to:string){
  const started=Date.now();
  for(let attempt=1;;attempt++){
    try{await rename(from,to);return;}
    catch(error:any){
      if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(String(error?.code))||Date.now()-started>=RENAME_RETRY_MS)throw error;
      await new Promise(resolve=>setTimeout(resolve,Math.min(10*attempt,100)));
    }
  }
}
async function atomicWrite(pathname:string,text:string){
  const dirname=path.dirname(pathname);await ensurePrivateDir(dirname);const temp=path.join(dirname,`.${path.basename(pathname)}.${process.pid}.${randomUUID()}.tmp`);
  try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(text,'utf8');await handle.sync();}finally{await handle.close();}
    await renameOver(temp,pathname);try{await chmod(pathname,0o600);}catch(error){if(process.platform!=='win32')throw error;}await durableDir(dirname);
  }catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
}
function parseRecord(text:string,expectedRoot:string):CheckpointRecord{
  const value=JSON.parse(text) as CheckpointRecord;
  if(value?.schema!=='talos.cli.checkpoint.v1'||typeof value.id!=='string'||value.canonicalRoot!==expectedRoot||!['open','complete','undone'].includes(value.state)||!value.pre)throw coded('CHECKPOINT_STORE_INVALID');
  return value;
}
const STAT_INDEX_SCHEMA='talos.cli.checkpoint-stat-index.v1';
async function loadStatIndex(indexPath:string):Promise<Map<string,StatRow>>{
  const rows=new Map<string,StatRow>();
  try{
    const value=JSON.parse(await readFile(indexPath,'utf8'));if(value?.schema!==STAT_INDEX_SCHEMA||!Array.isArray(value.rows))return rows;
    for(const row of value.rows){
      if(!Array.isArray(row)||row.length!==6)continue;const [p,size,mtimeMs,ctimeMs,ref,verifiedAtMs]=row;
      if(typeof p==='string'&&typeof ref==='string'&&/^[0-9a-f]{64}$/u.test(ref)&&[size,mtimeMs,ctimeMs,verifiedAtMs].every(n=>typeof n==='number'&&Number.isFinite(n)))rows.set(p,{size,mtimeMs,ctimeMs,ref,verifiedAtMs});
    }
  }catch{/* missing or torn: an empty index, every file is read again */}
  return rows;
}
function dedupeEvidence(rows:readonly WorkspaceWriteEvidence[]){const byKey=new Map<string,WorkspaceWriteEvidence>();for(const row of rows)byKey.set(`${row.path}\0${row.beforeHash??''}\0${row.afterHash??''}`,row);return[...byKey.values()];}
export function createCheckpointStore({rootDir,projectRoot,limits=CHECKPOINT_LIMITS}:{rootDir:string;projectRoot:string;limits?:CheckpointLimits}):CheckpointStore{
  const absoluteProject=path.resolve(projectRoot);const absoluteRoot=path.resolve(rootDir);const blobRoot=path.join(absoluteRoot,'blobs');let initialized:Promise<{workspaceDir:string;recordsDir:string;canonicalRoot:string}>|null=null;
  async function init(){
    if(!initialized)initialized=(async()=>{const workspace=await resolveWorkspaceIdentity({projectRoot:absoluteProject});const relation=path.relative(workspace.canonicalRoot,absoluteRoot);if(relation===''||(!relation.startsWith(`..${path.sep}`)&&relation!=='..'&&!path.isAbsolute(relation)))throw coded('CHECKPOINT_STORE_INSIDE_WORKSPACE');await ensurePrivateDir(absoluteRoot);const canonicalState=await realpath(absoluteRoot);const stateRelation=path.relative(workspace.canonicalRoot,canonicalState);if(stateRelation===''||(!stateRelation.startsWith(`..${path.sep}`)&&stateRelation!=='..'&&!path.isAbsolute(stateRelation)))throw coded('CHECKPOINT_STORE_INSIDE_WORKSPACE');const workspaceDir=path.join(canonicalState,'workspaces',workspace.identityHash),recordsDir=path.join(workspaceDir,'records');await Promise.all([ensurePrivateDir(blobRoot),ensurePrivateDir(workspaceDir),ensurePrivateDir(recordsDir)]);return{workspaceDir,recordsDir,canonicalRoot:workspace.canonicalRoot};})();
    return initialized;
  }
  async function recordPath(id:string){const x=await init();return path.join(x.recordsDir,`${validId(id)}.json`);}
  async function read(id:string){const x=await init();try{return parseRecord(await readFile(await recordPath(id),'utf8'),x.canonicalRoot);}catch(error:any){if(error?.code==='ENOENT')throw coded('CHECKPOINT_NOT_FOUND');throw error;}}
  async function replace(record:CheckpointRecord){const x=await init();if(record.canonicalRoot!==x.canonicalRoot)throw coded('CHECKPOINT_WORKSPACE_MISMATCH');await atomicWrite(await recordPath(record.id),`${JSON.stringify(record)}\n`);}
  /* P18: the stat index of the last capture (checkpoint.ts StatCache), kept in memory and in the workspace's folder so a new
     `talos -p` process starts from it too. It is only a cache: unreadable means empty (every file read again), and a
     failed save costs speed on the next turn, never a checkpoint. */
  let statRows:ReadonlyMap<string,StatRow>|null=null;
  async function capture(){
    const x=await init();const indexPath=path.join(x.workspaceDir,'stat-index.json');
    statRows??=await loadStatIndex(indexPath);
    const next=new Map<string,StatRow>();
    const snapshot=await captureWorkspaceSnapshot({projectRoot:x.canonicalRoot,blobRoot,limits,statCache:{previous:statRows,next}});
    statRows=next;await atomicWrite(indexPath,`${JSON.stringify({schema:STAT_INDEX_SCHEMA,rows:[...next].map(([p,r])=>[p,r.size,r.mtimeMs,r.ctimeMs,r.ref,r.verifiedAtMs])})}\n`).catch(()=>{});
    return snapshot;
  }
  async function list(){const x=await init();let names:string[]=[];try{names=await readdir(x.recordsDir);}catch(error:any){if(error?.code==='ENOENT')return[];throw error;}const rows:CheckpointRecord[]=[];for(const name of names.filter(name=>name.endsWith('.json')).sort()){try{rows.push(parseRecord(await readFile(path.join(x.recordsDir,name),'utf8'),x.canonicalRoot));}catch(error:any){if(error?.code==='ENOENT')continue;throw error;}}return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));}
  async function begin(input:CheckpointBeginInput):Promise<CheckpointHandle>{
    const pre=await capture();const now=new Date().toISOString();const record:CheckpointRecord={schema:'talos.cli.checkpoint.v1',id:`${Date.now()}-${randomUUID()}`,operation:input.operation,sessionId:input.sessionId??null,commandId:null,state:'open',createdAt:now,finalizedAt:null,workspaceIdentityHash:pre.workspace.identityHash,canonicalRoot:pre.workspace.canonicalRoot,pre,post:null,writeEvidence:[],reversible:true,nonReversibleReason:null,finalizationError:null,transitions:[{kind:'created',at:now}]};
    await replace(record);
    /* F-023 (audit 0.1.22): the store grew unbounded because nothing ever pruned. When a workspace journal passes the
       auto cap, a background prune brings it back; it never blocks nor fails the command, and
       TALOS_CHECKPOINT_AUTO_PRUNE=0 disables it (tests, CI). */
    if(process.env.TALOS_CHECKPOINT_AUTO_PRUNE!=='0')autoPruneIfNeeded({rootDir:absoluteRoot}).catch(()=>{});
    let finalized:Promise<CheckpointRecord>|null=null;
    return{id:record.id,coverageGap:pre.skippedSummary??null,bindSession(sessionId){record.sessionId=sessionId;},bindCommand(commandId){record.commandId=commandId;},observe(raw){record.writeEvidence.push(...extractWorkspaceWriteEvidence(raw));},finalize(){
      if(finalized)return finalized;finalized=(async()=>{try{const post=await capture();const at=new Date().toISOString();record.post=post;record.state='complete';record.finalizedAt=at;record.writeEvidence=dedupeEvidence(record.writeEvidence);record.transitions.push({kind:'finalized',at});if(!sameGitSnapshot(record.pre.git,post.git)){record.reversible=false;record.nonReversibleReason='CHECKPOINT_GIT_METADATA_CHANGED';}await replace(record);return record;}catch(error){record.finalizationError=error instanceof Error?error.message:String(error);await replace(record).catch(()=>{});throw error;}})();return finalized;}};
  }
  async function latest(state:CheckpointState){return(await list()).find(row=>row.state===state)??null;}
  async function withRestoreLock<T>(fn:()=>Promise<T>):Promise<T>{
    const x=await init();const lockPath=path.join(x.workspaceDir,'restore.lock');let handle;
    for(let attempt=0;attempt<2;attempt+=1){
      try{handle=await open(lockPath,'wx',0o600);break;}catch(error:any){
        if(error?.code!=='EEXIST')throw error;let stale=false;try{const owner=Number((await readFile(lockPath,'utf8')).trim());if(Number.isInteger(owner)&&owner>0&&owner!==process.pid){try{process.kill(owner,0);}catch(probe:any){if(probe?.code==='ESRCH')stale=true;}}}catch{}
        if(stale){await rm(lockPath,{force:true});continue;}throw coded('CHECKPOINT_RESTORE_BUSY');
      }
    }
    if(!handle)throw coded('CHECKPOINT_RESTORE_BUSY');
    try{await handle.writeFile(`${process.pid}\n`);await handle.sync();return await fn();}finally{await handle.close().catch(()=>{});await rm(lockPath,{force:true}).catch(()=>{});}
  }
  async function transactionPath(){const x=await init();return path.join(x.workspaceDir,'restore-transaction.json');}
  async function readRestoreTransaction(){try{const value=JSON.parse(await readFile(await transactionPath(),'utf8')) as RestoreTransaction;if(value?.schema!=='talos.cli.checkpoint-restore.v1')throw coded('CHECKPOINT_STORE_INVALID');return value;}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}}
  async function writeRestoreTransaction(tx:RestoreTransaction){await atomicWrite(await transactionPath(),`${JSON.stringify(tx)}\n`);}
  async function clearRestoreTransaction(){await rm(await transactionPath(),{force:true});}
  return{projectRoot:absoluteProject,rootDir:absoluteRoot,blobRoot,limits,begin,list,show:read,latest,capture,replace,withRestoreLock,readRestoreTransaction,writeRestoreTransaction,clearRestoreTransaction};
}

/*
 * R5b D3 (Q-R5-13) — the read API the /undo picker and `talos checkpoint list` show: the files a checkpoint changed, from its
 * two snapshots (the same comparison restore.ts restores), and one session's checkpoints, newest first (list()'s order).
 */
export type CheckpointChange={path:string;change:'added'|'modified'|'deleted'};
export function checkpointChanges(record:CheckpointRecord):CheckpointChange[]{
  if(!record.post)return[];
  const pre=record.pre.entries,post=record.post.entries;const untouchable=untouchablePath(record.pre,record.post);
  return[...new Set([...Object.keys(pre),...Object.keys(post)])].sort()
    .filter(relative=>!untouchable(relative)&&!sameSnapshotEntry(pre[relative],post[relative]))
    .map(relative=>({path:relative,change:!pre[relative]?'added':!post[relative]?'deleted':'modified'}));
}
export async function sessionCheckpoints(store:CheckpointStore,sessionId:string):Promise<CheckpointRecord[]>{
  return(await store.list()).filter(row=>row.sessionId===sessionId);
}

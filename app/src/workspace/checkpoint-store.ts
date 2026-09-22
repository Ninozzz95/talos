import {randomUUID} from 'node:crypto';
import {chmod,mkdir,open,readdir,readFile,realpath,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {resolveWorkspaceIdentity} from '../security/workspace-identity.ts';
import {CHECKPOINT_LIMITS,captureWorkspaceSnapshot,extractWorkspaceWriteEvidence,sameGitSnapshot,type CheckpointLimits,type WorkspaceSnapshot,type WorkspaceWriteEvidence} from './checkpoint.ts';

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
async function atomicWrite(pathname:string,text:string){
  const dirname=path.dirname(pathname);await ensurePrivateDir(dirname);const temp=path.join(dirname,`.${path.basename(pathname)}.${process.pid}.${randomUUID()}.tmp`);
  try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(text,'utf8');await handle.sync();}finally{await handle.close();}
    await rename(temp,pathname);try{await chmod(pathname,0o600);}catch(error){if(process.platform!=='win32')throw error;}await durableDir(dirname);
  }catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
}
function parseRecord(text:string,expectedRoot:string):CheckpointRecord{
  const value=JSON.parse(text) as CheckpointRecord;
  if(value?.schema!=='talos.cli.checkpoint.v1'||typeof value.id!=='string'||value.canonicalRoot!==expectedRoot||!['open','complete','undone'].includes(value.state)||!value.pre)throw coded('CHECKPOINT_STORE_INVALID');
  return value;
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
  async function capture(){const x=await init();return captureWorkspaceSnapshot({projectRoot:x.canonicalRoot,blobRoot,limits});}
  async function list(){const x=await init();let names:string[]=[];try{names=await readdir(x.recordsDir);}catch(error:any){if(error?.code==='ENOENT')return[];throw error;}const rows:CheckpointRecord[]=[];for(const name of names.filter(name=>name.endsWith('.json')).sort()){try{rows.push(parseRecord(await readFile(path.join(x.recordsDir,name),'utf8'),x.canonicalRoot));}catch(error:any){if(error?.code==='ENOENT')continue;throw error;}}return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));}
  async function begin(input:CheckpointBeginInput):Promise<CheckpointHandle>{
    const pre=await capture();const now=new Date().toISOString();const record:CheckpointRecord={schema:'talos.cli.checkpoint.v1',id:`${Date.now()}-${randomUUID()}`,operation:input.operation,sessionId:input.sessionId??null,commandId:null,state:'open',createdAt:now,finalizedAt:null,workspaceIdentityHash:pre.workspace.identityHash,canonicalRoot:pre.workspace.canonicalRoot,pre,post:null,writeEvidence:[],reversible:true,nonReversibleReason:null,finalizationError:null,transitions:[{kind:'created',at:now}]};
    await replace(record);let finalized:Promise<CheckpointRecord>|null=null;
    return{id:record.id,bindSession(sessionId){record.sessionId=sessionId;},bindCommand(commandId){record.commandId=commandId;},observe(raw){record.writeEvidence.push(...extractWorkspaceWriteEvidence(raw));},finalize(){
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

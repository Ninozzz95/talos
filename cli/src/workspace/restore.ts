import {randomUUID} from 'node:crypto';
import {chmod,copyFile,mkdir,rename,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {durableFile,materializeSnapshotFile,sameGitSnapshot,sameSnapshotEntry,untouchablePath,type SnapshotEntry,type SnapshotFile,type WorkspaceSnapshot} from './checkpoint.ts';
import type {CheckpointRecord,CheckpointState,CheckpointStore,RestoreTransaction} from './checkpoint-store.ts';

function coded(code:string,message=code,details:Record<string,unknown>={}):Error{return Object.assign(new Error(message===code?code:`${code}: ${message}`),{code,details});}
function stateAt(snapshot:WorkspaceSnapshot,relative:string):SnapshotEntry|undefined{return snapshot.entries[relative];}
/* D1: a path left out of either snapshot is never written or removed (checkpoint.ts `untouchablePath`) */
function changedPaths(left:WorkspaceSnapshot,right:WorkspaceSnapshot){const untouchable=untouchablePath(left,right);return[...new Set([...Object.keys(left.entries),...Object.keys(right.entries)])].filter(relative=>!untouchable(relative)&&!sameSnapshotEntry(stateAt(left,relative),stateAt(right,relative))).sort();}
function absolute(root:string,relative:string){const candidate=path.resolve(root,...relative.split('/'));const rel=path.relative(root,candidate);if(rel.startsWith(`..${path.sep}`)||rel==='..'||path.isAbsolute(rel))throw coded('CHECKPOINT_PATH_INVALID');return candidate;}
function assertNoStructuralTransition(left:WorkspaceSnapshot,right:WorkspaceSnapshot){
  const leftKeys=Object.keys(left.entries),rightKeys=Object.keys(right.entries);
  for(const relative of leftKeys)if(rightKeys.some(candidate=>candidate.startsWith(`${relative}/`)))throw coded('CHECKPOINT_STRUCTURAL_TRANSITION_UNSUPPORTED',`Cannot safely replace file/symlink ${relative} with a directory tree.`);
  for(const relative of rightKeys)if(leftKeys.some(candidate=>candidate.startsWith(`${relative}/`)))throw coded('CHECKPOINT_STRUCTURAL_TRANSITION_UNSUPPORTED',`Cannot safely replace directory tree ${relative} with a file/symlink.`);
}
function snapshotsFor(record:CheckpointRecord,direction:'undo'|'redo'){
  if(record.state==='open'||!record.post)throw coded('CHECKPOINT_NOT_FINALIZED');
  if(!record.reversible)throw coded(record.nonReversibleReason??'CHECKPOINT_NOT_REVERSIBLE');
  if(direction==='undo'&&record.state!=='complete')throw coded('CHECKPOINT_STATE_INVALID');
  if(direction==='redo'&&record.state!=='undone')throw coded('CHECKPOINT_STATE_INVALID');
  const pair=direction==='undo'?{source:record.post,target:record.pre}:{source:record.pre,target:record.post};assertNoStructuralTransition(pair.source,pair.target);return pair;
}
function assertGitMetadata(current:WorkspaceSnapshot,expected:WorkspaceSnapshot){if(!sameGitSnapshot(current.git,expected.git))throw coded('CHECKPOINT_GIT_METADATA_CONFLICT','Git ref/index state changed since this checkpoint boundary.');}
function assertCurrentMatches(current:WorkspaceSnapshot,expected:WorkspaceSnapshot,paths:readonly string[],code='CHECKPOINT_CONFLICT'){
  for(const relative of paths)if(!sameSnapshotEntry(stateAt(current,relative),stateAt(expected,relative)))throw coded(code,`Workspace changed outside the checkpoint at ${relative}.`,{path:relative});
}
function assertCurrentMatchesEither(current:WorkspaceSnapshot,left:WorkspaceSnapshot,right:WorkspaceSnapshot,paths:readonly string[]){
  for(const relative of paths){const now=stateAt(current,relative);if(!sameSnapshotEntry(now,stateAt(left,relative))&&!sameSnapshotEntry(now,stateAt(right,relative)))throw coded('CHECKPOINT_RECOVERY_CONFLICT',`Cannot recover interrupted restore because ${relative} changed externally.`,{path:relative});}
}
type Staged={kind:'file';path:string;entry:SnapshotFile}|{kind:'symlink';target:string;directory:boolean};
async function stageTargets(store:CheckpointStore,snapshot:WorkspaceSnapshot,paths:readonly string[],token:string){
  const root=path.join(store.rootDir,'restore-staging',token);await mkdir(root,{recursive:true,mode:0o700});const staged=new Map<string,Staged>();let index=0;
  try{
    for(const relative of paths){const entry=stateAt(snapshot,relative);if(!entry)continue;if(entry.kind==='symlink'){staged.set(relative,{kind:'symlink',target:entry.target,directory:entry.directory===true});continue;}
      const temp=path.join(root,String(index++));await materializeSnapshotFile(snapshot,entry,store.blobRoot,temp);staged.set(relative,{kind:'file',path:temp,entry});
    }
    return{root,staged};
  }catch(error){await rm(root,{recursive:true,force:true}).catch(()=>{});throw error;}
}
/* C-007: Windows needs the kind of a folder link; an absolute one comes back as a junction (no privilege needed). */
function linkType(link:{target:string;directory:boolean}):'junction'|'dir'|undefined{
  if(process.platform!=='win32'||!link.directory)return undefined;
  return path.isAbsolute(link.target)?'junction':'dir';
}
async function placeTemp(temp:string,target:string){
  try{await rename(temp,target);}catch(error:any){if(!['EEXIST','EPERM','ENOTEMPTY'].includes(String(error?.code)))throw error;await rm(target,{force:true});await rename(temp,target);}
}
async function applyStaged(snapshot:WorkspaceSnapshot,paths:readonly string[],staged:Map<string,Staged>,token:string){
  let index=0;
  for(const relative of paths){const target=absolute(snapshot.workspace.canonicalRoot,relative),entry=stateAt(snapshot,relative);if(!entry){await rm(target,{force:true});continue;}await mkdir(path.dirname(target),{recursive:true});const temp=path.join(path.dirname(target),`.${path.basename(target)}.talos-checkpoint-${token}-${index++}.tmp`);await rm(temp,{force:true});const prepared=staged.get(relative);if(!prepared)throw coded('CHECKPOINT_RESTORE_STAGE_MISSING');
    if(prepared.kind==='symlink')await symlink(prepared.target,temp,linkType(prepared));else{await copyFile(prepared.path,temp);if(process.platform!=='win32')await chmod(temp,prepared.entry.mode);await durableFile(temp);}await placeTemp(temp,target);
  }
}
async function applySnapshot(store:CheckpointStore,snapshot:WorkspaceSnapshot,paths:readonly string[]){const token=randomUUID(),bundle=await stageTargets(store,snapshot,paths,token);try{await applyStaged(snapshot,paths,bundle.staged,token);}finally{await rm(bundle.root,{recursive:true,force:true}).catch(()=>{});}}
async function recoverPendingRestore(store:CheckpointStore){
  const tx=await store.readRestoreTransaction();if(!tx)return;
  const record=await store.show(tx.checkpointId);
  if(record.state===tx.expectedFinalState){await store.clearRestoreTransaction();return;}
  if(!record.post)throw coded('CHECKPOINT_RECOVERY_INVALID');
  const source=tx.direction==='undo'?record.post:record.pre,target=tx.direction==='undo'?record.pre:record.post;assertNoStructuralTransition(source,target);
  const current=await store.capture();assertGitMetadata(current,source);assertCurrentMatchesEither(current,source,target,tx.paths);
  await applySnapshot(store,source,tx.paths);await store.clearRestoreTransaction();
}
async function restore({store,id,direction}:{store:CheckpointStore;id?:string;direction:'undo'|'redo'}):Promise<CheckpointRecord>{
  return store.withRestoreLock(async()=>{
    await recoverPendingRestore(store);
    const requested=id?await store.show(id):await store.latest(direction==='undo'?'complete':'undone');if(!requested)throw coded('CHECKPOINT_NOT_FOUND');
    const {source,target}=snapshotsFor(requested,direction);const paths=changedPaths(source,target);
    const current=await store.capture();assertGitMetadata(current,source);assertCurrentMatches(current,source,paths);
    const token=randomUUID(),bundle=await stageTargets(store,target,paths,token);
    try{
      const currentAgain=await store.capture();assertGitMetadata(currentAgain,source);assertCurrentMatches(currentAgain,source,paths);
      const expectedFinalState:CheckpointState=direction==='undo'?'undone':'complete';const tx:RestoreTransaction={schema:'talos.cli.checkpoint-restore.v1',checkpointId:requested.id,direction,expectedFinalState,paths,createdAt:new Date().toISOString()};await store.writeRestoreTransaction(tx);
      try{await applyStaged(target,paths,bundle.staged,token);}catch(error){
        try{await applySnapshot(store,source,paths);await store.clearRestoreTransaction();}catch(rollback){throw coded('CHECKPOINT_RESTORE_ROLLBACK_FAILED',rollback instanceof Error?rollback.message:String(rollback));}
        throw error;
      }
      const at=new Date().toISOString();const updated:CheckpointRecord={...requested,state:expectedFinalState,transitions:[...requested.transitions,{kind:direction,at}]};await store.replace(updated);await store.clearRestoreTransaction();return updated;
    }finally{await rm(bundle.root,{recursive:true,force:true}).catch(()=>{});}
  });
}
export async function undoCheckpoint({store,id}:{store:CheckpointStore;id?:string}){return restore({store,...(id?{id}:{}),direction:'undo'});}
export async function redoCheckpoint({store,id}:{store:CheckpointStore;id?:string}){return restore({store,...(id?{id}:{}),direction:'redo'});}

/*
 * R5b D3 (owner decision Q-R5-13 and the owner's answers of 2026-09-25): the /undo picker goes BACK TO A POINT — the chosen
 * checkpoint and every newer one of the same session are undone, newest first (Claude Code's /rewind, Hermes's /rollback) —
 * and re-applies an undone point: it and every older undone one of the session, oldest first. Every step is the checked,
 * locked restore above; a step that fails puts back the steps already taken (in reverse), so the files never stay between two
 * points, and the step's own error (the file that changed outside TALOS) is what the person reads. The whole range is checked
 * first: a checkpoint that cannot be restored refuses the step before any file is touched.
 */
function assertRestorable(rows:readonly CheckpointRecord[]){
  for(const row of rows){if(row.state==='open'||!row.post)throw coded('CHECKPOINT_NOT_FINALIZED');if(!row.reversible)throw coded(row.nonReversibleReason??'CHECKPOINT_NOT_REVERSIBLE');}
}
async function stepThrough(steps:readonly CheckpointRecord[],forward:(id:string)=>Promise<CheckpointRecord>,back:(id:string)=>Promise<CheckpointRecord>):Promise<CheckpointRecord[]>{
  const done:CheckpointRecord[]=[];
  for(const step of steps){
    try{done.push(await forward(step.id));}
    catch(error){
      for(const taken of [...done].reverse()){try{await back(taken.id);}catch(rollback){throw coded('CHECKPOINT_RESTORE_ROLLBACK_FAILED',rollback instanceof Error?rollback.message:String(rollback),{checkpointId:taken.id});}}
      throw error;
    }
  }
  return done;
}
export async function rewindToCheckpoint({store,id}:{store:CheckpointStore;id:string}):Promise<CheckpointRecord[]>{
  const target=await store.show(id);if(target.state!=='complete')throw coded('CHECKPOINT_STATE_INVALID');
  const session=(await store.list()).filter(row=>row.sessionId===target.sessionId);const at=session.findIndex(row=>row.id===target.id);
  const range=session.slice(0,at+1).filter(row=>row.state!=='undone');assertRestorable(range);
  return stepThrough(range,step=>undoCheckpoint({store,id:step}),step=>redoCheckpoint({store,id:step}));
}
export async function reapplyToCheckpoint({store,id}:{store:CheckpointStore;id:string}):Promise<CheckpointRecord[]>{
  const target=await store.show(id);if(target.state!=='undone')throw coded('CHECKPOINT_STATE_INVALID');
  const session=(await store.list()).filter(row=>row.sessionId===target.sessionId);const at=session.findIndex(row=>row.id===target.id);
  const range=session.slice(at).filter(row=>row.state==='undone').reverse();assertRestorable(range);
  return stepThrough(range,step=>redoCheckpoint({store,id:step}),step=>undoCheckpoint({store,id:step}));
}

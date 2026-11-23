/*
 * Stage 7.8 (mockup /undo «src/auth/login.ts +12 −3», «Files that go back»; Claude Code's rewind names what a restore would
 * change before it does it): going back to before a set of turns puts each file back to how it was then. For each file, how
 * many lines come back (`added`, back to the old version) and how many go (`removed`) — from the point you return to (the
 * oldest step's copy before it ran) to now (the newest step's copy after it ran). The copies are the checkpoints' own (a blob
 * of the store, or git's object); the count is line-diff.ts's. A binary file, a very large one, or one whose copy cannot be
 * read names no count: the row still says what happens to it.
 */
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {lineDiff} from '../tui/line-diff.ts';
import type {DiffRow} from '../tui/diff-model.ts';
import {materializeSnapshotFile,type SnapshotEntry,type WorkspaceSnapshot} from './checkpoint.ts';
import {checkpointChanges,type CheckpointChange,type CheckpointRecord,type CheckpointStore} from './checkpoint-store.ts';

export type CheckpointDelta=CheckpointChange&{added?:number;removed?:number};
const MAX_BYTES=512*1024;

async function textOf(snapshot:WorkspaceSnapshot,entry:SnapshotEntry|undefined,store:CheckpointStore,scratch:string):Promise<string|null|undefined>{
  /* null: the file was not there; undefined: there, but not something a line count can be given for */
  if(!entry)return null;
  if(entry.kind!=='file'||entry.size>MAX_BYTES)return undefined;
  let data:Buffer;
  try{
    if(entry.source==='blob')data=await readFile(path.join(store.blobRoot,entry.ref));
    else{const out=path.join(scratch,`${entry.ref}.txt`);await materializeSnapshotFile(snapshot,entry,store.blobRoot,out);data=await readFile(out);}
  }catch{return undefined;}
  if(data.includes(0))return undefined;
  return data.toString('utf8');
}

/** Stage 7.16 (/diff «By turn»): what ONE turn changed, each file with its own rows (line-diff.ts), from its copy before
 *  the turn to its copy after; a binary or very large file has no rows. */
export type CheckpointFileDiff=CheckpointDelta&{rows?:DiffRow[]};
export async function checkpointFileDiffs(store:CheckpointStore,step:CheckpointRecord):Promise<CheckpointFileDiff[]>{
  if(!step.post)return[];
  const scratch=await mkdtemp(path.join(tmpdir(),'talos-turn-diff-'));
  try{
    const out:CheckpointFileDiff[]=[];
    for(const {path:file,change} of checkpointChanges(step).sort((a,b)=>a.path.localeCompare(b.path))){
      const [was,now]=await Promise.all([textOf(step.pre,step.pre.entries[file],store,scratch),textOf(step.post,step.post.entries[file],store,scratch)]);
      if(was===undefined||now===undefined){out.push({path:file,change});continue;}
      const diff=lineDiff(was,now??'',{path:file});
      out.push(diff.approximate?{path:file,change}:{path:file,change,added:diff.added,removed:diff.removed,rows:diff.model.files[0]?.rows??[]});
    }
    return out;
  }finally{await rm(scratch,{recursive:true,force:true}).catch(()=>{});}
}

/** `steps`: the checkpoints a return undoes, newest first (as /undo lists them). */
export async function checkpointDeltas(store:CheckpointStore,steps:readonly CheckpointRecord[]):Promise<CheckpointDelta[]>{
  const newest=steps[0],oldest=steps.at(-1);if(!newest||!oldest||!newest.post)return[];
  const paths=[...new Set(steps.flatMap(step=>checkpointChanges(step).map(change=>change.path)))].sort((a,b)=>a.localeCompare(b));
  const scratch=await mkdtemp(path.join(tmpdir(),'talos-delta-'));
  try{
    const out:CheckpointDelta[]=[];
    for(const file of paths){
      const before=oldest.pre.entries[file],after=newest.post.entries[file];
      if(!before&&!after)continue;
      const change:CheckpointChange['change']=!before?'added':!after?'deleted':'modified';
      const [was,now]=await Promise.all([textOf(oldest.pre,before,store,scratch),textOf(newest.post,after,store,scratch)]);
      if(was===undefined||now===undefined){out.push({path:file,change});continue;}
      const diff=lineDiff(was,now??'',{path:file});
      out.push(diff.approximate?{path:file,change}:{path:file,change,added:diff.added,removed:diff.removed});
    }
    return out;
  }finally{await rm(scratch,{recursive:true,force:true}).catch(()=>{});}
}

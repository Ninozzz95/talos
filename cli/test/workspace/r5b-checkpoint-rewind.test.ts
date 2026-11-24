/*
 * R5b D3 (owner decision Q-R5-13, and the owner's answers of 2026-09-25): /undo opens this session's checkpoints with the
 * files each one changed. Choosing one goes BACK TO THAT POINT — it and every newer checkpoint of the session are undone,
 * newest first (Claude Code's /rewind, Hermes's /rollback) — and an undone one can be re-applied from the same picker: it
 * and every older undone one of the session, oldest first. Files only; the conversation stays. A step that fails half way
 * puts back the steps already taken, so the files are never left between two points. Before R5b only `talos checkpoint
 * undo|redo` existed, one checkpoint at a time, and the list named no file.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {checkpointChanges,createCheckpointStore,sessionCheckpoints,type CheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {reapplyToCheckpoint,rewindToCheckpoint} from '../../src/workspace/restore.ts';

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
  const root=await mkdtemp(join(tmpdir(),'r5b-rewind-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  return{projectRoot,store:createCheckpointStore({rootDir:join(root,'state'),projectRoot})};
}
/* 24/11/2026 (judge v2685, choice A): two checkpoints begun in the same clock tick sort at random (checkpoint-store.ts:125/:127, the
   first item of the 0.7.1 list, where the cure is). Until then each turn here begins after the clock has moved; with the cure this
   wait goes. */
async function clockMoved(){const at=Date.now();while(Date.now()===at)await new Promise(resolve=>setTimeout(resolve,1));}
/* One turn: a checkpoint around `change`, as the runtime takes one around a model run. */
async function turn(store:CheckpointStore,sessionId:string,change:()=>Promise<void>){
  await clockMoved();const handle=await store.begin({operation:'resume',sessionId});await change();return (await handle.finalize()).id;
}
const read=(path:string)=>readFile(path,'utf8').catch(()=>null);

async function threeTurns(t:any){
  const {projectRoot,store}=await fixture(t);
  const a=join(projectRoot,'a.txt'),b=join(projectRoot,'b.txt');await writeFile(a,'v1');
  const t1=await turn(store,'s1',()=>writeFile(a,'v2'));
  const t2=await turn(store,'s1',async()=>{await writeFile(a,'v3');await writeFile(b,'new');});
  const other=await turn(store,'s2',()=>writeFile(join(projectRoot,'c.txt'),'other session'));
  const t3=await turn(store,'s1',()=>writeFile(a,'v4'));
  return{projectRoot,store,a,b,t1,t2,t3,other};
}

test('R5b D3: each checkpoint names the files it changed — added, modified, deleted',async t=>{
  const {projectRoot,store}=await fixture(t);
  await writeFile(join(projectRoot,'keep.txt'),'1');await writeFile(join(projectRoot,'gone.txt'),'x');
  const id=await turn(store,'s1',async()=>{await writeFile(join(projectRoot,'keep.txt'),'2');await rm(join(projectRoot,'gone.txt'));await mkdir(join(projectRoot,'src'));await writeFile(join(projectRoot,'src','new.ts'),'n');});
  assert.deepEqual(checkpointChanges(await store.show(id)),[
    {path:'gone.txt',change:'deleted'},{path:'keep.txt',change:'modified'},{path:'src/new.ts',change:'added'},
  ]);
  const quiet=await turn(store,'s1',async()=>{});
  assert.deepEqual(checkpointChanges(await store.show(quiet)),[],'a turn that changed nothing names nothing');
});

test('R5b D3: the picker\'s list is this session\'s checkpoints, newest first',async t=>{
  const {store,t1,t2,t3}=await threeTurns(t);
  assert.deepEqual((await sessionCheckpoints(store,'s1')).map(row=>row.id),[t3,t2,t1]);
});

test('R5b D3: going back to a point undoes it and every newer checkpoint of the session; the other session is untouched',async t=>{
  const {projectRoot,store,a,b,t1,t2,t3,other}=await threeTurns(t);
  const done=await rewindToCheckpoint({store,id:t2});
  assert.deepEqual(done.map(row=>row.id),[t3,t2],'newest first');
  assert.equal(await read(a),'v2','a.txt as it was before the chosen turn');
  assert.equal(await read(b),null,'the file the chosen turn created is gone');
  assert.equal(await read(join(projectRoot,'c.txt')),'other session');
  assert.equal((await store.show(t1)).state,'complete');assert.equal((await store.show(other)).state,'complete');
  assert.equal((await store.show(t2)).state,'undone');assert.equal((await store.show(t3)).state,'undone');
});

test('R5b D3: re-applying an undone point redoes it and every older undone one, oldest first',async t=>{
  const {store,a,b,t2,t3}=await threeTurns(t);
  await rewindToCheckpoint({store,id:t2});
  const first=await reapplyToCheckpoint({store,id:t2});
  assert.deepEqual(first.map(row=>row.id),[t2]);assert.equal(await read(a),'v3');assert.equal(await read(b),'new');
  assert.equal((await store.show(t3)).state,'undone','a newer undone checkpoint is not re-applied');
  await rewindToCheckpoint({store,id:t2});
  const all=await reapplyToCheckpoint({store,id:t3});
  assert.deepEqual(all.map(row=>row.id),[t2,t3],'oldest first');assert.equal(await read(a),'v4');
});

test('R5b D3: a step that fails half way puts back the steps already taken, and says which file stopped it',async t=>{
  const {store,a,b,t1,t2,t3}=await threeTurns(t);
  await writeFile(b,'the person edited this');
  await assert.rejects(rewindToCheckpoint({store,id:t1}),(error:any)=>error?.code==='CHECKPOINT_CONFLICT'&&error?.details?.path==='b.txt');
  assert.equal(await read(a),'v4','turn 3, undone before the conflict, was re-applied');
  assert.equal(await read(b),'the person edited this','the person\'s edit is never overwritten');
  for(const id of [t1,t2,t3])assert.equal((await store.show(id)).state,'complete');
});

test('R5b D3: a checkpoint that cannot be undone in the range refuses the whole step before touching a file',async t=>{
  const {store,a,t2,t3}=await threeTurns(t);
  /* The OLDER step cannot be undone: without the check first, turn 3 would be undone and put back (two transitions). */
  const record=await store.show(t2);await store.replace({...record,reversible:false,nonReversibleReason:'CHECKPOINT_GIT_METADATA_CHANGED'});
  await assert.rejects(rewindToCheckpoint({store,id:t2}),/CHECKPOINT_GIT_METADATA_CHANGED/u);
  assert.equal(await read(a),'v4');assert.equal((await store.show(t2)).state,'complete');
  assert.deepEqual((await store.show(t3)).transitions.map(row=>row.kind),['created','finalized'],'turn 3 was never touched');
});

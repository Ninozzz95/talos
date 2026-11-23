/*
 * Stage 7.8 (mockup /undo «src/auth/login.ts +12 −3», «Files that go back»): going back to before a turn puts files back to
 * how they were then; each file says how many lines come back and how many go — from the point you return to, to now. Read
 * from the checkpoints' own copies (blobs or git), counted by line-diff.ts; a binary or very large file names no count.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createCheckpointStore,type CheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {checkpointDeltas} from '../../src/workspace/checkpoint-delta.ts';

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
  const root=await mkdtemp(join(tmpdir(),'talos-delta-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  return{projectRoot,store:createCheckpointStore({rootDir:join(root,'state'),projectRoot})};
}
async function turn(store:CheckpointStore,change:()=>Promise<void>){const handle=await store.begin({operation:'resume',sessionId:'s1'});await change();return handle.finalize();}
const lines=(...rows:string[])=>rows.join('\n')+'\n';

test('one turn: the lines that come back and the lines that go, per file',async t=>{
  const {projectRoot,store}=await fixture(t);
  const a=join(projectRoot,'login.ts');await writeFile(a,lines('one','two','three'));
  const step=await turn(store,()=>writeFile(a,lines('one','TWO','three','four')));
  assert.deepEqual(await checkpointDeltas(store,[step]),[{path:'login.ts',change:'modified',added:2,removed:1}]);
});

test('several turns: from the point you go back to, to now; a new file and a deleted one',async t=>{
  const {projectRoot,store}=await fixture(t);
  const a=join(projectRoot,'a.txt'),b=join(projectRoot,'b.txt'),gone=join(projectRoot,'gone.txt');
  await writeFile(a,lines('1'));await writeFile(gone,lines('x','y'));
  const first=await turn(store,async()=>{await writeFile(a,lines('1','2'));await writeFile(b,lines('new','file','here'));});
  const second=await turn(store,async()=>{await writeFile(a,lines('1','2','3'));await rm(gone);});
  /* newest first, as the sheet lists them: going back to before `first` */
  assert.deepEqual(await checkpointDeltas(store,[second,first]),[
    {path:'a.txt',change:'modified',added:2,removed:0},
    {path:'b.txt',change:'added',added:3,removed:0},
    {path:'gone.txt',change:'deleted',added:0,removed:2},
  ]);
  assert.deepEqual(await checkpointDeltas(store,[second]),[{path:'a.txt',change:'modified',added:1,removed:0},{path:'gone.txt',change:'deleted',added:0,removed:2}]);
});

test('a file made by one turn and removed by the next is not there then nor now: nothing goes back',async t=>{
  const {projectRoot,store}=await fixture(t);
  const tmp=join(projectRoot,'scratch.txt');
  const made=await turn(store,()=>writeFile(tmp,lines('draft')));
  const removed=await turn(store,()=>rm(tmp));
  assert.deepEqual(await checkpointDeltas(store,[removed,made]),[]);
});

test('a binary file names no count; a turn that changed nothing has no files',async t=>{
  const {projectRoot,store}=await fixture(t);
  const bin=join(projectRoot,'logo.png');await writeFile(bin,Buffer.from([0x89,0x50,0,1,2,3]));
  const step=await turn(store,()=>writeFile(bin,Buffer.from([0x89,0x50,0,9,9,9,9])));
  assert.deepEqual(await checkpointDeltas(store,[step]),[{path:'logo.png',change:'modified'}]);
  const quiet=await turn(store,async()=>{});
  assert.deepEqual(await checkpointDeltas(store,[quiet]),[]);
});

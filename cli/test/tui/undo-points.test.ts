/*
 * Stage 7.8 (mockup /undo): the points the sheet lists — every checkpoint of the conversation, newest first, named after the
 * message that started its turn, the oldest «Start of the conversation»; each with its own files and the files that go back.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createCheckpointStore,sessionCheckpoints,type CheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {rewindToCheckpoint} from '../../src/workspace/restore.ts';
import {shortMessage,undoPoints} from '../../src/tui/undo-points.ts';

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
  const root=await mkdtemp(join(tmpdir(),'talos-undo-points-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  return{projectRoot,store:createCheckpointStore({rootDir:join(root,'state'),projectRoot})};
}
/* 24/11/2026 (judge v2685, choice A): two checkpoints begun in the same clock tick sort at random (checkpoint-store.ts:125/:127, the
   first item of the 0.7.1 list, where the cure is). Until then each turn here begins after the clock has moved; with the cure this
   wait goes. */
async function clockMoved(){const at=Date.now();while(Date.now()===at)await new Promise(resolve=>setTimeout(resolve,1));}
async function turn(store:CheckpointStore,operation:'start'|'resume'|'shell',change:()=>Promise<void>){await clockMoved();const handle=await store.begin({operation,sessionId:'s1'});await change();return (await handle.finalize()).id;}

test('the mockup\'s rows: the first sentence of a long message, a short one whole',()=>{
  assert.equal(shortMessage('The login e2e test is flaky. Find out why and fix it.'),'The login e2e test is flaky…');
  assert.equal(shortMessage('Show me how sessions are refreshed'),'Show me how sessions are refreshed');
  assert.equal(shortMessage('x'.repeat(80)),'x'.repeat(59)+'…');
  assert.equal(shortMessage('  two\n lines  '),'two lines');
});

test('every point, newest first, named after its message; the oldest is the start; files and files that go back',async t=>{
  const {projectRoot,store}=await fixture(t);
  const a=join(projectRoot,'login.ts');await writeFile(a,'one\n');
  await turn(store,'start',async()=>{await writeFile(a,'one\ntwo\n');});
  await turn(store,'resume',async()=>{});
  await turn(store,'shell',async()=>{await writeFile(join(projectRoot,'out.txt'),'x\n');});
  await turn(store,'resume',async()=>{await writeFile(a,'one\ntwo\nthree\n');});
  const turns=[{runId:'r3',text:'apply the fix'},{runId:'r2',text:'Show me how sessions are refreshed'},{runId:'r1',text:'The login e2e test is flaky. Find out why.'}];
  const points=await undoPoints(store,await sessionCheckpoints(store,'s1'),turns);
  assert.deepEqual(points.map(p=>p.label),['Before: apply the fix','Before: a shell command','Before: Show me how sessions are refreshed','Start of the conversation']);
  assert.deepEqual(points[0]!.files,[{path:'login.ts',change:'modified',added:1,removed:0}]);
  assert.deepEqual(points[2]!.files,[],'a turn that changed nothing is still a point');
  assert.deepEqual(points[3]!.back.map(f=>f.path),['login.ts','out.txt'],'back to the start: everything since');
  assert.equal(points[3]!.start,true);
  assert.deepEqual(points[3]!.back.find(f=>f.path==='login.ts'),{path:'login.ts',change:'modified',added:2,removed:0});
});

test('an undone point says the files that come back; a conversation whose first turns are gone has no start',async t=>{
  const {projectRoot,store}=await fixture(t);
  const a=join(projectRoot,'a.txt');await writeFile(a,'1\n');
  const first=await turn(store,'start',async()=>{await writeFile(a,'1\n2\n');});
  await turn(store,'resume',async()=>{await writeFile(a,'1\n2\n3\n');});
  await rewindToCheckpoint({store,id:first});
  const points=await undoPoints(store,await sessionCheckpoints(store,'s1'),[{runId:'r2',text:'second'},{runId:'r1',text:'first'}]);
  assert.deepEqual(points.map(p=>p.undone),[true,true]);
  assert.deepEqual(points[1]!.back.map(f=>f.path),['a.txt']);
  const partial=await undoPoints(store,await sessionCheckpoints(store,'s1'),[{runId:'r3',text:'third'},{runId:'r2',text:'second'},{runId:'r1',text:'first'}]);
  assert.ok(!partial.some(p=>p.start),'more messages than points: the oldest point is not the start');
  assert.deepEqual(partial.map(p=>p.label),['Before: third','Before: second']);
});

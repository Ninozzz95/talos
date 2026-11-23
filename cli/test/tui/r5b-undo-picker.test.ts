/*
 * R5b D3 (owner decision Q-R5-13 and the owner's answers of 2026-09-25) in the REAL app: `/undo` (also `/rewind`,
 * `/checkpoint`) lists this conversation's checkpoints with the files each changed; Enter asks first, with Cancel
 * highlighted; confirming goes back to before that turn (it and every newer one undone) — files only, the conversation
 * stays; an undone row re-applies. Refused while TALOS works. A turn that changed files leaves one dim row saying so.
 * Before R5b checkpoints existed only as `talos checkpoint undo|redo`, and nothing on screen said one was taken.
 * Hermetic: the project and the checkpoint store live under hermeticProfile()'s private root.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {parseSlashCommand} from '../../src/tui/slash-commands.ts';

/* Ink's chalk decides its level when it is imported: without this it writes no attribute at all, inverse included. */
process.env.FORCE_COLOR='3';
const env=hermeticProfile();after(()=>env.restore());
const DOWN='\x1b[B',ENTER='\r',ESC='\x1b';
let n=0;
/* A project outside the checkpoint store (the store refuses to live inside the workspace), with two turns of session s1. */
async function project(){
  const root=join(env.root,`project-${++n}`);mkdirSync(root,{recursive:true});
  const store=createCheckpointStore({rootDir:env.paths.checkpointsRoot,projectRoot:root});
  const a=join(root,'a.txt');await writeFile(a,'v1');
  const turn=async(change:()=>Promise<void>)=>{const h=await store.begin({operation:'resume',sessionId:'s1'});await change();return (await h.finalize()).id;};
  const t1=await turn(()=>writeFile(a,'v2'));await sleep(5);
  const t2=await turn(async()=>{await writeFile(a,'v3');await writeFile(join(root,'b.txt'),'new');});
  return{root,store,a,t1,t2};
}

test('R5b D3: /rewind and /checkpoint are /undo',()=>{
  assert.equal(parseSlashCommand('/rewind').name,'undo');
  assert.equal(parseSlashCommand('/checkpoint').name,'undo');
  assert.deepEqual(parseSlashCommand('/rewind').suggestions,[]);
});

/* stage 7.8 (owner 03/10 «foglio intero, conversazione via fork»): /undo is the mockup's sheet. Every point of the
   conversation, newest first, named after its message, the oldest «Start of the conversation»; beside it the files that go back
   with their lines. f puts the files back at once (no question: going back keeps what it undid, f on an undone point brings
   it back); Enter and c, the conversation, come with the kernel's cut. */
const turns=(...prompts:string[])=>prompts.map((prompt,i)=>({type:'RunStarted',runId:`r${i+1}`,input:{prompt}}));
test('stage 7.8 /undo: the sheet names each point and the files that go back; f goes back; f on an undone point brings it back',async()=>{
  const {root,store,a,t1,t2}=await project();
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{export:(id:string)=>({sessionId:id,eventi:turns('make it v2','make it v3 and add b')})}});
  try{
    await app.type('/undo');app.press(ENTER);
    let s=await app.waitFor('the sheet',x=>/── Go back to an earlier point/u.test(x.text));
    assert.match(s.text,/› Before: make it v3 and add b/u);
    assert.match(s.text,/2 files changed/u);
    assert.match(s.text,/Start of the conversation/u);
    assert.match(s.text,/Files that go back/u);assert.match(s.text,/a\.txt  \+1 −1/u);assert.match(s.text,/b\.txt  \+1 −0/u);
    assert.match(s.text,/f files only/u);assert.doesNotMatch(s.text,/enter code and conversation/u,'not before the kernel can');
    app.press(DOWN);await sleep(40);await app.type('f');
    s=await app.waitFor('gone back',x=>/Went back: 2 turns undone/u.test(x.text)&&!/── Go back to an earlier point/u.test(x.text));
    assert.equal(await readFile(a,'utf8'),'v1');
    assert.equal((await store.show(t1)).state,'undone');assert.equal((await store.show(t2)).state,'undone');
    await app.type('/rewind');app.press(ENTER);
    s=await app.waitFor('the sheet with undone points',x=>/── Go back to an earlier point/u.test(x.text)&&/undone/u.test(x.text));
    assert.match(s.text,/Files that come back as they were/u);
    app.press(DOWN);await sleep(40);await app.type('f');
    await app.waitFor('re-applied',x=>/Re-applied: 1 turn/u.test(x.text));
    assert.equal(await readFile(a,'utf8'),'v2');
  }finally{app.unmount();}
});

test('stage 7.8 /undo: refused while TALOS works; a conversation without checkpoints says so on the sheet',async()=>{
  const {root}=await project();
  const app=await mountR5a({cols:110,rows:40,root,paths:env.paths});
  try{
    app.emit('run.started',{runId:'r9'});await sleep(80);
    await app.type('/undo');app.press(ENTER);
    await app.waitFor('the refusal',x=>/when this turn ends/u.test(x.text));
    app.press(ESC);
  }finally{app.unmount();}
  const empty=join(env.root,'empty-project');mkdirSync(empty,{recursive:true});
  const second=await mountR5a({cols:110,rows:40,root:empty,paths:env.paths});
  try{
    await second.type('/undo');second.press(ENTER);
    await second.waitFor('nothing to go back to',x=>/No checkpoints in this conversation yet\./u.test(x.text));
  }finally{second.unmount();}
});

test('R5b D3: a turn that changed files leaves one dim row naming them and /undo',async()=>{
  const root=join(env.root,'marker-project');mkdirSync(root,{recursive:true});
  const store=createCheckpointStore({rootDir:env.paths.checkpointsRoot,projectRoot:root});
  const app=await mountR5a({cols:110,rows:40,root,paths:env.paths});
  try{
    app.emit('run.started',{runId:'r1'});await sleep(60);
    const h=await store.begin({operation:'resume',sessionId:'s1'});await writeFile(join(root,'made.txt'),'x');await h.finalize();
    app.emit('run.completed',{runId:'r1'});
    const s=await app.waitFor('the checkpoint row',x=>/Checkpoint · 1 file: made\.txt \(added\) · \/undo goes back/u.test(x.text));
    assert.equal(s.lines.filter(line=>/Checkpoint ·/u.test(line)).length,1,'one row');
  }finally{app.unmount();}
});

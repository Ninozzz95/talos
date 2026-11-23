/*
 * Stage 7.16 (/diff «By turn», owner 03/10; Claude Code /diff per-turn view, rebuilt from the conversation and not from git):
 * each turn of this conversation, newest first, named by your message, with what IT changed — every file's own hunks, read
 * from the checkpoints /undo keeps (before and after that turn), so later edits and git add do not change it.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createCheckpointStore,sessionCheckpoints,type CheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {turnDiffs} from '../../src/tui/turn-diffs.ts';

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
  const root=await mkdtemp(join(tmpdir(),'talos-turn-diffs-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  return{projectRoot,store:createCheckpointStore({rootDir:join(root,'state'),projectRoot})};
}
async function turn(store:CheckpointStore,operation:'start'|'resume'|'shell',change:()=>Promise<void>){const handle=await store.begin({operation,sessionId:'s1'});await change();await handle.finalize();}

test('each turn, newest first, with its own hunks; a shell command is named so; a binary file has no lines',async t=>{
  const {projectRoot,store}=await fixture(t);
  const a=join(projectRoot,'login.ts');await writeFile(a,'one\ntwo\n');
  await turn(store,'start',async()=>{await writeFile(a,'one\nTWO\n');await writeFile(join(projectRoot,'new.txt'),'fresh\n');});
  await turn(store,'shell',async()=>{await writeFile(join(projectRoot,'logo.png'),Buffer.from([0x89,0x50,0,1]));});
  await turn(store,'resume',async()=>{});
  const turns=[{runId:'r2',text:'nothing  to\ndo'},{runId:'r1',text:'Fix the login test'}];
  const out=await turnDiffs(store,await sessionCheckpoints(store,'s1'),turns);
  assert.deepEqual(out.map(row=>row.label),['nothing to do','A shell command','Fix the login test']);
  assert.deepEqual(out[0]!.files,[]);
  assert.deepEqual(out[1]!.files,[{path:'logo.png',add:0,del:0,note:'added · binary',hunks:[]}]);
  assert.deepEqual(out[2]!.files,[
    {path:'login.ts',add:1,del:1,note:'modified',hunks:['@@ -1,2 +1,2 @@',' one','-two','+TWO']},
    {path:'new.txt',add:1,del:0,note:'added',hunks:['@@ -0,0 +1,1 @@','+fresh']}]);
});

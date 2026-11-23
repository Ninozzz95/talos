/*
 * Ticket C-007 (benchmark lane, 01/10; owner: «link salvati come link»). Two finished benchmark runs were reported failed
 * because the checkpoint refused a link the task had made: `.st-venv/bin/python` (a normal venv, pointing at the system
 * Python) and a dangling `prefix/usr/lib/…/libpcre.so`. `CHECKPOINT_SYMLINK_ESCAPE` failed the capture, and
 * `CHECKPOINT_FINALIZE_FAILED` replaced `run.completed`.
 * Now a link is kept as a link — its text, never followed, nothing read outside the project — and /undo puts the same link
 * back, as git does for Codex's and OpenCode's snapshots (`core.symlinks=true`, opencode snapshot/index.ts:25). And a
 * checkpoint that cannot be saved never changes the run's outcome: it is a warning, the run stays completed.
 * Junctions are used so the proof runs on Windows without the symlink privilege (Node reports them as symbolic links).
 */
import assert from 'node:assert/strict';import test from 'node:test';
import {lstat,mkdir,mkdtemp,readFile,readlink,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {undoCheckpoint} from '../../src/workspace/restore.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';

const LINK_TYPE=process.platform==='win32'?'junction':'dir';
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'talos-c007-'));
  const projectRoot=join(root,'project'),checkpointsRoot=join(root,'state'),system=join(root,'usr-lib');
  await mkdir(join(projectRoot,'.st-venv'),{recursive:true});await mkdir(system,{recursive:true});
  await writeFile(join(system,'python3.12'),'system python','utf8');
  await writeFile(join(projectRoot,'a.txt'),'before','utf8');
  /* The venv's link leads out of the project, as `.st-venv/bin -> /usr/bin` does. */
  await symlink(system,join(projectRoot,'.st-venv','bin'),LINK_TYPE);
  return{root,projectRoot,checkpointsRoot,system};
}

test('C-007: a link leading out of the project is kept as a link, and a dangling one too',async()=>{
  const {root,projectRoot,checkpointsRoot}=await fixture();
  const gone=join(root,'removed-lib');await mkdir(gone);
  await symlink(gone,join(projectRoot,'libpcre'),LINK_TYPE);await rm(gone,{recursive:true});
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  const pre=(await store.show(handle.id)).pre;
  assert.equal(pre.entries['.st-venv/bin']?.kind,'symlink');
  assert.equal(pre.entries['libpcre']?.kind,'symlink');
  assert.equal((await handle.finalize()).state,'complete');
});

test('C-007: /undo puts back a link the turn removed, with the same target, and the edited file',async()=>{
  const {projectRoot,checkpointsRoot,system}=await fixture();
  const link=join(projectRoot,'.st-venv','bin');const target=await readlink(link);
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  await writeFile(join(projectRoot,'a.txt'),'after','utf8');
  await rm(link,{recursive:false,force:true});
  handle.observe({type:'StateDelta',delta:[{op:'replace',path:'/file/a.txt',prima:'before',value:'after'}]});
  assert.equal((await handle.finalize()).state,'complete');
  await undoCheckpoint({store,id:handle.id});
  assert.equal(await readFile(join(projectRoot,'a.txt'),'utf8'),'before');
  assert.equal((await lstat(link)).isSymbolicLink(),true,'the link is back as a link');
  assert.equal(await readlink(link),target);
  assert.equal(await readFile(join(link,'python3.12'),'utf8'),'system python');
  assert.equal(await readFile(join(system,'python3.12'),'utf8'),'system python','nothing outside the project was touched');
});

for(const protocolVersion of ['v1','v2'] as const){
  test(`C-007 headless ${protocolVersion}: a checkpoint that cannot be saved is a warning, the run stays completed`,async()=>{
    const {projectRoot,checkpointsRoot}=await fixture();
    let sink:((event:unknown)=>void)|null=null;
    const runtime:any={
      start:async()=>'s1',restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{},cancel:async()=>{},answerApproval:async()=>{},
      modelCheckpoints:{projectRoot,rootDir:checkpointsRoot,async settle(){throw new Error('durable write refused');}},
      subscribe(_id:string,next:(event:unknown)=>void){sink=next;queueMicrotask(()=>{next({type:'TextMessageContent',messageId:'m',delta:'done'});next({type:'RunFinished'});});return()=>{};},
    };
    const x:any=await collectHeadlessRun(runtime,{projectRoot,checkpointsRoot,model:'m',permissionMode:'default',prompt:'go',protocolVersion,timeoutSeconds:20} as any);
    assert.equal(x.result.ok,true,JSON.stringify(x.result));
    if(protocolVersion==='v2')assert.equal(x.result.outcome,'completed');
    assert.equal(x.result.result?.text,'done');
    const warning=x.events.find((event:any)=>event.type==='warning'&&event.data?.code==='CHECKPOINT_FINALIZE_FAILED');
    assert.ok(warning,'the stream says the checkpoint was not saved');
    assert.match(String(warning.data.message),/\/undo/u,'and what it means for the person');
    assert.ok(x.result.warnings.some((text:string)=>text.includes('CHECKPOINT_FINALIZE_FAILED')));
    assert.ok(!x.events.some((event:any)=>event.type==='run.failed'));
  });
}

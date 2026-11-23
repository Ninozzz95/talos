import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {redoCheckpoint,undoCheckpoint} from '../../src/workspace/restore.ts';

const execFileAsync=promisify(execFile);
async function fixture(prefix='talos-checkpoint-'){
  const root=await mkdtemp(join(tmpdir(),prefix));
  const projectRoot=join(root,'project');
  const checkpointsRoot=join(root,'state');
  await mkdir(projectRoot,{recursive:true});
  return{root,projectRoot,checkpointsRoot};
}
async function git(cwd:string,args:string[]){await execFileAsync('git',args,{cwd});}

test('turn checkpoint is durable before mutation, finalizes post-state, and round-trips undo/redo',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture();
  const file=join(projectRoot,'a.txt');
  await writeFile(file,'before','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  const opened=await store.show(handle.id);
  assert.equal(opened.state,'open');
  assert.equal(opened.pre.entries['a.txt']?.kind,'file');

  await writeFile(file,'after','utf8');
  handle.observe({type:'StateDelta',delta:[{op:'replace',path:'/file/a.txt',prima:'before',value:'after'}]});
  const completed=await handle.finalize();
  assert.equal(completed.state,'complete');
  assert.equal(completed.writeEvidence.length,1);
  assert.ok(completed.post);

  await undoCheckpoint({store,id:handle.id});
  assert.equal(await readFile(file,'utf8'),'before');
  assert.equal((await store.show(handle.id)).state,'undone');

  await redoCheckpoint({store,id:handle.id});
  assert.equal(await readFile(file,'utf8'),'after');
  assert.equal((await store.show(handle.id)).state,'complete');
});

test('external divergence refuses undo and never overwrites the conflicting file',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture();
  const file=join(projectRoot,'conflict.txt');
  await writeFile(file,'v1','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'resume',sessionId:'s1'});
  await writeFile(file,'v2','utf8');
  await handle.finalize();
  await writeFile(file,'person-edit','utf8');

  await assert.rejects(()=>undoCheckpoint({store,id:handle.id}),/CHECKPOINT_CONFLICT/u);
  assert.equal(await readFile(file,'utf8'),'person-edit');
  assert.equal((await store.show(handle.id)).state,'complete');
});

test('an open/crash checkpoint is inspectable but is never promoted to an undo point',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture();
  await writeFile(join(projectRoot,'open.txt'),'x','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  assert.equal((await store.show(handle.id)).state,'open');
  await assert.rejects(()=>undoCheckpoint({store,id:handle.id}),/CHECKPOINT_NOT_FINALIZED/u);
});

/*
 * D1 (stress test 03/10, owner «Mai bloccare, copertura dichiarata»): a file over a limit is left out of /undo and said; the
 * rest is captured and restored; a restore never writes or removes a path either snapshot left out.
 */
test('a file over the per-file limit is left out and said; the rest is captured',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture();
  await writeFile(join(projectRoot,'large.txt'),'12345','utf8');
  await writeFile(join(projectRoot,'small.txt'),'ok','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:10,maxStoredBytes:10,maxStoredFileBytes:4}});
  const handle=await store.begin({operation:'start'});
  const record=await store.show(handle.id);
  assert.equal(record.pre.entries['small.txt']?.kind,'file');
  assert.equal(record.pre.entries['large.txt'],undefined);
  assert.deepEqual(record.pre.skipped,[{path:'large.txt',reason:'too-large',size:5}]);
  assert.match(handle.coverageGap??'',/^1 workspace entries are outside rollback coverage: large\.txt \(0\.0 MB, over the 0\.0 MB limit for one file\)\.$/u);
  assert.match(record.pre.exclusions.join('\n'),/large\.txt/u);
});

test('past the snapshot budget a file is left out; nothing of it is stored',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-checkpoint-budget-');
  await writeFile(join(projectRoot,'a.txt'),'1234','utf8');
  await writeFile(join(projectRoot,'b.txt'),'5678','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:10,maxStoredBytes:5,maxStoredFileBytes:10}});
  const handle=await store.begin({operation:'start'});const record=await store.show(handle.id);
  /* the capture looks at the files with CAPTURE_CONCURRENCY workers: WHICH file gets the budget is a race (the entries
     test below documents the same), so the contract here is: exactly one of the two files stored, the other skipped. */
  const kept=Object.keys(record.pre.entries).sort(),left=(record.pre.skipped??[]).map(row=>row.path).sort();
  assert.deepEqual([...kept,...left].sort(),['a.txt','b.txt']);
  assert.equal(kept.length,1,'only one of the two files fits the budget');
  assert.deepEqual(record.pre.skipped?.map(row=>row.reason),['over-budget']);
  assert.equal((await readdir(store.blobRoot)).length,1,'only the kept file is stored');
});

test('past the entry limit the rest is left out, not refused',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-checkpoint-entries-');
  for(const name of ['a.txt','b.txt','c.txt'])await writeFile(join(projectRoot,name),name,'utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:2,maxStoredBytes:1000,maxStoredFileBytes:1000}});
  const record=await store.show((await store.begin({operation:'start'})).id);
  /* files are captured in parallel: which one is past the limit depends on the order they are looked at (the gate saw both) */
  const kept=Object.keys(record.pre.entries).sort(),left=(record.pre.skipped??[]).map(row=>row.path);
  assert.equal(kept.length,2);assert.equal(left.length,1);
  assert.deepEqual([...kept,...left].sort(),['a.txt','b.txt','c.txt']);
  assert.deepEqual(record.pre.skipped?.[0]?.reason,'too-many');
});

test('/undo never writes or removes a file left out of either snapshot',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-checkpoint-untouched-');
  const big=join(projectRoot,'big.bin'),grow=join(projectRoot,'grow.txt'),small=join(projectRoot,'small.txt');
  await writeFile(big,'0123456789','utf8');await writeFile(grow,'abc','utf8');await writeFile(small,'before','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:50,maxStoredBytes:1000,maxStoredFileBytes:8}});
  const handle=await store.begin({operation:'start'});
  /* the turn: edits the small file, grows another past the limit, changes the big one, creates a new big one */
  await writeFile(small,'after','utf8');await writeFile(grow,'abcdefghijkl','utf8');await writeFile(big,'9876543210','utf8');
  await writeFile(join(projectRoot,'new-big.bin'),'zzzzzzzzzzzz','utf8');await writeFile(join(projectRoot,'new.txt'),'n','utf8');
  const record=await handle.finalize();
  assert.deepEqual(record.post?.skipped?.map(row=>row.path).sort(),['big.bin','grow.txt','new-big.bin']);
  await undoCheckpoint({store,id:record.id});
  assert.equal(await readFile(small,'utf8'),'before','what is covered goes back');
  await assert.rejects(readFile(join(projectRoot,'new.txt'),'utf8'),{code:'ENOENT'},'a covered new file goes');
  assert.equal(await readFile(big,'utf8'),'9876543210','a file left out is not touched');
  assert.equal(await readFile(grow,'utf8'),'abcdefghijkl','a file left out after the turn is not put back');
  assert.equal(await readFile(join(projectRoot,'new-big.bin'),'utf8'),'zzzzzzzzzzzz','a new file left out is not removed');
});

test('clean tracked Git content is referenced without copying it into the bounded dirty-content budget',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-checkpoint-git-');
  await git(projectRoot,['init']);
  await writeFile(join(projectRoot,'tracked.txt'),'x'.repeat(128),'utf8');
  await git(projectRoot,['add','tracked.txt']);
  const store=createCheckpointStore({
    rootDir:checkpointsRoot,projectRoot,
    limits:{maxEntries:100,maxStoredBytes:16,maxStoredFileBytes:16},
  });
  const handle=await store.begin({operation:'start'});
  const record=await store.show(handle.id);
  const tracked=record.pre.entries['tracked.txt'];
  assert.ok(tracked&&tracked.kind==='file');
  assert.equal(tracked.source,'git');
  assert.ok(record.pre.git?.indexHash);
});

test('Git index/ref divergence is a restore conflict and is never rewritten by undo',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-checkpoint-git-conflict-');
  await git(projectRoot,['init']);
  const file=join(projectRoot,'tracked.txt');
  await writeFile(file,'before','utf8');
  await git(projectRoot,['add','tracked.txt']);
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'shell',sessionId:'s1'});
  await writeFile(file,'after','utf8');
  await handle.finalize();
  await git(projectRoot,['add','tracked.txt']);

  await assert.rejects(()=>undoCheckpoint({store,id:handle.id}),/CHECKPOINT_GIT_METADATA_CONFLICT/u);
  assert.equal(await readFile(file,'utf8'),'after');
});

/* C-007 (owner 01/10, «link salvati come link»): this used to fail closed with CHECKPOINT_SYMLINK_ESCAPE, and a venv made a
   finished run fail. The link is now kept as a link — its text, never followed (c007-symlink-as-link.test.ts covers Windows). */
test('a symlink escaping a non-Git workspace is kept as a link, not followed', {skip:process.platform==='win32'}, async()=>{
  const {root,projectRoot,checkpointsRoot}=await fixture('talos-checkpoint-link-');
  const outside=join(root,'outside.txt');
  await writeFile(outside,'outside','utf8');
  await symlink(outside,join(projectRoot,'escape'));
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  assert.deepEqual((await store.show(handle.id)).pre.entries['escape'],{kind:'symlink',target:outside});
});

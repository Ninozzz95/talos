/*
 * R2 (incident CLI-INC-GITLINK-20260929, owner decision 2026-09-30 «Copertura completa»). A submodule (gitlink, mode 160000)
 * or an untracked repository inside the workspace (`ls-files --others` prints it as `nested/`) used to throw at capture
 * (CHECKPOINT_GITLINK_UNSUPPORTED, CHECKPOINT_PATH_INVALID), and the runtime then refused every mutating tool until restart.
 * Now their files are captured as file bytes and /undo restores them; their Git history (commits, index, refs) is not
 * restored and is declared; one that does not fit the limits is left out on its own, declared, without blocking.
 */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {undoCheckpoint} from '../../src/workspace/restore.ts';
import {undoPickerOverlay} from '../../src/tui/overlays/checkpoint-picker.ts';

const execFileAsync=promisify(execFile);
const GIT_CONFIG=['-c','user.name=t','-c','user.email=t@t','-c','init.defaultBranch=main','-c','protocol.file.allow=always','-c','core.autocrlf=false'];
async function git(cwd:string,args:string[]){return (await execFileAsync('git',[...GIT_CONFIG,...args],{cwd})).stdout;}
async function fixture(prefix:string){
  const root=await mkdtemp(join(tmpdir(),prefix));
  const projectRoot=join(root,'project'),checkpointsRoot=join(root,'state');
  await mkdir(projectRoot,{recursive:true});
  return{root,projectRoot,checkpointsRoot};
}
async function repo(dir:string,files:Record<string,string>,commit=true){
  await mkdir(dir,{recursive:true});await git(dir,['init','-q']);
  for(const [name,text] of Object.entries(files)){await mkdir(join(dir,name,'..'),{recursive:true});await writeFile(join(dir,name),text,'utf8');}
  if(commit){await git(dir,['add','-A']);await git(dir,['commit','-qm','init']);}
}
async function exists(file:string){try{await stat(file);return true;}catch{return false;}}

test('a submodule no longer blocks the checkpoint: its files are captured and /undo restores them, its .git is untouched',async()=>{
  const {root,projectRoot,checkpointsRoot}=await fixture('talos-r2-submodule-');
  await repo(join(root,'lib'),{'lib.txt':'lib v1\n'});
  await repo(projectRoot,{'main.txt':'main\n'});
  await git(projectRoot,['submodule','add','-q',join(root,'lib'),'vendor/lib']);await git(projectRoot,['commit','-qam','sub']);
  assert.match(await git(projectRoot,['ls-files','-s']),/^160000 /mu);
  const gitFile=await readFile(join(projectRoot,'vendor','lib','.git'),'utf8');

  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  const pre=(await store.show(handle.id)).pre;
  const entry=pre.entries['vendor/lib/lib.txt'];
  assert.ok(entry&&entry.kind==='file'&&entry.source==='blob');
  assert.equal(pre.entries['main.txt']?.kind,'file');
  assert.ok(!Object.keys(pre.entries).some(key=>key==='vendor/lib/.git'||key.startsWith('vendor/lib/.git/')));
  assert.deepEqual(pre.coverage.nested,[{path:'vendor/lib',kind:'submodule',covered:true}]);
  assert.ok(pre.exclusions.some(line=>line.includes('vendor/lib')&&/Git history/u.test(line)));

  await writeFile(join(projectRoot,'vendor','lib','lib.txt'),'lib v2 (agent)\n','utf8');
  await writeFile(join(projectRoot,'vendor','lib','new.txt'),'new\n','utf8');
  await handle.finalize();
  await undoCheckpoint({store,id:handle.id});
  assert.equal(await readFile(join(projectRoot,'vendor','lib','lib.txt'),'utf8'),'lib v1\n');
  assert.equal(await exists(join(projectRoot,'vendor','lib','new.txt')),false);
  assert.equal(await readFile(join(projectRoot,'vendor','lib','.git'),'utf8'),gitFile);
});

test('an untracked repository inside the workspace is captured with its own ignore rules instead of CHECKPOINT_PATH_INVALID',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-r2-nested-');
  await repo(projectRoot,{'main.txt':'main\n'});
  await repo(join(projectRoot,'nested'),{'.gitignore':'build/\n','n.txt':'n v1\n'},false);
  await mkdir(join(projectRoot,'nested','build'),{recursive:true});await writeFile(join(projectRoot,'nested','build','out.bin'),'ignored\n','utf8');
  assert.match(await git(projectRoot,['ls-files','--others','--exclude-standard']),/^nested\/$/mu);

  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  const pre=(await store.show(handle.id)).pre;
  assert.equal(pre.entries['nested/n.txt']?.kind,'file');
  assert.equal(pre.entries['nested/.gitignore']?.kind,'file');
  assert.equal(pre.entries['nested/build/out.bin'],undefined);
  assert.deepEqual(pre.coverage.nested,[{path:'nested',kind:'repository',covered:true}]);

  await writeFile(join(projectRoot,'nested','n.txt'),'n v2\n','utf8');
  await handle.finalize();
  await undoCheckpoint({store,id:handle.id});
  assert.equal(await readFile(join(projectRoot,'nested','n.txt'),'utf8'),'n v1\n');
});

test('a nested repository over the limits is left out on its own and declared; the rest of the workspace stays covered',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-r2-nested-large-');
  await repo(projectRoot,{'main.txt':'main\n'});
  await repo(join(projectRoot,'big'),{'a.txt':'x'.repeat(40),'b.txt':'y'.repeat(40)},false);
  await writeFile(join(projectRoot,'loose.txt'),'loose\n','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:100,maxStoredBytes:32,maxStoredFileBytes:64}});
  const handle=await store.begin({operation:'start'});
  const pre=(await store.show(handle.id)).pre;
  assert.equal(pre.entries['loose.txt']?.kind,'file');
  assert.equal(pre.entries['big/a.txt'],undefined);
  assert.deepEqual(pre.coverage.nested,[{path:'big',kind:'repository',covered:false,reason:'too-large'}]);
  assert.ok(pre.exclusions.some(line=>line.includes('big')&&/outside rollback coverage/u.test(line)));
});

test('an uninitialized submodule (gitlink without a checkout) does not block and adds no entries',async()=>{
  const {root,projectRoot,checkpointsRoot}=await fixture('talos-r2-submodule-uninit-');
  await repo(join(root,'lib'),{'lib.txt':'lib\n'});
  await repo(projectRoot,{'main.txt':'main\n'});
  await git(projectRoot,['submodule','add','-q',join(root,'lib'),'vendor/lib']);await git(projectRoot,['commit','-qam','sub']);
  await git(projectRoot,['submodule','deinit','-q','-f','vendor/lib']);
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  const pre=(await store.show(handle.id)).pre;
  assert.ok(!Object.keys(pre.entries).some(key=>key.startsWith('vendor/lib/')));
  assert.equal(pre.entries['main.txt']?.kind,'file');
  await rm(join(projectRoot,'vendor','lib'),{recursive:true,force:true});
  await handle.finalize();
});

test('a repository nested inside a nested repository is captured too',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-r2-nested-deep-');
  await repo(projectRoot,{'main.txt':'main\n'});
  await repo(join(projectRoot,'outer'),{'o.txt':'o\n'});
  await repo(join(projectRoot,'outer','inner'),{'i.txt':'i\n'},false);
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  const pre=(await store.show(handle.id)).pre;
  assert.equal(pre.entries['outer/o.txt']?.kind,'file');
  assert.equal(pre.entries['outer/inner/i.txt']?.kind,'file');
  assert.deepEqual(pre.coverage.nested?.map(row=>row.path),['outer','outer/inner']);
});

test('/undo says it before the person confirms: files restored without their Git history, and what is left out',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-r2-undo-note-');
  await repo(projectRoot,{'main.txt':'main\n'});
  await repo(join(projectRoot,'small'),{'s.txt':'s\n'},false);
  await repo(join(projectRoot,'big'),{'a.txt':'x'.repeat(40)},false);
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:100,maxStoredBytes:32,maxStoredFileBytes:64}});
  const handle=await store.begin({operation:'start',sessionId:'s1'});
  await writeFile(join(projectRoot,'small','s.txt'),'s v2\n','utf8');
  const record=await handle.finalize();
  const head=undoPickerOverlay({rows:[record],selected:0,confirm:0}).head?.map(line=>line.text);
  assert.ok(head.includes('small: files are restored; their Git history (commits, branch) is not'),head.join(' | '));
  assert.ok(head.includes('Not restored, left as they are: big (too large)'),head.join(' | '));
  const plain=await fixture('talos-r2-undo-plain-');await repo(plain.projectRoot,{'main.txt':'main\n'});
  const plainStore=createCheckpointStore({rootDir:plain.checkpointsRoot,projectRoot:plain.projectRoot});
  const plainHandle=await plainStore.begin({operation:'start',sessionId:'s1'});await writeFile(join(plain.projectRoot,'main.txt'),'v2\n','utf8');
  assert.equal(undoPickerOverlay({rows:[await plainHandle.finalize()],selected:0,confirm:0}).head?.length,2);
});

/* D1 (stress test 03/10, owner «Mai bloccare»): the top-level limits no longer refuse the capture; an untracked file over
   them is left out of /undo and said, and the tracked files stay covered. */
test('the top-level limits leave an untracked file out and say so; the tracked files stay covered',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture('talos-r2-top-limit-');
  await repo(projectRoot,{'main.txt':'main\n'});
  await writeFile(join(projectRoot,'untracked-large.txt'),'z'.repeat(80),'utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot,limits:{maxEntries:100,maxStoredBytes:32,maxStoredFileBytes:64}});
  const record=await store.show((await store.begin({operation:'start'})).id);
  assert.equal(record.pre.entries['main.txt']?.kind,'file');
  assert.deepEqual(record.pre.skipped,[{path:'untracked-large.txt',reason:'too-large',size:80}]);
});

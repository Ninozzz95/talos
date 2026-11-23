/*
 * PROPOSTA-GIT-SICURO-2026-10-31 (Desktop, rev. 4, OK of the CLI): a folder copied by hand brings its `.git/config`, and some keys
 * are commands Git runs by itself on a plain read. The places where TALOS starts Git on its own must not run them. Real Git and a spy
 * file, the method of harness-ui/tests/git-sicuro-posti.test.mjs: the fsmonitor, the clean filter and the post-index-change hook.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {captureWorkspaceSnapshot,materializeSnapshotFile} from '../../src/workspace/checkpoint.ts';
import {safeGitArgs,safeGitDiffArgs,safeGitEnvironment} from '../../src/workspace/safe-git.ts';
import {pathToFileURL} from 'node:url';

const git=(cwd:string,args:string[])=>execFileSync('git',args,{cwd,stdio:'pipe',windowsHide:true});
function copiedRepository(t:{after(fn:()=>void):void}){
  const root=mkdtempSync(join(tmpdir(),'talos-safe-git-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const dir=join(root,'repo');mkdirSync(dir);
  const spy=join(root,'SPY.txt');const hook=join(root,'hook.cjs');
  writeFileSync(hook,`require('fs').writeFileSync(${JSON.stringify(spy)},'x');if(process.argv.includes('--filter'))process.stdin.pipe(process.stdout);\n`);
  const command=`"${process.execPath.replaceAll('\\','/')}" "${hook.replaceAll('\\','/')}"`;
  git(dir,['init','-q']);git(dir,['config','user.email','t@example.test']);git(dir,['config','user.name','t']);
  writeFileSync(join(dir,'a.txt'),'one\n');git(dir,['add','a.txt']);git(dir,['commit','-qm','one']);
  writeFileSync(join(dir,'.gitattributes'),'a.txt filter=x\n');
  git(dir,['config',`filter.x.clean`,`${command} --filter`]);git(dir,['config','filter.x.smudge',`${command} --filter`]);
  git(dir,['config','core.fsmonitor',command]);
  const gitHook=join(dir,'.git','hooks','post-index-change');writeFileSync(gitHook,`#!/bin/sh\n${command}\n`);chmodSync(gitHook,0o755);
  writeFileSync(join(dir,'a.txt'),'two\n');
  const fired=()=>{const seen=existsSync(spy);rmSync(spy,{force:true});return seen;};
  return{root,dir,fired};
}

test('the spy works: a plain git status in this folder runs the folder\'s commands, so a quiet result below means something',t=>{
  const {dir,fired}=copiedRepository(t);
  git(dir,['status','--porcelain']);
  assert.equal(fired(),true);
});

test('a checkpoint of a copied folder runs none of the folder\'s commands, and still sees the file that changed',async t=>{
  const {root,dir,fired}=copiedRepository(t);
  fired();
  const snapshot=await captureWorkspaceSnapshot({projectRoot:dir,blobRoot:join(root,'blobs')});
  assert.equal(fired(),false,'capture ran a command of the folder');
  assert.equal((snapshot.entries['a.txt'] as any).source,'blob','changed against the index: kept as bytes');
});

test('restoring a file kept by reference runs none of the folder\'s commands',async t=>{
  const {root,dir,fired}=copiedRepository(t);
  writeFileSync(join(dir,'.gitattributes'),'a.txt filter=x\nb.txt filter=x\n');
  writeFileSync(join(dir,'b.txt'),'kept\n');git(dir,['-c','core.fsmonitor=false','-c','core.hooksPath=','add','b.txt']);git(dir,['-c','core.fsmonitor=false','-c','core.hooksPath=','commit','-qm','b']);
  const snapshot=await captureWorkspaceSnapshot({projectRoot:dir,blobRoot:join(root,'blobs')});
  const entry=snapshot.entries['b.txt'] as any;assert.equal(entry.source,'git');
  fired();
  const out=join(root,'out.txt');
  await materializeSnapshotFile(snapshot,entry,join(root,'blobs'),out);
  assert.equal(fired(),false,'restore ran a command of the folder');
  assert.equal(readFileSync(out,'utf8').replaceAll('\r\n','\n'),'kept\n');
});

test('the safe arguments switch off what the folder brought, and name the two diff switches',async t=>{
  const {dir}=copiedRepository(t);
  const args=await safeGitArgs(dir);
  assert.ok(args);
  assert.ok(args.includes('core.fsmonitor=false'));assert.ok(args.includes('core.hooksPath='));assert.ok(args.includes('filter.x.clean='));
  assert.deepEqual(await safeGitDiffArgs(),['--no-textconv','--no-ext-diff']);
});

test('outside a repository there is nothing to switch off, and the answer is no failure',async t=>{
  const root=mkdtempSync(join(tmpdir(),'talos-safe-git-none-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const args=await safeGitArgs(root);
  assert.ok(Array.isArray(args));
  assert.equal(args.includes('core.fsmonitor=false'),false);
});

/* The read-only Git the model asks for, the part the kernel's option made possible: its text is never touched. */
const repoWithFsmonitor=()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-safe-env-'));
  execFileSync('git',['init','-q'],{cwd:dir,windowsHide:true});
  const marker=join(dir,'ran.txt').replace(/\\/gu,'/');
  writeFileSync(join(dir,'hook.cmd'),`@echo off\r\necho ran>"${marker}"\r\n`);
  writeFileSync(join(dir,'hook.sh'),`#!/bin/sh\necho ran > "${marker}"\n`);chmodSync(join(dir,'hook.sh'),0o755);
  execFileSync('git',['config','core.fsmonitor',join(dir,process.platform==='win32'?'hook.cmd':'hook.sh').replace(/\\/gu,'/')],{cwd:dir,windowsHide:true});
  return{dir,marker};
};

test('a read-only Git gets the environment that turns the folder\'s commands off; any other command gets nothing',async()=>{
  const {dir}=repoWithFsmonitor();
  try{
    const adds=await safeGitEnvironment('git status',dir,{});
    assert.ok(adds);assert.equal(adds!.GIT_OPTIONAL_LOCKS,'0');
    assert.ok(Object.entries(adds!).some(([name,value])=>name.startsWith('GIT_CONFIG_KEY_')&&value==='core.fsmonitor'));
    assert.deepEqual(await safeGitEnvironment('git commit -m x',dir,{}),{},'a write is the person\'s: nothing changes');
    assert.deepEqual(await safeGitEnvironment('ls',dir,{}),{},'no Git, nothing');
    assert.deepEqual(await safeGitEnvironment('git status && rm -rf x',dir,{}),{},'not read-only as a whole');
    assert.equal((await safeGitEnvironment('git status',dir,{GIT_CONFIG_COUNT:'2'}))!.GIT_CONFIG_KEY_2!==undefined,true,'after what the person set');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('with the additions a real `git status` through the kernel does not run the folder\'s fsmonitor; without them it does',async()=>{
  const {dir,marker}=repoWithFsmonitor();
  const kernel:any=await import(pathToFileURL(join(process.cwd(),'..','harness-ui','src','kernel','talosHarness.mjs')).href);
  try{
    const adds=await safeGitEnvironment('git status',dir,process.env);
    const safe=await kernel.eseguiComandoSandboxato('git status',dir,{dove:'windows',aggiunteAmbiente:adds});
    assert.equal(safe.codice,0,String(safe.testo));
    assert.equal(existsSync(marker),false,'the hostile command did not run');
    await kernel.eseguiComandoSandboxato('git status',dir,{dove:'windows'});
    assert.equal(existsSync(marker),true,'premise: without the cure it does run');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('no folder, no command: nothing to read, and the shell gives the true error',async()=>{
  assert.deepEqual(await safeGitEnvironment('git status',join(tmpdir(),'talos-no-such-folder-at-all'),{}),{});
});

test('a folder Git cannot read says null, so the command does not run by itself; a folder that is no repository is not refused',async()=>{
  const {dir}=repoWithFsmonitor();
  const plain=mkdtempSync(join(tmpdir(),'talos-safe-plain-'));
  try{
    assert.equal(await safeGitEnvironment('git -C missing-folder status',dir,{}),null);
    assert.notEqual(await safeGitEnvironment('git status',plain,{}),null,'Git itself will say it is no repository');
  }finally{rmSync(dir,{recursive:true,force:true});rmSync(plain,{recursive:true,force:true});}
});

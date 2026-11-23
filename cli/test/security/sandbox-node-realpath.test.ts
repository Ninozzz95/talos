/*
 * F-E-001, the person's Node programs (owner 11/10/2026: inject the correction into isolated commands, declared). Inside the MXC
 * sandbox the native realpath answers EPERM; a sandboxed command gets NODE_OPTIONS=--require "<preload>". Measured in the real
 * sandbox on 11/10/2026: without it EPERM, with it OK; and a backslash path inside the quotes broke every Node program.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ensureSandboxRealpathPreload,sandboxNodeOptions,SANDBOX_REALPATH_PRELOAD} from '../../src/security/sandbox-node-realpath.ts';
import {createBrokeredKernelExecutor} from '../../src/runtime/brokered-executor.ts';

test('NODE_OPTIONS names the preload quoted and with forward slashes (a backslash inside the quotes is an escape for Node)',()=>{
  assert.equal(sandboxNodeOptions('C:\\Users\\A B\\cache\\sandbox\\x.cjs'),'--require "C:/Users/A B/cache/sandbox/x.cjs"');
});

test('the preload is written once, rewritten only when its bytes differ, and Node can load it through NODE_OPTIONS',t=>{
  const cache=mkdtempSync(path.join(tmpdir(),'talos-preload-'));t.after(()=>rmSync(cache,{recursive:true,force:true}));
  const file=ensureSandboxRealpathPreload(cache)!;
  assert.equal(readFileSync(file,'utf8'),SANDBOX_REALPATH_PRELOAD);
  writeFileSync(file,'stale');
  assert.equal(ensureSandboxRealpathPreload(cache),file);assert.equal(readFileSync(file,'utf8'),SANDBOX_REALPATH_PRELOAD);
  const run=spawnSync(process.execPath,['-e','console.log("loaded")'],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:sandboxNodeOptions(file)}});
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),'loaded');
});

test('the preload answers a refused realpath by the walk, and keeps every other error',t=>{
  const cache=mkdtempSync(path.join(tmpdir(),'talos-preload-'));t.after(()=>rmSync(cache,{recursive:true,force:true}));
  const file=ensureSandboxRealpathPreload(cache)!;
  /* the sandbox is played by throwing EPERM from the native calls BEFORE the preload wraps them */
  const script=`const fs=require('node:fs');const eperm=()=>Object.assign(new Error('EPERM (test)'),{code:'EPERM'});
fs.promises.realpath=async()=>{throw eperm();};fs.realpathSync.native=()=>{throw eperm();};
require(${JSON.stringify(file)});
(async()=>{const out=[];
for(const [n,f] of [['async',()=>fs.promises.realpath('.')],['native',async()=>fs.realpathSync.native('.')],['missing',()=>fs.promises.realpath('no-such-entry')]]){try{out.push(n+':'+(await f()===fs.realpathSync('.')?'walk':'other'));}catch(e){out.push(n+':'+e.code);}}
console.log(out.join(' '));})();`;
  const run=spawnSync(process.execPath,['-e',script],{encoding:'utf8',cwd:cache});
  assert.equal(run.stdout.trim(),'async:walk native:walk missing:ENOENT',run.stderr);
});

test('a sandboxed command gets the preload and its folder read-only only when one is given',async()=>{
  const seen:any[]=[];
  const broker={execute:async(request:any)=>{seen.push(request);return{exitCode:0,stdout:'ok',stderr:'',evidence:{appliedEnforcement:'windows-sandbox'} as any};}};
  const kernel=async()=>({uscitaUtile:(x:string)=>x,staccaCartellaFinale:(x:string)=>({testo:x,cartella:null}),codaCheStampaLaCartella:()=>'',eseguiComandoSandboxato:async()=>({})} as any);
  const base={kernel,broker:broker as any,platform:'win32' as const,network:'deny' as const,requiredEnforcement:'windows-sandbox' as const,newId:()=>'id-1'};
  await createBrokeredKernelExecutor({...base,sandboxNodePreload:'C:\\cache\\sandbox\\talos-sandbox-realpath.cjs'})('npm test','C:\\proj');
  await createBrokeredKernelExecutor(base)('npm test','C:\\proj');
  assert.equal(seen[0].environment.NODE_OPTIONS,'--require "C:/cache/sandbox/talos-sandbox-realpath.cjs"');
  assert.ok(seen[0].readOnlyPaths.includes('C:\\cache\\sandbox'));
  assert.ok(seen[0].environment.SystemRoot||seen[0].environment.PATH,'the allowlisted environment is kept');
  assert.equal(seen[1].environment,undefined);
  assert.deepEqual(seen[1].readOnlyPaths,['C:\\']);
});

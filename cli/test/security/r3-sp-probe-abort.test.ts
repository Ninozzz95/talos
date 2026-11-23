/*
 * R3 lane SP — owner decision (2026-09-24): the sandbox check starts at startup and is INTERRUPTIBLE. Measured before
 * (acceptance s09): a check still running when TALOS quit kept the process alive for seconds (the MXC workloads run up to
 * 30 s each on a fresh profile); the next Ctrl+C then reached a process whose raw mode was off and it died with code 1.
 * Required: quitting aborts a running check; every process the check started is ended (its own tree, identified by what
 * it spawned — the executor handle, the pids the executor and the descendant report in the check's private folder —
 * never by name); nothing keeps the event loop alive; and an aborted check yields NO verdict: never `verified`, never
 * written to the evidence store, so the next start checks again. The three-signal unanimity rule is untouched.
 * Every process here is a real local child started by this file; each test kills what it started if a check did not.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {createHostProcessTreeProbe,type SandboxedSpawn} from '../../src/security/process-tree-probe.ts';
import {createProcessTreeEvidenceStore} from '../../src/security/process-tree-evidence-store.ts';
import * as backends from '../../src/security/execution-backends.ts';

const roots:string[]=[];
after(async()=>{for(const directory of roots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
async function root(label:string){const directory=await mkdtemp(join(tmpdir(),`talos-abort-${label}-`));roots.push(directory);return directory;}
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function goneWithin(pid:number,ms:number){const until=Date.now()+ms;while(Date.now()<until){if(!alive(pid))return true;await sleep(25);}return !alive(pid);}
const kill=(pid:number|null|undefined)=>{if(pid)try{process.kill(pid,'SIGKILL');}catch{}};
function fakeSdk(){return{getPlatformSupport:()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container' as const}),createConfigFromPolicy:()=>({version:'0.8.0-alpha',process:{commandLine:''}}),spawnSandboxFromConfig:()=>{throw new Error('not used');}};}

/* An UNsandboxed spawner: nothing kills the detached descendant but the check itself. */
function realSpawn(started:number[]):SandboxedSpawn{
  return request=>{
    const child=spawn(request.executable,request.args,{cwd:request.cwd,stdio:'ignore',windowsHide:true});
    if(child.pid)started.push(child.pid);
    const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
    return{pid:child.pid,kill:()=>{try{child.kill('SIGKILL');}catch{}},exited};
  };
}
async function descendantPid(tempRoot:string,waitMs=5_000):Promise<number|null>{
  const until=Date.now()+waitMs;
  while(Date.now()<until){
    for(const name of await readdir(tempRoot).catch(()=>[] as string[])){
      try{const beat=JSON.parse(readFileSync(join(tempRoot,name,'heartbeat.json'),'utf8')) as {pid:number};if(beat.pid)return beat.pid;}catch{}
    }
    await sleep(40);
  }
  return null;
}

test('R3-SP abort: a check that never finishes by itself is aborted promptly, and every process it started is ended',async()=>{
  const tempRoot=await root('probe');const started:number[]=[];const controller=new AbortController();
  /* The heartbeat is never "seen", so the check waits for its descendant for a minute: it cannot finish by itself. */
  const probe=createHostProcessTreeProbe({platform:'win32',spawn:realSpawn(started),tempRoot,readHeartbeat:async()=>null,descendantTimeoutMs:60_000,signal:controller.signal} as any);
  const running=probe().then(()=>'finished',(error:any)=>error?.name==='AbortError'?'aborted':`threw ${error?.message}`);
  const descendant=await descendantPid(tempRoot);
  let outcome:string='';
  try{
    assert.ok(started[0]&&descendant,'the executor and its detached descendant are running');
    const abortedAt=Date.now();controller.abort();
    outcome=await Promise.race([running,sleep(3_000).then(()=>'still running 3 s after the abort')]);
    assert.equal(outcome,'aborted');
    assert.ok(Date.now()-abortedAt<2_500,`the abort took ${Date.now()-abortedAt} ms`);
    assert.ok(await goneWithin(started[0]!,1_000),'the executor the check spawned is still alive');
    assert.ok(await goneWithin(descendant!,1_000),'the detached descendant the executor spawned is still alive');
    assert.deepEqual(await readdir(tempRoot),[],'the check folder is removed');
  }finally{kill(started[0]);kill(descendant);}
});

test('R3-SP abort: an aborted check is no verdict — not available, nothing cached, even when the probe answers "verified" after the abort',async()=>{
  const cacheRoot=await root('store');const controller=new AbortController();
  let answer:(value:any)=>void=()=>{};
  const verified={verified:true,evidence:{schema:'talos.cli.process-tree-evidence.v1',scope:'createprocess-descendant',signals:{heartbeat:'gone',signalZero:'gone',enumeration:'gone'},executorPid:1,descendantPid:2,observedAtMs:1,durationMs:1,cleanup:{descendantKilled:false,executorKilled:true,directoryRemoved:true},workloads:{cmd:'ok',node:'ok',powershell:'ok',pwsh:'ok',gitBash:'unsupported'}}};
  const backend=backends.createVerifiedMxcBackend({paths:{cacheRoot},platform:'win32',sdk:fakeSdk(),probe:()=>new Promise(resolve=>{answer=resolve;}),signal:controller.signal} as any);
  const availability=backend.available();
  await sleep(50);controller.abort();answer(verified);
  const state:any=await Promise.race([availability,sleep(2_000).then(()=>'still waiting')]);
  assert.notEqual(state,'still waiting','the availability question never returned after the abort');
  assert.equal(state.available,false,'an aborted check must never make the sandbox available');
  assert.equal(await createProcessTreeEvidenceStore({cacheRoot}).read(),null,'an aborted check must never be written to the evidence store');
  assert.equal(existsSync(join(cacheRoot,'process-tree-evidence.json')),false);
  let asked=0;
  const next=backends.createVerifiedMxcBackend({paths:{cacheRoot},platform:'win32',sdk:fakeSdk(),probe:async()=>{asked++;return verified;}} as any);
  assert.equal((await next.available()).available,true);
  assert.equal(asked,1,'the next start checks again');
});

test('R3-SP abort: quitting aborts the running checks and returns promptly with the child ended',async()=>{
  const {runIsolationCheck,abortIsolationChecks}=backends as any;
  assert.equal(typeof runIsolationCheck,'function','a check runs under the process-wide abort');
  assert.equal(typeof abortIsolationChecks,'function','quitting can abort the running checks');
  let childPid:number|undefined;
  const check=runIsolationCheck((signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});childPid=child.pid;
    signal.addEventListener('abort',()=>{try{child.kill('SIGKILL');}catch{}child.once('exit',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));},{once:true});
  })).catch((error:any)=>error?.name);
  try{
    await sleep(100);assert.ok(childPid&&alive(childPid));
    const at=Date.now();await abortIsolationChecks();
    assert.ok(Date.now()-at<2_500,`quitting waited ${Date.now()-at} ms`);
    assert.equal(await check,'AbortError');
    assert.ok(await goneWithin(childPid!,1_000),'the process the check started is still alive');
  }finally{kill(childPid);}
});

test('R3-SP abort: the availability question returns at once on abort even when the probe itself never answers',async()=>{
  const cacheRoot=await root('never');const controller=new AbortController();
  const backend=backends.createVerifiedMxcBackend({paths:{cacheRoot},platform:'win32',sdk:fakeSdk(),probe:()=>new Promise(()=>{}),signal:controller.signal} as any);
  const availability=backend.available();
  await sleep(30);const at=Date.now();controller.abort();
  const state:any=await Promise.race([availability,sleep(2_000).then(()=>'still waiting')]);
  assert.notEqual(state,'still waiting');
  assert.equal(state.available,false);
  assert.ok(Date.now()-at<1_000);
  assert.equal(existsSync(join(cacheRoot,'process-tree-evidence.json')),false);
});

test('R3-SP abort: the workload check stops too — the running workload is killed and no result is given',async()=>{
  const {createSandboxWorkloadProbe}=await import('../../src/security/process-tree-probe.ts');
  const tempRoot=await root('workloads');const started:number[]=[];const controller=new AbortController();
  /* Every workload is replaced by a real process that never exits by itself. */
  const neverEnding:SandboxedSpawn=request=>{
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:request.cwd,stdio:'ignore',windowsHide:true});
    if(child.pid)started.push(child.pid);
    const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
    return{pid:child.pid,kill:()=>{try{child.kill('SIGKILL');}catch{}},exited};
  };
  const probe=createSandboxWorkloadProbe({platform:'win32',spawn:neverEnding,tempRoot,timeoutMs:60_000,pwshExecutable:null,signal:controller.signal} as any);
  const running=probe().then(()=>'finished',(error:any)=>error?.name==='AbortError'?'aborted':`threw ${error?.message}`);
  try{
    for(let i=0;i<80&&started.length===0;i++)await sleep(25);
    assert.equal(started.length,1,'the first workload is running');
    const at=Date.now();controller.abort();
    const outcome=await Promise.race([running,sleep(3_000).then(()=>'still running 3 s after the abort')]);
    assert.equal(outcome,'aborted');
    assert.ok(Date.now()-at<2_500);
    assert.ok(await goneWithin(started[0]!,1_000),'the running workload was not ended');
    assert.equal(started.length,1,'no workload starts after the abort');
    assert.deepEqual(await readdir(tempRoot),[],'the workload folder is removed');
  }finally{for(const pid of started)kill(pid);}
});

test('R3-SP abort: a first command\'s probe (the broker) is stopped by quitting too — no hang, no verdict, nothing cached',async()=>{
  const cacheRoot=await root('broker');const workspace=join(cacheRoot,'workspace');await (await import('node:fs/promises')).mkdir(workspace);
  const {createCliExecutionBroker,abortIsolationChecks}=backends as any;
  const broker=createCliExecutionBroker({paths:{cacheRoot},platform:'win32',sdk:fakeSdk(),store:createProcessTreeEvidenceStore({cacheRoot}),probe:()=>new Promise(()=>{})});
  const request={id:'first-command',executable:process.execPath,args:['--version'],cwd:workspace,readWritePaths:[workspace],readOnlyPaths:[],network:'deny',requiredEnforcement:'windows-sandbox'};
  const outcome=broker.execute(request).then(()=>'ran',(error:any)=>error?.code??error?.message);
  await sleep(50);
  const at=Date.now();await abortIsolationChecks();
  const settled=await Promise.race([outcome,sleep(2_000).then(()=>'still waiting')]);
  assert.notEqual(settled,'still waiting','the first command waited for a probe TALOS had stopped');
  assert.notEqual(settled,'ran','an aborted probe must never let a command run in a sandbox it did not verify');
  assert.ok(Date.now()-at<2_500);
  assert.equal(existsSync(join(cacheRoot,'process-tree-evidence.json')),false);
});

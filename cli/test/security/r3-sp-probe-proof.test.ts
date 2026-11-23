/*
 * R3 lane SP — coordinator review of the interruptible check (owner standing rule): end only processes THIS check
 * started, after proving it — never a pid on trust. Windows reuses pids quickly: a pid read from executor.json or from
 * heartbeat.json, or seen alive a moment ago, can belong seconds later to an unrelated process of the person, and
 * TerminateProcess would end it. Required: no kill by pid without a proof, at kill time, that the pid is this check's;
 * no proof → no kill, the check is unverified, nothing is cached, and the leftover is STATED, never silently ignored.
 *
 * Each test starts an UNRELATED harmless process (not started by any check), plants its pid where a check reads pids,
 * and asserts it survives. The test ends that process itself in `finally`.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {createHostProcessTreeProbe,type SandboxedSpawn} from '../../src/security/process-tree-probe.ts';
import {createProcessTreeEvidenceStore} from '../../src/security/process-tree-evidence-store.ts';
import * as backends from '../../src/security/execution-backends.ts';

const roots:string[]=[];
after(async()=>{for(const directory of roots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
async function root(label:string){const directory=await mkdtemp(join(tmpdir(),`talos-proof-${label}-`));roots.push(directory);return directory;}
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function goneWithin(pid:number,ms:number){const until=Date.now()+ms;while(Date.now()<until){if(!alive(pid))return true;await sleep(25);}return !alive(pid);}
const kill=(pid:number|null|undefined)=>{if(pid)try{process.kill(pid,'SIGKILL');}catch{}};
function fakeSdk(){return{getPlatformSupport:()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container' as const}),createConfigFromPolicy:()=>({version:'0.8.0-alpha',process:{commandLine:''}}),spawnSandboxFromConfig:()=>{throw new Error('not used');}};}

/* A harmless process that waits forever. */
function harmless(cwd?:string){return spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{...(cwd?{cwd}:{}),stdio:'ignore',windowsHide:true});}

/*
 * The check's spawner starts a harmless "executor" (the check's own process, ended through its handle) and, before
 * handing it back, plants files in the check's private folder, the way a stale report would look.
 */
function plantingSpawn(started:number[],plant:(directory:string)=>void):SandboxedSpawn{
  return request=>{
    const child=harmless(request.cwd);
    if(child.pid)started.push(child.pid);
    plant(request.probeDirectory);
    const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
    return{pid:child.pid,kill:()=>{try{child.kill('SIGKILL');}catch{}},exited};
  };
}
async function planted(tempRoot:string,file:string,waitMs=5_000){
  const until=Date.now()+waitMs;
  while(Date.now()<until){for(const name of await readdir(tempRoot).catch(()=>[] as string[]))if(existsSync(join(tempRoot,name,file)))return true;await sleep(20);}
  return false;
}
const staleBeat=(pid:number)=>JSON.stringify({pid,seq:7,atMs:Date.now()-60_000});

test('R3-SP proof: an abort never ends a pid read from executor.json — no proof, no kill, and the leftover is stated',async()=>{
  const tempRoot=await root('report');const started:number[]=[];const controller=new AbortController();
  const unrelated=harmless();
  const probe=createHostProcessTreeProbe({platform:'win32',tempRoot,readHeartbeat:async()=>null,descendantTimeoutMs:60_000,signal:controller.signal,
    spawn:plantingSpawn(started,directory=>writeFileSync(join(directory,'executor.json'),JSON.stringify({executorPid:unrelated.pid,descendantPid:unrelated.pid})))} as any);
  const running=probe().then(()=>({name:'finished'} as any),(error:any)=>error);
  try{
    assert.ok(unrelated.pid&&await planted(tempRoot,'executor.json'),'the stale report is in the check folder');
    controller.abort();
    const error=await Promise.race([running,sleep(3_000).then(()=>({name:'still running 3 s after the abort'}))]);
    assert.equal(error.name,'AbortError');
    await sleep(300);
    assert.equal(alive(unrelated.pid!),true,'a process this check did not start was ended on a pid read from executor.json');
    assert.ok(await goneWithin(started[0]!,1_000),'the check\'s own executor is ended through its handle');
    assert.deepEqual(error.leftover,[unrelated.pid],'the process left running is stated, not silently ignored');
    assert.match(String(error.message),new RegExp(`\\b${unrelated.pid}\\b`,'u'));
  }finally{kill(unrelated.pid);for(const pid of started)kill(pid);}
});

test('R3-SP proof: an abort never ends a pid read from a stale heartbeat — a beat that does not move proves nothing',async()=>{
  const tempRoot=await root('beat');const started:number[]=[];const controller=new AbortController();
  const unrelated=harmless();
  const probe=createHostProcessTreeProbe({platform:'win32',tempRoot,readHeartbeat:async()=>null,descendantTimeoutMs:60_000,signal:controller.signal,
    spawn:plantingSpawn(started,directory=>writeFileSync(join(directory,'heartbeat.json'),staleBeat(unrelated.pid!)))} as any);
  const running=probe().then(()=>({name:'finished'} as any),(error:any)=>error);
  try{
    assert.ok(unrelated.pid&&await planted(tempRoot,'heartbeat.json'));
    controller.abort();
    const error=await Promise.race([running,sleep(3_000).then(()=>({name:'still running 3 s after the abort'}))]);
    assert.equal(error.name,'AbortError');
    await sleep(300);
    assert.equal(alive(unrelated.pid!),true,'a process this check did not start was ended on a pid read from a stale heartbeat');
    assert.ok(await goneWithin(started[0]!,1_000));
    assert.deepEqual(error.leftover,[unrelated.pid]);
  }finally{kill(unrelated.pid);for(const pid of started)kill(pid);}
});

test('R3-SP proof: quitting TALOS during a check ends nothing it cannot prove — no verdict, nothing cached, the leftover reaches the caller',async()=>{
  const cacheRoot=await root('quit');const tempRoot=await root('quit-probe');const started:number[]=[];
  const unrelated=harmless();
  const probe=createHostProcessTreeProbe({platform:'win32',tempRoot,readHeartbeat:async()=>null,descendantTimeoutMs:60_000,signal:(backends as any).isolationCheckSignal(),
    spawn:plantingSpawn(started,directory=>writeFileSync(join(directory,'executor.json'),JSON.stringify({executorPid:unrelated.pid,descendantPid:null})))} as any);
  const backend=backends.createVerifiedMxcBackend({paths:{cacheRoot},platform:'win32',sdk:fakeSdk(),probe} as any);
  const availability=backend.available();
  try{
    assert.ok(unrelated.pid&&await planted(tempRoot,'executor.json'));
    const left=await (backends as any).abortIsolationChecks();
    const state:any=await Promise.race([availability,sleep(2_000).then(()=>'still waiting')]);
    assert.notEqual(state,'still waiting');
    assert.equal(state.available,false,'an aborted check is no verdict');
    assert.equal(await createProcessTreeEvidenceStore({cacheRoot}).read(),null,'nothing is cached');
    assert.equal(existsSync(join(cacheRoot,'process-tree-evidence.json')),false);
    await sleep(300);
    assert.equal(alive(unrelated.pid!),true,'quitting ended a process no check started');
    assert.deepEqual(left,[unrelated.pid],'quitting reports the process it could not prove and left running');
  }finally{kill(unrelated.pid);for(const pid of started)kill(pid);}
});

test('R3-SP proof (B1 cleanup): a finished check never ends the pid of a heartbeat that stopped — unverified, stated, not cached',async()=>{
  const cacheRoot=await root('b1');const tempRoot=await root('b1-probe');const started:number[]=[];
  const unrelated=harmless();
  /* The stale beat has seq 7, so the check takes it for its descendant and measures it: it never moves. */
  const probe=createHostProcessTreeProbe({platform:'win32',tempRoot,settleMs:100,heartbeatWindowMs:250,executorExitTimeoutMs:1_000,enumerate:async()=>'alive',
    spawn:plantingSpawn(started,directory=>writeFileSync(join(directory,'heartbeat.json'),staleBeat(unrelated.pid!)))} as any);
  const backend=backends.createVerifiedMxcBackend({paths:{cacheRoot},platform:'win32',sdk:fakeSdk(),probe,signal:new AbortController().signal} as any);
  try{
    assert.ok(unrelated.pid);
    const state:any=await backend.available();
    assert.equal(state.available,false);
    await sleep(300);
    assert.equal(alive(unrelated.pid!),true,'the cleanup ended a process this check did not start (pid of a heartbeat that stopped)');
    assert.equal(await createProcessTreeEvidenceStore({cacheRoot}).read(),null,'a check that left a process it could not prove is not cached');
    assert.match(String(state.reason),new RegExp(`\\b${unrelated.pid}\\b`,'u'),`the leftover is stated in the reason: ${state.reason}`);
  }finally{kill(unrelated.pid);for(const pid of started)kill(pid);}
});

test('R3-SP proof (B1 cleanup): the probe result states the leftover in its evidence and is never verified',async()=>{
  const tempRoot=await root('b1-evidence');const started:number[]=[];
  const unrelated=harmless();
  const probe=createHostProcessTreeProbe({platform:'win32',tempRoot,settleMs:100,heartbeatWindowMs:250,executorExitTimeoutMs:1_000,enumerate:async()=>'alive',
    spawn:plantingSpawn(started,directory=>writeFileSync(join(directory,'heartbeat.json'),staleBeat(unrelated.pid!)))} as any);
  try{
    const result:any=await probe();
    assert.equal(result.verified,false);
    await sleep(300);
    assert.equal(alive(unrelated.pid!),true,'the cleanup ended a process this check did not start');
    assert.deepEqual(result.evidence.cleanup.leftover,[unrelated.pid]);
    assert.equal(result.evidence.cleanup.descendantKilled,false);
    assert.deepEqual(await readdir(tempRoot),[],'the check folder is removed');
  }finally{kill(unrelated.pid);for(const pid of started)kill(pid);}
});

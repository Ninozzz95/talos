/*
 * Startup stall (owner goal: start and resume as fast as Codex/Claude Code, on low-end PCs too; 08/10/2026). A profile of `talos --resume` on a copy of the
 * owner's real archive showed three SYNCHRONOUS child processes before the composer: `whoami` (the mxc-sdk runs it when the module loads), `dism /online
 * /get-featureinfo` and the sdk's `--probe` binary (both inside `getPlatformSupport()`), asked for by the TUI's sandbox check at mount. Measured with the
 * check switched off in a copy of the build, A/B alternated, 5+5 runs twice, ordered exit: `--resume last` composer ready 681 / 673 ms with the check ->
 * 565 / 549 ms without (about -115 ms, 17%); a plain start did not move (248 / 252 vs 258 / 253: the composer is drawn before the stall). The measurement
 * itself must stay (the banner and the approval card say "no sandbox" only when it is measured), so it moves to a worker thread: the main thread stays free,
 * the sdk's own per-module cache still makes it one measurement per process, and a worker that cannot start falls back to the old in-process way.
 * Codex does the same (app-server windows_sandbox_processor.rs: the blocking work in spawn_blocking, coalesced by a OnceCell, "must not hold up unrelated
 * RPCs in the serial dispatcher"); Pi moves blocking image work to a worker thread (image-resize-worker.ts); Hermes asks for Docker only where it is used.
 * What these tests pin: the loop keeps ticking while the worker blocks; one worker per probe; an answer is an answer (a failure inside the worker is not
 * retried in-process); a worker that dies or never starts falls back; an abort ends the wait and the thread; garbage is never taken for evidence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import type {MxcPlatformEvidence} from '../../src/security/mxc-execution-backend.ts';
import {createWorkerSupportProbe} from '../../src/security/mxc-support-probe.ts';

const fixture=(name:string)=>fileURLToPath(new URL(`./support-workers/${name}`,import.meta.url));
const evidence:MxcPlatformEvidence={isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container'};
const never=()=>Promise.reject(new Error('the in-process way must not run'));
const spawnCounting=(spawned:Worker[])=>(file:string)=>{const worker=new Worker(file);spawned.push(worker);return worker;};
const settle=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('S1 a measurement that blocks the worker for 300 ms leaves the main thread free: the loop keeps ticking',async()=>{
  const gaps:number[]=[];let last=performance.now();
  const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},10);
  try{
    const result=await createWorkerSupportProbe({workerFile:fixture('blocks-300ms.mjs'),inProcess:never})();
    assert.deepEqual(result,evidence);
  }finally{clearInterval(timer);}
  assert.ok(gaps.length>=15,`the loop ticked ${gaps.length} times while the worker blocked 300 ms`);
  assert.ok(Math.max(...gaps)<100,`the longest stall of the main thread was ${Math.max(...gaps).toFixed(0)} ms`);
});

test('S2 one probe is one worker and one measurement, however many times it is asked',async()=>{
  const spawned:Worker[]=[];
  const probe=createWorkerSupportProbe({workerFile:fixture('blocks-300ms.mjs'),spawnWorker:spawnCounting(spawned),inProcess:never});
  const [a,b]=await Promise.all([probe(),probe()]);
  assert.deepEqual(a,evidence);assert.equal(b,a);
  assert.deepEqual(await probe(),evidence);
  assert.equal(spawned.length,1);
});

test('S3 the worker is ended once it has answered',async()=>{
  const spawned:Worker[]=[];
  await createWorkerSupportProbe({workerFile:fixture('blocks-300ms.mjs'),spawnWorker:spawnCounting(spawned),inProcess:never})();
  await settle(100);
  assert.equal(spawned[0]!.threadId,-1,'the thread is gone');
});

test('S4 a failure the worker REPORTS is an answer: it keeps its stage and is not repeated in-process',async()=>{
  for(const [file,stage,message] of [['fails-load.mjs','load','Cannot find package mxc-sdk'],['fails-support.mjs','support','dism failed']] as const){
    let inProcessCalls=0;
    await assert.rejects(
      createWorkerSupportProbe({workerFile:fixture(file),inProcess:async()=>{inProcessCalls+=1;return evidence;}})(),
      (error:any)=>error.stage===stage&&error.message===message,
    );
    assert.equal(inProcessCalls,0,file);
  }
});

test('S5 a worker that crashes, never starts, or ends without answering falls back to the in-process way (never worse than before)',{timeout:10_000},async()=>{
  for(const file of ['crashes.mjs','does-not-exist.mjs','exits-silently.mjs']){
    let inProcessCalls=0;
    const result=await createWorkerSupportProbe({workerFile:fixture(file),inProcess:async()=>{inProcessCalls+=1;return {...evidence,reason:'in-process'};}})();
    assert.deepEqual(result,{...evidence,reason:'in-process'},file);
    assert.equal(inProcessCalls,1,file);
  }
});

test('S6 a spawn that throws also falls back',async()=>{
  const result=await createWorkerSupportProbe({workerFile:'unused',spawnWorker:()=>{throw new Error('no threads');},inProcess:async()=>({...evidence,reason:'in-process'})})();
  assert.equal(result.reason,'in-process');
});

test('S7 an abort ends the wait at once and the thread with it',{timeout:10_000},async()=>{
  const spawned:Worker[]=[];const controller=new AbortController();
  const probe=createWorkerSupportProbe({workerFile:fixture('hangs.mjs'),spawnWorker:spawnCounting(spawned),inProcess:never,signal:controller.signal});
  const waiting=probe();
  await settle(50);
  const t0=performance.now();controller.abort();
  await assert.rejects(waiting,(error:any)=>error.code==='ABORT_ERR');
  assert.ok(performance.now()-t0<300,'the wait ended at once');
  await settle(100);
  assert.equal(spawned[0]!.threadId,-1);
});

test('S8 an already-aborted signal starts nothing',async()=>{
  const spawned:Worker[]=[];const controller=new AbortController();controller.abort();
  await assert.rejects(createWorkerSupportProbe({workerFile:fixture('blocks-300ms.mjs'),spawnWorker:spawnCounting(spawned),inProcess:never,signal:controller.signal})(),(error:any)=>error.code==='ABORT_ERR');
  assert.equal(spawned.length,0);
});

test('S9 something that is not an evidence object is never taken for one',async()=>{
  await assert.rejects(createWorkerSupportProbe({workerFile:fixture('answers-garbage.mjs'),inProcess:never})(),(error:any)=>error.stage==='support'&&/evidence/u.test(error.message));
});

test('S10 an abort after the answer changes nothing, and the listener is given back',async()=>{
  const controller=new AbortController();
  const probe=createWorkerSupportProbe({workerFile:fixture('blocks-300ms.mjs'),inProcess:never,signal:controller.signal});
  const first=await probe();
  controller.abort();
  assert.equal(await probe(),first,'the memoized answer stands');
});

test('S11 the thread never keeps TALOS alive: a process with a probe whose worker never answers still exits by itself',()=>{
  const source=pathToFileURL(fileURLToPath(new URL('../../src/security/mxc-support-probe.ts',import.meta.url))).href;
  const run=spawnSync(process.execPath,['--experimental-strip-types',fixture('pending-probe.mjs'),source,fixture('hangs.mjs')],{timeout:8000,encoding:'utf8'});
  assert.equal((run.error as {code?:string}|undefined)?.code,undefined,'it did not exit by itself: '+String(run.error));
  assert.equal(run.status,0,run.stderr);
});

/*
 * 14/10/2026, owner: «Aggiungo il sottofondo, poi la sveglia». On the CLI's isolated path (the broker) a command the model asked
 * to run in the background, or one that outlives its time, was KILLED at 2 minutes (KERNEL_EXIT.timeout) and the turn waited for
 * it; the kernel's own executor (the host path) already moves it to the background (talosHarness.mjs `creaGestoreSfondo`: «the
 * time moves it to the background, it does not kill»). Now the broker path does what the kernel does: the turn gets the answer
 * AT ONCE (`messoInSfondo`, the kernel's `IN BACKGROUND` header the registry reads), the command keeps running, its output goes
 * to the row's file, and `uscita` resolves with its exit code so the registry can wake the conversation (C06). Claude Code:
 * Bash `run_in_background`; Hermes: `terminal_tool(background=True, notify_on_complete=True)`; Cline: background-terminal.
 * The broker's contract has no streaming: the output reaches the file when the command ends, and the answer says so.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createBrokeredKernelExecutor,KERNEL_EXIT} from '../../src/runtime/brokered-executor.ts';

const KERNEL_FILE=fileURLToPath(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url));
const kernelModule:any=await import(pathToFileURL(KERNEL_FILE).href);
const kernel=async()=>({uscitaUtile:kernelModule.uscitaUtile,staccaCartellaFinale:kernelModule.staccaCartellaFinale,codaCheStampaLaCartella:kernelModule.codaCheStampaLaCartella,
  eseguiComandoSandboxato:async()=>{throw new Error('the host path must not run here');}});
const EV={requestedEnforcement:'restricted-process',appliedEnforcement:'windows-sandbox',backend:'mxc-appcontainer',appContainer:false,filesystem:'bfs',network:'deny',processTree:'job-object',verifiedAt:'2026-10-14T00:00:00.000Z'};

/* A broker whose command ends only when the test says so (or when its signal aborts, as the real one kills the process). */
function heldBroker(){
  const seen:any[]=[];let finish:(value:{exitCode:number;stdout:string;stderr:string})=>void=()=>{};let aborted=false;
  return{seen,finish:(exitCode=0,stdout='',stderr='')=>finish({exitCode,stdout,stderr}),aborted:()=>aborted,
    broker:{execute(request:any):Promise<any>{seen.push(request);return new Promise((resolve,reject)=>{
      finish=(value)=>resolve({...value,evidence:EV});
      request.signal?.addEventListener('abort',()=>{aborted=true;reject(Object.assign(new Error('stopped'),{code:'EXECUTION_ABORTED'}));},{once:true});
    });}}};
}
async function folder(){return mkdtemp(path.join(tmpdir(),'talos-bg-'));}

test('background:true answers at once, keeps the command running, and its exit lands in the file and in `uscita`',async()=>{
  const dir=await folder();const file=path.join(dir,'.talos','processi-sfondo','t1.log');
  try{
    const b=heldBroker();
    const run=createBrokeredKernelExecutor({kernel,broker:b.broker,platform:'win32'});
    const result:any=await run('npm run dev','C:\\work',{inSfondoSubito:true,fileSfondo:file,segnaleSfondo:new AbortController().signal} as any);
    assert.equal(result.messoInSfondo,true);
    assert.equal(result.codice,null);
    assert.equal(result.daSfondo,'avvio');
    assert.equal(result.fileSfondo,file);
    assert.match(result.testo,/^IN BACKGROUND: started in the background on request\./u,'the kernel\'s header: the registry marks the row from it');
    assert.match(result.testo,/when the command ends/u,'the broker hands the output over at the end: said');
    assert.ok(b.seen[0].timeoutMs>=6*60*60*1000,'a background command is not killed at the foreground time');
    let settled=false;const exit=result.uscita.then((value:any)=>{settled=true;return value;});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(settled,false,'still running');
    b.finish(0,'listening on 5173','warn: x');
    assert.deepEqual(await exit,{codice:0,segnale:null});
    const text=await readFile(file,'utf8');
    assert.match(text,/listening on 5173/u);assert.match(text,/warn: x/u);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('the time moves it to the background instead of killing it; the row\'s button does too',async()=>{
  const dir=await folder();
  try{
    const b=heldBroker();
    const run=createBrokeredKernelExecutor({kernel,broker:b.broker,platform:'win32'});
    const timed:any=await run('npm test','C:\\work',{timeoutMs:30,fileSfondo:path.join(dir,'a.log'),segnaleSfondo:new AbortController().signal} as any);
    assert.equal(timed.messoInSfondo,true);assert.equal(timed.daSfondo,'tempo-scaduto');
    assert.match(timed.testo,/timed out after 1 s and was moved to the background instead of being killed/u);
    assert.equal(b.aborted(),false,'not killed');
    b.finish(1,'','failed');
    assert.deepEqual(await timed.uscita,{codice:1,segnale:null});
    const button=new AbortController();const c=heldBroker();
    const run2=createBrokeredKernelExecutor({kernel,broker:c.broker,platform:'win32'});
    const pending=run2('npm run build','C:\\work',{segnaleSfondo:button.signal,fileSfondo:path.join(dir,'b.log')} as any);
    /* pressed while the command runs (pressed before it starts is the other branch) */
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(c.seen.length,1,'the command is running');
    button.abort();
    const moved:any=await pending;
    assert.equal(moved.daSfondo,'persona');
    c.finish(0,'built');
    assert.deepEqual(await moved.uscita,{codice:0,segnale:null});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('the Stop of the row still stops a command in the background, and `uscita` says it ended by the stop',async()=>{
  const dir=await folder();
  try{
    const b=heldBroker();const stop=new AbortController();
    const run=createBrokeredKernelExecutor({kernel,broker:b.broker,platform:'win32'});
    const result:any=await run('npm run dev','C:\\work',{inSfondoSubito:true,fileSfondo:path.join(dir,'c.log'),segnaleSfondo:new AbortController().signal,segnaleStop:stop.signal} as any);
    stop.abort();
    assert.deepEqual(await result.uscita,{codice:KERNEL_EXIT.stoppedOnRequest,segnale:null});
    assert.equal(b.aborted(),true);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('review of 0.6.4 (S3): a command the sandbox ended early keeps in its file what it wrote, and the reason',async()=>{
  const {TalosError}=await import('../../src/errors.ts');
  const dir=await folder();
  try{
    for(const [inner,why] of [['MXC_OUTPUT_LIMIT_EXCEEDED',/more than 8 MB/u],['MXC_EXECUTION_TIMEOUT',/12 hours/u]] as const){
      const file=path.join(dir,`${inner}.log`);
      let fail:(error:unknown)=>void=()=>{};
      /* the broker wraps the backend's error (execution-broker.ts: EXECUTION_BACKEND_FAILED with the cause) */
      const broker={execute:()=>new Promise((_resolve,reject)=>{fail=reject;})};
      const run=createBrokeredKernelExecutor({kernel,broker:broker as any,platform:'win32'});
      const result:any=await run('npm run build','C:\\work',{inSfondoSubito:true,fileSfondo:file,segnaleSfondo:new AbortController().signal} as any);
      fail(new TalosError({code:'EXECUTION_BACKEND_FAILED',component:'execution-broker',retryable:false,traceId:'t'},Object.assign(new Error(inner),{stdout:'built 41 of 42',stderr:'warn: slow'})));
      assert.deepEqual(await result.uscita,{codice:null,segnale:null,errore:true});
      const text=await readFile(file,'utf8');
      assert.match(text,/built 41 of 42/u,inner);assert.match(text,/warn: slow/u,inner);
      assert.match(text,/\[TALOS: the command ended early: /u,inner);assert.match(text,why,inner);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("without the row's background control (a caller that has no row) nothing changes: killed at its time, as before",async()=>{
  const b=heldBroker();
  const run=createBrokeredKernelExecutor({kernel,broker:b.broker,platform:'win32',timeoutMs:30});
  const result:any=await run('npm test','C:\\work',{});
  assert.equal(result.codice,KERNEL_EXIT.timeout);
  assert.equal(result.messoInSfondo,undefined);
  assert.equal(b.seen[0].timeoutMs,30);
});

/*
 * 0.6.6, the 0.6.6 review's F1 and F2 — `talos automation` with ONE host per profile (automations/host-lease.ts), on the kernel's
 * real store:
 * - while another process hosts, `run` asks it for the run, creates no runtime of its own, and waits for the end on the store;
 *   if the host leaves during the run, the run is reported as interrupted, not waited for forever;
 * - if the host leaves before taking the request, `run` hosts the run itself;
 * - `serve --once` does not tick under another host; `serve` waits to take over;
 * - the history and `show` speak English words, never the store's own (`saltata`, `traffico`) or a bare code.
 */
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runAutomationCommand} from '../../src/commands/advanced-cli.ts';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {resolveCliPaths} from '../../src/paths.ts';

const REAL_REPO=fileURLToPath(new URL('../../../',import.meta.url));
async function world(format:'json'|'text'='json'){
  const project=await mkdtemp(join(tmpdir(),'talos-auto-host-'));const out:string[]=[];const err:string[]=[];let runtimes=0;
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:project,repoRoot:REAL_REPO,paths:resolveCliPaths({APPDATA:join(project,'.app'),LOCALAPPDATA:join(project,'.local')},'win32',join(project,'.home')),
    createRuntimeContext:async()=>{runtimes++;throw new Error('hosting here');}};
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(ctx.paths.dataRoot,'automations')});
  const auto=await store.crea({nome:'Build check',istruzioni:'check the build',cartella:project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  const leaseDir=join(ctx.paths.dataRoot,'automation-host');
  return{project,ctx,out,err,store,auto,leaseDir,runtimes:()=>runtimes};
}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/** The test plays the host: takes the request, answers it, and writes the run in the store as the kernel's scheduler would. */
async function playHost(lease:ReturnType<typeof createHostLease>,answer:(request:any)=>Promise<unknown>){
  for(let i=0;i<500;i++){const [request]=lease.take();if(request){lease.answer(request.requestId,await answer(request));return request;}await wait(10);}
  throw new Error('no request came');
}

test('another process hosts: run asks it, creates no runtime, and reports the end the store gets',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'serve'});assert.equal(host.tryAcquire().ok,true);
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:20} as any);
  const request=await playHost(host,async()=>{await w.store.apriGiro(w.auto.id,{runId:'r-1',sessionId:'s-1'});return{ok:true,runId:'r-1',sessionId:'s-1'};});
  assert.equal(request.op,'run');assert.equal(request.id,w.auto.id);
  await wait(300);await w.store.chiudiGiro(w.auto.id,'r-1',{esito:'finita',riassunto:'All good.'});
  assert.equal(await running,0);
  const result=JSON.parse(w.out.at(-1)!);assert.equal(result.outcome,'done');assert.equal(result.summary,'All good.');assert.equal(result.runId,'r-1');
  assert.equal(w.runtimes(),0,'no runtime of its own');
  assert.match(w.err.join(''),new RegExp(`Another TALOS process \\(pid ${process.pid}\\) is running the automations: ${w.auto.id} was handed to it`,'u'));
  host.release();
});

test('the host refuses the run: run says why in words and fails',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:20} as any);
  await playHost(host,async()=>({ok:false,code:'AUTOMATION_RUN_IN_PROGRESS'}));
  assert.equal(await running,1);
  const result=JSON.parse(w.out.at(-1)!);assert.equal(result.ok,false);assert.equal(result.code,'AUTOMATION_RUN_IN_PROGRESS');
  host.release();
});

/* the fifth review: a refusal is said in the code's English words, not the kernel's raw message */
test('a refusal with a code TALOS has words for is said in those words, not the raw message',async()=>{
  const w=await world('text');const host=createHostLease({dir:w.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:20} as any);
  await playHost(host,async()=>({ok:false,code:'AUTOMATION_STORE_READ_FAILED',erroreAvvio:'automation "x" could not be read (EPERM)'}));
  assert.equal(await running,1);
  assert.match(w.out.at(-1)!,/TALOS could not read that automation from the disk just now/u);
  assert.doesNotMatch(w.out.at(-1)!,/EPERM/u);
  host.release();
});

/* 0.6.7 (seventh review of 0.6.6, S4): a code TALOS has no words for printed the raw message, which can carry a path from the disk */
test('a refusal with a code TALOS has no words for says the error view\'s English, never the raw message; the JSON keeps it',async()=>{
  const raw='EPERM: operation not permitted, open \'C:\\Users\\someone\\AppData\\Local\\TALOS-CLI\\automations\\x.json\'';
  const text=await world('text');const host=createHostLease({dir:text.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(text.ctx,['run',text.auto.id],{pollMs:20} as any);
  await playHost(host,async()=>({ok:false,code:'EPERM',erroreAvvio:raw}));
  assert.equal(await running,1);
  assert.doesNotMatch(text.out.at(-1)!,/EPERM: operation not permitted|someone/u);
  assert.match(text.out.at(-1)!,/\S/u);
  host.release();
  const json=await world();const second=createHostLease({dir:json.leaseDir,role:'serve'});second.tryAcquire();
  const again=runAutomationCommand(json.ctx,['run',json.auto.id],{pollMs:20} as any);
  await playHost(second,async()=>({ok:false,code:'EPERM',erroreAvvio:raw}));
  assert.equal(await again,1);
  assert.equal(JSON.parse(json.out.at(-1)!).message,raw,'the raw message stays in the JSON');
  second.release();
});

/* the third review's F5: a request the host took but never answered (its answer removed while the asker was frozen) ends the wait */
test('a request taken and never answered ends with AUTOMATION_HOST_NOT_ANSWERING at the deadline',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:20,answerMs:400} as any);
  for(let i=0;i<100&&!host.take().length;i++)await wait(10);
  await assert.rejects(running,{code:'AUTOMATION_HOST_NOT_ANSWERING'});
  host.release();
});

test('the host leaves during the run: run reports it interrupted instead of waiting forever',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:20} as any);
  await playHost(host,async()=>{await w.store.apriGiro(w.auto.id,{runId:'r-2',sessionId:'s-2'});return{ok:true,runId:'r-2',sessionId:'s-2'};});
  host.release();
  assert.equal(await running,1);
  const result=JSON.parse(w.out.at(-1)!);assert.equal(result.outcome,'failed');assert.match(result.reason,/interrupted/u);
});

test('the host leaves before taking the request: run hosts itself (and lets the lease go when it fails)',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:20} as any);
  await wait(100);host.release();
  await assert.rejects(running,/hosting here/u);
  assert.equal(w.runtimes(),1);assert.equal(existsSync(join(w.leaseDir,'automation-host.json')),false,'released');
  assert.deepEqual(host.take(),[],'the request was withdrawn');
});

/* second review of 0.6.7: the wait between two looks did not listen to Ctrl+C, so a second Ctrl+C within it ended the process with
   the request still queued, and the host started the run later */
test('a Ctrl+C while the host has not answered withdraws the request at once, not after the next look',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'serve'});host.tryAcquire();
  const ctrlC=new AbortController();
  const running=runAutomationCommand(w.ctx,['run',w.auto.id],{pollMs:10_000,signal:ctrlC.signal} as any);
  await wait(200);
  const started=Date.now();ctrlC.abort();
  assert.equal(await running,1);
  assert.ok(Date.now()-started<2_000,`withdrawn without waiting for the next look (${Date.now()-started} ms)`);
  assert.deepEqual(host.take(),[],'the request was withdrawn');
  host.release();
});

test('serve --once under another host does not tick; serve waits and takes over when it leaves',async()=>{
  const w=await world();const host=createHostLease({dir:w.leaseDir,role:'run'});host.tryAcquire();
  await assert.rejects(()=>runAutomationCommand(w.ctx,['serve','--once'],{} as any),{code:'AUTOMATION_HOST_RUNNING'});
  assert.equal(w.runtimes(),0);
  const serving=runAutomationCommand(w.ctx,['serve'],{waitMs:20} as any);
  await wait(150);assert.equal(w.runtimes(),0,'still waiting');
  host.release();
  await assert.rejects(serving,/hosting here/u);
  assert.equal(w.runtimes(),1);
  assert.equal(w.err.filter(line=>/takes over when it stops/u.test(line)).length,1,'said once');
});

test('history and show in words: outcomes, reasons, the skipped run\'s detail and the mode',async()=>{
  const w=await world('text');
  await w.store.saltaGiro(w.auto.id,{motivo:'PROJECT_TRUST_REQUIRED',dettaglio:'The folder C:/x is not trusted, so the automation did not run there.'});
  await w.store.apriGiro(w.auto.id,{runId:'r-3',sessionId:'s-3'});await w.store.chiudiGiro(w.auto.id,'r-3',{esito:'fallita',motivo:'traffico'});
  await w.store.saltaGiro(w.auto.id,{motivo:'precedente-in-corso'});
  assert.equal(await runAutomationCommand(w.ctx,['history',w.auto.id],{} as any),0);
  const text=w.out.at(-1)!;
  assert.match(text,/skipped \(the previous run was still going\)/u);assert.match(text,/failed \(the provider's rate limit\)/u);
  assert.match(text,/skipped \([^)]*trust/iu);assert.match(text,/\n {2}The folder C:\/x is not trusted/u,'the detail is shown');
  assert.doesNotMatch(text,/saltata|fallita|traffico|precedente|PROJECT_TRUST_REQUIRED|\?  /u);
  assert.ok(!/^\?/mu.test(text),'every run has its time');
  assert.equal(await runAutomationCommand(w.ctx,['show',w.auto.id],{} as any),0);
  assert.match(w.out.at(-1)!,/mode Accept edits \(acceptEdits\)/u);
  w.ctx.invocation.outputFormat='json';
  assert.equal(await runAutomationCommand(w.ctx,['history',w.auto.id],{} as any),0);
  const runs=JSON.parse(w.out.at(-1)!).runs;
  assert.deepEqual(runs.map((r:any)=>r.outcome),['skipped','failed','skipped']);
  assert.equal(runs[1].raw.esito,'fallita','the store\'s own row stays under raw');
});

/*
 * R3 lane SP — owner decision Q-R3-8b: Ctrl+C on `talos -p` stops the run and still prints complete output: the run ends
 * as interrupted (v1: a failure with code INTERRUPTED; v2: outcome `cancelled`, envelope code INTERRUPTED), exit 130
 * (the code `exitCodeForEnvelope` already gives INTERRUPTED, errors.ts). Before R3 `-p` had no SIGINT handler at all
 * (gate §6.1), and the kernel's stop code `fermato` mapped to exit 70.
 * Precedent (window, gate §6.2): Hermes `-q` exits 130 on interrupt (`cli_single_query.py:148-167`), Gemini and Qwen
 * headless exit 130 (`FatalCancellationError`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {collectHeadlessSession} from '../../src/headless/run.ts';
import {exitCodeForResult} from '../../src/headless/result.ts';
import {exitCodeForV2Result} from '../../src/protocol/v2/codec.ts';

const tick=()=>new Promise(r=>setTimeout(r,5));
function runtime({answersCancel=true,completes=false}:{answersCancel?:boolean;completes?:boolean}={}){
  let sink:(e:any)=>void=()=>{};const calls={cancel:0};
  const r:any={
    subscribe(id:string,s:(e:any)=>void){sink=s;queueMicrotask(()=>s({type:'RunStarted',runId:'r1',threadId:id,input:{consegna:'long job'}}));return()=>{};},
    cancel:async()=>{calls.cancel++;if(answersCancel)queueMicrotask(()=>sink(completes?{type:'RunFinished',runId:'r1',result:{detto:'finished first'}}:{type:'RunError',runId:'r1',code:'fermato',message:'⛔ Fermato su richiesta.'}));},
    answerApproval:async()=>{},
  };
  return{r,calls};
}
const input={projectRoot:process.cwd(),model:'m',permissionMode:'default' as const};

test('R3-SP Q-R3-8b: v1 — Ctrl+C ends the run as INTERRUPTED with exit 130 and a closing event',async()=>{
  const abort=new AbortController();const f=runtime();
  const pending=collectHeadlessSession(f.r,'s1',{...input,signal:abort.signal} as any);
  await tick();abort.abort();
  const {events,result}=await pending;
  assert.equal(f.calls.cancel,1,'the run is cancelled in the runtime');
  assert.equal(result.ok,false);
  assert.equal(result.error?.code,'INTERRUPTED');
  assert.equal(exitCodeForResult(result),130);
  const last=events.at(-1)!;
  assert.equal(last.type,'run.failed');
  assert.equal(last.data.code,'INTERRUPTED');
});

test('R3-SP Q-R3-8b: v2 — outcome cancelled, envelope INTERRUPTED, exit 130, last event run.cancelled',async()=>{
  const abort=new AbortController();const f=runtime();
  const pending=collectHeadlessSession(f.r,'s1',{...input,protocolVersion:'v2',signal:abort.signal} as any);
  await tick();abort.abort();
  const {events,result}=await pending as any;
  assert.equal(result.outcome,'cancelled');
  assert.equal(result.error?.envelope?.code,'INTERRUPTED');
  assert.equal(exitCodeForV2Result(result),130);
  assert.equal(events.at(-1).type,'run.cancelled');
});

test('R3-SP Q-R3-8b: the run still ends when the kernel never answers the cancel (grace period)',async()=>{
  const abort=new AbortController();const f=runtime({answersCancel:false});
  const pending=collectHeadlessSession(f.r,'s1',{...input,signal:abort.signal,interruptGraceMs:20} as any);
  await tick();abort.abort();
  const {result}=await pending;
  assert.equal(result.error?.code,'INTERRUPTED');
  assert.equal(exitCodeForResult(result),130);
});

test('R3-SP Q-R3-8b: a run that finished before the stop took effect stays completed',async()=>{
  const abort=new AbortController();const f=runtime({completes:true});
  const pending=collectHeadlessSession(f.r,'s1',{...input,signal:abort.signal} as any);
  await tick();abort.abort();
  const {result}=await pending;
  assert.equal(result.ok,true);
  assert.equal(exitCodeForResult(result),0);
});

test('R3-SP Q-R3-8b: a signal already aborted before the run is collected cancels at once',async()=>{
  const abort=new AbortController();abort.abort();const f=runtime();
  const {result}=await collectHeadlessSession(f.r,'s1',{...input,signal:abort.signal} as any);
  assert.equal(f.calls.cancel,1);
  assert.equal(result.error?.code,'INTERRUPTED');
});

test('R3-SP Q-R3-8b: main wires Ctrl+C into `talos -p --json` (complete JSON, exit 130), in a private profile',async()=>{
  const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {main}=await import('../../src/main.ts');
  const home=await mkdtemp(join(tmpdir(),'talos-r3-sp-main-'));const project=join(home,'project');await (await import('node:fs/promises')).mkdir(project);
  const saved={APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,TALOS_CREDENTIAL_STORE:process.env.TALOS_CREDENTIAL_STORE,TALOS_TEST_PROFILE:process.env.TALOS_TEST_PROFILE};
  Object.assign(process.env,{APPDATA:join(home,'appdata'),LOCALAPPDATA:join(home,'local'),TALOS_CREDENTIAL_STORE:'memory',TALOS_TEST_PROFILE:'1'});
  try{
    let sink:(e:any)=>void=()=>{};let handler:(()=>void)|null=null;let released=0;
    const rt:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s'}],export:()=>({eventi:[]}),resume:async(id:string)=>id,fork:async()=>'',start:async()=>{throw new Error('must not start');},
      subscribe(_id:string,s:(e:any)=>void){sink=s;queueMicrotask(()=>s({type:'RunStarted',runId:'r1',threadId:'s'}));return()=>{};},
      answerApproval:async()=>{},cancel:async()=>{queueMicrotask(()=>sink({type:'RunError',runId:'r1',code:'fermato',message:'⛔ Fermato su richiesta.'}));},close:async()=>{}};
    const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:false,readStdin:async()=>''};
    const pending=main(['--project',project,'--resume','s','-p','continue','--json'],{io,createRuntime:async()=>rt,runTui:async()=>{},assertProjectTrusted:async()=>({}),onInterrupt:(h:()=>void)=>{handler=h;return()=>{released++;};}} as never);
    for(let i=0;i<200&&!handler;i++)await tick();
    assert.ok(handler,'main registered a Ctrl+C handler for the headless run');
    await tick();handler!();
    const code=await pending;
    assert.equal(code,130,`stdout: ${io.stdout}
stderr: ${io.stderr}`);
    const json=JSON.parse(io.stdout);
    assert.equal(json.ok,false);
    assert.equal(json.error.code,'INTERRUPTED');
    assert.equal(released,1,'the handler is removed when the run ends');
  }finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

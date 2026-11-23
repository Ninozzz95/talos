import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../src/main.ts';

const DECORATIVE=/\u001b\[|⠋|⠙|⠹|⠸|Provider picker|Keyboard|╭|╰|╲___╱/u;

function runtimeWithSink(){
  let resolveSubscription!:(value:(event:any)=>void)=>void;
  const whenSubscribed=new Promise<(event:any)=>void>(resolve=>{resolveSubscription=resolve;});
  const runtime:any={
    start:async()=> 's',restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>null,resume:async()=>'',fork:async()=>'',
    subscribe(_id:string,next:(event:any)=>void){resolveSubscription(next);return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
  };
  return{runtime,whenSubscribed};
}
function io(input='',stdinIsTTY=false,stdoutIsTTY=false){return{stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY,stdoutIsTTY,readStdin:async()=>input};}
// A headless run checkpoints --project before start; a fresh empty project keeps each fixture isolated.
const emptyProject=()=>mkdtemp(join(tmpdir(),'talos-e2e-isolation-'));
async function waitForSink(fixture:ReturnType<typeof runtimeWithSink>,pending:Promise<number>){
  return Promise.race([fixture.whenSubscribed,pending.then(code=>{throw new Error(`HEADLESS_ENDED_BEFORE_SUBSCRIBE:${code}`);})]);
}

async function runStreamJsonFixture(){
  const fixture=runtimeWithSink();const output=io();
  const pending=main(['--project',await emptyProject(),'-p','work','--output-format','stream-json'],{io:output,createRuntime:async()=>fixture.runtime,runTui:async()=>{throw new Error('TUI_MUST_NOT_LOAD');}} as any);
  const sink=await waitForSink(fixture,pending);sink({type:'TextMessageContent',messageId:'m',delta:'ok'});sink({type:'RunFinished'});
  assert.equal(await pending,0);return output.stdout;
}

test('stream-json contains only one JSON object per line and no interactive decoration',async()=>{
  const out=await runStreamJsonFixture();
  for(const line of out.trim().split('\n'))assert.doesNotThrow(()=>JSON.parse(line));
  assert.doesNotMatch(out,DECORATIVE);
});

test('json document is free of boot, spinner, overlay, and cursor-control output',async()=>{
  const fixture=runtimeWithSink();const output=io();
  const pending=main(['--project',await emptyProject(),'-p','work','--json'],{io:output,createRuntime:async()=>fixture.runtime,runTui:async()=>{throw new Error('TUI_MUST_NOT_LOAD');}} as any);
  const sink=await waitForSink(fixture,pending);sink({type:'TextMessageContent',messageId:'m',delta:'ok'});sink({type:'RunFinished'});
  assert.equal(await pending,0);assert.doesNotThrow(()=>JSON.parse(output.stdout));assert.doesNotMatch(output.stdout,DECORATIVE);
});

test('piped stdin/stdout force headless text execution and never load the TUI',async()=>{
  const fixture=runtimeWithSink();const output=io('piped work',false,false);let tuiLoads=0;
  const pending=main(['--project',await emptyProject()],{io:output,createRuntime:async()=>fixture.runtime,createRuntimeContext:async()=>{throw new Error('FULL_CONTEXT_MUST_NOT_LOAD');},runTui:async()=>{tuiLoads++;}} as any);
  const sink=await waitForSink(fixture,pending);sink({type:'TextMessageContent',messageId:'m',delta:'ok'});sink({type:'RunFinished'});
  assert.equal(await pending,0);assert.equal(tuiLoads,0);assert.match(output.stdout,/ok/u);assert.doesNotMatch(output.stdout,DECORATIVE);
});

test('REV-HEADLESS-SUBSCRIBE-SLOW: a valid delayed bootstrap still reaches the headless subscription',async()=>{
  const fixture=runtimeWithSink(),output=io();
  const originalSubscribe=fixture.runtime.subscribe;
  fixture.runtime.subscribe=(id:string,sink:(event:any)=>void)=>{
    const off=originalSubscribe(id,sink);
    queueMicrotask(()=>{sink({type:'TextMessageContent',messageId:'m',delta:'ready'});sink({type:'RunFinished'});});
    return off;
  };
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const pending=main(['--project',await emptyProject(),'-p','work','--output-format','stream-json'],{
    io:output,createRuntime:async()=>{await gate;return fixture.runtime;},runTui:async()=>{throw new Error('TUI_MUST_NOT_LOAD');},
  } as any);
  const waiting=waitForSink(fixture,pending).then(sink=>({sink,error:null as unknown}),error=>({sink:null,error}));
  await new Promise(resolve=>setTimeout(resolve,120));
  release();
  try{const result=await waiting;if(result.error)throw result.error;assert.ok(result.sink);assert.equal(await pending,0);assert.match(output.stdout,/ready/u);}
  finally{await pending;}
});

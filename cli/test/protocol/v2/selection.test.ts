import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCliArgs} from '../../../src/args.ts';
import {main} from '../../../src/main.ts';

test('M7-B leaves v1 as the default and makes v2 an explicit protocol selection',()=>{
  assert.equal(parseCliArgs(['-p','work','--json']).protocolVersion,'v1');
  assert.equal(parseCliArgs(['-p','work','--json','--protocol','v2']).protocolVersion,'v2');
  assert.throws(()=>parseCliArgs(['-p','work','--json','--protocol','v3']),/Invalid protocol/u);
  assert.throws(()=>parseCliArgs(['--protocol','v2']),/requires --json|stream-json/u);
  assert.throws(()=>parseCliArgs(['--protocol','v2','--json','project','status']),/only available for headless runs/u);
});

function runtimeWith(events:any[]){
  return{
    start:async()=> 'session-1',restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>null,
    resume:async()=> 'session-1',fork:async()=> 'session-1',
    subscribe(_id:string,sink:(event:any)=>void){queueMicrotask(()=>events.forEach(sink));return()=>{};},
    answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}
  } as any;
}
function io(){
  return{stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any;
}

test('M7-B v2 stream selection emits canonical v2 tool result and terminal events while default remains v1',async()=>{
  const events=[
    {type:'ToolCallResult',_sequenza:30,toolCallId:'tool-1',content:'done',receipt:{status:'succeeded',consentito:true,via:'rule',motivo:'allow',risk:'low',evidence:{exitCode:0,sandboxEnforcement:'restricted-process'}}},
    {type:'RunFinished',_sequenza:31}
  ];
  const v2io=io();
  assert.equal(await main(['-p','work','--output-format','stream-json','--protocol','v2'],{io:v2io,createRuntime:async()=>runtimeWith(events)} as any),0);
  const v2rows=v2io.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(v2rows.map((row:any)=>row.schema),['talos.cli.event.v2','talos.cli.event.v2']);
  assert.deepEqual(v2rows.map((row:any)=>row.type),['tool.completed','run.completed']);
  assert.deepEqual(v2rows[0].cursor,{sessionId:'session-1',sequence:30});

  const v1io=io();
  assert.equal(await main(['-p','work','--output-format','stream-json'],{io:v1io,createRuntime:async()=>runtimeWith(events)} as any),0);
  const v1rows=v1io.stdout.trim().split('\n').map(JSON.parse);
  assert.ok(v1rows.every((row:any)=>row.schema==='talos.cli.event.v1'));
  /* F-ENG-5 (owner 09/10/2026 «Tengo la cura nel v1»): v1 reports every tool's result too, in its own v1 shape. */
  assert.deepEqual(v1rows.map((row:any)=>row.type),['tool.completed','run.completed']);
  assert.deepEqual(v1rows[0].data,{toolCallId:'tool-1',content:'done',status:'completed',exitCode:0});
  assert.equal(v1rows[0].cursor,undefined,'the v2 cursor stays a v2 field');
});

test('M7-B v2 JSON result exposes typed tool results without changing v1 result schema',async()=>{
  const events=[
    {type:'TextMessageContent',_sequenza:40,messageId:'m',delta:'OK'},
    {type:'ToolCallResult',_sequenza:41,toolCallId:'tool-1',content:'done',receipt:{status:'succeeded',consentito:true,via:'rule',motivo:'allow',risk:'low',evidence:{exitCode:0,sandboxEnforcement:'restricted-process'}}},
    {type:'RunFinished',_sequenza:42}
  ];
  const v2io=io();
  assert.equal(await main(['-p','work','--json','--protocol','v2'],{io:v2io,createRuntime:async()=>runtimeWith(events)} as any),0);
  const v2=JSON.parse(v2io.stdout);
  assert.equal(v2.schema,'talos.cli.result.v2');
  assert.equal(v2.version,2);
  assert.equal(v2.result.text,'OK');
  assert.equal(v2.toolResults[0].toolCallId,'tool-1');
  assert.deepEqual(v2.cursor,{sessionId:'session-1',sequence:42});

  const v1io=io();
  assert.equal(await main(['-p','work','--json'],{io:v1io,createRuntime:async()=>runtimeWith(events)} as any),0);
  assert.equal(JSON.parse(v1io.stdout).schema,'talos.cli.result.v1');
});

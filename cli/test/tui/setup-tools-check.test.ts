/*
 * Stage 7.10d (owner 03/10 «strumenti a richiesta»): /setup's tools check is one throwaway turn that reads a file and runs
 * `pwd` — the only command it lets run; any other approval is refused. It passes when both completed; a failed or slow turn
 * says so; the session is stopped and deleted whatever happens, so it never shows in /resume.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runToolsCheck,TOOLS_CHECK_PROMPT} from '../../src/tui/setup-tools-check.ts';
import {v2} from './r1-layout-fixture.ts';

function fakeRuntime(script:(emit:(type:string,data:Record<string,unknown>)=>void)=>void){
  const calls:string[]=[];let sink:((event:unknown)=>void)|null=null;
  const runtime:any={
    start:async(input:any)=>{calls.push(`start ${input.permissionMode} ${input.model}`);assert.equal(input.prompt,TOOLS_CHECK_PROMPT());return 'tmp-1';},
    subscribe:(id:string,next:(event:unknown)=>void)=>{sink=next;queueMicrotask(()=>script((type,data)=>sink?.(v2(id,type,data))));return()=>{calls.push('unsubscribe');sink=null;};},
    answerApproval:async(_id:string,requestId:string,approved:boolean)=>{calls.push(`approve ${requestId} ${approved}`);},
    cancel:async(id:string)=>{calls.push(`cancel ${id}`);},
    deleteSession:async(id:string)=>{calls.push(`delete ${id}`);},
  };
  return{runtime,calls};
}
/* the kernel's canonical tool result (event-adapter.ts asToolResult) */
const ok={status:'completed',receipt:{status:null,allowed:null,via:null,reason:null,risk:null},enforcement:null};

test('a read and pwd completed: the check passes; pwd is approved, nothing else is; the session is deleted',async()=>{
  const {runtime,calls}=fakeRuntime(emit=>{
    emit('run.started',{runId:'r1'});
    emit('tool.started',{toolCallId:'a',toolName:'leggi'});emit('tool.completed',{toolCallId:'a',content:'# demo',...ok});
    emit('tool.started',{toolCallId:'b',toolName:'shell'});
    emit('approval.required',{requestId:'q1',azione:{tipo:'comando',comando:'rm -rf .'}});
    emit('approval.required',{requestId:'q2',azione:{tipo:'comando',comando:'pwd'}});
    emit('tool.completed',{toolCallId:'b',content:'C:/p',...ok});
    emit('run.completed',{});
  });
  const result=await runToolsCheck({runtime,projectRoot:'C:/p',model:'openai:gpt-6'});
  assert.deepEqual(result,{ok:true,read:true,command:true});
  assert.deepEqual(calls,['start default openai:gpt-6','approve q1 false','approve q2 true','unsubscribe','cancel tmp-1','delete tmp-1']);
});

test('a turn that ends without the command, or fails, or takes too long, is not a pass; the session goes anyway',async()=>{
  const half=fakeRuntime(emit=>{emit('tool.started',{toolCallId:'a',toolName:'elenca'});emit('tool.completed',{toolCallId:'a',content:'x',...ok});emit('run.completed',{});});
  assert.deepEqual(await runToolsCheck({runtime:half.runtime,projectRoot:'p',model:'m'}),{ok:false,read:true,command:false});
  const failed=fakeRuntime(emit=>{emit('run.failed',{message:'The provider refused the request.'});});
  const r=await runToolsCheck({runtime:failed.runtime,projectRoot:'p',model:'m'});
  assert.equal(r.ok,false);assert.equal(r.reason,'failed');assert.match(String(r.message),/refused/u);
  const slow=fakeRuntime(()=>{});
  assert.deepEqual(await runToolsCheck({runtime:slow.runtime,projectRoot:'p',model:'m',timeoutMs:50}),{ok:false,read:false,command:false,reason:'timeout'});
  assert.ok(slow.calls.includes('delete tmp-1')&&slow.calls.includes('cancel tmp-1'));
  const failedTool=fakeRuntime(emit=>{emit('tool.started',{toolCallId:'a',toolName:'leggi'});emit('tool.completed',{toolCallId:'a',content:'no',status:'failed',receipt:{status:null,allowed:null,via:null,reason:null,risk:null},enforcement:null});emit('run.completed',{});});
  assert.equal((await runToolsCheck({runtime:failedTool.runtime,projectRoot:'p',model:'m'})).read,false,'a read that failed is not a read');
  const abort=new AbortController();const stopped=fakeRuntime(()=>{queueMicrotask(()=>abort.abort());});
  assert.equal((await runToolsCheck({runtime:stopped.runtime,projectRoot:'p',model:'m',signal:abort.signal})).reason,'stopped');
});

/*
 * Stage 3, MCP elicitation, CLI side (owner 02/10: kernel patch first, then the CLI; mockup step-17). The kernel's
 * `McpElicitationRequested` / `McpElicitationResolved` become v2 `elicitation.required` / `elicitation.resolved` (the
 * domain in English, `da`/`motivo` as for the questions); the person's answer reaches the kernel's `rispondiElicitazioneMcp`
 * as the MCP response ({action, content?}); a refusal keeps the kernel's code; the deferred context and the supervisor
 * forward it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

const clock=()=>'2026-10-02T19:00:00.000Z';
const FORM={type:'McpElicitationRequested',requestId:'e-1',server:'github',mode:'form',message:'Details for the pull request',
  requestedSchema:{type:'object',required:['title'],properties:{title:{type:'string'},draft:{type:'boolean'}}},at:'t'};

test('a server\'s request and its close become v2 events, durable, in English',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  const form=bridge.translate(FORM);
  assert.equal(form?.type,'elicitation.required');assert.equal(form?.durability,'durable');
  assert.deepEqual(form?.data,{requestId:'e-1',server:'github',mode:'form',message:'Details for the pull request',requestedSchema:FORM.requestedSchema,at:'t'});
  const url=bridge.translate({type:'McpElicitationRequested',requestId:'e-2',server:'linear',mode:'url',message:'Sign in',url:'https://linear.app/oauth',dominio:'linear.app',elicitationId:'x'});
  assert.deepEqual(url?.data,{requestId:'e-2',server:'linear',mode:'url',message:'Sign in',url:'https://linear.app/oauth',domain:'linear.app',elicitationId:'x'});
  assert.deepEqual(bridge.translate({type:'McpElicitationResolved',requestId:'e-1',action:'accept',da:'persona',at:'t'})?.data,{requestId:'e-1',action:'accept',by:'person',at:'t'});
  assert.deepEqual(bridge.translate({type:'McpElicitationResolved',requestId:'e-2',action:'cancel',da:'sistema',motivo:'fermato'})?.data,{requestId:'e-2',action:'cancel',by:'system',reason:'stopped'});
});

test('the answer reaches the kernel as the MCP response; a refusal keeps the kernel\'s code; no method says so',async()=>{
  const calls:any[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},rispondiElicitazioneMcp:async(...a:any[])=>{calls.push(a);return a[2].action==='decline'?{erroreAvvio:'no',code:'ELICITATION_NOT_PENDING'}:{ok:true};}};
  const runtime=createSessionFacade(registry,{model:'m'});
  await runtime.answerElicitation('s-1','e-1',{action:'accept',content:{title:'Fix'}});
  await assert.rejects(runtime.answerElicitation('s-1','e-1',{action:'decline'}),(e:any)=>e?.code==='ELICITATION_NOT_PENDING');
  assert.deepEqual(calls[0],['s-1','e-1',{action:'accept',content:{title:'Fix'}}]);
  const bare=createSessionFacade({avviaLibero(){return{sessionId:'s'};},iscriviti(){return()=>{};}} as any,{model:'m'});
  await assert.rejects(bare.answerElicitation('s','e',{action:'cancel'}),(e:any)=>e?.code==='REGISTRY_METHOD_UNAVAILABLE');
});

test('before the kernel is up the answer waits; the supervisor forwards it',async()=>{
  let release!:(value:any)=>void;const pending=new Promise<any>(r=>{release=r;});const calls:any[]=[];
  const deferred=createDeferredRuntimeContext(pending as any,{});
  const answered=deferred.runtime.answerElicitation('s-1','e-1',{action:'cancel'});
  release({runtime:{answerElicitation:async(...a:any[])=>{calls.push(a);}},catalog:{},registry:{}});
  await answered;
  assert.deepEqual(calls,[['s-1','e-1',{action:'cancel'}]]);
  const forwarded:any[]=[];
  const supervisor=createRuntimeSupervisor({initialRuntime:{answerElicitation:async(...a:any[])=>{forwarded.push(a);}} as any,runtimeFactory:()=>({}) as any});
  await supervisor.answerElicitation('s-2','e-2',{action:'decline'});
  assert.deepEqual(forwarded,[['s-2','e-2',{action:'decline'}]]);
});

/*
 * Stage 3, the answer path (registro 12: Codex reply to item/tool/requestUserInput, ACP elicitation response, Claude Agent
 * SDK updatedInput.answers). The TUI answers the model's questions through the runtime, as it answers approvals: the
 * facade hands the kernel's `rispondiDomanda` exactly `{requestId, ...response}` (contract user-question-contract.mjs), a
 * refusal becomes a CliRuntimeError with the kernel's code, and before the kernel is up (composer first, startup stage)
 * the deferred context holds the answer and delivers it once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';

function facade(rispondiDomanda?:(...args:any[])=>any){
  const calls:any[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},...(rispondiDomanda?{rispondiDomanda:async(...args:any[])=>{calls.push(args);return rispondiDomanda(...args);}}:{})};
  return{runtime:createSessionFacade(registry,{model:'m'}),calls};
}

test('the answer reaches the kernel as the contract states it',async()=>{
  const {runtime,calls}=facade(()=>({ok:true}));
  await runtime.answerQuestion('s-1','q-1',{status:'answered',answers:{fix:'Wait'},skipped:['verify'],notes:{fix:'small'}});
  await runtime.answerQuestion('s-1','q-2',{status:'cancelled'});
  assert.deepEqual(calls,[
    ['s-1','q-1',{requestId:'q-1',status:'answered',answers:{fix:'Wait'},skipped:['verify'],notes:{fix:'small'}}],
    ['s-1','q-2',{requestId:'q-2',status:'cancelled'}],
  ]);
});

test('a refusal from the kernel is an error with the kernel\'s own code',async()=>{
  const {runtime}=facade(()=>({erroreAvvio:'Questa domanda non è più in attesa',code:'QUESTION_NOT_PENDING'}));
  await assert.rejects(runtime.answerQuestion('s-1','q-1',{status:'skipped'}),(error:any)=>error?.code==='QUESTION_NOT_PENDING');
});

test('a kernel without the method says so, never a silent no-op',async()=>{
  const {runtime}=facade();
  await assert.rejects(runtime.answerQuestion('s-1','q-1',{status:'skipped'}),(error:any)=>error?.code==='REGISTRY_METHOD_UNAVAILABLE');
});

test('before the kernel is up the answer waits, then reaches it once',async()=>{
  let release!:(value:any)=>void;
  const pending=new Promise<any>(resolve=>{release=resolve;});
  const calls:any[]=[];
  const deferred=createDeferredRuntimeContext(pending as any,{});
  const answered=deferred.runtime.answerQuestion('s-1','q-1',{status:'expired'});
  release({runtime:{answerQuestion:async(...args:any[])=>{calls.push(args);}},catalog:{},registry:{}});
  await answered;
  assert.deepEqual(calls,[['s-1','q-1',{status:'expired'}]]);
});

/*
 * Stage 7.5 (owner 03/10, «Tutto, lato CLI»; mockup /resume «d delete», «Press d again to delete»): deleting a conversation
 * is the kernel's own `elimina` (session-registry.mjs: refuses a session still running, removes its journal and output). The
 * CLI only passes it through; a refusal is an error with the kernel's code; a kernel without it says so.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

function facade(elimina?:(id:string)=>any){
  const calls:string[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},...(elimina?{elimina:async(id:string)=>{calls.push(id);return elimina(id);}}:{})};
  return{runtime:createSessionFacade(registry,{model:'m'}),calls};
}

test('the kernel deletes the session; its refusals keep their codes',async()=>{
  const {runtime,calls}=facade(id=>id==='busy'?{erroreAvvio:'Sessione ancora in corso — fermala prima di eliminarla',code:'SESSION_STILL_RUNNING'}:id==='gone'?{erroreAvvio:'Sessione non trovata',code:'NOT_FOUND'}:{ok:true});
  await runtime.deleteSession!('s-2');
  assert.deepEqual(calls,['s-2']);
  await assert.rejects(runtime.deleteSession!('busy'),{code:'SESSION_STILL_RUNNING'});
  await assert.rejects(runtime.deleteSession!('gone'),{code:'NOT_FOUND'});
});

test('an answer that is not «ok» is not a deletion; a kernel without elimina says so',async()=>{
  await assert.rejects(facade(()=>undefined).runtime.deleteSession!('s-2'),{code:'SESSION_DELETE_FAILED'});
  await assert.rejects(facade().runtime.deleteSession!('s-2'),{code:'SESSION_DELETE_UNAVAILABLE'});
});

test('the supervisor and the deferred context pass it through',async()=>{
  const {runtime,calls}=facade(()=>({ok:true}));
  const supervisor=createRuntimeSupervisor({initialRuntime:runtime,runtimeFactory:()=>({}) as any});
  await supervisor.deleteSession!('s-3');
  const deferred=createDeferredRuntimeContext(Promise.resolve({runtime:supervisor,catalog:{},registry:{}}) as any,{});
  await deferred.runtime.deleteSession!('s-4');
  assert.deepEqual(calls,['s-3','s-4']);
  /* a runtime without it (an older kernel behind the supervisor) says so instead of doing nothing */
  const bare=createRuntimeSupervisor({initialRuntime:{} as any,runtimeFactory:()=>({}) as any});
  await assert.rejects(bare.deleteSession!('s-5'),{code:'SESSION_DELETE_UNAVAILABLE'});
});

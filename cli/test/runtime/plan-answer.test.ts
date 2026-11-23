/*
 * Stage 3, the plan card (owner 02/10, registro 12). The person's choice on a proposed plan reaches the kernel's
 * `rispondiPiano` in the kernel's own shape (plan-contract.mjs `validaDecisionePiano`: requestId, decisione, hash, feedback),
 * translated from the CLI's English decisions only here. A refusal (PLAN_STALE, PLAN_NOT_PENDING…) is an error with the
 * kernel's code; a kernel without the method says so; before the kernel is up the choice waits and reaches it once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

const HASH='sha256:'+'b'.repeat(64);
function facade(rispondiPiano?:(...args:any[])=>any){
  const calls:any[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},elenca:()=>[],async aggiornaImpostazioni(){return{ok:true};},...(rispondiPiano?{rispondiPiano:async(...args:any[])=>{calls.push(args);return rispondiPiano(...args);}}:{})};
  return{runtime:createSessionFacade(registry,{model:'m'}),calls};
}

test('each decision reaches the kernel in its own words, with the hash of the plan on screen',async()=>{
  const {runtime,calls}=facade(()=>({ok:true}));
  await runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'ask-before-edits'});
  await runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'accept-edits'});
  await runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'clean-conversation'});
  await runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'keep-planning',feedback:'smaller steps'});
  await runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'keep-planning'});
  assert.deepEqual(calls,[
    ['s-1',{requestId:'r-1',hash:HASH,decisione:'procedi-con-conferma'}],
    ['s-1',{requestId:'r-1',hash:HASH,decisione:'procedi-accetta-modifiche'}],
    ['s-1',{requestId:'r-1',hash:HASH,decisione:'conversazione-pulita'}],
    ['s-1',{requestId:'r-1',hash:HASH,decisione:'continua-a-pianificare',feedback:'smaller steps'}],
    ['s-1',{requestId:'r-1',hash:HASH,decisione:'continua-a-pianificare'}],
  ]);
});

test('a refusal from the kernel is an error with the kernel\'s own code',async()=>{
  const {runtime}=facade(()=>({erroreAvvio:'Il piano a schermo non è più l’ultimo',code:'PLAN_STALE'}));
  await assert.rejects(runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'ask-before-edits'}),(error:any)=>error?.code==='PLAN_STALE');
});

test('an unknown decision never reaches the kernel',async()=>{
  const {runtime,calls}=facade(()=>({ok:true}));
  await assert.rejects(runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'yolo' as any}),(error:any)=>error?.code==='PLAN_DECISION_INVALID');
  assert.deepEqual(calls,[]);
});

test('a kernel without the method says so, never a silent no-op',async()=>{
  const {runtime}=facade();
  await assert.rejects(runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'ask-before-edits'}),(error:any)=>error?.code==='REGISTRY_METHOD_UNAVAILABLE');
});

test('before the kernel is up the choice waits, then reaches it once; the supervisor forwards it',async()=>{
  let release!:(value:any)=>void;
  const pending=new Promise<any>(resolve=>{release=resolve;});
  const calls:any[]=[];
  const deferred=createDeferredRuntimeContext(pending as any,{});
  const answered=deferred.runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'keep-planning'});
  release({runtime:{answerPlan:async(...args:any[])=>{calls.push(args);}},catalog:{},registry:{}});
  await answered;
  assert.deepEqual(calls,[['s-1',{requestId:'r-1',hash:HASH,decision:'keep-planning'}]]);
  const forwarded:any[]=[];
  const supervisor=createRuntimeSupervisor({initialRuntime:{answerPlan:async(...args:any[])=>{forwarded.push(args);}} as any,runtimeFactory:()=>({}) as any});
  await supervisor.answerPlan('s-2',{requestId:'r-2',hash:HASH,decision:'accept-edits'});
  assert.deepEqual(forwarded,[['s-2',{requestId:'r-2',hash:HASH,decision:'accept-edits'}]]);
});

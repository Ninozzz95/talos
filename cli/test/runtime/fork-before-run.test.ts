/*
 * Stage 7.6/7.8 (owner 03/10 «taglio prima + messaggio nel composer»; desktop 88c68695c): a fork that starts just before an
 * earlier turn is the kernel's `forka(id,{primaDelGiro})`. It starts nothing; it answers the new session and the cut it made
 * (`taglio`: the turn, the person's message, its images). The CLI offers it only when the kernel says it can
 * (`capacita.forkPrimaDelGiro`); a refusal keeps the kernel's code; an answer without `taglio` is not a cut.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

function facade(forka?:(...args:any[])=>any,capacita?:Record<string,unknown>){
  const calls:any[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},...(capacita?{capacita}:{}),...(forka?{forka:(...args:any[])=>{calls.push(args);return forka(...args);}}:{})};
  return{runtime:createSessionFacade(registry,{model:'m'}),calls};
}

test('the kernel cuts before the turn; the new session and the message come back',async()=>{
  const {runtime,calls}=facade(()=>({sessionId:'s-cut',taglio:{primaDelGiro:'r2',messaggio:'fix the login test',allegati:[{tipo:'immagine',nome:'a.png'}]}}),{forkPrimaDelGiro:true});
  assert.deepEqual(runtime.capabilities!(),{forkBeforeRun:true,modelCheck:false});
  assert.deepEqual(await runtime.forkBeforeRun!('s-1','r2'),{sessionId:'s-cut',message:'fix the login test',attachments:[{tipo:'immagine',nome:'a.png'}]});
  assert.deepEqual(calls,[['s-1',{primaDelGiro:'r2',senzaInterfacciaNelGiro:false}]],'0.6.8: the per-turn «nobody in front» sign travels with the fork');
});

test('a refusal keeps its code; an answer without the cut is not one; a kernel without the capability says so',async()=>{
  await assert.rejects(facade(()=>({erroreAvvio:'The cut falls inside a summary.',code:'FORK_POINT_COMPACTED',motivo:'compattazione-manuale'}),{forkPrimaDelGiro:true}).runtime.forkBeforeRun!('s-1','r1'),{code:'FORK_POINT_COMPACTED'});
  await assert.rejects(facade(()=>({sessionId:'s-x'}),{forkPrimaDelGiro:true}).runtime.forkBeforeRun!('s-1','r1'),{code:'FORK_CUT_UNCONFIRMED'});
  const old=facade(()=>({sessionId:'s-x'}));
  assert.deepEqual(old.runtime.capabilities!(),{forkBeforeRun:false,modelCheck:false});
  await assert.rejects(old.runtime.forkBeforeRun!('s-1','r1'),{code:'FORK_CUT_UNAVAILABLE'});
  assert.deepEqual(old.calls,[],'nothing is asked of a kernel that cannot');
});

test('the supervisor and the deferred context pass it through',async()=>{
  const {runtime,calls}=facade(()=>({sessionId:'s-cut',taglio:{primaDelGiro:'r1',messaggio:'hi'}}),{forkPrimaDelGiro:true});
  const supervisor=createRuntimeSupervisor({initialRuntime:runtime,runtimeFactory:()=>({}) as any});
  assert.deepEqual(supervisor.capabilities!(),{forkBeforeRun:true,modelCheck:false});
  assert.equal((await supervisor.forkBeforeRun!('s-1','r1')).sessionId,'s-cut');
  const deferred=createDeferredRuntimeContext(Promise.resolve({runtime:supervisor,catalog:{},registry:{}}) as any,{});
  assert.equal((await deferred.runtime.forkBeforeRun!('s-1','r1')).message,'hi');
  assert.deepEqual(deferred.runtime.capabilities!(),{forkBeforeRun:true,modelCheck:false},'once the runtime is up, its own answer');
  const waiting=createDeferredRuntimeContext(new Promise(()=>{}) as any,{});
  assert.deepEqual(waiting.runtime.capabilities!(),{forkBeforeRun:false,modelCheck:false},'before the runtime is up nothing is promised');
  assert.equal(calls.length,2);
});

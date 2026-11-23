/*
 * Stage 7.10d (owner 03/10 «chiave + 1 token sempre»; asked of the desktop the same day): /setup's «Model answers» is the
 * kernel's `provaModello(model)` — one token from the chosen model, nothing kept. The CLI asks only when the kernel says it
 * can (`capacita.provaModello`); an answer says how soon the first token came; a refusal keeps its code and words.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

function facade(prova?:(model:string)=>any,capacita?:Record<string,unknown>){
  const calls:string[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},...(capacita?{capacita}:{}),...(prova?{provaModello:(model:string)=>{calls.push(model);return prova(model);}}:{})};
  return{runtime:createSessionFacade(registry,{model:'m'}),calls};
}

test('one token from the model: how soon it came; a refusal keeps its code and words',async()=>{
  const ok=facade(()=>({esito:'risponde',millisecondiPrimoToken:812,millisecondi:950}),{provaModello:true});
  assert.deepEqual(ok.runtime.capabilities!(),{forkBeforeRun:false,modelCheck:true});
  assert.deepEqual(await ok.runtime.checkModel!('openai:gpt-6'),{answers:true,firstTokenMs:812,ms:950});
  assert.deepEqual(ok.calls,['openai:gpt-6']);
  const no=facade(()=>({esito:'rifiutato',codice:'MODEL_NOT_FOUND',motivo:'No such model.',millisecondi:120}),{provaModello:true});
  assert.deepEqual(await no.runtime.checkModel!('x'),{answers:false,firstTokenMs:null,ms:120,code:'MODEL_NOT_FOUND',reason:'No such model.'});
  const odd=facade(()=>({esito:'risponde',millisecondiPrimoToken:'soon'}),{provaModello:true});
  assert.deepEqual(await odd.runtime.checkModel!('x'),{answers:true,firstTokenMs:null,ms:null},'a time that is not a number is not shown');
});

test('a kernel without the capability is not asked; the supervisor and the deferred context pass it through',async()=>{
  const old=facade(()=>({esito:'risponde'}));
  await assert.rejects(old.runtime.checkModel!('x'),{code:'MODEL_CHECK_UNAVAILABLE'});
  assert.deepEqual(old.calls,[]);
  const {runtime,calls}=facade(()=>({esito:'risponde',millisecondiPrimoToken:500}),{provaModello:true});
  const supervisor=createRuntimeSupervisor({initialRuntime:runtime,runtimeFactory:()=>({}) as any});
  assert.equal((await supervisor.checkModel!('a')).firstTokenMs,500);
  const deferred=createDeferredRuntimeContext(Promise.resolve({runtime:supervisor,catalog:{},registry:{}}) as any,{});
  assert.equal((await deferred.runtime.checkModel!('b')).answers,true);
  assert.deepEqual(createDeferredRuntimeContext(new Promise(()=>{}) as any,{}).runtime.capabilities!(),{forkBeforeRun:false,modelCheck:false});
  assert.deepEqual(calls,['a','b']);
});

/*
 * Review 3 of 0.6.13 (S4, 22/10/2026): the runtime's last close calls the registry's own close, bounded, so a summary still on its
 * way after the exit's wait is stopped and the registry's writes are flushed; a replacement's close does not (the conversation goes
 * on), and a registry close that fails or has nothing to say never stops TALOS from ending.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function registryWith(chiudi?:(options:unknown)=>Promise<unknown>){
  const calls:unknown[]=[];let contextClosed=0;
  const registry:any={avviaLibero(){return{sessionId:'s'};},iscriviti(){return()=>{};},elenca(){return[];},chiudiContesto:async()=>{contextClosed++;}};
  if(chiudi)registry.chiudi=async(options:unknown)=>{calls.push(options);return chiudi(options);};
  return{registry,calls,contextClosed:()=>contextClosed};
}

test('the last close calls the registry\'s close, bounded at two seconds, then closes the context',async()=>{
  const {registry,calls,contextClosed}=registryWith(async()=>({scaduta:false}));
  await createSessionFacade(registry,{model:'m'}).close();
  assert.deepEqual(calls,[{attesaMassimaMs:2_000}]);
  assert.equal(contextClosed(),1);
});

test('a replacement\'s close leaves the registry open',async()=>{
  const {registry,calls,contextClosed}=registryWith(async()=>({scaduta:false}));
  await createSessionFacade(registry,{model:'m'}).close({replacing:true});
  assert.deepEqual(calls,[]);
  assert.equal(contextClosed(),1);
});

test('a registry close that throws, or a registry without one, still lets the runtime close',async()=>{
  const failing=registryWith(async()=>{throw new Error('flush failed');});
  await createSessionFacade(failing.registry,{model:'m'}).close();
  assert.equal(failing.calls.length,1);assert.equal(failing.contextClosed(),1);
  const none=registryWith();
  await createSessionFacade(none.registry,{model:'m'}).close();
  assert.equal(none.contextClosed(),1);
});

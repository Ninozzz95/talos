/*
 * Adversarial review of 0.6.0 (bugfixer, 13/10/2026), the class of the defect that escaped: the real screen never receives the
 * catalog and the runtime the composition builds. `main.ts` hands it the stand-ins of `runtime/deferred-context.ts`, written
 * member by member, and behind them the supervisor of `runtime/supervisor.ts`, written member by member too. A member added to
 * the real object and not to its stand-in is `undefined` on the built CLI while every in-process test (which mounts the app on
 * the real object, or on a fake that has the member) stays green: `catalog.chatgpt` in 0.6.0.
 *
 * These tests do not name the members. They build the REAL objects and ask that everything they carry is carried by what the
 * screen gets, so the next member that is added and forgotten is red here, on the day it is added.
 *
 * ⛔ RED on 13/10/2026 (first test): `providerState` and `refreshProviderState` (C1R, 5f3a13f3a of 07/10/2026) are on the real
 *   catalog and were never put on the stand-in (54916710e of 02/10/2026). `tui/app.ts` reads both behind `typeof … ==='function'`
 *   (the status row's «<provider>: verified / not verified» badge and its one background check), so on the real program the badge
 *   has never been drawn and the check has never run, since 0.5.0. test/tui/provider-state-boot.test.ts and
 *   provider-state-c1r.test.ts are green because they hand the app a catalog that has the two members.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createTuiCatalogService} from '../../src/tui/catalog-service.ts';

/** The catalog exactly as `composeTalosRuntime` builds it: every optional door given, so every optional member is there. */
function realCatalog(){
  const plan:any={available:true,stored:()=>false,signedIn:()=>({connected:false,planEnabled:false}),load:async()=>null,loaded:()=>null,onSignedOut(){},signOut:async()=>null,kernelFacade:null};
  return createTuiCatalogService({
    publicProviders:()=>[],registry:{},runtimeFor:()=>({}),keyFor:()=>null,setKey(){},clearKey(){},
    createProbe:()=>({prova:async()=>({}),elencaModelli:async()=>({})}),persistModel:async()=>{},
    openRouterLogin:async()=>{throw new Error('not asked here');},chatgpt:plan,
  });
}
const members=(value:object)=>Object.keys(value).sort();
/* Nothing is left out any more: the status row's provider badge (finding F3) is carried since the version after 0.6.1, with its
   acceptance scenario (s63). Nothing may be added here. */
const NOT_ON_THE_SCREEN=new Set<string>();
const never=()=>new Promise<any>(()=>{/* the kernel is not loaded: the stand-ins are what the first frame has */});

test('the catalog the screen receives carries every member of the real catalog',()=>{
  const real=realCatalog();const standIn=createDeferredRuntimeContext(never()).catalog;
  const missing=members(real).filter(name=>!(name in standIn)&&!NOT_ON_THE_SCREEN.has(name));
  assert.deepEqual(missing,[],`on the real screen these are undefined, whatever the in-process tests say: ${missing.join(', ')}`);
  for(const name of members(real)){
    const value=(real as any)[name];
    if(NOT_ON_THE_SCREEN.has(name)){assert.equal(name in standIn,false,`${name} is now on the stand-in: take it out of NOT_ON_THE_SCREEN and give the badge its acceptance scenario`);continue;}
    if(typeof value==='function')assert.equal(typeof (standIn as any)[name],'function',`${name} is a function on the real catalog`);
    /* a member that is an object of functions (the ChatGPT plan): each of its doors too */
    else if(value&&typeof value==='object'){
      const lost=members(value).filter(inner=>typeof (standIn as any)[name]?.[inner]!==typeof value[inner]);
      assert.deepEqual(lost,[],`${name}: ${lost.join(', ')}`);
    }
  }
});

/* Green on 13/10/2026 by reading and by this measure; kept with the red one because it is the same class one layer down: the
   facade is what the composition builds, the supervisor wraps it (create-runtime.ts), the stand-in wraps the supervisor (main.ts). */
test('the runtime the screen receives carries every member of the session facade, through the supervisor',()=>{
  const registry:any={avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},rispondiApprovazione:async()=>({}),ferma:async()=>true};
  const facade=createSessionFacade(registry,{model:'ollama:any'});
  const supervised=createRuntimeSupervisor({initialRuntime:facade,runtimeFactory:()=>facade,journal:null});
  const standIn=createDeferredRuntimeContext(never()).runtime;
  const lostBySupervisor=members(facade).filter(name=>typeof (supervised as any)[name]!==typeof (facade as any)[name]);
  assert.deepEqual(lostBySupervisor,[],`the supervisor does not carry: ${lostBySupervisor.join(', ')}`);
  const lostByStandIn=members(supervised).filter(name=>name!=='modelCheckpoints'&&typeof (standIn as any)[name]!==typeof (supervised as any)[name]);
  assert.deepEqual(lostByStandIn,[],`the stand-in does not carry: ${lostByStandIn.join(', ')}`);
  assert.ok('modelCheckpoints' in standIn,'the checkpoint owner is read through the stand-in (undefined until the kernel is loaded)');
});

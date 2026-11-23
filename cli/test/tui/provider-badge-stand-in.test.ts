/*
 * Review of 0.6.2 (bugfixer, 13/10/2026). The status row's provider badge reached the real screen in 0.6.2, and every test of it
 * mounted the app on a catalog that answers at once. The real program hands the app the STAND-IN catalog
 * (`createDeferredRuntimeContext`, runtime/deferred-context.ts), whose `providerState` is `null` until the kernel is loaded and whose
 * check waits behind the kernel. These mount the app on that stand-in, in process:
 *   S1  «checking…» from a null report, then the real answer once the pending context resolves;
 *   S2  nothing left on the row after the give-up, when the context never resolves;
 *   S3  a key change the catalog announces makes the screen read the row again AND check again (B2; RED before the cure);
 *   S4  after provider A → B → A, the give-up timer of the first check of A does not take the later check's «checking…» away
 *       (RED before the cure).
 * The duration of «checking…» is injected (`providerCheckingShownMs`): nothing here waits the product's four seconds.
 * Mocks only: no kernel, no network, no key.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {hermeticProfile,mountApp,sleep} from './r1-layout-fixture.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';

function paths(root:string){return{dataRoot:join(root,'data'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),stateRoot:join(root,'state')};}
const provider=(id:string)=>({id,label:id,description:'',configured:true,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'cloud',keySource:'saved',environmentVariable:null,benched:null});
const model=(id:string)=>({id,provider:id.split(':')[0],name:id.split(':')[1],reasoning:false});
const BADGE=/openai: (?:checking…|verified|not verified)/u;
const verifiedReport=(id:string)=>({id,state:'available' as const,verified:true,checkedAt:Date.now(),ageMs:1,fresh:true});
const unverifiedReport=(id:string)=>({id,state:'unverified' as const,verified:null,checkedAt:Date.now(),ageMs:1,fresh:true});
/** What the kernel's catalog is once loaded, reduced to what the screen asks of it here. */
function loadedCatalog(overrides:Record<string,unknown>={}):any{
  return{
    chosenProvider:async()=>'openai',chooseProvider:async()=>{},
    listProviders:async()=>[provider('openai')],
    listModels:async()=>[model('openai:gpt-5-mini')],
    providerModels:async()=>({provider:'openai',label:'OpenAI',rows:[model('openai:gpt-5-mini')],verified:true,notice:'',listing:'live'}),
    readiness:async()=>({ready:true}),selectModel:async()=>{},keyTestNotice:()=>null,
    probeProvider:async(id:string)=>({provider:id,state:'available',detail:'',latencyMs:1,remediation:null,readinessCode:null}),
    providerState:(id:string)=>verifiedReport(id),
    refreshProviderState:async(id:string)=>verifiedReport(id),
    ...overrides,
  };
}
function folder(t:import('node:test').TestContext){
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-badge-stand-in-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}

test('S1: on the stand-in catalog the row says «checking…» while the kernel loads, then what the check answers',async t=>{
  const root=folder(t);
  let load!:(context:any)=>void;const pending=new Promise<any>(resolve=>{load=resolve;});
  const deferred=createDeferredRuntimeContext(pending);
  assert.equal(deferred.catalog.providerState!('openai'),null,'the stand-in has nothing to read before the kernel');
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:deferred.catalog,startup:deferred.prepared,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  try{
    const before=await app.waitFor('the row to say it is checking',s=>/openai: checking…/u.test(s.text));
    assert.doesNotMatch(before.text,/openai: (?:verified|not verified)/u,`nothing is claimed before the check:\n${before.text}`);
    let refreshed=0;
    load({runtime:{},tuiCatalog:loadedCatalog({refreshProviderState:async(id:string)=>{refreshed+=1;return verifiedReport(id);}})});
    const after=await app.waitFor('the real answer',s=>/openai: verified/u.test(s.text));
    assert.doesNotMatch(after.text,/checking…/u);
    assert.equal(refreshed,1,'the one check, made when the kernel was there');
  }finally{app.unmount();}
});

test('S2: when the kernel never loads, «checking…» goes away after its time and the row claims nothing',async t=>{
  const root=folder(t);
  const deferred=createDeferredRuntimeContext(new Promise<any>(()=>{/* never loaded */}));
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:deferred.catalog,startup:deferred.prepared,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:1_500});
  try{
    /* the mount itself may take longer than the injected time: «checking…» is asserted only if it is still there, its going away always */
    const screen=await app.waitFor('the row without the badge',s=>!BADGE.test(s.text),8_000);
    assert.match(screen.text,/gpt-5-mini/u,`the model is still on the row:\n${screen.text}`);
    await sleep(300);
    assert.doesNotMatch((await app.screen()).text,BADGE,'and nothing comes back: no «not verified» is invented for a check that was never made');
  }finally{app.unmount();}
});

test('S3: a key change the catalog announces makes the screen read the row again and check again',async t=>{
  const root=folder(t);
  let keyThere=true;let refreshed=0;const listeners=new Set<(id:string)=>void>();
  const report=(id:string)=>keyThere?verifiedReport(id):unverifiedReport(id);
  const catalog=loadedCatalog({
    chosenProvider:()=>'openai',providerState:report,
    refreshProviderState:async(id:string)=>{refreshed+=1;return report(id);},
    onProviderStateChanged:(listener:(id:string)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  });
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  try{
    await app.waitFor('the verified row',s=>/openai: verified/u.test(s.text));
    assert.equal(refreshed,1);
    assert.equal(listeners.size,1,'the screen listens to the catalog for key changes');
    /* what catalog-service.ts does when a key is removed by ANY door: reset what it knew, then tell */
    keyThere=false;for(const listener of listeners)listener('openai');
    const after=await app.waitFor('the row to follow the key',s=>/openai: not verified/u.test(s.text));
    assert.doesNotMatch(after.text,/openai: verified/u);
    assert.equal(refreshed,2,'and the provider on the row is checked again');
    /* a change of another provider's key re-reads the row and checks nothing */
    for(const listener of listeners)listener('someone-else');
    await sleep(150);assert.equal(refreshed,2);
  }finally{app.unmount();}
  assert.equal(listeners.size,0,'the screen that left no longer listens');
});

test('S4: after provider A → B → A the first check\'s give-up timer does not take the later check\'s «checking…» away',{timeout:60_000},async t=>{
  const root=folder(t);
  const SHOWN_MS=5_000;
  const kicks:Array<{id:string;at:number}>=[];
  const catalog=loadedCatalog({
    chosenProvider:()=>'openai',
    listProviders:async()=>[provider('openai'),provider('beta')],
    listModels:async(input?:{provider?:string})=>[model('openai:gpt-5-mini'),model('beta:other')].filter(row=>!input?.provider||row.provider===input.provider),
    providerState:(id:string)=>({id,state:'unverified' as const,verified:null,checkedAt:null,ageMs:null,fresh:false}),
    /* no check ever lands: only the timers can end «checking…» */
    refreshProviderState:(id:string)=>{kicks.push({id,at:Date.now()});return new Promise<never>(()=>{});},
  });
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:SHOWN_MS});
  try{
    await app.waitFor('the first check of A',()=>kicks.length===1);
    for(const next of ['beta:other','openai:gpt-5-mini']){
      await sleep(400);
      app.press(`/model ${next}`);await sleep(150);app.press('\r');
      await app.waitFor(`the model ${next}`,s=>s.text.includes(next.split(':')[1]!)&&kicks.at(-1)?.id===next.split(':')[0],8_000);
    }
    assert.deepEqual(kicks.map(kick=>kick.id),['openai','beta','openai'],'three checks: A, B, A again');
    const first=kicks[0]!.at,later=kicks[2]!.at;
    assert.ok(later-first>=700&&later<first+SHOWN_MS-1_000,`the later check of A started inside the first one's time (after ${later-first} ms): the test's own premise`);
    /* the first check's timer fires at first+SHOWN_MS; the later check may be shown until later+SHOWN_MS */
    await sleep(Math.max(0,first+SHOWN_MS+350-Date.now()));
    assert.ok(Date.now()<later+SHOWN_MS-250,'still inside the later check\'s own time');
    const screen=await app.screen();
    assert.match(screen.text,/openai: checking…/u,`the first check's timer ended the later check's «checking…»:\n${screen.text}`);
    /* and the later check's own time still ends it */
    await app.waitFor('the later check to give up',s=>/openai: not verified/u.test(s.text),SHOWN_MS+3_000);
  }finally{app.unmount();}
});

/* Gate red of 13/10/2026 (s52; acceptance s64 measures it on the built CLI): the screen that leaves ends the checks it started. */
test('EXIT: the screen that leaves stops the provider checks; one still waiting for the kernel is never sent',async t=>{
  const root=folder(t);
  let load!:(context:any)=>void;const pending=new Promise<any>(resolve=>{load=resolve;});
  const deferred=createDeferredRuntimeContext(pending);
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:deferred.catalog,startup:deferred.prepared,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  await app.waitFor('the row to say it is checking',s=>/openai: checking…/u.test(s.text));
  app.unmount();await sleep(50);
  /* the kernel finishes loading after the screen has gone (a cold first start left at once) */
  let refreshed=0,stopped=0;
  load({runtime:{},tuiCatalog:loadedCatalog({refreshProviderState:async(id:string)=>{refreshed+=1;return verifiedReport(id);},stopProviderChecks:()=>{stopped+=1;}})});
  await deferred.ready;await sleep(50);
  assert.equal(refreshed,0,'no request is sent for a screen that is no longer there');
  /* and on a loaded catalog the stop reaches it */
  const stops={count:0};
  const loaded=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:loadedCatalog({chosenProvider:()=>'openai',stopProviderChecks:()=>{stops.count+=1;}}),configuredModel:'openai:gpt-5-mini'});
  await loaded.waitFor('the verified row',s=>/openai: verified/u.test(s.text));
  assert.equal(stops.count,0);loaded.unmount();await sleep(50);
  assert.equal(stops.count,1,'the app told its catalog as it left');
  assert.equal(stopped,0);
});

/*
 * Second review of 0.6.2 (13/10/2026, S5): the stand-in's own `onProviderStateChanged` and `stopProviderChecks` were never run with
 * the app on them — S3 above mounts the LOADED catalog, and «EXIT» stops a stand-in that never loaded. On the real screen the app
 * registers its listener BEFORE the kernel is loaded and the catalog announces a key change AFTER; and the screen that leaves
 * after the kernel is loaded must reach the loaded catalog through the stand-in.
 */
function announcingCatalog(){
  const listeners=new Set<(id:string)=>void>();const seen={refreshed:0,stopped:0,keyThere:true};
  const report=(id:string)=>seen.keyThere?verifiedReport(id):unverifiedReport(id);
  const catalog=loadedCatalog({
    providerState:report,refreshProviderState:async(id:string)=>{seen.refreshed+=1;return report(id);},
    onProviderStateChanged:(listener:(id:string)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    stopProviderChecks:()=>{seen.stopped+=1;},
  });
  return{catalog,listeners,seen};
}

test('S5: on the stand-in, a listener registered before the kernel is loaded hears a key change announced after; the leaving screen reaches the loaded catalog',async t=>{
  const root=folder(t);
  let load!:(context:any)=>void;const pending=new Promise<any>(resolve=>{load=resolve;});
  const deferred=createDeferredRuntimeContext(pending);
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:deferred.catalog,startup:deferred.prepared,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  const real=announcingCatalog();
  try{
    await app.waitFor('the row to say it is checking',s=>/openai: checking…/u.test(s.text));
    assert.equal(real.listeners.size,0,'the premise: the app asked to listen while there was nothing to listen to');
    load({runtime:{},tuiCatalog:real.catalog});
    await app.waitFor('the verified row',s=>/openai: verified/u.test(s.text));
    assert.equal(real.listeners.size,1,'the listener the app registered before the kernel reached the loaded catalog');
    assert.equal(real.seen.refreshed,1);
    /* catalog-service.ts `credentialChanged`: the key is removed by any door, what was known is reset, the listeners are told */
    real.seen.keyThere=false;for(const listener of real.listeners)listener('openai');
    const after=await app.waitFor('the row to follow the key',s=>/openai: not verified/u.test(s.text));
    assert.doesNotMatch(after.text,/openai: verified/u);
    assert.equal(real.seen.refreshed,2,'and the provider on the row is checked again, through the stand-in');
    assert.equal(real.seen.stopped,0);
  }finally{app.unmount();}
  await sleep(50);
  assert.equal(real.seen.stopped,1,'the screen that left told the LOADED catalog, through the stand-in, to stop its checks');
  assert.equal(real.listeners.size,0,'and no longer listens');
});

test('S5: on the stand-in, a listener that left before the kernel was loaded is never registered',async t=>{
  const root=folder(t);
  let load!:(context:any)=>void;const pending=new Promise<any>(resolve=>{load=resolve;});
  const deferred=createDeferredRuntimeContext(pending);
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:deferred.catalog,startup:deferred.prepared,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  await app.waitFor('the row to say it is checking',s=>/openai: checking…/u.test(s.text));
  app.unmount();await sleep(50);
  const real=announcingCatalog();
  load({runtime:{},tuiCatalog:real.catalog});
  await deferred.ready;await sleep(50);
  assert.equal(real.listeners.size,0,'a screen that is gone was registered as a listener of the loaded catalog');
  assert.equal(real.seen.refreshed,0);
});

/*
 * The two nits of the third adversarial review of 0.6.2 (bugfixer, 13/10/2026, on 550e25973) on the status row's provider badge:
 *   AGENT  the external agent gets no background check (its probe starts a process), and the row said «esterno: checking…» until
 *          the kernel was loaded, then nothing. It says nothing from the first frame (RED before the cure).
 *   HOUR   a screen left open kept «verified» past the hour its answer is good for: nothing read the row again. One timer for the
 *          moment the answer stops vouching reads it again and makes ONE check (RED before the cure); it is not a loop.
 * Mocks only: no kernel, no network, no key. The app is mounted in process, as provider-badge-stand-in.test.ts does.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {hermeticProfile,mountApp,sleep} from './r1-layout-fixture.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';
import {PROVIDERS_NEVER_CHECKED} from '../../src/tui/catalog-service.ts';

function paths(root:string){return{dataRoot:join(root,'data'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),stateRoot:join(root,'state')};}
function folder(t:import('node:test').TestContext){
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-badge-nits-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
const provider=(id:string)=>({id,label:id,description:'',configured:true,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'cloud',keySource:'saved',environmentVariable:null,benched:null});
const model=(id:string)=>({id,provider:id.split(':')[0],name:id.split(':')[1],reasoning:false});

test('AGENT: the list of providers never checked is the kernel registry\'s own (every provider whose probe starts a process)',async()=>{
  const {REGISTRO_FORNITORI:registry}=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href) as {REGISTRO_FORNITORI:Record<string,{wire?:string}>};
  const startsProcess=Object.keys(registry).filter(id=>registry[id]?.wire==='acp').sort();
  assert.ok(startsProcess.length>0,'the premise: the registry has the external agent');
  assert.deepEqual([...PROVIDERS_NEVER_CHECKED].sort(),startsProcess);
});

test('AGENT: on the stand-in catalog the row never says «checking…» for the external agent; for a key provider it still does',async t=>{
  const root=folder(t);
  for(const [id,expected] of [['esterno:agent',false],['openai:gpt-5-mini',true]] as const){
    const deferred=createDeferredRuntimeContext(new Promise<any>(()=>{/* the kernel is still loading */}));
    const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:deferred.catalog,startup:deferred.prepared,configuredModel:id,invocation:{model:id,permissionMode:'default',resume:'s1'},providerCheckingShownMs:60_000});
    try{
      await app.waitFor('the model on the row',s=>s.text.includes(id.split(':')[1]!));
      await sleep(500);
      const screen=await app.screen();
      assert.equal(/checking…/u.test(screen.text),expected,`${id}:\n${screen.text}`);
    }finally{app.unmount();}
  }
});

test('HOUR: when the answer on the row stops vouching, the open screen reads it again and makes ONE check',{timeout:60_000},async t=>{
  const root=folder(t);
  let until=Date.now()+1_500;let kicks=0;
  const report=(id:string)=>{const fresh=Date.now()<until;return{id,state:'available' as const,verified:true,checkedAt:until-3_600_000,ageMs:Date.now()-(until-3_600_000),fresh,vouchesUntil:fresh?until:null};};
  const catalog:any={
    chosenProvider:async()=>'openai',chooseProvider:async()=>{},listProviders:async()=>[provider('openai')],listModels:async()=>[model('openai:gpt-5-mini')],
    providerModels:async()=>({provider:'openai',label:'OpenAI',rows:[model('openai:gpt-5-mini')],verified:true,notice:'',listing:'live'}),
    readiness:async()=>({ready:true}),selectModel:async()=>{},keyTestNotice:()=>null,
    probeProvider:async(id:string)=>({provider:id,state:'available',detail:'',latencyMs:1,remediation:null,readinessCode:null}),
    providerState:(id:string)=>report(id),
    /* the first check answers from the fresh snapshot; the one made at the hour is a real one, and its answer is good for an hour */
    refreshProviderState:async(id:string)=>{kicks+=1;if(kicks>1)until=Date.now()+3_600_000;return report(id);},
  };
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  try{
    await app.waitFor('the row to read verified',s=>/openai: verified/u.test(s.text));
    assert.equal(kicks,1,'the premise: the one check of the start');
    const first=until;
    await sleep(Math.max(0,first-Date.now())+900);
    assert.equal(kicks,2,'the hour passed on an open screen and nothing read the row again: it keeps «verified» for an answer that is no longer fresh');
    assert.match((await app.screen()).text,/openai: verified/u,'the new answer is on the row');
    await sleep(900);
    assert.equal(kicks,2,'one check at the hour, not a loop');
  }finally{app.unmount();}
});

/*
 * C1R — the boot/resume contract (RED R1 and the declared-risk mitigation badge of the cure):
 *   R1  the resume reaches the visible session WITHOUT waiting for the provider probe — the background
 *       verification may hang forever and the composer still arrives;
 *   BADGE  the status row declares the provider's verification state («not verified» until a fresh snapshot
 *       or a live probe says otherwise), so a provider is never silently shown ready.
 * Mocks only: the catalog is a fake whose probe and refresh never answer; no network, no real keys.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermeticProfile,mountApp} from './r1-layout-fixture.ts';
import {PROVIDER_CHECKING_SHOWN_MS} from '../../src/tui/app.ts';
import {rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function paths(root:string){return{dataRoot:join(root,'data'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),stateRoot:join(root,'state')};}
const MODEL_ROW={id:'openai:gpt-5-mini',provider:'openai',name:'gpt-5-mini',reasoning:false};
const PROVIDER_ROW={id:'openai',label:'OpenAI',description:'',configured:true,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'cloud',keySource:'saved',environmentVariable:null,benched:null};

function hangingCatalog(counters:{refresh:number}){
  return{
    chosenProvider:()=>'openai',
    listProviders:async()=>[PROVIDER_ROW],
    listModels:async()=>[MODEL_ROW],
    providerModels:async()=>({provider:'openai',label:'OpenAI',rows:[MODEL_ROW],verified:true,notice:''}),
    readiness:async()=>({ready:true}),
    probeProvider:async()=>{throw new Error('no probe was expected to be needed for the session to show');},
    providerState:()=>({id:'openai',state:'unverified' as const,verified:null,checkedAt:null,ageMs:null,fresh:false}),
    refreshProviderState:()=>{
      counters.refresh+=1;
      return new Promise<never>(()=>{/* the provider never answers: the boot must not care */});
    },
  };
}

/* Review A8.2/V10 (closing condition): the flip itself was covered by ZERO tests — BADGE-2 starts fresh,
   so the tick path (refresh lands → tick → re-read → badge) had never been seen green. A broken useMemo
   or a dead tick would pass every other proof while the badge stays stale forever. */
test('C1R-FLIP: the badge flips to verified when the background refresh lands',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-c1r-flip-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  /* the local reading changes when the check LANDS, not when it is started (the row is read again as soon as the check starts) */
  let refreshed=0;let landed=false;let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const catalog:any={
    ...hangingCatalog({refresh:0}),
    providerState:()=>!landed
      ?{id:'openai',state:'unverified' as const,verified:null,checkedAt:null,ageMs:null,fresh:false}
      :{id:'openai',state:'available' as const,verified:true,checkedAt:Date.now(),ageMs:1,fresh:true},
    refreshProviderState:()=>{refreshed+=1;return gate.then(()=>{landed=true;}).then(()=>({id:'openai',state:'available' as const,verified:true,checkedAt:Date.now(),ageMs:1,fresh:true}));},
  };
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini'});
  try{
    const before=await app.settle();
    /* the mockup's three states (owner 07/10/2026): while the one check is under way the row says «checking…», never «verified» */
    assert.match(before.text,/openai: checking…/u,`before the refresh lands the badge says it is checking:\n${before.text}`);
    assert.doesNotMatch(before.text,/openai: verified/u);
    release();
    const after=await app.waitFor('the badge to flip to verified',s=>/openai: verified/u.test(s.text));
    assert.match(after.text,/openai: verified/u,`the tick after the refresh re-declares the badge:\n${after.text}`);
    assert.equal(refreshed,1,'the refresh was kicked once');
  }finally{app.unmount();}
});

test('C1R-R1: the resume reaches the visible session while the background verification hangs forever',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-c1r-boot-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const counters={refresh:0};
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:hangingCatalog(counters),configuredModel:'openai:gpt-5-mini'});
  try{
    const screen=await app.settle();
    assert.ok(/gpt-5-mini/u.test(screen.text),`the resumed session's model is on screen:\n${screen.text}`);
    assert.ok(/│ ›/u.test(screen.lines.join('\n'))||screen.lines.some(line=>line.includes('›')),`the composer is up:\n${screen.text}`);
    assert.equal(counters.refresh,1,'the background verification was kicked once, after the session is on screen');
    /* the hang is still running; the screen settled anyway (settle() returned) */
  }finally{app.unmount();}
});

test('C1R-BADGE: with a declared «not verified» provider state the status row says so',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-c1r-badge-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const counters={refresh:0};
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog:hangingCatalog(counters),configuredModel:'openai:gpt-5-mini'});
  try{
    const first=await app.settle();
    assert.match(first.text,/openai: checking…/u,`while the check is under way the row says so:\n${first.text}`);
    /* the check never lands here: «checking…» is not left on screen, the row falls back to what is known */
    const screen=await app.waitFor('the honest fallback',s=>/openai: not verified/u.test(s.text),PROVIDER_CHECKING_SHOWN_MS+3_000);
    assert.doesNotMatch(screen.text,/checking…/u);
    assert.match(screen.text,/not verified/u,`the status row declares the provider state:\n${screen.text}`);
  }finally{app.unmount();}
});

test('C1R-BADGE-2: a fresh, answered provider shows as verified, and nothing re-probes',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-c1r-badge2-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  let probed=0;
  const catalog:any={
    ...hangingCatalog({refresh:0}),
    /* review of 0.6.2 (B1): this fake said `verified:false` and the row read «verified» — the blocker, pinned green. A key the
       provider accepted is `true`; the `false` of a public catalogue is the next test. */
    providerState:()=>({id:'openai',state:'available' as const,verified:true,checkedAt:Date.now(),ageMs:1,fresh:true}),
    refreshProviderState:()=>{return Promise.resolve({id:'openai',state:'available' as const,verified:true,checkedAt:Date.now(),ageMs:1,fresh:true});},
    probeProvider:async()=>{probed+=1;throw new Error('no probe at boot');},
  };
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini'});
  try{
    const screen=await app.settle();
    assert.match(screen.text,/openai: verified/u,`the status row says the provider is verified:\n${screen.text}`);
    assert.equal(probed,0,'a fresh snapshot costs no network call at boot');
  }finally{app.unmount();}
});

/* Review of 0.6.2 (13/10/2026, B1; RED before the cure): the app handed the row the report's id, state and freshness and dropped its
   verdict, so a provider reached through a PUBLIC catalogue — which answers whatever the key is — read «verified» on the screen. */
test('C1R-BADGE-3: reached and fresh, but the key was not judged (a file of an older version, a public catalogue): «not verified»',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-c1r-badge3-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const report={id:'openai',state:'available' as const,verified:false,checkedAt:Date.now(),ageMs:1,fresh:true};
  const catalog:any={...hangingCatalog({refresh:0}),providerState:()=>report,refreshProviderState:()=>Promise.resolve(report)};
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini'});
  try{
    const screen=await app.waitFor('the check to land',s=>/openai: not verified/u.test(s.text));
    assert.doesNotMatch(screen.text,/openai: verified/u,`a key nobody judged is called verified:\n${screen.text}`);
  }finally{app.unmount();}
});

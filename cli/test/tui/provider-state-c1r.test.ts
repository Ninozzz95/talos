/*
 * C1R — the catalog contract the resume path relies on (RICERCA-5x5x5x5-OTTIMIZZAZIONE-CLI-2026-10-05, cure C1R;
 * RED R2, R3, R4 of the research's "Conclusione della ricerca"):
 *   R2  a FRESH snapshot answers the provider's readiness with NO network call;
 *   R3  a missing or stale snapshot is a DECLARED "not verified" state, and the background refresh probes ONCE,
 *       then persists the answer to the snapshot on disk — the session never waits for it;
 *   R4  the refresh itself is bounded by an explicit budget: a provider that never answers cannot hold it.
 * Mocks only: the probe is a fake, the snapshot lives in a temp folder, no key is real.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {readProviderStateSnapshot,writeProviderStateSnapshot,isProviderStateFresh,DEFAULT_PROVIDER_STATE_TTL_MS,PROVIDER_STATE_SCHEMA} from '../../src/provider/provider-state-snapshot.ts';
import {resolveCliPaths} from '../../src/paths.ts';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';

function deps(overrides:Partial<TuiCatalogDeps>&{probe?:()=>Promise<any>}):TuiCatalogDeps{
  return{
    publicProviders:()=>[],
    registry:{openrouter:{id:'openrouter',destinazioneChat:true,etichetta:'OpenRouter',chiaveObbligatoria:true,baseUrl:'https://openrouter.example/api/v1'}},
    runtimeFor:()=>({endpoint:'https://openrouter.example/api/v1',timeoutSeconds:5}),
    keyFor:()=>'sk-test-not-a-real-key',
    setKey:()=>{},clearKey:()=>{},
    createProbe:(signal?:AbortSignal)=>{
      /* review of 0.6.2: an authenticated catalogue that accepted the key (`true`); a public one (`false`) is «not verified», see provider-state-review-062.test.ts */
      const probe=overrides.probe?.()??Promise.resolve({provider:'openrouter',esito:'collegato',credenzialeVerificata:true,millisecondi:12,httpStatus:200});
      return{prova:()=>{
        calls+=1;
        if(signal&&typeof signal.addEventListener==='function'&&signal.aborted)probe.abort?.();
        return probe;
      },elencaModelli:async()=>[]};
    },
    persistModel:async()=>{},
    ...overrides,
  } as TuiCatalogDeps;
}
let calls=0;

function tempFolder(t:import('node:test').TestContext){
  const root=mkdtempSync(join(tmpdir(),'talos-c1r-catalog-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}

test('C1R-R2: a fresh snapshot answers the provider readiness with NO network call',async t=>{
  const root=tempFolder(t);calls=0;
  const file=join(root,'provider-state.json');
  writeProviderStateSnapshot({file,now:Date.now(),providers:{openrouter:{state:'available',verified:true,checkedAt:Date.now(),latencyMs:9}}});
  const catalog=createTuiCatalogService(deps({providerStateFile:file,providerStateTtlMs:DEFAULT_PROVIDER_STATE_TTL_MS}));
  const state=await catalog.refreshProviderState!('openrouter');
  assert.equal(calls,0,'a fresh snapshot must not be revalidated over the network');
  assert.equal(state?.state,'available');
  assert.equal(state?.fresh,true);
});

test('C1R-R3a: with no snapshot the state is a declared «not verified», never a guess',async t=>{
  const root=tempFolder(t);calls=0;
  const catalog=createTuiCatalogService(deps({providerStateFile:join(root,'provider-state.json')}));
  const state=catalog.providerState!('openrouter');
  assert.deepEqual([state.state,state.verified,state.checkedAt,state.fresh],['unverified',null,null,false]);
});

test('C1R-R3b: a stale snapshot refreshes in the background: one probe, and the answer lands on disk',async t=>{
  const root=tempFolder(t);calls=0;
  const file=join(root,'provider-state.json');
  writeProviderStateSnapshot({file,now:Date.now()-DEFAULT_PROVIDER_STATE_TTL_MS-1,providers:{openrouter:{state:'available',verified:false,checkedAt:Date.now()-DEFAULT_PROVIDER_STATE_TTL_MS-1,latencyMs:9}}});
  const catalog=createTuiCatalogService(deps({providerStateFile:file,providerStateTtlMs:DEFAULT_PROVIDER_STATE_TTL_MS}));
  assert.equal(catalog.providerState!('openrouter').fresh,false,'a stale entry is declared stale');
  const state=await catalog.refreshProviderState!('openrouter');
  assert.equal(calls,1,'the refresh probes exactly once');
  assert.equal(state?.state,'available');
  const persisted=readProviderStateSnapshot({file});
  assert.equal(persisted.missing,false,'the revalidated state is persisted for the next resume');
  assert.equal(persisted.providers.openrouter?.state,'available');
  assert.ok(!readFileSync(file,'utf8').includes('sk-test-not-a-real-key'),'no key material reaches the snapshot');
});

test('C1R-R3c: a missing snapshot still shows the session-side state while the refresh runs (it is not awaited by the boot)',async t=>{
  const root=tempFolder(t);calls=0;
  let probeAnswered=false;
  const catalog=createTuiCatalogService(deps({providerStateFile:join(root,'provider-state.json'),probe:async()=>{
    await new Promise(resolve=>setTimeout(resolve,25));probeAnswered=true;
    return{provider:'openrouter',esito:'collegato',credenzialeVerificata:true,millisecondi:5,httpStatus:200};
  }}));
  const state=catalog.providerState!('openrouter');
  assert.equal(state.state,'unverified','before the background answer the session sees «not verified», declared');
  const refresh=catalog.refreshProviderState!('openrouter');
  assert.ok(refresh instanceof Promise,'the refresh runs on its own; the boot path never awaits it');
  assert.equal(probeAnswered,false,'the probe runs in the background, not on the caller\u2019s stack');
  assert.equal((await refresh)?.state,'available');
  assert.equal(probeAnswered,true);
});

test('C1R-R4: a provider that never answers cannot hold the refresh beyond its budget',async t=>{
  const root=tempFolder(t);calls=0;
  const catalog=createTuiCatalogService(deps({providerStateFile:join(root,'provider-state.json'),providerStateBudgetMs:120,
    probe:()=>new Promise<any>(()=>{/* never answers, ignores aborts */})}));
  const started=Date.now();
  const state=await catalog.refreshProviderState!('openrouter');
  const waited=Date.now()-started;
  assert.ok(waited<2_000,`the refresh settled on its own budget (waited ${waited} ms)`);
  assert.equal(state?.state,'unverified','an unanswered provider stays a declared «not verified»');
  assert.equal(calls,1,'the probe was attempted, once, and its answer (none) was not waited for past the budget');
});

test('C1R-W1: a user-triggered probeProvider keeps the snapshot fresh (write-through)',async t=>{
  const root=tempFolder(t);calls=0;
  const file=join(root,'provider-state.json');
  const catalog=createTuiCatalogService(deps({providerStateFile:file}));
  const probe=await catalog.probeProvider('openrouter');
  assert.equal(probe.state,'available');
  const persisted=readProviderStateSnapshot({file});
  assert.equal(persisted.providers.openrouter?.state,'available','the live probe is the revalidation of the snapshot');
});

test('C1R-W2: without a snapshot file the service still works: state unverified, refresh probes',async t=>{
  const root=tempFolder(t);calls=0;
  const catalog=createTuiCatalogService(deps({}));
  assert.equal(catalog.providerState!('openrouter').state,'unverified');
  const state=await catalog.refreshProviderState!('openrouter');
  assert.equal(state?.state,'available','in-memory revalidation still answers when the probe does');
  assert.equal(calls,1);
});

test('C1R-W3: an unreadable snapshot file behaves as missing (fail toward not verified), never throws',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  writeFileSync(file,'{{{','utf8');
  const catalog=createTuiCatalogService(deps({providerStateFile:file}));
  assert.equal(catalog.providerState!('openrouter').state,'unverified');
});

/* Review A8.1/V10 (closing condition): the composition wiring was covered by ZERO tests — deleting the
   `providerStateFile` line in talos-composition.ts left all 21 proofs green while the cure died silently
   (badge «not verified» forever). This test kills that mutant: the composed catalog must read the
   snapshot from `<cacheRoot>/provider-state.json`, the exact file the resume path reads. */
test('C1R-WIRING: the composed catalog reads the snapshot the composition wires at <cacheRoot>/provider-state.json',async()=>{
  const home=await mkdtemp(join(tmpdir(),'talos-c1r-wiring-'));
  try{
    const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
    for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])mkdirSync(p,{recursive:true});
    const modules={
      createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>null,getRuntime:()=>({}),hasKey:()=>false,listPublic:()=>[]}),
      createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
      avviaSessione:async()=>({}),
      STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
      createSessionRegistry:()=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})}),
    } as any;
    const composed:any=await composeTalosRuntime({repoRoot:home,projectRoot:home,paths,model:'m',env:{},modules});
    const file=join(paths.cacheRoot,'provider-state.json');
    const checkedAt=Date.now();
    await writeFile(file,JSON.stringify({schema:PROVIDER_STATE_SCHEMA,savedAt:checkedAt,providers:{openai:{state:'available',verified:true,checkedAt,latencyMs:12}}}));
    const report=composed.tuiCatalog.providerState('openai');
    assert.equal(report.state,'available','the composed catalog reads the snapshot the composition wired');
    assert.equal(report.fresh,true,'the wired entry is fresh for the badge');
    assert.equal(report.id,'openai');
  }finally{await rm(home,{recursive:true,force:true});}
});

/* Review A5/closing condition: a `checkedAt` in the future must never pin «verified» (clock skew, hand-edited file). */
test('C1R-FUTURE: a snapshot entry with a future checkedAt is never fresh',async t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  writeProviderStateSnapshot({file,now:Date.now(),providers:{openrouter:{state:'available',verified:true,checkedAt:Date.now()+3_600_000,latencyMs:5}}});
  const snapshot=readProviderStateSnapshot({file});
  assert.equal(isProviderStateFresh(snapshot.providers['openrouter']!,Date.now(),DEFAULT_PROVIDER_STATE_TTL_MS),false,'a future checkedAt is not a fresh verdict');
});

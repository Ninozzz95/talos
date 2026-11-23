/*
 * Review of 0.6.4, fifth round (bugfixer, 14/10/2026) — written RED against 44737aab0, NOT RUN (a gate was running).
 *
 * The forwarding store (talos-composition.ts:264-306) rebuilds the store from the keyring whenever one of three FILES changes
 * (own writes included: `credentialChanged` writes provider-state.json right after every key save). The keyring itself is not
 * followed, so a TALOS opened BEFORE another one first wrote the provider's pool index keeps a store that does not know the index
 * exists (`conIndice` empty), and WRITES from it:
 *  - `setKey` takes the engine's no-index path (provider-credential-store.mjs:525-531): it writes only the legacy entry, while
 *    `loadFromKeyring` (:546-569) always prefers the index. Until 0.6.3 that TALOS kept the new key for its session; since 0.6.4 the
 *    rebuild that follows its OWN snapshot write reloads the index and puts the OLD key back, within a second, in the very terminal
 *    where the person replaced it (the status row still says «verified», from the save).
 *  - `mettiInPanchina`/`salvaPool` from the stale rows rewrites the index without the key another TALOS added; the TALOS that
 *    added it loses it at its next rebuild.
 * The index is created by any bench of a saved key (a 429, a 401, a network error or a 5xx: PANCHINE_PROVIDER_MS) or by a second
 * key, so «one key saved once, two terminals open» is the ordinary case. Two composed runtimes on one profile and one keyring
 * stand for two TALOS processes (as review-064d-*.test.ts). A cure on the CLI side: rebuild (with `carryEnvironmentBenches`)
 * before every WRITE method of the forwarder, so no write is ever made from a store older than the keyring.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL} from './r5a-r-fixture.ts';

async function compose(h:Hermetic,keyring:ReturnType<typeof fakeKeyring>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:'http://127.0.0.1:9'});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,DEEPSEEK_API_KEY:undefined},environmentKeys:'consent',keyring} as any) as Promise<any>;
}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('review of 0.6.4, 064e-1: a key replaced in a TALOS opened earlier stays the key in use there (no revert to the indexed old key)',{timeout:120_000},async()=>hermetic(async h=>{
  const oldKey=dummyKey('deepseek-old');const newKey=dummyKey('deepseek-new');const keyring=fakeKeyring();
  const first=await compose(h,keyring);
  let older:any=null;
  try{
    /* one key, saved once: the engine's legacy entry, no pool index yet */
    first.providerStore.setKey('deepseek',oldKey);
    older=await compose(h,keyring);
    await pause(400);
    assert.equal(older.providerStore.getKey('deepseek'),oldKey,'both TALOS use the saved key');
    /* a network error in the first TALOS benches the key for 60 s: `salvaPool` creates the pool index with the OLD key */
    const [entry]=first.providerStore.elencaPool('deepseek');
    first.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'rete'});
    /* the person replaces the key in the TALOS opened earlier; its key change writes a followed file (as setProviderKey's
       credentialChanged does with the snapshot) */
    await pause(400);
    older.providerStore.setKey('deepseek',newKey);
    assert.equal(older.providerStore.getKey('deepseek'),newKey,'the key just saved is in use');
    await older.tuiCatalog.chooseProvider('deepseek');
    await pause(400);
    assert.equal(older.providerStore.getKey('deepseek'),newKey,'after its own write was followed, the key the person saved is still the one in use');
  }finally{await first.runtime.close?.();await older?.runtime.close?.();}
}));

test('review of 0.6.4, 064e-2: a key added in one TALOS is not dropped from it by another TALOS that benched a key from its older store',{timeout:120_000},async()=>hermetic(async h=>{
  const keyA=dummyKey('deepseek-a');const keyB=dummyKey('deepseek-b');const keyring=fakeKeyring();
  const adder=await compose(h,keyring);
  let older:any=null;
  try{
    adder.providerStore.setKey('deepseek',keyA);
    older=await compose(h,keyring);
    await pause(400);
    /* the person adds a second key in the first TALOS: the index now holds two keys */
    adder.providerStore.aggiungiChiave('deepseek',keyB);
    assert.equal(adder.providerStore.elencaPool('deepseek').length,2,'two keys after the add');
    /* the other TALOS, opened before the add, gets a 5xx on key A and benches it from its rows of before (one key) */
    await pause(400);
    const [entry]=older.providerStore.elencaPool('deepseek');
    older.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'guasto-fornitore'});
    /* any followed file changes (here a provider choice in the other TALOS) */
    await older.tuiCatalog.chooseProvider('deepseek');
    await pause(400);
    assert.equal(adder.providerStore.elencaPool('deepseek').length,2,'the key the person added in this TALOS is still there');
  }finally{await adder.runtime.close?.();await older?.runtime.close?.();}
}));

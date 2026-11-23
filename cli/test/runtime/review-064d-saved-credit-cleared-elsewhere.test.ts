/*
 * Review of 0.6.4, fourth round (bugfixer, 14/10/2026) — written RED against 7e0d647ef, NOT RUN (a gate was running).
 * `carryEnvironmentBenches` (talos-composition.ts:286-303) carries EVERY `credito` bench of a saved key into the rebuilt store and
 * writes it into the keyring (`mettiInPanchina` -> `salvaPool`), without asking whether the keyring still holds that bench. Its
 * own comment says it is meant for «a credit bench on a one-key pool» that the BUG-25 migration reloads as available, and that
 * «writing it again rewrites the index with the same content». Neither holds when ANOTHER TALOS cleared the bench on purpose:
 * the person saves the same key again in a second terminal (`/provider`, after a top-up: `setKey` writes the index with no bench
 * and `credentialChanged` writes the snapshot, which every open TALOS follows). The open TALOS then rebuilds, finds the key
 * available, benches it again from its memory and WRITES the stale bench back into the shared keyring:
 *  - one key: this TALOS refuses the key the person just saved, until the old reset;
 *  - several keys (no migration there, the index keeps benches): the stale bench is persisted and reaches every TALOS and every
 *    new start for up to an hour — the person's action is undone everywhere, including in the terminal where it was made.
 * Two composed runtimes on one profile and one keyring stand for two TALOS processes (as review-064b-elsewhere.test.ts).
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
/* the pool index as the keyring holds it, whatever the CLI's service name is (scopeCliKeyring remaps it) */
function savedIndex(keyring:ReturnType<typeof fakeKeyring>,provider:string):any[]{
  for(const [name,value] of keyring.entries)if(name.endsWith(`\u0000${provider}:indice`))return JSON.parse(value).chiavi;
  return [];
}

test('review of 0.6.4, 064d-1: a key saved again in ANOTHER TALOS (two keys) is not benched again by the open one, nor in the keyring',{timeout:120_000},async()=>hermetic(async h=>{
  const keyA=dummyKey('deepseek-a');const keyB=dummyKey('deepseek-b');const keyring=fakeKeyring();
  const open=await compose(h,keyring);
  let other:any=null;let third:any=null;
  try{
    open.providerStore.setKey('deepseek',keyA);open.providerStore.aggiungiChiave('deepseek',keyB);
    other=await compose(h,keyring);
    await pause(400);
    assert.equal(open.providerStore.getKey('deepseek'),keyA,'two saved keys, the first in use');
    const [first]=open.providerStore.elencaPool('deepseek');
    /* a run refused for credit (no declared reset): on a pool of two the kernel benches the key for an hour and rotates */
    open.providerStore.mettiInPanchina('deepseek',first.impronta,{classe:'credito'});
    assert.equal(open.providerStore.getKey('deepseek'),keyB,'benched, the second key in use');
    /* the person tops up and saves the same key again in the other terminal; its key change writes a followed file */
    await pause(400);
    other.providerStore.setKey('deepseek',keyA);
    await other.tuiCatalog.chooseProvider('deepseek');
    assert.equal(savedIndex(keyring,'deepseek').find((row:any[])=>row[0]===first.impronta)?.[2],null,'the other TALOS cleared the bench in the keyring');
    await pause(400);
    assert.equal(open.providerStore.getKey('deepseek'),keyA,'the open TALOS uses the key the person saved again');
    assert.equal(savedIndex(keyring,'deepseek').find((row:any[])=>row[0]===first.impronta)?.[2],null,'and did not write its old bench back into the keyring');
    await other.runtime.close?.();other=null;
    third=await compose(h,keyring);
    assert.equal(third.providerStore.getKey('deepseek'),keyA,'a TALOS started now uses the key saved again');
  }finally{await open.runtime.close?.();await other?.runtime.close?.();await third?.runtime.close?.();}
}));

test('review of 0.6.4, 064d-2: a single key saved again in ANOTHER TALOS is not refused by the open one until the old reset',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const open=await compose(h,keyring);
  let other:any=null;
  try{
    open.providerStore.setKey('deepseek',key);
    other=await compose(h,keyring);
    await pause(400);
    const [entry]=open.providerStore.elencaPool('deepseek');
    /* BUG-25: a single key is benched for credit only with a reset declared by the provider */
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'credito',resetAt:Date.now()+30*60_000});
    assert.equal(open.providerStore.getKey('deepseek'),null,'benched until the declared reset');
    await pause(400);
    other.providerStore.setKey('deepseek',key);
    await other.tuiCatalog.chooseProvider('deepseek');
    await pause(400);
    assert.equal(open.providerStore.getKey('deepseek'),key,'the key the person saved again in the other terminal is used here too');
    /* the index part is the todo test below: what still leaves the old bench there is the engine, not the CLI */
  }finally{await open.runtime.close?.();await other?.runtime.close?.();}
}));

/* After the fifth review: green — a writer now runs on a store read from disk a moment before (talos-composition.ts
   STORE_WRITERS), so the other TALOS saves through the index. Before, what left the old bench in the index was the ENGINE: the other TALOS still holds the store it read before the bench (no followed file changed), so its `setKey`
   takes the no-index path and never rewrites the index. Harmless today (BUG-25 reloads a one-key credit bench as available at
   every load); it bites once the engine runs that migration only once — told to the desktop with that cure. */
test('review of 0.6.4, 064d-2 (index): the keyring index keeps the action of the person',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const open=await compose(h,keyring);
  let other:any=null;
  try{
    open.providerStore.setKey('deepseek',key);
    other=await compose(h,keyring);
    await pause(400);
    const [entry]=open.providerStore.elencaPool('deepseek');
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'credito',resetAt:Date.now()+30*60_000});
    await pause(400);
    other.providerStore.setKey('deepseek',key);
    await other.tuiCatalog.chooseProvider('deepseek');
    await pause(400);
    assert.equal(savedIndex(keyring,'deepseek').find((row:any[])=>row[0]===entry.impronta)?.[2],null);
  }finally{await open.runtime.close?.();await other?.runtime.close?.();}
}));

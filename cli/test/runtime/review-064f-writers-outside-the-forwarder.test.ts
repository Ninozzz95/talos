/*
 * Review of 0.6.4, sixth round (bugfixer, 14/10/2026) — written RED against f470c0607, NOT RUN (a gate was running).
 *
 * f470c0607 runs every WRITER of the credential store on a store read from the keyring a moment before (talos-composition.ts
 * STORE_WRITERS / readAgain), and the CHANGELOG now says «a key you replace or add here is the one in use, even with another TALOS
 * open». Two holes are left:
 *
 *  064f-1 — a TALOS composed with `environmentKeys:'use'` keeps the RAW store (talos-composition.ts:274): `talos -p`, `talos
 *    session resume`, `talos research start` and the long-lived `talos automation serve` (advanced-cli.ts:16/33/49/66, main.ts:124).
 *    Its writers still write from the store read at its start. A bench there (any 429/401/5xx/network error of a run) goes through
 *    `salvaPool` from the stale rows and rewrites the shared index WITHOUT the key the person added meanwhile in an interactive
 *    TALOS (the secret is orphaned: no TALOS uses it again). It is the 064e-2 scenario with the other TALOS being a `-p`/automation one.
 *
 *  064f-2 — the system keyring adapter maps EVERY read failure to «no entry» (system-keyring.ts:195 `catch{return null;}`), and
 *    `loadFromKeyring` treats a missing index as «no pool» (provider-credential-store.mjs:546-571). Since f470c0607 a read is taken
 *    immediately before each write, so one failed read of the index is written back at once: an automatic bench rewrites the index
 *    with the single legacy key and drops every other saved key. The fake below returns null once for the index, as the real
 *    adapter does on a failed CredRead.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL} from './r5a-r-fixture.ts';

async function compose(h:Hermetic,keyring:ReturnType<typeof fakeKeyring>,environmentKeys:'consent'|'use'='consent'){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:'http://127.0.0.1:9'});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,DEEPSEEK_API_KEY:undefined},environmentKeys,keyring} as any) as Promise<any>;
}
/* the pool index as the keyring holds it, whatever the CLI's service name is (scopeCliKeyring remaps it) */
function savedIndex(keyring:ReturnType<typeof fakeKeyring>,provider:string):any[]{
  for(const [name,value] of keyring.entries)if(name.endsWith(`\u0000${provider}:indice`))return JSON.parse(value).chiavi;
  return [];
}

test('review of 0.6.4, 064f-1: a key added in an interactive TALOS is not dropped by a `-p`/automation TALOS that benches a key from its start-time store',{timeout:120_000},async()=>hermetic(async h=>{
  const keyA=dummyKey('deepseek-a');const keyB=dummyKey('deepseek-b');const keyring=fakeKeyring();
  const screen=await compose(h,keyring);
  let oneShot:any=null;let third:any=null;
  try{
    screen.providerStore.setKey('deepseek',keyA);
    /* `talos automation serve` (or a long `talos -p`) starts now: environmentKeys 'use', raw store */
    oneShot=await compose(h,keyring,'use');
    assert.equal(oneShot.providerStore.getKey('deepseek'),keyA,'the one-shot TALOS uses the saved key');
    /* the person adds a second key in the interactive TALOS */
    screen.providerStore.aggiungiChiave('deepseek',keyB);
    assert.equal(savedIndex(keyring,'deepseek').length,2,'two keys in the shared index after the add');
    /* the one-shot TALOS's run gets a network error on key A: the kernel benches it (runtime-owner-adapter.mjs:1560) */
    const [entry]=oneShot.providerStore.elencaPool('deepseek');
    oneShot.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'rete'});
    assert.equal(savedIndex(keyring,'deepseek').length,2,'the key the person added is still in the shared index');
    third=await compose(h,keyring);
    assert.equal(third.providerStore.elencaPool('deepseek').length,2,'a TALOS started now still has both saved keys');
  }finally{await screen.runtime.close?.();await oneShot?.runtime.close?.();await third?.runtime.close?.();}
}));

test('review of 0.6.4, 064f-2: one failed read of the pool index just before an automatic bench does not drop the other saved keys',{timeout:120_000},async()=>hermetic(async h=>{
  const keyA=dummyKey('deepseek-a');const keyB=dummyKey('deepseek-b');const base=fakeKeyring();
  /* system-keyring.ts:195 answers null for ANY failed read; one such read of the index */
  let failIndexReads=0;
  const keyring={...base,get:(s:string,a:string)=>{if(a==='deepseek:indice'&&failIndexReads>0){failIndexReads--;return null;}return base.get(s,a);}};
  const open=await compose(h,keyring);
  try{
    open.providerStore.setKey('deepseek',keyA);
    open.providerStore.aggiungiChiave('deepseek',keyB);
    assert.equal(savedIndex(base,'deepseek').length,2,'two saved keys');
    const [entry]=open.providerStore.elencaPool('deepseek');
    failIndexReads=1;
    /* a 429/network error during a run: the kernel benches key A; the forwarder first reads the keyring again */
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'rete'});
    assert.equal(savedIndex(base,'deepseek').length,2,'the second saved key is still in the index');
  }finally{await open.runtime.close?.();}
}));

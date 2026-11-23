/*
 * Review of 0.6.4, seventh round (bugfixer, 14/10/2026) — written RED against f512dc126, NOT RUN (a gate was running).
 *
 * 064g-1 — f512dc126 keeps the store of before for a write when saved keys are missing from a fresh read and no followed file
 *   changed (talos-composition.ts `readAgain`: `if(!elsewhere&&lostSavedKeys(before,built))return;`), on the premise that «a saved
 *   key can go legitimately only through a removal, which writes the shared snapshot». The snapshot write is best effort:
 *   `writeProviderStateSnapshot` returns false on any failure (provider-state-snapshot.ts: temp file + rename, a Windows rename
 *   refused, a cache folder gone or elsewhere), and the other TALOS's keyring write lands BEFORE its snapshot write
 *   (catalog-service.ts `clearProviderKey`: `deps.clearKey(id)` then `credentialChanged(id)`), so a write here in between reads the
 *   keyring without the key while the fingerprint taken just before still matches. In both cases the removal is taken for a failed
 *   read and the write runs on the store of before: the kernel's bench (`mettiInPanchina`, the 401 of the very key being removed)
 *   rewrites the keyring from that store, and the REMOVED key comes back for every TALOS (a single legacy key: its secret is set
 *   again in the pool service and listed in the index). Before f512dc126 the interactive TALOS's writers always ran on the fresh
 *   read, and the bench found no such key (`mettiInPanchina` returns null).
 *
 * The snapshot write is made to fail here deterministically: a directory sits where the snapshot file goes, so the rename onto it is
 * refused and the fingerprint of that path does not move.
 */
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL} from './r5a-r-fixture.ts';

async function compose(h:Hermetic,keyring:ReturnType<typeof fakeKeyring>,environmentKeys:'consent'|'use'='consent'){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:'http://127.0.0.1:9'});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,DEEPSEEK_API_KEY:undefined},environmentKeys,keyring} as any) as Promise<any>;
}

for(const mode of ['consent','use'] as const){
  test(`review of 0.6.4, 064g-1 (${mode}): a key removed in another TALOS whose snapshot could not be written is not written back by a bench here`,{timeout:120_000},async()=>hermetic(async h=>{
    const keyA=dummyKey('deepseek-a');const keyring=fakeKeyring();
    /* the snapshot cannot be written: a rename onto a directory is refused (the write is best effort, it returns false) */
    const snapshot=join(h.paths.cacheRoot,'provider-state.json');
    rmSync(snapshot,{force:true});mkdirSync(snapshot,{recursive:true});
    const screen=await compose(h,keyring);
    let other:any=null;let third:any=null;
    try{
      /* one saved key (the single, legacy form: no pool index yet) */
      screen.providerStore.setKey('deepseek',keyA);
      other=await compose(h,keyring,mode);
      assert.equal(other.providerStore.getKey('deepseek'),keyA,'the other TALOS uses the saved key');
      const [entry]=other.providerStore.elencaPool('deepseek');
      assert.ok(entry?.impronta,'the other TALOS lists the saved key');
      /* the person removes it in the interactive TALOS, through the same door as `talos provider remove-key` */
      await screen.tuiCatalog.clearProviderKey('deepseek');
      assert.equal([...keyring.entries.values()].includes(keyA),false,'the key is gone from the keyring after the removal');
      /* the other TALOS's run gets a 401 on that key: the kernel benches it (runtime-owner-adapter.mjs:1459) */
      other.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'credenziale'});
      assert.equal([...keyring.entries.values()].includes(keyA),false,'the removed key was written back into the keyring');
      third=await compose(h,keyring);
      assert.equal(third.providerStore.elencaPool('deepseek').length,0,'a TALOS started now has the removed key again');
    }finally{await screen.runtime.close?.();await other?.runtime.close?.();await third?.runtime.close?.();}
  }));
}

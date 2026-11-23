/*
 * Review of 0.6.4, eighth round (bugfixer, 14/10/2026) — written RED against adb2a4a7b, NOT RUN (a gate was running).
 *
 * 064h-1 — `readAgain` (talos-composition.ts, adb2a4a7b) reads the keyring a second time only when `!elsewhere&&lostSavedKeys(...)`.
 *   Since adb2a4a7b the retry no longer chooses between «the store of before» and «the read»: it only reads AGAIN, and the second
 *   read is used either way. The `!elsewhere` gate therefore no longer protects anything — it only skips the retry whenever ANY
 *   followed file changed since this TALOS last looked (an address saved, an environment key answered, a provider check that wrote
 *   provider-state.json, in any other TALOS). For a `use` runner (`-p`, automation, `session resume`) `knownCredentialFiles` moves
 *   only at its own writes, so after hours of uptime `elsewhere` is almost always true.
 *   With `elsewhere` true, ONE failed keyring read (system-keyring.ts `get` answers null for any error) is the store the writer acts
 *   on: the fallback is the single legacy key, and the kernel's bench (`mettiInPanchina`, a 401/429 on that key) rewrites the pool
 *   index with that key alone. The other saved keys drop out of the index (their secrets stay orphaned in the pool service) for
 *   every TALOS. The cure is one token: drop `!elsewhere&&` (a second read when saved keys look missing costs nothing otherwise).
 *
 * The failure is simulated exactly as the system keyring reports it: `get` answers null for the index once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL} from './r5a-r-fixture.ts';

function flakyKeyring(){
  const base=fakeKeyring();let failIndexReads=0;
  return{
    entries:base.entries,
    failNextIndexRead(){failIndexReads+=1;},
    get:(s:string,a:string)=>{if(failIndexReads>0&&a==='deepseek:indice'){failIndexReads-=1;return null;}return base.get(s,a);},
    set:base.set,remove:base.remove,
  };
}
async function compose(h:Hermetic,keyring:ReturnType<typeof flakyKeyring>,environmentKeys:'consent'|'use'='consent'){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:'http://127.0.0.1:9'});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,DEEPSEEK_API_KEY:undefined},environmentKeys,keyring} as any) as Promise<any>;
}

for(const mode of ['use','consent'] as const){
  test(`review of 0.6.4, 064h-1 (${mode}): one failed keyring read while another TALOS changed a followed file does not drop the other saved keys`,{timeout:120_000},async()=>hermetic(async h=>{
    const keyA=dummyKey('deepseek-a');const keyB=dummyKey('deepseek-b');const keyring=flakyKeyring();
    const screen=await compose(h,keyring);
    let other:any=null;let third:any=null;
    try{
      /* two saved keys: the first one saved alone (legacy form), the second added to the pool (the index is written, A stays legacy) */
      screen.providerStore.setKey('deepseek',keyA);
      screen.providerStore.aggiungiChiave('deepseek',keyB);
      other=await compose(h,keyring,mode);
      const pool=other.providerStore.elencaPool('deepseek');
      assert.equal(pool.length,2,'the other TALOS lists both saved keys');
      /* another TALOS saves an address: a followed file changes (size differs, so the fingerprint moves whatever the mtime) */
      writeProviderRuntime(h.paths,{deepseek:'http://127.0.0.1:19'});
      /* the next keyring read of the index fails, as the system keyring reports it: «no entry» */
      keyring.failNextIndexRead();
      /* the other TALOS's run gets a 401 on key A: the kernel benches it (runtime-owner-adapter.mjs:1459) */
      other.providerStore.mettiInPanchina('deepseek',pool[0].impronta,{classe:'credenziale'});
      third=await compose(h,keyring);
      assert.equal(third.providerStore.elencaPool('deepseek').length,2,'a TALOS started now lost a saved key from the pool index');
    }finally{await screen.runtime.close?.();await other?.runtime.close?.();await third?.runtime.close?.();}
  }));
}

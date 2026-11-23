/*
 * Review of 0.6.4, third round (bugfixer, 14/10/2026) — written RED against 862dc606c, NOT RUN (a gate was running).
 * The store is now built again whenever one of three files changes (consent record, provider-runtime.json, provider-state.json),
 * including this process's OWN writes (a check of the status row, a provider chosen, an address set). The rebuild calls
 * `loadFromKeyring`, whose one-time BUG-25 migration (harness-ui/src/provider-credential-store.mjs, `creditoEreditato`) loads a
 * single saved key benched for `credito` as AVAILABLE, even when the bench was declared by the provider a minute ago in this same
 * process (`eseguiConFallback`, post-run bench). `carryEnvironmentBenches` skips saved keys («their bench is in the keyring»), so
 * the declared credit bench of a saved single key is lost at the next rebuild, and the key is sent again before the declared reset.
 * The environment-key twin is carried (064b-1); the saved-key one is not.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {runTurn,startScriptedProvider,MODEL} from './r5a-r-fixture.ts';

async function compose(h:Hermetic,url:string,keyring:ReturnType<typeof fakeKeyring>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:url});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,DEEPSEEK_API_KEY:undefined},environmentKeys:'consent',keyring} as any) as Promise<any>;
}

test('review of 0.6.4, 064c-1: a declared credit bench on a SAVED single key survives a rebuild of the store (own consent write)',{timeout:120_000,todo:'fourth review of 0.6.4 (B1): carrying the bench of a saved key wrote the keyring from a read and undid a key saved again elsewhere; the loss is the BUG-25 migration running at every loadFromKeyring (told to the desktop); kept for that cure',},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const open=await compose(h,'http://127.0.0.1:9',keyring);
  try{
    open.providerStore.setKey('deepseek',key);
    const [entry]=open.providerStore.elencaPool('deepseek');
    assert.ok(entry,'the saved key is in the pool');
    /* what eseguiConFallback does after a run refused for credit with a declared reset (BUG-25: «anche a chiave unica») */
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'credito',resetAt:Date.now()+30*60_000});
    assert.equal(open.providerStore.getKey('deepseek'),null,'benched until the declared reset');
    /* any own write of a followed file: here the provider chosen again (provider-consent.json) */
    await open.tuiCatalog.chooseProvider('deepseek');
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.equal(open.providerStore.getKey('deepseek'),null,'the declared credit bench of the saved key is still there after the rebuild');
    const [after]=open.providerStore.elencaPool('deepseek');
    assert.equal(after?.stato,'in-panchina');assert.equal(after?.causa,'credito');
  }finally{await open.runtime.close?.();}
}));

test('review of 0.6.4, 064c-1 (run): the saved key benched for credit is not sent again after this TALOS writes a followed file',{timeout:180_000,todo:'fourth review of 0.6.4 (B1): carrying the bench of a saved key wrote the keyring from a read and undid a key saved again elsewhere; the loss is the BUG-25 migration running at every loadFromKeyring (told to the desktop); kept for that cure',},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const open=await compose(h,fake.url,keyring);
  try{
    open.providerStore.setKey('deepseek',key);await open.tuiCatalog.chooseProvider('deepseek');
    const first=await runTurn(open,h,'hello');
    assert.ok(first.raw.some((e:any)=>e?.type==='RunFinished'),'the saved key works');
    const [entry]=open.providerStore.elencaPool('deepseek');
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'credito',resetAt:Date.now()+30*60_000});
    /* the person picks the provider again (or the status row checks another provider): a followed file changes */
    await open.tuiCatalog.chooseProvider('deepseek');
    await new Promise(resolve=>setTimeout(resolve,400));
    const before=fake.requests.length;
    await runTurn(open,h,'hello again').catch(()=>null);
    assert.equal(fake.requests.length,before,'the key benched for credit until a declared moment was not sent again');
  }finally{await open.runtime.close?.();await fake.close();}
}));

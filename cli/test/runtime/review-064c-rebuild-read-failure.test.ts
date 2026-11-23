/*
 * Review of 0.6.4, third round (bugfixer, 14/10/2026) — written RED against 862dc606c, NOT RUN (a gate was running).
 * talos-composition.ts `followCredentialsChangedElsewhere` records the new fingerprint BEFORE building the store, and says «the
 * store of before stays: a read that fails withdraws nothing». But `buildStore` never throws for a failed read: the kernel's
 * `loadFromKeyring` swallows a keychain error per provider, and the consent record reads as empty when it cannot be parsed. A
 * keychain read that fails ONCE during a rebuild (now made at every change of three files, own writes included) leaves a store
 * without the saved key, and nothing builds it again until another of the three files changes: for the rest of the session the
 * provider reads «key missing».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL} from './r5a-r-fixture.ts';

function flakyKeyring(){
  const inner=fakeKeyring();let failing=false;
  return{entries:inner.entries,fail(on:boolean){failing=on;},
    get:(s:string,a:string)=>{if(failing)throw new Error('keychain busy');return inner.get(s,a);},set:inner.set,remove:inner.remove};
}

async function compose(h:Hermetic,keyring:ReturnType<typeof flakyKeyring>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:'http://127.0.0.1:9'});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,DEEPSEEK_API_KEY:undefined},environmentKeys:'consent',keyring} as any) as Promise<any>;
}

test('review of 0.6.4, 064c-2: one keychain read that fails during a rebuild does not withdraw the saved key for the rest of the session',{timeout:120_000,todo:'NIT of the third review of 0.6.4: a failed keychain read during a rebuild fails closed until the next change of a followed file; kept for after 0.6.4'},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=flakyKeyring();
  const open=await compose(h,keyring);
  try{
    open.providerStore.setKey('deepseek',key);
    assert.equal(open.providerStore.getKey('deepseek'),key,'saved and in use');
    /* the keychain fails for a moment (another process holds it, an antivirus scan) while a followed file changes */
    keyring.fail(true);
    await open.tuiCatalog.chooseProvider('deepseek');
    await new Promise(resolve=>setTimeout(resolve,400));
    try{open.providerStore.getKey('deepseek');}catch{/* the read during the failure may say anything */}
    keyring.fail(false);
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.equal(open.providerStore.getKey('deepseek'),key,'the keychain answers again: the saved key is used again (or was never dropped)');
  }finally{await open.runtime.close?.();}
}));

/*
 * 14/10/2026 (found by the bugfixer's s65 run): a key withdrawn by ANOTHER TALOS process — an environment key it declined, or a
 * saved key it removed — was still sent by a screen already open: its credential store was read once, at start. The row said
 * «not verified», the next turn still sent the withdrawn key. F-H-001 and F-S-002 closed the same defect inside ONE process.
 * Now, before each run, the CLI rebuilds its store when the consent record or the provider-state snapshot changed elsewhere
 * (the other process writes both when it withdraws a key); benched keys survive (they live in the keyring's pool index).
 * Two composed runtimes on one profile and one keyring stand for the two processes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {runTurn,startScriptedProvider,MODEL} from './r5a-r-fixture.ts';

async function compose(h:Hermetic,url:string,keyring:ReturnType<typeof fakeKeyring>,env:Record<string,string|undefined>,{writeRuntime=true}:{writeRuntime?:boolean}={}){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  /* review of 0.6.4: the second TALOS does not write the addresses file again — that write alone made the open one rebuild, and
     hid whether the withdrawal itself is followed */
  if(writeRuntime)writeProviderRuntime(h.paths,{deepseek:url});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,...env},environmentKeys:'consent',keyring} as any) as Promise<any>;
}

test('an environment key declined by another TALOS is not sent by the one already open',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const env={DEEPSEEK_API_KEY:key};
  const open=await compose(h,fake.url,keyring,env);
  try{
    await open.tuiCatalog.answerEnvironmentKey('deepseek','yes');await open.tuiCatalog.chooseProvider('deepseek');
    const first=await runTurn(open,h,'hello');
    assert.ok(first.raw.some((e:any)=>e?.type==='RunFinished'),'the approved key works');
    const other=await compose(h,fake.url,keyring,env);
    await other.tuiCatalog.answerEnvironmentKey('deepseek','no');await other.runtime.close?.();
    const before=fake.requests.length;
    await assert.rejects(runTurn(open,h,'hello again'),/./u).catch(()=>{});
    assert.equal(fake.requests.length,before,'the declined key was not sent');
  }finally{await open.runtime.close?.();await fake.close();}
}));

test('a saved key removed by another TALOS is not sent by the one already open',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const open=await compose(h,fake.url,keyring,{DEEPSEEK_API_KEY:undefined});
  try{
    open.providerStore.setKey('deepseek',key);await open.tuiCatalog.chooseProvider('deepseek');
    const first=await runTurn(open,h,'hello');
    assert.ok(first.raw.some((e:any)=>e?.type==='RunFinished'));
    const other=await compose(h,fake.url,keyring,{DEEPSEEK_API_KEY:undefined},{writeRuntime:false});
    await other.tuiCatalog.clearProviderKey('deepseek');await other.runtime.close?.();
    const before=fake.requests.length;
    await runTurn(open,h,'hello again').catch(()=>null);
    assert.equal(fake.requests.length,before,'the removed key was not sent');
  }finally{await open.runtime.close?.();await fake.close();}
}));

test('review of 0.6.4 (S2): this TALOS\'s own check does not rebuild the store, so a benched environment key stays benched',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const open=await compose(h,fake.url,keyring,{DEEPSEEK_API_KEY:key});
  try{
    await open.tuiCatalog.answerEnvironmentKey('deepseek','yes');await open.tuiCatalog.chooseProvider('deepseek');
    const first=await runTurn(open,h,'hello');
    assert.ok(first.raw.some((e:any)=>e?.type==='RunFinished'),'the approved key works');
    /* the kernel benches a key after a refusal it classifies (a rate limit here); an environment key's bench lives in memory only */
    const [entry]=open.providerStore.elencaPool('deepseek');
    assert.ok(entry,'the environment key is in the pool');
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'traffico',resetAt:Date.now()+30*60_000});
    assert.equal(open.providerStore.getKey('deepseek'),null,'benched');
    /* this process checks the provider: the check writes the shared state file */
    try{await open.tuiCatalog.probeProvider('deepseek');}catch{/* the answer does not matter: the write does */}
    const before=fake.requests.length;
    await runTurn(open,h,'hello again').catch(()=>null);
    assert.equal(fake.requests.length,before,'the benched key was not sent again');
  }finally{await open.runtime.close?.();await fake.close();}
}));

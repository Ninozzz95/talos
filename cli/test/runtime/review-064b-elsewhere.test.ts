/*
 * Review of 0.6.4, second round (bugfixer, 14/10/2026) — written RED against 32c08de9d; cured in talos-composition.ts (the three files followed, benches carried) and catalog-service.ts (readiness asks the address).
 * Two composed runtimes on one profile and one keyring stand for two TALOS processes (as credential-withdrawn-elsewhere.test.ts).
 *  1. S2 is cured only within ONE process: a check made by ANOTHER TALOS writes the shared snapshot, the open one is told with the
 *     cause `file`, rebuilds its store, and an environment key benched in its memory is sent again.
 *  2. The Z.AI address chosen in another process (exactly the command the refusal tells the person to run) never reaches an open
 *     TALOS: its store read `provider-runtime.json` once, and nothing rebuilds it for that file.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {runTurn,startScriptedProvider,MODEL} from './r5a-r-fixture.ts';

async function compose(h:Hermetic,url:string,keyring:ReturnType<typeof fakeKeyring>,env:Record<string,string|undefined>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:url});
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env,...env},environmentKeys:'consent',keyring} as any) as Promise<any>;
}

test('review of 0.6.4, 064b-1: a check made by ANOTHER TALOS un-benches the environment key of the open one, which is sent again',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const keyring=fakeKeyring();
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const open=await compose(h,fake.url,keyring,{DEEPSEEK_API_KEY:key});
  try{
    await open.tuiCatalog.answerEnvironmentKey('deepseek','yes');await open.tuiCatalog.chooseProvider('deepseek');
    const first=await runTurn(open,h,'hello');
    assert.ok(first.raw.some((e:any)=>e?.type==='RunFinished'),'the approved key works');
    const [entry]=open.providerStore.elencaPool('deepseek');
    assert.ok(entry,'the environment key is in the pool');
    open.providerStore.mettiInPanchina('deepseek',entry.impronta,{classe:'traffico',resetAt:Date.now()+30*60_000});
    assert.equal(open.providerStore.getKey('deepseek'),null,'benched');
    /* a second TALOS (another terminal, same profile, same environment) checks the provider: it writes the shared snapshot */
    const other=await compose(h,fake.url,keyring,{DEEPSEEK_API_KEY:key});
    try{await other.tuiCatalog.probeProvider('deepseek');}catch{/* the write is what matters */}
    await other.runtime.close?.();
    await new Promise(resolve=>setTimeout(resolve,2_500));
    const before=fake.requests.length;
    await runTurn(open,h,'hello again').catch(()=>null);
    assert.equal(fake.requests.length,before,'the benched environment key was not sent again');
  }finally{await open.runtime.close?.();await fake.close();}
}));

async function composeZai(h:Hermetic,keyring:ReturnType<typeof fakeKeyring>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  return composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'zai:glm-5.3-flash',env:{...process.env,ZAI_API_KEY:undefined},environmentKeys:'consent',keyring} as any) as Promise<any>;
}

test('review of 0.6.4, 064b-2: the Z.AI address chosen in another TALOS (the remedy the refusal prints) never reaches the open one',{timeout:120_000},async()=>hermetic(async h=>{
  writeProviderRuntime(h.paths,{});
  const keyring=fakeKeyring();
  const open=await composeZai(h,keyring);
  try{
    open.providerStore.setKey('zai',dummyKey('zai-saved'));
    const refused:any=await open.providerControlPlane.probe('zai');
    assert.equal(refused.lastHealth?.code,'PROVIDER_ADDRESS_REQUIRED','no address yet');
    /* `talos provider configure zai --address plan-china` in another terminal: provider-cli.ts does store.setRuntime + invalidate */
    const other=await composeZai(h,keyring);
    other.providerStore.setRuntime('zai',{endpoint:'https://open.bigmodel.cn/api/coding/paas/v4'});
    assert.equal(other.providerStore.getRuntime('zai').endpointConfigured,true,'chosen on disk');
    await other.runtime.close?.();
    await new Promise(resolve=>setTimeout(resolve,2_500));
    open.providerControlPlane.invalidate('zai');
    assert.equal(open.providerStore.getRuntime('zai').endpointConfigured,true,'the open TALOS knows the address the person chose');
  }finally{await open.runtime.close?.();}
}));

test('review of 0.6.4, 064b-4: `talos doctor` (and the screen\'s readiness) call a Z.AI turn ready while every run is refused for the address',{timeout:120_000},async()=>hermetic(async h=>{
  writeProviderRuntime(h.paths,{});
  const keyring=fakeKeyring();
  const open=await composeZai(h,keyring);
  try{
    open.providerStore.setKey('zai',dummyKey('zai-saved'));
    await open.tuiCatalog.chooseProvider('zai');
    const {turnReadiness}=await import('../../src/diagnostics/doctor.ts');
    const turn=await turnReadiness({catalog:open.tuiCatalog,control:open.providerControlPlane,model:'zai:glm-5.3-flash'});
    assert.equal(turn.ready,false,`doctor says ready: ${JSON.stringify(turn)}`);
    assert.equal(turn.reasons[0]?.code,'PROVIDER_ADDRESS_REQUIRED');
  }finally{await open.runtime.close?.();}
}));

test('review of 0.6.4, 064b-3: the Z.AI address CHANGED in another TALOS: the open one keeps sending the key to the old address',{timeout:120_000},async()=>hermetic(async h=>{
  writeProviderRuntime(h.paths,{});
  const keyring=fakeKeyring();
  const open=await composeZai(h,keyring);
  try{
    open.providerStore.setKey('zai',dummyKey('zai-saved'));
    open.providerStore.setRuntime('zai',{endpoint:'https://api.z.ai/api/coding/paas/v4'});
    /* the person switches to the China balance in another terminal (`talos provider configure zai --address balance-china`) */
    const other=await composeZai(h,keyring);
    other.providerStore.setRuntime('zai',{endpoint:'https://open.bigmodel.cn/api/paas/v4'});
    await other.runtime.close?.();
    await new Promise(resolve=>setTimeout(resolve,2_500));
    open.providerControlPlane.invalidate('zai');
    try{await open.providerControlPlane.probe('zai');}catch{/* where it tried to go is what matters */}
    assert.deepEqual([...new Set(h.network.blocked.filter(origin=>/z\.ai|bigmodel\.cn/u.test(origin)))],['https://open.bigmodel.cn'],'the key goes only to the address chosen now');
  }finally{await open.runtime.close?.();}
}));

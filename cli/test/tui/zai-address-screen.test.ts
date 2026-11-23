/*
 * 14/10/2026, owner: «the Z.AI key only to the address you chose», «Te lo chiede quando metti la chiave». On the real screen
 * (the TUI mounted on the composed runtime, as the person runs it): /provider → Z.AI asks the address FIRST, the plan first;
 * the key typed after it is tested only at that address. The network is hermetic: every request to a real host is blocked and
 * recorded, so the recorded origins say exactly where the key would have gone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,flat,fakeKeyring,hermetic,KEYS,mountTui,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

async function compose(h:Hermetic){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{});
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env,ZAI_API_KEY:undefined},environmentKeys:'consent',keyring:fakeKeyring()} as any);
  return context;
}
async function openZai(tui:any){
  await tui.typeAndEnter('/provider');
  await tui.until((f:string)=>/── (?:Models|AI provider) /u.test(f),'the provider sheet');
  tui.write('/');tui.write('zai');
  await tui.until((f:string)=>f.includes('/ zai')&&f.includes(' of '),'the sheet filtered to zai');
  tui.write(KEYS.enter);await tui.until((f:string)=>f.includes('enter use'),'the filter ended');
}

test('/provider → Z.AI asks the address first, and the key goes only to the address chosen',async()=>hermetic(async h=>{
  const context=await compose(h);
  const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:100});
  const key=dummyKey('zai');
  try{
    await openZai(tui);
    tui.write(KEYS.enter);
    await tui.until(f=>flat(f).includes('Which Z.AI address should your key go to?')&&f.includes('› GLM Coding Plan (Recommended)'),'the address question, the plan first');
    assert.deepEqual(h.network.blocked,[],'nothing was sent before the address');
    tui.write(KEYS.down);tui.write(KEYS.down);
    await tui.until(f=>f.includes('› GLM Coding Plan (China)'),'the China plan selected');
    tui.write(KEYS.enter);
    await tui.until(f=>f.includes('API key for Z.AI:'),'the key entry after the address');
    assert.ok(tui.frames.some((f:string)=>flat(f).includes('Z.AI will use the GLM Coding Plan (China); your key is sent only there.')),'the choice is said');
    const runtime=context.providerStore.getRuntime('zai');
    assert.equal(runtime.endpoint,'https://open.bigmodel.cn/api/coding/paas/v4');
    assert.equal(runtime.endpointConfigured,true);
    tui.write(key);await tui.until(f=>f.includes('•'.repeat(key.length)),'the masked key');
    tui.write(KEYS.enter);
    await tui.until(()=>h.network.blocked.length>0,'the key test',30000);
    await new Promise(resolve=>setTimeout(resolve,300));
  }finally{tui.unmount();}
  assert.deepEqual([...new Set(h.network.blocked)],['https://open.bigmodel.cn'],'the key test went only to the address chosen');
}));

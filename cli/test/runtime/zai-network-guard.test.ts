/*
 * 14/10/2026, owner: «the Z.AI key only to the address you chose». Besides a run and the key test, the screen's own checks send
 * the key: the status row's check at start, a provider check, the live model list (all through the kernel's provider probe).
 * With a key saved before today and no address chosen they would go to the default address. The composed runtime's network
 * doors refuse any request to a Z.AI address other than the chosen one, before it leaves; the hermetic network records where
 * a request tried to go.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {zaiRequestAllowed} from '../../src/provider/zai-addresses.ts';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

test('the rule: only the chosen Z.AI address; any other host untouched',()=>{
  const chosen={endpoint:'https://api.z.ai/api/coding/paas/v4',endpointConfigured:true};
  const none={endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:false};
  assert.equal(zaiRequestAllowed('https://api.z.ai/api/coding/paas/v4/models',chosen),true);
  assert.equal(zaiRequestAllowed('https://api.z.ai/api/paas/v4/models',chosen),false,'the balance, not chosen');
  assert.equal(zaiRequestAllowed('https://open.bigmodel.cn/api/coding/paas/v4/models',chosen),false,'China, not chosen');
  assert.equal(zaiRequestAllowed('https://api.z.ai/api/paas/v4/models',none),false,'nothing chosen: not even the default');
  assert.equal(zaiRequestAllowed('https://api.z.ai/api/anthropic/v1/messages',none),true,'zai-anthropic is another provider with its own address');
  assert.equal(zaiRequestAllowed('https://api.openai.com/v1/models',none),true);
  assert.equal(zaiRequestAllowed('http://127.0.0.1:1234/v1/models',none),true);
  /* review of 0.6.4 (NIT): the same address written another way is still that address */
  assert.equal(zaiRequestAllowed('HTTPS://API.Z.AI:443/api/paas/v4/chat/completions',none),false,'case and the default port');
  assert.equal(zaiRequestAllowed('https://api.z.ai/api/paas/v4?x=1',none),false,'a query on the bare address');
  assert.equal(zaiRequestAllowed('HTTPS://API.Z.AI/api/coding/paas/v4/models',chosen),true,'the chosen one, in capitals');
});

async function compose(h:Hermetic,{chosen}:{chosen:string|null}){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{});
  const keyring=fakeKeyring();
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'zai:glm-5.3-flash',env:{...process.env,ZAI_API_KEY:undefined},environmentKeys:'consent',keyring} as any);
  context.providerStore.setKey('zai',dummyKey('zai-saved'));
  if(chosen)context.providerStore.setRuntime('zai',{endpoint:chosen});
  return context;
}

test('a saved Z.AI key and no address: the provider check and the model list send nothing to Z.AI',async()=>hermetic(async h=>{
  const context=await compose(h,{chosen:null});
  try{await context.tuiCatalog.probeProvider('zai');}catch{/* the answer does not matter here: where the request went does */}
  try{await context.tuiCatalog.providerModels('zai');}catch{/* idem */}
  assert.deepEqual(h.network.blocked.filter(origin=>/z\.ai|bigmodel\.cn/u.test(origin)),[],String(h.network.blocked));
}));

test('review of 0.6.4 (S5): the check with no address says «choose an address», not «unreachable»',async()=>hermetic(async h=>{
  const context=await compose(h,{chosen:null});
  const profile:any=await context.providerControlPlane.probe('zai');
  assert.notEqual(profile.lastHealth?.state,'unreachable',JSON.stringify(profile.lastHealth));
  assert.equal(profile.lastHealth?.code,'PROVIDER_ADDRESS_REQUIRED');
  assert.equal(profile.remediation?.code,'choose-address');
  assert.match(String(profile.remediation?.message),/address/u);
  assert.deepEqual(h.network.blocked.filter(origin=>/z\.ai|bigmodel\.cn/u.test(origin)),[]);
}));

test('with the address chosen, the same checks go to that address only',async()=>hermetic(async h=>{
  const context=await compose(h,{chosen:'https://open.bigmodel.cn/api/paas/v4'});
  try{await context.tuiCatalog.probeProvider('zai');}catch{}
  try{await context.tuiCatalog.providerModels('zai');}catch{}
  assert.ok(h.network.blocked.length>0,'the checks did try the network');
  assert.deepEqual([...new Set(h.network.blocked.filter(origin=>/z\.ai|bigmodel\.cn/u.test(origin)))],['https://open.bigmodel.cn']);
}));

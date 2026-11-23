import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {ZAI_ADDRESSES,parseZaiAddress,zaiAddressChosen,zaiAddressOf} from '../../src/provider/zai-addresses.ts';

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));

test('the four Z.AI addresses are the kernel\'s own, plan first',async()=>{
  const kernel:any=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','zai-indirizzo.mjs')).href);
  assert.deepEqual([...ZAI_ADDRESSES.map(a=>a.endpoint)].sort(),[...kernel.INDIRIZZI_ZAI.map((a:any)=>a.endpoint)].sort());
  for(const address of ZAI_ADDRESSES)assert.equal(kernel.INDIRIZZI_ZAI.find((k:any)=>k.endpoint===address.endpoint).id,address.id);
  assert.equal(ZAI_ADDRESSES[0]!.id,'coding','the plan first (owner 09/10)');
});

test('what the person types: a word or one of the four endpoints, nothing else',()=>{
  assert.equal(parseZaiAddress('plan')?.id,'coding');
  assert.equal(parseZaiAddress(' Balance ')?.id,'general');
  assert.equal(parseZaiAddress('plan-china')?.id,'coding-cn');
  assert.equal(parseZaiAddress('balance-china')?.id,'general-cn');
  assert.equal(parseZaiAddress('https://open.bigmodel.cn/api/coding/paas/v4/')?.id,'coding-cn');
  assert.equal(parseZaiAddress('https://evil.example/api/paas/v4'),null);
  assert.equal(parseZaiAddress('china'),null);
  assert.equal(parseZaiAddress(undefined),null);
  assert.equal(zaiAddressOf('https://api.z.ai/api/paas/v4')?.label,'pay-as-you-go balance');
});

test('chosen only when the person set it (the store\'s endpointConfigured), not when the default is in use',()=>{
  assert.equal(zaiAddressChosen({endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:true}),true);
  assert.equal(zaiAddressChosen({endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:false}),false);
  assert.equal(zaiAddressChosen({}),false);
  assert.equal(zaiAddressChosen(null),false);
});

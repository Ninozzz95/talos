/*
 * 14/10/2026, owner: the Z.AI key goes only to the address the person chose. The catalog every screen uses: the Z.AI row says
 * whether an address is chosen and which; the screen chooses it through the catalog; and NO key test (the one request that
 * sends a Z.AI key from the screen) runs before an address is chosen — whatever screen asks for it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';

function zaiDeps(start:Record<string,unknown>={}){
  let runtime:Record<string,unknown>={endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:false,...start};
  const sent:string[]=[];const endpoints:string[]=[];
  const deps:TuiCatalogDeps={
    publicProviders:()=>[{id:'zai',label:'Z.AI',requiresKey:true,keyConfigured:false,supportsEndpoint:true,supportsOAuth:false,execution:'collegato'}],
    registry:{zai:{id:'zai',etichetta:'Z.AI',destinazioneChat:true,descrizione:'GLM',auth:{tipo:'bearer'},chiaveObbligatoria:true,credenziale:true,wire:'openai-chat',baseUrl:'https://api.z.ai/api/paas/v4'}},
    runtimeFor:(id:string)=>id==='zai'?runtime:{},keyFor:()=>null,setKey:()=>{},clearKey:()=>{},persistModel:async()=>{},
    setEndpoint:(id:string,endpoint:string)=>{endpoints.push(`${id}:${endpoint}`);runtime={...runtime,endpoint,endpointConfigured:true};},
    createKeyProbe:(id:string)=>({prova:async()=>{sent.push(`${id}:${String(runtime.endpoint)}`);return{provider:id,esito:'collegato',credenzialeVerificata:true,stato:200};}}),
    createProbe:()=>({prova:async(id:string)=>({provider:id,esito:'collegato'}),elencaModelli:async(id:string)=>({provider:id,fonte:'documentazione',modelli:[]})}),
  } as any;
  return{deps,sent,endpoints,runtime:()=>runtime};
}

test('no Z.AI key test before an address is chosen: refused, nothing sent',async()=>{
  const z=zaiDeps();const svc=createTuiCatalogService(z.deps);
  await assert.rejects(svc.setProviderKey('zai','zai-key-123456'),{code:'PROVIDER_ADDRESS_REQUIRED'});
  await assert.rejects(svc.testProviderKey('zai','zai-key-123456'),{code:'PROVIDER_ADDRESS_REQUIRED'});
  assert.deepEqual(z.sent,[]);
});

test('the Z.AI row says whether an address is chosen, and which; the screen chooses it through the catalog',async()=>{
  const z=zaiDeps();const svc=createTuiCatalogService(z.deps);
  const before=(await svc.listProviders()).find(row=>row.id==='zai')!;
  assert.equal(before.addressChosen,false);
  assert.equal(before.address,null);
  await svc.chooseProviderAddress!('zai','https://api.z.ai/api/coding/paas/v4');
  assert.deepEqual(z.endpoints,['zai:https://api.z.ai/api/coding/paas/v4']);
  const after=(await svc.listProviders()).find(row=>row.id==='zai')!;
  assert.equal(after.addressChosen,true);
  assert.equal(after.address,'GLM Coding Plan');
  const saved=await svc.setProviderKey('zai','zai-key-123456');
  assert.equal(saved.saved,true);
  assert.deepEqual(z.sent,['zai:https://api.z.ai/api/coding/paas/v4'],'the key test went to the chosen address only');
});

test('only one of the four Z.AI addresses, and only for Z.AI',async()=>{
  const z=zaiDeps();const svc=createTuiCatalogService(z.deps);
  await assert.rejects(svc.chooseProviderAddress!('zai','https://evil.example/v4'),{code:'PROVIDER_ADDRESS_INVALID'});
  await assert.rejects(svc.chooseProviderAddress!('openai','https://api.z.ai/api/coding/paas/v4'),{code:'PROVIDER_ADDRESS_INVALID'});
  assert.deepEqual(z.endpoints,[]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {createProviderPickerModel,providerPickerEnter,maskedSecret} from '../../src/tui/overlays/provider-picker.ts';
import {commitModelSelection,createModelPickerModel} from '../../src/tui/overlays/model-picker.ts';

test('provider picker loads rows without probing every provider',async()=>{
  const calls:string[]=[];
  const catalog:any={listProviders:async()=>[{id:'openai'}],probeProvider:async(id:string)=>{calls.push(id);return{provider:id,state:'available',detail:'ok',latencyMs:1};},listModels:async()=>[],selectModel:async()=>{},setProviderKey:async()=>{},clearProviderKey:async()=>{}};
  const model=createProviderPickerModel(catalog);
  await model.open();
  assert.equal(calls.length,0);
  await model.probeSelected();
  assert.equal(calls.length,1);
});

test('provider drill-down opens the same model picker with provider filter',()=>{
  const result=providerPickerEnter({selectedProvider:'anthropic',configured:true});
  assert.deepEqual(result,{kind:'open-model-picker',provider:'anthropic'});
  assert.deepEqual(providerPickerEnter({selectedProvider:'openai',configured:false}),{kind:'provider-setup',provider:'openai'});
});

test('model selection persists project-user and only then updates subsequent-run model',async()=>{
  const calls:any[]=[];const catalog:any={selectModel:async(id:string,scope:string)=>{calls.push([id,scope]);}};
  let current='openai:a';
  await commitModelSelection({id:'anthropic:b',catalog,setControllerModel:id=>{current=id;}});
  assert.deepEqual(calls,[['anthropic:b','project-user']]);
  assert.equal(current,'anthropic:b');
});

test('provider-scoped picker asks for that provider only, and a picker without a provider asks nothing',async()=>{
  const calls:any[]=[];const catalog:any={providerModels:async(provider:string)=>{calls.push(provider);return{provider,label:provider,rows:[],verified:true,notice:''};},listModels:async(input:any={})=>{calls.push(input);return[];},selectModel:async()=>{}};
  await createModelPickerModel(catalog,{provider:'ollama'}).open();
  assert.deepEqual(calls,['ollama']);
  calls.length=0;const global=createModelPickerModel(catalog,{provider:undefined});await global.open();assert.deepEqual(calls,[]);assert.deepEqual(global.rows(),[]);
});

test('provider scoped picker carries the rows, the verified flag and the notice of the catalog',async()=>{
  const catalog:any={providerModels:async()=>({provider:'ollama',label:'Ollama',rows:[{id:'ollama:a',provider:'ollama',name:'A',available:'documented'}],verified:false,notice:'Not verified.'})};
  const model=createModelPickerModel(catalog,{provider:'ollama'});await model.open();
  assert.deepEqual(model.rows().map((r:any)=>r.id),['ollama:a']);assert.equal(model.verified(),false);assert.equal(model.notice(),'Not verified.');assert.equal(model.label(),'Ollama');
});

test('cancel makes no persistence call',async()=>{
  let selects=0;const catalog:any={listModels:async()=>[],selectModel:async()=>{selects++;}};const model=createModelPickerModel(catalog,{provider:undefined});
  await model.open();model.cancel();
  assert.equal(selects,0);
});

test('secret masking never reveals the value',()=>{
  const secret='sk-super-secret';const rendered=maskedSecret(secret);
  assert.equal(rendered,'•'.repeat(secret.length));assert.doesNotMatch(rendered,/secret/u);
});


test('provider remediation routes auth/key failures to key setup and preserves the canonical message',()=>{
  const remediation={code:'replace-key',message:'OpenAI rejected the current credential. Replace or re-authorize the key.'};
  const result=providerPickerEnter({
    selectedProvider:'openai',configured:true,requiresKey:true,keySource:'saved',
    probe:{provider:'openai',state:'unavailable',detail:'HTTP 401',latencyMs:11,remediation,readinessCode:'PROVIDER_AUTH_FAILED'},
  } as any);
  assert.equal(result.kind,'provider-setup');
  if(result.kind!=='provider-setup')assert.fail('auth failure must enter provider key setup');
  assert.deepEqual((result as any).remediation,remediation);
});

test('provider remediation keeps endpoint/network failures out of key entry',()=>{
  const remediation={code:'check-endpoint',message:'OpenAI could not be reached. Check the endpoint and network, then retry.'};
  const result=providerPickerEnter({
    selectedProvider:'openai',configured:true,requiresKey:true,keySource:'saved',
    probe:{provider:'openai',state:'unavailable',detail:'network',latencyMs:25,remediation,readinessCode:'PROVIDER_UNREACHABLE'},
  } as any);
  assert.equal(result.kind,'provider-remediation');
  if(result.kind!=='provider-remediation')assert.fail('network failure must not masquerade as a key problem');
  assert.deepEqual((result as any).remediation,remediation);
});

test('a non-blocking inspect-provider advisory can still open the model picker',()=>{
  const remediation={code:'inspect-provider',message:'TALOS cannot verify OpenAI with a normal health probe.'};
  const result=providerPickerEnter({
    selectedProvider:'openai',configured:true,requiresKey:true,keySource:'saved',
    probe:{provider:'openai',state:'unknown',detail:'not probeable',latencyMs:null,remediation,readinessCode:null},
  } as any);
  assert.equal(result.kind,'open-model-picker');
  assert.deepEqual((result as any).remediation,remediation);
});

test('provider picker probes and writes only the selected provider',async()=>{
  const probed:string[]=[];const written:Array<[string,string]>=[];
  const catalog:any={
    listProviders:async()=>[
      {id:'openai',configured:true,requiresKey:true,keySource:'saved'},
      {id:'anthropic',configured:true,requiresKey:true,keySource:'saved'},
    ],
    probeProvider:async(id:string)=>{probed.push(id);return{provider:id,state:'available',detail:'ok',latencyMs:1,remediation:{code:'none',message:''},readinessCode:null};},
    setProviderKey:async(id:string,secret:string)=>{written.push([id,secret]);return{provider:id,label:id,outcome:'valid',passed:true,httpStatus:200,message:'ok',saved:true};},
    clearProviderKey:async()=>{},
  };
  const model=createProviderPickerModel(catalog);
  await model.open();
  model.select(1);
  const probe=await model.probeSelected();
  assert.equal(probe?.provider,'anthropic');
  await model.setSecret('anthropic-only-secret');
  assert.deepEqual(probed,['anthropic']);
  assert.deepEqual(written,[['anthropic','anthropic-only-secret']]);
});


test('benched credentials route to key setup with wait-or-add-key remediation',()=>{
  const remediation={code:'wait-or-add-key',message:'All OpenAI keys are benched until later; wait or add another key.'};
  const result=providerPickerEnter({
    selectedProvider:'openai',configured:false,requiresKey:true,keySource:'saved',
    probe:{provider:'openai',state:'unconfigured',detail:'no usable key',latencyMs:null,remediation,readinessCode:'PROVIDER_KEY_BENCHED'},
  } as any);
  assert.equal(result.kind,'provider-setup');
  if(result.kind!=='provider-setup')assert.fail('benched key should offer another provider key');
  assert.deepEqual((result as any).remediation,remediation);
});

test('keyless unconfigured provider shows configure-provider remediation instead of asking for an API key',()=>{
  const remediation={code:'configure-provider',message:'Configure External agent before using this provider.'};
  const result=providerPickerEnter({
    selectedProvider:'esterno',configured:false,requiresKey:false,keySource:'not-required',
    probe:{provider:'esterno',state:'unconfigured',detail:'not configured',latencyMs:null,remediation,readinessCode:'PROVIDER_NOT_CONFIGURED'},
  } as any);
  assert.equal(result.kind,'provider-remediation');
  if(result.kind!=='provider-remediation')assert.fail('keyless runtime setup must not become key entry');
  assert.deepEqual((result as any).remediation,remediation);
});

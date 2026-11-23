import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiCatalogService,normalizeModels} from '../../src/tui/catalog-service.ts';
import {reasoningUsageEvidence,reasoningUsageLabel} from '../../src/tui/state.ts';

test('M4-D RED — observed allowed_options become a bounded effort subset',()=>{
  const rows=normalizeModels([{id:'m',capabilities:{reasoning:{allowed_options:['low','medium','bogus','high']}}}],'lmstudio','remote');
  assert.equal(rows[0]?.reasoning,true);
  assert.deepEqual(rows[0]?.reasoningEfforts,['low','medium','high']);
});

test('M4-D RED — reasoning=true alone never invents an effort ladder',()=>{
  const rows=normalizeModels([{id:'m',reasoning:true}],'openai','documented');
  assert.equal(rows[0]?.reasoning,true);
  assert.equal(rows[0]?.reasoningEfforts,null);
});

test('M4-D RED — provider registry per-model livelliRagionamento enrich known models',async()=>{
  const registry:any={
    openai:{id:'openai',etichetta:'OpenAI',destinazioneChat:true,descrizione:'OpenAI',auth:{tipo:'bearer'},chiaveObbligatoria:true,credenziale:true,wire:'openai-chat',esecuzione:'collegato',cloud:true,
      modelliDiRiserva:[{id:'gpt',nome:'GPT',reasoning:true}],
      richiestaCompatibile:{modelli:{gpt:{livelliRagionamento:['low','high','max']}}},
    },
  };
  const svc=createTuiCatalogService({
    publicProviders:()=>[{id:'openai',label:'OpenAI',requiresKey:true,keyConfigured:true,supportsEndpoint:true,supportsOAuth:false,execution:'collegato'}],
    registry,runtimeFor:()=>({}),keyFor:()=> 'k',setKey:()=>{},clearKey:()=>{},persistModel:async()=>{},
    createProbe:()=>({prova:async()=>({esito:'collegato'}),elencaModelli:async()=>({fonte:'documentazione',modelli:[]})}),
  } as any);
  const rows=await svc.listModels({provider:'openai'});
  assert.deepEqual(rows.find(row=>row.id==='openai:gpt')?.reasoningEfforts,['low','high','max']);
});

/* F-B-002 (stress test of 0.5.0, 09/10/2026): `model effort max` with zai-anthropic:glm-5.3-flash sent no effort at all — the
   registry declares the port's levels once, on the provider (`ragionamento.livelli`, docs.z.ai/devpack/latest-model), and the
   catalog looked only per model, so -p said "not affirmed" and sent nothing. The provider-level levels count for the models
   the same record lists (modelliDiRiserva), never for an unknown one. */
test('F-B-002 — provider-level registry levels affirm the provider\'s own listed models only',async()=>{
  const registry:any={
    'zai-anthropic':{id:'zai-anthropic',etichetta:'Z.AI (Anthropic)',destinazioneChat:true,descrizione:'GLM',auth:{tipo:'bearer'},chiaveObbligatoria:true,credenziale:true,wire:'anthropic-messages',esecuzione:'collegato',cloud:false,
      modelliDiRiserva:[{id:'glm-5.3-flash',nome:'GLM 5.3 Flash'}],
      ragionamento:{livelli:['low','high','max'],fonte:'https://docs.z.ai/devpack/latest-model',data:'2026-10-05'},
    },
  };
  const svc=createTuiCatalogService({
    publicProviders:()=>[{id:'zai-anthropic',label:'Z.AI',requiresKey:true,keyConfigured:true,supportsEndpoint:true,supportsOAuth:false,execution:'collegato'}],
    registry,runtimeFor:()=>({}),keyFor:()=> 'k',setKey:()=>{},clearKey:()=>{},persistModel:async()=>{},
    createProbe:()=>({prova:async()=>({esito:'collegato'}),elencaModelli:async()=>({fonte:'fornitore',modelli:[{id:'glm-5.3-flash'},{id:'glm-x-unknown'}]})}),
  } as any);
  const rows=await svc.listModels({provider:'zai-anthropic'});
  assert.deepEqual(rows.find(row=>row.id==='zai-anthropic:glm-5.3-flash')?.reasoningEfforts,['low','high','max']);
  const live=await svc.listModels({provider:'zai-anthropic',refresh:true});
  assert.deepEqual(live.find(row=>row.id==='zai-anthropic:glm-5.3-flash')?.reasoningEfforts,['low','high','max'],'the live list too');
  assert.equal(live.find(row=>row.id==='zai-anthropic:glm-x-unknown')?.reasoningEfforts??null,null,'a model the record does not list gets nothing invented');
});

test('M4-D RED — usage evidence reports only explicit measured reasoning fields',()=>{
  assert.deepEqual(reasoningUsageEvidence({completion_tokens_details:{reasoning_tokens:37},reasoning_cost_usd:0.0042}),{reasoningTokens:37,reasoningCostUsd:0.0042});
  assert.deepEqual(reasoningUsageEvidence({completion_tokens:99,cost_usd:9}),{reasoningTokens:null,reasoningCostUsd:null});
  assert.match(reasoningUsageLabel({completion_tokens_details:{reasoning_tokens:37}}),/37/);
  assert.match(reasoningUsageLabel({completion_tokens:99}),/not reported/i);
});

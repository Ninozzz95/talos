/*
 * F-001 (30/09/2026, owner: fixed in 0.3.3, the "one-up" version). A model whose advertised maximum output is close to its
 * window (OpenRouter rows of 1,048,576 tokens with a 943,717-token maximum) made the reserve for the answer eat the whole
 * window: the Context Engine refused with CTX_CONTEXT_TOO_SMALL before any model call. The reserve is also the max_tokens
 * the kernel sends, so it should be what TALOS asks for, not the provider's ceiling: Hermes reserves the max_tokens it
 * requests (agent/context_compressor.py _compute_threshold_tokens), OpenCode caps the request at 32,000
 * (provider/transform.ts OUTPUT_TOKEN_MAX), Pi keeps 16,384. TALOS takes the smaller of the model's maximum and 32,000 (and
 * never more than a quarter of the window), keeps the person's own setting, never refuses for the reserve, and /context says
 * where the reserve comes from.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';
import * as profiles from '../../src/runtime/model-profile.ts';
import {configureModelProfiles,modelProfile,rememberProviderModelRows,resetModelProfiles,setModelOverrides} from '../../src/runtime/model-profile.ts';
import {contextInspectorLines} from '../../src/tui/overlays/context-inspector.ts';

const {validateContextProfile}:any=await import(new URL('../../../context-engine/src/profiles.mjs',import.meta.url).href);

function fresh(){resetModelProfiles();configureModelProfiles({registry:{},rowsFor:()=>({runtime:[],registry:[]})});}
const accepts=(profile:{windowTokens:number;responseReserve:number})=>{
  try{validateContextProfile({windowTokens:profile.windowTokens,responseReserve:profile.responseReserve,method:'heuristic'});return true;}catch{return false;}
};

test('F001-LARGE-OUTPUT: a 1,048,576 window with a ~943k advertised output reserves 32,000 and the Context Engine accepts it',()=>{
  fresh();
  rememberProviderModelRows('openrouter',[
    {id:'vendor-a/flash-large-output',context_length:1_048_576,top_provider:{max_completion_tokens:943_717}},
    {id:'vendor-b/flash-large-output',context_length:1_048_576,top_provider:{max_completion_tokens:943_718}},
  ]);
  for(const model of ['vendor-a/flash-large-output','vendor-b/flash-large-output']){
    const profile=modelProfile({provider:'openrouter',model});
    assert.ok(profile,`${model}: a profile`);
    assert.equal(profile!.responseReserve,32_000,`${model}: the reserve is what TALOS asks for, not the advertised ceiling`);
    assert.ok(accepts(profile!),`${model}: validateContextProfile (heuristic margin) accepts it`);
  }
  resetModelProfiles();
});

test('F001-QWEN and F001-SMALL-OUTPUT: a large but fitting maximum is capped at 32,000; a small one is kept',()=>{
  fresh();
  rememberProviderModelRows('openrouter',[
    {id:'vendor-c/wide',context_length:1_000_000,top_provider:{max_completion_tokens:131_072}},
    {id:'vendor-d/small',context_length:64_000,top_provider:{max_completion_tokens:8_192}},
  ]);
  assert.equal(modelProfile({provider:'openrouter',model:'vendor-c/wide'})!.responseReserve,32_000);
  assert.equal(modelProfile({provider:'openrouter',model:'vendor-d/small'})!.responseReserve,8_192);
  resetModelProfiles();
});

test('F001-DEFAULT and F001-OVERRIDE: no advertised output keeps Pi\'s 16,384 (a quarter of a small window); the person\'s setting wins',()=>{
  fresh();
  rememberProviderModelRows('openrouter',[{id:'vendor-e/unknown-output',context_length:200_000}]);
  assert.equal(modelProfile({provider:'openrouter',model:'vendor-e/unknown-output'})!.responseReserve,16_384);
  setModelOverrides({'openrouter:vendor-e/unknown-output':{maxOutputTokens:100_000}});
  assert.equal(modelProfile({provider:'openrouter',model:'vendor-e/unknown-output'})!.responseReserve,100_000,'an explicit setting is kept, above 32,000 too');
  resetModelProfiles();
});

test('F001-FORMULA-CONTRACT: the CLI\'s fit check agrees with the Context Engine\'s validateContextProfile (heuristic)',()=>{
  const fits=(profiles as any).contextEngineProfileFits;
  assert.equal(typeof fits,'function','model-profile.ts exports contextEngineProfileFits');
  for(const windowTokens of [64_000,65_536,128_000,200_000,1_000_000,1_048_576])
    for(const responseReserve of [1,1_024,16_384,32_000,windowTokens/2,windowTokens*0.84,windowTokens*0.86,windowTokens*0.9,windowTokens*0.94,windowTokens-160_000,windowTokens-1].map(Math.floor).filter(value=>value>0&&value<windowTokens))
      assert.equal(fits(windowTokens,responseReserve),accepts({windowTokens,responseReserve}),`window ${windowTokens}, reserve ${responseReserve}`);
});

test('F001-NO-REFUSAL: a reserve that leaves no room turns the Context Engine off for that model instead of failing the turn',()=>{
  const fits=(profiles as any).contextEngineProfileFits;
  assert.equal(typeof fits,'function');
  assert.equal(fits(1_048_576,943_717),false,'the old reserve does not fit: the composition must not hand it to the engine');
  assert.equal(fits(1_048_576,32_000),true);
});

const oneRead=(request:ChatRequest)=>request.toolResults===0?{kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'small.txt'}]}:{kind:'text' as const,text:'Done.'};

test('F001-TURN: the real composition, a model advertising a ~943k output on a 1,048,576 window, reaches the model with max_tokens 32,000',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'small.txt'),'hello\n');
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:1_048_576}}}));
  const fake=await startScriptedProvider({goodKey:key,respond:oneRead});
  const context=await composeWithFake(h,fake.url,key);
  try{
    rememberProviderModelRows('deepseek',[{id:'deepseek-flash',context_length:1_048_576,top_provider:{max_completion_tokens:943_717}}]);
    const {raw}=await runTurn(context,h,'read small.txt');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),`the turn completed: ${JSON.stringify(raw.filter(e=>e?.type==='RunError'))}`);
    assert.equal(fake.requests[0]!.body.max_tokens,32_000,'the Context Engine is on and the kernel asks for the capped reserve');
  }finally{await context.runtime.close?.();await fake.close();resetModelProfiles();}
}));

test('F001-NO-REFUSAL (composition): a person\'s reserve that leaves no room keeps the simple mode and the turn completes',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'small.txt'),'hello\n');
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:1_048_576,maxOutputTokens:943_717}}}));
  const fake=await startScriptedProvider({goodKey:key,respond:oneRead});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {raw}=await runTurn(context,h,'read small.txt');
    assert.ok(!raw.some(e=>e?.type==='RunError'&&/CTX_CONTEXT_TOO_SMALL/u.test(JSON.stringify(e))),'no CTX_CONTEXT_TOO_SMALL');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),`the turn completed: ${JSON.stringify(raw.filter(e=>e?.type==='RunError'))}`);
    assert.equal(fake.requests[0]!.body.max_tokens,undefined,'the simple mode sends no reserve');
  }finally{await context.runtime.close?.();await fake.close();resetModelProfiles();}
}));

test('F001-CONTEXT-SHOWS-SOURCE: /context says where the reserve comes from',()=>{
  const evidence=(profiles as any).modelReserveEvidence;
  assert.equal(typeof evidence,'function','model-profile.ts exports modelReserveEvidence');
  fresh();
  rememberProviderModelRows('openrouter',[{id:'vendor-a/flash-large-output',context_length:1_048_576,top_provider:{max_completion_tokens:943_717}}]);
  assert.deepEqual(evidence({provider:'openrouter',model:'vendor-a/flash-large-output'}),{kind:'capped',reserveTokens:32_000,modelMaxOutputTokens:943_717});
  resetModelProfiles();
  const status:any={sessionId:'s1',available:true,
    measurement:{inputTokens:12_000,windowTokens:1_048_576,responseReserve:32_000,percentOfWindow:1,method:'heuristic',exact:false,stale:false},
    budget:null,reserve:{kind:'capped',reserveTokens:32_000,modelMaxOutputTokens:943_717},
    autoCompaction:{enabled:true,triggerPercent:50},cache:{percent:null,cachedTokens:null,promptTokens:null,provenance:'not reported'},
    cost:{usd:null,provenance:'not reported'},sources:{activeSourceCount:null,summaryCitationCount:null,provenance:'none'}};
  const text=contextInspectorLines(status,{width:200}).join('\n');
  assert.match(text,/capped at 32k/u,'the reserve line names the cap');
  assert.match(text,/943\.7k/u,'and the model\'s own maximum');
});

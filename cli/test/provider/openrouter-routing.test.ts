/*
 * OpenRouter routing per model (owner 08/10/2026: «Tre cose insieme»). Measured on the published 0.5.0 the same evening with an instrumented fetch and identical
 * TALOS requests (56 tools, tool_choice auto): `z-ai/glm-5.3-flash` routed by default to OpenInference (fp4) answered without calling tools — pinned OpenInference
 * 0/2, unpinned 0/2 — while pinned Z.AI fp8 3/3 and pinned DeepInfra fp4 2/2 called them. So: a person can set OpenRouter's `provider` object per model
 * (`models.<id>.providerRouting`, as Hermes `provider_routing.models.<id>`, Pi `compat.openRouterRouting`, OpenCode `models.<id>.options.provider`), TALOS ships one
 * default (OpenInference ignored for that model, replaced by any entry the person writes), and the OpenRouter transport merges it into each request next to the
 * desktop's excluded list (decision 14: `ignore` is a union).
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {resolveCliPaths,ensureCliPaths} from '../../src/paths.ts';
import {OPENROUTER_ROUTING_DEFAULTS,openRouterRoutingFor,setOpenRouterRouting} from '../../src/provider/openrouter-routing.ts';

const adapter:any=await import(new URL('../../../harness-ui/src/runtime-owner-adapter.mjs',import.meta.url).href);

test('OpenRouter routing: the shipped default keeps OpenInference away from glm-5.3-flash only, and says why',()=>{
  setOpenRouterRouting(undefined);
  assert.deepEqual(openRouterRoutingFor('z-ai/glm-5.3-flash'),{ignore:['open-inference']});
  assert.equal(openRouterRoutingFor('z-ai/glm-5.3'),null,'another model is untouched');
  assert.equal(openRouterRoutingFor('anthropic/claude-sonnet-5-5'),null);
  assert.ok(Object.isFrozen(OPENROUTER_ROUTING_DEFAULTS),'the defaults cannot be changed at run time');
});

test('OpenRouter routing: the person\'s entry replaces the default, `{}` removes it, both key spellings work, the fields go out in OpenRouter\'s names',()=>{
  setOpenRouterRouting({'openrouter:z-ai/glm-5.3-flash':{providerRouting:{order:['z-ai'],allowFallbacks:false,requireParameters:true,quantizations:['fp8','bf16'],sort:'throughput',only:['z-ai','deepinfra'],ignore:['novita']}}});
  assert.deepEqual(openRouterRoutingFor('z-ai/glm-5.3-flash'),{order:['z-ai'],allow_fallbacks:false,require_parameters:true,quantizations:['fp8','bf16'],sort:'throughput',only:['z-ai','deepinfra'],ignore:['novita']},'the default ignore is NOT added: the entry replaces it');
  setOpenRouterRouting({'z-ai/glm-5.3-flash':{providerRouting:{}}});
  assert.equal(openRouterRoutingFor('z-ai/glm-5.3-flash'),null,'an empty entry removes the default');
  setOpenRouterRouting({'moonshotai/kimi-k3':{providerRouting:{ignore:['open-inference']}},'deepseek:deepseek-flash':{contextWindow:65_536}});
  assert.deepEqual(openRouterRoutingFor('moonshotai/kimi-k3'),{ignore:['open-inference']},'a bare OpenRouter id');
  assert.deepEqual(openRouterRoutingFor('z-ai/glm-5.3-flash'),{ignore:['open-inference']},'the default is back for a model the person did not set');
  setOpenRouterRouting(undefined);
});

test('OpenRouter routing: the configuration refuses what OpenRouter would not take',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'or-routing-'));
  try{
    const env={APPDATA:path.join(root,'a'),LOCALAPPDATA:path.join(root,'l'),XDG_CONFIG_HOME:path.join(root,'c'),XDG_STATE_HOME:path.join(root,'s'),XDG_CACHE_HOME:path.join(root,'k')};
    const paths=resolveCliPaths(env as any,process.platform,root);await ensureCliPaths(paths);
    const project=path.join(root,'repo');mkdirSync(path.join(project,'.talos-cli'),{recursive:true});
    const user=(value:unknown)=>writeFileSync(path.join(paths.configRoot,'config.json'),JSON.stringify(value));
    const effective=()=>loadEffectiveConfig({paths,projectRoot:project});
    const good={'openrouter:z-ai/glm-5.3-flash':{providerRouting:{ignore:['open-inference','deepinfra/turbo'],quantizations:['fp8'],requireParameters:true,allowFallbacks:true,sort:'price'}}};
    user({version:1,models:good});
    assert.deepEqual((await effective()).value.models,good);
    for(const routing of [
      {ignore:['Open Inference']},{ignore:'open-inference'},{order:[1]},{only:new Array(31).fill(0).map((_,i)=>`p${i}`)},
      {quantizations:['fp3']},{requireParameters:'yes'},{allowFallbacks:1},{sort:'cheapest'},{maxPrice:{prompt:1}},
    ]){user({version:1,models:{'z-ai/glm-5.3-flash':{providerRouting:routing}}});await assert.rejects(effective(),/^Error: CONFIG_INVALID_MODEL_ROUTING$/u,JSON.stringify(routing));}
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('the OpenRouter transport merges the model\'s routing and the excluded list into `provider`, and leaves every other request alone',async()=>{
  const seen:any[]=[];
  const fetchDiRete=async(url:string,init:any)=>{seen.push({url,body:JSON.parse(init.body)});return new Response('{}',{status:200,headers:{'content-type':'application/json'}});};
  const transport=adapter.creaFetchOpenRouterResiliente(fetchDiRete,{
    timeoutMsFn:()=>5_000,inattivitaMsFn:()=>0,
    esclusiFn:async()=>['novita'],
    instradamentoFn:async(model:string)=>model==='z-ai/glm-5.3-flash'?{ignore:['open-inference'],order:['z-ai']}:null,
  });
  const chat='https://openrouter.ai/api/v1/chat/completions';
  await transport(chat,{method:'POST',body:JSON.stringify({model:'z-ai/glm-5.3-flash',messages:[],provider:{ignore:['together'],sort:'price'}})});
  assert.deepEqual(seen[0].body.provider,{ignore:['together','open-inference','novita'],sort:'price',order:['z-ai']},'ignore is a union; the model\'s fields join the request\'s');
  await transport(chat,{method:'POST',body:JSON.stringify({model:'z-ai/glm-5.3',messages:[]})});
  assert.deepEqual(seen[1].body.provider,{ignore:['novita']},'another model gets only the excluded list');
  const plain=adapter.creaFetchOpenRouterResiliente(fetchDiRete,{timeoutMsFn:()=>5_000,inattivitaMsFn:()=>0});
  await plain(chat,{method:'POST',body:JSON.stringify({model:'z-ai/glm-5.3-flash',messages:[]})});
  assert.equal('provider' in seen[2].body,false,'a host that passes neither (the desktop today) sends the body as before');
  assert.equal(adapter.unisciInstradamento(undefined,null),undefined,'nothing to merge: the same value');
});

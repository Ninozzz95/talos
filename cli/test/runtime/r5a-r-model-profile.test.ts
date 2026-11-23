/*
 * R5a lane R, S2 — owner decision Q-R5-3: where a model's window comes from (registry rows, the provider's rows and live
 * lists, a local Ollama's own answer, the person's override, models.dev under gate E7), and the configuration that holds the
 * override (validated, bounded, never from the repository). Every network answer here is a fake: a local HTTP server on
 * 127.0.0.1 for Ollama, an injected function for models.dev (whose fixed address is never contacted).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {resolveCliPaths,ensureCliPaths} from '../../src/paths.ts';
import {MODELS_DEV_URL,configureModelProfiles,createModelsDevLoader,isLocalProvider,modelPrice,modelProfile,modelsDevFetch,ollamaWindow,rememberOllamaWindow,rememberProviderModelRows,resetModelProfiles,setModelOverrides} from '../../src/runtime/model-profile.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const registryModule:any=await import(new URL('../../../harness-ui/src/provider-registry.mjs',import.meta.url).href);
const REGISTRY=registryModule.REGISTRO_FORNITORI;
function withRegistry(runtimeRows:Record<string,any[]>={}){
  resetModelProfiles();
  configureModelProfiles({registry:REGISTRY,rowsFor:provider=>({runtime:runtimeRows[provider]??[],registry:[...(REGISTRY[provider]?.modelliNoti??[]),...(REGISTRY[provider]?.modelliDiRiserva??[])]})});
}

test('today\'s registry profiles: Z.ai rows keep their documented window and date; the reserve is capped (F-001)',()=>{
  withRegistry();
  /* F-001 (30/09): the documented 131,072-token maximum is kept as the model's maximum, the reserve is RESPONSE_RESERVE_CAP. */
  assert.deepEqual(modelProfile({provider:'zai',model:'glm-5.3-flash'}),{windowTokens:1_000_000,responseReserve:32_000,source:'registry',date:'2026-10-05'}); // the desktop re-read the Z.ai documentation on 05/10/2026 (provider-registry.mjs, realigned 08/10)
  /* 0.6.13 (22/10/2026): kernel d54028b4a documents DeepSeek Flash (provider-registry.mjs `modelliNoti`: 1M window, 393,216 output
     tokens, dated 2026-10-21); the reserve is the cap */
  assert.deepEqual(modelProfile({provider:'deepseek',model:'deepseek-flash'}),{windowTokens:1_000_000,responseReserve:32_000,source:'registry',date:'2026-10-21'});
  assert.equal(modelProfile({provider:'deepseek',model:'deepseek-unlisted-test'}),null,'no source knows it: null, and the screen says ctx ?');
});

test('the layers, highest first: override > Ollama > provider rows > registry > models.dev; the reserve from whoever knows the output',()=>{
  withRegistry({deepseek:[{id:'deepseek-flash',contextLength:64_000}]});
  assert.deepEqual(modelProfile({provider:'deepseek',model:'deepseek-flash'}),{windowTokens:64_000,responseReserve:16_000,source:'provider',date:null},'no output limit known: Pi\'s 16,384, at most a quarter of the window');
  rememberProviderModelRows('deepseek',[{id:'deepseek-flash',context_length:128_000,top_provider:{max_completion_tokens:8_192}}]);
  assert.equal(modelProfile({provider:'deepseek',model:'deepseek-flash'})!.responseReserve,8_192,'the live list knows the output limit');
  setModelOverrides({'deepseek:deepseek-flash':{contextWindow:32_768}});
  assert.deepEqual(modelProfile({provider:'deepseek',model:'deepseek-flash'}),{windowTokens:32_768,responseReserve:8_192,source:'override',date:null});
  setModelOverrides({'deepseek:deepseek-flash':{contextWindow:32_768,maxOutputTokens:4_096}});
  assert.equal(modelProfile({provider:'deepseek',model:'deepseek-flash'})!.responseReserve,4_096);
  rememberOllamaWindow('ollama','qwen3',8_192);
  assert.deepEqual(modelProfile({provider:'ollama',model:'qwen3'}),{windowTokens:8_192,responseReserve:2_048,source:'ollama-show',date:new Date().toISOString().slice(0,10)});
  assert.deepEqual(modelProfile({provider:'ollama',model:'ollama:qwen3'}),modelProfile({provider:'ollama',model:'qwen3'}),'a prefixed id is the same model');
  resetModelProfiles();
});

test('prices come only from a named source with its date; a local engine has none',()=>{
  withRegistry();
  assert.deepEqual(modelPrice({provider:'zai',model:'glm-5.3-flash'}),{inputPerMTok:0.15,outputPerMTok:0.5,cacheReadPerMTok:0.03,source:'https://docs.z.ai/guides/overview/pricing',date:'2026-09-12'});
  /* 0.6.13 (22/10/2026): the row's own price source wins over the provider's placeholder `'nessuna'`, which is never a source */
  assert.deepEqual(modelPrice({provider:'deepseek',model:'deepseek-flash'}),{inputPerMTok:0.3,outputPerMTok:1.2,cacheReadPerMTok:0.006,source:'https://api-docs.deepseek.com/quick_start/pricing/',date:'2026-10-21'});
  assert.equal(modelPrice({provider:'deepseek',model:'deepseek-unlisted-test'}),null,'a model no source prices has no price');
  assert.equal(isLocalProvider('ollama'),true);assert.equal(isLocalProvider('lmstudio'),true);assert.equal(isLocalProvider('deepseek'),false);
  rememberProviderModelRows('openrouter',[{id:'x/y',pricing:{prompt:'0.000001',completion:'0.000002'}}]);
  assert.equal(modelPrice({provider:'openrouter',model:'x/y'})!.inputPerMTok,1);
  resetModelProfiles();
});

async function fakeOllama(answers:{show?:any;ps?:any;redirect?:boolean}){
  const seen:string[]=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;seen.push(`${req.method} ${req.url} ${body}`);
    if(answers.redirect){res.writeHead(307,{location:'http://127.0.0.1:9/elsewhere'});res.end();return;}
    const json=(value:unknown)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(req.url==='/api/show')return json(answers.show??{});
    if(req.url==='/api/ps')return json(answers.ps??{models:[]});
    res.writeHead(404);res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  return{root:`http://127.0.0.1:${(server.address() as any).port}`,seen,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}

test('Ollama: the Modelfile\'s num_ctx, else the loaded model\'s window, else unknown — never the trained maximum alone',async()=>{
  const fetchImpl=(url:string,init:RequestInit)=>fetch(url,init);
  const withNumCtx=await fakeOllama({show:{parameters:'stop "x"\nnum_ctx 16384\ntemperature 0.2',model_info:{'qwen3.context_length':131072}}});
  try{assert.equal(await ollamaWindow({root:withNumCtx.root,model:'qwen3',fetchImpl}),16_384);assert.match(withNumCtx.seen[0]!,/^POST \/api\/show \{"model":"qwen3"\}$/u);}finally{await withNumCtx.close();}
  const loaded=await fakeOllama({show:{model_info:{'qwen3.context_length':131072}},ps:{models:[{name:'qwen3',model:'qwen3',context_length:32768}]}});
  try{assert.equal(await ollamaWindow({root:`${loaded.root}/v1`,model:'qwen3',fetchImpl}),32_768,'the OpenAI address of the engine reaches its root');}finally{await loaded.close();}
  const trainedOnly=await fakeOllama({show:{model_info:{'general.context_length':131072}},ps:{models:[]}});
  try{assert.equal(await ollamaWindow({root:trainedOnly.root,model:'qwen3',fetchImpl}),null,'4k/32k/256k by VRAM is the server\'s default: unknown here');}finally{await trainedOnly.close();}
  const redirected=await fakeOllama({redirect:true});
  try{assert.equal(await ollamaWindow({root:redirected.root,model:'qwen3',fetchImpl}),null);}finally{await redirected.close();}
});

test('models.dev: off in a test profile (nothing imported, nothing sent); on, one GET with no key, redirect refused, size bounded, cached under the data root',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'r5a-r-modelsdev-'));
  try{
    const calls:Array<{url:string;init:RequestInit}>=[];
    /* 0.6.13 (22/10/2026): a model the registry does not know (deepseek-flash is a registry row since d54028b4a, which outranks models.dev) */
    const answer={deepseek:{id:'deepseek',name:'DeepSeek',models:{'deepseek-unlisted-test':{id:'deepseek-unlisted-test',name:'Unlisted',limit:{context:128000,output:8192},cost:{input:0.27,output:1.1,cache_read:0.07}}}}};
    const fetchImpl=async(url:string,init:RequestInit)=>{calls.push({url,init});return new Response(JSON.stringify(answer),{status:200,headers:{'content-type':'application/json'}});};
    const off=createModelsDevLoader({repoRoot:REPO_ROOT,dataRoot:root,env:{},fetchImpl,testProfile:true});
    await off.load('deepseek');
    assert.equal(off.enabled,false);assert.deepEqual(calls,[]);
    const disabled=createModelsDevLoader({repoRoot:REPO_ROOT,dataRoot:root,env:{TALOS_MODELS_DEV:'off'},fetchImpl,testProfile:false});
    await disabled.load('deepseek');assert.deepEqual(calls,[]);
    withRegistry();
    const on=createModelsDevLoader({repoRoot:REPO_ROOT,dataRoot:root,env:{},fetchImpl,testProfile:false});
    await on.load('deepseek');await on.load('deepseek');
    assert.equal(calls.length,1,'one request');assert.equal(calls[0]!.url,MODELS_DEV_URL);
    assert.equal(calls[0]!.init.redirect,'error');assert.equal(calls[0]!.init.method,'GET');
    assert.ok(!Object.keys((calls[0]!.init.headers??{}) as Record<string,string>).some(name=>/authorization|key/iu.test(name)),'no key');
    assert.deepEqual(modelProfile({provider:'deepseek',model:'deepseek-unlisted-test'}),{windowTokens:128000,responseReserve:8192,source:'models.dev',date:new Date().toISOString().slice(0,10)});
    assert.deepEqual(modelPrice({provider:'deepseek',model:'deepseek-unlisted-test'}),{inputPerMTok:0.27,outputPerMTok:1.1,cacheReadPerMTok:0.07,source:'models.dev',date:new Date().toISOString().slice(0,10)});
    assert.ok(readdirSync(path.join(root,'cache')).some(name=>/^models-dev-[0-9a-f]{16}\.json$/u.test(name)),'the kernel adapter\'s 4 h cache, under the data root');
    const tooLarge=modelsDevFetch(async()=>new Response('x'.repeat(64),{status:200,headers:{'content-length':'64'}}),32);
    await assert.rejects(tooLarge(MODELS_DEV_URL,{}),{code:'MODELS_DEV_TOO_LARGE'});
    const streamedTooLarge=modelsDevFetch(async()=>new Response('y'.repeat(64),{status:200}),32);
    await assert.rejects(streamedTooLarge(MODELS_DEV_URL,{}),{code:'MODELS_DEV_TOO_LARGE'});
  }finally{resetModelProfiles();rmSync(root,{recursive:true,force:true});}
});

test('config: the override is validated and bounded, busy input and reasoning have their defaults, and a repository cannot set a window',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'r5a-r-config-'));
  try{
    const env={APPDATA:path.join(root,'a'),LOCALAPPDATA:path.join(root,'l'),XDG_CONFIG_HOME:path.join(root,'c'),XDG_STATE_HOME:path.join(root,'s'),XDG_CACHE_HOME:path.join(root,'k')};
    const paths=resolveCliPaths(env as any,process.platform,root);await ensureCliPaths(paths);
    const project=path.join(root,'repo');mkdirSync(path.join(project,'.talos-cli'),{recursive:true});
    const user=(value:unknown)=>writeFileSync(path.join(paths.configRoot,'config.json'),JSON.stringify(value));
    const effective=()=>loadEffectiveConfig({paths,projectRoot:project});
    user({version:1});
    assert.deepEqual([(await effective()).value.ui?.busyInput,(await effective()).value.ui?.reasoning],['queue','collapsed']);
    user({version:1,models:{'deepseek:deepseek-flash':{contextWindow:65_536,maxOutputTokens:8_192}},ui:{busyInput:'steer',reasoning:'visible'}});
    const good=await effective();
    assert.deepEqual(good.value.models,{'deepseek:deepseek-flash':{contextWindow:65_536,maxOutputTokens:8_192}});
    assert.deepEqual([good.value.ui?.busyInput,good.value.ui?.reasoning],['steer','visible']);
    for(const [bad,code] of [
      [{models:{'deepseek:deepseek-flash':{contextWindow:'128k'}}},'CONFIG_INVALID_MODEL_WINDOW'],
      [{models:{'deepseek:deepseek-flash':{contextWindow:0}}},'CONFIG_INVALID_MODEL_WINDOW'],
      [{models:{'deepseek:deepseek-flash':{contextWindow:1.5e3+0.5}}},'CONFIG_INVALID_MODEL_WINDOW'],
      [{models:{'deepseek:deepseek-flash':{contextWindow:20_000_000}}},'CONFIG_INVALID_MODEL_WINDOW'],
      [{models:{'deepseek:deepseek-flash':{contextWindow:8_192,maxOutputTokens:8_192}}},'CONFIG_INVALID_MODEL_WINDOW'],
      [{models:{'deepseek:deepseek-flash':{contextWindow:8_192,window:1}}},'CONFIG_INVALID_MODELS'],
      [{models:[]},'CONFIG_INVALID_MODELS'],
      [{ui:{busyInput:'fast'}},'CONFIG_INVALID_BUSY_INPUT'],
      /* stage 7.11: «hidden» is a reasoning choice now (the Settings sheet's Thinking) */
      [{ui:{reasoning:'loud'}},'CONFIG_INVALID_REASONING_DISPLAY'],
    ] as const){user({version:1,...bad});await assert.rejects(effective(),new RegExp(`^Error: ${code}$`,'u'),JSON.stringify(bad));}
    user({version:1});
    writeFileSync(path.join(project,'.talos-cli','config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:4_096}}}));
    const fromRepo=await effective();
    assert.equal(fromRepo.value.models,undefined,'the repository\'s window is not used');
    assert.equal(fromRepo.ignored.find(row=>row.code==='PROJECT_MODELS_IGNORED')?.path,'models');
  }finally{rmSync(root,{recursive:true,force:true});}
});

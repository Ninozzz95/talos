/*
 * Owner 13/10/2026 («Modello a scelta per i sotto-agenti»). Measured before: the CLI gave the kernel no list of usable models, and
 * the kernel then refuses every model asked for a child (session-registry.mjs `verificaModelloChiesto`: "this app cannot choose a
 * model for a sub-task here"). The list is the desktop's own module (harness-ui/src/modelli-utilizzabili.mjs, R-02 of 12/10/2026),
 * fed from the CLI's model picker.
 *
 * What the others do, read in the clones: Codex's `spawn_agent` takes an optional `model`, else the agent's own
 * (codex-rs/core/src/tools/handlers/multi_agents/spawn.rs:91 and :148-150, clone of 24/09/2026); OpenCode's task tool uses the
 * sub-agent's configured model, else the model of the message that asked (packages/opencode/src/tool/task.ts:181-188, clone of
 * 24/09/2026); Hermes lets a child run "on a different provider:model pair" from its delegation configuration
 * (tools/delegate_tool.py:213-221 and :567, clone of 07/10/2026).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,PLAN_MODEL} from '../provider/chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {createUsableModels,type UsableModelsProvider} from '../../src/runtime/usable-models.ts';
import {createTuiCatalogService} from '../../src/tui/catalog-service.ts';

const provider=(id:string,over:Partial<UsableModelsProvider>={}):UsableModelsProvider=>({id,configured:true,requiresKey:true,local:false,...over});
const rows=(...ids:Array<string|[string,boolean]>)=>({rows:ids.map(entry=>typeof entry==='string'?{id:entry,availabilityVerified:true}:{id:entry[0],availabilityVerified:entry[1]})});

test('the kernel refuses a child\'s model without a list, and checks it against the list when there is one (the contract this relies on)',()=>{
  const registry=readFileSync(path.join(REPO_ROOT,'harness-ui','src','session-registry.mjs'),'utf8');
  assert.ok(registry.includes("if (typeof modelliDisponibiliFn !== 'function') {"));
  assert.ok(registry.includes('this app cannot choose a model for a sub-task here: omit modello, and the child uses your model.'));
  assert.ok(registry.includes('the list of models this app can use is not available right now: omit modello, and the child uses your model.'));
  assert.ok(registry.includes('is not one of the models this app can use.'));
});

test('usable models: the providers usable now, the models they list now, a local engine that answers; ids as /model shows them',async()=>{
  const asked:string[]=[];
  const usable=createUsableModels({repoRoot:REPO_ROOT,sources:{
    listProviders:async()=>[provider('deepseek'),provider('openai',{configured:false}),provider('chatgpt',{authType:'oauth-pkce'}),
      provider('ollama',{requiresKey:false,local:true}),provider('lmstudio',{requiresKey:false,local:true,configured:false})],
    providerModels:async id=>{asked.push(id);return id==='deepseek'?rows('deepseek:deepseek-flash','deepseek:deepseek-pro',['deepseek:written-by-hand',false])
      :id==='chatgpt'?rows(PLAN_MODEL):id==='ollama'?rows('ollama:qwen3-coder'):rows();},
  }});
  const list=await usable.list();
  assert.deepEqual([...list!].sort(),['chatgpt:gpt-5.5','deepseek:deepseek-flash','deepseek:deepseek-pro','ollama:qwen3-coder']);
  assert.deepEqual(asked.sort(),['chatgpt','deepseek','ollama'],'a provider that is not usable now is not even asked');
  assert.equal(list!.includes('deepseek:written-by-hand'),false,'a model nobody listed just now is not offered to a child');
});

/*
 * Review of 13/10/2026 (bugfixer), finding 1. The picker does not throw when a provider cannot be read: it answers with the rows it
 * already knows, none of them live (catalog-service.ts `providerModels`), or with none at all for a plan nobody signed in to and
 * for an engine that is not running. Each of those is a source with NOTHING LIVE TO OFFER, so it is a failed source: with all of
 * them like that the list is null ("not available right now"), never [] ("that model does not exist").
 */
const answer=(listing:string|undefined,...ids:Array<string|[string,boolean]>)=>({...rows(...ids),verified:false,...(listing?{listing}:{})}) as any;
test('usable models: sources that answer as the real picker does when nothing is live are failed sources — all of them is null',async()=>{
  const providers=async()=>[provider('deepseek'),provider('chatgpt',{requiresKey:false,authType:'oauth-pkce'}),provider('ollama',{requiresKey:false,local:true})];
  for(const marked of [true,false]){
    const down=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:providers,providerModels:async id=>
      id==='deepseek'?answer(marked?'unreachable':undefined,['deepseek:deepseek-pro',false])
      :id==='chatgpt'?answer(marked?'signed-out':undefined)
      :{...answer(marked?'engine-down':undefined),engine:'down'}}});
    assert.equal(await down.list(),null,`nothing live anywhere (listing ${marked?'said':'not said'}): the list is not available, it is not empty`);
  }
  /* a live list that holds only rows nobody listed just now has nothing live to offer either */
  const stale=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>[provider('deepseek')],providerModels:async()=>answer('live',['deepseek:written-by-hand',false])}});
  assert.equal(await stale.list(),null);
  /* one live source among the failed ones: its models, and only its models */
  const one=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:providers,providerModels:async id=>
    id==='deepseek'?answer('live','deepseek:deepseek-pro',['deepseek:written-by-hand',false]):id==='chatgpt'?answer('signed-out'):{...answer('engine-down'),engine:'down'}}});
  assert.deepEqual(await one.list(),['deepseek:deepseek-pro']);
});

/*
 * Finding 2, owner 13/10/2026: «Sì, i modelli che già scegli in /model». A provider that has no live list at all (its models are
 * documented or configured: zai-anthropic, vertex, azure, bedrock, a 404 answered from the documentation) offers a child the
 * rows the picker shows for it. A provider that normally lists its models and cannot be read now stays a failed source.
 */
test('usable models: a provider with no live list offers the rows /model shows; the same rows from a provider that is unreachable do not count',async()=>{
  const known=(listing:string)=>createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>[provider('zai-anthropic'),provider('deepseek')],
    providerModels:async id=>id==='zai-anthropic'?answer(listing,['zai-anthropic:glm-5.3',false],['zai-anthropic:glm-5.3-flash',false]):answer('live','deepseek:deepseek-pro')}});
  assert.deepEqual([...(await known('known-only').list())!].sort(),['deepseek:deepseek-pro','zai-anthropic:glm-5.3','zai-anthropic:glm-5.3-flash']);
  assert.deepEqual(await known('unreachable').list(),['deepseek:deepseek-pro']);
  const alone=(listing:string)=>createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>[provider('zai-anthropic')],providerModels:async()=>answer(listing,['zai-anthropic:glm-5.3',false])}});
  assert.deepEqual(await alone('known-only').list(),['zai-anthropic:glm-5.3'],'the model the session itself may be running on');
  assert.equal(await alone('unreachable').list(),null);
});

/* Finding 6: the kernel compares the exact string, and the CLI's ids carry the provider (`/model`, `providerOfModel`). */
test('usable models: an OpenRouter model is offered as openrouter:vendor/model, never bare',async()=>{
  const usable=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>[provider('openrouter')],providerModels:async()=>answer('live','openrouter:anthropic/claude-sonnet-5')}});
  const list=await usable.list();
  assert.deepEqual(list,['openrouter:anthropic/claude-sonnet-5']);assert.equal(list!.includes('anthropic/claude-sonnet-5'),false);
});

/*
 * Finding 4: every delegation that names a model asked every usable provider again (OpenRouter's whole catalogue, the plan's list
 * with its token), with nothing shared and nothing kept. Calls that arrive together share one reading; a list that was read is
 * kept for 30 s; "not available" is never kept; every source is asked with a time limit, the list of providers included.
 */
test('usable models: calls that arrive together share one reading, a list is kept 30 s, null is not kept, and every source has a time limit',async()=>{
  let clock=1_000_000;const asked:string[]=[];const signals:unknown[]=[];let providersAsked=0;let live=true;
  const usable=createUsableModels({repoRoot:REPO_ROOT,now:()=>clock,sources:{
    listProviders:async()=>{providersAsked++;return[provider('deepseek'),provider('openai')];},
    providerModels:async(id,signal)=>{asked.push(id);signals.push(signal);await new Promise(resolve=>setTimeout(resolve,20));if(!live)return answer('unreachable');return answer('live',`${id}:m1`);},
  }});
  const [a,b]=await Promise.all([usable.list(),usable.list()]);const c=await usable.list();
  assert.deepEqual([...a!].sort(),['deepseek:m1','openai:m1']);assert.deepEqual(b,a);assert.deepEqual(c,a);
  assert.deepEqual(asked.sort(),['deepseek','openai'],'two calls together and one right after: each provider asked once');assert.equal(providersAsked,1);
  assert.ok(signals.every(signal=>signal instanceof AbortSignal),'each source is asked with a time limit it can obey');
  a!.push('mine:added');assert.equal((await usable.list())!.includes('mine:added'),false,'the caller gets its own copy');
  clock+=29_000;await usable.list();assert.equal(asked.length,2,'still kept at 29 s');
  clock+=2_000;await usable.list();assert.equal(asked.length,4,'read again after 30 s');
  live=false;clock+=31_000;
  assert.equal(await usable.list(),null);const afterNull=asked.length;
  live=true;assert.deepEqual([...(await usable.list())!].sort(),['deepseek:m1','openai:m1'],'"not available" is not kept: the next call reads again');
  assert.equal(asked.length,afterNull+2);
  /* the list of providers is inside the time limit too */
  const stuck=createUsableModels({repoRoot:REPO_ROOT,timeoutMs:120,sources:{listProviders:()=>new Promise(()=>{}),providerModels:async()=>answer('live','x:y')}});
  const started=Date.now();assert.equal(await stuck.list(),null);assert.ok(Date.now()-started<2_000,'cut at the time limit');
});

/* The same rule through the REAL picker (createTuiCatalogService), not a stand-in for it. */
test('usable models through the real picker: unreachable is null; a provider with no live list offers its known rows; a live one its live rows',async()=>{
  const record=(id:string)=>({id,etichetta:id,destinazioneChat:true,descrizione:id,auth:{tipo:'bearer'},chiaveObbligatoria:true,credenziale:true,wire:'openai-chat',esecuzione:'collegato',cloud:false,modelliDiRiserva:[{id:'known',nome:`${id} known`,toolCalling:true}]});
  const picker=(list:(id:string)=>Promise<unknown>)=>{const service=createTuiCatalogService({
    publicProviders:()=>[],registry:{deepseek:record('deepseek')},runtimeFor:()=>({}),keyFor:()=>'sk-dummy-not-a-key',setKey:()=>{},clearKey:()=>{},persistModel:async()=>{},
    createProbe:()=>({prova:async()=>({}),elencaModelli:list}),
  } as any);return createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:()=>service.listProviders(),providerModels:(id,signal)=>service.providerModels(id,signal)}});};
  assert.equal(await picker(async()=>{throw Object.assign(new Error('DeepSeek catalog unreachable.'),{code:'CATALOG_UNREACHABLE'});}).list(),null,'the picker answers with its known rows, not verified: nothing live');
  assert.deepEqual(await picker(async id=>({provider:id,fonte:'documentazione',modelli:[{id:`${id}:known`,nome:'known',provider:id}]})).list(),['deepseek:known'],'no live list at all: what /model shows');
  assert.deepEqual(await picker(async id=>({provider:id,modelli:[{id:`${id}:live-now`,nome:'live',provider:id}]})).list(),['deepseek:live-now'],'a live list: only what it lists now');
});

test('usable models: one source down does not empty the others; nothing readable is null, never an empty "no such model"',async()=>{
  const some=createUsableModels({repoRoot:REPO_ROOT,sources:{
    listProviders:async()=>[provider('deepseek'),provider('openai')],
    providerModels:async id=>{if(id==='openai')throw new Error('down');return rows('deepseek:deepseek-flash');},
  }});
  assert.deepEqual(await some.list(),['deepseek:deepseek-flash']);
  const none=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>[provider('deepseek')],providerModels:async()=>{throw new Error('down');}}});
  assert.equal(await none.list(),null,'the list is not available: the kernel says so, it does not say the model does not exist');
  const nobody=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>[provider('openai',{configured:false})],providerModels:async()=>rows('openai:gpt-x')}});
  assert.equal(await nobody.list(),null);
  const broken=createUsableModels({repoRoot:REPO_ROOT,sources:{listProviders:async()=>{throw new Error('x');},providerModels:async()=>rows()}});
  assert.equal(await broken.list(),null);
  /* a source that never answers is cut at the time limit and the rest is kept */
  const slow=createUsableModels({repoRoot:REPO_ROOT,timeoutMs:150,sources:{listProviders:async()=>[provider('deepseek'),provider('openai')],
    providerModels:id=>id==='openai'?new Promise(()=>{}):Promise.resolve(rows('deepseek:deepseek-flash'))}});
  assert.deepEqual(await slow.list(),['deepseek:deepseek-flash']);
});

test('the real composition hands the kernel the list: the ChatGPT plan\'s models once signed in, none of it before',async()=>{
  const fake=fakeOpenAi();
  await hermetic(async h=>{
    const restore=installFakeOpenAi(fake);let context:any=null;
    try{
      const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
      /* what the kernel's registry is handed, seen at the door */
      const modules:any=await loadModules(REPO_ROOT);let handed:any=null;
      const spied={...modules,createSessionRegistry:(options:any)=>{handed=options;return modules.createSessionRegistry(options);}};
      /* 21/10/2026: the local engines' addresses point at a closed port. The hermetic fixture lets 127.0.0.1 through, and a local
         model server on this computer (LM Studio's port 1234 answered with a test model) made the first read non-empty; that list
         is kept for 30 s, so the read after the sign-in came back without the plan's models. Same on 0.6.11: not the engine. */
      const closed='http://127.0.0.1:9';
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env,LMSTUDIO_BASE_URL:closed,LM_BASE_URL:closed,OLLAMA_BASE_URL:closed,OLLAMA_HOST:closed},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot),modules:spied} as any);
      assert.equal(typeof handed?.modelliDisponibiliFn,'function','the kernel is given the list: without it every model asked for a child is refused');
      assert.equal(typeof context.usableModels?.list,'function');
      const before=await context.usableModels.list();
      /* nobody signed in: no plan model — and never an EMPTY list (review 13/10/2026: `[]` makes the kernel say "that model
         does not exist"; with nothing live to read the list is null, and a list that is there holds something) */
      assert.ok(before===null||(Array.isArray(before)&&before.length>0&&!before.some((id:string)=>id.startsWith('chatgpt:'))),JSON.stringify(before));
      const login=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);assert.equal((await login.outcome).ok,true);
      const after=await context.usableModels.list();
      assert.ok(Array.isArray(after)&&after.includes(PLAN_MODEL),JSON.stringify(after));
      assert.deepEqual(await handed.modelliDisponibiliFn(),after,'the same list');
      assert.doesNotMatch(JSON.stringify(after),/ACCESS-|REFRESH-/u);
    }finally{try{await context?.tuiCatalog.chatgpt.signOut();}catch{/* nothing left waiting */}await context?.runtime.close?.().catch(()=>{});restore();}
  });
});

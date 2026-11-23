/*
 * R4 lane F — local model lists are read by the CLI (owner decision Q-R4-10, gate E10; s04 R4-MODEL).
 * Ollama's `/api/tags` and LM Studio's `/api/v1/models` are read from the configured address (OLLAMA_BASE_URL through the
 * store's runtime, or the registry's base URL), with no key, no redirect and a short timeout; the kernel is not asked. A
 * fake engine on 127.0.0.1 answers here: a real local engine is never contacted.
 * The words say what happened in plain English: the engine is not answering, has no models, or answered something else.
 * The configured model is always listed, marked not installed when the engine does not have it.
 */
import assert from 'node:assert/strict';
import {createServer,type IncomingHttpHeaders,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import test,{after} from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {createModelPickerModel} from '../../src/tui/overlays/model-picker.ts';

type Seen={url:string;method:string;headers:IncomingHttpHeaders};
const servers:Server[]=[];
after(async()=>{for(const server of servers)await new Promise(resolve=>server.close(resolve));});
async function engine(answer:(url:string)=>{status:number;body:unknown;headers?:Record<string,string>}){
  const seen:Seen[]=[];
  const server=createServer((request,response)=>{
    seen.push({url:String(request.url),method:String(request.method),headers:request.headers});
    const {status,body,headers={}}=answer(String(request.url));
    response.writeHead(status,{'content-type':'application/json',...headers});response.end(typeof body==='string'?body:JSON.stringify(body));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));servers.push(server);
  return{base:`http://127.0.0.1:${(server.address() as AddressInfo).port}`,seen};
}
async function closedPort(){const {base}=await engine(()=>({status:200,body:{}}));const server=servers.pop()!;await new Promise(resolve=>server.close(resolve));return base;}

const REGISTRY={
  ollama:{id:'ollama',etichetta:'Ollama Local',destinazioneChat:true,descrizione:'',chiaveObbligatoria:false,wire:'openai-chat',esecuzione:'runtime locale',baseUrl:'http://127.0.0.1:11434',modelliDiRiserva:null,catalogo:{fonte:'runtime-locale',forma:'ollama-tags',percorso:'/api/tags'}},
  lmstudio:{id:'lmstudio',etichetta:'LM Studio',destinazioneChat:true,descrizione:'',chiaveObbligatoria:false,wire:'openai-chat',esecuzione:'runtime locale',baseUrl:'http://127.0.0.1:1234',modelliDiRiserva:null,catalogo:{fonte:'runtime-locale',forma:'lmstudio-models',percorso:'/api/v1/models'}},
};
function deps(runtime:Record<string,any>,extra:Partial<TuiCatalogDeps>={}):TuiCatalogDeps{
  return{
    publicProviders:()=>[],registry:REGISTRY,runtimeFor:(id:string)=>runtime[id]??{},keyFor:()=>'sk-local-dummy',setKey:()=>{},clearKey:()=>{},persistModel:async()=>{},
    createProbe:()=>({prova:async()=>{throw new Error('the kernel probe is not used for a local list');},elencaModelli:async()=>{throw new Error('the kernel is not asked for a local list');}}),
    fetchImpl:(url:string,init:RequestInit)=>fetch(url,init),
    ...extra,
  };
}
const TAGS={models:[{name:'qwen3-coder-test',model:'qwen3-coder-test',size:123,details:{family:'qwen3',families:['qwen3'],quantization_level:'Q4_K_M'}}]};

test('Q-R4-10: Ollama\'s installed models are read live from the configured address, with no key and no redirect',async()=>{
  const fake=await engine(url=>url==='/api/tags'?{status:200,body:TAGS}:{status:404,body:{}});
  const list=await createTuiCatalogService(deps({ollama:{endpoint:fake.base}})).providerModels('ollama');
  assert.deepEqual(list.rows.map(row=>row.id),['ollama:qwen3-coder-test']);
  assert.equal(list.verified,true);assert.equal(list.label,'Ollama Local');assert.equal(list.listing,'live');
  assert.equal(list.rows[0]!.availabilityVerified,true);
  assert.match(list.notice,/^Live list from Ollama Local: 1 model installed\.$/u);
  assert.equal(fake.seen.length,1);assert.equal(fake.seen[0]!.url,'/api/tags');assert.equal(fake.seen[0]!.method,'GET');
  assert.equal(fake.seen[0]!.headers.authorization,undefined,'no key is sent to list models');
});

test('E10: an address configured with /v1 is read at the engine\'s own root',async()=>{
  const fake=await engine(url=>url==='/api/tags'?{status:200,body:TAGS}:{status:404,body:{}});
  const list=await createTuiCatalogService(deps({ollama:{endpoint:`${fake.base}/v1/`}})).providerModels('ollama');
  assert.equal(list.verified,true);assert.deepEqual(fake.seen.map(row=>row.url),['/api/tags']);
});

test('Q-R4-10: LM Studio\'s loaded language models come with the capabilities it declares',async()=>{
  const fake=await engine(url=>url==='/api/v1/models'?{status:200,body:{models:[
    {type:'llm',key:'qwen/qwen3-8b',display_name:'Qwen3 8B',max_context_length:32768,capabilities:{trained_for_tool_use:true,vision:false,reasoning:{allowed_options:['low','medium','high']}}},
    {type:'embedding',key:'text-embedding-nomic'},
  ]}}:{status:404,body:{}});
  const list=await createTuiCatalogService(deps({lmstudio:{endpoint:fake.base}})).providerModels('lmstudio');
  assert.deepEqual(list.rows.map(row=>row.id),['lmstudio:qwen/qwen3-8b'],'only language models');
  const [row]=list.rows;
  assert.equal(row!.name,'Qwen3 8B');assert.equal(row!.contextWindow,32768);assert.equal(row!.toolCalling,true);assert.equal(row!.images,false);assert.equal(row!.reasoning,true);
  assert.equal(list.verified,true);
});

test('Q-R4-10: an engine that is not running is said in plain words, with its address and what to do',async()=>{
  const base=await closedPort();
  const list=await createTuiCatalogService(deps({ollama:{endpoint:base}})).providerModels('ollama');
  assert.equal(list.verified,false);assert.deepEqual(list.rows,[]);assert.equal(list.listing,'engine-down');
  assert.equal(list.notice,`Ollama Local is not answering at ${base}. Start it, or change its address with /provider, then open /model again.`);
  assert.doesNotMatch(list.notice,/could not be reached|[A-Z]{3,}_[A-Z_]+/u,'no error code and no "could not be reached"');
});

test('Q-R4-10: an engine with no models says so; an answer that is not a model list says so',async()=>{
  const empty=await engine(()=>({status:200,body:{models:[]}}));
  const none=await createTuiCatalogService(deps({ollama:{endpoint:empty.base}})).providerModels('ollama');
  assert.equal(none.notice,'Ollama Local is running but has no models installed. Install one in Ollama Local, then open /model again.');
  assert.deepEqual(none.rows,[]);
  const odd=await engine(()=>({status:200,body:'<html>proxy</html>',headers:{'content-type':'text/html'}}));
  const other=await createTuiCatalogService(deps({ollama:{endpoint:odd.base}})).providerModels('ollama');
  assert.equal(other.notice,`Ollama Local answered at ${odd.base}, but not with a list of models.`);
  /* The redirect points at a second fake engine that would answer a good list: following it would read that list. */
  const elsewhere=await engine(()=>({status:200,body:TAGS}));
  const moved=await engine(()=>({status:302,body:{},headers:{location:`${elsewhere.base}/api/tags`}}));
  const redirected=await createTuiCatalogService(deps({ollama:{endpoint:moved.base}})).providerModels('ollama');
  assert.equal(redirected.verified,false);assert.equal(moved.seen.length,1);
  assert.equal(elsewhere.seen.length,0,'the redirect is not followed');
  assert.equal(redirected.notice,`Ollama Local answered at ${moved.base}, but not with a list of models.`);
});

test('E10: the configured model is always listed, marked as not installed when the engine does not have it',async()=>{
  const fake=await engine(()=>({status:200,body:TAGS}));
  const catalog=createTuiCatalogService(deps({ollama:{endpoint:fake.base}}));
  const picker=createModelPickerModel(catalog,{provider:'ollama',current:'ollama:llama3.2'});await picker.open();
  assert.deepEqual(picker.rows().map(row=>row.id),['ollama:qwen3-coder-test','ollama:llama3.2']);
  assert.equal(picker.rows()[1]!.availabilityVerified,false);
  assert.equal(picker.verified(),false,'the list is not all live any more');
  assert.match(picker.notice(),/ollama:llama3\.2 is chosen but Ollama Local does not list it\./u);
  const same=createModelPickerModel(catalog,{provider:'ollama',current:'ollama:qwen3-coder-test'});await same.open();
  assert.deepEqual(same.rows().map(row=>row.id),['ollama:qwen3-coder-test']);assert.equal(same.verified(),true);
  const other=createModelPickerModel(catalog,{provider:'ollama',current:'openai:gpt-test'});await other.open();
  assert.deepEqual(other.rows().map(row=>row.id),['ollama:qwen3-coder-test'],'a model of another provider is not added');
});

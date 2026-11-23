/*
 * B1 slice 18 — the key test is a security surface. Each case runs the REAL kernel probe (or the CLI's own check) against a
 * provider on 127.0.0.1 that answers with the status under test, and asserts that the key is saved ONLY on an affirmative
 * acceptance, that every other answer says the key was not verified, and that the key went to that provider's endpoint and
 * nowhere else.
 *
 * ⛔ Correction of record (coordinator, fix round): the contract's "400/404 accepted, 429 valid" came from a request that names a
 *   model, where a 404 answers for the model after authentication. Here the check is a model-list GET or a one-token request
 *   through whatever answers at the configured address, and a wrong path, a proxy or a rate limiter answers 400, 404 or 429
 *   without reading the key (`harness-ui/src/provider-probe.mjs`, the HTTP 404 reason). Only 2xx with a well-formed answer saves.
 */
import {providerLabelText} from '../../src/provider/provider-text.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {createTuiCatalogService} from '../../src/tui/catalog-service.ts';
import {CHR,closedPort,dummyKey,hermetic,REPO_ROOT,startOneTokenProvider,startRedirectPair} from '../provider/first-run-fixture.ts';

const src=path.join(REPO_ROOT,'harness-ui','src');
const REGISTRY=(await import(pathToFileURL(path.join(src,'provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
const {createProviderProbe}=await import(pathToFileURL(path.join(src,'provider-probe.mjs')).href);
/* R2 (D-05): the screen shows the English provider label, mapped by id (provider-text.ts). */
const label=(id:string)=>providerLabelText(id,String(REGISTRY[id].etichetta));

async function statusServer(status:number){
  const seen:Array<{method:string;path:string;authorization:string|null;apiKey:string|null}>=[];
  const server=http.createServer((req,res)=>{seen.push({method:String(req.method),path:new URL(req.url??'/','http://127.0.0.1').pathname,authorization:req.headers.authorization??null,apiKey:(req.headers['x-api-key'] as string)??null});res.writeHead(status,{'content-type':'application/json'});res.end(status===200?JSON.stringify({data:[{id:'m1'}]}):JSON.stringify({error:{message:'status under test'}}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  return{url:`http://127.0.0.1:${(server.address() as any).port}`,seen,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}

function catalogFor(endpoints:Record<string,string>,{setKey,registry=REGISTRY}:{setKey?:(id:string,secret:string)=>void;registry?:Record<string,any>}={}){
  const saved:Array<[string,string]>=[];
  const deps:any={
    publicProviders:()=>[],registry,runtimeFor:(id:string)=>({endpoint:endpoints[id]??registry[id]?.baseUrl,timeoutSeconds:5}),keyFor:()=>null,
    setKey:setKey??((id:string,secret:string)=>{saved.push([id,secret]);}),clearKey:()=>{},persistModel:async()=>{},
    createProbe:()=>{throw new Error('the store probe must not be used to test a candidate key');},
    createKeyProbe:(provider:string,secret:string)=>createProviderProbe({leggiChiave:(id:string)=>id===provider?secret:null,leggiRuntime:(id:string)=>({endpoint:endpoints[id]??registry[id]?.baseUrl,timeoutSeconds:5}),fetchImpl:(url:string,init:any)=>fetch(url,init),env:{}}),
    fetchImpl:(url:string,init:any)=>fetch(url,init),
  };
  return{catalog:createTuiCatalogService(deps),saved};
}

// What a person reads for each status, written out here from the label and the status — not computed by the code under test.
const NOT_VERIFIED='The key was not verified.';
function expectedMessage(id:string,status:number){
  const name=label(id);
  switch(status){
    case 200:return `${name} accepted the key (HTTP 200).`;
    case 401:return `${name} refused the key (HTTP 401).`;
    case 403:return `${name} recognised the key but denied permission (HTTP 403).`;
    case 429:return `${name} answered HTTP 429: rate-limited; try again shortly. ${NOT_VERIFIED}`;
    case 500:return `${name} answered HTTP 500, a server error. ${NOT_VERIFIED}`;
    default:return `${name} answered HTTP ${status}, which does not show that the key is valid. ${NOT_VERIFIED}`;
  }
}
// Only an affirmative acceptance saves. Every other row is refused, each with its own outcome.
const TABLE:Array<[number,string]>=[[200,'valid'],[400,'not-verified'],[404,'not-verified'],[429,'rate-limited'],[500,'error'],[401,'invalid'],[403,'permission']];

for(const provider of ['openai','anthropic','openrouter']){
  test(`key test for ${provider}: only HTTP 200 saves; 400, 404, 429 and 500 are not verified; 401 and 403 are refused`,async()=>hermetic(async()=>{
    for(const [status,outcome] of TABLE){
      const server=await statusServer(status);const key=dummyKey(`${provider}-${status}`);
      try{
        const {catalog,saved}=catalogFor({[provider]:`${server.url}/v1`});
        const result=await catalog.setProviderKey(provider,key);
        assert.equal(result.outcome,outcome,`${provider} HTTP ${status}`);
        assert.equal(result.httpStatus,status,`${provider} HTTP ${status}: the status is carried`);
        assert.equal(result.passed,status===200,`${provider} HTTP ${status}: passed only on 200`);
        assert.equal(result.saved,status===200,`${provider} HTTP ${status}: saved only on 200`);
        assert.deepEqual(saved,status===200?[[provider,key]]:[],`${provider} HTTP ${status}: the store is written only on 200`);
        assert.equal(result.message,expectedMessage(provider,status),`${provider} HTTP ${status}: message`);
        if(status!==200&&status!==401&&status!==403)assert.ok(result.message.includes(`HTTP ${status}`)&&result.message.includes('not verified'),'names the status and says not verified');
        assert.equal(result.message.includes(key),false);
        assert.equal(server.seen.length,1,'exactly one request');
        const sent=server.seen[0]!;
        assert.equal(sent.authorization===`Bearer ${key}`||sent.apiKey===key,true,'the key travelled to this provider');
        assert.equal(sent.method,'GET');
        assert.equal(sent.path,provider==='openrouter'?'/v1/models/user':'/v1/models','an authenticated read, never a generation');
      }finally{await server.close();}
    }
  }));
}

test('no response means could not reach, and nothing is saved',async()=>hermetic(async()=>{
  const port=await closedPort();
  for(const provider of ['openai','openrouter','deepinfra','zai-anthropic']){
    const {catalog,saved}=catalogFor({[provider]:`http://127.0.0.1:${port}/v1`});
    const result=await catalog.setProviderKey(provider,dummyKey('offline'));
    assert.equal(result.outcome,'unreachable',provider);assert.equal(result.saved,false);assert.deepEqual(saved,[]);
  }
}));

/*
 * B1 slice 25 — the kernel's own key test (CLI-REQ-06, `harness-ui/src/provider-probe.mjs`). Every provider whose registry probe
 * declares `richiestaMinima` is tested with `prova(id,{consentiGenerazione:true})`: DeepInfra, Novita, Ollama Cloud and Hugging
 * Face (OpenAI chat) and Z.ai's Anthropic port. The request is the kernel's declared one, never one the CLI builds.
 * The contract of `credenzialeVerificata` (`provider-probe.mjs:225-235`): `true` accepted by an authenticated request with this key;
 * `false` judged and not confirmed (`non-autorizzato` refused, or `collegato` on a public catalogue); `null` not judged.
 * ⛔ A key is saved ONLY on `true`. A 401 is a refusal naming the status; a 429 or a 404 is "could not tell", never a wrong key.
 */
const MINIMAL_PROVIDERS=Object.keys(REGISTRY).filter(id=>REGISTRY[id]?.destinazioneChat===true&&REGISTRY[id]?.sonda?.richiestaMinima);
const ONE_TOKEN_NOTICE=(id:string)=>`One message with a one-token limit is sent to ${label(id)} to test the key and may use a small amount of credit.`;

test('the providers whose key test is a one-token request are the ones the kernel registry declares: four OpenAI-chat providers and Z.ai\'s Anthropic port',()=>{
  assert.deepEqual([...MINIMAL_PROVIDERS].sort(),['deepinfra','huggingface','novita','ollama-cloud','zai-anthropic']);
  assert.deepEqual(MINIMAL_PROVIDERS.filter(id=>REGISTRY[id].wire==='openai-chat').sort(),['deepinfra','huggingface','novita','ollama-cloud']);
  assert.deepEqual(MINIMAL_PROVIDERS.filter(id=>REGISTRY[id].wire==='anthropic-messages'),['zai-anthropic']);
});

for(const provider of MINIMAL_PROVIDERS){
  const shape=REGISTRY[provider].wire==='anthropic-messages'?'anthropic-messages':'openai-chat';
  const minimalPath=`/v1${REGISTRY[provider].sonda.richiestaMinima.percorso}`;
  test(`one-token key test for ${provider} (${shape}): saved only on a verified acceptance; 401 is a refusal; a malformed 200 is not confirmed; 429 and 404 could not tell; the kernel's own request, key only in the header`,async()=>hermetic(async()=>{
    const good=dummyKey(`${provider}-good`);const wrong=dummyKey(`${provider}-wrong`);
    for(const [candidate,malformed,expected] of [[good,false,'valid'],[wrong,false,'invalid'],[good,true,'not-verified']] as Array<[string,boolean,string]>){
      const fake=await startOneTokenProvider({goodKey:good,shape,malformed});
      try{
        const {catalog,saved}=catalogFor({[provider]:`${fake.url}/v1`});
        const result=await catalog.setProviderKey(provider,candidate);
        const which=`${provider} ${expected}${malformed?' (malformed body)':''}`;
        assert.equal(result.outcome,expected,which);
        assert.equal(result.saved,expected==='valid',which);
        assert.deepEqual(saved,expected==='valid'?[[provider,good]]:[],which);
        if(expected==='valid')assert.equal(result.message,`${label(provider)} accepted the key (HTTP 200).`);
        if(expected==='invalid')assert.equal(result.message,`${label(provider)} refused the key (HTTP 401).`);
        if(malformed)assert.equal(result.message,`${label(provider)} answered HTTP 200 without a well-formed response. ${NOT_VERIFIED}`);
        assert.equal(fake.requests.length,1,`${which}: exactly one request`);
        const sent=fake.requests[0]!;
        assert.equal(sent.method,'POST');
        assert.equal(sent.path,minimalPath);
        assert.equal(sent.authorizedAs,candidate===good?'good':'other','the key travelled in the header');
        assert.deepEqual(JSON.parse(sent.body),REGISTRY[provider].sonda.richiestaMinima.corpo,'the kernel\'s declared minimal request, not one the CLI builds');
        assert.equal(sent.body.includes(candidate),false,'the key is not in the body');
        assert.equal(sent.url.includes(candidate),false,'the key is not in the URL');
        assert.equal(result.message.includes(candidate),false,'the key is not in the message');
      }finally{await fake.close();}
    }
    // Not judged: a rate limit or a missing model answers without reading the key. Could not tell, never a wrong key.
    for(const [status,expected] of [[429,'rate-limited'],[404,'not-verified']] as Array<[number,string]>){
      const server=await statusServer(status);const candidate=dummyKey(`${provider}-${status}`);
      try{
        const {catalog,saved}=catalogFor({[provider]:`${server.url}/v1`});
        const result=await catalog.setProviderKey(provider,candidate);
        assert.equal(result.outcome,expected,`${provider} HTTP ${status}`);
        assert.equal(result.passed,false);assert.equal(result.saved,false);assert.deepEqual(saved,[],`${provider} HTTP ${status}: nothing saved`);
        assert.equal(result.httpStatus,status);
        assert.equal(result.message,expectedMessage(provider,status),`${provider} HTTP ${status}: message`);
        assert.ok(result.message.includes(`HTTP ${status}`)&&result.message.includes(NOT_VERIFIED),'names the status and says the key was not verified');
        assert.equal(/refused/u.test(result.message),false,'never called a refused key');
        assert.deepEqual(server.seen.map(row=>[row.method,row.path]),[['POST',minimalPath]],'the one minimal request, nothing else');
      }finally{await server.close();}
    }
  }));
}

test('the one-token test is announced for the providers that get it, and only for them',()=>{
  const {catalog}=catalogFor({});
  for(const provider of MINIMAL_PROVIDERS)assert.equal(catalog.keyTestNotice(provider),ONE_TOKEN_NOTICE(provider),provider);
  for(const provider of ['openrouter','openai','anthropic','deepseek','vertex'])assert.equal(catalog.keyTestNotice(provider),null,provider);
});

test('without a declared minimal request, a public catalogue cannot verify a key: unverifiable, not saved, and the kernel is never asked to generate',async()=>hermetic(async()=>{
  const server=await statusServer(200);
  try{
    // The CLI's registry without DeepInfra's declaration: the key test must not ask for a generation the registry did not declare.
    const {richiestaMinima:_declared,...sonda}=REGISTRY.deepinfra.sonda;
    const registry={...REGISTRY,deepinfra:{...REGISTRY.deepinfra,sonda}};
    const {catalog,saved}=catalogFor({deepinfra:`${server.url}/v1`},{registry});
    assert.equal(catalog.keyTestNotice('deepinfra'),null,'no one-token request is announced');
    const result=await catalog.setProviderKey('deepinfra',dummyKey('public-catalogue'));
    assert.equal(result.outcome,'unverifiable');assert.equal(result.saved,false);assert.deepEqual(saved,[]);
    assert.equal(result.message,`TALOS has no way to verify a ${label('deepinfra')} key.`);
    assert.deepEqual(server.seen.map(row=>row.method),['GET'],'the public catalogue was read, and nothing was generated');
  }finally{await server.close();}
}));

/*
 * The decision table, against the kernel's written contract. Each row is a result the kernel probe can return (or, last rows,
 * one it must not, which must still never save or accuse the key). The expected outcome is written here, not computed.
 */
test('a key is saved only when the kernel answers credenzialeVerificata === true; false refuses or cannot verify; null could not tell',async()=>{
  const rows:Array<[string,any,string]>=[
    ['verified acceptance',{esito:'collegato',credenzialeVerificata:true,httpStatus:200},'valid'],
    ['refused, 401',{esito:'non-autorizzato',credenzialeVerificata:false,httpStatus:401},'invalid'],
    ['refused, 403',{esito:'non-autorizzato',credenzialeVerificata:false,httpStatus:403},'permission'],
    ['public catalogue reached',{esito:'collegato',credenzialeVerificata:false,httpStatus:200},'unverifiable'],
    ['one-token 200 that is not a completion',{esito:'errore',credenzialeVerificata:false,httpStatus:200},'not-verified'],
    ['rate limit',{esito:'errore',credenzialeVerificata:null,httpStatus:429},'rate-limited'],
    ['model not found',{esito:'errore',credenzialeVerificata:null,httpStatus:404},'not-verified'],
    ['payment required',{esito:'errore',credenzialeVerificata:null,httpStatus:402},'not-verified'],
    ['server error',{esito:'errore',credenzialeVerificata:null,httpStatus:503},'error'],
    ['oversized body',{esito:'errore',credenzialeVerificata:null,httpStatus:200},'not-verified'],
    ['unreachable',{esito:'irraggiungibile',credenzialeVerificata:null},'unreachable'],
    ['no catalogue to probe',{esito:'non-sondabile',credenzialeVerificata:null},'unverifiable'],
    ['nothing to probe with',{esito:'non-provabile',credenzialeVerificata:null},'unverifiable'],
    ['off contract: connected without the field',{esito:'collegato',httpStatus:200},'not-verified'],
    ['off contract: connected, not judged',{esito:'collegato',credenzialeVerificata:null,httpStatus:200},'not-verified'],
    ['off contract: a truthy non-boolean',{esito:'collegato',credenzialeVerificata:'true',httpStatus:200},'not-verified'],
    ['off contract: a 401 not judged',{esito:'errore',credenzialeVerificata:null,httpStatus:401},'not-verified'],
    ['off contract: verified, but not connected',{esito:'errore',credenzialeVerificata:true,httpStatus:200},'not-verified'],
  ];
  for(const [name,answer,expected] of rows){
    const saved:Array<[string,string]>=[];
    const catalog=createTuiCatalogService({
      publicProviders:()=>[],registry:REGISTRY,runtimeFor:()=>({}),keyFor:()=>null,setKey:(id:string,secret:string)=>{saved.push([id,secret]);},clearKey:()=>{},persistModel:async()=>{},
      createProbe:()=>{throw new Error('the store probe must not be used to test a candidate key');},
      createKeyProbe:()=>({prova:async()=>({provider:'deepinfra',...answer})}),
    } as any);
    const result=await catalog.setProviderKey('deepinfra',dummyKey('table'));
    assert.equal(result.outcome,expected,name);
    assert.equal(result.saved,expected==='valid',`${name}: saved only on a verified acceptance`);
    assert.equal(saved.length,expected==='valid'?1:0,`${name}: the store`);
    if(answer.credenzialeVerificata!==false)assert.equal(/refused/u.test(result.message),false,`${name}: a key nobody judged is never called refused`);
  }
});

test('a chat provider with no way to verify a key keeps unverifiable, named, not saved, and nothing is sent',async()=>hermetic(async()=>{
  const server=await statusServer(200);
  try{
    const {catalog,saved}=catalogFor({vertex:`${server.url}/v1`});
    const result=await catalog.setProviderKey('vertex',dummyKey('vertex'));
    assert.equal(result.outcome,'unverifiable');assert.equal(result.saved,false);assert.deepEqual(saved,[]);
    assert.equal(result.message,`TALOS has no way to verify a ${label('vertex')} key.`);
    assert.equal(server.seen.length,0);
  }finally{await server.close();}
}));

/*
 * ⛔ Condition 5. Node 24.18 drops `Authorization` on a cross-origin redirect (measured by the coordinator), so `redirect:'error'`
 *   is defence in depth, and this test is what holds it: the second server must receive nothing, and the key is not saved.
 * B1 slice 25: DeepInfra's key test is now the kernel's, like Z.ai's. The kernel answers a refused redirect `irraggiungibile` with
 *   `credenzialeVerificata: null` (its reason names the redirect, in the kernel's words), so the CLI says it could not be reached:
 *   could not tell, never a wrong key. OpenRouter's key test is the CLI's own authenticated read, which names the redirect.
 */
test('a redirect during the key test is not followed: nothing reaches the second server and the key is not saved',async()=>hermetic(async()=>{
  for(const provider of ['openrouter','deepinfra','zai-anthropic']){
    const pair=await startRedirectPair();
    try{
      const {catalog,saved}=catalogFor({[provider]:`${pair.url}/v1`});
      const result=await catalog.setProviderKey(provider,dummyKey(`${provider}-redirect`));
      assert.equal(result.saved,false,`${provider}: not saved`);assert.deepEqual(saved,[],provider);
      assert.equal(result.passed,false,provider);
      if(provider==='openrouter'){assert.equal(result.outcome,'redirected',provider);assert.equal(result.message,`${label(provider)} answered with a redirect, and TALOS does not send a key on to another address. ${NOT_VERIFIED}`);}
      else{assert.equal(result.outcome,'unreachable',provider);assert.equal(result.message,`${label(provider)} could not be reached, so the key could not be tested.`);}
      assert.deepEqual(pair.target.requests.filter(row=>row.hadAuthorization),[],`${provider}: no request carrying a key reached the second server`);
      assert.deepEqual(pair.target.requests,[],`${provider}: the redirect was not followed at all`);
    }finally{await pair.close();}
  }
}));

/*
 * ⛔ Condition 6. Measured with Node's fetch: `€` or DEL make fetch throw before sending (and the screen said "could not be
 *   reached"); a tab, a non-breaking space, `é` or an inner space are sent as they are. After trimming, anything outside printable
 *   ASCII 0x21-0x7E is malformed, and nothing is sent.
 */
test('a key with a character no provider issues is malformed and sends nothing, on every kind of check',async()=>hermetic(async()=>{
  const cases:Array<[string,string]>=[['euro',CHR(0x20ac)],['DEL',CHR(0x7f)],['tab',CHR(0x09)],['non-breaking space',CHR(0xa0)],['e-acute',CHR(0xe9)],['inner space',' '],['line break',CHR(0x0a)],['NUL',CHR(0x00)]];
  const server=await statusServer(200);const oneToken=await startOneTokenProvider({goodKey:'unused',shape:'openai-chat'});
  try{
    for(const provider of ['openrouter','openai','deepinfra']){
      const endpoint=provider==='deepinfra'?`${oneToken.url}/v1`:`${server.url}/v1`;
      const {catalog,saved}=catalogFor({[provider]:endpoint});
      for(const [name,character] of [...cases,['empty',''] as [string,string]]){
        const key=name==='empty'?'   ':`sk-talos-${name.replace(/\W/gu,'')}${character}tail`;
        const result=await catalog.setProviderKey(provider,key);
        assert.equal(result.outcome,'malformed',`${provider}: ${name}`);
        assert.equal(result.saved,false,`${provider}: ${name}`);
        assert.equal(result.message,'The key is empty or contains a character no provider issues (only printable ASCII without spaces is accepted). Nothing was sent.');
      }
      assert.deepEqual(saved,[],provider);
    }
    assert.equal(server.seen.length,0,'zero requests at the fake');
    assert.equal(oneToken.requests.length,0,'zero requests at the one-token fake');
    // Surrounding whitespace is trimmed, not refused: the same key with a trailing line break is tested and saved.
    const {catalog,saved}=catalogFor({openai:`${server.url}/v1`});
    const good=dummyKey('trimmed');
    assert.equal((await catalog.setProviderKey('openai',` ${good}${CHR(0x0a)}`)).saved,true);
    assert.deepEqual(saved,[['openai',good]]);
  }finally{await server.close();await oneToken.close();}
}));

test('a key that passed but could not be stored says so by code',async()=>hermetic(async()=>{
  const server=await statusServer(200);
  try{
    const failing=catalogFor({openai:`${server.url}/v1`},{setKey:()=>{throw Object.assign(new Error('the store refused'),{code:'PROVIDER_STORE_UNAVAILABLE'});}}).catalog;
    const result=await failing.setProviderKey('openai',dummyKey('store'));
    assert.equal(result.saved,false);assert.equal(result.passed,true);
    assert.equal(result.message,`${label('openai')} accepted the key (HTTP 200). It could not be saved (PROVIDER_STORE_UNAVAILABLE).`);
  }finally{await server.close();}
}));

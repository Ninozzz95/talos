/*
 * The cures of the SECOND adversarial review of 0.6.2 (bugfixer, 13/10/2026, on e379b2b0a), next to its two red files
 * (test/runtime/review-062b-chatgpt-check-not-stopped.test.ts, B1; review-062b-snapshot-other-process.test.ts, S1). Each RED
 * before its cure:
 *   S1  the open screen reads the file again before it checks: what another terminal reset is not answered from memory;
 *   S2  no background check for a provider whose probe starts a process (the external agent), and nothing said of it;
 *   S3  a key the provider accepted reads «verified» for its hour whatever a reached public catalogue says meanwhile; after the
 *       hour nobody re-judged it, «not verified»; the one-token generation that judges it is never sent in the background;
 *   S4  the plan's list that answers after a sign-out does not write «available»;
 *   N3  «reached» with no verdict, from a provider that needs a credential, is «not verified»; a keyless local engine is not;
 *   N5  an answer that lands after the budget tells the screen;
 *   B1  `stopProviderChecks` ends the plan's own reads too; a test the person stopped writes nothing.
 * Mocks only: fake probes, a snapshot in a temp folder, no key is real, nothing leaves the machine.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {createProviderControlPlane} from '../../src/provider/control-plane.ts';
import {readProviderStateSnapshot,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const REGISTRY={
  openrouter:{id:'openrouter',destinazioneChat:true,etichetta:'OpenRouter',chiaveObbligatoria:true,baseUrl:'https://openrouter.example/api/v1'},
  openai:{id:'openai',destinazioneChat:true,etichetta:'OpenAI',chiaveObbligatoria:true,baseUrl:'https://openai.example/v1'},
  /* one of the four public catalogues: its key is judged only by the minimal request the kernel declares (provider-registry.mjs) */
  deepinfra:{id:'deepinfra',destinazioneChat:true,etichetta:'DeepInfra',chiaveObbligatoria:true,baseUrl:'https://deepinfra.example/v1',
    sonda:{catalogoPubblico:true,richiestaMinima:{percorso:'/chat/completions',corpo:{model:'m',max_tokens:1,stream:false,messages:[{role:'user',content:'.'}]}}}},
  ollama:{id:'ollama',destinazioneChat:true,etichetta:'Ollama',chiaveObbligatoria:false,baseUrl:'http://127.0.0.1:11434'},
  chatgpt:{id:'chatgpt',destinazioneChat:true,etichetta:'ChatGPT plan',chiaveObbligatoria:false,baseUrl:'https://api.openai.example/v1',auth:{tipo:'oauth-pkce',nomeVariabile:[]}},
  /* the external agent, as the kernel registry declares it (provider-registry.mjs: `wire:'acp'`, keyless) */
  esterno:{id:'esterno',destinazioneChat:true,etichetta:'External agent',chiaveObbligatoria:false,baseUrl:null,wire:'acp',auth:{tipo:'keyless'},esecuzione:'configurato'},
};
const ACCEPTED=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:12});
const PUBLIC_CATALOGUE=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:false,millisecondi:40});
const NO_KEY_TO_JUDGE=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:null,millisecondi:3});
const NO_VERDICT=(id:string)=>({provider:id,esito:'collegato',millisecondi:5});

function tempFile(t:import('node:test').TestContext){
  const root=mkdtempSync(join(tmpdir(),'talos-review-062b-cures-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return join(root,'provider-state.json');
}
type Asked={id:string;options:unknown};
function deps(overrides:Partial<TuiCatalogDeps>&{answer:(id:string)=>any;asked?:Asked[]}):TuiCatalogDeps{
  const {answer,asked=[],...rest}=overrides;
  return{
    publicProviders:()=>[],registry:REGISTRY,
    runtimeFor:()=>({endpoint:'https://provider.example/v1',timeoutSeconds:5}),
    keyFor:()=>'sk-test-not-a-real-key',setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async(id:string,options?:unknown)=>{asked.push({id,options});return answer(id);},elencaModelli:async()=>[]}),
    persistModel:async()=>{},
    ...rest,
  } as unknown as TuiCatalogDeps;
}

test('S1: the provider on the row, reset by another terminal, is read from the file again before the open screen answers',async t=>{
  const file=tempFile(t);const asked:Asked[]=[];
  const tenMinutesAgo=Date.now()-10*60_000;
  writeProviderStateSnapshot({file,now:tenMinutesAgo,providers:{openai:{state:'available',verified:true,checkedAt:tenMinutesAgo,latencyMs:20}}});
  const screen=createTuiCatalogService(deps({answer:ACCEPTED,asked,providerStateFile:file}));
  assert.equal(screen.providerState!('openai')!.state,'available');
  /* a second terminal removes the key (provider-cli.ts -> catalog.clearProviderKey) */
  await createTuiCatalogService(deps({answer:ACCEPTED,providerStateFile:file})).clearProviderKey('openai');
  /* the open screen asks again (the person came back to this model, a key changed here): it must not answer «verified» from memory */
  await screen.refreshProviderState!('openai');
  assert.equal(asked.length,1,'what the open screen remembered of a key that was removed elsewhere answered with no check');
  /* a file that cannot be read brings nothing, and nothing is invented (fail-closed), but what this process knows is not lost */
  rmSync(file,{force:true});
  assert.equal((await screen.refreshProviderState!('openai'))!.state,'available','the check just made is still known');
  assert.equal(asked.length,1);
});

test('S2: no background check for a provider whose probe starts a process, and nothing is said of it',async t=>{
  const file=tempFile(t);const asked:Asked[]=[];
  const catalog=createTuiCatalogService(deps({answer:PUBLIC_CATALOGUE,asked,providerStateFile:file}));
  assert.equal(catalog.providerState!('esterno'),null,'the row has nothing to say of the external agent');
  assert.equal(await catalog.refreshProviderState!('esterno'),null);
  assert.deepEqual(asked,[],'the probe — which starts the agent\'s process — was called by the background check');
  /* and a provider that starts nothing is checked as before */
  assert.equal((await catalog.refreshProviderState!('openai'))!.state,'unverified');
  assert.equal(asked.length,1);
});

test('S3: a key the provider accepted reads «verified» for its hour whatever the public catalogue says; then «not verified»; no generation in the background',async t=>{
  const file=tempFile(t);const asked:Asked[]=[];const keyTests:unknown[]=[];
  const catalog=createTuiCatalogService(deps({answer:PUBLIC_CATALOGUE,asked,providerStateFile:file,providerStateTtlMs:400,
    createKeyProbe:()=>({prova:async(id:string,options?:unknown)=>{keyTests.push(options);return ACCEPTED(id);}})}));
  /* the key test: the one-token generation, asked for by the person, accepted */
  const saved=await catalog.setProviderKey('deepinfra','sk-test-not-a-real-key');
  assert.equal(saved.saved,true);assert.deepEqual(keyTests,[{consentiGenerazione:true}]);
  assert.deepEqual((r=>[r.state,r.verified])(catalog.providerState!('deepinfra')!),['available',true]);
  /* a test by hand reaches the public catalogue, which answers whatever the key is: it says nothing against the accepted key */
  await catalog.probeProvider('deepinfra');
  assert.deepEqual((r=>[r.state,r.verified])(catalog.providerState!('deepinfra')!),['available',true],'the same key read «verified», then «not verified» a moment later');
  assert.deepEqual((r=>[r?.state,r?.verified])(readProviderStateSnapshot({file}).providers.deepinfra),['available',true]);
  /* the status row's check inside the hour: nothing is sent */
  const before=asked.length;
  assert.equal((await catalog.refreshProviderState!('deepinfra'))!.state,'available');assert.equal(asked.length,before);
  /* after its hour nobody re-judged the key: the background check reaches the catalogue only, and the row says so */
  await sleep(450);
  const later=await catalog.refreshProviderState!('deepinfra');
  assert.deepEqual([later!.state,later!.verified],['unverified',false]);
  assert.equal(keyTests.length,1,'the generation that judges the key was sent in the background');
  assert.ok(asked.every(call=>call.options===undefined),'the background probe never carries the consent to generate');
});

test('S4: the plan\'s list that answers after a sign-out does not write «available»; one that answers for the session in use is verified',async t=>{
  const file=tempFile(t);
  let release:(rows:any[])=>void=()=>{};const signedOut:Array<()=>void>=[];const signals:Array<AbortSignal|undefined>=[];
  const plan:any={state:()=>({connected:true,email:'p@example.com',planEnabled:true,signingIn:false,usageUrl:''}),
    models:({signal}:{signal?:AbortSignal}={})=>{signals.push(signal);return new Promise<any[]>(resolve=>{release=resolve;});},stopRequests(){}};
  const handle:any={available:true,stored:()=>true,loaded:()=>plan,load:async()=>plan,onSignedOut:(listener:()=>void)=>{signedOut.push(listener);},signOut:async()=>({revoked:true}),signedIn:()=>({connected:true,planEnabled:true}),stopRequests(){},kernelFacade:null};
  const catalog=createTuiCatalogService(deps({answer:ACCEPTED,providerStateFile:file,chatgpt:handle}));
  const row={id:'chatgpt:gpt-5.5',nome:'GPT-5.5',provider:'chatgpt',contextLength:null};
  /* the picker asks the list; the person signs out while it is away; the answer lands */
  const picker=new AbortController();
  const listing=catalog.providerModels('chatgpt',picker.signal);
  await sleep(10);
  assert.equal(signals[0],picker.signal,'the picker\'s signal travels with the plan\'s list (B1)');
  for(const listener of signedOut)listener();
  release([row]);await listing;
  assert.equal(catalog.providerState!('chatgpt')!.state,'unverified','the list asked BEFORE the sign-out wrote «available» after it');
  assert.equal(readProviderStateSnapshot({file}).providers.chatgpt?.state,'unverified');
  /* no sign-out: the account answered a request made with the plan's token */
  const again=catalog.providerModels('chatgpt');await sleep(10);release([row]);await again;
  assert.deepEqual((r=>[r.state,r.verified])(catalog.providerState!('chatgpt')!),['available',true]);
});

test('N3: «reached» with no verdict is «not verified» for a provider that needs a credential; a keyless local engine still reads «verified»',async t=>{
  const file=tempFile(t);
  const catalog=createTuiCatalogService(deps({answer:id=>id==='ollama'?NO_KEY_TO_JUDGE(id):NO_VERDICT(id),providerStateFile:file}));
  assert.deepEqual((r=>[r!.state,r!.verified])(await catalog.refreshProviderState!('openai')),['unverified',null],'reached, nobody judged the key, and the row would read «verified»');
  assert.deepEqual((r=>[r!.state,r!.verified])(await catalog.refreshProviderState!('ollama')),['available',null],'nothing to judge: a local engine with no key');
  /* a file that holds such an entry (written before this cure) is read the same way, and checked again at this start */
  writeProviderStateSnapshot({file,now:Date.now(),providers:{chatgpt:{state:'available',verified:null,checkedAt:Date.now(),latencyMs:null}}});
  let probes=0;
  const signInProbe=async(id:string)=>{probes+=1;return{provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:7};};
  const base=deps({answer:NO_VERDICT});
  const controlPlane=createProviderControlPlane({publicProviders:base.publicProviders,registry:REGISTRY,runtimeFor:base.runtimeFor,keyFor:base.keyFor,createProbe:base.createProbe,signInProbe,signedIn:()=>({connected:true,planEnabled:true})} as any);
  const plan=createTuiCatalogService({...base,providerStateFile:file,controlPlane});
  assert.equal(plan.providerState!('chatgpt')!.state,'unverified','«available» with no verdict, for the plan, read as verified from the file');
  /* the plan's own probe states its verdict (talos-composition.ts `signInProbe`): the list answered with the plan's token */
  assert.deepEqual((r=>[r!.state,r!.verified])(await plan.refreshProviderState!('chatgpt')),['available',true]);
  assert.equal(probes,1);
  /* a sign-in probe that states nothing does not vouch */
  const silent=createProviderControlPlane({publicProviders:base.publicProviders,registry:REGISTRY,runtimeFor:base.runtimeFor,keyFor:base.keyFor,createProbe:base.createProbe,signInProbe:async(id:string)=>({provider:id,esito:'collegato'}),signedIn:()=>({connected:true,planEnabled:true})} as any);
  const other=createTuiCatalogService({...base,providerStateFile:tempFile(t),controlPlane:silent});
  assert.equal((await other.refreshProviderState!('chatgpt'))!.state,'unverified');
});

test('N5: an answer that lands after the budget tells the screen, once, and only when it was written',async t=>{
  const file=tempFile(t);
  let release:(value:any)=>void=()=>{};
  const catalog=createTuiCatalogService(deps({answer:()=>new Promise(resolve=>{release=resolve;}),providerStateFile:file,providerStateBudgetMs:40}));
  const told:string[]=[];catalog.onProviderStateChanged!(id=>told.push(id));
  assert.equal((await catalog.refreshProviderState!('openai'))!.state,'unverified','the budget ended the wait');
  assert.deepEqual(told,[]);
  release(ACCEPTED('openai'));await sleep(20);
  assert.equal(catalog.providerState!('openai')!.state,'available');
  assert.deepEqual(told,['openai'],'the late answer was written and nobody was told: the row stays «not verified» for the session');
  /* the check the screen then asks for costs nothing: what is known vouches */
  assert.equal((await catalog.refreshProviderState!('openai'))!.state,'available');
  /* a late answer that speaks of a key that changed meanwhile is neither written nor announced */
  const second=createTuiCatalogService(deps({answer:()=>new Promise(resolve=>{release=resolve;}),providerStateFile:tempFile(t),providerStateBudgetMs:40}));
  await second.refreshProviderState!('openai');
  await second.clearProviderKey('openai');
  const heard:string[]=[];second.onProviderStateChanged!(id=>heard.push(id));
  release(ACCEPTED('openai'));await sleep(20);
  assert.deepEqual(heard,[]);assert.equal(second.providerState!('openai')!.state,'unverified');
});

test('B1: `stopProviderChecks` ends the plan\'s own reads too; a test the person stopped writes nothing',async t=>{
  const file=tempFile(t);let stopped=0;
  const handle:any={available:true,stored:()=>false,loaded:()=>null,load:async()=>null,onSignedOut(){},signOut:async()=>null,signedIn:()=>null,stopRequests(){stopped+=1;},kernelFacade:null};
  const catalog=createTuiCatalogService(deps({answer:ACCEPTED,providerStateFile:file,chatgpt:handle}));
  catalog.stopProviderChecks!();
  assert.equal(stopped,1,'the screen left and the plan\'s reads were not told');
  /* `/provider` test, stopped with Esc: the kernel probe answers «unreachable» for its own abort */
  const hand=new AbortController();
  const slow=createTuiCatalogService(deps({answer:()=>({provider:'openai',esito:'irraggiungibile'}),providerStateFile:file}));
  hand.abort();await slow.probeProvider('openai',hand.signal);
  assert.equal(readProviderStateSnapshot({file}).providers.openai,undefined,'a stopped test was written as «unavailable»');
});

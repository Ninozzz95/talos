/*
 * The cures of the third adversarial review of 0.6.2 (bugfixer, 13/10/2026, on 550e25973), in the catalog's provider state:
 *   S2  an entry does not vouch when the provider needs a credential and this process has none (the review's own RED test is
 *       review-062c-verified-without-a-key.test.ts); nothing is sent and nothing is written for it; with a key it is as before;
 *   S5  an observation is stamped with the moment its check was ASKED, so a reset another terminal wrote meanwhile wins.
 * Mocks only: fake probes, a fake plan handle, a temp folder, no key is real, nothing leaves the machine.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {providerStateVouches,readProviderStateSnapshot,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';

const REGISTRY={
  openai:{id:'openai',destinazioneChat:true,etichetta:'OpenAI',chiaveObbligatoria:true,baseUrl:'https://openai.example/v1'},
  ollama:{id:'ollama',destinazioneChat:true,etichetta:'Ollama',chiaveObbligatoria:false,baseUrl:'http://127.0.0.1:11434'},
  chatgpt:{id:'chatgpt',destinazioneChat:true,etichetta:'ChatGPT plan',chiaveObbligatoria:false,baseUrl:'https://api.openai.example/v1',auth:{tipo:'oauth-pkce',nomeVariabile:[]}},
};
const ACCEPTED=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:12});
type Extra=Partial<TuiCatalogDeps>&{key?:()=>string|null;prova?:(id:string)=>Promise<unknown>};
function catalogOn(file:string,counter:{calls:number},{key=()=>'sk-test-not-a-real-key',prova,...rest}:Extra={}){
  return createTuiCatalogService({
    publicProviders:()=>[],registry:REGISTRY,
    runtimeFor:()=>({endpoint:'https://provider.example/v1',timeoutSeconds:5}),
    keyFor:key,setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async(id:string)=>{counter.calls+=1;return prova?prova(id):ACCEPTED(id);},elencaModelli:async()=>[]}),
    persistModel:async()=>{},providerStateFile:file,...rest,
  } as unknown as TuiCatalogDeps);
}
function folder(t:{after(fn:()=>void):void}){const root=mkdtempSync(join(tmpdir(),'talos-review-062c-cures-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return join(root,'provider-state.json');}
const tenMinutesAgo=()=>Date.now()-10*60_000;
const verifiedAt=(at:number)=>({state:'available' as const,verified:true,checkedAt:at,latencyMs:20});

test('S2: with no key, nothing is sent and the file is left as it was; the row reads «not verified» before and after the refresh',async t=>{
  const file=folder(t);const counter={calls:0};const at=tenMinutesAgo();
  writeProviderStateSnapshot({file,now:at,providers:{openai:verifiedAt(at)}});
  const before=readFileSync(file,'utf8');
  const catalog=catalogOn(file,counter,{key:()=>null});
  /* the synchronous reading the first frame makes, before any refresh */
  const first=catalog.providerState!('openai')!;
  assert.equal(providerStateVouches(first),false,`the first frame reads «verified» with no key: ${JSON.stringify(first)}`);
  assert.equal(first.vouchesUntil,null,'an answer that does not vouch has no hour to wait for');
  const refreshed=await catalog.refreshProviderState!('openai');
  assert.equal(refreshed!.state,'unverified');
  assert.equal(counter.calls,0,'a check was sent for a provider that has no key');
  assert.equal(readFileSync(file,'utf8'),before,'the file was written: another terminal, where the key is set, is right to trust it');
});

test('S2: with the key in use nothing changes — a fresh entry that vouches answers with no check; a keyless local engine too',async t=>{
  const file=folder(t);const counter={calls:0};const at=tenMinutesAgo();
  writeProviderStateSnapshot({file,now:at,providers:{openai:verifiedAt(at),ollama:{state:'available',verified:null,checkedAt:at,latencyMs:3}}});
  const catalog=catalogOn(file,counter,{key:id=>id==='openai'?'sk-test-not-a-real-key':null} as Extra);
  const openai=await catalog.refreshProviderState!('openai');
  assert.equal(providerStateVouches(openai)&&openai!.fresh,true);
  /* HOUR (the nit): the open screen is told when this answer stops vouching — its check plus the hour */
  assert.equal(openai!.vouchesUntil,at+60*60_000);
  const ollama=await catalog.refreshProviderState!('ollama');
  assert.equal(providerStateVouches(ollama)&&ollama!.fresh,true,'a local engine needs no key: it keeps reading «verified»');
  assert.equal(counter.calls,0);
});

test('S2: the key comes back in this process (set through the catalog) — the row vouches again',async t=>{
  const file=folder(t);const counter={calls:0};const at=tenMinutesAgo();let key:string|null=null;
  writeProviderStateSnapshot({file,now:at,providers:{openai:verifiedAt(at)}});
  const catalog=catalogOn(file,counter,{key:()=>key,setKey:(_id:string,secret:string)=>{key=secret;},
    createKeyProbe:()=>({prova:async(id:string)=>ACCEPTED(id)})} as Extra);
  assert.equal(providerStateVouches(catalog.providerState!('openai')),false);
  const saved=await catalog.setProviderKey('openai','sk-test-not-a-real-key');
  assert.equal(saved.saved,true);
  assert.equal(providerStateVouches(catalog.providerState!('openai')),true);
});

test('S2: the plan with nobody signed in is not «verified», whatever the file kept; signed in, it is',async t=>{
  const file=folder(t);const counter={calls:0};const at=tenMinutesAgo();
  writeProviderStateSnapshot({file,now:at,providers:{chatgpt:verifiedAt(at)}});
  let connected=false;let probes=0;
  const handle={available:true,stored:()=>connected,signedIn:()=>({connected,planEnabled:connected}),load:async()=>null,loaded:()=>null,onSignedOut:()=>{},signOut:async()=>null,stopRequests:()=>{},kernelFacade:null};
  const controlPlane={probe:async(id:string)=>{probes+=1;return{id,lastHealth:{state:'available',credentialVerified:true,latencyMs:5}};},invalidate:()=>{},list:()=>[],readiness:()=>({ready:true})};
  const catalog=catalogOn(file,counter,{chatgpt:handle,controlPlane} as unknown as Extra);
  const signedOut=await catalog.refreshProviderState!('chatgpt');
  assert.equal(providerStateVouches(signedOut),false,`nobody is signed in and the row reads «verified»: ${JSON.stringify(signedOut)}`);
  assert.equal(probes,0,'the plan was asked with nobody signed in');
  connected=true;
  const signedIn=await catalog.refreshProviderState!('chatgpt');
  assert.equal(providerStateVouches(signedIn)&&signedIn!.fresh,true);
});

test('S5: the late answer of a check asked BEFORE another terminal removed the key does not bring «verified» back',async t=>{
  const file=folder(t);const counter={calls:0};
  let answer!:(value:unknown)=>void;const slow=new Promise(resolve=>{answer=resolve;});
  /* terminal A: nothing known, so it checks; the provider is slow and the check outlives its budget */
  const screen=catalogOn(file,counter,{prova:()=>slow,providerStateBudgetMs:20} as Extra);
  let told=0;screen.onProviderStateChanged!(()=>{told+=1;});
  const gaveUp=await screen.refreshProviderState!('openai');
  assert.equal(providerStateVouches(gaveUp),false,'the premise: the check is still away');
  await new Promise(resolve=>setTimeout(resolve,15));
  /* terminal B: `talos provider remove-key openai` */
  await catalogOn(file,counter).clearProviderKey('openai');
  assert.equal(readProviderStateSnapshot({file}).providers.openai?.state,'unverified','the premise: the removal reset the entry on disk');
  await new Promise(resolve=>setTimeout(resolve,15));
  /* the provider answers terminal A now: it accepted the key that was in use when it was asked */
  answer(ACCEPTED('openai'));await new Promise(resolve=>setTimeout(resolve,30));
  const onDisk=readProviderStateSnapshot({file}).providers.openai;
  assert.equal(providerStateVouches(onDisk),false,`the late answer wrote «verified» over the other terminal's removal: ${JSON.stringify(onDisk)}`);
  assert.equal(providerStateVouches(screen.providerState!('openai')),false);
  assert.equal(told,0,'the screen was told of an answer that was not written');
});

test('S5: a late answer nobody contradicted is still written, stamped with the moment it was asked',async t=>{
  const file=folder(t);const counter={calls:0};
  let answer!:(value:unknown)=>void;const slow=new Promise(resolve=>{answer=resolve;});
  const screen=catalogOn(file,counter,{prova:()=>slow,providerStateBudgetMs:20} as Extra);
  let told=0;screen.onProviderStateChanged!(()=>{told+=1;});
  const before=Date.now();
  await screen.refreshProviderState!('openai');
  const afterBudget=Date.now();
  await new Promise(resolve=>setTimeout(resolve,40));
  answer(ACCEPTED('openai'));await new Promise(resolve=>setTimeout(resolve,30));
  const onDisk=readProviderStateSnapshot({file}).providers.openai!;
  assert.equal(providerStateVouches(onDisk),true);assert.equal(told,1);
  assert.ok(onDisk.checkedAt>=before&&onDisk.checkedAt<=afterBudget,`stamped ${onDisk.checkedAt}, asked between ${before} and ${afterBudget}`);
});

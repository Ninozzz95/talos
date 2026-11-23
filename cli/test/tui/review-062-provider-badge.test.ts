/*
 * Adversarial review of 0.6.2 (bugfixer, 13/10/2026), diff talos-cli-v0.6.1..1de5f84af. RED ON PURPOSE: each test proves a finding
 * about the status row's provider badge, which 0.6.2 puts on the real screen for the first time. The cures are the owner's to decide.
 * Mocks only: a fake probe, a snapshot in a temp folder, no key is real, nothing leaves the machine.
 *
 *  B1  a provider whose check is a PUBLIC catalogue (deepinfra, novita, ollama-cloud, huggingface: provider-registry.mjs
 *      `catalogoPubblico`) answers `collegato` with `credenzialeVerificata:false` — the kernel's own words are «key not verified» —
 *      and the row reads «<provider>: verified».
 *  B2  a key removed in this run (`clearProviderKey`, /provider «remove key») leaves the row at «verified» for up to an hour, here
 *      and at the next start.
 *  B3  a «not verified» learnt with no key is kept for an hour too: the key is added, TALOS is started again, and no new check is
 *      made — the row keeps saying «not verified» for a provider that works.
 *  B4  under 100 columns «checking…» takes the place of «? keys» (it is not something that needs the person's attention).
 *  B5  the provider's name reaches the row without `shellSafeText` (the model next to it gets it).
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {providerStateFromProbe,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';
import {footerModeRow,footerModelRow} from '../../src/tui/components/chrome-rows.ts';

const rowText=(row:readonly {text:string}[]|null)=>(row??[]).map(segment=>segment.text).join('');
const footer=(provider:any,width:number,model='deepinfra:some-model')=>({mode:'default',noSandbox:false,queueCount:0,width,model,provider,snapshot:null,workspace:'demo',branch:null});
/* what app.ts hands the row (readProviderVerification): id, state, fresh — and nothing else of the report */
const asTheAppReadsIt=(report:any)=>({id:report.id,state:report.state,fresh:report.fresh===true});

function tempFolder(t:import('node:test').TestContext){
  const root=mkdtempSync(join(tmpdir(),'talos-review-062-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
function deps(file:string,probe:()=>any,counter:{calls:number},key:()=>string|null=()=>'sk-test-not-a-real-key'):TuiCatalogDeps{
  return{
    publicProviders:()=>[],
    registry:{openrouter:{id:'openrouter',destinazioneChat:true,etichetta:'OpenRouter',chiaveObbligatoria:true,baseUrl:'https://openrouter.example/api/v1'}},
    runtimeFor:()=>({endpoint:'https://openrouter.example/api/v1',timeoutSeconds:5}),
    keyFor:key,setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async()=>{counter.calls+=1;return probe();},elencaModelli:async()=>[]}),
    persistModel:async()=>{},
    providerStateFile:file,
  } as unknown as TuiCatalogDeps;
}

test('B1: a public catalogue that says nothing of the key does not make the row read «verified»',()=>{
  /* provider-probe.mjs:470-482, the answer of a provider with `catalogoPubblico` */
  const entry=providerStateFromProbe({provider:'deepinfra',esito:'collegato',credenzialeVerificata:false,millisecondi:40},Date.now());
  assert.equal(entry?.verified,false,'the snapshot itself keeps «the key was not judged»');
  const text=rowText(footerModelRow(footer({id:'deepinfra',state:entry!.state,fresh:true},120)));
  assert.equal(text.includes('deepinfra: verified'),false,`the row says «verified» for a key nobody judged:\n${text}`);
});

test('B2: after the key is removed the row no longer reads «verified»',async t=>{
  const counter={calls:0};
  const catalog=createTuiCatalogService(deps(join(tempFolder(t),'provider-state.json'),()=>({provider:'openrouter',esito:'collegato',credenzialeVerificata:true,millisecondi:12}),counter));
  await catalog.refreshProviderState!('openrouter');
  assert.match(rowText(footerModelRow(footer(asTheAppReadsIt(catalog.providerState!('openrouter')),120,'openrouter:x'))),/openrouter: verified/u);
  await catalog.clearProviderKey('openrouter');
  const after=rowText(footerModelRow(footer(asTheAppReadsIt(catalog.providerState!('openrouter')),120,'openrouter:x')));
  assert.equal(after.includes('openrouter: verified'),false,`the key was just removed and the row still says:\n${after}`);
});

test('B3: a «not verified» learnt without a key is checked again at the next start, once the key is there',async t=>{
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};let key:string|null=null;
  const probe=()=>key?{provider:'openrouter',esito:'collegato',credenzialeVerificata:true,millisecondi:12}:{provider:'openrouter',esito:'non-provabile',codice:'PROVIDER_KEY_MISSING'};
  const first=createTuiCatalogService(deps(file,probe,counter,()=>key));
  assert.equal((await first.refreshProviderState!('openrouter'))?.state,'unverified');
  /* third review of 0.6.2 (S2): with no key nothing is sent and nothing is written; the fresh «not verified» the next start
     finds is the one a TALOS before that review left (it asked the kernel's probe, which answered «no key») */
  assert.equal(counter.calls,0);
  writeProviderStateSnapshot({file,providers:{openrouter:{state:'unverified',verified:null,checkedAt:Date.now(),latencyMs:null}}});
  /* the person adds the key and starts TALOS again: a new catalog on the same snapshot file */
  key='sk-test-not-a-real-key';
  const second=createTuiCatalogService(deps(file,probe,counter,()=>key));
  const again=await second.refreshProviderState!('openrouter');
  assert.equal(counter.calls,1,'the start made no new check: the «not verified» of before is kept as fresh for an hour');
  assert.equal(again?.state,'available');
});

test('B4: under 100 columns «checking…» does not take the place of «? keys»',()=>{
  const text=rowText(footerModeRow(footer({id:'ollama',state:'unverified',fresh:false,checking:true},80,'ollama:x')));
  assert.equal(text.includes('? keys'),true,`the keys hint is gone while the row says checking:\n${text}`);
});

test('B5: the provider name on the row is made safe for the terminal, as the model next to it is',()=>{
  const escape=String.fromCharCode(27);
  const id=`evil${escape}[2J`;
  for(const text of [rowText(footerModelRow(footer({id,state:'unverified',fresh:false},120,`${id}:m`))),rowText(footerModeRow(footer({id,state:'unverified',fresh:false},80,`${id}:m`)))])
    assert.equal(text.includes(escape),false,'an escape character in the provider part of the model id reaches the row');
});

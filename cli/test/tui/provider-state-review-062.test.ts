/*
 * The cures of the adversarial review of 0.6.2 (bugfixer, 13/10/2026), next to its own red file (review-062-provider-badge.test.ts,
 * B1–B5). What these pin, each RED before its cure:
 *   C1  «verified» is said only of a provider that answered AND whose key nobody left unjudged — by every door the verdict comes
 *       in (the kernel probe, the control plane's health, a file written by an older version), and on every row that says it;
 *       a local engine with no key to judge still reads «verified».
 *   C2  a key set, removed or taken back resets what the check knew, tells whoever listens (the screen), and an answer of a check
 *       sent BEFORE the change cannot bring the old verdict back.
 *   C3  a «not verified» is checked again at the next start, and once per start: not at every reading.
 *   C4  under 100 columns the first row shows the provider only for «not verified».
 *   C5  the ChatGPT plan's check is inside the same budget as the others (moved to test/runtime/review-062b-plan-check-composition.test.ts:
 *       the real composition, after the second review found this file's fake control plane hollow).
 * Mocks only: fake probes, a snapshot in a temp folder, no key is real, nothing leaves the machine.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {createProviderControlPlane} from '../../src/provider/control-plane.ts';
import {providerStateFromHealth,providerStateFromProbe,readProviderStateSnapshot,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';
import {providerHealthFromProbe} from '../../src/provider/health.ts';
import {footerModeRow,footerModelRow} from '../../src/tui/components/chrome-rows.ts';
import {statusBar} from '../../src/tui/status-bar.ts';

const rowText=(row:readonly {text:string}[]|null)=>(row??[]).map(segment=>segment.text).join('');
const footer=(provider:any,width:number,model:string)=>({mode:'default',noSandbox:false,queueCount:0,width,model,provider,snapshot:null,workspace:'demo',branch:null});
/* what app.ts hands the rows after the cure (readProviderVerification): the report's verdict travels with it */
const asTheAppReadsIt=(report:any)=>({id:report.id,state:report.state,fresh:report.fresh===true,verified:report.verified??null});
const REGISTRY={
  openrouter:{id:'openrouter',destinazioneChat:true,etichetta:'OpenRouter',chiaveObbligatoria:true,baseUrl:'https://openrouter.example/api/v1'},
  deepinfra:{id:'deepinfra',destinazioneChat:true,etichetta:'DeepInfra',chiaveObbligatoria:true,baseUrl:'https://deepinfra.example/v1'},
  ollama:{id:'ollama',destinazioneChat:true,etichetta:'Ollama',chiaveObbligatoria:false,baseUrl:'http://127.0.0.1:11434'},
  chatgpt:{id:'chatgpt',destinazioneChat:true,etichetta:'ChatGPT plan',chiaveObbligatoria:false,baseUrl:'https://api.openai.example/v1',auth:{tipo:'oauth-pkce',nomeVariabile:[]}},
};
/* the kernel's three answers of a provider that was reached (provider-probe.mjs:470-482) */
const ACCEPTED=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:12});
const PUBLIC_CATALOGUE=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:false,millisecondi:40});
const NO_KEY_TO_JUDGE=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:null,millisecondi:3});
const NO_KEY=(id:string)=>({provider:id,esito:'non-provabile',codice:'PROVIDER_KEY_MISSING'});

function tempFolder(t:import('node:test').TestContext){
  const root=mkdtempSync(join(tmpdir(),'talos-review-062-cures-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
function deps(overrides:Partial<TuiCatalogDeps>&{answer:(id:string)=>any;counter:{calls:number}}):TuiCatalogDeps{
  const {answer,counter,...rest}=overrides;
  return{
    publicProviders:()=>[],registry:REGISTRY,
    runtimeFor:()=>({endpoint:'https://provider.example/v1',timeoutSeconds:5}),
    keyFor:()=>'sk-test-not-a-real-key',setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async(id:string)=>{counter.calls+=1;return answer(id);},elencaModelli:async()=>[]}),
    persistModel:async()=>{},
    ...rest,
  } as unknown as TuiCatalogDeps;
}

test('C1: «verified» on every row needs the verdict too: available, fresh and a key left unjudged is «not verified»',()=>{
  /* a file written by 0.6.1 or before for a public catalogue: `available` + `false`, fresh */
  const old={id:'deepinfra',state:'available' as const,fresh:true,verified:false};
  assert.equal(rowText(footerModelRow(footer(old,120,'deepinfra:m'))).includes('deepinfra: verified'),false);
  assert.match(rowText(footerModelRow(footer(old,120,'deepinfra:m'))),/deepinfra: not verified/u);
  assert.match(rowText(footerModeRow(footer(old,80,'deepinfra:m'))),/deepinfra: not verified/u,'and under 100 columns it is said in the first row');
  const bar=statusBar({snapshot:null,model:'deepinfra:m',width:120,safety:{fullAccess:false,noSandbox:false},providerVerification:old});
  assert.equal(bar.text.includes('deepinfra: verified'),false);assert.match(bar.text,/deepinfra: not verified/u);
  /* nothing to judge (a local engine, no key) and a key the provider accepted both read «verified» */
  for(const verified of [null,true]){
    assert.match(rowText(footerModelRow(footer({id:'ollama',state:'available',fresh:true,verified},120,'ollama:m'))),/ollama: verified/u);
    assert.match(statusBar({snapshot:null,model:'ollama:m',width:120,safety:{fullAccess:false,noSandbox:false},providerVerification:{id:'ollama',state:'available',fresh:true,verified}}).text,/ollama: verified/u);
  }
});

test('C1: a local engine with no key to judge reads «verified»; an older file that holds `false` for it is checked again at this start',async t=>{
  assert.deepEqual(providerStateFromProbe(NO_KEY_TO_JUDGE('ollama'),7_000),{state:'available',verified:null,checkedAt:7_000,latencyMs:3},'«nothing to judge» stays null');
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};
  /* what 0.6.1 and before wrote for Ollama: the old reduction turned the kernel's `null` into `false` */
  writeProviderStateSnapshot({file,now:Date.now(),providers:{ollama:{state:'available',verified:false,checkedAt:Date.now(),latencyMs:3}}});
  const catalog=createTuiCatalogService(deps({answer:NO_KEY_TO_JUDGE,counter,providerStateFile:file}));
  const before=rowText(footerModelRow(footer(asTheAppReadsIt(catalog.providerState!('ollama')),120,'ollama:m')));
  assert.equal(before.includes('ollama: verified'),false,`the old file's «false» is not read as verified:\n${before}`);
  await catalog.refreshProviderState!('ollama');
  assert.equal(counter.calls,1,'fresh, but it does not vouch: the start checks it again');
  assert.match(rowText(footerModelRow(footer(asTheAppReadsIt(catalog.providerState!('ollama')),120,'ollama:m'))),/ollama: verified/u,'and the old «false» is gone with the first check, not after its hour');
  assert.equal(readProviderStateSnapshot({file}).providers.ollama?.verified,null,'the file now holds «nothing to judge»');
});

test('C1: the verdict survives the control plane: `/provider` test and `talos provider test` on a public catalogue do not write «available»',async t=>{
  const health=providerHealthFromProbe(PUBLIC_CATALOGUE('deepinfra'),1_000);
  assert.equal(health.state,'available','the provider was reached: its health is what it was');
  assert.equal(providerStateFromHealth(health,2_000)?.state,'unverified','and the badge does not call its key verified');
  assert.equal(providerStateFromHealth(providerHealthFromProbe(ACCEPTED('openrouter'),1_000),2_000)?.verified,true);
  assert.deepEqual(providerStateFromHealth(providerHealthFromProbe(NO_KEY_TO_JUDGE('ollama'),1_000),2_000),{state:'available',verified:null,checkedAt:2_000,latencyMs:3});
  /* through the real control plane and the real catalog, as the screen's «test» does */
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};
  const base=deps({answer:PUBLIC_CATALOGUE,counter,providerStateFile:file});
  const controlPlane=createProviderControlPlane({publicProviders:base.publicProviders,registry:REGISTRY,runtimeFor:base.runtimeFor,keyFor:base.keyFor,createProbe:base.createProbe} as any);
  const catalog=createTuiCatalogService({...base,controlPlane});
  assert.equal((await catalog.probeProvider('deepinfra')).state,'available');
  const text=rowText(footerModelRow(footer(asTheAppReadsIt(catalog.providerState!('deepinfra')),120,'deepinfra:m')));
  assert.equal(text.includes('deepinfra: verified'),false,`a test of a public catalogue made the row say:\n${text}`);
});

test('C2: a key that passed its test and was saved is remembered as verified, with no second request',async t=>{
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};
  let stored:string|null=null;
  const catalog=createTuiCatalogService(deps({answer:id=>stored?ACCEPTED(id):NO_KEY(id),counter,providerStateFile:file,keyFor:()=>stored,setKey:(_id,secret)=>{stored=secret;},
    fetchImpl:async()=>{counter.calls+=1;return new Response('{}',{status:200});}}));
  /* OpenRouter is asked on the endpoint that needs the key (see the test below): with no key nothing is sent */
  assert.equal((await catalog.refreshProviderState!('openrouter')).state,'unverified');assert.equal(counter.calls,0);
  const changed:string[]=[];const off=catalog.onProviderStateChanged!(id=>changed.push(id));
  const saved=await catalog.setProviderKey('openrouter','sk-test-not-a-real-key');
  assert.equal(saved.saved,true);
  assert.deepEqual(changed,['openrouter'],'whoever listens (the screen) is told the key changed');
  const report=catalog.providerState!('openrouter');
  assert.deepEqual([report.state,report.verified,report.fresh],['available',true,true],'the passed test IS the check');
  assert.equal(counter.calls,1,'one request: the key test');
  await catalog.refreshProviderState!('openrouter');
  assert.equal(counter.calls,1,'so the re-check the screen asks for costs no request');
  assert.equal(readProviderStateSnapshot({file}).providers.openrouter?.state,'available','and the next start reads it');
  off();await catalog.clearProviderKey('openrouter');
  assert.deepEqual(changed,['openrouter'],'a listener that left is not called');
});

test('C2: the answer of a check sent before the key was removed does not bring «verified» back',async t=>{
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};
  let release:(value:any)=>void=()=>{};
  const catalog=createTuiCatalogService(deps({answer:()=>new Promise(resolve=>{release=resolve;}),counter,providerStateFile:file}));
  const inFlight=catalog.refreshProviderState!('openrouter');
  await new Promise(resolve=>setImmediate(resolve));
  await catalog.clearProviderKey('openrouter');
  release(ACCEPTED('openrouter'));
  const answered=await inFlight;
  assert.equal(answered.state,'unverified','the check that lands speaks of a key that is gone');
  assert.equal(catalog.providerState!('openrouter').state,'unverified');
  assert.equal(readProviderStateSnapshot({file}).providers.openrouter?.state,'unverified','on disk too');
});

test('C2: an environment key taken back (or approved) resets the check like a removed key',async t=>{
  const counter={calls:0};let approved=true;
  const catalog=createTuiCatalogService(deps({answer:id=>approved?ACCEPTED(id):NO_KEY(id),counter,providerStateFile:join(tempFolder(t),'provider-state.json'),answerEnvironmentKey:(_id,answer)=>{approved=answer==='yes';}}));
  assert.equal((await catalog.refreshProviderState!('openrouter')).state,'available');
  await catalog.answerEnvironmentKey('openrouter','no');
  assert.equal(catalog.providerState!('openrouter').state,'unverified');
  assert.equal((await catalog.refreshProviderState!('openrouter')).state,'unverified');
  assert.equal(counter.calls,2,'and the next check is a real one');
});

test('C3: a «not verified» is checked once per start, not at every reading; a key change opens the next check',async t=>{
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};let key:string|null='sk-test-not-a-real-key';let judged=false;
  /* third review of 0.6.2 (S2): with NO key nothing is checked at all (review-062c-cures.test.ts), so the «not verified» of this
     test is the answer of a check that was made with a key in use and judged nothing */
  const make=()=>createTuiCatalogService(deps({answer:id=>key&&judged?ACCEPTED(id):NO_KEY(id),counter,providerStateFile:file,keyFor:()=>key,clearKey:()=>{key=null;}}));
  const first=make();
  await first.refreshProviderState!('openrouter');await first.refreshProviderState!('openrouter');await first.refreshProviderState!('openrouter');
  assert.equal(counter.calls,1,'three readings in one start: one request');
  /* what the provider answers changes by another door: the next START sees it (B3), this one after a key change */
  judged=true;
  assert.equal((await make().refreshProviderState!('openrouter')).state,'available');assert.equal(counter.calls,2);
  await first.clearProviderKey('openrouter');
  assert.equal((await first.refreshProviderState!('openrouter')).state,'unverified');
  assert.equal(counter.calls,2,'third review, S2: the key is gone — there is nothing to judge and nothing is sent');
  key='sk-test-not-a-real-key';
  assert.equal((await first.refreshProviderState!('openrouter')).state,'available');
  assert.equal(counter.calls,3,'after a key change the same start checks again');
  /* a public catalogue never vouches for the key: once per start too */
  const publicCounter={calls:0};
  const again=()=>createTuiCatalogService(deps({answer:PUBLIC_CATALOGUE,counter:publicCounter,providerStateFile:file}));
  const one=again();await one.refreshProviderState!('deepinfra');await one.refreshProviderState!('deepinfra');
  assert.equal(publicCounter.calls,1);
  await again().refreshProviderState!('deepinfra');
  assert.equal(publicCounter.calls,2);
});

test('C4: under 100 columns the first row shows the provider only for «not verified»',()=>{
  const checking=rowText(footerModeRow(footer({id:'ollama',state:'unverified',fresh:false,verified:null,checking:true},80,'ollama:x')));
  assert.equal(checking.includes('checking'),false,`«checking…» needs nobody's attention:\n${checking}`);
  assert.equal(checking.includes('? keys'),true);
  const unverified=rowText(footerModeRow(footer({id:'ollama',state:'unverified',fresh:false,verified:null},80,'ollama:x')));
  assert.match(unverified,/ollama: not verified/u,'«not verified» keeps the place the mockup gives it (C1R)');
  const verified=rowText(footerModeRow(footer({id:'ollama',state:'available',fresh:true,verified:null},80,'ollama:x')));
  assert.equal(verified.includes('ollama'),false);assert.equal(verified.includes('? keys'),true);
  /* from 100 columns the second row keeps all three states */
  assert.match(rowText(footerModelRow(footer({id:'ollama',state:'unverified',fresh:false,verified:null,checking:true},120,'ollama:x'))),/ollama: checking…/u);
});

/* «C5» stood here on a fake control plane that honoured the signal and stated no verdict: green while the real composition did
   neither (second review, 13/10/2026, B1 and N3). It is measured through the real composition and the fake OpenAI now:
   test/runtime/review-062b-plan-check-composition.test.ts (the budget, the late answer, the screen told) and
   test/runtime/review-062b-chatgpt-check-not-stopped.test.ts (the request ends with the screen). */

/* Found while curing C2 (13/10/2026): a write made before the file was ever read (a `talos provider test`, a sign-out, and now a
   key change, in a process that never drew the status row) wrote back only its own provider and dropped every other entry. */
test('C2: a write made before the snapshot was read keeps the other providers\' entries',async t=>{
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};
  writeProviderStateSnapshot({file,now:Date.now(),providers:{ollama:{state:'available',verified:null,checkedAt:Date.now(),latencyMs:3}}});
  const catalog=createTuiCatalogService(deps({answer:ACCEPTED,counter,providerStateFile:file}));
  await catalog.probeProvider('openrouter');
  const kept=readProviderStateSnapshot({file}).providers;
  assert.equal(kept.openrouter?.state,'available');
  assert.equal(kept.ollama?.state,'available','the entry of a provider this process never asked about is still there');
});

/* Gate red of 13/10/2026 (s52: the screen was gone and the process stayed; acceptance s64 is the measure on the built CLI). The
   check's request had no signal: the budget stopped waiting for it and nothing stopped it. */
test('EXIT: `stopProviderChecks` ends the check in flight, and what the probe makes of its own abort is not written',async t=>{
  const file=join(tempFolder(t),'provider-state.json');
  const signals:AbortSignal[]=[];
  const base=deps({answer:ACCEPTED,counter:{calls:0},providerStateFile:file,providerStateBudgetMs:60});
  const catalog=createTuiCatalogService({...base,createProbe:(signal?:AbortSignal)=>({
    /* the kernel probe's own way: a request that ends when its signal does, answered as «unreachable» */
    prova:(id:string)=>new Promise(resolve=>{signals.push(signal!);signal!.addEventListener('abort',()=>resolve({provider:id,esito:'irraggiungibile'}));}),
    elencaModelli:async()=>[]})});
  assert.equal((await catalog.refreshProviderState!('openrouter')).state,'unverified','the budget ends the wait');
  assert.equal(signals.length,1);assert.equal(signals[0]!.aborted,false,'the request is still out there (it may land late and be written)');
  catalog.stopProviderChecks!();
  assert.equal(signals[0]!.aborted,true,'the screen left: the request is ended, nothing keeps the process');
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(catalog.providerState!('openrouter').checkedAt,null,'and «unreachable», which is only the abort, is not remembered');
  assert.equal(readProviderStateSnapshot({file}).missing,true);
  /* the sign-in provider's half stood here on a fake control plane: see the note above «C2: a write made before…» */
});

/* Found while curing B1 (13/10/2026): OpenRouter's model list is public too (catalog-service.ts `AUTHENTICATED_KEY_CHECK`, measured
   17/09/2026: «the kernel probe answers "connected" for any key»), but the kernel registry does not mark it so, and its probe
   answers `credenzialeVerificata:true` for a key OpenRouter would refuse. The check asks what the key test asks: the endpoint that
   needs the key (`/models/user`; a GET, no tokens). */
test('C1: OpenRouter is checked on the endpoint that needs the key, not on its public list',async t=>{
  const file=join(tempFolder(t),'provider-state.json');const counter={calls:0};
  let status=401;const asked:Array<{url:string;authorization:string|null;signal:boolean}>=[];let key:string|null='sk-test-not-a-real-key';
  const fetchImpl=async(url:string,init:RequestInit)=>{asked.push({url,authorization:new Headers(init.headers).get('authorization'),signal:init.signal instanceof AbortSignal});return new Response('{}',{status});};
  const make=()=>createTuiCatalogService(deps({answer:ACCEPTED,counter,providerStateFile:file,fetchImpl,keyFor:()=>key}));
  /* the public list says «connected» whatever the key (the kernel probe's answer here); OpenRouter refuses the key */
  const refused=await make().refreshProviderState!('openrouter');
  assert.equal(counter.calls,0,'the public list is not what is asked');
  assert.deepEqual([asked.length,asked[0]?.url,asked[0]?.signal],[1,'https://provider.example/v1/models/user',true]);
  assert.match(asked[0]!.authorization??'',/^Bearer /u);
  assert.deepEqual([refused.state,refused.verified],['unavailable',false],'a refused key is not «verified»');
  /* accepted */
  status=200;
  assert.deepEqual((({state,verified})=>[state,verified])(await make().refreshProviderState!('openrouter')),['available',true]);
  /* no key: nothing is sent, and it is «not verified» */
  key=null;const before=asked.length;
  writeProviderStateSnapshot({file,now:Date.now(),providers:{}});
  assert.equal((await make().refreshProviderState!('openrouter')).state,'unverified');
  assert.equal(asked.length,before,'no key, no request');
  /* a test by hand (`/provider`, `talos provider test`) reads the public list: it does not overwrite what the key check knows */
  key='sk-test-not-a-real-key';status=401;
  const catalog=make();await catalog.refreshProviderState!('openrouter');
  await catalog.probeProvider('openrouter');
  assert.equal(catalog.providerState!('openrouter').state,'unavailable','the public list answering did not make the refused key «verified»');
  assert.ok(!JSON.stringify(readProviderStateSnapshot({file})).includes('sk-test'),'no key material in the snapshot');
});

/* FE-048 (owner 31/10): `ctx` always on the single row, and it drops last, with every optional field on */
test('under 100 columns the context stays on the row at every width, whatever else the row has to say',()=>{
  const base={...footer({id:'deepinfra',state:'available' as const,fresh:true,verified:false},40,'deepinfra:m'),snapshot:{windowTokens:1000,percent:42,inputTokens:1,outputTokens:1} as any};
  for(let width=40;width<100;width+=1)for(const noSandbox of [false,true])for(const mode of ['default','bypassPermissions'] as const)for(const queueCount of [0,3]){
    const row=rowText(footerModeRow({...base,width,noSandbox,mode,queueCount,remote:{phones:['Pad'],elsewhere:null,administrator:true}} as any));
    assert.match(row,/ctx 42%/u,`${width} ${noSandbox} ${mode}: ${row}`);
  }
  assert.match(rowText(footerModeRow({...base,width:40,snapshot:null} as any)),/ctx \?/u,'unknown is said, never left out');
  assert.equal(footerModelRow({...base,width:120} as any)?.filter(segment=>/ctx/u.test(segment.text)).length,1,'from 100 columns it stays on the second row, once');
  assert.equal(rowText(footerModeRow({...base,width:120} as any)).includes('ctx'),false);
});

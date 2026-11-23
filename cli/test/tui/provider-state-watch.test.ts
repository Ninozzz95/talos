/*
 * Owner decision 14/10/2026: «the open screen updates by itself within a few seconds». A key removed by ANOTHER process (a second
 * terminal's `talos provider remove-key kimi`, another screen's /provider sheet) resets the provider's entry in `provider-state.json`
 * (catalog-service.ts `credentialChanged`) — and the open screen kept «kimi: verified» until something happened there: it read the
 * file once, and re-read it only when it wrote or checked (bugfixer's finding, 14/10/2026).
 *
 * The open screen now watches the snapshot (a stat of the file every `providerStateWatchMs`, unref'd) while somebody listens:
 *   W1  a change written by another process is adopted and the listener is told, with the cause `file` — no check is made;
 *   W2  a write of this process, or a file that did not change, tells nobody (no notification loop);
 *   W3  the last listener that leaves, and `stopProviderChecks`, stop the watch;
 *   W4  the watch never holds the process at exit;
 *   W5  on the screen, a `file` notification re-reads the row and checks nothing (a key change of THIS process still re-checks).
 * Mocks only: fake probes, temp folders, no key is real, no network.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {readProviderStateSnapshot,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';
import {hermeticProfile,mountApp,sleep} from './r1-layout-fixture.ts';

const REGISTRY={
  kimi:{id:'kimi',destinazioneChat:true,etichetta:'Kimi',chiaveObbligatoria:true,baseUrl:'https://kimi.example/v1'},
  openai:{id:'openai',destinazioneChat:true,etichetta:'OpenAI',chiaveObbligatoria:true,baseUrl:'https://openai.example/v1'},
};
const ACCEPTED=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:12});
const WATCH_MS=40;
function catalogOn(file:string,counter:{calls:number},watchMs:number|undefined=WATCH_MS){
  return createTuiCatalogService({
    publicProviders:()=>[],registry:REGISTRY,
    runtimeFor:()=>({endpoint:'https://provider.example/v1',timeoutSeconds:5}),
    /* the key this process loaded at its start stays in its memory (the store reads the keyring once) */
    keyFor:()=>'sk-test-not-a-real-key',setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async(id:string)=>{counter.calls+=1;return ACCEPTED(id);},elencaModelli:async()=>[]}),
    persistModel:async()=>{},providerStateFile:file,
    ...(watchMs!==undefined?{providerStateWatchMs:watchMs}:{}),
  } as unknown as TuiCatalogDeps);
}
function folder(t:import('node:test').TestContext){
  const root=mkdtempSync(join(tmpdir(),'talos-state-watch-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  return join(root,'provider-state.json');
}
const verifiedNow=()=>{const at=Date.now()-60_000;return{state:'available' as const,verified:true,checkedAt:at,latencyMs:20};};
async function until(what:string,check:()=>boolean,timeoutMs=3_000){
  const started=Date.now();
  while(!check()){if(Date.now()-started>timeoutMs)assert.fail(`${what}: not within ${timeoutMs} ms`);await sleep(20);}
}

test('W1: a key removed by another process — the open screen is told within a few seconds, reads «not verified», and checks nothing',async t=>{
  const file=folder(t);const counter={calls:0};
  writeProviderStateSnapshot({file,now:Date.now()-60_000,providers:{kimi:verifiedNow()}});
  const screen=catalogOn(file,counter);
  assert.equal(screen.providerState!('kimi')!.state,'available','the premise: the open screen reads «verified»');
  const told:Array<[string,unknown]>=[];const off=screen.onProviderStateChanged!((id:string,cause?:unknown)=>{told.push([id,cause]);});
  t.after(off);
  /* the other process: `talos provider remove-key kimi` */
  await catalogOn(file,{calls:0},undefined).clearProviderKey('kimi');
  assert.equal(readProviderStateSnapshot({file}).providers.kimi?.state,'unverified','the premise: the removal reset the entry on disk');
  await until('the open screen was told',()=>told.length>0);
  assert.deepEqual(told,[['kimi','file']]);
  const report=screen.providerState!('kimi')!;
  assert.deepEqual([report.state,report.verified],['unverified',null],'the row reads what the other process left');
  assert.equal(counter.calls,0,'nothing was checked: the file says what is known');
});

test('W2: a write of this process, or a file that did not change, tells nobody',async t=>{
  const file=folder(t);const counter={calls:0};
  const screen=catalogOn(file,counter);
  const told:string[]=[];const off=screen.onProviderStateChanged!((id:string,cause?:unknown)=>{if(cause==='file')told.push(id);});
  t.after(off);
  await screen.refreshProviderState!('openai');
  assert.equal(counter.calls,1,'the premise: the screen checked, and wrote');
  assert.equal(readProviderStateSnapshot({file}).providers.openai?.state,'available');
  await sleep(WATCH_MS*8);
  assert.deepEqual(told,[],'its own write came back as a change from another process');
  /* the same content rewritten by someone else (a new savedAt): nothing changed for any provider */
  const same=readProviderStateSnapshot({file}).providers;
  writeProviderStateSnapshot({file,now:Date.now(),providers:same});
  await sleep(WATCH_MS*8);
  assert.deepEqual(told,[],'a file rewritten with the same entries is not a change');
});

test('W3: the last listener that leaves, and stopProviderChecks, stop the watch',async t=>{
  const file=folder(t);
  writeProviderStateSnapshot({file,now:Date.now()-60_000,providers:{kimi:verifiedNow()}});
  const screen=catalogOn(file,{calls:0});screen.providerState!('kimi');
  const told:string[]=[];
  const off=screen.onProviderStateChanged!((id:string)=>{told.push(id);});
  off();
  await catalogOn(file,{calls:0},undefined).clearProviderKey('kimi');
  await sleep(WATCH_MS*8);
  assert.deepEqual(told,[],'a listener that left is told nothing');
  /* listening again, then the screen leaves */
  const again=catalogOn(file,{calls:0});again.providerState!('kimi');
  const toldAgain:string[]=[];again.onProviderStateChanged!((id:string)=>{toldAgain.push(id);});
  again.stopProviderChecks!();
  writeProviderStateSnapshot({file,now:Date.now(),providers:{kimi:{state:'available',verified:true,checkedAt:Date.now(),latencyMs:1}}});
  await sleep(WATCH_MS*8);
  assert.deepEqual(toldAgain,[],'after stopProviderChecks the file is no longer watched');
});

test('W4: the watch never holds the process at exit',{timeout:30_000},async t=>{
  const file=folder(t);
  const script=join(resolve(file,'..'),'child.mjs');
  const service=pathToFileURL(resolve('src/tui/catalog-service.ts')).href;
  writeFileSync(script,[
    `import {createTuiCatalogService} from ${JSON.stringify(service)};`,
    `const catalog=createTuiCatalogService({publicProviders:()=>[],registry:{},runtimeFor:()=>({}),keyFor:()=>null,setKey:()=>{},clearKey:()=>{},`,
    `  createProbe:()=>({prova:async()=>null,elencaModelli:async()=>[]}),persistModel:async()=>{},providerStateFile:${JSON.stringify(file)},providerStateWatchMs:50});`,
    `catalog.onProviderStateChanged(()=>{});`,
    `process.stdout.write('listening\\n');`,
  ].join('\n'));
  const child=spawn(process.execPath,['--experimental-strip-types','--no-warnings',script],{stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',chunk=>{out+=chunk;});let err='';child.stderr.on('data',chunk=>{err+=chunk;});
  const started=Date.now();
  const code=await new Promise<number|null>(done=>{
    const timer=setTimeout(()=>{child.kill();done(null);},15_000);
    child.on('exit',exitCode=>{clearTimeout(timer);done(exitCode);});
  });
  assert.equal(out.trim(),'listening',`the premise: the child listened (${err})`);
  assert.equal(code,0,`the process stayed alive ${Date.now()-started} ms with nothing to do but the watch`);
});

const providerRow=(id:string)=>({id,label:id,description:'',configured:true,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'cloud',keySource:'saved',environmentVariable:null,benched:null});
const modelRow=(id:string)=>({id,provider:id.split(':')[0],name:id.split(':')[1],reasoning:false});
test('W5: on the screen, a change read from the file re-reads the row and checks nothing; a key change of this process still checks',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-state-watch-app-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  let verified=true;let refreshed=0;const listeners=new Set<(id:string,cause?:'file')=>void>();
  const report=(id:string)=>({id,state:verified?'available' as const:'unverified' as const,verified:verified?true:null,checkedAt:Date.now(),ageMs:1,fresh:true});
  const catalog={
    chosenProvider:async()=>'openai',chooseProvider:async()=>{},
    listProviders:async()=>[providerRow('openai')],listModels:async()=>[modelRow('openai:gpt-5-mini')],
    providerModels:async()=>({provider:'openai',label:'OpenAI',rows:[modelRow('openai:gpt-5-mini')],verified:true,notice:'',listing:'live'}),
    readiness:async()=>({ready:true}),selectModel:async()=>{},keyTestNotice:()=>null,
    probeProvider:async(id:string)=>({provider:id,state:'available',detail:'',latencyMs:1,remediation:null,readinessCode:null}),
    providerState:report,refreshProviderState:async(id:string)=>{refreshed+=1;return report(id);},
    onProviderStateChanged:(listener:(id:string,cause?:'file')=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  };
  const paths={dataRoot:join(root,'data'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),stateRoot:join(root,'state')};
  const app=await mountApp({cols:100,rows:30,root,paths,catalog,configuredModel:'openai:gpt-5-mini',providerCheckingShownMs:60_000});
  try{
    await app.waitFor('the verified row',s=>/openai: verified/u.test(s.text));
    assert.equal(refreshed,1);
    verified=false;for(const listener of listeners)listener('openai','file');
    const after=await app.waitFor('the row to follow the file',s=>/openai: not verified/u.test(s.text));
    assert.doesNotMatch(after.text,/openai: verified/u);
    await sleep(150);
    assert.equal(refreshed,1,'a change another process wrote is read, not checked again');
    for(const listener of listeners)listener('openai');
    await until('a key change of this process checks again',()=>refreshed===2);
  }finally{app.unmount();}
});

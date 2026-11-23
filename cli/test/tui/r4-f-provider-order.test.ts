/*
 * R4 lane F — the provider list puts what can be used now first (owner decision Q-R4-11): local engines that need no key and
 * are running, then providers with a usable key, then local engines not known to run, then the others; alphabetical inside
 * each group; typing narrows as before, so "ollama" highlights Ollama Local. The chosen provider is marked, and a local
 * engine says whether it is running. Only local engines are checked when the list opens (Codex lists local servers as
 * Running / Not running); no provider on the network is contacted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createProviderPickerModel,providerPickerItems,providerPickerOverlay} from '../../src/tui/overlays/provider-picker.ts';

const row=(id:string,label:string,{local=false,requiresKey=!local,configured=!requiresKey}:{local?:boolean;requiresKey?:boolean;configured?:boolean}={})=>({
  id,label,description:'',configured,requiresKey,authType:requiresKey?'bearer':'none',local,cloud:!local,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'',
  keySource:requiresKey?(configured?'saved':'missing'):'not-required',environmentVariable:null,benched:null,
}) as any;
const ROWS=[
  row('ollama-cloud','Ollama Cloud'),
  row('anthropic','Anthropic'),
  row('lmstudio','LM Studio',{local:true}),
  row('openai','OpenAI',{configured:true}),
  row('ollama','Ollama Local',{local:true}),
];
const running:Record<string,boolean>={ollama:true,lmstudio:false};

test('Q-R4-11: usable now first — a running local engine, then a saved key, then an engine not running, then the rest',()=>{
  assert.deepEqual(providerPickerItems(ROWS,'',{reachable:id=>running[id]??null}).map(r=>r.id),['ollama','openai','lmstudio','anthropic','ollama-cloud']);
  assert.deepEqual(providerPickerItems(ROWS,'',{}).map(r=>r.id),['openai','lmstudio','ollama','anthropic','ollama-cloud'],'not checked yet: local engines after a saved key, before the rest');
});

test('Q-R4-11: typing "ollama" highlights Ollama Local, running or not yet checked',()=>{
  assert.equal(providerPickerItems(ROWS,'ollama',{reachable:id=>running[id]??null})[0]!.id,'ollama');
  assert.equal(providerPickerItems(ROWS,'ollama',{})[0]!.id,'ollama');
});

test('Q-R4-11: opening the list checks only the local engines that need no key; the rows keep the catalog\'s order',async()=>{
  const probed:string[]=[];
  const catalog:any={
    listProviders:async()=>ROWS,
    probeProvider:async(id:string,signal?:AbortSignal)=>{probed.push(id);assert.ok(signal,'the check can be cut short');return{provider:id,state:running[id]?'available':'unavailable',detail:'',latencyMs:1,remediation:null,readinessCode:null};},
  };
  const model=createProviderPickerModel(catalog);await model.open();
  assert.deepEqual(probed.sort(),['lmstudio','ollama']);
  assert.deepEqual(model.rows().map(r=>r.id),ROWS.map((r:any)=>r.id));
  assert.equal(model.probeState('ollama')?.state,'available');assert.equal(model.probeState('lmstudio')?.state,'unavailable');
  assert.equal(model.reachable('ollama'),true);assert.equal(model.reachable('lmstudio'),false);assert.equal(model.reachable('openai'),null);
});

test('Q-R4-11: a local engine that does not answer in time is "not checked", and the list still opens',{timeout:5000},async()=>{
  const catalog:any={
    listProviders:async()=>ROWS,
    /* One engine honours the cut-off, the other never answers and ignores it: the list opens anyway. */
    probeProvider:(id:string,signal?:AbortSignal)=>id==='ollama'
      ?new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}))
      :new Promise(()=>{}),
  };
  const started=Date.now();const model=createProviderPickerModel(catalog);await model.open();
  assert.ok(Date.now()-started<2000,`the list waited ${Date.now()-started} ms`);
  assert.equal(model.rows().length,ROWS.length);assert.equal(model.reachable('ollama'),null);assert.equal(model.reachable('lmstudio'),null);
});

test('Q-R4-11: a local engine not checked comes before one that did not answer',()=>{
  const rows=[row('lmstudio','LM Studio',{local:true}),row('local','Local engine',{local:true}),row('openai','OpenAI',{configured:true})];
  assert.deepEqual(providerPickerItems(rows,'',{reachable:id=>id==='lmstudio'?false:null}).map(r=>r.id),['openai','local','lmstudio']);
});

test('Q-R4-11: the chosen provider is marked and each local engine says whether it is running',()=>{
  const view=providerPickerOverlay({query:'',rows:providerPickerItems(ROWS,'',{reachable:id=>running[id]??null}),selected:0,chosen:'openai',reachable:id=>running[id]??null});
  const lines=view.sections[0]!.lines.map(line=>line.text);
  assert.match(lines.find(line=>line.includes('OpenAI'))!,/OpenAI · chosen · /u);
  assert.match(lines.find(line=>line.includes('Ollama Local'))!,/ · local · running/u);
  assert.match(lines.find(line=>line.includes('LM Studio'))!,/ · local · not running/u);
  assert.doesNotMatch(lines.find(line=>line.includes('Anthropic'))!,/chosen|running/u);
});

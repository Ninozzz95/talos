/*
 * 08/10/2026 (owner: «impossibile che su Anthropic 5.x non si possa aggiustare il ragionamento»): the rows TALOS already knows at start (no network: the
 * person's configured models plus the documented fallback) say nothing about Claude 5.x's levels, so a configured effort was dropped with
 * REASONING_EFFORT_UNSUPPORTED even though the provider's LIVE list declares all five (`capabilities.effort`). The TUI already asks the live list for
 * `/effort` and `/model` when the known row lacks levels (app.ts `modelMetaWithLevels`, owner 25/09); the startup check did not. It now does, and only when
 * the known row does not already affirm the configured effort: no network for a model TALOS knows.
 */
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../src/main.ts';
import {writeConfigScope} from '../../src/config/load.ts';
import {resolveCliPaths} from '../../src/paths.ts';

async function workspace(t:any){
  const root=await mkdtemp(join(tmpdir(),'talos-main-live-levels-'));
  const previous={XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME,XDG_STATE_HOME:process.env.XDG_STATE_HOME,XDG_CACHE_HOME:process.env.XDG_CACHE_HOME,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA};
  process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  process.env.APPDATA=join(root,'appdata');process.env.LOCALAPPDATA=join(root,'localappdata');
  t.after(()=>{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
  const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  return{root,io};
}
const MODEL='anthropic:claude-haiku-5-5';
const LIVE_ROW={id:MODEL,reasoning:true,reasoningEfforts:['low','medium','high','xhigh','max']};

async function startup(t:any,catalog:any,effort='high'){
  const {root,io}=await workspace(t);
  await writeConfigScope({paths:resolveCliPaths(process.env,process.platform,homedir()),projectRoot:root,scope:'user',patch:{reasoningEffort:effort} as any});
  const applied:unknown[]=[];
  const runtime:any={close:async()=>{},setDefaultReasoningEffort:(value:unknown)=>applied.push(value)};
  let seen:any=null;
  const code=await main(['--project',root,'--model',MODEL],{io,createRuntimeContext:async()=>({runtime,tuiCatalog:catalog}),runTui:async(props:any)=>{seen=await props.startup;}} as any);
  assert.equal(code,0,io.stderr);
  return{seen,applied};
}

test('LIVE-LEVELS-1: a known row without levels is completed by the provider’s live list, and the configured effort is applied',async t=>{
  let liveAsked=0;
  const catalog:any={listModels:async()=>[{id:MODEL}],providerModels:async()=>{liveAsked+=1;return{rows:[LIVE_ROW]};}};
  const {seen,applied}=await startup(t,catalog,'max');
  assert.equal(seen.reasoningEffort,'max');
  assert.deepEqual(seen.notices,[]);
  assert.deepEqual(applied,['max']);
  assert.equal(liveAsked,1);
});

test('LIVE-LEVELS-2: AL CONTRARIO — a row that already affirms the effort never goes to the network',async t=>{
  let liveAsked=0;
  const catalog:any={listModels:async()=>[LIVE_ROW],providerModels:async()=>{liveAsked+=1;return{rows:[]};}};
  const {seen}=await startup(t,catalog,'high');
  assert.equal(seen.reasoningEffort,'high');
  assert.equal(liveAsked,0,'a model TALOS already knows costs no round trip at start');
});

test('LIVE-LEVELS-3: AL CONTRARIO — a live list that does not offer the level, or cannot be read, leaves the effort unapplied with the same notice as before',async t=>{
  const noLevel:any={listModels:async()=>[{id:MODEL}],providerModels:async()=>({rows:[{...LIVE_ROW,reasoningEfforts:['low','medium']}]})};
  const a=await startup(t,noLevel,'high');
  assert.equal(a.seen.reasoningEffort,null);
  assert.deepEqual(a.seen.notices.map((n:any)=>n.code),['REASONING_EFFORT_UNSUPPORTED']);
  assert.deepEqual(a.applied,[null]);
  const down:any={listModels:async()=>[{id:MODEL}],providerModels:async()=>{throw Object.assign(new Error('CATALOG_UNREACHABLE'),{code:'CATALOG_UNREACHABLE'});}};
  const b=await startup(t,down,'high');
  assert.equal(b.seen.reasoningEffort,null);
  assert.deepEqual(b.seen.notices.map((n:any)=>n.code),['REASONING_EFFORT_UNSUPPORTED']);
});

test('LIVE-LEVELS-4: AL CONTRARIO — a catalog with no live list behaves as before, and no effort configured asks nothing',async t=>{
  const plain:any={listModels:async()=>[{id:MODEL}]};
  const a=await startup(t,plain,'high');
  assert.deepEqual(a.seen.notices.map((n:any)=>n.code),['REASONING_EFFORT_UNSUPPORTED']);
  let asked=0;
  const {root,io}=await workspace(t);
  const runtime:any={close:async()=>{},setDefaultReasoningEffort:()=>{}};
  const catalog:any={listModels:async()=>{asked+=1;return[];},providerModels:async()=>{asked+=1;return{rows:[]};}};
  let seen:any=null;
  const code=await main(['--project',root,'--model',MODEL],{io,createRuntimeContext:async()=>({runtime,tuiCatalog:catalog}),runTui:async(props:any)=>{seen=await props.startup;}} as any);
  assert.equal(code,0,io.stderr);
  assert.equal(seen.reasoningEffort,null);
  assert.equal(asked,0,'no effort configured: the catalog is not even read');
});

test('LIVE-LEVELS-5: AL CONTRARIO — a model id with no provider part never asks a provider’s live list',async t=>{
  const {root,io}=await workspace(t);
  await writeConfigScope({paths:resolveCliPaths(process.env,process.platform,homedir()),projectRoot:root,scope:'user',patch:{reasoningEffort:'high'} as any});
  let asked=0;
  const runtime:any={close:async()=>{},setDefaultReasoningEffort:()=>{}};
  const catalog:any={listModels:async()=>[],providerModels:async()=>{asked+=1;return{rows:[LIVE_ROW]};}};
  let seen:any=null;
  const code=await main(['--project',root,'--model','bare-model-id'],{io,createRuntimeContext:async()=>({runtime,tuiCatalog:catalog}),runTui:async(props:any)=>{seen=await props.startup;}} as any);
  assert.equal(code,0,io.stderr);
  assert.equal(seen.reasoningEffort,null);
  assert.equal(asked,0);
});

test('LIVE-LEVELS-6: a live list that never answers is cut at the start deadline — the start goes on with the notice of before, it does not hang',{timeout:30_000},async t=>{
  let given:AbortSignal|undefined;
  const hanging:any={listModels:async()=>[{id:MODEL}],providerModels:(_provider:string,signal?:AbortSignal)=>new Promise((_resolve,reject)=>{
    given=signal;
    signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  })};
  const began=Date.now();
  const {seen}=await startup(t,hanging,'high');
  assert.ok(given instanceof AbortSignal,'the live-list request carries a deadline');
  assert.equal(given!.aborted,true,'the deadline fired');
  assert.ok(Date.now()-began<20_000,'the start did not wait the catalog service’s 30 s');
  assert.equal(seen.reasoningEffort,null);
  assert.deepEqual(seen.notices.map((n:any)=>n.code),['REASONING_EFFORT_UNSUPPORTED']);
});

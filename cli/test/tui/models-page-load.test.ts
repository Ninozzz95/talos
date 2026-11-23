/*
 * Suite 01/11 (s61, s70): reading the device for the Models page's System tab starts the kernel, over 10 s the first time, and the
 * providers waited for it; what was typed meanwhile was lost. Owner 01/11: what may be heavy opens at once and says it is loading.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermetic,KEYS,mountTui,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {providerSheet,systemTabBody} from '../../src/tui/panel/commands.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');

test('the System tab says it is reading the device, then shows it',()=>{
  const reading=providerSheet([],{system:'loading'});
  assert.match(all(pageRows(asPage({...reading,panel:{...reading.panel,tab:1}}).panel,100,20)),/Reading the device…/u);
  const read=providerSheet([],{system:{memory:{totalBytes:16*1024**3,freeBytes:8*1024**3},storage:{totalBytes:512*1024**3,availableBytes:100*1024**3}}});
  assert.doesNotMatch(all(pageRows(asPage({...read,panel:{...read.panel,tab:1}}).panel,100,20)),/Reading the device/u);
  assert.equal(reading.context?.ticking,true,'the screen redraws it while it reads');assert.equal(read.context?.ticking,undefined);
  /* Frontend 01/11: the row turns and counts its seconds; past 10 s it says the engine is starting */
  const body=systemTabBody('loading',undefined,{since:0});if(body.kind!=='info')throw new Error('info');
  const at=(now:number)=>all(body.lines(100,20,now));
  assert.match(at(3_000),/Reading the device… · 3s/u);
  assert.match(at(12_000),/Starting the engine… · 12s/u);
});

test('/model: while the models are read, the page says so at once, with its seconds',async()=>hermetic(async h=>{
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
  /* s04: a provider is chosen and its models take long (the kernel starting the first time) */
  context.tuiCatalog.chosenProvider=async()=>'openai';context.tuiCatalog.listModels=()=>new Promise(()=>{});
  const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:120,rows:40});
  try{
    await tui.typeAndEnter('/model');
    await tui.until(f=>/── (Model|Models) /u.test(f)&&/Loading/u.test(f),'the loading page of /model',3000);
  }finally{tui.unmount();await context.runtime.close?.().catch(()=>{});}
}));

test('a search typed while the providers are still loading reaches the page that comes',async()=>hermetic(async h=>{
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
  const list=context.tuiCatalog.listProviders.bind(context.tuiCatalog);let slow=false;
  context.tuiCatalog.listProviders=async(...args:any[])=>{if(slow)await new Promise(resolve=>setTimeout(resolve,1500));return list(...args);};
  const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:120,rows:40});
  try{
    slow=true;await tui.typeAndEnter('/provider');
    await tui.until(f=>/Loading providers/u.test(f)&&f.includes('── Models'),'the loading page, titled as the page that comes',3000);
    tui.write('/zai');
    await tui.until(f=>f.includes('/ zai')&&f.includes(' of ')&&f.includes('Z.AI'),'the search typed meanwhile, on the page',8000);
  }finally{tui.unmount();await context.runtime.close?.().catch(()=>{});}
}));

test('/provider: the providers come at once while the device is still read, and a search typed at once is kept',async()=>hermetic(async h=>{
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
  let answer!:(value:unknown)=>void;context.runtime.machineCapacity=()=>new Promise(resolve=>{answer=resolve;});
  const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:120,rows:40});
  try{
    await tui.typeAndEnter('/provider');
    await tui.until(f=>f.includes('── Models')&&f.includes('Ollama'),'the providers, with the device not read yet',5000);
    tui.write('/zai');
    await tui.until(f=>f.includes('/ zai')&&f.includes(' of ')&&f.includes('Z.AI'),'the search kept',5000);
    tui.write(KEYS.enter);await tui.until(f=>f.includes('enter use'),'the search ended');
    tui.write('\t');await tui.until(f=>f.includes('Reading the device…'),'the System tab says it is reading',5000);
    answer({memory:{totalBytes:16*1024**3,freeBytes:8*1024**3},storage:{totalBytes:512*1024**3,availableBytes:100*1024**3}});
    await tui.until(f=>!f.includes('Reading the device…')&&/Memory/u.test(f),'the device read, in place',5000);
  }finally{tui.unmount();await context.runtime.close?.().catch(()=>{});}
}));

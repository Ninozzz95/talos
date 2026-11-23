/*
 * R5a lane R, S6 — owner decision Q-R5-10, gate E6: a cut command output is never silent. The full output goes to a private
 * file under the data root (never the project), redacted, deleted with its session; the model's marker is English and
 * names the file. Measured before (R5 research m3): `cmd /c type big.txt` (500 lines) → the model read `… [tolti N
 * caratteri dal mezzo] …` and nothing on screen said where the other 270 lines were.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createBrokeredKernelExecutor} from '../../src/runtime/brokered-executor.ts';
import {KERNEL_CUT_MARKER,createToolOutputStore,cutToolOutput,deleteSessionToolOutput,parseToolOutputMarker,pruneToolOutput,replaceKernelCutMarker} from '../../src/runtime/output-store.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {dummyKey,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';

const kernel:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs')).href);
const BIG=Array.from({length:500},(_,i)=>`output line ${String(i+1).padStart(3,'0')}`).join('\r\n');
const temp=()=>mkdtempSync(path.join(tmpdir(),'r5a-r-output-'));

test('the kernel\'s cut marker (English since G02) is the one this module replaces (pinned by running the kernel\'s own cut)',()=>{
  const cut=kernel.uscitaUtile(BIG,4_000,0.25);
  assert.match(cut,KERNEL_CUT_MARKER);
  assert.equal(Number(KERNEL_CUT_MARKER.exec(cut)!.groups!.removed),BIG.length-4000);
});

test('C4(b) of decision 245: the module\'s comment names the shortening marker the adapter writes today, not the old one',async()=>{
  const adapter:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','kernel','compattazione-desktop.mjs')).href);
  const own=readFileSync(path.join(REPO_ROOT,'cli','src','runtime','output-store.ts'),'utf8');
  assert.equal(typeof adapter.MARCATORE_ACCORCIATO,'string');
  assert.ok(own.includes(adapter.MARCATORE_ACCORCIATO),'the comment quotes the marker of compattazione-desktop.mjs `accorciaTesto`');
  assert.doesNotMatch(own,/omitted to fit the context window/u,'the old marker is gone from the comment (decision 245, point 2)');
});

test('the English cut keeps the kernel\'s head and tail and names the file; the screen reads the same numbers back',()=>{
  const text=cutToolOutput(BIG,{path:'C:\\data\\tool-output\\s1\\1-a.txt'});
  const kernelCut=kernel.uscitaUtile(BIG,4_000,0.25);
  assert.equal(text.slice(0,1000),kernelCut.slice(0,1000),'the same quarter from the head');
  assert.equal(text.slice(-3000),kernelCut.slice(-3000),'the same three quarters from the tail');
  assert.doesNotMatch(text,/tolti|caratteri/u);
  assert.deepEqual(parseToolOutputMarker(text),{removedChars:BIG.length-4000,keptChars:4000,totalChars:BIG.length,path:'C:\\data\\tool-output\\s1\\1-a.txt'});
  assert.deepEqual(parseToolOutputMarker(cutToolOutput(BIG,null)),{removedChars:BIG.length-4000,keptChars:4000,totalChars:BIG.length,path:null});
  assert.equal(cutToolOutput('short',null),'short');
  assert.equal(replaceKernelCutMarker(kernelCut,{path:'X:\\f.txt'}).replace(/… \[TALOS cut[^\]]*\] …/u,'M'),kernelCut.replace(KERNEL_CUT_MARKER,'\n\nM\n\n'));
});

test('the file is private, under the data root, redacted, and goes with its session',async()=>{
  const root=temp();
  try{
    const dataRoot=path.join(root,'data'),sessionsRoot=path.join(dataRoot,'sessions');mkdirSync(sessionsRoot,{recursive:true});
    const secret=dummyKey('openai');
    const store=createToolOutputStore({dataRoot,secretValues:[secret],now:()=>1727000000000,newId:()=>'abcdef12-0000'});
    const saved=await store.save({sessionId:'s-live',text:`${BIG}\nOPENAI_API_KEY=${secret}\nAuthorization: Bearer ${secret}\n`});
    assert.ok(saved);
    assert.equal(path.dirname(saved!.path),path.join(dataRoot,'tool-output','s-live'));
    const body=readFileSync(saved!.path,'utf8');
    assert.ok(body.startsWith('output line 001'));assert.ok(!body.includes(secret),'the key never reaches the file');
    if(process.platform!=='win32')assert.equal(statSync(saved!.path).mode&0o777,0o600);
    assert.equal(await store.save({sessionId:'../escape',text:'x'}),null,'a session id that is not an id keeps nothing');
    await store.save({sessionId:'s-gone',text:'gone'});
    writeFileSync(path.join(sessionsRoot,'s-live.jsonl'),'{}\n');
    assert.deepEqual(await pruneToolOutput({dataRoot,sessionsRoot}),['s-gone'],'only the folder of a session whose record is gone');
    assert.ok(existsSync(saved!.path));
    assert.equal(await deleteSessionToolOutput(dataRoot,'s-live'),true);
    assert.ok(!existsSync(path.join(dataRoot,'tool-output','s-live')));
    assert.deepEqual(readdirSync(path.join(dataRoot,'tool-output')),[]);
  }finally{rmSync(root,{recursive:true,force:true});}
});

function kernelHelpers(fallbackText:string,pieces:string[]){
  return async()=>({
    uscitaUtile:kernel.uscitaUtile,staccaCartellaFinale:kernel.staccaCartellaFinale,codaCheStampaLaCartella:kernel.codaCheStampaLaCartella,
    eseguiComandoSandboxato:async(_c:string,_d:string,options:any)=>{for(const piece of pieces)options.onPezzo?.({flusso:'fuori',testo:piece});return{codice:0,testo:fallbackText,enforcement:'none',cartellaFinale:null};},
  });
}

test('the executor, both paths: with a keeper the model reads the English marker and the file holds everything',async()=>{
  const kept:string[]=[];const keep=async(text:string)=>{kept.push(text);return{path:`C:\\data\\tool-output\\s1\\${kept.length}.txt`};};
  const pieces=[BIG.slice(0,5000),BIG.slice(5000)];const heard:string[]=[];
  const fallback=createBrokeredKernelExecutor({kernel:kernelHelpers(kernel.uscitaUtile(BIG,4_000,0.25),pieces),platform:'linux',keepFullOutput:keep});
  const viaKernel=await fallback('type big.txt','C:\\w',{onPezzo:piece=>heard.push(piece.testo)});
  assert.deepEqual(heard,pieces,'the caller still hears every piece');
  assert.equal(kept[0],BIG,'the file gets the whole streamed output');
  assert.deepEqual(parseToolOutputMarker(viaKernel.testo)?.path,'C:\\data\\tool-output\\s1\\1.txt');
  const broker={async execute(){return{exitCode:0,stdout:BIG,stderr:'',evidence:{requestedEnforcement:'restricted-process',appliedEnforcement:'windows-sandbox',backend:'mxc',appContainer:true,filesystem:'bfs',network:'deny',processTree:'job',sandboxSpecVersion:'1'}};}};
  const brokered=createBrokeredKernelExecutor({kernel:kernelHelpers('unused',[]),broker:broker as any,platform:'win32',keepFullOutput:keep});
  const viaBroker=await brokered('type big.txt','C:\\w',{});
  assert.equal(kept[1],BIG);
  assert.deepEqual(parseToolOutputMarker(viaBroker.testo),{removedChars:BIG.length-4000,keptChars:4000,totalChars:BIG.length,path:'C:\\data\\tool-output\\s1\\2.txt'});
  const withoutKeeper=createBrokeredKernelExecutor({kernel:kernelHelpers('unused',[]),broker:broker as any,platform:'win32'});
  assert.match((await withoutKeeper('type big.txt','C:\\w',{})).testo,KERNEL_CUT_MARKER,'no keeper: the kernel\'s cut, as before');
});

test('through the real composition: the person\'s own ! command is kept in ITS session\'s file too',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'big.txt'),`${BIG}\r\n`);
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'OK'})});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId}=await runTurn(context,h,'hello');
    const raw:any[]=[];const off=context.runtime.subscribe(sessionId,(event:any)=>raw.push(event),0);
    try{
      await context.runtime.shell(sessionId,'cmd /c type big.txt');
      const deadline=Date.now()+30_000;
      while(!raw.some(e=>e?.type==='ToolCallResult'&&String(e.content??'').includes('TALOS cut'))){if(Date.now()>deadline)throw new Error('no cut result');await new Promise(resolve=>setTimeout(resolve,20));}
    }finally{off();}
    const result=raw.find(e=>e?.type==='ToolCallResult'&&String(e.content??'').includes('TALOS cut'));
    const marker=parseToolOutputMarker(String(result.content));
    assert.equal(path.dirname(marker!.path!),path.join(h.paths.dataRoot,'tool-output',sessionId));
    assert.ok(readFileSync(marker!.path!,'utf8').includes('output line 250'));
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('through the real composition: the model\'s long command is kept in its session\'s file and the row gets the fact',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'big.txt'),`${BIG}\r\n`);
  const fake=await startScriptedProvider({goodKey:key,respond:request=>request.toolResults===0
    ?{kind:'tool',name:/^(shell|bash|run_command|esegui)$/iu,args:[{pattern:/^(command|comando|cmd)/iu,value:'cmd /c type big.txt'}]}
    :{kind:'text',text:'Done.'}});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'print the big file');
    const result=raw.find(e=>e?.type==='ToolCallResult');
    const marker=parseToolOutputMarker(String(result?.content??''));
    assert.ok(marker?.path,`the model read an English marker naming a file: ${String(result?.content??'').slice(0,300)}`);
    assert.equal(path.dirname(marker!.path!),path.join(h.paths.dataRoot,'tool-output',sessionId));
    assert.ok(!path.relative(h.project,marker!.path!).match(/^[^.]/u),'never under the project');
    const kept=readFileSync(marker!.path!,'utf8');
    assert.ok(kept.includes('output line 001')&&kept.includes('output line 250')&&kept.includes('output line 500'),'the whole output, the middle included');
    const sent=fake.requests[1]!.body.messages.find((m:any)=>m.role==='tool')?.content??'';
    assert.match(String(sent),/TALOS cut \d+ characters from the middle of this output/u,'the model itself read the English marker');
    assert.doesNotMatch(String(sent),/tolti/u);
    const adapter=createTuiEventAdapter();adapter.bindSession(sessionId);
    const saved=raw.flatMap(row=>adapter.translateAll(row)).find(e=>e.type==='tool.output.saved') as any;
    assert.equal(saved?.path,marker!.path);
  }finally{await context.runtime.close?.();await fake.close();}
}));

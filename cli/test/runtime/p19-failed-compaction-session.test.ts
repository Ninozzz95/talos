/*
 * P19 (owner 27/09, session cad61a7e on talos-code 0.3.0): the shape of the owner's session, through the real composition,
 * kernel and Context Engine on a fake on 127.0.0.1. A turn of reads grows past half of a 64k window, the engine asks for a
 * summary, the model's summary is not in the engine's form (CTX_INVALID_SUMMARY) and the turn fails; the NEXT turn on the
 * same session stopped with CTX_HISTORY_DIVERGED ("no longer matches its saved context"), and so did every turn after.
 * 0.6.13 (22/10/2026): since 80a0d077e the CLI runs the desktop adapter, and a Context Engine preparation that fails falls back
 * to the simple compaction (CHANGELOG 0.6.13): the first turn now COMPLETES, and the failure is said once as a raw
 * `talos.compattazione {fase:'fine', codice:'CTX_…'}` (the screen's warning). The next turn must still not meet a dead session.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {PASTED_LOG,ceSummaryFor,composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
const FILE=(k:number)=>Array.from({length:180},(_,i)=>`compact file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});
/* The engine's summary request has no tools. In the first turn the model answers in prose, not in the engine's summary
   form (the owner's CTX_INVALID_SUMMARY); once the session goes on, it answers in the form (as r5a-coord-ce-compaction). */
let firstTurn=true;
const respond=(request:ChatRequest)=>{
  if(!(request as any).tools?.length)return{kind:'text' as const,text:firstTurn?'Here is a short summary of the conversation so far.':ceSummaryFor(request)};
  const last=JSON.stringify((request as any).body?.messages?.slice(-1)??[]);
  if(/hello again/u.test(last))return{kind:'text' as const,text:'OK'};
  return request.toolResults<10?read(request.toolResults+1):{kind:'text' as const,text:'Done: read ten files.'};
};

test('P19: a turn whose Context Engine compaction fails completes on the simple compaction, says the code, and the next turn is answered',{timeout:300_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  for(let k=1;k<=10;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  const fake=await startScriptedProvider({goodKey:key,respond});
  const context=await composeWithFake(h,fake.url,key);
  try{
    /* r4 de8f33317 (C1): a turn of reads no longer grows past the limit (old tool outputs are cleared, with no model call); what still
       does is what the person wrote. The first turn is a pasted log larger than the input limit, so the engine must summarise inside the
       turn, and the summary it gets is not in its form. */
    const first=await runTurn(context,h,PASTED_LOG,{timeoutMs:240_000});
    const firstErrors=first.raw.filter(e=>e?.type==='RunError').map(e=>e.code);
    /* 0.6.13 (22/10/2026): the engine still gives up (the owner's CTX_INVALID_SUMMARY; here CTX_CONTEXT_OVERFLOW, both thrown by the
       compaction AFTER the history was archived), but the desktop adapter falls back to the simple compaction and the turn completes */
    assert.deepEqual(firstErrors,[],'the first turn completes on the simple compaction');
    assert.ok(first.raw.some(e=>e?.type==='RunFinished'),'the first turn finished');
    const fellBack=first.raw.filter(e=>e?.type==='CUSTOM'&&e.name==='talos.compattazione'&&e.value?.fase==='fine'&&typeof e.value?.codice==='string');
    assert.ok(fellBack.some(e=>/^CTX_(INVALID_SUMMARY|CONTEXT_OVERFLOW|COMPACTION_FAILED|EMPTY_SUMMARY)$/u.test(e.value.codice)),`the engine's failure is said with its code: ${JSON.stringify(fellBack.map(e=>e.value))}`);
    firstTurn=false;
    const second=await runTurn(context,h,'hello again',{sessionId:first.sessionId,timeoutMs:180_000});
    const secondErrors=second.raw.filter(e=>e?.type==='RunError').map(e=>e.code);
    assert.ok(!secondErrors.includes('CTX_HISTORY_DIVERGED'),`P19: the session stopped after the failed turn: ${JSON.stringify(secondErrors)}`);
    /* After a refused summary the engine waits 60 s before it compacts again ("cooling", as in the owner's session): until
       then a history this large may overflow (CTX_CONTEXT_OVERFLOW) — a real context state the person can act on, not the
       dead session of CTX_HISTORY_DIVERGED. What this test proves is only that: the archive and the history agree again. */
    assert.ok(secondErrors.every(code=>code==='CTX_CONTEXT_OVERFLOW'),`the next turn meets at most the real context state: ${JSON.stringify(secondErrors)}`);
  }finally{await context.runtime.close?.();await fake.close();}
}));

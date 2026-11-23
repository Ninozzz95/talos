/*
 * R5a (coordinator, found by the s22 acceptance run): with a 65,536 window the Context Engine compacted during a turn of ten
 * 9 KB reads (the model's reads stopped after c7 and the turn restarted from the summary), but the screen named no
 * compaction and the status row said no `cmp` (Q-R5-4, E9: "compaction is named when it happens"). This measures, through
 * the real composition, kernel and Context Engine on a fake on 127.0.0.1, what the runtime delivers and what the TUI
 * adapter makes of it.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {PASTED_LOG,PASTE_NOTE as NOTE,ceSummaryFor as summaryFor,composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
const FILE=(k:number)=>Array.from({length:180},(_,i)=>`compact file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});
/* The Context Engine's own summary request offers no tools: it gets a summary in the engine's format
   (context-engine contracts.mjs ContextSummaryV1), citing the person's message, whose record id the request names. */
/* G02: the scripted model remembers how many reads it asked for, as a real one does through the summary. Counting the tool
   results still in the request would restart from c1 after an in-turn compaction (they are summarised) and loop forever. */
const tenReads=()=>{let asked=0;return(request:ChatRequest)=>!(request as any).tools?.length?{kind:'text' as const,text:summaryFor(request)}:request.lastUser.startsWith(NOTE)?{kind:'text' as const,text:'Noted.'}:asked<10?read(++asked):{kind:'text' as const,text:'Done: read ten files.'};};
/* r4 de8f33317 (C1): ten reads alone no longer reach a summary; it comes from the log the person pasted in the first turn (PASTED_LOG, fixture) */

test('R5a: a Context Engine compaction during a turn reaches the screen as context.compacted',{timeout:300_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  for(let k=1;k<=10;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  const fake=await startScriptedProvider({goodKey:key,respond:tenReads()});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const first=await runTurn(context,h,PASTED_LOG,{timeoutMs:240_000});
    const {sessionId,raw}=await runTurn(context,h,'read the ten files',{timeoutMs:240_000,sessionId:first.sessionId});
    const custom=raw.filter(e=>e?.type==='CUSTOM').map(e=>`${e.name}:${e.value?.kind??''}`);
    const status=await context.runtime.contextStatus(sessionId);
    const adapter=createTuiEventAdapter([]);adapter.bindSession(sessionId);
    const tui=raw.flatMap(e=>adapter.translateAll(e));
    const summary=JSON.stringify({requests:fake.requests.length,custom,versions:status?.activeVersion??status?.version??null,errors:raw.filter(e=>e?.type==='RunError')});
    assert.ok(custom.includes('talos.context:context.version.committed'),`the runtime delivered no committed version: ${summary}`);
    assert.ok(tui.some(e=>e.type==='context.compacted'&&(e as any).engine==='context-engine'),`the adapter made no context.compacted: ${summary}`);
  }finally{await context.runtime.close?.();await fake.close();}
}));

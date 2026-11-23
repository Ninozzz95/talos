/*
 * R5b (R5a open 2), through the REAL composition, kernel and Context Engine on a fake on 127.0.0.1: the fake answers the
 * engine's summary requests with text that is not a summary, so no compaction is ever committed. Each summary request
 * now reaches the screen as `context.summary.requested` (the CLI's own callModel bridge counts it for the turn's session),
 * and the turn ends with the line that says how many were requested and that each is billed. Same scenario as
 * r5a-coord-ce-compaction.test.ts, with the summary refused.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';
import {PASTE_NOTE,pastedLog,composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
const FILE=(k:number)=>Array.from({length:180},(_,i)=>`compact file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});
/* The engine's summary request offers no tools: it gets prose instead of the engine's JSON, which the engine refuses. */
const refusingSummaries=(request:ChatRequest)=>!(request as any).tools?.length?{kind:'text' as const,text:'Sure, here is a summary in prose, not JSON.'}:request.lastUser.startsWith(PASTE_NOTE)?{kind:'text' as const,text:'Noted.'}:request.toolResults<10?read(request.toolResults+1):{kind:'text' as const,text:'Done: read ten files.'};

test('R5b: summaries the engine refuses reach the screen as requests, and the turn says how many were billed',{timeout:300_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  for(let k=1;k<=10;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:2,models:{'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  const fake=await startScriptedProvider({goodKey:key,respond:refusingSummaries});
  const context=await composeWithFake(h,fake.url,key);
  let restarted:any=null;
  try{
    /* r4 de8f33317 (C1): ten reads alone no longer reach a summary; the pressure is a log the person pasted two turns before. Measured
       13/10/2026 on this fixture: 15,153 tokens with nothing said, the trigger at 19,660, the input limit at 39,321, about 24.6 tokens a
       pasted line. 500 lines put the session over the trigger and under the limit, so the summary is wanted and, refused, the turn goes on;
       the engine keeps the last two turns whole, hence the short second turn. */
    const first=await runTurn(context,h,pastedLog(500),{timeoutMs:240_000});
    const second=await runTurn(context,h,`${PASTE_NOTE} that was all of it.`,{timeoutMs:240_000,sessionId:first.sessionId});
    const third=await runTurn(context,h,'read the ten files',{timeoutMs:240_000,sessionId:first.sessionId});
    const sessionId=third.sessionId;
    /* Measured 13/10/2026: the engine asks for the summary while the SECOND turn is still open (after its answer), and says the pause at
       the next request, in the third. The screen is the conversation, so the two turns are read together. */
    const raw=[...second.raw,...third.raw];
    const summaryCalls=fake.requests.filter((r:any)=>JSON.stringify(r.body?.messages??[]).includes('talos.context.summary.v1')).length;
    const requested=raw.filter(e=>e?.type==='CUSTOM'&&e?.name==='talos.cli.context.summary-requested').length;
    const committed=raw.some(e=>e?.type==='CUSTOM'&&e?.name==='talos.context'&&e?.value?.kind==='context.version.committed');
    const cooling=raw.filter(e=>e?.type==='CUSTOM'&&e?.name==='talos.context'&&e?.value?.kind==='context.compaction.cooling').map(e=>e.value);
    const facts=JSON.stringify({summaryCalls,requested,committed,requests:fake.requests.map((r:any)=>r.tools.length?'turn':'summary'),errors:raw.filter(e=>e?.type==='RunError').map((e:any)=>e.code),cooling});
    assert.ok(summaryCalls>=1,`the engine asked for no summary, so this scenario proves nothing: ${facts}`);
    /* Desktop fix 5f78b1316+4ceb232a5 (aligned 2026-09-25): after a refused summary the engine pauses automatic compaction
       (60 s, then 300, then 900) and says so once. Measured here: 5 requests in this turn before, 1 after. */
    /* r4 de8f33317 (C1, 19f7a5706): a summary in the wrong format is asked for ONCE more, with the instruction on the format, before the
       pause. So two requests, both shown and both billed; never a third. */
    assert.equal(summaryCalls,2,`a refused summary is retried once on its format, then the engine pauses: ${facts}`);
    assert.equal(cooling.length,1,`the pause was not said exactly once: ${facts}`);
    assert.equal(committed,false,`a refused summary was committed: ${facts}`);
    assert.equal(requested,summaryCalls,`every summary request the fake saw is counted once: ${facts}`);
    const adapter=createTuiEventAdapter([]);adapter.bindSession(sessionId);
    const events=raw.flatMap(e=>adapter.translateAll(e));
    assert.equal(events.filter(e=>e.type==='context.summary.requested').length,summaryCalls,facts);
    const model=events.reduce((m:any,e:any)=>reduceTranscriptEvent(m,e),createTranscriptModel());
    const line=model.items.find((item:any)=>item.kind==='warning'&&/context summary was requested/u.test(item.text));
    assert.ok(line,`the turn ended without the line: ${facts}`);
    assert.match(line.text,/requested 2 times/u);
    const paused=model.items.filter((item:any)=>item.kind==='warning'&&/Automatic compaction is paused/u.test(item.text));
    assert.equal(paused.length,1,`the pause is not one line on screen: ${facts}`);
    assert.match((paused[0] as any).text,/\(CTX_INVALID_SUMMARY\)/u);
    const status=await context.runtime.contextStatus(sessionId);
    assert.equal(status.compactionRecovery?.code,'CTX_INVALID_SUMMARY',facts);
    assert.equal(status.compactionRecovery?.actions.includes('/compact'),true,facts);
    assert.equal(status.compactionRecovery?.manualCost.usd,null,facts);
    assert.equal(fake.requests.filter((r:any)=>JSON.stringify(r.body?.messages??[]).includes('talos.context.summary.v1')).length,summaryCalls,'reading status must not request another summary');
    await context.runtime.close?.();
    restarted=await composeWithFake(h,fake.url,key);
    const persisted=await restarted.runtime.contextStatus(sessionId);
    assert.equal(persisted.compactionRecovery?.code,'CTX_INVALID_SUMMARY','cooldown must survive a new runtime over the same isolated profile');
    assert.equal(persisted.compactionRecovery?.retryAfter,status.compactionRecovery?.retryAfter);
    assert.equal(fake.requests.filter((r:any)=>JSON.stringify(r.body?.messages??[]).includes('talos.context.summary.v1')).length,summaryCalls,'restart/status must not pay for a second summary');
  }finally{await restarted?.runtime.close?.();await context.runtime.close?.();await fake.close();}
}));

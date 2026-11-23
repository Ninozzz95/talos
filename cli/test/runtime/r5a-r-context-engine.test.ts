/*
 * R5a lane R, S2 — turning the Context Engine on for a model whose window becomes known (owner decisions Q-R5-3/Q-R5-4:
 * "a person-set window enables the 50 % rule"). Before R5 it ran only for the five Z.ai registry rows. Its switch-on is proven
 * here through the REAL composition, kernel and Context Engine, on a fake provider on 127.0.0.1, with each risk measured:
 *   1. the token counter's preflight: before every model request the counter POSTs the request to a count endpoint with the
 *      key; for DeepSeek it guesses `/chat/completions/input_tokens`, which DeepSeek does not document, and a 400/401/403/429
 *      there fails the counter and the turn (context-token-counters.mjs:99-101). Guarded in talos-composition.ts: the guessed
 *      endpoint is never sent; a documented one that fails reads as "estimate";
 *   2. the reserve is sent as `max_tokens` on every request (talosHarness.mjs `preparedContext.measurement.responseReserve`):
 *      a reserve above a model's real output limit is an HTTP 400 at providers that check it. With no output limit known the
 *      reserve is Pi's 16,384 (or a quarter of a small window); the person can set `maxOutputTokens` beside the window;
 *   3. the switch mid-session: a window set between two runs turns the engine on from the next run, and that run completes;
 *   and the Context Engine carries the whole result.
 * 0.6.13 (22/10/2026): without the engine the CLI runs the desktop adapter (80a0d077e), which installs context hooks on every turn,
 * so the bare kernel's 8,000-character cut never runs there either: a result arrives whole, and is shortened only under pressure.
 * deepseek-flash is a registry row since d54028b4a (1M window): the unknown window is UNKNOWN_MODEL's (r5a-r-fixture.ts).
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {composeWithFake,runTurn,startScriptedProvider,UNKNOWN_MODEL,UNKNOWN_MODELS,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
/* F-027 (kernel merge): a tool result reaches the model inside the data boundary (confine-dati.mjs `avvolgiDati`); the frame is the only
   thing added to the file's text, and its size is the kernel's, not a number written here */
const kernelBoundary:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','kernel','confine-dati.mjs')).href);
const FRAME_OVERHEAD:number=kernelBoundary.avvolgiDati('',{fonte:'leggi big.txt',nonce:'0123456789ab'}).testo.length;
const unframed=(text:string)=>text.replace(/^<<<TALOS_DATA [^\n]*>>>\n/u,'').replace(/\n<<<END_TALOS_DATA id=[0-9a-f]{12}>>>$/u,'');
const BIG=Array.from({length:500},(_,i)=>`line ${String(i+1).padStart(4,'0')} ${'x'.repeat(10)}`).join('\n')+'\n';
const readBig={kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'big.txt'}]};
const oneRead=(request:ChatRequest)=>request.toolResults===0?readBig:{kind:'text' as const,text:'Done.'};
const setWindow=(h:any,models:Record<string,unknown>)=>writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models}));

test('a person-set window turns the Context Engine on: the whole result reaches the model, max_tokens is the reserve, no guessed count request',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'big.txt'),BIG);
  setWindow(h,{'deepseek:deepseek-flash':{contextWindow:65_536}});
  const fake=await startScriptedProvider({goodKey:key,respond:oneRead,answerOther:(_method,where)=>where.endsWith('/input_tokens')?{status:401}:null});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'read big.txt');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),`the turn completed: ${JSON.stringify(raw.filter(e=>e?.type==='RunError'))}`);
    assert.deepEqual(fake.other.filter(r=>r.path.endsWith('/input_tokens')),[],'risk 1: the guessed count endpoint is never sent (it answers 401 here, which would fail every turn)');
    for(const request of fake.requests)assert.equal(request.body.max_tokens,16_384,'risk 2: the reserve rides on every request as max_tokens');
    const tool=String(fake.requests[1]!.body.messages.find((m:any)=>m.role==='tool')?.content??'');
    assert.equal(unframed(tool),BIG,'the Context Engine carries the whole result: no 8,000-character cut');
    assert.equal(tool.length,BIG.length+FRAME_OVERHEAD,'F-027: inside the kernel\'s data boundary, whose characters are the only addition');
    const status=await context.runtime.contextStatus(sessionId);
    assert.equal(status.available,true);
    assert.equal(status.measurement?.method,'heuristic','a count that was not taken is an estimate, and says so');
    assert.equal(status.measurement?.windowTokens,65_536);
    assert.match(status.budget?.provenance??'',/^model profile: override/u);
    assert.equal(status.autoCompaction.triggerRatio,0.5,'the owner\'s 50 % rule');
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('a window set between two runs: the first run is the simple mode\'s (the whole result), the next the Context Engine\'s, and both complete',{timeout:240_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'big.txt'),BIG);
  const fake=await startScriptedProvider({goodKey:key,models:UNKNOWN_MODELS,respond:oneRead});
  const context=await composeWithFake(h,fake.url,key,{model:UNKNOWN_MODEL});
  try{
    const first=await runTurn(context,h,'read big.txt',{model:UNKNOWN_MODEL});
    assert.ok(first.raw.some(e=>e?.type==='RunFinished'));
    const before=fake.requests.length;
    const firstTool=String(fake.requests[1]!.body.messages.find((m:any)=>m.role==='tool')?.content??'');
    assert.equal(fake.requests[0]!.body.max_tokens,undefined,'no profile: no max_tokens, as before R5');
    /* 0.6.13 (22/10/2026): the desktop adapter's simple mode: no fixed cut, no marker, and so no `tool.read.cut` row */
    assert.doesNotMatch(firstTool,/TALOS cut/u,'no kernel cut marker');
    assert.equal(unframed(firstTool),BIG,'the whole result, inside the boundary');
    const adapter=createTuiEventAdapter();adapter.bindSession(first.sessionId);
    assert.deepEqual(first.raw.flatMap(row=>adapter.translateAll(row)).filter(e=>e.type==='tool.read.cut'),[],'no cut row on the screen');
    setWindow(h,{[UNKNOWN_MODEL]:{contextWindow:65_536,maxOutputTokens:8_192}});
    const second=await runTurn(context,h,'read big.txt again',{sessionId:first.sessionId});
    assert.ok(second.raw.some(e=>e?.type==='RunFinished'),`the second run completed: ${JSON.stringify(second.raw.filter(e=>e?.type==='RunError'))}`);
    const later=fake.requests.slice(before);
    assert.ok(later.length>=2);
    for(const request of later)assert.equal(request.body.max_tokens,8_192,'the person\'s output limit, not the default');
    assert.equal(unframed(String(later[1]!.body.messages.filter((m:any)=>m.role==='tool').at(-1)?.content??'')),BIG,'the whole result, inside the boundary');
  }finally{await context.runtime.close?.();await fake.close();}
}));

/*
 * R5a lane R, S3/S4/S7 — what the kernel does not publish, observed around each model run through the REAL composition and
 * the kernel (with the owner's amendment), on a fake provider on 127.0.0.1:
 * - each retry wait (`provider.attempt`), the provider's requested wait honoured up to 60 s (Q-R5-6);
 * - the status of the failure that ends a run, so 401 and 403 get their own words (Q-R5-6, carried from R2 Q-R2-8);
 * - the kernel's own compaction, named when it happens (Q-R5-4, gate E9).
 * Measured before (R5 research m1/m3/m4): 429 with `Retry-After: 7` → four requests inside 4.7 s, `⠋ thinking`; 401 and 403
 * → "HTTP 401 or 403"; the 9th request was the kernel's summary request and the screen said nothing.
 * 0.6.13 (22/10/2026): the CLI runs the desktop adapter (80a0d077e), which installs context hooks on every turn, so the read
 * tool's 8,000-character cut (Q-R5-11) never runs: a result arrives whole, proven with no `tool.read.cut` row in
 * r5a-r-context-engine.test.ts (the first run, unknown window), so its test here is gone. The automatic compaction is the
 * adapter's (0.75 of the window, or `context.compactAtTokens`), no longer the kernel's «every 8 model calls».
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {CLI_EVENT,KERNEL_COMPACTED_MARKER_START,KERNEL_COMPACTED_MARKER_STARTS,KERNEL_SUMMARY_REQUEST_START,createCliEventHub,createRunObserver} from '../../src/runtime/provider-attempts.ts';
import {loadModules} from '../../src/runtime/talos-composition.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {dummyKey,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider,UNKNOWN_MODEL,UNKNOWN_MODELS,type ChatRequest} from './r5a-r-fixture.ts';

const KERNEL_FILE=path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs');
const tui=(sessionId:string,raw:any[])=>{const adapter=createTuiEventAdapter();adapter.bindSession(sessionId);return raw.flatMap(row=>adapter.translateAll(row));};
const v2=(sessionId:string,raw:any[])=>{const bridge=createV2EventBridge(sessionId);return raw.map(row=>bridge.translate(row)).filter(Boolean) as any[];};

test('the two kernel texts the observer recognises are pinned against the kernel source',()=>{
  const source=readFileSync(KERNEL_FILE,'utf8');
  assert.ok(source.includes(`'${KERNEL_SUMMARY_REQUEST_START}, so the',`),'RICHIESTA_DI_RIASSUNTO still opens with these words');
  /* K3 (merged): the kernel writes the English marker; the Italian one (KERNEL_COMPACTED_MARKER_START) is only read, from saved sessions */
  const english='[conversation compacted at turn ';
  assert.ok(source.includes(`\`${english}\${GIRI_PRIMA_DI_COMPATTARE}: \``),'compattaConversazione still writes this marker');
  assert.ok(KERNEL_COMPACTED_MARKER_STARTS.includes(english)&&KERNEL_COMPACTED_MARKER_STARTS.includes(KERNEL_COMPACTED_MARKER_START),'the observer reads both forms');
  assert.ok(readFileSync(path.join(REPO_ROOT,'harness-ui','src','kernel','compattazione-desktop.mjs'),'utf8').includes("MARCATORE_RIASSUNTO = '[conversation compacted: "),'the automatic marker');
  assert.ok(KERNEL_COMPACTED_MARKER_STARTS.includes('[conversation compacted: '));
});

/* G02: the CLI has no Retry-After grammar of its own any more: the composition hands the observer the kernel's reader. */
test('the observer reads the requested wait with the kernel\'s own reader, and names each kernel retry wait',async()=>{
  const providerRetry:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-retry.mjs')).href);
  const modules=await loadModules(REPO_ROOT);
  assert.equal(modules.leggiAttesaRichiestaDalFornitore,providerRetry.leggiAttesaRichiestaDalFornitore,'the production modules carry the kernel reader');
  const now=Date.parse('2026-09-24T10:00:00Z');
  const cases:[Record<string,string>,number|null][]=[[{'retry-after':'7'},7000],[{'retry-after-ms':'1500','retry-after':'9'},1500],[{'retry-after':'Wed, 24 Sep 2026 10:00:30 GMT'},30_000],[{'retry-after':'1.5'},null],[{'retry-after':'soon'},null],[{},null]];
  for(const [headers,expected] of cases){
    const hub=createCliEventHub();const heard:any[]=[];hub.subscribe('s1',event=>heard.push(event));
    const observer=createRunObserver({sessionId:'s1',hub,now:()=>now,readRequestedWait:modules.leggiAttesaRichiestaDalFornitore!,baseFetch:async()=>new Response('slow',{status:429,headers})});
    await observer.fetchDiRete('http://x/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'hi'}]})});
    observer.onProviderRetry({tipo:'provider-retry',fase:'attesa',tentativo:2,tentativiMassimi:4,httpStatus:429,attesaMs:expected??500});
    observer.onProviderRetry({tipo:'provider-retry',fase:'fine',tentativo:2,tentativiMassimi:4,httpStatus:429,attesaMs:0});
    assert.deepEqual(heard,[{type:'CUSTOM',name:CLI_EVENT.attempt,value:{attempt:2,maxAttempts:4,status:429,retryAfterMs:expected,waitMs:expected??500}}],JSON.stringify(headers));
  }
});

test('the run observer names a kernel compaction only once the next request carries the compacted history',async()=>{
  const hub=createCliEventHub();const heard:any[]=[];hub.subscribe('s1',event=>heard.push(event));
  const replies:Response[]=[new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'summary'}}],usage:{prompt_tokens:9120}}),{status:200,headers:{'content-type':'application/json'}}),new Response('{}',{status:200})];
  const observer=createRunObserver({sessionId:'s1',hub,readRequestedWait:null,baseFetch:async()=>replies.shift()!});
  const history=[{role:'system',content:'sys'},{role:'user',content:'task'},...Array.from({length:14},(_,i)=>({role:i%2?'tool':'assistant',content:`m${i}`}))];
  await observer.fetchDiRete('http://x/chat/completions',{method:'POST',body:JSON.stringify({messages:[...history,{role:'user',content:`${KERNEL_SUMMARY_REQUEST_START}, so the\n...`}]})});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(heard,[],'nothing is named before the kernel has replaced the history');
  await observer.fetchDiRete('http://x/chat/completions',{method:'POST',body:JSON.stringify({messages:[history[0],history[1],{role:'user',content:`${KERNEL_COMPACTED_MARKER_START}8: …]\n\nsummary`}]})});
  assert.deepEqual(heard,[{type:'CUSTOM',name:CLI_EVENT.compacted,value:{engine:'kernel',messagesSummarized:14,tokensBefore:9120,tokensAfter:null,trigger:'automatic'}}]);
});

/* K3 (desktop 03/10): the kernel's compaction markers in English and in Italian, the manual one and the automatic one */
test('K3: a compaction is named whichever form of the kernel marker the history carries',async()=>{
  for(const marker of ['[conversazione compattata al giro 8: …]','[conversation compacted at turn 8: what follows is a summary, not the original history]',
    '[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]','[conversation compacted: what follows is a summary, not the original history]']){
    const hub=createCliEventHub();const heard:any[]=[];hub.subscribe('s1',event=>heard.push(event));
    const observer=createRunObserver({sessionId:'s1',hub,readRequestedWait:null,baseFetch:async()=>new Response('{}',{status:200})});
    await observer.fetchDiRete('http://x/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'task'},{role:'assistant',content:'a'},{role:'user',content:`${KERNEL_SUMMARY_REQUEST_START}, so the\n...`}]})});
    await observer.fetchDiRete('http://x/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'task'},{role:'user',content:`${marker}\n\nsummary`}]})});
    assert.equal(heard.length,1,marker);
  }
});

const BIG=Array.from({length:500},(_,i)=>`line ${String(i+1).padStart(4,'0')} ${'x'.repeat(10)}`).join('\n')+'\n';
const readBig={kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'big.txt'}]};

test('429 with a short Retry-After: the kernel waits what the provider asked and the screen gets each attempt',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');let calls=0;
  const fake=await startScriptedProvider({goodKey:key,respond:()=>++calls===1?{kind:'fail',status:429,headers:{'retry-after':'1'}}:{kind:'text',text:'OK'}});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'hello');
    assert.equal(fake.requests.length,2);
    assert.ok(fake.requests[1]!.at-fake.requests[0]!.at>=990,`the second request waited the second asked for (${fake.requests[1]!.at-fake.requests[0]!.at} ms)`);
    const attempt=tui(sessionId,raw).find(e=>e.type==='provider.attempt') as any;
    assert.deepEqual([attempt?.attempt,attempt?.maxAttempts,attempt?.status,attempt?.retryAfterMs,attempt?.waitMs],[2,11,429,1000,1000]);
    assert.equal(v2(sessionId,raw).find(e=>e.type==='provider.attempt')?.data.status,429);
    assert.ok(raw.some(e=>e?.type==='RunFinished'));
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('429 asking for two minutes: one request, no retry, and the failure names the wait',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'fail',status:429,headers:{'retry-after':'120'}})});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'hello');
    assert.equal(fake.requests.length,1,'no four requests inside the wait the provider asked for');
    const failed=tui(sessionId,raw).find(e=>e.type==='run.failed') as any;
    assert.match(failed.message,/asked TALOS to wait 120 s/u);assert.match(failed.message,/Wait 120 s and send the message again/u);
    assert.equal(v2(sessionId,raw).find(e=>e.type==='run.failed')?.data.error.retryAfterMs,120_000);
  }finally{await context.runtime.close?.();await fake.close();}
}));

for(const [status,words] of [[401,/rejected the API key \(HTTP 401\)/u],[403,/denied access to this model or action \(HTTP 403\)/u]] as const){
  test(`HTTP ${status}: not retried, and worded as ${status} (not "401 or 403")`,{timeout:120_000},async()=>hermetic(async h=>{
    const key=dummyKey('deepseek');
    const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'fail',status})});
    const context=await composeWithFake(h,fake.url,key);
    try{
      const {sessionId,raw}=await runTurn(context,h,'hello');
      assert.equal(fake.requests.length,1);
      const failed=tui(sessionId,raw).find(e=>e.type==='run.failed') as any;
      assert.match(failed.message,words);assert.doesNotMatch(failed.message,/401 or 403/u);
      assert.equal(v2(sessionId,raw).find(e=>e.type==='run.failed')?.data.error.status,status);
    }finally{await context.runtime.close?.();await fake.close();}
  }));
}

/* 0.6.13 (22/10/2026): deepseek-flash is a registry row since d54028b4a (1M window), which turns the Context Engine on; a session
   without it is one on UNKNOWN_MODEL, whose window no source knows.
   r4 4e4004950: the registry's /compact on that path no longer calls the CLI's `compattaSessioneFn`, which named it from the kernel
   summary's usage; it summarises as the end-of-turn summary does (`dividiPerCompattazione`: first request, last three, last two
   exchanges word for word, so the session needs five requests to have a middle) and answers `{compattato:true, tokenPrima,
   tokenDopo}`. The CLI names it where it calls the registry (talos-composition.ts `compactSession`): once, live, kernel/manual, with
   the registry's own figures; how many messages were summarised is not in the answer, so it is not said. */
test('an explicit /compact of a session without the Context Engine is named too, as manual',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  // the summary request offers no tools (`riassumiPerCompattazione`, attrezzi: [])
  /* r4 79dbe20e3: a summary is not paid when it cannot reduce: the answers are long. r4 109b7d9b0: what it can remove must be more
     than the summary itself (its expected size, 400 tokens at least since r4 74f9caf27) plus the frame, so about 13,000 characters each */
  const fake=await startScriptedProvider({goodKey:key,models:UNKNOWN_MODELS,respond:request=>!request.tools.length?{kind:'text',text:'We said hello five times.',usage:{prompt_tokens:321,completion_tokens:6}}:{kind:'text',text:`OK. ${'This answer carries enough words to be worth summarising later. '.repeat(200)}`}});
  const context=await composeWithFake(h,fake.url,key,{model:UNKNOWN_MODEL});
  try{
    const {sessionId}=await runTurn(context,h,'request 1: hello',{model:UNKNOWN_MODEL});
    for(let n=2;n<=5;n++)await runTurn(context,h,`request ${n}: hello again`,{sessionId,model:UNKNOWN_MODEL});
    const turns=fake.requests.length;
    const raw:any[]=[];const off=context.runtime.subscribe(sessionId,(event:any)=>raw.push(event),0);
    let result:any;try{result=await context.runtime.compact(sessionId);}finally{off();}
    assert.deepEqual(fake.requests.slice(turns).map(r=>[r.authorized,r.tools.length]),[[true,0]],'one summary request, with the key, offering no tools');
    assert.equal(result?.compattato,true,JSON.stringify(result));
    assert.equal(typeof result.tokenPrima,'number','the registry measured the conversation before');
    const named=tui(sessionId,raw).filter(e=>e.type==='context.compacted') as any[];
    assert.equal(named.length,1,'named once');
    assert.deepEqual([named[0].engine,named[0].trigger,named[0].tokensBefore,named[0].tokensAfter,named[0].messagesSummarized],['kernel','manual',result.tokenPrima,typeof result.tokenDopo==='number'?result.tokenDopo:null,null]);
    const inV2=v2(sessionId,raw).filter(e=>e.type==='context.compacted');
    assert.equal(inV2.length,1,'-p v2 names it once too');
    assert.deepEqual([inV2[0].data.engine,inV2[0].data.trigger,inV2[0].data.tokensBefore],['kernel','manual',result.tokenPrima]);
  }finally{await context.runtime.close?.();await fake.close();}
}));

/*
 * 0.6.13 (22/10/2026): the automatic compaction is the desktop adapter's, at 0.75 of the window or at `context.compactAtTokens`
 * (8,000 here, the lowest the configuration takes, on a window no source knows), no longer the kernel's «every 8 model calls».
 * Its fact is the adapter's own `talos.compattazione {fase:'fine', compattato:true, tokenPrima, tokenDopo}`: the CLI names it once,
 * live (before the run ends, in the transcript and in `-p` v2), with the adapter's numbers. Before the cure it was named only by the
 * end-of-run count (`compattazioni`), with no numbers and not in v2.
 */
test('the automatic compaction is named when it happens, once, live, with the adapter\'s tokens before and after',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  /* Owner 09/10/2026: identical reads with the same result are stopped at the 5th (the guard against going round in circles), so the
     reads that drive the compaction read different files of the same size */
  for(let i=0;i<9;i++)writeFileSync(path.join(h.project,`big${i}.txt`),BIG);
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:2,context:{compactAtTokens:8_000}}));
  const readBigN=(i:number)=>({...readBig,args:[{pattern:/^(path|percorso|file)/iu,value:`big${i}.txt`}]});
  /* K3: any form of the compacted marker the kernel ever wrote means the history was compacted */
  const compactedHistory=(request:ChatRequest)=>request.body.messages.some((m:any)=>KERNEL_COMPACTED_MARKER_STARTS.some(start=>String(m?.content??'').startsWith(start)));
  /* the adapter's summary request offers no tools */
  const respond=(request:ChatRequest)=>!request.tools.length?{kind:'text' as const,text:'I read the big files.',usage:{prompt_tokens:17000,completion_tokens:9}}
    :request.toolResults<9&&!compactedHistory(request)?readBigN(request.toolResults):{kind:'text' as const,text:'Done.'};
  const fake=await startScriptedProvider({goodKey:key,models:UNKNOWN_MODELS,respond});
  const context=await composeWithFake(h,fake.url,key,{model:UNKNOWN_MODEL});
  try{
    const {sessionId,raw}=await runTurn(context,h,'read big.txt many times',{model:UNKNOWN_MODEL});
    assert.ok(fake.requests.some(r=>!r.tools.length),'a summary was asked for');
    assert.ok(fake.requests.some(r=>r.tools.length&&compactedHistory(r)),'a later request carries the summary in place of the history');
    const done=raw.filter(e=>e?.type==='CUSTOM'&&e.name==='talos.compattazione'&&e.value?.fase==='fine'&&e.value?.compattato===true);
    /* r4 109b7d9b0 (the CLI's review 5 cure): a summary is paid only when its expected net gain is at least 10% of the threshold, and
       the free reduction of the tail comes first, so this run compacts more than once (the tail first, then a summary). Each
       compaction is named once, live, with its own numbers, and the run's count agrees */
    assert.ok(done.length>=1,'the adapter compacted');
    for(const row of done)assert.equal(typeof row.value.tokenPrima,'number','the adapter measured the conversation before');
    /* named from a row delivered BEFORE the run's end: translated row by row, so a name made up at RunFinished is not live */
    const adapter=createTuiEventAdapter();adapter.bindSession(sessionId);
    const finishedAt=raw.findIndex(e=>e?.type==='RunFinished');
    const named=raw.flatMap((row,at)=>adapter.translateAll(row).filter(e=>e.type==='context.compacted').map(e=>({at,event:e as any})));
    assert.equal(named.length,done.length,'each named once: live, and not again when the run reports it');
    const facts=done.map(row=>[row.value.tokenPrima,typeof row.value.tokenDopo==='number'?row.value.tokenDopo:null]);
    named.forEach((name,index)=>{
      assert.ok(name.at<finishedAt,`named live, before the run ended (row ${name.at}, RunFinished ${finishedAt})`);
      assert.deepEqual([name.event.engine,name.event.trigger,name.event.tokensBefore,name.event.tokensAfter],['kernel','automatic',...facts[index]!]);
    });
    const inV2=v2(sessionId,raw).filter(e=>e.type==='context.compacted');
    assert.equal(inV2.length,done.length,'-p v2 names each once too');
    assert.deepEqual(inV2.map(e=>[e.data.engine,e.data.trigger,e.data.tokensBefore,e.data.tokensAfter]),facts.map(f=>['kernel','automatic',...f]));
    assert.equal(raw.find(e=>e?.type==='RunFinished')?.result?.compattazioni,done.length);
  }finally{await context.runtime.close?.();await fake.close();}
}));

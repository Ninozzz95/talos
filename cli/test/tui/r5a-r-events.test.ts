/*
 * R5a lane R — the new facts through protocol v2 and the TUI adapter (gate E3: v1 byte-frozen, v2 and the TUI additive).
 * Raw rows are the shapes measured through the real composition (r5a-r-usage-shapes.test.ts) and the CLI's own CUSTOM rows
 * (runtime/provider-attempts.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';

const CLOCK=()=>'2026-09-24T00:00:00.000Z';
let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
const attempt={type:'CUSTOM',name:'talos.cli.provider.attempt',value:{attempt:2,maxAttempts:4,status:429,retryAfterMs:7000,waitMs:7000}};
const compacted={type:'CUSTOM',name:'talos.cli.context.compacted',value:{engine:'kernel',messagesSummarized:14,tokensBefore:9120,tokensAfter:null,trigger:'automatic'}};
const failure={type:'CUSTOM',name:'talos.cli.provider.failure',value:{status:401,retryAfterMs:null}};
const request=(n:number)=>durable({type:'CUSTOM',name:'consumo-fornitore',value:{tipo:'consumo-fornitore',provider:'deepseek',model:'deepseek-flash',usage:{prompt_tokens:1000+n*400,completion_tokens:50,total_tokens:1050,prompt_tokens_details:{cached_tokens:100}},costoDichiarato:null,esito:'completato'}});
const usage=durable({type:'StateDelta',delta:[{op:'replace',path:'/usage',value:{prompt_tokens:2400,completion_tokens:80,cached_tokens:1000,giri:2}}]});
const committed=durable({type:'CUSTOM',name:'talos.context',value:{schema:'talos.context.event.v1',id:'e1',sessionId:'s1',versionId:'v7',kind:'context.version.committed',createdAt:'2026-09-24T00:00:00.000Z',payload:{coveredThrough:12}}});

test('v1 stays byte-frozen: the CLI rows and the kernel CUSTOM rows add nothing to the v1 stream',()=>{
  const base=[durable({type:'RunStarted',runId:'r1'}),usage,durable({type:'RunFinished',runId:'r1',outcome:'concluso',result:{detto:'ok',compattazioni:1}})];
  const withRows=[base[0],attempt,compacted,request(1),committed,failure,base[1],base[2]];
  const v1=(rows:unknown[])=>{const bridge=createEventBridge('s1',CLOCK);return JSON.stringify(rows.map(row=>bridge.translate(row)).filter(Boolean));};
  assert.equal(v1(withRows),v1(base));
});

test('v2: an attempt, a compaction by either engine, the last request\'s usage and a failure\'s status are v2 facts',()=>{
  const bridge=createV2EventBridge('s1',CLOCK);
  bridge.translate(durable({type:'RunStarted',runId:'r1'}));
  const a=bridge.translate(attempt)!;
  assert.equal(a.type,'provider.attempt');assert.equal(a.durability,'transient');
  assert.deepEqual(a.data,{attempt:2,maxAttempts:4,status:429,retryAfterMs:7000,waitMs:7000});
  const k=bridge.translate(compacted)!;
  assert.deepEqual([k.type,k.durability,k.data],['context.compacted','transient',{engine:'kernel',messagesSummarized:14,tokensBefore:9120,tokensAfter:null,trigger:'automatic'}]);
  const c=bridge.translate(committed)!;
  assert.deepEqual([c.type,c.durability,c.cursor!==null,c.data],['context.compacted','durable',true,{engine:'context-engine',messagesSummarized:null,tokensBefore:null,tokensAfter:null,versionId:'v7'}]);
  assert.equal(bridge.translate(request(1)),null,'a request row is folded, not an event');
  const u=bridge.translate(usage)!;
  assert.deepEqual(u.data,{value:{prompt_tokens:2400,completion_tokens:80,cached_tokens:1000,turns:2},lastRequest:{provider:'deepseek',model:'deepseek-flash',inputTokens:1400,outputTokens:50,cachedTokens:100}});
  assert.equal(bridge.translate(failure),null,'a failure\'s facts are folded into the run.failed that follows');
  const failed=bridge.translate(durable({type:'RunError',message:'Credenziale rifiutata dal fornitore.',code:'PROVIDER_REQUEST_ERROR'}))!;
  const error=failed.data.error as any;
  assert.equal(error.status,401);assert.equal(error.envelope.code,'PROVIDER_REQUEST_ERROR');
  assert.match(error.message,/rejected the API key \(HTTP 401\)/u,'401 is the key, not "401 or 403"');
});

test('v2: the failure facts never reach a later run; a provider-declared cost is summed per run',()=>{
  const bridge=createV2EventBridge('s1',CLOCK);
  bridge.translate(durable({type:'RunStarted',runId:'r1'}));bridge.translate(failure);
  bridge.translate(durable({type:'RunFinished',runId:'r1',outcome:'concluso',result:{detto:'ok'}}));
  bridge.translate(durable({type:'RunStarted',runId:'r2'}));
  const failed=bridge.translate(durable({type:'RunError',message:'Credenziale rifiutata dal fornitore.',code:'PROVIDER_REQUEST_ERROR'}))!;
  assert.equal((failed.data.error as any).status,undefined);
  bridge.translate(durable({type:'RunStarted',runId:'r3'}));
  for(const cost of [0.001,0.002])bridge.translate(durable({type:'CUSTOM',name:'consumo-fornitore',value:{provider:'openrouter',model:'x/y',usage:{prompt_tokens:10,completion_tokens:1},costoDichiarato:cost,esito:'completato'}}));
  assert.equal((bridge.translate(usage)!.data as any).declaredCostUsd,0.003);
});

test('403 keeps its own words, and a wait above 60 s says TALOS did not retry',()=>{
  const bridge=createV2EventBridge('s1',CLOCK);
  bridge.translate(durable({type:'RunStarted',runId:'r1'}));
  bridge.translate({type:'CUSTOM',name:'talos.cli.provider.failure',value:{status:403,retryAfterMs:null}});
  const forbidden=bridge.translate(durable({type:'RunError',message:'Credenziale rifiutata dal fornitore.',code:'PROVIDER_REQUEST_ERROR'}))!;
  assert.match((forbidden.data.error as any).message,/denied access to this model or action \(HTTP 403\)/u);
  bridge.translate(durable({type:'RunStarted',runId:'r2'}));
  bridge.translate({type:'CUSTOM',name:'talos.cli.provider.failure',value:{status:429,retryAfterMs:120_000}});
  const limited=bridge.translate(durable({type:'RunError',message:'Troppo traffico presso il fornitore.',code:'PROVIDER_REQUEST_ERROR'}))!;
  const error=limited.data.error as any;
  assert.equal(error.retryAfterMs,120_000);
  assert.match(error.message,/asked TALOS to wait 120 s, longer than it waits by itself/u);
  assert.match(error.envelope.todo,/Wait 120 s/u);
});

test('TUI: the adapter projects the contract events, folds the request usage into the value, and names a replayed compaction',()=>{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const all=[durable({type:'RunStarted',runId:'r1'}),attempt,request(1),usage,durable({type:'RunFinished',runId:'r1',outcome:'concluso',result:{detto:'ok',compattazioni:2}})].flatMap(row=>adapter.translateAll(row));
  assert.deepEqual(all.find(e=>e.type==='provider.attempt'),{type:'provider.attempt',attempt:2,maxAttempts:4,status:429,retryAfterMs:7000,waitMs:7000,eventId:(all.find(e=>e.type==='provider.attempt') as any).eventId});
  const value=(all.find(e=>e.type==='usage.updated') as any).value;
  assert.deepEqual(value.lastRequest,{provider:'deepseek',model:'deepseek-flash',inputTokens:1400,outputTokens:50,cachedTokens:100});
  const types=all.map(e=>e.type);
  assert.deepEqual(types.slice(-3),['context.compacted','context.compacted','run.completed'],'two compactions the live stream did not see are named before the run ends');
});

test('TUI: a compaction seen live is not named twice when the run reports it',()=>{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const all=[durable({type:'RunStarted',runId:'r1'}),compacted,durable({type:'RunFinished',runId:'r1',outcome:'concluso',result:{detto:'ok',compattazioni:1}})].flatMap(row=>adapter.translateAll(row));
  const named=all.filter(e=>e.type==='context.compacted');
  assert.equal(named.length,1);
  assert.deepEqual({...named[0],eventId:undefined},{type:'context.compacted',engine:'kernel',messagesSummarized:14,tokensBefore:9120,tokensAfter:null,trigger:'automatic',eventId:undefined});
});

test('TUI: a kept output and a read cut become the facts the row states',()=>{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const saved='head\n\n… [TALOS cut 4892 characters from the middle of this output; 4000 of 8892 characters are shown. The full output is saved in "C:\\data\\tool-output\\s1\\1-a.txt"; read that file for the rest.] …\n\ntail';
  /* G02: the unified kernel cuts a read result from the middle (output-store.ts KERNEL_CUT_MARKER); the file's line total is not said */
  const cut='line 1\nline 2\nli'+'\n\n… [TALOS cut 2500 characters from the middle of this output] …\n\n'+'ne 9\nline 10\n';
  const out=[
    durable({type:'ToolCallStart',toolCallId:'t1',toolCallName:'shell'}),
    durable({type:'ToolCallResult',toolCallId:'t1',content:saved}),
    durable({type:'ToolCallStart',toolCallId:'t2',toolCallName:'leggi'}),
    durable({type:'ToolCallResult',toolCallId:'t2',content:cut}),
  ].flatMap(row=>adapter.translateAll(row));
  const savedEvent=out.find(e=>e.type==='tool.output.saved') as any;
  assert.deepEqual([savedEvent.toolCallId,savedEvent.path,savedEvent.keptChars,savedEvent.totalChars],['t1','C:\\data\\tool-output\\s1\\1-a.txt',4000,8892]);
  const cutEvent=out.find(e=>e.type==='tool.read.cut') as any;
  assert.deepEqual([cutEvent.toolCallId,cutEvent.shownLines,cutEvent.totalLines,cutEvent.limitChars],['t2',5,null,29],'3 head lines (the last one cut) + 2 tail lines; 16 + 13 characters kept');
  /* G02: `leggi`'s own header (D1 line reads) names the file's line total; the header is not a line of the file */
  const paged='[TALOS read lines 1-2000 of 3000 in "big.txt"; continue with leggi offset=2001. The file may change between reads.]\nline 1\nline 2\nli'+'\n\n… [TALOS cut 9000 characters from the middle of this output] …\n\n'+'ne 9\nline 10\n';
  const pagedCut=[durable({type:'ToolCallStart',toolCallId:'t3',toolCallName:'leggi'}),durable({type:'ToolCallResult',toolCallId:'t3',content:paged})].flatMap(row=>adapter.translateAll(row)).find(e=>e.type==='tool.read.cut') as any;
  assert.deepEqual([pagedCut.shownLines,pagedCut.totalLines],[5,3000],'the lines the model saw, of the file\'s 3,000');
});

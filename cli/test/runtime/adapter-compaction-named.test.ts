/*
 * 0.6.13 (full suite, 22/10/2026): under the desktop adapter the CLI named an automatic compaction only at the run's end, with no
 * numbers on the screen and not at all in `-p` v2, because its live reading knew only the bare kernel's summary request. The adapter
 * reports each compaction it applies on `onGiro` (`compattazione-fine`, `compattato:true`, with its record); the run's observer names
 * it there, once, with the record's token figures.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {CLI_EVENT,createCliEventHub,createRunObserver} from '../../src/runtime/provider-attempts.ts';

function observe(){
  const hub=createCliEventHub();const seen:any[]=[];
  hub.subscribe('s-1',(event:any)=>seen.push(event));
  const observer=createRunObserver({sessionId:'s-1',hub,readRequestedWait:null,baseFetch:async()=>new Response('{}')});
  return{observer,compactions:()=>seen.filter(event=>event?.name===CLI_EVENT.compacted).map(event=>event.value)};
}

test('a compaction the adapter applied is named live, once, with its token figures',()=>{
  const {observer,compactions}=observe();
  observer.onCompaction({giro:3,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:8,tokenPrima:15_459,tokenDopo:946,riassunto:[]}});
  /* judge v1597: this row says no reason (no start, no `motivo`), so the fact says so and the screen names no rule */
  assert.deepEqual(compactions(),[{engine:'kernel',messagesSummarized:null,tokensBefore:15_459,tokensAfter:946,trigger:'automatic',causeUnknown:true}]);
});

test('a summary written without the model is a compaction too; figures it lacks stay unknown',()=>{
  const {observer,compactions}=observe();
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,ripiego:true,ragione:'tempo',record:{coveredThrough:4,riassunto:[]}});
  /* Z piece C: named with the method and its reason */
  assert.deepEqual(compactions(),[{engine:'kernel',messagesSummarized:null,tokensBefore:null,tokensAfter:null,trigger:'automatic',method:'without-model',fallbackReason:'time'}]);
});

test('the screen says a /compact as asked, and an automatic one by its rule',async()=>{
  const {compactionNoticeText}=await import('../../src/tui/transcript-model.ts');
  const fact={engine:'kernel',messagesSummarized:null,tokensBefore:15_459,tokensAfter:946};
  assert.match(compactionNoticeText({...fact,trigger:'manual'}),/^Context compacted, as \/compact asked: /u);
  assert.match(compactionNoticeText({...fact,trigger:'automatic'}),/^Context compacted by the kernel \(at 75% of the window/u);
  assert.match(compactionNoticeText({...fact,engine:'context-engine',trigger:'manual'}),/as \/compact asked/u,'whichever engine did it');
});

/* review 4 S3-2 of 0.6.13: the registry's end-of-turn record was named when it was written; the turn that adopts it does not name
   it again, and a rest summarised on top of it is named from the adopted figure */
test('an adopted end-of-turn record is named once, and a rest on top of it from the adopted figure',()=>{
  const {observer,compactions}=observe();
  const at='2026-10-22T16:07:48.475Z';
  observer.onCompaction({giro:0,tipo:'compattazione-fine',compattato:true,istantanea:true,record:{coveredThrough:9,tokenPrima:9_636,tokenDopo:6_798,riassunto:[]},
    adottato:{at,origine:'fine-giro',tokenDopo:6_798,conResto:false}});
  observer.onCompaction({giro:0,tipo:'compattazione-fine',compattato:true,istantanea:true,record:{coveredThrough:9,tokenPrima:21_641,tokenDopo:18_793,riassunto:[]},
    adottato:{at,origine:'fine-giro',tokenDopo:18_793,conResto:false},restoNonRiuscito:{motivo:'interrotta'}});
  assert.deepEqual(compactions(),[],'the base alone, adopted from the registry: already named');
  observer.onCompaction({giro:0,tipo:'compattazione-fine',compattato:true,istantanea:true,record:{coveredThrough:14,tokenPrima:21_641,tokenDopo:1_043,riassunto:[]},
    adottato:{at,origine:'fine-giro',tokenDopo:18_793,conResto:true}});
  assert.deepEqual(compactions(),[{engine:'kernel',messagesSummarized:null,tokensBefore:18_793,tokensAfter:1_043,trigger:'automatic',causeUnknown:true}],'judge v1597: no `motivo` on these rows');
});

test('a record a turn prepared was never named: adopting it names it, as before',()=>{
  const {observer,compactions}=observe();
  for(const adottato of [{at:'2026-10-22T16:07:48.475Z',origine:'giro',tokenDopo:946,conResto:false},{at:'2026-10-22T16:07:48.475Z'}])
    observer.onCompaction({giro:1,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:8,tokenPrima:15_459,tokenDopo:946,riassunto:[]},adottato});
  assert.deepEqual(compactions(),[1,2].map(()=>({engine:'kernel',messagesSummarized:null,tokensBefore:15_459,tokensAfter:946,trigger:'automatic',causeUnknown:true})),'judge v1597: no `motivo` on these rows');
});

test('what is not an applied compaction names nothing',()=>{
  const {observer,compactions}=observe();
  for(const evento of [
    {tipo:'compattazione-fine',compattato:false,motivo:'ripiego',codice:'CTX_COMPACTION_TIMEOUT'},
    {tipo:'compattazione-fine',compattato:false,motivo:'motore',origine:'motore'},
    {tipo:'compattazione-inizio',motivo:'soglia'},
    {tipo:'provider-retry',fase:'attesa',tentativo:1,tentativiMassimi:3,httpStatus:429,attesaMs:10},
    null,'compattazione-fine',
  ])observer.onCompaction(evento);
  assert.deepEqual(compactions(),[]);
});

/* review 9 F1/F5 of 0.6.13 (23/10/2026): a row with no summary (`soloCoda`) is free. Only rule K (`accorciati`) is quiet, as contract
   (c) and the CHANGELOG say; older tool results shortened (`ridotti`, or a tail-only row) are named as that, never as «summarized» */
test('rule K alone is quiet; a tail-only shortening is named as tool results, not as a summary',async()=>{
  const {observer,compactions}=observe();
  observer.onCompaction({giro:1,tipo:'compattazione-fine',compattato:true,soloCoda:true,accorciati:2,record:{coveredThrough:3,tokenPrima:29_811,tokenDopo:19_105,riassunto:[]}});
  assert.deepEqual(compactions(),[],'rule K alone: nothing named, and the brake is not re-armed');
  /* Z F1 (confirmed by the Desktop 23/10/2026): a tail-only row that shortened no tool output and replaced no image is quiet too */
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,soloCoda:true,record:{coveredThrough:4,tokenPrima:10_400,tokenDopo:10_300,riassunto:[]}});
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,soloCoda:true,ridotti:0,immagini:0,record:{coveredThrough:4,tokenPrima:10_400,tokenDopo:10_300,riassunto:[]}});
  assert.deepEqual(compactions(),[],'nothing shortened, nothing replaced: nothing named');
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,soloCoda:true,ridotti:2,record:{coveredThrough:5,tokenPrima:10_200,tokenDopo:10_000,riassunto:[]}});
  observer.onCompaction({giro:3,tipo:'compattazione-fine',compattato:true,soloCoda:true,accorciati:1,ridotti:3,record:{coveredThrough:7,tokenPrima:12_000,tokenDopo:9_000,riassunto:[]}});
  assert.deepEqual(compactions(),[
    {engine:'kernel',messagesSummarized:null,tokensBefore:10_200,tokensAfter:10_000,trigger:'automatic',method:'tool-results'},
    {engine:'kernel',messagesSummarized:null,tokensBefore:12_000,tokensAfter:9_000,trigger:'automatic',method:'tool-results'}]);
  observer.onCompaction({giro:4,tipo:'compattazione-fine',compattato:true,accorciati:1,record:{coveredThrough:9,tokenPrima:14_000,tokenDopo:4_000,riassunto:[]}});
  assert.deepEqual(compactions().at(-1),{engine:'kernel',messagesSummarized:null,tokensBefore:14_000,tokensAfter:4_000,trigger:'automatic',causeUnknown:true},'a real summary with rule K beside it is a summary (judge v1597: with no reason on the row)');
  const {compactionNoticeText}=await import('../../src/tui/transcript-model.ts');
  const said=compactionNoticeText({engine:'kernel',messagesSummarized:null,tokensBefore:10_200,tokensAfter:10_000,trigger:'automatic',method:'tool-results'});
  assert.match(said,/^Shortened older tool results for the model, nothing summarized: 10\.2k → 10k tokens/u);
  assert.doesNotMatch(said,/messages summarized/u);
});

/* Z F1 (r4, confirmed by the Desktop 23/10/2026): `immagini` counts the older images a tail-only row replaced with a placeholder */
test('a tail-only row that replaced images is named with them, with or without tool results',async()=>{
  const {observer,compactions}=observe();
  observer.onCompaction({giro:1,tipo:'compattazione-fine',compattato:true,soloCoda:true,accorciati:1,immagini:2,record:{coveredThrough:3,tokenPrima:30_000,tokenDopo:12_000,riassunto:[]}});
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,soloCoda:true,ridotti:3,immagini:1,record:{coveredThrough:5,tokenPrima:20_000,tokenDopo:9_000,riassunto:[]}});
  assert.deepEqual(compactions(),[
    {engine:'kernel',messagesSummarized:null,tokensBefore:30_000,tokensAfter:12_000,trigger:'automatic',method:'images',imagesReplaced:2},
    {engine:'kernel',messagesSummarized:null,tokensBefore:20_000,tokensAfter:9_000,trigger:'automatic',method:'tool-results',imagesReplaced:1}]);
  const {compactionNoticeText}=await import('../../src/tui/transcript-model.ts');
  assert.match(compactionNoticeText(compactions()[0]!),/^Replaced 2 older images with a placeholder for the model, nothing summarized: 30k → 12k tokens/u);
  assert.match(compactionNoticeText(compactions()[1]!),/^Shortened older tool results and replaced 1 older image with a placeholder for the model, nothing summarized: 20k → 9k tokens/u);
  /* the fact crosses v2 and the screen's adapter whole */
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const v2=createV2EventBridge('s1',()=>'2026-10-23T00:00:00.000Z').translate({type:'CUSTOM',_sequenza:3,name:'talos.cli.context.compacted',value:compactions()[0]}) as any;
  assert.equal(v2?.data?.method,'images');assert.equal(v2?.data?.imagesReplaced,2);
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const screen=adapter.translateAll(v2).find((event:any)=>event.type==='context.compacted') as any;
  assert.equal(screen?.method,'images');assert.equal(screen?.imagesReplaced,2);
});

/* Z piece C (r4 7ea1e0dc4, the row measured on the built CLI 23/10/2026): a summary TALOS's own code wrote after the provider's
   «does not fit» (`ripiego:true, ragione:'bersaglio'`) is said as made without a model, with its reason; never «summarized» */
test('a model-free summary is named as that, with the reason in English, through v2 and the screen',async()=>{
  const {observer,compactions}=observe();
  observer.onCompaction({giro:0,tipo:'compattazione-fine',compattato:true,ripiego:true,classe:'bersaglio',ragione:'bersaglio',record:{coveredThrough:10,tokenPrima:10_325,tokenDopo:8_559,riassunto:[]}});
  observer.onCompaction({giro:1,tipo:'compattazione-fine',compattato:true,ripiego:true,classe:'esaurito',ragione:'freno',record:{coveredThrough:12,tokenPrima:9_000,tokenDopo:6_000,riassunto:[]}});
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,ripiego:true,ragione:'nuova-ragione',record:{coveredThrough:14,tokenPrima:9_500,tokenDopo:6_100,riassunto:[]}});
  assert.deepEqual(compactions(),[
    {engine:'kernel',messagesSummarized:null,tokensBefore:10_325,tokensAfter:8_559,trigger:'automatic',method:'without-model',fallbackReason:'target'},
    {engine:'kernel',messagesSummarized:null,tokensBefore:9_000,tokensAfter:6_000,trigger:'automatic',method:'without-model',fallbackReason:'brake'},
    {engine:'kernel',messagesSummarized:null,tokensBefore:9_500,tokensAfter:6_100,trigger:'automatic',method:'without-model'}]);
  const {compactionNoticeText}=await import('../../src/tui/transcript-model.ts');
  assert.equal(compactionNoticeText(compactions()[0]!),'Shortened older messages without a model summary (the provider said the conversation did not fit): 10.3k → 8.6k tokens · /context');
  assert.match(compactionNoticeText(compactions()[1]!),/^Shortened older messages without a model summary \(automatic summaries are paused\): 9k → 6k tokens/u);
  assert.match(compactionNoticeText(compactions()[2]!),/^Shortened older messages without a model summary: 9\.5k → 6\.1k tokens/u,'an unknown reason is not invented');
  for(const said of compactions().map(fact=>compactionNoticeText(fact)))assert.doesNotMatch(said,/summarized/u);
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const v2=createV2EventBridge('s1',()=>'2026-10-23T00:00:00.000Z').translate({type:'CUSTOM',_sequenza:4,name:'talos.cli.context.compacted',value:compactions()[0]}) as any;
  assert.equal(v2?.data?.method,'without-model');assert.equal(v2?.data?.fallbackReason,'target');
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const screen=adapter.translateAll(v2).find((event:any)=>event.type==='context.compacted') as any;
  assert.equal(screen?.method,'without-model');assert.equal(screen?.fallbackReason,'target');
});

/* review 10 R10-9 of 0.6.13: a compaction the provider's refusal started (`compattazione-inizio` `motivo:'overflow'`) is not
   explained by the automatic rule («at 75% of the window»); the next one at the threshold is again */
test('a compaction after the provider’s refusal is said as that, through v2 and the screen',async()=>{
  const {observer,compactions}=observe();
  observer.onCompaction({giro:4,tipo:'compattazione-inizio',motivo:'overflow',tokenMisurati:14_000});
  observer.onCompaction({giro:4,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:9,tokenPrima:14_000,tokenDopo:6_000,riassunto:[]}});
  observer.onCompaction({giro:5,tipo:'compattazione-inizio',motivo:'soglia',tokenMisurati:25_000});
  observer.onCompaction({giro:5,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:11,tokenPrima:25_000,tokenDopo:7_000,riassunto:[]}});
  observer.onCompaction({giro:6,tipo:'compattazione-inizio',motivo:'overflow',tokenMisurati:14_000});
  observer.onCompaction({giro:6,tipo:'compattazione-fine',compattato:false,motivo:'troncato'});
  observer.onCompaction({giro:6,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:13,tokenPrima:9_000,tokenDopo:6_000,riassunto:[]}});
  const [refused,threshold,after]=compactions();
  assert.equal(refused?.afterRefusal,true);
  assert.equal('afterRefusal' in (threshold??{}),false,'a threshold compaction is not one after a refusal');
  assert.equal('afterRefusal' in (after??{}),false,'the start is used once: the failed end closed it');
  const {compactionNoticeText}=await import('../../src/tui/transcript-model.ts');
  assert.equal(compactionNoticeText(refused!),'Context compacted after the provider said the conversation did not fit: earlier messages summarized · 14k → 6k tokens · /context');
  assert.match(compactionNoticeText(threshold!),/^Context compacted by the kernel \(at 75% of the window/u);
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const v2=createV2EventBridge('s1',()=>'2026-10-23T00:00:00.000Z').translate({type:'CUSTOM',_sequenza:4,name:'talos.cli.context.compacted',value:refused}) as any;
  assert.equal(v2?.data?.afterRefusal,true);
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  assert.equal((adapter.translateAll(v2).find((event:any)=>event.type==='context.compacted') as any)?.afterRefusal,true);
});

/* review 10 R10-6 of 0.6.13 (CLI side; the kernel adds `soloCoda`/`ridotti`/`immagini` to the end-of-turn row): an end-of-turn
   shortening without a summary is named as what it shortened, and is quiet when it shortened nothing the model reads */
test('the end-of-turn tail-only row: quiet, tool results or images, never «summarized»',async()=>{
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const background=(extra:Record<string,unknown>)=>createV2EventBridge('s1',()=>'2026-10-23T00:00:00.000Z').translate({type:'CUSTOM',_sequenza:7,name:'talos.compattazione',
    value:{fase:'fine',compattato:true,motivo:'background',tokenPrima:20_000,tokenDopo:15_000,...extra}}) as any;
  assert.equal(background({soloCoda:true}),null);
  assert.equal(background({soloCoda:true,ridotti:0,immagini:0}),null);
  const tools=background({soloCoda:true,ridotti:3});
  assert.equal(tools?.type,'context.compacted');assert.equal(tools.data.method,'tool-results');assert.equal(tools.durability,'durable');
  const images=background({soloCoda:true,immagini:2});
  assert.equal(images.data.method,'images');assert.equal(images.data.imagesReplaced,2);
  const summary=background({});
  assert.equal(summary?.type,'context.compacted');assert.equal('method' in summary.data,false,'a real end-of-turn summary stays a summary');
});

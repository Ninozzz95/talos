/*
 * 0.6.13 (kernel r4 a2739656d, the CLI's review 13 R13-1): a free summary named in a turn that then fails is annulled by the kernel
 * (`onGiro` `{tipo:'compattazione-annullata', at, coveredThrough, motivo:'giro-fallito'}`, the record's `at`). The CLI names each
 * compaction with that `at` and, on the annulment, takes the line back: the screen never says «Shortened older messages…» next to
 * an error that says «Nothing was summarized».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {CLI_EVENT,createCliEventHub,createRunObserver} from '../../src/runtime/provider-attempts.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

const AT='2026-10-23T21:10:05.123Z';
function observe(){
  const hub=createCliEventHub();const seen:any[]=[];
  hub.subscribe('s-1',(event:any)=>seen.push(event));
  const observer=createRunObserver({sessionId:'s-1',hub,readRequestedWait:null,baseFetch:async()=>new Response('{}')});
  return{observer,seen};
}

test('the observer names a compaction with its record `at`, and an annulment of a failed turn with the same `at`',()=>{
  const {observer,seen}=observe();
  observer.onCompaction({giro:2,tipo:'compattazione-inizio',motivo:'overflow',tokenMisurati:30_426});
  observer.onCompaction({giro:2,tipo:'compattazione-fine',compattato:true,ripiego:true,ragione:'bersaglio',record:{coveredThrough:12,tokenPrima:30_426,tokenDopo:26_155,at:AT,riassunto:[]}});
  observer.onCompaction({tipo:'compattazione-annullata',at:AT,coveredThrough:12,motivo:'giro-fallito'});
  const compacted=seen.find(event=>event?.name===CLI_EVENT.compacted)?.value;
  assert.equal(compacted?.at,AT);
  assert.deepEqual(seen.filter(event=>event?.name===CLI_EVENT.compactionUndone).map(event=>event.value),[{at:AT,reason:'turn-failed'}]);
});

test('an annulment the person asked for, or one without a valid time, is not this event',()=>{
  const {observer,seen}=observe();
  observer.onCompaction({tipo:'compattazione-annullata',at:AT,coveredThrough:12});
  observer.onCompaction({tipo:'compattazione-annullata',at:'yesterday',motivo:'giro-fallito'});
  observer.onCompaction({tipo:'compattazione-annullata',motivo:'giro-fallito'});
  assert.equal(seen.filter(event=>event?.name===CLI_EVENT.compactionUndone).length,0);
  observer.onCompaction({giro:3,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:9,tokenPrima:9_000,tokenDopo:6_000,at:'not a time',riassunto:[]}});
  assert.equal('at' in (seen.find(event=>event?.name===CLI_EVENT.compacted)?.value??{}),false,'only an ISO time is carried');
});

test('through v2 and the screen: the compaction line is drawn, then taken back when its turn fails',()=>{
  const bridge=createV2EventBridge('s-1',()=>'2026-10-23T21:10:06.000Z');
  const adapter=createTuiEventAdapter();adapter.bindSession('s-1');
  let model=createTranscriptModel();
  const feed=(raw:any)=>{const v2=bridge.translate(raw);if(!v2)return null;for(const event of adapter.translateAll(v2))model=reduceTranscriptEvent(model,event);return v2;};
  const compacted=feed({type:'CUSTOM',_sequenza:4,name:CLI_EVENT.compacted,value:{engine:'kernel',messagesSummarized:null,tokensBefore:30_426,tokensAfter:26_155,trigger:'automatic',method:'without-model',fallbackReason:'target',afterRefusal:true,at:AT}}) as any;
  assert.equal(compacted?.data?.at,AT);
  const other=feed({type:'CUSTOM',_sequenza:5,name:CLI_EVENT.compacted,value:{engine:'kernel',messagesSummarized:null,tokensBefore:20_000,tokensAfter:9_000,trigger:'automatic',at:'2026-10-23T21:00:00.000Z'}});
  assert.ok(other);
  const lines=()=>model.items.filter((item:any)=>item.kind==='warning').map((item:any)=>item.text);
  assert.equal(lines().filter(text=>/Shortened older messages without a model summary/u.test(text)).length,1);
  const undone=feed({type:'CUSTOM',_sequenza:6,name:CLI_EVENT.compactionUndone,value:{at:AT,reason:'turn-failed'}}) as any;
  assert.equal(undone?.type,'context.compaction.undone');assert.equal(undone.durability,'transient');assert.deepEqual(undone.data,{at:AT,reason:'turn-failed'});
  assert.equal(lines().filter(text=>/Shortened older messages without a model summary/u.test(text)).length,0,'its line is taken back');
  assert.equal(lines().filter(text=>/20k → 9k/u.test(text)).length,1,'another compaction stays');
  /* the kernel's own durable wire event of the same annulment draws nothing more */
  assert.equal(bridge.translate({type:'CUSTOM',_sequenza:7,name:'talos.compattazione',value:{fase:'annullata',at:AT,coveredThrough:12,motivo:'giro-fallito'}}),null);
});

/*
 * Review 14 R14-1 of 0.6.13: after `--resume`, a compaction made inside a turn was redrawn as «Context compacted by the kernel (at 75%
 * …): earlier messages summarized · token counts not reported», while live it had been named for what it was. The kernel's durable
 * `talos.compattazione` `fine` row has the facts; a replay names it from that row with the same words and numbers as live, once (as
 * Codex rebuilds the live `ContextCompaction` item from the persisted event on resume, app-server-protocol thread_history.rs:410,1186).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createCliEventHub,createRunObserver} from '../../src/runtime/provider-attempts.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

const AT='2026-10-24T21:24:05.047Z';
let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
const started=()=>durable({type:'RunStarted',runId:'r1'});
const finished=(compattazioni:number)=>durable({type:'RunFinished',runId:'r1',outcome:'concluso',result:{detto:'ok',compattazioni}});
const failed=()=>durable({type:'RunError',message:'The request is larger than the model context window (context_length_exceeded).',code:'PROVIDER_REQUEST_ERROR'});
/* the kernel's rows as the journal keeps them (agent-service.mjs `compattazione-fine`), measured in the reviewer's tui-undo-nonum.out */
const begin={type:'CUSTOM',name:'talos.compattazione',value:{fase:'inizio',giro:0,tokenPrima:19_117,soglia:200_000,motivo:'overflow'}};
const withoutModel={type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',giro:0,compattato:true,tokenPrima:19_117,tokenDopo:9_941,misura:'stimato',coveredThrough:16,at:AT,modello:'deepseek:x',motivo:'overflow',ripiego:true,ragione:'bersaglio',classe:'bersaglio'}};
const toolResults={type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',giro:1,compattato:true,tokenPrima:40_200,tokenDopo:22_100,misura:'stimato',coveredThrough:9,at:'2026-10-24T21:30:00.000Z',modello:'deepseek:x',motivo:'soglia',soloCoda:true,ridotti:3}};
const ruleK={type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',giro:0,compattato:true,tokenPrima:27_968,tokenDopo:19_117,misura:'stimato',coveredThrough:16,at:'2026-10-24T21:24:05.018Z',modello:'deepseek:x',motivo:'accorciati',messaggi:1,soloCoda:true}};
const undone=(at:string)=>({type:'CUSTOM',name:'talos.compattazione',value:{fase:'annullata',at,coveredThrough:16,motivo:'giro-fallito'}});

function screen(){
  const bridge=createV2EventBridge('s-1',()=>'2026-10-24T21:25:00.000Z');
  const adapter=createTuiEventAdapter();adapter.bindSession('s-1');
  let model=createTranscriptModel();const v2:any[]=[];
  const feed=(raw:any)=>{const event=bridge.translate(raw);if(event)v2.push(event);for(const tui of event?adapter.translateAll(event):[])model=reduceTranscriptEvent(model,tui);return event;};
  const lines=()=>model.items.filter((item:any)=>item.kind==='warning').map((item:any)=>item.text as string);
  return{feed,lines,v2};
}
/* live: the run's observer reads the adapter's `onGiro` report first (talos-composition.ts), then the kernel writes its journal row */
function live(report:Record<string,unknown>[],journal:any[],compattazioni:number){
  const view=screen();const hub=createCliEventHub();hub.subscribe('s-1',event=>{view.feed(event);});
  const observer=createRunObserver({sessionId:'s-1',hub,readRequestedWait:null,baseFetch:async()=>new Response('{}')});
  view.feed(started());
  report.forEach((row,i)=>{observer.onCompaction(row);if(journal[i])view.feed(durable(journal[i]));});
  view.feed(finished(compattazioni));
  return view;
}
function replay(journal:any[],end:any){const view=screen();for(const row of [started(),...journal.map(durable),end])view.feed(row);return view;}

test('a replay names a without-model compaction after a refusal with the words and numbers it had live, once',()=>{
  const now=live([{giro:0,tipo:'compattazione-inizio',motivo:'overflow',tokenMisurati:19_117},{giro:0,tipo:'compattazione-fine',compattato:true,ripiego:true,ragione:'bersaglio',record:{coveredThrough:16,tokenPrima:19_117,tokenDopo:9_941,at:AT,riassunto:[]}}],[begin,withoutModel],1);
  const line='Shortened older messages without a model summary (the provider said the conversation did not fit): 19.1k → 9.9k tokens · /context';
  assert.deepEqual(now.lines(),[line],'live: drawn once, though the journal row arrives too');
  assert.equal(now.v2.filter(event=>event.type==='context.compacted').length,1,'live v2 says it once');
  const after=replay([begin,withoutModel],finished(1));
  assert.deepEqual(after.lines(),[line],'after --resume: the same line, once');
  const named=after.v2.find(event=>event.type==='context.compacted');
  assert.equal(named?.durability,'durable');assert.equal(named?.data?.at,AT);assert.equal(named?.data?.afterRefusal,true);
});

test('a replay names a tool-results-only shortening as live, and rule K stays silent',()=>{
  const now=live([{giro:1,tipo:'compattazione-fine',compattato:true,soloCoda:true,ridotti:3,record:{coveredThrough:9,tokenPrima:40_200,tokenDopo:22_100,at:'2026-10-24T21:30:00.000Z',riassunto:[]}},
    {giro:0,tipo:'compattazione-fine',compattato:true,soloCoda:true,accorciati:1,record:{coveredThrough:16,tokenPrima:27_968,tokenDopo:19_117,at:'2026-10-24T21:24:05.018Z',riassunto:[]}}],[toolResults,ruleK],1);
  const after=replay([toolResults,ruleK],finished(1));
  assert.deepEqual(after.lines(),['Shortened older tool results for the model, nothing summarized: 40.2k → 22.1k tokens · /context']);
  assert.deepEqual(after.lines(),now.lines());
});

test('a compaction annulled by a failed turn is not drawn after --resume',()=>{
  const after=replay([begin,withoutModel,undone(AT)],failed());
  assert.deepEqual(after.lines().filter(text=>/Shortened|compacted/u.test(text)),[]);
  assert.ok(after.v2.some(event=>event.type==='context.compaction.undone'&&event.data?.at===AT),'v2 replays the annulment too');
});

test('a compaction the journal has no facts for is said neutrally: neither «summarized» nor «at 75%»',()=>{
  const after=replay([],finished(1));
  assert.deepEqual(after.lines(),['Context shortened for the model · token counts not reported · /context']);
});

/* 0.6.14 (owner 25/10/2026, «Con il numero»): a compaction the kernel made at its EMERGENCY threshold (compattazione-desktop.mjs
   decidiCompattazione, motivo 'emergenza': 90% of the window, 1.2× the threshold when the window is unknown) said «at 75% of the
   window», the normal rule, live and after --resume. It now says what started it. */
test('an emergency compaction says the emergency threshold, live and after --resume, and v2 carries emergency',()=>{
  const at='2026-10-25T12:00:00.000Z';
  const emergencyRow={type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',giro:2,compattato:true,tokenPrima:31_900,tokenDopo:9_900,misura:'stimato',coveredThrough:20,at,modello:'deepseek:x',motivo:'emergenza'}};
  const now=live([{giro:2,tipo:'compattazione-inizio',motivo:'emergenza',tokenMisurati:31_900},{giro:2,tipo:'compattazione-fine',compattato:true,record:{coveredThrough:20,tokenPrima:31_900,tokenDopo:9_900,at,riassunto:[]}}],[null,emergencyRow],1);
  /* judge v1541 (11/11/2026): «90% of the window» was false above 266,667 with the threshold cure; these rows carry no threshold, so the
     line is named without a number (linea-step3-emergency-line.test.ts has the one with it) */
  /* judge v1579: the text no longer says «1.2× its threshold», which was false when the window is known (0.9 of the window) */
  const line='Context compacted by the kernel at its emergency line: earlier messages summarized · 31.9k → 9.9k tokens · /context';
  assert.deepEqual(now.lines(),[line],'live');
  assert.equal(now.v2.find(event=>event.type==='context.compacted')?.data?.emergency,true);
  const after=replay([emergencyRow],finished(1));
  assert.deepEqual(after.lines(),[line],'after --resume');
  assert.equal(after.v2.find(event=>event.type==='context.compacted')?.data?.emergency,true);
});

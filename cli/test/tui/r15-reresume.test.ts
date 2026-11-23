/*
 * Review 15 R15-1 of 0.6.13: a `/resume <id>` of the session already open in the same TUI reused the adapter's v2 bridge
 * (session-controller.ts `attach` → `bindSession(id)`, same id). The bridge still knew the `at` of every journal row it had named,
 * so the redrawn screen skipped them: the neutral «token counts not reported» line came back instead of the words and numbers, and
 * the rows of failed turns (paid summaries kept, R10-7) vanished. A history attach redraws from the start, so it starts from a
 * fresh bridge (`bindSession(id,{fresh:true})`), as Codex rebuilds a resumed thread's turns from the persisted events each time
 * (app-server-protocol thread_history.rs, PR #14930 of 03/2026); a plain re-attach keeps it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

const AT='2026-10-24T21:24:05.047Z';
let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
const started=(runId:string)=>({type:'RunStarted',runId});
const finished=(runId:string,compattazioni:number)=>({type:'RunFinished',runId,outcome:'concluso',result:{detto:'ok',compattazioni}});
const failed=()=>({type:'RunError',message:'The request is larger than the model context window (context_length_exceeded).',code:'PROVIDER_REQUEST_ERROR'});
/* the kernel's journal rows (agent-service.mjs `compattazione-fine`), as in r14-compaction-replay.test.ts */
const withoutModel={type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',giro:0,compattato:true,tokenPrima:19_117,tokenDopo:9_941,misura:'stimato',coveredThrough:16,at:AT,modello:'deepseek:x',motivo:'overflow',ripiego:true,ragione:'bersaglio',classe:'bersaglio'}};
const paid=(at:string,prima:number,dopo:number)=>({type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',giro:0,compattato:true,tokenPrima:prima,tokenDopo:dopo,misura:'stimato',coveredThrough:8,at,modello:'deepseek:x',motivo:'soglia',messaggi:6}});
const brake={type:'CUSTOM',name:'talos.compattazione',value:{fase:'fine',compattato:false,motivo:'freno',freno:{colpi:2,at:'2026-10-24T21:40:00.000Z'}}};
/* the prep scene of the review: two failed turns whose paid summaries were kept, then a turn that ends well */
const journal=[started('r1'),paid('2026-10-24T21:10:00.000Z',52_000,18_000),failed(),started('r2'),paid('2026-10-24T21:20:00.000Z',48_500,17_200),failed(),
  started('r3'),withoutModel,brake,finished('r3',1)].map(durable);

/* one TUI: the same adapter for the whole test; every pass is a redrawn screen (app.ts `freshView()`) */
function tui(){
  const adapter=createTuiEventAdapter();
  const pass=(rows:readonly unknown[],fresh?:boolean)=>{
    adapter.bindSession('s-1',fresh?{fresh:true}:undefined);let model=createTranscriptModel();
    for(const row of rows)for(const event of adapter.translateAll(row))model=reduceTranscriptEvent(model,event);
    return model.items.filter((item:any)=>item.kind==='warning').map((item:any)=>item.text as string);
  };
  return{adapter,pass};
}
const named=(text:string)=>/→/u.test(text);

test('a second history replay of the open session redraws every compaction line as the first did, failed turns included',()=>{
  const {pass}=tui();
  const first=pass(journal,true);
  assert.equal(first.filter(named).length,3,`the three lines with numbers: ${JSON.stringify(first)}`);
  assert.ok(first.some(text=>text.startsWith('Shortened older messages without a model summary')&&text.includes('19.1k → 9.9k')),JSON.stringify(first));
  assert.ok(!first.some(text=>text.includes('token counts not reported')),'nothing neutral the first time');
  const second=pass(journal,true);
  assert.deepEqual(second,first,'the /resume of the open session: the same words, numbers and rows, once');
});

test('the brake pause is said once in each redrawn screen',()=>{
  const {pass}=tui();
  const isBrake=(text:string)=>/paus/iu.test(text);
  assert.equal(pass(journal,true).filter(isBrake).length,1,'first replay');
  assert.equal(pass(journal,true).filter(isBrake).length,1,'the /resume of the open session says it again, once');
});

test('a re-attach without history keeps the bridge: a journal row already named is not named twice',()=>{
  const {pass}=tui();
  assert.equal(pass([started('r3'),withoutModel].map(durable),true).filter(named).length,1);
  assert.deepEqual(pass([durable(withoutModel)]).filter(named),[],'same bridge, the row is known');
});

test('the controller: a /resume of the session already attached replays from a fresh bridge, a live re-attach does not',async()=>{
  const {createTuiSessionController}=await import('../../src/tui/session-controller.ts');
  const sinks=new Map<string,(raw:unknown)=>void>();
  const runtime:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s-1'}],export:()=>({eventi:[]}),resume:async(id:string)=>id,cancel:async()=>{},close:async()=>{},
    subscribe(id:string,sink:(raw:unknown)=>void,_from?:number,options?:{resultsForScreen?:boolean}){if(options?.resultsForScreen)for(const row of journal)sink(row);sinks.set(id,sink);return()=>sinks.delete(id);}};
  let model=createTranscriptModel();const screen=()=>model.items.filter((item:any)=>item.kind==='warning').map((item:any)=>item.text as string);
  const c=createTuiSessionController({runtime,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:(event:any)=>{model=reduceTranscriptEvent(model,event);}} as any);
  await c.resumeSession('s-1');const first=screen();model=createTranscriptModel();
  assert.equal(first.filter(named).length,3,JSON.stringify(first));
  await c.resumeSession('s-1');
  assert.deepEqual(screen(),first,'the second /resume says the same lines, once');
  model=createTranscriptModel();c.attach('s-1',journal.length);sinks.get('s-1')?.(durable(withoutModel));
  assert.deepEqual(screen().filter(named),[],'a live re-attach keeps the bridge');
  c.close();
});

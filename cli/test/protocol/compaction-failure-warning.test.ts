/*
 * 0.6.13, the compaction release (owner 21/10/2026, «sta maledetta compattazione»; the Desktop found D-MO-12 on the phone).
 * The kernel says a compaction that did not happen on CUSTOM `talos.compattazione` `{fase:'fine', compattato:false, motivo, codice?}`
 * (agent-service.mjs `compattazione-fine`; desktop-hotfix `ripiego` and `archivio-riallineato`; the base loop and the registry's
 * background compaction with the summary's reason). The v2 bridge dropped every one of them: a Context Engine that failed and the
 * simple compaction that took over were silent. Now each one is a durable, non-blocking English warning with a code and a reason
 * (Codex says a failed remote compaction and its local fallback as a warning, `core/src/session/turn.rs:221-229`; opencode keeps the
 * failure on the session, `packages/core/src/session/compaction.ts:638-646`). A compaction that DID happen is not said again here:
 * the CLI already counts it once (`talos.cli.context.compacted`, provider-attempts.ts). Nothing to compact, a superseded background
 * summary, a stop by the person and the background preparation stay silent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {compactionFailureWarning,createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent,type TranscriptModel} from '../../src/tui/transcript-model.ts';

const clock=()=>'2026-10-21T00:00:00.000Z';
const row=(value:Record<string,unknown>,name='talos.compattazione')=>({type:'CUSTOM',_sequenza:7,name,value});
const translate=(value:Record<string,unknown>,name?:string)=>createV2EventBridge('s1',clock).translate(row(value,name)) as any;
const ITALIAN=/compatt|riassunt|ripiego|riallineat|archivio|errore|esaurit|troncat|vuoto|salvat|motore/iu;

test('the Context Engine that failed and the simple compaction that took over: a durable warning with its code and reason',()=>{
  const event=translate({fase:'fine',giro:3,compattato:false,motivo:'ripiego',codice:'CTX_HISTORY_DIVERGED'});
  assert.equal(event?.type,'warning');
  assert.equal(event.durability,'durable','a warning is transient by default; this one is history and replays');
  assert.equal(event.data.code,'COMPACTION_FALLBACK');
  assert.equal(event.data.reason,'fallback');
  assert.equal(event.data.errorCode,'CTX_HISTORY_DIVERGED');
  assert.match(event.data.message,/Context Engine/u);
  assert.match(event.data.message,/\(CTX_HISTORY_DIVERGED\)/u);
  assert.match(event.data.message,/simple compaction/u);
  assert.doesNotMatch(event.data.message,ITALIAN);
});

test('a fallback without a code says so without empty brackets',()=>{
  const event=translate({fase:'fine',giro:3,compattato:false,motivo:'ripiego',codice:null});
  assert.equal(event.data.code,'COMPACTION_FALLBACK');
  assert.equal('errorCode' in event.data,false);
  assert.doesNotMatch(event.data.message,/\(\s*\)|null|undefined/u);
});

/* 0.6.13 release review S4-2 (22/10/2026): the Context Engine's in-turn summary has a ceiling (context-engine engine.mjs:432-442,
   CTX_COMPACTION_TIMEOUT) and the adapter then compacts without waiting (desktop-hotfix :1115). A planned outcome, not «failed». */
test('S4-2: a fallback after the summary took too long says so, with the same code, and never «failed»',()=>{
  const event=translate({fase:'fine',giro:3,compattato:false,motivo:'ripiego',codice:'CTX_COMPACTION_TIMEOUT'});
  assert.equal(event?.type,'warning');
  assert.equal(event.data.code,'COMPACTION_FALLBACK','no new warning code');
  assert.equal(event.data.reason,'fallback');
  assert.equal(event.data.errorCode,'CTX_COMPACTION_TIMEOUT');
  assert.match(event.data.message,/took too long/u);
  assert.match(event.data.message,/\(CTX_COMPACTION_TIMEOUT\)/u);
  assert.match(event.data.message,/simple compaction/u);
  assert.doesNotMatch(event.data.message,/failed/u);
  assert.doesNotMatch(event.data.message,ITALIAN);
});

test('S4-2: a fallback after the Context Engine job was cancelled (the person\'s Skip) says cancelled, never «failed»',()=>{
  const event=translate({fase:'fine',giro:3,compattato:false,motivo:'ripiego',codice:'CTX_JOB_CANCELLED'});
  assert.equal(event.data.code,'COMPACTION_FALLBACK');
  assert.equal(event.data.errorCode,'CTX_JOB_CANCELLED');
  assert.match(event.data.message,/was cancelled \(CTX_JOB_CANCELLED\)/u);
  assert.doesNotMatch(event.data.message,/failed/u);
  assert.doesNotMatch(event.data.message,ITALIAN);
});

/* 0.6.13 release review S4-1 (22/10/2026): the summariser's own reasons at kernel 06b9ed101 (compattazione-desktop.mjs:494-498):
   a tool call instead of a summary (`attrezzo`) and a refusal in prose (`rifiuto`) read «unknown»; the Italian `errore: <text>`
   form is an error as `error: <text>` is. */
test('S4-1: a summariser that answered with a tool call, or refused, is said with its own words; «errore: …» is an error',()=>{
  const cases:Array<[string,string,RegExp]>=[
    ['attrezzo','tool-call',/answered with a tool call instead of a summary/u],
    ['rifiuto','refused',/refused to write the summary/u],
    ['errore: socket hang up','error',/summary request failed/u],
  ];
  for(const [motivo,reason,said] of cases){
    const event=translate({fase:'fine',giro:2,compattato:false,motivo});
    assert.equal(event.data.code,'COMPACTION_FAILED',motivo);
    assert.equal(event.data.reason,reason,motivo);
    assert.match(event.data.message,said,motivo);
    assert.doesNotMatch(event.data.message,/did not come back/u,motivo);
    assert.doesNotMatch(event.data.message,ITALIAN,motivo);
    assert.doesNotMatch(event.data.message,/socket hang up/u,'the kernel text is not shown as the reason');
  }
  assert.equal(translate({fase:'fine',giro:2,compattato:false,motivo:'erroreX'}).data.reason,'unknown','only the exact `errore:` prefix');
});

test('the realigned Context Engine history is one line that stops nothing (owner 12/10)',()=>{
  const event=translate({fase:'fine',giro:6,compattato:false,motivo:'archivio-riallineato',codice:'CTX_HISTORY_DIVERGED',dettaglio:{posizione:4,ruolo:'tool'}});
  assert.equal(event?.type,'warning');
  assert.equal(event.data.code,'COMPACTION_HISTORY_REALIGNED');
  assert.equal(event.data.reason,'history-realigned');
  assert.equal(event.data.errorCode,'CTX_HISTORY_DIVERGED');
  assert.doesNotMatch(event.data.message,ITALIAN);
  assert.doesNotMatch(JSON.stringify(event.data),/posizione|ruolo/u,'the kernel detail stays out of the English protocol');
});

test('a summary that did not come is a failure, said plainly with its reason',()=>{
  const cases:Array<[Record<string,unknown>,string,RegExp]>=[
    [{motivo:'errore',codice:'PROVIDER_TIMEOUT'},'error',/\(PROVIDER_TIMEOUT\)/u],
    [{motivo:'esaurito',classe:'esaurito'},'retries-exhausted',/too many times/u],
    [{motivo:'troncato',interrottaIn:'riassunto'},'truncated',/cut off/u],
    [{motivo:'vuoto'},'empty',/empty summary/u],
    [{motivo:'non-salvata',interrottaIn:'sostituzione'},'not-saved',/could not be saved/u],
    [{motivo:'error: socket hang up'},'error',/summary request failed/u],
    [{motivo:'qualcosa-di-nuovo'},'unknown',/did not compact/u],
  ];
  for(const [value,reason,said] of cases){
    const event=translate({fase:'fine',giro:2,compattato:false,...value});
    assert.equal(event?.type,'warning',String(value.motivo));
    assert.equal(event.data.code,'COMPACTION_FAILED',String(value.motivo));
    assert.equal(event.data.reason,reason,String(value.motivo));
    assert.match(event.data.message,/^TALOS did not compact the conversation/u,String(value.motivo));
    assert.match(event.data.message,said,String(value.motivo));
    assert.match(event.data.message,/keeps its whole context/u,String(value.motivo));
    assert.doesNotMatch(event.data.message,ITALIAN,String(value.motivo));
    assert.doesNotMatch(event.data.message,/socket hang up|qualcosa/u,'the kernel text is not shown as the reason');
  }
});

test('a compaction that happened is not counted twice, and the quiet cases stay quiet',()=>{
  assert.equal(translate({fase:'fine',giro:2,compattato:true,tokenPrima:9000,tokenDopo:2000,motivo:'soglia'}),null,'counted once by talos.cli.context.compacted');
  assert.equal(translate({fase:'fine',compattato:true,motivo:'manuale',tokenPrima:9000,tokenDopo:2000}),null);
  assert.equal(translate({fase:'inizio',giro:2,tokenPrima:9000,soglia:8000,motivo:'soglia'}),null);
  assert.equal(translate({fase:'fine',giro:2,compattato:false,motivo:'niente-da-compattare'}),null);
  assert.equal(translate({fase:'fine',compattato:false,motivo:'superata',interrottaIn:'sostituzione'}),null);
  assert.equal(translate({fase:'fine',compattato:false,motivo:'interrotta'}),null);
  /* r4 0ec393426 / d06f6a9d3: the summary that yielded the engine slot, and the close of the row while the engine summarised */
  assert.equal(translate({fase:'fine',compattato:false,motivo:'ceduta'}),null);
  assert.equal(translate({fase:'fine',compattato:false,motivo:'motore',origine:'motore'}),null);
  assert.equal(translate({fase:'fine',compattato:false,motivo:'nulla-da-ridurre'}),null,'r4: a row closed with nothing to reduce');
  assert.equal(translate({fase:'fine',compattato:false,motivo:'inefficace',interrottaIn:'sostituzione'}),null,'r4: an end-of-turn summary that would not reduce');
  assert.equal(translate({fase:'fine',giro:2,compattato:false,motivo:'errore',interrottaIn:'riassunto'},'talos.compattazione-preparata'),null,'a background preparation that failed: the turn compacts in front when it needs to');
  assert.equal(translate({fase:'inizio',motivo:'precalcolo',tokenMisurati:9000},'talos.compattazione-preparata'),null);
  assert.equal(compactionFailureWarning(null),null);
});

function feed(...records:Array<Record<string,unknown>>){
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const bridge=createV2EventBridge('s1',clock);
  const events:TuiEvent[]=[];let model:TranscriptModel=createTranscriptModel();
  for(const record of records)for(const event of adapter.translateAll(bridge.translate(record))){events.push(event);model=reduceTranscriptEvent(model,event);}
  return{events,model};
}

test('the warning reaches the screen as one English line, and a replayed row is still one line',()=>{
  const failed=row({fase:'fine',giro:3,compattato:false,motivo:'ripiego',codice:'CTX_HISTORY_DIVERGED'});
  const {events,model}=feed(failed,failed);
  const warning=events.find(e=>e.type==='warning') as Extract<TuiEvent,{type:'warning'}>|undefined;
  assert.ok(warning,'the TUI receives the warning');
  assert.match(warning!.message,/Context Engine/u,'not replaced by the untranslated-notice sentence');
  const lines=model.items.filter(i=>i.kind==='warning');
  assert.equal(lines.length,1,'the same native row (same sequence) is one transcript line');
});

/* review 3 of 0.6.13 (S3-1): the registry's end-of-turn summary is a compaction, named from its durable event (owner Q-R5-4) */
test('an end-of-turn summary that compacted is named, durable, with its figures; a manual or in-turn end is not named here',()=>{
  const event=translate({fase:'fine',compattato:true,motivo:'background',tokenPrima:15_630,tokenDopo:1_048,coveredThrough:9,at:'2026-10-22T12:00:00.000Z'});
  assert.equal(event?.type,'context.compacted');
  assert.equal(event.durability,'durable','it is history: a replay names it where it happened');
  assert.deepEqual({engine:event.data.engine,trigger:event.data.trigger,tokensBefore:event.data.tokensBefore,tokensAfter:event.data.tokensAfter},{engine:'kernel',trigger:'automatic',tokensBefore:15_630,tokensAfter:1_048});
  assert.equal(translate({fase:'fine',compattato:true,motivo:'manuale',annullabile:true,tokenPrima:9,tokenDopo:3}),null,'/compact is named by the CLI itself');
  assert.equal(translate({fase:'fine',giro:4,compattato:true,tokenPrima:9,tokenDopo:3}),null,'an in-turn compaction is named from the adapter\'s onGiro');
});

/* r4, cure of the CLI's review 7 F6 (22/10/2026): a window smaller than TALOS's tools, the kept part and a summary pays nothing and
   is said once (the kernel dedupes per session and window), as a durable warning with the numbers it compared */
test('a window too small for the tools and the kept part: said with its numbers, nothing summarized, never quiet',()=>{
  const event=translate({fase:'fine',giro:0,compattato:false,motivo:'non-entra',finestra:8192,pavimento:9850});
  assert.equal(event?.type,'warning');
  assert.equal(event.durability,'durable');
  assert.equal(event.data.code,'COMPACTION_WINDOW_TOO_SMALL');
  assert.equal(event.data.reason,'window-too-small');
  assert.match(event.data.message,/window \(8,192 tokens\) is too small for TALOS’s tools and the part it always keeps \(about 9,850 tokens\), so nothing was summarized\. Choose a model with a larger window \(\/model\)\./u);
  assert.doesNotMatch(event.data.message,ITALIAN);
  const bare=compactionFailureWarning({fase:'fine',compattato:false,motivo:'non-entra'});
  assert.equal(bare?.code,'COMPACTION_WINDOW_TOO_SMALL');
  assert.match(bare!.message,/window is too small for TALOS’s tools/u,'without numbers it is still said');
});

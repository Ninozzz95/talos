/*
 * 0.6.13, «a request too large for the model» (owner 22/10/2026; contract with the Desktop of the same day). The kernel stops the
 * turn before any paid call with a RunError `code:'REQUEST_TOO_LARGE'` and `{tokensRichiesta, tokensCornice, finestra, fonte}`,
 * keeps the request in the journal as not sent (CUSTOM `talos.richiesta-non-inviata {at, indice}`), and says two new compaction
 * outcomes on `talos.compattazione` `fase:'fine'`: `accorciati` (quiet) and `freno` (a warning, once per arming). The kernel does not
 * emit them yet: these rows are the contract's, as the other protocol tests fake the kernel's events.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge,createV2RunResultAccumulator} from '../../src/protocol/v2/events.ts';
import {exitCodeForV2Result} from '../../src/protocol/v2/codec.ts';
import {createEventBridge} from '../../src/events/bridge.ts';

const clock=()=>'2026-10-22T00:00:00.000Z';
const runError=(extra:Record<string,unknown>={})=>({type:'RunError',_sequenza:9,runId:'r1',code:'REQUEST_TOO_LARGE',message:'The request is too large for this model.',
  messageChiave:'server.richiestaTroppoGrande',messageParams:{},tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima',...extra});
const compaction=(value:Record<string,unknown>)=>({type:'CUSTOM',_sequenza:5,name:'talos.compattazione',value:{fase:'fine',...value}});

test('(a) the RunError reaches run.failed with its code and the four numbers, durable, in English',()=>{
  const event=createV2EventBridge('s1',clock).translate(runError()) as any;
  assert.equal(event?.type,'run.failed');
  assert.equal(event.durability,'durable');
  assert.equal(event.data.runId,'r1');
  assert.equal(event.data.error.envelope.code,'REQUEST_TOO_LARGE');
  assert.deepEqual(event.data.error.requestTooLarge,{request:15600,frame:9000,window:16000,source:'estimate'});
  assert.match(event.data.error.message,/about 15,600 tokens; with the system and tools \(about 9,000\) it is over this model’s 16,000\. Nothing was summarized or sent\./u);
  assert.match(event.data.error.envelope.todo,/--attach-if-too-large/u,'the -p todo names the flag');
  assert.equal(event.data.error.envelope.where,null,'nowhere to look: the message is what to change');
});

test('(a) the provider\'s own count is said as the provider\'s; the numbers under `dati` are read too',()=>{
  const {tokensRichiesta:_r,tokensCornice:_c,finestra:_f,fonte:_s,...bare}=runError();
  const event=createV2EventBridge('s1',clock).translate({...bare,dati:{tokensRichiesta:20000,tokensCornice:4000,finestra:16000,fonte:'fornitore'}}) as any;
  assert.deepEqual(event.data.error.requestTooLarge,{request:20000,frame:4000,window:16000,source:'provider'});
  assert.match(event.data.error.message,/20,000 tokens, as the provider counts it; with the system and tools \(4,000\)[^.]*\. Nothing was summarized\.$/u);
  assert.doesNotMatch(event.data.error.message,/about/u);
});

test('(a) a number missing: no numbers are invented, the code and the sentence stay',()=>{
  const event=createV2EventBridge('s1',clock).translate(runError({finestra:undefined})) as any;
  assert.equal(event.data.error.envelope.code,'REQUEST_TOO_LARGE');
  assert.equal('requestTooLarge' in event.data.error,false);
  assert.equal(event.data.error.message,'The message is too large for this model. Nothing was summarized.');
});

test('(a) --json v2: the result keeps the code and the numbers, and exits 70 like the other typed run failures',()=>{
  const bridge=createV2EventBridge('s1',clock);const accumulator=createV2RunResultAccumulator();
  accumulator.add(bridge.translate({type:'RunStarted',_sequenza:1,runId:'r1',input:{consegna:'x'}})!);
  accumulator.add(bridge.translate(runError())!);
  const result=accumulator.result();
  assert.equal(result.ok,false);
  assert.equal(result.error?.envelope.code,'REQUEST_TOO_LARGE');
  assert.deepEqual(result.error?.requestTooLarge,{request:15600,frame:9000,window:16000,source:'estimate'});
  assert.equal(exitCodeForV2Result(result),70);
});

test('(a) v1: run.failed keeps REQUEST_TOO_LARGE and the numbers (the v1 cleaner drops every key with «token» in it)',()=>{
  const event=createEventBridge('s1',clock).translate(runError() as any) as any;
  assert.equal(event?.type,'run.failed');
  assert.equal(event.data.code,'REQUEST_TOO_LARGE');
  assert.equal('tokensRichiesta' in event.data,false,'the kernel key itself is still dropped');
  assert.deepEqual(event.data.requestTooLarge,{request:15600,frame:9000,window:16000,source:'estimate'});
  /* review 9 F8: the kernel's VALUE `fonte` goes out in English, beside or under `dati` (F-L-002's rule; keys are F-L-001) */
  assert.notEqual(event.data.fonte,'stima');
  const nested=createEventBridge('s1',clock).translate({...(runError() as any),fonte:'stima',dati:{fonte:'fornitore'},messageParams:{finestra:16000,fonte:'stima'}}) as any;
  assert.equal(nested.data.dati?.fonte,'provider');
  assert.equal(nested.data.fonte,'estimate');assert.equal(nested.data.messageParams?.fonte,'estimate');
  assert.doesNotMatch(JSON.stringify(nested.data),/"stima"|"fornitore"/u);
});

test('(a) the request kept as not sent is an additive durable request.not_sent with its index',()=>{
  const event=createV2EventBridge('s1',clock).translate({type:'CUSTOM',_sequenza:8,name:'talos.richiesta-non-inviata',value:{at:'2026-10-22T10:00:00.000Z',indice:12}}) as any;
  assert.equal(event?.type,'request.not_sent');
  assert.equal(event.durability,'durable','a replay must draw it again');
  assert.deepEqual(event.data,{index:12,at:'2026-10-22T10:00:00.000Z'});
  assert.deepEqual(event.cursor,{sessionId:'s1',sequence:8});
});

test('(c) `accorciati` is quiet in v2 and v1',()=>{
  for(const compattato of [false,true]){
    assert.equal(createV2EventBridge('s1',clock).translate(compaction({compattato,motivo:'accorciati',messaggi:2})),null,`v2 compattato:${compattato}`);
    assert.equal(createEventBridge('s1',clock).translate(compaction({compattato,motivo:'accorciati',messaggi:2}) as any),null,`v1 compattato:${compattato}`);
  }
});

test('(c) `freno` is one durable warning COMPACTION_PAUSED, said once per arming (v2)',()=>{
  const bridge=createV2EventBridge('s1',clock);
  const first=bridge.translate(compaction({compattato:false,motivo:'freno'})) as any;
  assert.equal(first?.type,'warning');
  assert.equal(first.durability,'durable');
  assert.equal(first.data.code,'COMPACTION_PAUSED');
  assert.equal(first.data.message,'Automatic summaries are paused: they were not making the conversation shorter. /compact forces one.');
  assert.equal(bridge.translate(compaction({compattato:false,motivo:'freno'})),null,'the same brake is not said twice');
  /* a compaction that happened re-arms: the next brake is a new one */
  bridge.translate(compaction({compattato:true,motivo:'background',tokenPrima:9000,tokenDopo:3000}));
  assert.equal((bridge.translate(compaction({compattato:false,motivo:'freno'})) as any)?.data?.code,'COMPACTION_PAUSED');
  bridge.translate({type:'CUSTOM',name:'talos.cli.context.compacted',value:{trigger:'manual'}});
  assert.equal((bridge.translate(compaction({compattato:false,motivo:'freno'})) as any)?.data?.code,'COMPACTION_PAUSED','/compact re-arms too');
  /* any compaction the kernel says happened re-arms, not only the end-of-turn one */
  assert.equal(bridge.translate(compaction({compattato:true})),null,'a compaction that happened is said elsewhere (talos.cli.context.compacted)');
  assert.equal((bridge.translate(compaction({compattato:false,motivo:'freno'})) as any)?.data?.code,'COMPACTION_PAUSED');
});

test('(c) `freno` once in v1 too, and on stderr in -p text (COMPACTION_WARNING_CODES)',async()=>{
  const {COMPACTION_WARNING_CODES}=await import('../../src/protocol/v2/events.ts');
  const bridge=createEventBridge('s1',clock);
  const first=bridge.translate(compaction({compattato:false,motivo:'freno'}) as any) as any;
  assert.equal(first?.data?.code,'COMPACTION_PAUSED');
  assert.equal(bridge.translate(compaction({compattato:false,motivo:'freno'}) as any),null);
  assert.equal(COMPACTION_WARNING_CODES.has('COMPACTION_PAUSED'),true);
});

test('(d) an unknown field of the compaction record (`freno:{colpi,mezzoAlVerdetto,at}`) breaks nothing',()=>{
  const event=createV2EventBridge('s1',clock).translate(compaction({compattato:false,motivo:'troncato',freno:{colpi:1,mezzoAlVerdetto:4000,at:'2026-10-22T10:00:00Z'}})) as any;
  assert.equal(event?.data?.code,'COMPACTION_FAILED');
  const background=createV2EventBridge('s1',clock).translate(compaction({compattato:true,motivo:'background',tokenPrima:9000,tokenDopo:3000,freno:{colpi:0,mezzoAlVerdetto:null,at:null}})) as any;
  assert.equal(background?.type,'context.compacted');
  assert.equal(background.data.tokensBefore,9000);
});

/* review 9 F3 of 0.6.13: with `allegabile:false` the todo does not advise the flag that would fail the same way */
test('not attachable: the todo says to shorten it or change model, never the attachment flag',async()=>{
  const {describeError}=await import('../../src/i18n/error-view.ts');
  const view=describeError({code:'REQUEST_TOO_LARGE',message:'x',dati:{tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima',allegabile:false}});
  assert.match(view.todo??'',/Not even as an attachment does it fit this model: shorten it, or choose a model with a larger window/u);
  assert.doesNotMatch(view.todo??'',/--attach-if-too-large/u);
  const attachable=describeError({code:'REQUEST_TOO_LARGE',message:'x',dati:{tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima',allegabile:true}});
  assert.match(attachable.todo??'',/--attach-if-too-large/u,'when it can be attached the flag is still advised');
});

/* Z piece D (r4 ab2f70f59, 23/10/2026): `freno.at` is the pull's identity. A paid summary does not re-arm the kernel's brake; a new
   pull (after a grown middle, a new model or window, or /compact) has a new `at`, and only that is said again */
test('Z D: the brake is said once per pull (freno.at), whatever happens between, and worded by perche',()=>{
  for(const make of [()=>createV2EventBridge('s1',clock),()=>createEventBridge('s1',clock)]){
    const bridge=make() as any;
    const brake=(at:string,perche?:string)=>bridge.translate(compaction({compattato:false,motivo:'freno',...(perche?{perche}:{}),freno:{colpi:2,mezzoAlVerdetto:4000,at}}));
    const first=brake('2026-10-23T10:00:00.000Z','colpi');
    assert.equal(first?.data?.code,'COMPACTION_PAUSED');
    assert.equal(first.data.message,'Automatic summaries are paused: the last ones did not make the conversation shorter. /compact forces one.');
    assert.equal(brake('2026-10-23T10:00:00.000Z','colpi'),null,'the same pull is not said twice');
    /* a compaction that happened in between (a model-free one, or the CLI's own fact) is not a new pull */
    bridge.translate(compaction({compattato:true,motivo:'background',tokenPrima:9000,tokenDopo:3000}));
    bridge.translate({type:'CUSTOM',name:'talos.cli.context.compacted',value:{trigger:'automatic'}});
    assert.equal(brake('2026-10-23T10:00:00.000Z','colpi'),null,'nothing but a new at says it again');
    const second=brake('2026-10-23T11:00:00.000Z','ricariche');
    assert.equal(second?.data?.message,'Automatic summaries are paused: the conversation filled up again right after each one. /compact forces one.');
    assert.equal(brake('2026-10-23T11:00:00.000Z','ricariche'),null);
  }
});

/* review 11 R11-8 (r4): on the refusal path the kernel's `pavimento` includes the room kept for the answer (`riserva`, additive);
   the words say so, and without it they stay as before */
test('«window too small» names the room for the answer when the floor includes it',()=>{
  const said=(value:Record<string,unknown>)=>(createV2EventBridge('s1',clock).translate(compaction({compattato:false,motivo:'non-entra',finestra:8192,pavimento:9000,...value})) as any)?.data?.message;
  assert.equal(said({riserva:800}),'This model’s window (8,192 tokens) is too small for TALOS’s tools, the part it always keeps and room for the answer (about 9,000 tokens), so nothing was summarized. Choose a model with a larger window (/model).');
  assert.match(said({}),/too small for TALOS’s tools and the part it always keeps \(about 9,000 tokens\)/u);
  assert.match(said({riserva:0}),/too small for TALOS’s tools and the part it always keeps \(about/u,'no reserve, no words for it');
});

/* review 13 of 0.6.13 (r4, the R13-1 cure): `riserva`, the room kept for the answer, travels with the numbers; without it
   «11,005 + 11,628 over 24,000» read as a sum that fits. Read wherever the kernel puts it, said on -p, v2 and the dialog. */
test('REQUEST_TOO_LARGE with `riserva`: the room for the answer is said, and the parts add up past the window',async()=>{
  const row=runError({tokensRichiesta:11005,tokensCornice:11628,finestra:24000,fonte:'fornitore',riserva:2000,allegabile:true});
  const event=createV2EventBridge('s1',clock).translate(row) as any;
  assert.deepEqual(event.data.error.requestTooLarge,{request:11005,frame:11628,window:24000,source:'provider',attachable:true,reserve:2000});
  assert.equal(event.data.error.message,'The message is too large for this model: 11,005 tokens, as the provider counts it; with the system and tools (11,628) and room for the answer (2,000) it is over this model’s 24,000. Nothing was summarized.');
  /* the screen describes the v2 error again, from its English `requestTooLarge` */
  const {describeError}=await import('../../src/i18n/error-view.ts');
  assert.match(describeError(event.data.error,{screen:true}).what,/and room for the answer \(2,000\) it is over this model’s 24,000/u);
  const nested=createV2EventBridge('s1',clock).translate(runError({tokensRichiesta:undefined,tokensCornice:undefined,finestra:undefined,fonte:undefined,dati:{tokensRichiesta:11005,tokensCornice:11628,finestra:24000,fonte:'stima',riserva:2000}})) as any;
  assert.equal(nested.data.error.requestTooLarge.reserve,2000,'under `dati` too');
  assert.match(nested.data.error.message,/about 11,005 tokens; with the system and tools \(about 11,628\) and room for the answer \(2,000\)/u);
  const v1=createEventBridge('s1',clock).translate(row as any) as any;
  assert.equal(v1.data.requestTooLarge.reserve,2000);
  const {requestTooLargeDetail}=await import('../../src/tui/overlays/request-too-large.ts');
  assert.match(requestTooLargeDetail({request:11005,frame:11628,window:24000,source:'estimate',reserve:2000}),/^About 11,005 tokens; with the system and tools \(about 11,628\) and room for the answer \(2,000\) it is over this model’s 24,000\./u);
  const none=createV2EventBridge('s1',clock).translate(runError({riserva:0})) as any;
  assert.equal('reserve' in none.data.error.requestTooLarge,false,'no reserve, no words for it');
  assert.doesNotMatch(none.data.error.message,/room for the answer/u);
});

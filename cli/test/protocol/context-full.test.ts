/*
 * 0.6.13 Z piece C (r4 8b8d1133c, the Z-K1 cure of 23/10/2026): a provider's «too long» that the kernel could not shrink away ends
 * the run with `classificazione:'contesto-pieno'` and `contestoPieno:{scalino, bersaglio, numeri?, esauriti?}` at the top of the
 * RunError. The rows below are the Desktop's raw examples (ESEMPI-Z-7ea1e0dc4-2026-10-23.json 5a/5b) on the RunError as the CLI
 * measured it on the built CLI (code PROVIDER_REQUEST_ERROR, classe `contesto`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge,createV2RunResultAccumulator} from '../../src/protocol/v2/events.ts';
import {createEventBridge} from '../../src/events/bridge.ts';
import {describeError} from '../../src/i18n/error-view.ts';
import {safeTalosFailure} from '../../src/errors.ts';
import {contextFullOf} from '../../src/runtime/context-full.ts';

const clock=()=>'2026-10-23T00:00:00.000Z';
const runError=(extra:Record<string,unknown>={})=>({type:'RunError',_sequenza:9,runId:'r1',code:'PROVIDER_REQUEST_ERROR',classe:'contesto',
  /* the message the built CLI received on 23/10/2026 (runtime-owner-adapter erroreFornitorePubblico, class contesto) */
  message:'The request is larger than the model context window (context_length_exceeded).',...extra});
const withNumbers={classificazione:'contesto-pieno',contestoPieno:{scalino:1,bersaglio:921,numeri:{richiesti:993,massimo:1024,uscita:null}}};
const exhaustedNoNumbers={classificazione:'contesto-pieno',contestoPieno:{scalino:3,bersaglio:1724,esauriti:true}};

test('the diagnosis is read on the RunError, in English, and nothing is invented',()=>{
  assert.deepEqual(contextFullOf(runError(withNumbers)),{step:1,target:921,numbers:{requested:993,maximum:1024,output:null}});
  assert.deepEqual(contextFullOf(runError(exhaustedNoNumbers)),{step:3,target:1724,exhausted:true});
  assert.deepEqual(contextFullOf({dati:{contestoPieno:{scalino:0,bersaglio:null}}}),{step:0,target:null},'under `dati` too');
  assert.deepEqual(contextFullOf({contextFull:{step:2,target:500,numbers:{requested:9000,maximum:8192,output:1024},exhausted:true}}),{step:2,target:500,numbers:{requested:9000,maximum:8192,output:1024},exhausted:true});
  assert.equal(contextFullOf(runError()),null,'no diagnosis, none made up');
  assert.equal(contextFullOf(runError({contestoPieno:{bersaglio:900}})),null,'no step: nothing');
  assert.deepEqual(contextFullOf(runError({contestoPieno:{scalino:1,numeri:{richiesti:993}}})),{step:1,target:null},'a half pair of numbers is dropped');
});

test('v2 run.failed: `contextFull` in English, and the words say whether it was shortened, with the provider’s numbers',()=>{
  const live=createV2EventBridge('s1',clock).translate(runError(withNumbers)) as any;
  assert.equal(live?.type,'run.failed');
  assert.deepEqual(live.data.error.contextFull,{step:1,target:921,numbers:{requested:993,maximum:1024,output:null}});
  /* review 10 R10-8: step 1 = shortened and sent again, so «even after shortening it»; step 0 with numbers was never shortened */
  assert.equal(live.data.error.message,'The conversation is too long for this model even after shortening it (the provider counted 993 tokens; its maximum is 1,024).');
  const first=createV2EventBridge('s1',clock).translate(runError({contestoPieno:{...withNumbers.contestoPieno,scalino:0}})) as any;
  assert.equal(first.data.error.message,'The conversation is too long for this model (the provider counted 993 tokens; its maximum is 1,024).');
  assert.equal(live.data.error.envelope.todo,'Start a new conversation, or switch to a model with a larger window (/model).');
  const spent=createV2EventBridge('s1',clock).translate(runError({...withNumbers,contestoPieno:{...withNumbers.contestoPieno,esauriti:true}})) as any;
  assert.equal(spent.data.error.message,'The conversation is too long for this model even after shortening it (the provider counted 993 tokens; its maximum is 1,024).');
  const bare=createV2EventBridge('s1',clock).translate(runError(exhaustedNoNumbers)) as any;
  assert.equal(bare.data.error.message,'The conversation is too long for this model even after shortening it.');
  /* the frame alone over the window (the Desktop, 23/10/2026): step 0, no `esauriti`, nothing was shortened: never «even after» */
  const frameAlone=createV2EventBridge('s1',clock).translate(runError({classificazione:'contesto-pieno',contestoPieno:{scalino:0,bersaglio:1500,esauriti:false}})) as any;
  assert.deepEqual(frameAlone.data.error.contextFull,{step:0,target:1500});
  assert.equal(frameAlone.data.error.message,'The conversation is too long for this model.');
  const before=createV2EventBridge('s1',clock).translate(runError()) as any;
  assert.equal(before.data.error.message,'The conversation is too long for this model.','without a diagnosis, the words of before');
  assert.equal('contextFull' in before.data.error,false);
  assert.doesNotMatch(JSON.stringify(live.data),/contesto-pieno/u);
});

test('--json v2 result, the failure envelope, a later describe of the v2 error and the screen keep it',async()=>{
  const bridge=createV2EventBridge('s1',clock);const accumulator=createV2RunResultAccumulator();
  accumulator.add(bridge.translate({type:'RunStarted',_sequenza:1,runId:'r1',input:{consegna:'x'}})!);
  const failed=bridge.translate(runError({...exhaustedNoNumbers}))!;accumulator.add(failed);
  assert.deepEqual(accumulator.result().error?.contextFull,{step:3,target:1724,exhausted:true});
  assert.deepEqual(safeTalosFailure(runError(withNumbers)).contextFull,{step:1,target:921,numbers:{requested:993,maximum:1024,output:null}});
  const again=describeError((failed as any).data.error);
  assert.equal(again.what,'The conversation is too long for this model even after shortening it.','a later describe reads the English field');
  /* the screen: the v2 event through the TUI's adapter, which describes the error again */
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const screen=adapter.translateAll(failed).find((event:any)=>event.type==='run.failed') as any;
  assert.match(screen?.message??'',/^The conversation is too long for this model even after shortening it\./u);
  assert.match(screen.message,/switch to a model with a larger window \(\/model\)/u);
});

test('v1 run.failed: `contextFull` in English, and the kernel’s own new keys are not added (review 10 R10-11)',()=>{
  const event=createEventBridge('s1',clock).translate(runError(withNumbers) as any) as any;
  assert.equal(event?.type,'run.failed');
  assert.deepEqual(event.data.contextFull,{step:1,target:921,numbers:{requested:993,maximum:1024,output:null}});
  assert.equal('contestoPieno' in event.data,false);
  assert.equal('classificazione' in event.data,false);
  assert.doesNotMatch(JSON.stringify(event.data),/"contesto-pieno"|"contesto"|scalino|bersaglio|richiesti|massimo/u);
});

/* review 10 R10-1: an envelope that keeps the kernel's class only in its `details` (the v1 json `error.details`) is worded by it */
test('a failure envelope with the class only in its details is still «too long»',()=>{
  for(const classe of ['context','contesto']){
    const view=describeError({envelope:{code:'PROVIDER_REQUEST_ERROR',component:'runtime',retryable:false,traceId:'t',details:{classe,stato:400}},message:'x'});
    assert.equal(view.what,'The conversation is too long for this model.',classe);
  }
});

/* review 10 R10-10: the --json v2 result keeps the facts the run.failed event carries */
test('--json v2 result: providerClass and status ride with the error',()=>{
  const bridge=createV2EventBridge('s1',clock);const accumulator=createV2RunResultAccumulator();
  accumulator.add(bridge.translate({type:'RunStarted',_sequenza:1,runId:'r1',input:{consegna:'x'}})!);
  accumulator.add(bridge.translate(runError({stato:400}))!);
  const error=accumulator.result().error as any;
  assert.equal(error?.providerClass,'context');
  assert.equal(error?.status,400);
});

/* review 10 R10-12: the screen has no --model flag; `talos -p` keeps it */
test('a message that cannot be attached: the screen names /model only, -p also --model',()=>{
  const row={code:'REQUEST_TOO_LARGE',message:'x',dati:{tokensRichiesta:9602,tokensCornice:2354,finestra:4096,fonte:'stima',allegabile:false}};
  assert.doesNotMatch(describeError(row,{screen:true}).todo??'',/--model/u);
  assert.match(describeError(row,{screen:true}).todo??'',/\(\/model\)\.$/u);
  assert.match(describeError(row).todo??'',/--model/u);
});

test('a 401 or any other class never takes the context-full words',()=>{
  const view=describeError({code:'PROVIDER_REQUEST_ERROR',classe:'credenziale',stato:401,message:'x',...withNumbers});
  assert.doesNotMatch(view.what,/too long/u);
});

/* 0.6.13 Z review (measured on the built CLI 23/10/2026): the screen describes the v2 error again; the kernel's provider class now
   rides on it in English, so a «too long» is not read as «did not accept», and Z.AI's empty balance on 429 is not a rate limit */
test('the screen keeps the provider class of the failure: context and credit',async()=>{
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const onScreen=(row:Record<string,unknown>)=>{
    const failed=createV2EventBridge('s1',clock).translate(row) as any;
    const adapter=createTuiEventAdapter();adapter.bindSession('s1');
    return{v2:failed.data.error,screen:(adapter.translateAll(failed).find((event:any)=>event.type==='run.failed') as any)?.message??''};
  };
  const context=onScreen(runError());
  assert.equal(context.v2.providerClass,'context');
  assert.match(context.screen,/^The conversation is too long for this model\./u);
  const credit=onScreen({type:'RunError',_sequenza:9,runId:'r1',code:'PROVIDER_REQUEST_ERROR',classe:'credito',stato:429,message:'Credito esaurito presso il fornitore.'});
  assert.equal(credit.v2.providerClass,'credit');
  assert.doesNotMatch(credit.screen,/too many requests|rate/iu);
  const {t}=await import('../../src/i18n/index.ts');
  assert.ok(credit.screen.startsWith(t('error.provider.credit.what')),credit.screen);
  const unknown=onScreen({type:'RunError',_sequenza:9,runId:'r1',code:'PROVIDER_REQUEST_ERROR',classe:'invented',message:'x'});
  assert.equal('providerClass' in unknown.v2,false,'an unknown class is not passed on');
});

/* review 10 R10-1 of 0.6.13 (S2): `talos -p` in text renders the failure (safeTalosFailure), whose kernel class sits in
   `envelope.details` (already English from the v1 bridge, or the kernel's own); the words were «did not accept the request» */
test('talos -p text: a context-full failure says «too long», with or without the diagnosis',async()=>{
  const {renderTalosFailureLine}=await import('../../src/errors.ts');
  const lines=(row:Record<string,unknown>)=>renderTalosFailureLine(safeTalosFailure(row));
  for(const classe of ['contesto','context']){
    const bare=lines(runError({classe}));
    assert.match(bare,/^Error: The conversation is too long for this model\.\n/u,`classe ${classe}: ${bare}`);
    assert.doesNotMatch(bare,/did not accept/u);
  }
  const spent=lines(runError({...exhaustedNoNumbers}));
  assert.match(spent,/^Error: The conversation is too long for this model even after shortening it\.\nStart a new conversation, or switch to a model with a larger window \(\/model\)\./u,spent);
  /* the same through the event a -p run really fails with (v1 run.failed data, as main.ts hands it on) */
  const v1=createEventBridge('s1',clock).translate(runError(withNumbers) as any) as any;
  const viaEvent=renderTalosFailureLine(safeTalosFailure(v1.data));
  assert.match(viaEvent,/^Error: The conversation is too long for this model even after shortening it \(the provider counted 993 tokens; its maximum is 1,024\)\./u,viaEvent);
});

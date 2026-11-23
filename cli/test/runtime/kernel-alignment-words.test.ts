/* The block of the alignment (form A1, A2, A8): what the kernel's new contracts say on the CLI's screen, in words, never a raw code. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {describeError} from '../../src/i18n/error-view.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {continuationWords} from '../../src/runtime/provider-attempts.ts';
import {activityHeader} from '../../src/tui/activity-line.ts';
import {EMPTY_PULSE,reducePulse} from '../../src/tui/activity-pulse.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';

const clock=()=>'2026-11-03T00:00:00.000Z';
const kernel=(message:string,code:string)=>Object.assign(new Error(message),{code});

test('A8: each continuation says its own reason; only the output limit says output limit',()=>{
  const said=(motivo:unknown,fields:Record<string,unknown>={})=>continuationWords({tipo:'continuazione',motivo,tentativo:1,tentativiMassimi:1,...fields});
  assert.match(String(said('tetto-uscita',{tentativo:2,tentativiMassimi:3})),/hit the model's output limit: TALOS asked the model to continue \(2 of 3\)/u);
  assert.match(String(said('silenzio')),/stopped sending the answer midway/u);
  assert.match(String(said('comando-rosso')),/last command failed/u);
  assert.match(String(said('prova-rossa')),/test was still failing/u);
  for(const motivo of ['comando-rosso','prova-rossa','silenzio','motivo-di-domani',undefined])assert.doesNotMatch(String(said(motivo)),/output limit/u,String(motivo));
  assert.match(String(said('motivo-di-domani')),/TALOS asked the model to continue/u,'an unknown reason gets the neutral sentence');
  assert.doesNotMatch(String(said('comando-rosso')),/\d of \d/u,'one reopening only: no count to say');
  assert.equal(continuationWords({tipo:'altro'}),null);
});

test('decision 245: a push after a stop for the context says nothing; every other reopening still does',()=>{
  const said=(motivo:unknown)=>continuationWords({tipo:'continuazione',motivo,tentativo:1,tentativiMassimi:1});
  assert.equal(said('fermata-contesto'),null,'zero notices: the PC writes it to the journal only');
  for(const motivo of ['tetto-uscita','silenzio','comando-rosso','prova-rossa','motivo-di-domani'])assert.equal(typeof said(motivo),'string',motivo);
});

test('A1: a local model that cannot see says so in words, with what to do, never the raw code',()=>{
  const view=describeError(kernel('This local model cannot see images: it was opened without the part that reads them.','LOCAL_MODEL_NO_VISION'));
  assert.equal(view.code,'LOCAL_MODEL_NO_VISION');
  assert.match(view.what,/cannot see images/u);
  assert.match(String(view.todo),/without the image|\/model/u);
  assert.doesNotMatch(`${view.what} ${view.todo}`,/LOCAL_MODEL_NO_VISION/u);
});

test('A2: a summary model that cannot be used is one durable warning with its code, one sentence per reason',()=>{
  const row=(value:Record<string,unknown>)=>createV2EventBridge('s',clock).translate({type:'CUSTOM',_sequenza:1,name:'talos.riassunto-modello-inutilizzabile',value:{modello:'vendor/light',scelto:'sistema',...value}} as any) as any;
  const sentences=new Set<string>();
  for(const motivo of ['non-trovato','senza-chiave','accesso-negato','non-configurato']){
    const event=row({motivo});
    assert.equal(event.type,'warning');assert.equal(event.durability,'durable');assert.equal(event.data.code,'SUMMARY_MODEL_UNUSABLE');
    assert.match(event.data.message,/vendor\/light/u);sentences.add(event.data.message);
  }
  assert.equal(sentences.size,4);
  assert.match(row({motivo:'motivo-di-domani'}).data.message,/can't be used/u);
  const noName=row({modello:'',motivo:'non-trovato'});assert.doesNotMatch(noName.data.message,/  |undefined|null/u);
});

test('C6-bis: the two shapes of non-disponibile: a summary not written is said, one written without the model is no failure',()=>{
  const bridge=createV2EventBridge('s',clock);
  const failed=bridge.translate({type:'CUSTOM',_sequenza:1,name:'talos.compattazione',value:{fase:'fine',compattato:false,motivo:'non-disponibile',nonDisponibile:{modello:'m',stato:'bloccato',motivo:'limite'}}} as any) as any;
  assert.equal(failed.type,'warning');assert.match(failed.data.message,/not available right now and no backup/u);
  assert.equal(bridge.translate({type:'CUSTOM',_sequenza:2,name:'talos.compattazione',value:{fase:'fine',compattato:true,ripiego:true,ragione:'non-disponibile'}} as any)?.type==='warning',false);
});

test('A2: a prepared compaction stays silent: it is a preparation, not a compaction',()=>{
  const bridge=createV2EventBridge('s',clock);
  assert.equal(bridge.translate({type:'CUSTOM',_sequenza:1,name:'talos.compattazione-preparata',value:{fase:'preparata'}} as any),null);
  assert.equal(bridge.translate({type:'CUSTOM',_sequenza:2,name:'talos.compattazione-preparata',value:{fase:'non-arriva'}} as any),null);
});

test('A6: the kernel\'s beat while the model reasons is a live row: the title shows, the model is not silent, and it leaves with the first text or tool',()=>{
  const bridge=createV2EventBridge('s',clock);
  const beat=(titolo?:unknown)=>bridge.translate({type:'CUSTOM',name:'talos.ragionamento-in-corso',value:{giro:1,at:'x',...(titolo===undefined?{}:{titolo})}} as any) as any;
  const event=beat('Reading\u001b[31m the tests');
  assert.equal(event.type,'reasoning.pulse');assert.equal(event.durability,'transient');
  assert.doesNotMatch(event.data.title,/\u001b/u,'the title is the model\'s text: never a control sequence on the terminal');
  assert.equal(beat().data.title,undefined,'the title is optional');
  const adapter=createTuiEventAdapter();adapter.bindSession('s');
  const adapted=adapter.translate({type:'CUSTOM',name:'talos.ragionamento-in-corso',value:{giro:1,at:'x',titolo:'Reading the tests'}} as any) as any;assert.equal(adapted.type,'reasoning.pulse');
  const base=reduceTuiEvent(initialTuiState({model:'m',permissionMode:'default'}),{type:'run.started',sessionId:'s'} as any);
  const thinking=reduceTuiEvent(base,adapted);
  assert.match(thinking.reasoningTitle??'',/Reading/u);
  const live={kind:'thinking'} as any;
  assert.match(activityHeader(thinking as any,live),/Reading/u);
  assert.equal(reduceTuiEvent(thinking,{type:'message.delta',messageId:'m',delta:'hi'} as any).reasoningTitle,null);
  assert.equal(reduceTuiEvent(thinking,{type:'tool.started',toolCallId:'t',toolName:'read'} as any).reasoningTitle,null);
  const pulse={...EMPTY_PULSE,modelWaitSince:1_000};
  const heard=reducePulse(pulse,{tools:[],approval:null},adapted,40_000);
  assert.equal(heard.modelWaitSince,40_000,'a model that reasons is not a silent model');assert.equal(heard.tokens,0);
});

test('A6 corrected by the Mobile: the end of an engine wait is accounting, not a row',()=>{
  const bridge=createV2EventBridge('s',clock);
  assert.equal(bridge.translate({type:'CUSTOM',_sequenza:1,name:'talos.attesa-del-motore',value:{schema:'talos.attesa-del-motore.v1',inizioAt:'a',at:'b',esito:'pronto'}} as any),null);
});

test('A9: the kernel\'s newer Italian word for tools is recognised as Italian, like the old one, and never reaches the screen',()=>{
  assert.equal(looksItalian('strumento'),true);assert.equal(looksItalian('strumenti'),true);
  assert.equal(looksItalian('attrezzo'),true);assert.equal(looksItalian('The tool is not available'),false);
});

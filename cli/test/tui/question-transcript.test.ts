/*
 * Stage 3 (owner 01-02/10, registro 12): the model's questions reach the screen's events, and what the person did with them
 * stays in the transcript as the approved mockup shows it — «◆ Your answers» with one row per question (golden frame
 * cmd-* at 120×40: «    Fix  Wait for the cookie», title dim), a dim notice when the person cancelled or nobody answered in
 * time, and nothing extra when the system closed them (stop, new message, redirect: their own action says it).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {answersRows,type TranscriptAnswersItem} from '../../src/tui/components/question-receipt.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';

const QUESTIONS=[
 {id:'fix',header:'Fix',question:'How should the test wait for the session?',options:[{label:'Wait for the cookie',description:'a'},{label:'Shorten the retry',description:'b'}]},
 {id:'scope',header:'Verify',question:'Which checks?',multiSelect:true,options:[{label:'Login e2e, 10 runs',description:'a'},{label:'All auth unit tests',description:'b'}]},
 {id:'commit_now',question:'Commit?',options:[{label:'Commit locally',description:'a'},{label:'Leave it uncommitted',description:'b'}]}];

function feed(...records:Array<Record<string,unknown>>){
  const adapter=createTuiEventAdapter();adapter.bindSession('s-1');
  const bridge=createV2EventBridge('s-1',()=>'2026-10-02T12:00:00.000Z');
  const events:TuiEvent[]=[];let model:TranscriptModel=createTranscriptModel();
  for(const record of records)for(const event of adapter.translateAll(bridge.translate(record))){events.push(event);model=reduceTranscriptEvent(model,event);}
  return{events,model};
}
const asked={type:'UserQuestionRequested',requestId:'q-1',questions:QUESTIONS,toolCallId:'call_ask',origine:{modalita:'normale',agente:'principale'},ripristinabile:true};

test('the screen gets the question and its close as events of their own',()=>{
  const {events}=feed(asked,{type:'UserQuestionResolved',requestId:'q-1',status:'answered',answers:{fix:'Wait for the cookie'},skipped:['scope','commit_now'],notes:{fix:'small'},da:'persona'});
  const required=events.find(e=>e.type==='question.required') as Extract<TuiEvent,{type:'question.required'}>;
  assert.equal(required.requestId,'q-1');assert.equal(required.toolCallId,'call_ask');
  assert.deepEqual(required.questions,QUESTIONS);
  assert.deepEqual(required.origin,{mode:'normal',agent:'root'});
  const resolved=events.find(e=>e.type==='question.resolved') as Extract<TuiEvent,{type:'question.resolved'}>;
  const {requestId,status,answers,skipped,notes,by}=resolved;
  assert.deepEqual({requestId,status,answers,skipped,notes,by},{requestId:'q-1',status:'answered',answers:{fix:'Wait for the cookie'},skipped:['scope','commit_now'],notes:{fix:'small'},by:'person'});
});

test('answered: «Your answers» with each question\'s title and answer; skipped says skipped; a multiple answer is joined',()=>{
  const {model}=feed(asked,{type:'UserQuestionResolved',requestId:'q-1',status:'answered',answers:{fix:'Wait for the cookie',scope:['Login e2e, 10 runs','All auth unit tests']},skipped:['commit_now'],da:'persona'});
  const item=model.items.find(i=>i.kind==='answers') as TranscriptAnswersItem;
  assert.ok(item,'a receipt item');
  assert.deepEqual(item.pairs,[{title:'Fix',answer:'Wait for the cookie'},{title:'Verify',answer:'Login e2e, 10 runs, All auth unit tests'},{title:'Commit now',answer:'skipped'}]);
  assert.deepEqual(answersRows(item,120,{unicode:true}),[
    {kind:'header',glyph:'◆',title:'Your answers'},
    {kind:'pair',lead:'    Fix  ',text:'Wait for the cookie'},
    {kind:'pair',lead:'    Verify  ',text:'Login e2e, 10 runs, All auth unit tests'},
    {kind:'pair',lead:'    Commit now  ',text:'skipped'}]);
  assert.equal(transcriptItemText(item),'Your answers\nFix  Wait for the cookie\nVerify  Login e2e, 10 runs, All auth unit tests\nCommit now  skipped');
  assert.equal(estimateTranscriptItemRows(item,120),4);
});

test('a long answer wraps under a six-cell indent, and the height counts the wrapped rows',()=>{
  const item:TranscriptAnswersItem={kind:'answers',id:'answers:q',pairs:[{title:'Fix',answer:'one two three four five six seven eight nine ten'}]};
  const rows=answersRows(item,24,{unicode:true});
  assert.deepEqual(rows.slice(1),[{kind:'pair',lead:'    Fix  ',text:'one two three '},{kind:'pair',lead:'      ',text:'four five six '},{kind:'pair',lead:'      ',text:'seven eight nine '},{kind:'pair',lead:'      ',text:'ten'}]);
  for(const row of rows.slice(1))assert.ok(row.kind==='pair'&&(row.lead+row.text).trimEnd().length<=24,'every row fits the width');
  assert.equal(estimateTranscriptItemRows(item,24),rows.length);
});

test('all skipped still leaves the receipt (the person chose to skip)',()=>{
  const {model}=feed(asked,{type:'UserQuestionResolved',requestId:'q-1',status:'skipped',da:'persona'});
  const item=model.items.find(i=>i.kind==='answers') as TranscriptAnswersItem;
  assert.deepEqual(item.pairs.map(p=>p.answer),['skipped','skipped','skipped']);
});

test('cancelled by the person and expired leave one dim notice; closes by the system leave nothing',()=>{
  const cancelled=feed(asked,{type:'UserQuestionResolved',requestId:'q-1',status:'cancelled',da:'persona'}).model;
  assert.deepEqual(cancelled.items.filter(i=>i.kind!=='tool').map(i=>[i.kind,(i as any).text]),[['warning','You cancelled the questions; TALOS was told and decides without them.']]);
  const expired=feed(asked,{type:'UserQuestionResolved',requestId:'q-1',status:'expired',da:'sistema'}).model;
  assert.deepEqual(expired.items.filter(i=>i.kind!=='tool').map(i=>[i.kind,(i as any).text]),[['warning','Nobody answered in time: the questions closed and TALOS went on with its own judgment, saying what it assumed.']]);
  for(const motivo of ['interrotta','nuovo-messaggio','reindirizzamento','fermato','non-salvata']){
    const {model}=feed(asked,{type:'UserQuestionResolved',requestId:'q-1',status:'cancelled',da:'persona',motivo});
    assert.deepEqual(model.items.filter(i=>i.kind!=='tool'),[],`motivo ${motivo}`);
  }
});

test('a replayed history shows the same receipt once, and a close without its question still names the questions by id',()=>{
  const resolved={type:'UserQuestionResolved',requestId:'q-1',status:'answered',answers:{fix:'Wait for the cookie'},skipped:['scope','commit_now'],da:'persona'};
  const twice=feed(asked,resolved,resolved).model;
  assert.equal(twice.items.filter(i=>i.kind==='answers').length,1);
  const orphan=feed({type:'UserQuestionResolved',requestId:'q-9',status:'answered',answers:{session_wait:'yes'},da:'persona'}).model;
  assert.deepEqual((orphan.items.find(i=>i.kind==='answers') as TranscriptAnswersItem).pairs,[{title:'Session wait',answer:'yes'}]);
});

test('the question tool draws no row of its own: the card and then the receipt stand for it (mockup), never its raw JSON',()=>{
  const {model}=feed({type:'ToolCallStart',toolCallId:'call_ask',toolCallName:'ask_user_question'},{type:'ToolCallArgs',toolCallId:'call_ask',delta:'{"questions":[]}'},
    asked,{type:'UserQuestionResolved',requestId:'q-1',status:'answered',answers:{fix:'Wait for the cookie'},skipped:['scope','commit_now'],da:'persona'},
    {type:'ToolCallResult',toolCallId:'call_ask',content:'{"status":"answered","answers":{"fix":"Wait for the cookie"}}',receipt:{status:'succeeded',consentito:true}},
    {type:'ToolCallStart',toolCallId:'call_read',toolCallName:'leggi'});
  assert.deepEqual(model.items.map(i=>i.kind),['answers','tool'],'only the receipt, and the next tool keeps its row');
  assert.doesNotMatch(JSON.stringify(model.items),/"status":"answered"/u);
});

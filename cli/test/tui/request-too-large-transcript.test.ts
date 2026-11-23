/*
 * 0.6.13, «a request too large for the model»: the conversation's side, without a screen. The kernel's durable mark
 * (`request.not_sent`) alone marks the person's request as not sent — it is what a replay has even if the failure row were
 * missing — and so does the live REQUEST_TOO_LARGE failure alone; the mark costs its row in the virtual list; the screen's words
 * name its dialog, `-p`'s name the flag.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';
import {describeError} from '../../src/i18n/error-view.ts';

const TOO_LARGE={type:'RunError',runId:'r1',code:'REQUEST_TOO_LARGE',message:'The request is too large for this model.',tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima'};
function replay(rows:Array<Record<string,unknown>>):TranscriptModel{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  let model=createTranscriptModel();
  for(const row of rows)for(const event of adapter.translateAll(row) as TuiEvent[])model=reduceTranscriptEvent(model,event);
  return model;
}
const started={type:'RunStarted',runId:'r1',input:{consegna:'the huge paste'}};
const promptOf=(model:TranscriptModel)=>model.items.find(item=>item.kind==='message'&&item.role==='user') as any;

test('the kernel\'s durable mark alone marks the request as not sent',()=>{
  const model=replay([started,{type:'CUSTOM',name:'talos.richiesta-non-inviata',value:{indice:1}}]);
  assert.equal(promptOf(model)?.notSent,true);
  assert.match(transcriptItemText(promptOf(model)),/the huge paste\nNot sent: too large for this model/u);
});

test('the REQUEST_TOO_LARGE failure alone marks it too; another failure does not',()=>{
  assert.equal(promptOf(replay([started,TOO_LARGE]))?.notSent,true);
  assert.equal(promptOf(replay([started,{type:'RunError',runId:'r1',code:'PROVIDER_REQUEST_ERROR',message:'x'}]))?.notSent,undefined);
  assert.equal(promptOf(replay([started,{type:'RunFinished',runId:'r1'}]))?.notSent,undefined);
});

test('an earlier request stays a sent one: only the request of the failed turn is marked',()=>{
  const model=replay([{type:'RunStarted',runId:'r0',input:{consegna:'first'}},{type:'RunFinished',runId:'r0'},started,{type:'CUSTOM',name:'talos.richiesta-non-inviata',value:{indice:3}},TOO_LARGE]);
  const prompts=model.items.filter(item=>item.kind==='message'&&item.role==='user') as any[];
  assert.deepEqual(prompts.map(item=>[item.text,item.notSent===true]),[['first',false],['the huge paste',true]]);
});

test('the mark is one more row of the virtual list',()=>{
  const item={kind:'message' as const,id:'m',role:'user' as const,text:'the huge paste',streaming:false};
  assert.equal(estimateTranscriptItemRows({...item,notSent:true},80),estimateTranscriptItemRows(item,80)+1);
});

test('the screen\'s words name its dialog; -p\'s name the flag',()=>{
  const error={code:'REQUEST_TOO_LARGE',requestTooLarge:{request:15600,frame:9000,window:16000,source:'estimate'}};
  assert.doesNotMatch(String(describeError(error,{screen:true}).todo),/--attach/u);
  assert.match(String(describeError(error,{screen:true}).todo),/attachment/u);
  assert.match(String(describeError(error).todo),/--attach-if-too-large/u);
});

/*
 * Stage 3, the parent↔child dialogue (owner 02/10: «dialogo agenti visibile», registro 12). A delegated agent asks its
 * parent (`ask_parent`), or the parent asks it (`ask_child`); the kernel records each request in both sessions as CUSTOM
 * `talos.agent-dialogue` v1 (requested → answered | cancelled). The v2 bridge dropped it. Now the transcript keeps one item
 * per request, updated in place: «↳ <child's task> asks: …» then «↳ answer: …» (or the cancel), dim, the child's words as
 * data — like Claude Code's «Message from @agent» and Codex's last agent message.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {dialogueRows,type TranscriptDialogueItem} from '../../src/tui/components/agent-dialogue.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';

const dialogue=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.agent-dialogue',value:{version:1,requestId:'d-1',parentId:'main',childId:'c-1',at:'t',...value}});
const asks=dialogue({direction:'child-to-parent',status:'requested',question:'Which branch should I use?'});
const agent={type:'CUSTOM',name:'talos.agenti',value:{childId:'c-1',parentId:'main',reason:'created',agent:{taskCorto:'Fix the login test'},operation:{kind:'run',status:'running'}}};

function feed(...records:Array<Record<string,unknown>>){
  const adapter=createTuiEventAdapter();adapter.bindSession('main');
  const bridge=createV2EventBridge('main',()=>'2026-10-02T18:00:00.000Z');
  const events:TuiEvent[]=[];let model:TranscriptModel=createTranscriptModel();
  for(const record of records)for(const event of adapter.translateAll(bridge.translate(record))){events.push(event);model=reduceTranscriptEvent(model,event);}
  return{events,model};
}
const item=(model:TranscriptModel)=>model.items.find(i=>i.kind==='dialogue') as TranscriptDialogueItem;

test('the dialogue reaches the screen\'s events in English, durable',()=>{
  const {events}=feed(asks);
  const event=events.find(e=>e.type==='agent.dialogue') as Extract<TuiEvent,{type:'agent.dialogue'}>;
  assert.deepEqual([event.requestId,event.childId,event.direction,event.status,event.question],['d-1','c-1','child-to-parent','requested','Which branch should I use?']);
});

test('a child asks, the parent answers: one item, the question and then the answer, named by the child\'s task',()=>{
  const {model}=feed(agent,asks,dialogue({direction:'child-to-parent',status:'answered',question:'Which branch should I use?',answer:'main, never a release branch'}));
  assert.equal(model.items.filter(i=>i.kind==='dialogue').length,1);
  assert.deepEqual(dialogueRows(item(model),120),[
    {lead:'  ↳ ',who:'Fix the login test asks: ',text:'Which branch should I use?'},
    {lead:'  ↳ ',who:'answer: ',text:'main, never a release branch'}]);
  assert.equal(transcriptItemText(item(model)),'Fix the login test asks: Which branch should I use?\nanswer: main, never a release branch');
  assert.equal(estimateTranscriptItemRows(item(model),120),2);
});

test('the parent asks a child; a cancel says so; an agent with no task is named plainly',()=>{
  const {model}=feed(agent,dialogue({direction:'parent-to-child',status:'requested',question:'Did the tests pass?'}),dialogue({direction:'parent-to-child',status:'cancelled',question:'Did the tests pass?',reason:'recipient-closing'}));
  assert.deepEqual(dialogueRows(item(model),120),[
    {lead:'  ↳ ',who:'TALOS asks Fix the login test: ',text:'Did the tests pass?'},
    {lead:'  ↳ ',who:'',text:'not answered: the agent closed'}]);
  const unnamed=feed(asks).model;
  assert.equal(dialogueRows(item(unnamed),120)[0]!.who,'An agent asks: ');
});

test('a long question wraps under its lead; a replayed record does not double the item',()=>{
  const long=feed(dialogue({direction:'child-to-parent',status:'requested',question:'one two three four five six seven eight nine ten eleven twelve'}));
  const rows=dialogueRows(item(long.model),40);
  assert.ok(rows.length>1);
  for(const row of rows)assert.ok((row.lead+row.who+row.text).length<=40,JSON.stringify(row));
  assert.equal(estimateTranscriptItemRows(item(long.model),40),rows.length);
  assert.equal(feed(asks,asks).model.items.filter(i=>i.kind==='dialogue').length,1);
});

test('a long question wraps at word boundaries, never inside a word; a dialogue record of another version is not invented',()=>{
  const words='one two three four five six seven eight nine ten eleven twelve'.split(' ');
  const rows=dialogueRows(item(feed(dialogue({direction:'child-to-parent',status:'requested',question:words.join(' ')})).model),40);
  for(const row of rows)for(const piece of row.text.split(' ').filter(Boolean))assert.ok(words.includes(piece),`«${piece}» is a whole word`);
  assert.deepEqual(feed(dialogue({version:2,direction:'child-to-parent',status:'requested',question:'x'})).events.filter(e=>e.type==='agent.dialogue'),[]);
});

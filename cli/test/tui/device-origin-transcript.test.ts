/*
 * 0.6.15 T5 (mockup v3, CLI session): a message that came from a device through remote control says so under the prompt, faint —
 * «from “<device>”». The kernel marks it in the person's screen copy (`bolla.origine {tipo:'telefono',nome}`, origine-remota.mjs,
 * set only by its in-process call, never by a client) on `RunStarted.input` and on `QueuedMessageDelivered`, live and replayed.
 * The v2 carries it in English (`bubble.origin {kind:'device',name}`); the screen draws one more row, and the copy text has it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter,deviceOf,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

function replay(rows:Array<Record<string,unknown>>):TranscriptModel{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  let model=createTranscriptModel();
  for(const row of rows)for(const event of adapter.translateAll(row) as TuiEvent[])model=reduceTranscriptEvent(model,event);
  return model;
}
const bubble=(nome:unknown,testo='add a dark theme toggle')=>({testo,allegati:[],origine:{tipo:'telefono',nome}});
const started=(input:Record<string,unknown>)=>({type:'RunStarted',runId:'r1',input:{consegna:'add a dark theme toggle',...input}});
const prompts=(model:TranscriptModel)=>model.items.filter(item=>item.kind==='message'&&item.role==='user') as any[];

test('a message from a device names it under the prompt (live and replayed alike)',()=>{
  const [prompt]=prompts(replay([started({bolla:bubble('Pad di Nino')})]));
  assert.equal(prompt.device,'Pad di Nino');
  assert.equal(transcriptItemText(prompt),'You\nadd a dark theme toggle\nfrom “Pad di Nino”');
});

test('a message typed here, or with a bubble without origin, has no device line',()=>{
  assert.equal(prompts(replay([started({})]))[0].device,undefined);
  assert.equal(prompts(replay([started({bolla:{testo:'add a dark theme toggle',allegati:[]}})]))[0].device,undefined);
  /* only the kernel's own kind counts: an origin of another kind is not a device */
  assert.equal(prompts(replay([started({bolla:{testo:'add a dark theme toggle',allegati:[],origine:{tipo:'browser',nome:'x'}}})]))[0].device,undefined);
});

test('a device without a name reads «from a device»; control characters never reach the screen',()=>{
  const [unnamed]=prompts(replay([started({bolla:bubble(null)})]));
  assert.equal(unnamed.device,'');
  assert.match(transcriptItemText(unnamed),/\nfrom a device$/u);
  assert.equal(deviceOf({origin:{kind:'device',name:'Pad\u001b[2J\u0007 di Nino'}}),'Pad [2J di Nino');
  /* review 6 C4: the text direction controls and the invisibles go too; the cut at 64 never splits a pair */
  assert.equal(deviceOf({origin:{kind:'device',name:'Pad‮odnetsi⁦x​'}}),'Pad odnetsi x');
  const long=deviceOf({origin:{kind:'device',name:'a'.repeat(63)+'\u{1F600}'+'b'}})!;
  assert.equal(Array.from(long).length,64);
  assert.equal(/[\uD800-\uDBFF]$/u.test(long),false,'no lone half of a pair');
  assert.equal(long.endsWith('\u{1F600}'),true,'the emoji stays whole');
  assert.equal(deviceOf({origin:{kind:'device',name:'x'.repeat(200)}})?.length,64);
});

test('a queued message from a device keeps its device when delivered',()=>{
  const model=replay([started({}),{type:'QueuedMessageDelivered',codaId:'q1',testo:'also the footer',bolla:bubble('Pad di Nino','also the footer')}]);
  const queued=prompts(model).find(item=>item.text==='also the footer');
  assert.equal(queued?.device,'Pad di Nino');
  /* a queued message typed here stays without it */
  const local=prompts(replay([started({}),{type:'QueuedMessageDelivered',codaId:'q2',testo:'from here'}])).find(item=>item.text==='from here');
  assert.equal(local?.device,undefined);
});

test('the device line is one more row of the virtual list',()=>{
  const item={kind:'message' as const,id:'m',role:'user' as const,text:'add a dark theme toggle',streaming:false};
  assert.equal(estimateTranscriptItemRows({...item,device:'Pad di Nino'},80),estimateTranscriptItemRows(item,80)+1);
  assert.equal(estimateTranscriptItemRows({...item,device:''},80),estimateTranscriptItemRows(item,80)+1);
});

test('the v2 carries the screen copy in English: bubble.origin {kind:device,name}, no Italian key',()=>{
  const clock=()=>'2026-10-26T20:00:00.000Z';
  const run=createV2EventBridge('s-1',clock).translate({type:'RunStarted',_sequenza:1,threadId:'s-1',runId:'r-1',input:{consegna:'hi',
    bolla:{testo:'hi',allegati:[{tipo:'file',nome:'a.md',percorso:'C:\\p\\a.md',caratteri:12}],origine:{tipo:'telefono',nome:'Pad di Nino'}}}})?.data as any;
  assert.deepEqual(run.input.bubble,{text:'hi',attachments:[{type:'file',name:'a.md',path:'C:\\p\\a.md',characters:12}],origin:{kind:'device',name:'Pad di Nino'}});
  assert.equal('bolla' in run.input,false);
  const queued=createV2EventBridge('s-1',clock).translate({type:'QueuedMessageDelivered',_sequenza:2,codaId:'q1',testo:'hi',bolla:{testo:'hi',allegati:[],origine:{tipo:'telefono',nome:'Pad di Nino'}}})?.data as any;
  assert.deepEqual(queued.bubble,{text:'hi',attachments:[],origin:{kind:'device',name:'Pad di Nino'}});
  /* a background command's turn hands the kernel's note, never a bubble */
  const handed=createV2EventBridge('s-1',clock).translate({type:'RunStarted',_sequenza:3,threadId:'s-1',runId:'r-2',input:{consegna:'note',origine:'sfondo',bolla:{testo:'note',allegati:[]}}})?.data as any;
  assert.equal('bubble' in handed.input,false);assert.equal('bolla' in handed.input,false);
});

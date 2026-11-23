/*
 * R3 lane RD — transcript-model.ts reduces the R3 contract events (tool-facts.ts; produced by lane SP) and the owner's
 * Q-R3-8/Q-R3-9 turn outcome:
 *   - `tool.origin`, `tool.decision`, `tool.facts`, `file.changed` fill the optional fields of the tool item, in either
 *     order with `tool.started` and without inventing a row;
 *   - denied is not failed (gate E9): a person's "no" and a `denied` receipt give a `denied` row with the English reason;
 *   - the `Run · …` rows are gone (Q-R3-9); after a turn a line appears only when it did not end normally:
 *     `Interrupted · <stop point>` (neutral, dim; the interrupted run arrives as `run.cancelled{interrupted:true}`) or the
 *     three-part error. R1 lane R's resume and dedup behaviour is kept (r1-resume-*.test.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptItem,type TranscriptModel} from '../../src/tui/transcript-model.ts';

const feed=(events:TuiEvent[],model:TranscriptModel=createTranscriptModel())=>events.reduce(reduceTranscriptEvent,model);
const tool=(model:TranscriptModel,id='t1')=>model.items.find(item=>item.id==='tool:'+id) as Extract<TranscriptItem,{kind:'tool'}>|undefined;
const line=(model:TranscriptModel,id='t1')=>toolRowView(tool(model,id) as any,120,false).line;
const started=(id='t1',name='shell'):TuiEvent=>({type:'tool.started',toolCallId:id,toolName:name});
const args=(value:unknown,id='t1'):TuiEvent=>({type:'tool.args',toolCallId:id,delta:JSON.stringify(value)});

test('R3 RD: tool.origin, tool.decision and tool.facts fill the tool item; facts merge as they arrive',()=>{
  const model=feed([started(),args({comando:'git status'}),
    {type:'tool.origin',toolCallId:'t1',origin:'person'},
    {type:'tool.decision',toolCallId:'t1',decision:{kind:'typed'}},
    {type:'tool.facts',toolCallId:'t1',facts:{isolation:'sandbox'}},
    {type:'tool.completed',toolCallId:'t1',content:'exit 0 [sandbox: ⛉ sandbox (mxc) — verified]\nclean'},
    {type:'tool.facts',toolCallId:'t1',facts:{exitCode:0,durationMs:300}},
  ]);
  const item=tool(model)!;
  assert.equal(item.origin,'person');assert.deepEqual(item.decision,{kind:'typed'});
  assert.deepEqual(item.facts,{isolation:'sandbox',exitCode:0,durationMs:300});
  assert.equal(line(model),'! git status · ⛉ sandbox · typed by you · exit 0 · 0.3 s');
});

test('R3 RD: facts that arrive before tool.started wait for it and never draw a phantom row',()=>{
  let model=feed([{type:'tool.origin',toolCallId:'t1',origin:'person'},{type:'tool.decision',toolCallId:'t1',decision:{kind:'rule',rule:'git *'}}]);
  assert.equal(model.items.length,0,'no row before the tool exists');
  model=feed([started(),args({comando:'git log'})],model);
  assert.equal(tool(model)?.origin,'person');assert.deepEqual(tool(model)?.decision,{kind:'rule',rule:'git *'});
  assert.equal(tool(model)?.name,'shell');
});

test('R3 RD: file.changed reaches its write/edit row by tool call id, or by path; the row states the change',()=>{
  const byId=feed([started('w1','scrivi'),args({percorso:'notes.txt',contenuto:'one\ntwo\nthree'},'w1'),
    {type:'file.changed',change:{path:'notes.txt',before:null,after:'one\ntwo\nthree',toolCallId:'w1'}},
    {type:'tool.completed',toolCallId:'w1',content:'written: notes.txt'}]);
  assert.equal(line(byId,'w1'),'Write file notes.txt · new file · 3 lines');
  const byPath=feed([started('w1','scrivi'),args({percorso:'a.txt',contenuto:'x'},'w1'),{type:'tool.completed',toolCallId:'w1',content:'ok'},
    started('e1','file_edit'),args({percorso:'src/index.js',old_string:'console.log(1)',new_string:'console.log(2)'},'e1'),
    {type:'file.changed',change:{path:'src/index.js',before:'a\nconsole.log(1)\n',after:'a\nconsole.log(2)\n'}},
    {type:'tool.completed',toolCallId:'e1',content:'edited: src/index.js'}]);
  assert.equal(tool(byPath,'e1')?.change?.path,'src/index.js');
  assert.equal(tool(byPath,'w1')?.change??null,null,'the other write is untouched');
  assert.equal(line(byPath,'e1'),'Edit file src/index.js · +1 −1');
  const orphan=feed([{type:'file.changed',change:{path:'x.txt',before:null,after:'x'}}]);
  assert.equal(orphan.items.length,0,'a change with no write row adds nothing');
});

test('R3 RD E9: a person\'s "no" and a denied receipt give a denied row with the English reason, never failed',()=>{
  let model=feed([started('w1','scrivi'),args({percorso:'notes.txt',contenuto:'a'},'w1'),
    {type:'approval.required',requestId:'q1',payload:{toolCallId:'w1'},toolCallId:'w1'},
    {type:'approval.resolved',requestId:'q1',approved:false}]);
  assert.equal(tool(model,'w1')?.status,'denied');
  assert.equal(line(model,'w1'),'Write file notes.txt · denied');
  assert.deepEqual(toolRowView(tool(model,'w1') as any,120,false).detailLines,['Not run: you did not approve it.']);
  model=feed([{type:'tool.completed',toolCallId:'w1',content:'REFUSED. l\'owner non ha approvato. Nothing was written.',
    outcome:{toolCallId:'w1',status:'failed',content:'REFUSED…',receiptStatus:'denied',exitCode:null,enforcement:null,allowed:false,permissionVia:'permesso-per-attrezzo-chiedi',permissionReason:null,risk:null}}],model);
  assert.equal(tool(model,'w1')?.status,'denied','the receipt keeps it denied');
  assert.equal(tool(model,'w1')?.finalOutput,'Not run: you did not approve it.');
});

test('R3 RD: an approved tool starts its clock when it starts running, not when the model asked',()=>{
  let model=feed([started(),args({comando:'npm test'}),{type:'approval.required',requestId:'q1',payload:{toolCallId:'t1'},toolCallId:'t1'}]);
  // The model asked long ago (the person took their time): seed the row's start far in the past.
  model={...model,items:model.items.map(item=>item.kind==='tool'?{...item,startedAt:1}:item)};
  const before=Date.now();
  model=feed([{type:'approval.resolved',requestId:'q1',approved:true}],model);
  assert.equal(tool(model)?.status,'running');
  assert.ok(tool(model)!.startedAt!>=before,`the running clock starts at the answer, not at ${tool(model)!.startedAt}`);
});

test('R3 RD Q-R3-9: a turn that ends normally leaves no run row at all',()=>{
  const model=feed([{type:'run.started',sessionId:'s1',runId:'r1',prompt:'hi'},{type:'message.started',messageId:'a1',role:'assistant'},{type:'message.delta',messageId:'a1',delta:'OK'},{type:'run.completed',runId:'r1'}]);
  assert.deepEqual(model.items.map(item=>item.kind),['message','message']);
  assert.equal(model.items.map(transcriptItemText).join('\n').includes('Run'),false);
});

test('R3 RD Q-R3-8: an interrupt is one neutral line naming where it stopped; streams close and cut tools say interrupted',()=>{
  const answering=feed([{type:'run.started',sessionId:'s1',runId:'r1',prompt:'go'},{type:'message.started',messageId:'a1',role:'assistant'},{type:'message.delta',messageId:'a1',delta:'Hel'},{type:'run.cancelled',runId:'r1',interrupted:true}]);
  const notice=answering.items.at(-1)!;
  assert.equal(notice.kind,'warning');assert.equal((notice as any).outcome,'interrupted');
  assert.equal(transcriptItemText(notice),'Interrupted · while the model was answering');
  assert.equal(answering.items.some(item=>item.kind==='message'&&item.streaming),false);
  const approval=feed([{type:'run.started',sessionId:'s1',runId:'r1'},started(),args({comando:'dir'}),{type:'approval.required',requestId:'q1',payload:{toolCallId:'t1'},toolCallId:'t1'},{type:'run.cancelled',runId:'r1',interrupted:true}]);
  assert.equal(transcriptItemText(approval.items.at(-1)!),'Interrupted · while TALOS was waiting for your approval for Shell');
  assert.equal(tool(approval)?.status,'interrupted');assert.equal(line(approval),'Shell dir · interrupted');
  const running=feed([{type:'run.started',sessionId:'s1',runId:'r1'},started(),args({comando:'npm test'}),{type:'tool.output',toolCallId:'t1',delta:'x'},{type:'run.cancelled',runId:'r1',interrupted:true}]);
  assert.equal(transcriptItemText(running.items.at(-1)!),'Interrupted · while Shell was running');
  assert.equal(running.pendingApproval,null);
});

test('R3 RD: a run cut off by closing TALOS (replayed history) says so; a failed run leaves the three-part error only',()=>{
  const closed=feed([{type:'run.started',sessionId:'s1',runId:'r1',prompt:'cut',history:true},{type:'message.started',messageId:'a1',role:'assistant'},{type:'message.delta',messageId:'a1',delta:'partial'},{type:'run.cancelled',runId:'r1',interrupted:true}]);
  assert.equal(transcriptItemText(closed.items.at(-1)!),'Interrupted · TALOS was closed before this run finished');
  const failed=feed([{type:'run.started',sessionId:'s1',runId:'r1'},{type:'run.failed',runId:'r1',message:'x',error:{message:'Troppo traffico presso il fornitore.',envelope:{code:'PROVIDER_REQUEST_ERROR',component:'runtime',retryable:false,traceId:'t'}} as any}]);
  const text=failed.items.map(transcriptItemText).join('\n');
  assert.doesNotMatch(text,/Run ·|Warning|fornitore/u,text);
  assert.match(text,/\(PROVIDER_REQUEST_ERROR\)/u);
  assert.equal((failed.items.at(-1) as any).outcome,'failed');
  assert.equal((failed.items.at(-1) as any).detail,'Troppo traffico presso il fornitore.','the kernel text is only the raw detail');
});

test('R3 RD: one outcome line per run — a replay does not repeat it, and a run that then completes normally drops it',()=>{
  const events:TuiEvent[]=[{type:'run.started',sessionId:'s1',runId:'r1',prompt:'go'},{type:'run.failed',runId:'r1',message:'boom'}];
  const once=feed(events);
  const twice=feed([{...events[0]!,history:true} as TuiEvent,events[1]!],once);
  assert.equal(twice.items.filter(item=>item.kind==='warning').length,1);
  const cancelled=feed([{type:'run.started',sessionId:'s1',runId:'r2',prompt:'again'},{type:'run.cancelled'},{type:'run.completed',runId:'r2'}]);
  assert.deepEqual(cancelled.items.map(item=>item.kind),['message'],'a stop that lost the race to a normal end leaves no line');
});

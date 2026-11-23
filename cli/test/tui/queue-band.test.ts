/* FE-048, owner 01/11: the queue is a band above the prompt, and the conversation keeps only what is not the person's. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {queuedTranscriptItems} from '../../src/tui/queued-items.ts';
import {budget,budgetRows} from '../../src/tui/regions/budget.ts';
import {queueBandRows} from '../../src/tui/regions/queue-band.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const prompt=(id:string,value:string,inTurn=false)=>({id,kind:'prompt' as const,text:value,...(inTurn?{inTurn}:{})});

test('nothing queued, no band',()=>{assert.deepEqual(queueBandRows([],{width:80}),[]);});

test('the head counts them and says when they go; three rows at most, and the count stays true',()=>{
  const rows=queueBandRows(['a','b','c','d','e'].map(id=>prompt(id,`text ${id}`)),{width:80});
  assert.equal(rows.length,4);
  assert.match(text(rows[0]!),/^ 5 queued · goes in when the turn ends/u);
  assert.match(text(rows[3]!),/› text c/u);
  assert.match(text(queueBandRows([prompt('a','x',true)],{width:80})[0]!),/1 queued · goes in after the current step/u);
  assert.match(text(queueBandRows([prompt('a','x')],{width:80,paused:true})[0]!),/paused/u);
});

test('every row fills the band to the edge and never past it, however long the message',()=>{
  for(const width of [40,80,150])for(const row of queueBandRows([prompt('a','long '.repeat(60)),{id:'b',kind:'command',text:'npm test'}],{width}))assert.equal(displayWidth(text(row)),width,text(row));
});

test('the head opens the queue, a row sends its own message, and alt+s is said only where it reaches',()=>{
  const rows=queueBandRows([prompt('a','first'),prompt('kernel:b','second')],{width:80});
  assert.ok(rows[0]!.some(segment=>segment.action==='open:queue'));
  assert.ok(rows[1]!.some(segment=>segment.action==='queue:a'));
  assert.ok(rows[2]!.some(segment=>segment.action==='queue:kernel:b'));
  assert.match(text(rows[1]!),/alt\+s send now/u);
  assert.doesNotMatch(text(rows[2]!),/alt\+s/u);
  assert.match(text(rows[2]!),/send now/u);
});

test('a command waits for the turn: it says so with its mark, and has no «now»',()=>{
  const row=queueBandRows([{id:'c',kind:'command',text:'npm test'}],{width:80})[1]!;
  assert.match(text(row),/› !npm test/u);
  assert.doesNotMatch(text(row),/send now/u);
});

test('the conversation keeps what is not the person\'s',()=>{
  const items=queuedTranscriptItems({items:[{id:'q1',origin:'person',text:'mine'},{id:'q2',origin:'background'}] as any,paused:false},[{id:'l1',kind:'prompt',text:'later',status:'pending'},{id:'l2',kind:'command',text:'npm test',status:'pending'}] as any);
  assert.deepEqual(items.map(item=>item.id),['queued:kernel:q2']);
});

const frame={rows:30,columns:100,frameRows:30,composerLines:1,composerHints:0,header:1,shortcut:1,roster:0,extras:0,footer:2};
test('the budget gives the band its rows from the transcript, and the sum stays the frame',()=>{
  const none=budget(frame),band=budget({...frame,band:4});
  assert.equal(band.band,4);assert.equal(band.transcript,none.transcript-4);assert.equal(budgetRows(band),30);
});

test('a short window keeps two rows of conversation, a card or a page has no band',()=>{
  const short=budget({...frame,rows:12,frameRows:12,band:4});
  assert.ok(short.transcript>=2,String(short.transcript));assert.equal(budgetRows(short),12);
  assert.equal(budget({...frame,band:4,composerRows:6}).band,0);
  assert.equal(budget({...frame,band:4,composerRows:20,page:true}).band,0);
});

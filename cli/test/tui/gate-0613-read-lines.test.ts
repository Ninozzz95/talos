/*
 * 0.6.13 gate (25/10/2026), acceptance s21/s22 R5A-READCUT, first red at 80a0d077e (the CLI runs the desktop adapter). Since then a
 * `leggi` result reaches the model whole — no longer cut at 8,000 characters (CHANGELOG 0.6.13) — so a read of a 3,000-line file
 * gives the model the kernel's own page, `[TALOS read lines 1-2000 of 3000 in "big.txt"; …]`, 54,207 characters. The row counted
 * the lines of the last 8 KB the transcript keeps for the screen, and said «Read file big.txt · 304 lines»: neither what the model
 * read (2,000 lines) nor that the file has 3,000. 0.6.12 said «289 of 3,000 lines · cut at 8,000 characters», which was true.
 * The row now takes its facts from the WHOLE result: a page says `2,000 of 3,000 lines`, a whole long read its own line count.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel,type TranscriptToolItem} from '../../src/tui/transcript-model.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';

const reduce=(events:TuiEvent[])=>events.reduce(reduceTranscriptEvent,createTranscriptModel() as TranscriptModel);
const lines=(n:number,from=1)=>Array.from({length:n},(_,i)=>`big file line ${String(i+from).padStart(4,'0')} of 3000`).join('\n');
/* the kernel's page as the model receives it (talosHarness.mjs esitoDellaLetturaDiTesto + the F-027 data boundary) */
const page=(from:number,to:number,total:number)=>`[TALOS read lines ${from}-${to} of ${total} in "big.txt"; continue with leggi offset=${to+1}. The file may change between reads.]\n`
  +`<<<TALOS_DATA id=d8ad6659eee5 from="leggi big.txt">>>\n${lines(to-from+1,from)}\n<<<END_TALOS_DATA id=d8ad6659eee5>>>`;
function readRow(content:string,args:Record<string,unknown>={percorso:'big.txt'}){
  const model=reduce([
    {type:'tool.started',toolCallId:'r1',toolName:'leggi'},
    {type:'tool.args',toolCallId:'r1',delta:JSON.stringify(args)},
    {type:'tool.completed',toolCallId:'r1',content},
  ]);
  return model.items.find(item=>item.id==='tool:r1') as TranscriptToolItem;
}

test('0.6.13 gate: a paged read says how many of the file\'s lines the model got, from the whole result, not the screen\'s tail',()=>{
  const content=page(1,2000,3000);
  assert.ok(content.length>50_000,'the fixture is the measured 54,207-character page');
  const item=readRow(content);
  assert.equal(toolRowView(item,120,false).line,'Read file big.txt · 2,000 of 3,000 lines');
  /* search/copy read the same row */
  assert.match(transcriptItemText(item),/^Read file big\.txt · 2,000 of 3,000 lines/u);
});

test('0.6.13 gate: a short page says it too (no 8 KB tail involved), and the last page of a file as well',()=>{
  assert.equal(toolRowView(readRow(page(1,40,300)),120,false).line,'Read file big.txt · 40 of 300 lines');
  assert.equal(toolRowView(readRow(page(2001,3000,3000)),120,false).line,'Read file big.txt · 1,000 of 3,000 lines');
});

test('0.6.13 gate: a whole long read counts all its lines, not the 8 KB the screen keeps',()=>{
  const content=lines(1500);
  assert.ok(content.length>8*1024);
  assert.equal(toolRowView(readRow(content),120,false).line,'Read file big.txt · 1,500 lines');
});

test('0.6.13 gate, the other way: a short whole read and an asked range stay as R3 left them; a page of the whole file is its count',()=>{
  assert.equal(toolRowView(readRow('# demo\nsecond\n',{percorso:'README.md'}),120,false).line,'Read file README.md · 2 lines');
  /* a range the call asked for is said as asked (renderRead), the page fact does not replace it */
  assert.match(toolRowView(readRow(page(10,19,3000),{percorso:'big.txt',offset:10,limit:10}),120,false).line,/^Read file big\.txt · lines 10/u);
  /* a page that covers the whole file is a plain count of its lines */
  assert.equal(toolRowView(readRow(page(1,30,30)),120,false).line,'Read file big.txt · 30 lines');
});

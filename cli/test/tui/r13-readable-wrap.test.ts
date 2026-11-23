/* R13 (collaudo 01/11, «s/etTimeout», «cons/ole.log»; treno 02/11, still there): in the chat a notice or a tool's detail
   line was left to Ink's own wrap (wrap-ansi, `hard: true`), which cuts a word longer than the row AT the column. A command
   has no spaces, so it was cut anywhere. `wrapReadable` lays the rows out: spaces first, then after `/ \ ; , . ( ) …`, a
   grapheme cut only when nothing else fits. app.ts draws those rows one Ink.Text each and the virtualizer counts the same
   rows. Proved here: the defect with Ink's wrap, the cure on the collaudo's own line, that Ink never re-wraps a row, that
   nothing but break spaces is lost, and that the estimate equals the rows drawn. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Ink from 'ink';
import React from 'react';
import {displayWidth,wrapReadable} from '../../src/tui/text-width.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';
import {TURN_INDENT} from '../../src/tui/components/conversation-rows.ts';

const h=React.createElement;
/* the line of the collaudo frame chat-80x24-80x24-22-07-12.txt (80 columns, two cells of indent) */
const NOTICE="Already finished: node -e \"require('fs').writeFileSync('bg-started.txt','1');setTimeout(function(){console.log('finished-bg')},60000)\"";
const inkRows=(element:unknown,columns:number)=>String(Ink.renderToString(element as any,{columns})).split('\n').map(row=>row.trimEnd());
const drawn=(rows:string[],columns:number)=>inkRows(h(Ink.Box,{flexDirection:'column'},...rows.map((row,index)=>h(Ink.Text,{key:index},row||' '))),columns); /* as app.ts: an empty Text has no row in Ink */
const SAMPLES=[
  NOTICE,
  'C:/Users/testuser/Downloads/TALOS/repo-json-repair/.talos/processi-sfondo/call_bg_2.log',
  'C:\\Users\\testuser\\AppData\\Local\\talos\\output\\call_7f3a9c.txt kept 4,000 of 12,345 characters',
  'npm run build && node scripts/run-tests.mjs --test-concurrency=1 "test/tui/**/*.test.ts"',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'ファイル/設定/とても長いコマンドの名前/日本語.txt を読みました 🚀🚀🚀 done',
  'first line\nsecond: printf(\'%s\\n\',value);exit(0)\n\nafter an empty line',
  'aa bbbbb cc',
];

test('R13-01: the defect — Ink\'s own wrap cuts the collaudo\'s command inside «setTimeout»', () => {
  const rows=inkRows(h(Ink.Text,{},NOTICE),78);
  assert.ok(rows.some(row=>row.endsWith("'1');s"))&&rows.some(row=>row.startsWith('etTimeout(')),`Ink cuts «s/etTimeout»: ${JSON.stringify(rows)}`);
});

test('R13-02: the cure on the same line — the break falls after «;», no word is cut', () => {
  assert.deepEqual(wrapReadable(NOTICE,78),[
    "Already finished: node -e \"require('fs').writeFileSync('bg-started.txt','1');",
    "setTimeout(function(){console.log('finished-bg')},60000)\"",
  ]);
});

test('R13-03: a path breaks after a slash, a word with no break point is cut only when nothing else fits', () => {
  assert.deepEqual(wrapReadable('C:/Users/testuser/Downloads/TALOS/processi-sfondo/call_bg_2.log',30),['C:/Users/testuser/Downloads/','TALOS/processi-sfondo/','call_bg_2.log']);
  assert.deepEqual(wrapReadable('a'.repeat(25),10),['a'.repeat(10),'a'.repeat(10),'a'.repeat(5)]);
  /* a break point in the first third of the room is not taken: it would leave a row almost empty */
  assert.deepEqual(wrapReadable('ab/'+'c'.repeat(20),12),['ab/'+'c'.repeat(9),'c'.repeat(11)]);
});

test('R13-04: every row fits and Ink draws it as it is, at every width', () => {
  for(const text of SAMPLES)for(const width of [6,11,20,33,47,78,120]){
    const rows=wrapReadable(text,width);
    for(const row of rows)assert.ok(displayWidth(row)<=width,`«${row}» is ${displayWidth(row)} cells at ${width}`);
    assert.deepEqual(drawn(rows,width).slice(0,rows.length),rows.map(row=>row.trimEnd()),`Ink re-wrapped ${JSON.stringify(text)} at ${width}`);
    assert.equal(drawn(rows,width).filter((_,index)=>index>=rows.length).join(''),'',`no extra row for ${JSON.stringify(text)} at ${width}`);
  }
});

test('R13-05: nothing is lost but the spaces a break eats, and the line breaks of the text stay', () => {
  for(const text of SAMPLES)for(const width of [6,11,20,33,78]){
    const rows=wrapReadable(text,width);
    assert.equal(rows.join('').replace(/[ \n]/gu,''),text.replace(/[ \n]/gu,''),`${JSON.stringify(text)} at ${width}`);
    assert.ok(rows.length>=text.split('\n').length);
  }
  assert.deepEqual(wrapReadable('',10),['']);
  assert.deepEqual(wrapReadable('a\n\nb',10),['a','','b']);
  /* a run of spaces wider than the row is a break too, eaten whole: no rows of blanks */
  assert.deepEqual(wrapReadable('a'+' '.repeat(30)+'b',10),['a','b']);
});

test('R13-06: the height estimate of a notice is the rows app.ts draws (it used to count a character wrap)', () => {
  const width=TURN_INDENT+6;
  const item={kind:'warning',id:'w-r13',text:'aa bbbbb cc'};
  /* drawn: «aa» «bbbbb» «cc»; a character wrap said two rows («aa bbb» «bb cc») and the frame would overflow by one */
  assert.equal(estimateTranscriptItemRows(item as any,width,{maxProseWidth:80,expandedTools:false,reasoningVisible:true}),3);
  const notice={kind:'warning',id:'w-r13b',text:NOTICE};
  assert.equal(estimateTranscriptItemRows(notice as any,80,{maxProseWidth:80,expandedTools:false,reasoningVisible:true}),wrapReadable(NOTICE,80-TURN_INDENT).length);
});

test('R13-07: app.ts draws the notices and the tool details from wrapReadable, one Ink.Text per row', async () => {
  /* The App is not mounted here (its renderer is a callback inside TuiApp); as app-routing.test.ts does for the transcript,
     the drawing code is read: without these lines Ink's own wrap is back and the estimate above no longer counts what is drawn. */
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('const renderTranscriptItem=React.useCallback(');
  assert.ok(start>=0);
  const block=source.slice(start,source.indexOf('},[',start));
  assert.match(block,/detailLines\.flatMap\(line=>wrapReadable\(line,width\)\)/u,'tool detail lines are laid out by wrapReadable');
  assert.match(block,/item\.kind==='warning'&&item\.alert\)\{const room=Math\.max\(1,columns-TURN_INDENT\)[^\n]*wrapReadable\(head,room\)[^\n]*wrapReadable\(line,room\)/u,'an alert notice is laid out by wrapReadable');
  assert.match(block,/item\.kind==='warning'\)return h\(Ink\.Box,\{[^\n]*wrapReadable\(item\.text,Math\.max\(1,columns-TURN_INDENT\)\)/u,'a notice is laid out by wrapReadable');
});

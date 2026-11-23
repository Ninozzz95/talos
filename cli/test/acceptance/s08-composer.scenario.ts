/**
 * s08 — the composer: multi-line input, @ completion, a 60-line paste, history (review §B s08; D-02, D-04, D-11).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MODE_ROW,assertHeightBudgeted,idleFooter} from './checks.ts';
import {clearComposer,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const PASTE=Array.from({length:60},(_,i)=>`line ${i+1} of a pasted log with some text`).join('\n');
const PLACEHOLDER=`[Pasted text #1 +59 lines]`;/* UI Phase 1 (owner 27/09): the placeholder is Claude Code's `[Pasted text #N +X lines]`, X = the line breaks */
const s=stage({name:'s08',files:{'README.md':'# demo\n','src/index.js':"console.log(1)\n",'src/util/strings.js':'export const a=1\n'}});
let t:TerminalSession;let sent:Screen;let recalled:Screen;

test('s08 · Shift+Enter starts a new line in the composer',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  await t.type('first line');await t.waitForText('first line');
  t.press('shift+enter');
  await t.type('second line');
  const two=await t.waitForText('second line');
  const first=two.lines.findIndex(line=>line.includes('first line'));const second=two.lines.findIndex(line=>line.includes('second line'));
  assert.ok(first>=0&&second===first+1,`the two lines are on consecutive rows:\n${two.text}`);
  await clearComposer(t);
});

test('s08 · R4: D-11 @ completion appears while typing, before Tab',async()=>{
  await t.type('look at @src/');
  await t.waitForText('look at @src/');
  await t.waitForText('index.js',{timeout:3_000,label:'D-11: no completion is offered while typing "@src/"'});
});

test('s08 · R4: D-11 @ completion offers paths without a double slash',async()=>{
  t.press('tab');
  /* Wait for the composer row itself: a key sent milliseconds after Tab is lost in ConPTY (measured by lane N). */
  const offered=await t.waitFor('the Tab inserted the completion',x=>x.lines.some(line=>/^│ › look at @src\/+index\.js\s*│?$/u.test(line.trimEnd())),{timeout:5_000});
  try{assert.doesNotMatch(offered.text,/@src\/\//u,'D-11: completion offers "@src//…"');}
  finally{t.press('esc');await clearComposer(t);}
});

test(`s08 · a 60-line paste collapses to ${PLACEHOLDER}`,async()=>{
  t.paste(PASTE);
  const collapsed=await t.waitForText(PLACEHOLDER,{timeout:10_000});
  assert.doesNotMatch(collapsed.text,/line 30 of a pasted log/u);
});

test('s08 · the paste is sent as one message and answered',async()=>{
  const before=s.fake.chatRequests().length;
  await new Promise(r=>setTimeout(r,60));t.press('enter');
  sent=await t.waitFor('the paste was answered',x=>s.fake.chatRequests().length>before&&idleFooter(x)&&/^ {2}OK$/mu.test(x.text),{timeout:30_000});
  assert.match(s.fake.chatRequests().at(-1)?.lastUser??'',/^line 1 of a pasted log/u);
});

test('s08 · D-04 the sent paste stays visible (or is announced) in the transcript',()=>{
  assert.ok(/\[Pasted text #\d+ \+59 lines\]|line 1 of a pasted log|earlier message|messages? above/iu.test(sent.text),'D-04: the message the person sent is neither on screen nor announced');
});

test('s08 · R4: D-11 a recalled paste stays collapsed in the composer',async()=>{
  t.press('up');
  /* The composer row, not the transcript's `You` row that already shows the sent paste. */
  recalled=await t.waitFor('the paste is recalled',x=>x.lines.some(line=>/^│ ›.*(\[Pasted text #\d+ \+59 lines\]|line \d+ of a pasted log)/u.test(line)),{timeout:10_000});
  assert.ok(recalled.text.includes(PLACEHOLDER)&&!recalled.text.includes('line 30 of a pasted log'),'D-11: the recalled paste is expanded inline in the composer');
});

test('s08 · D-02 recalling a long message does not overwrite the screen',()=>{
  assertHeightBudgeted(recalled);
  /* UI Phase 0: no main roster row at idle; the footer's status bar is the last line that must survive */
  assert.ok(MODE_ROW.test(recalled.text),'D-02: the status line was overwritten by the recalled message');
});

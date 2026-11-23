/**
 * s06 — a narrow terminal and two resizes (review §B s06; D-02).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertHeightBudgeted,composerReady,idleFooter} from './checks.ts';
import {stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s06',files:{'README.md':'# demo\n','src/index.js':"console.log(1)\n"}});
let t:TerminalSession;let narrow:Screen;let wide:Screen;let tiny:Screen;

test('s06 · at 60×20 TALOS starts and answers a Markdown turn',async()=>{
  t=s.launch([],{cols:60,rows:20});
  const ready=await toComposer(t);
  assert.ok(composerReady(ready));
  narrow=await turn(t,s.fake,'MD summarize');
  assert.match(narrow.text,/Second step/u);
});

test('s06 · D-02 at 60×20 the answer does not overwrite the rest of the screen',()=>{
  assertHeightBudgeted(narrow);
  assert.ok(composerReady(narrow)&&idleFooter(narrow),`D-02: at 60×20 the composer or the status line is overwritten:\n${narrow.text}`);
});

test('s06 · after a resize to 140×40 the composer is redrawn at the new width',async()=>{
  t.resize(140,40);
  wide=await t.waitFor('the frame at 140 columns',x=>x.lines.some(line=>/^╭─{130,}╮$/u.test(line.trimEnd())),{timeout:10_000});
  assert.ok(composerReady(wide));
});

test('s06 · D-02 after a resize to 40×15 no stale fragment stays on screen',async()=>{
  t.resize(40,15);
  tiny=await t.waitFor('the frame at 40 columns',x=>x.lines.some(line=>/^╭─{30,38}╮$/u.test(line.trimEnd())),{timeout:10_000});
  assertHeightBudgeted(tiny);
  assert.ok(composerReady(tiny)&&idleFooter(tiny),`D-02: at 40×15 the composer or the status line is overwritten:\n${tiny.text}`);
});

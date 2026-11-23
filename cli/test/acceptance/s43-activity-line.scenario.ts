/**
 * s43 — stage 4, the activity line of the approved mockup (owner 01/10; decisions 02/10). A real turn on the synthetic
 * terminal: the header follows the reasoning's bold title with ITS clock, the turn's clock beside it at 120 columns, the
 * tokens while the model writes; 33 s without data from the model become «No data from the model for …»; at the end
 * «✓ Done in …» with the silence in the summary, and the clock does not move any more (Claude Code #98720, the owner's
 * «thinking 306.1s»). At 80 columns the turn's clock is left out. Fake provider `STALL` and `SLOW`.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertEnglishOnly,idleFooter} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s43',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const activity=(x:Screen)=>x.lines.find(line=>/^ \S \S/u.test(line)&&/esc to stop|Done in|Stopped after|Failed after|No data from the model/u.test(line))?.trimEnd()??'';

test('s43 · the reasoning\'s title leads the line, with the phase\'s clock and the turn\'s',async()=>{
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t);
  await t.submit('STALL explain how sessions refresh');
  const reading=await t.waitFor('the reasoning\'s title on the line',x=>/^ \S Reading the login flow · \d+s · ↓ \d+ tokens · esc to stop   turn \d+s$/mu.test(x.text),{timeout:30_000});
  assertEnglishOnly(activity(reading));
  const writing=await t.waitFor('the answer is being written',x=>/^ \S Writing the answer · \d+s · ↓ \d+ tokens · esc to stop   turn \d+s$/mu.test(x.text),{timeout:20_000});
  const [, phase, turn]=/· (\d+)s · ↓.*turn (\d+)s/u.exec(activity(writing))!;
  assert.ok(Number(phase)<=Number(turn),`the phase's clock is its own, not the turn's: ${activity(writing)}`);
});

/* F-Q4 (owner 03/10): a silence of the model is no sentence — the line keeps its phase, clock and «esc to stop», only its colour
   changes (unit test activity-line.test.ts); here: no alarm text while the model is silent past 30 s. */
test('s43 · past 30 s without data the line keeps working, with no alarm sentence (F-Q4)',async()=>{
  const stalled=await t.waitFor('the silent phase past 30 s',x=>/^ \S \S.* · 3\ds · .*esc to stop/mu.test(x.text),{timeout:45_000});
  assert.ok(!idleFooter(stalled),'a silence is still a turn at work');
  assert.doesNotMatch(stalled.text,/No data from the model|still waiting|request stays open/u);
});

test('s43 · the end: «✓ Done in …» with the silence in the summary, and the clock stops',async()=>{
  const done=await t.waitFor('the turn ended',x=>idleFooter(x)&&x.text.includes('Second part after the silence.'),{timeout:30_000});
  const line=activity(done);
  assert.match(line,/^ ✓ Done in \d+s · the model was silent for 3\ds once$/u,`the end of the turn:\n${done.text}`);
  await pause(2_500);
  assert.equal(activity(t.screen()),line,'the clock does not count after the turn');
});

test('s43 · at 80 columns the turn\'s clock is left out',async()=>{
  await t.close();
  t=s.launch([],{cols:80,rows:24});
  await toComposer(t);
  await t.submit('SLOW tell me a story');
  const writing=await t.waitFor('the answer is being written',x=>/^ \S Writing the answer · \d+s · ↓ \d+ tokens · esc to stop$/mu.test(x.text),{timeout:20_000});
  assert.doesNotMatch(activity(writing),/turn \d/u);
  t.press('esc');
  const stopped=await t.waitFor('the turn stopped',x=>idleFooter(x)&&/^ ■ Stopped after \d+s/mu.test(x.text),{timeout:20_000});
  assertEnglishOnly(activity(stopped));
  await t.close();
});

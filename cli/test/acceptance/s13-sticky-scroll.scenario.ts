/**
 * s13 — an answer taller than the transcript region: the latest prompt is announced by a sticky row (Q-R1-9, gate E9),
 * and PgUp/PgDn and Ctrl+Home/Ctrl+End scroll the transcript with no mouse capture (gate E15, Q-R1-7).
 *
 * At 100×20 the Markdown answer (about 20 rows) is taller than the transcript region, so the prompt that asked for it
 * can only be on screen through the sticky row.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertMouseAsDecided,assertStickyPrompt} from './checks.ts';
import {stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const PROMPT='MD sticky prompt check';
const HEAD='Summary of the project';const TAIL='Second step';
const s=stage({name:'s13',files:{'README.md':'# demo\n','src/index.js':"console.log('hi')\n"}});
let t:TerminalSession;let answer:Screen;
const shows=(x:Screen,text:string)=>x.lines.some(line=>line.includes(text));

test('s13 · a Markdown answer taller than the transcript region arrives at 100×20',async()=>{
  t=s.launch([],{cols:100,rows:20});
  await toComposer(t);
  answer=await turn(t,s.fake,PROMPT);
  assert.ok(shows(answer,TAIL),`the end of the answer is on screen:\n${answer.text}`);
});

test('s13 · R1-STICKY the latest prompt is shown in a sticky row with "N earlier messages above"',()=>{
  assertStickyPrompt(answer,PROMPT);
});

test('s13 · R1-SCROLL PgUp scrolls the transcript back to the start of the answer and PgDn returns to the end',async()=>{
  assert.ok(!shows(answer,HEAD),`R1-SCROLL: the start of the answer ("${HEAD}") is already on screen, so there is nothing to scroll:\n${answer.text}`);
  let up:Screen|null=null;
  for(let i=0;i<4&&!up;i++){
    t.press('pageup');
    up=await t.waitFor(`R1-SCROLL: PgUp #${i+1} brings "${HEAD}" into view`,x=>shows(x,HEAD),{timeout:1_500}).catch(()=>null);
  }
  assert.ok(up,`R1-SCROLL: four PgUp never brought the start of the answer ("${HEAD}") into view:\n${t.screen().text}`);
  let down:Screen|null=null;
  for(let i=0;i<4&&!down;i++){
    t.press('pagedown');
    down=await t.waitFor(`R1-SCROLL: PgDn #${i+1} returns to "${TAIL}"`,x=>shows(x,TAIL)&&!shows(x,HEAD),{timeout:1_500}).catch(()=>null);
  }
  assert.ok(down,`R1-SCROLL: four PgDn never returned to the end of the answer ("${TAIL}"):\n${t.screen().text}`);
});

test('s13 · R1-SCROLL Ctrl+Home jumps to the start of the answer and Ctrl+End back to the latest',async()=>{
  t.press('ctrl+home');
  await t.waitFor(`R1-SCROLL: Ctrl+Home brings "${HEAD}" into view`,x=>shows(x,HEAD),{timeout:3_000});
  t.press('ctrl+end');
  await t.waitFor(`R1-SCROLL: Ctrl+End returns to "${TAIL}"`,x=>shows(x,TAIL)&&!shows(x,HEAD),{timeout:3_000});
});

/* stage 6c (owner 02/10) replaced REV-NATIVE-SELECTION: TALOS selects itself; Shift (or Alt in VS Code) gives the terminal's */
test('s13 · stage 6c: the mouse is on as decided while the keyboard scrolls',()=>{
  assertMouseAsDecided(t.output.read());
});

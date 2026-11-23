/**
 * s09 — the resume picker, a second launch, a session whose last run was cut off (review §B s09; D-04, D-08, D-09, D-10).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {idleFooter} from './checks.ts';
import {runCommand,stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const FIRST='hello first message';
const s=stage({name:'s09',files:{'README.md':'# demo\n'}});
let t:TerminalSession;let emptyPicker:Screen;let secondLaunch:Screen;let resumed:Screen;
/* stage 7.5: /resume is the mockup's sheet */
/* 03/11/2026: the sheet first says «Loading sessions» (fb6224ae0, «what may be heavy says so»); under load the scenario read that
   frame — the empty state not yet there (D-10), and the restart notice above the composer already naming FIRST. Opened = loaded. */
const pickerOpen=(x:Screen)=>x.text.includes('── Resume a conversation')&&!x.text.includes('Loading sessions');

test('s09 · /resume opens the resume picker',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  emptyPicker=await runCommand(t,'/resume',pickerOpen);
  t.press('esc');
  await t.waitFor('picker closed',x=>!pickerOpen(x),{timeout:5_000});
});

test('s09 · R4: D-10 the resume picker says when there is nothing to resume',()=>{
  assert.match(emptyPicker.text,/no (saved |previous |earlier )?(sessions?|conversations?)|nothing to resume/iu,'D-10: the empty resume picker has no empty-state text');
});

test('s09 · a session is started and its last run is cut off by closing TALOS mid-answer',async()=>{
  await turn(t,s.fake,FIRST);
  await t.submit('SLOW tell me a story');
  await t.waitForText('can be observed while it is still arriving',{timeout:20_000});
  await t.close();
});

test('s09 · R4: D-09 the full boot plays only on the first launch',async()=>{
  t=s.launch([],{cols:100,rows:30});
  secondLaunch=await t.waitFor('first paint of the second launch',x=>x.text.trim()!=='',{timeout:30_000});
  assert.doesNotMatch(secondLaunch.text,/BOOT\s+\d+%/u,'D-09: the second launch plays the full boot animation again');
});

test('s09 · the picker lists the session and resuming it shows the conversation',async()=>{
  await toComposer(t);
  const picker=await runCommand(t,'/resume',x=>pickerOpen(x)&&x.text.includes(FIRST));
  /* stage 7.5: a row is the name and when, under it `N messages · branch · model` (the sheet is per project) */
  assert.match(picker.text,/hello first message/u);
  /* 03/11/2026: the row names the model, the provider is in the footer («qwen3-coder-test · ollama: verified») */
  assert.match(picker.text,/[0-9]+ messages · (?:[^·|]+ · )?(?:ollama:)?qwen3-coder-test/u);
  t.press('enter');
  resumed=await t.waitFor('the resumed conversation',x=>!pickerOpen(x)&&/^ {2}OK$/mu.test(x.text),{timeout:15_000});
});

test('s09 · D-04 a resumed session shows what the person wrote',()=>{
  assert.ok(resumed.text.includes(FIRST),'D-04: the resumed conversation shows none of the person\'s messages');
});

test('s09 · D-08 a run that was cut off is not shown as still running',async()=>{
  /* The footer says the session is idle; the transcript must agree with it. */
  const idle=await t.waitFor('the resumed session settles',x=>idleFooter(x)/* UI Phase 0: no main roster row at idle */,{timeout:10_000});
  assert.doesNotMatch(idle.text,/Run · running|^ \S .*· esc to stop/mu,'D-08: the cut-off run is shown as running, with a live spinner');
});

test('s09 · Ctrl+C exits with code 0',async()=>{
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true,`TALOS is still running\n${t.dump('exit')}`);
  assert.equal(t.exit?.code,0);
});

/**
 * P13 (owner, 2026-09-25: open the sub-agents and watch their conversation live; decisions of 2026-09-26), on the BUILT CLI
 * behind the refusing sink. The parent delegates one slow sub-task (fake keyword DELEGATE). From the agents page, Enter on the agent
 * puts ITS transcript in the main view, live and read-only; Esc goes back without interrupting the turn; a finished agent
 * stays on screen as done until Esc; the parent then finishes normally.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s28',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;

const onPage=(x:{text:string})=>/^ Agents · this session/mu.test(x.text);
async function openAgent(){
  /* FE-048 (mockup `alt+a`): Alt+A shows the card at 110 columns, again the page; the page lists the child. */
  const shown=/▾ Agents\s/u.test(t.screen().text);
  t.press('alt+a');
  if(!shown){await t.waitFor('the agents card',x=>/▾ Agents\s/u.test(x.text),{timeout:10_000});t.press('alt+a');}
  // REV-AGENT-ROW-READY: the page can paint before the child is registered.
  await t.waitFor('the child on the agents page',x=>onPage(x)&&/SLOW child work/u.test(x.text),{timeout:10_000});
  t.press('enter');
  return t.waitFor('the agent\'s view',x=>/◂ Watching agent: SLOW child work {2}← back|◂ Agent finished: SLOW child work/u.test(x.text),{timeout:10_000});
}

test('s28 · Enter on an agent shows its transcript live, read-only; Esc goes back without stopping the turn',async()=>{
  t=s.launch([],{cols:110,rows:32});await toComposer(t);
  await t.submit('DELEGATE one sub-task');
  await t.waitFor('the agent is working, with the hint',x=>/^ \S Delegating to 1 agent · |^ ✓ Done in \S+ · 1 agent working/mu.test(x.text),{timeout:30_000});
  const viewing=await openAgent();
  assert.match(viewing.text,/read-only while viewing an agent/u);
  const live=await t.waitFor('the agent\'s own answer, streaming',x=>/This answer streams slowly/u.test(x.text),{timeout:15_000});
  assert.doesNotMatch(live.text,/DELEGATE one sub-task/u,'the main session\'s transcript is still on screen');
  await t.type('typed while watching');
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.doesNotMatch(t.screen().text,/typed while watching/u,'typing reached the composer while watching an agent');
  t.press('esc');
  const back=await t.waitFor('back to the main session',x=>/DELEGATE one sub-task/u.test(x.text)&&!/◂ (?:Watching agent|Agent finished): /u.test(x.text),{timeout:10_000});
  assert.doesNotMatch(back.text,/interrupted|Stopped/u,'Esc interrupted the turn');
  assert.doesNotMatch(back.text,/typed while watching/u,'what was typed while watching reached the composer');
});

test('s28 · a finished agent stays on screen as done; the parent then finishes',async()=>{
  await openAgent();
  const done=await t.waitFor('the agent is done',x=>/◂ Agent finished: SLOW child work {2}← back/u.test(x.text),{timeout:60_000});
  assert.match(done.text,/This answer streams slowly/u);
  t.press('esc');
  const end=await t.waitFor('the turn ended',x=>idleFooter(x)&&composerReady(x)&&/Done: the agent finished\./u.test(x.text),{timeout:60_000});
  assert.doesNotMatch(end.text,/◂ (?:Watching agent|Agent finished): /u);
});

test.after(async()=>{await sink.close();});

/**
 * s41 — stage 3, the plan card (owner 02/10). In plan mode the model proposes a plan with `present_plan`; until now the v2
 * bridge dropped the kernel's `talos.plan` and the turn waited forever. Now the card of the approved mockup takes the
 * composer's place (golden frame step-04-permessi-e-piano-t12s): the steps, «Approve and start · Edit the plan · Keep
 * planning», plus the owner's two keys (a, c). Enter approves (normal mode, asking before edits) and the transcript keeps
 * «▣ Plan proposed · 4 steps»; Esc keeps planning and leaves no row. Fake provider script `PLANME`.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertEnglishOnly,idleFooter,modeOf} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s41',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const GRACE_MS=450;
/* the mockup's mode row (checks.ts) */

async function toPlanMode(){
  for(let i=0;i<6&&modeOf(t.screen())!=='plan mode';i++){const before=modeOf(t.screen());t.press('shift+tab');await t.waitFor('the mode changed',x=>modeOf(x)!==before,{timeout:5_000});}
  assert.equal(modeOf(t.screen()),'plan mode','shift+tab reaches plan mode');
}

test('s41 · in plan mode the proposed plan opens the card as the mockup draws it',async()=>{
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t);
  await toPlanMode();
  await t.submit('PLANME move image export to a worker thread');
  const card=await t.waitFor('the plan card',x=>x.text.includes('Plan mode · TALOS proposes this plan and waits for you'),{timeout:30_000});
  for(const row of ['1. Move the resize pipeline into src/export/worker.ts','4. Add a test that exports 50 images without blocking the event loop',
    'Approve and start     Edit the plan     Keep planning    enter approve · e edit · esc keep planning','a approve and accept edits · c approve in a clean conversation'])
    assert.ok(card.text.includes(row),`the card shows «${row}»\n${card.text}`);
  assertEnglishOnly(card.text);
  assert.doesNotMatch(card.text,/^ \S Thinking\b/mu);
});

test('s41 · Esc keeps planning: the card closes, no plan row, still plan mode',async()=>{
  await pause(GRACE_MS);
  t.press('esc');
  const after=await t.waitFor('the turn ended after keep planning',x=>idleFooter(x)&&!x.text.includes('Plan mode · TALOS proposes'),{timeout:30_000});
  assert.ok(!after.text.includes('▣ Plan proposed'),'keep planning leaves no plan row');
  assert.equal(modeOf(after),'plan mode');
});

test('s41 · Enter approves: the transcript keeps the plan, the mode goes back to asking before edits',async()=>{
  await t.submit('PLANME again');
  await t.waitFor('the plan card again',x=>x.text.includes('Plan mode · TALOS proposes'),{timeout:30_000});
  await pause(GRACE_MS);
  t.press('enter');
  const done=await t.waitFor('the turn ended after the approval',x=>idleFooter(x)&&x.text.includes('Done: planned.')&&!x.text.includes('Plan mode · TALOS proposes'),{timeout:30_000});
  for(const row of ['▣ Plan proposed · 4 steps','1. Move the resize pipeline into src/export/worker.ts','4. Add a test that exports 50 images'])
    assert.ok(done.text.includes(row),`the transcript keeps «${row}»\n${done.text}`);
  assert.equal(done.text.split('▣ Plan proposed').length-1,1,'one plan row');
  assert.notEqual(modeOf(done),'plan mode','the approval leaves plan mode');
  const told=s.fake.chatRequests().at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
  assert.match(told,/approv/iu,'the model was told the plan is approved');
});

/**
 * s40 — stage 3 (owner 01-02/10): the model asks the person. Before, `ask_user_question` opened nothing and the turn waited
 * forever behind «thinking». Now the card of the approved mockup takes the composer's place (golden frame
 * step-03-domande-del-modello-t12s at 120×40), the answers go back to the kernel and the model, and the transcript keeps
 * «◆ Your answers»; esc cancels and leaves one dim notice. Fake provider script `ASKME` (the mockup's three questions).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertEnglishOnly,idleFooter} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s40',files:{'README.md':'# demo\n'}});
let t:TerminalSession;let card:Screen;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/* Past the 300 ms grace in which a key still belongs to the composer (as for approvals). */
const GRACE_MS=450;

test('s40 · the model\'s questions open the card as the mockup draws it',async()=>{
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t);
  await t.submit('ASKME how should the test wait');
  card=await t.waitFor('the question card',x=>x.text.includes('TALOS asks'),{timeout:30_000});
  for(const row of ['TALOS asks · 1 of 3 · 3 unanswered · closes in','Fix   Verify   Commit','How should the test wait for the session?',
    'This decides whether the test or the product changes.','› 1. Wait for the cookie  (Recommended)','│ preview','-  await page.waitForTimeout(500)',
    '4. Other','type your own answer','enter next · tab note · ←/→ questions · ctrl+] skip · esc cancel'])
    assert.ok(card.text.includes(row),`the card shows «${row}»\n${card.text}`);
  assertEnglishOnly(card.text);
  assert.doesNotMatch(card.text,/^ \S Thinking\b/mu,'while TALOS waits for the person the screen never says thinking');
});

test('s40 · Enter, the recommended check, a number and the review send the answers to the model',async()=>{
  await pause(GRACE_MS);
  t.press('enter');
  await t.waitFor('the second question',x=>x.text.includes('Which checks should TALOS run after the fix?'));
  t.press('enter');
  await t.waitFor('the third question',x=>x.text.includes('Commit the change when the checks pass?'));
  t.send('2');
  const review=await t.waitFor('the review',x=>x.text.includes('Ready to send your answers?'));
  assert.ok(review.text.includes('Send answers'));
  t.press('enter');
  const done=await t.waitFor('the turn ended with the answers',x=>idleFooter(x)&&x.text.includes('Done: answered.'),{timeout:30_000});
  for(const row of ['◆ Your answers','Fix  Wait for the cookie','Verify  Login e2e, 10 runs','Commit  Leave it uncommitted'])
    assert.ok(done.text.includes(row),`the transcript keeps «${row}»\n${done.text}`);
  assert.ok(!done.text.includes('TALOS asks'),'the card is gone');
  const told=s.fake.chatRequests().at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
  assert.match(told,/Wait for the cookie/u,'the model got the answer');
  assert.match(told,/Leave it uncommitted/u);
});

test('s40 · esc cancels: the model is told, the transcript says so once',async()=>{
  await t.submit('ASKME again');
  await t.waitFor('the card again',x=>x.text.includes('TALOS asks'),{timeout:30_000});
  await pause(GRACE_MS);
  t.press('esc');
  const after=await t.waitFor('the turn ended after the cancel',x=>idleFooter(x)&&x.text.includes('You cancelled the questions; TALOS was told and decides without them.'),{timeout:30_000});
  assert.equal(after.text.split('You cancelled the questions').length-1,1);
  assert.ok(!after.text.includes('TALOS asks'));
});

test('s40 · two keys at once (down then tab in one chunk) open the note on the highlighted option; Enter keeps it a note',async()=>{
  await t.submit('ASKME once more');
  await t.waitFor('the card for the note',x=>x.text.includes('TALOS asks'),{timeout:30_000});
  await pause(GRACE_MS);
  t.send('\x1b[B\t');
  await t.type('keep it small');
  await t.waitFor('the note being typed',x=>x.text.includes('note: keep it small'));
  t.press('enter');
  const kept=await t.waitFor('the note kept, still on the first question',x=>x.text.includes('note: keep it small')&&x.text.includes('How should the test wait for the session?'));
  assert.ok(kept.text.includes('› 2. Shorten the retry'),'the highlighted option did not move');
  t.press('esc');
  await t.waitFor('closed',x=>idleFooter(x)&&!x.text.includes('TALOS asks'),{timeout:30_000});
});

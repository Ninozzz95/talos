/**
 * s69 — a question of the model that nobody answers in time no longer stops the turn, on the BUILT CLI (110714a01; owner
 * 14/10/2026). `ui.questionTimeout` at its smallest (1 minute); the fake model asks one simple question (fake-provider ASKLATE);
 * nobody answers: the card closes, the transcript says TALOS went on, the fake receives the next request with the kernel's
 * instruction («The user did not answer in time. Continue with your best judgment …»), and the turn completes with its answer.
 * Fake model on 127.0.0.1 only.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {idleFooter} from './checks.ts';
import {exitTalos,stage,toComposer} from './harness.ts';

const s=stage({name:'s69',files:{'README.md':'# demo\n'}});
const EXPIRED='Nobody answered in time: the questions closed and TALOS went on with its own judgment, saying what it assumed.';

test('s69 · a question nobody answers closes after the timeout, and the turn goes on to its answer',{timeout:240_000},async()=>{
  const set=await s.profile.talos(['config','set','ui.questionTimeout',JSON.stringify('1m'),'--scope','user']);
  assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
  const t=s.launch([],{cols:120,rows:40});
  try{
    await toComposer(t);
    await t.submit('ASKLATE set up the example');
    const card=await t.waitFor('the question card',x=>x.text.includes('TALOS asks')&&x.text.includes('Which database should the example use?'),{timeout:30_000});
    assert.match(card.text,/closes in/u,`the card says it closes\n${card.text}`);
    const asked=Date.now();
    /* nobody answers */
    const done=await t.waitFor('the turn went on and ended',x=>idleFooter(x)&&x.text.includes('Went on without an answer: assumed SQLite.'),{timeout:150_000});
    const tookMs=Date.now()-asked;
    assert.ok(tookMs>=55_000,`the card closed after ${tookMs} ms, before its minute`);
    assert.ok(!done.text.includes('TALOS asks'),'the card is gone');
    assert.ok(done.text.replace(/\s+/gu,' ').includes(EXPIRED),`the transcript says TALOS went on\n${done.text}`);
    const next=s.fake.chatRequests().filter(r=>r.lastUser?.includes('ASKLATE')).at(-1);
    const told=next?.toolTexts?.map(x=>x.text).join('\n')??'';
    assert.match(told,/did not answer in time/u,`the model was told nobody answered: ${told.slice(0,400)}`);
    assert.match(told,/best judgment/u);
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

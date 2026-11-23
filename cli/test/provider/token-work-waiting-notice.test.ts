/*
 * Fourth review of 0.6.2 (bugfixer, 13/10/2026), S-1 and S-2. Closing the runtime waits for a ChatGPT renewal on its way, at most
 * 15 s (chatgpt-plan.ts `TOKEN_WORK_EXIT_LIMIT_MS`): right, and silent — the screen has already left and the terminal sits with
 * nothing printed, which reads as a hang. And the supervisor replaces a runtime by closing the old one: the same 15 s could
 * stall a retry. `sayIfSlow` is the small piece both cures use: the work's own answer, and one call when it is still on its way
 * after the delay — never when it was quick, never twice, never after it ended.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {sayIfSlow,TOKEN_WORK_NOTICE_MS,TOKEN_WORK_REPLACE_LIMIT_MS,TOKEN_WORK_EXIT_LIMIT_MS} from '../../src/provider/chatgpt-plan.ts';

const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

test('quick work says nothing and gives its answer',async()=>{
  let said=0;
  assert.equal(await sayIfSlow(Promise.resolve('done'),30,()=>{said+=1;}),'done');
  await sleep(60);
  assert.equal(said,0,'the notice was said for work that ended at once');
});

test('work still on its way after the delay is said once, and its answer still comes back',async()=>{
  let said=0;
  const work=sleep(120).then(()=>'late');
  const answer=sayIfSlow(work,30,()=>{said+=1;});
  await sleep(60);assert.equal(said,1,'nothing was said while the terminal sat waiting');
  assert.equal(await answer,'late');
  await sleep(60);assert.equal(said,1);
});

test('a failing work fails as itself, and a notice that throws never replaces the answer',async()=>{
  await assert.rejects(sayIfSlow(Promise.reject(new Error('the work')),30,()=>{}),/the work/u);
  assert.equal(await sayIfSlow(sleep(60).then(()=>7),10,()=>{throw new Error('a broken stderr');}),7);
});

test('the notice comes about a second in, and a replaced runtime waits far less than an exit',()=>{
  assert.ok(TOKEN_WORK_NOTICE_MS>=500&&TOKEN_WORK_NOTICE_MS<=2_000);
  assert.ok(TOKEN_WORK_REPLACE_LIMIT_MS<=3_000&&TOKEN_WORK_REPLACE_LIMIT_MS<TOKEN_WORK_EXIT_LIMIT_MS);
});

/* Review of 0.6.3 (bugfixer, 13/10/2026), S4: a runtime the supervisor replaced waited two seconds for its renewal and went on;
   that renewal then belonged to nobody, and a quit while it was still out could be cut by the exit backstop — the lost session
   the third review of 0.6.2 had closed. What a replaced runtime leaves on its way is kept, and the next close waits for it. */
test('what a replaced runtime left on its way is waited for by the next close, once, and forgotten when it ends',async()=>{
  const {keepLeftBehind,settleLeftBehind}=await import('../../src/provider/chatgpt-plan.ts');
  assert.deepEqual(await settleLeftBehind(),{waited:false,timedOut:false},'nothing left behind, nothing waited');
  let ended=false;
  keepLeftBehind(sleep(80).then(()=>{ended=true;}));
  const settled=await settleLeftBehind({limitMs:1_000});
  assert.equal(ended,true,'the close returned with the work still on its way');
  assert.deepEqual(settled,{waited:true,timedOut:false});
  assert.deepEqual(await settleLeftBehind(),{waited:false,timedOut:false},'kept after it ended');
  /* bounded: work that never ends holds the close for the limit and no longer */
  keepLeftBehind(new Promise<void>(()=>{}));
  const started=Date.now();
  assert.deepEqual(await settleLeftBehind({limitMs:60}),{waited:true,timedOut:true});
  assert.ok(Date.now()-started<1_000);
});

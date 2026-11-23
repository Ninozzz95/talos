/**
 * The status row's «<provider>: verified / not verified» (C1R, owner 07/10/2026 «tienilo»), on the BUILT CLI. The adversarial
 * review of 0.6.0 found that the real screen had never drawn it since 0.5.0: the stand-ins `main.ts` hands the screen
 * (runtime/deferred-context.ts) did not carry `providerState` / `refreshProviderState`, and every test of the badge mounted the
 * app on a catalog that had them. This scenario is the one that would have seen it.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exitTalos,stage,toComposer} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s63',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const badge=(text:string)=>text.match(/\b([a-z0-9-]+): (verified|not verified)\b/u);

test('s63 · the status row says whether the provider of the model was checked, on the real program',async()=>{
  t=s.launch([],{cols:120,rows:40});await toComposer(t);
  const shown=await t.waitFor('the provider badge',x=>badge(x.text)!==null,{timeout:20_000});
  const first=badge(shown.text)!;
  assert.equal(first[1],'ollama',`the badge names the provider of the model in use:\n${shown.text}`);
  /* the fake provider answers: once the one background check lands the row reads «verified», and it never goes back */
  const verified=await t.waitFor('verified',x=>/\bollama: verified\b/u.test(x.text),{timeout:20_000});
  assert.doesNotMatch(verified.text,/not verified/u);
  await exitTalos(t);
});

test('s63 · the next start reads the answer it kept: «verified» with no new check',async()=>{
  const before=s.fake.requests.length;
  t=s.launch([],{cols:120,rows:40});await toComposer(t);
  const shown=await t.waitFor('the provider badge',x=>badge(x.text)!==null,{timeout:20_000});
  assert.match(shown.text,/\bollama: verified\b/u,`a fresh answer is shown as it is, never «not verified» first:\n${shown.text}`);
  await new Promise(resolve=>setTimeout(resolve,2_500));
  assert.equal(s.fake.requests.length,before,'a fresh answer sends no check to the provider at start');
  await exitTalos(t);
});

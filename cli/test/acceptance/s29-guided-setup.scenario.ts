/**
 * P17 (owner, 2026-09-25: a very simple guided setup at the first launch; decisions of 2026-09-26) and stage 7.10d (owner
 * 03/10: the setup is the mockup's four-tab sheet, «stesso foglio anche al primo avvio»), on the BUILT CLI behind the refusing
 * sink, each case on a fresh profile:
 * - no provider: the trust question first, then the sheet on «1 Provider» with the local engine that runs first; Enter goes
 *   through «2 Key» (no key needed), «3 Model» and «4 Check», then Esc says "Ready" with the model and three hints;
 * - /setup opens it again, and Esc ends it;
 * - `talos setup` opens it even when everything is configured;
 * - a local engine that does not answer: «3 Model» says so, r tries again, Esc ends the setup and says how to come back.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {exitTalos,stage} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const env=sinkEnv(sink);
const fresh=stage({name:'s29-fresh',files:{'README.md':'# demo\n'},useModel:false,extraEnv:env,trusted:false});
const ready=stage({name:'s29-ready',files:{'README.md':'# demo\n'},extraEnv:env});
/* An Ollama address nothing listens on: the engine is "down". */
const down=stage({name:'s29-down',files:{'README.md':'# demo\n'},useModel:false,extraEnv:{...env,OLLAMA_BASE_URL:'http://127.0.0.1:9'}});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const size={cols:110,rows:40};
const SHEET=/── Setup provider, key, model · step by step/u;
let t:TerminalSession;

test('s29 · first launch with no provider: trust, then the setup sheet through its four tabs, then Ready',async()=>{
  t=fresh.launch([],size);
  const trust=await t.waitFor('the trust question',x=>/Trust this folder/u.test(x.text),{timeout:30_000});
  assert.match(trust.text,/TALOS · Setup · Trust this folder\?/u);
  await sleep(1150);await t.type('y'); /* past the one-second grace (judge v2242) */await sleep(150);t.press('enter'); /* y: Yes, trust this folder (No is the default since 02/11) */
  const provider=await t.waitFor('the sheet on its provider tab',x=>SHEET.test(x.text)&&/1 Provider {3}2 Key {3}3 Model {3}4 Check/u.test(x.text)&&/› [●○] Ollama Local \(no key\)/u.test(x.text),{timeout:30_000});
  assert.doesNotMatch(provider.text,/Step \d of 4/u,'the old windows are gone');
  t.press('enter');
  await t.waitFor('the key tab: no key needed',x=>/Ollama Local runs on this computer: no key needed\./u.test(x.text),{timeout:15_000});
  t.press('enter');
  const model=await t.waitFor('the model tab',x=>SHEET.test(x.text)&&/on this computer · free/u.test(x.text),{timeout:30_000});
  assert.doesNotMatch(model.text,/recommended/iu,'decision 6: no model is proposed');
  t.press('enter');
  const check=await t.waitFor('the check tab',x=>/✓ Engine answers/u.test(x.text)&&/Ready\. Esc and start talking\./u.test(x.text),{timeout:30_000});
  assert.match(check.text,/Model answers/u);assert.match(check.text,/Tools work/u);
  t.press('esc');
  const done=await t.waitFor('Ready',x=>!SHEET.test(x.text)&&/✓ Ready · ollama:[^ ]+ · type your first message/u.test(x.text),{timeout:15_000});
  assert.match(done.text,/\/help commands · Shift\+Tab permissions · \/setup to change this/u);
});

test('s29 · /setup opens it again; Esc ends it, and TALOS is ready',async()=>{
  await t.waitFor('the composer',x=>composerReady(x)&&idleFooter(x),{timeout:10_000});
  await t.submit('/setup');
  const again=await t.waitFor('the sheet again',x=>SHEET.test(x.text),{timeout:15_000});
  assert.match(again.text,/● Ollama Local \(no key\)/u,'the provider in use is marked');
  t.press('esc');
  /* Everything was already set: ending the setup says TALOS is ready, not that something was skipped. */
  const ended=await t.waitFor('ready again',x=>!SHEET.test(x.text)&&(x.text.match(/✓ Ready · ollama:/gu)??[]).length>=2,{timeout:10_000});
  assert.doesNotMatch(ended.text,/Setup skipped/u);
  await exitTalos(t);
});

test('s29 · `talos setup` opens the setup even when everything is configured',async()=>{
  const u=ready.launch(['setup'],size);
  await u.waitFor('the sheet',x=>SHEET.test(x.text),{timeout:30_000});
  u.press('esc');
  await u.waitFor('ready',x=>/✓ Ready ·/u.test(x.text),{timeout:10_000});
  await exitTalos(u);
});

test('s29 · a local engine that does not answer: the model tab says so, r tries again, Esc ends the setup',async()=>{
  const u=down.launch([],size);
  await u.waitFor('the sheet',x=>SHEET.test(x.text)&&/Ollama Local \(no key\)/u.test(x.text),{timeout:30_000});
  /* about thirty providers: «/» searches them (owner 03/10, the filter approved for /provider and /setup) */
  u.send('/');await sleep(200);await u.type('ollama');await sleep(300);u.press('enter');await sleep(200);
  u.press('enter');
  await u.waitFor('no key needed',x=>/Ollama Local runs on this computer: no key needed\./u.test(x.text),{timeout:15_000});
  u.press('enter');
  const stopped=await u.waitFor('the engine is down',x=>/is not answering at http:\/\/127\.0\.0\.1:9/u.test(x.text),{timeout:30_000});
  assert.match(stopped.text,/r try again/u);
  u.send('r');
  await sleep(1500);
  assert.match(u.screen().text,/is not answering at http:\/\/127\.0\.0\.1:9/u,'r did not try again, or the sheet closed');
  u.press('esc');
  await u.waitFor('skipped',x=>!SHEET.test(x.text)&&/Setup skipped/u.test(x.text),{timeout:10_000});
  await exitTalos(u);
});

test('s29 · no request left 127.0.0.1',()=>{assert.deepEqual(sink.hits,[],`TALOS tried to reach the network: ${JSON.stringify(sink.hits)}`);});
test.after(async()=>{await sink.close();});

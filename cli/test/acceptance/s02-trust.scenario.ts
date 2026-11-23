/**
 * s02 — first launch in a folder with AGENTS.md: the trust question, saying No, trusting it (review §B s02; D-06, D-09; owner
 *   decision 2, 02/11: Yes · Yes, and the folder that contains it · Only this time · No, No by default).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s02',files:{'README.md':'# demo\n','AGENTS.md':'Always answer in English.\n','src/index.js':"console.log('hi')\n"},trusted:false});
/* Q-R4-2: the trust question ignores keys for its first second (judge v2242; 300 ms before). */
const pastGuard=()=>new Promise(resolve=>setTimeout(resolve,1150));
let t:TerminalSession;let question:Screen;let afterCancel='';

test('s02 · a folder with AGENTS.md asks whether to trust it, with No as the default',async()=>{
  t=s.launch([],{cols:100,rows:30});
  question=await t.waitForText('Trust this folder?',{timeout:30_000});
  assert.match(question.text,/AGENTS\.md/u);
  assert.match(question.text,/[›>] No/u);
  assert.match(question.text,/Only this time/u);assert.match(question.text,/Nothing is saved/u);
});

test('s02 · R4: D-09 the trust question prints the folder with single backslashes',()=>{
  assert.doesNotMatch(question.text,/\\\\/u,'D-09: the folder path is printed with doubled backslashes');
});

test('s02 · R4: D-09 the trust question names each resource once',()=>{
  assert.doesNotMatch(question.text,/AGENTS\.md · AGENTS\.md/u,'D-09: the resource is listed as "AGENTS.md · AGENTS.md"');
});

test('s02 · Enter on No opens TALOS without the folder: the fixed line, and /trust asks again',async()=>{
  await pastGuard();t.press('enter');
  await t.waitFor('the fixed line',x=>/This folder isn't trusted: its instructions are off\. \/trust to change/u.test(x.text),{timeout:20_000});
  await t.submit('/trust');
  await t.waitFor('the question again',x=>/Trust this folder\?/u.test(x.text),{timeout:20_000});
  await pastGuard();
});

test('s02 · choosing "Yes, trust this folder" opens TALOS at the composer',async()=>{
  await t.close();
  t=s.launch([],{cols:100,rows:30});
  await t.waitForText('Trust this folder?',{timeout:30_000});
  await pastGuard();await t.type('y');
  await t.waitForText(/[›>] Yes, trust this folder/u,{timeout:5_000});
  t.press('enter');
  /* A5d (CLI 0.7.0, 19/11/2026): the Home is the first screen (mockup index.html:948-956, the medal beside the words), a frame of ~6 KB
     that ConPTY lets out in two pieces, the footer last and after its synchronized block (harness.ts, wholeFrame): the model row below is
     judged on the whole frame, as a person sees it, and not on ConPTY's first piece. Red 9 of 10 before, on the candidate's head. */
  const ready=await toComposer(t,{whole:true});
  /* the mockup's model row: the model, then its provider's badge (0.6.2: the badge reaches the real screen; before the one
     check was kicked the row still reads the full model id) */
  /* second review of 0.6.2 (13/10/2026): «not verified» was accepted here for a provider that answers. The fake provider is
     healthy: at the composer the row is the full id, «checking…» or already «verified», and it ends at «verified». */
  assert.match(ready.text,/^ (?:ollama:qwen3-coder-test|qwen3-coder-test · ollama: (?:verified|checking…)) · /mu);
  await t.waitFor('the healthy provider reads verified',x=>/^ qwen3-coder-test · ollama: verified · /mu.test(x.text),{timeout:20_000});
});

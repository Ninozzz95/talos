/**
 * s04 — command menu, Enter on a command, /model, help, mode cycle (review §B s04; D-02, D-10).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertHeightBudgeted,composerReady,modeOf} from './checks.ts';
import {clearComposer,runCommand,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s04',files:{'README.md':'# demo\n','src/index.js':"console.log(1)\n"}});
let t:TerminalSession;
/* stage 7.10a-b: /model and /provider are the mockup's sheets */
const pickerOpen=(x:Screen)=>/── Model |── Models |── AI provider|│Model ·|│Provider/u.test(x.text);
async function backToComposer(){
  if(pickerOpen(t.screen())||t.screen().text.includes('│Commands')){t.press('esc');await t.waitFor('overlay closed',x=>!pickerOpen(x)&&!x.text.includes('│Commands'),{timeout:5_000});}
  await clearComposer(t);
}

test('s04 · typing / opens the command menu with descriptions',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  await t.type('/mo');
  const menu=await t.waitForText('› /model · Choose a model and its reasoning effort',{timeout:10_000});
  assert.match(menu.text,/│Commands/u);
});

test('s04 · R4: D-10 Enter on the highlighted command runs it',async()=>{
  await new Promise(r=>setTimeout(r,60));
  t.press('enter');
  try{await t.waitFor('D-10: Enter on "/model" opens the model picker',pickerOpen,{timeout:4_000});}
  finally{await backToComposer();}
});

/* R4 gate E15: the old wait matched `qwen3-coder-test` in the picker's header while it was still loading, so this check was
   green on a loading frame while every Ollama answered PROVIDER_INVALID … 0 models (the kernel's CATALOGHI_DIRETTI leaves
   local engines out; review D-10 had seen it on the default port). The wait now names the final state in the title
   (`live list` / `NOT VERIFIED`). Owner Q-R4-10: the CLI reads Ollama's /api/tags itself (lane F). */
test('s04 · R4: R4-MODEL /model lists the models of the local Ollama as a live list',async()=>{
  const picker=await runCommand(t,'/model',pickerOpen);
  let settled;
  try{settled=await t.waitFor('the sheet with its rows',x=>/── Model /u.test(x.text)&&/qwen3-coder-test|could not be reached|PROVIDER_INVALID/u.test(x.text),{timeout:15_000});}
  finally{await backToComposer();}
  assert.ok(picker);
  assert.doesNotMatch(settled.text,/not verified/u,`R4-MODEL: /model did not load a live list:\n${settled.text}`);
  assert.ok(settled.text.includes('qwen3-coder-test')&&!/could not be reached|PROVIDER_INVALID/u.test(settled.text),`R4-MODEL: the live list does not hold the fake Ollama model:\n${settled.text}`);
});

test('s04 · D-02 the help overlay fits the screen',async()=>{
  t.send('?');
  const help=await t.waitFor('help open',x=>/│Help +│/u.test(x.text),{timeout:10_000})/* R5b D7: grouped /help, known by its title */;
  t.press('esc');await t.waitFor('help closed',x=>!/│Help +│/u.test(x.text)&&composerReady(x),{timeout:5_000});
  assertHeightBudgeted(help);
});

test('s04 · R4: D-10 the permission modes have human names',async()=>{
  /* UI Phase 0 D4: the welcome says "permission mode" too, so the mode is read where the shortcut line starts */
  const before=modeOf(t.screen());
  t.press('shift+tab');
  const after=await t.waitFor('the mode changed',x=>{const m=modeOf(x);return Boolean(m&&m!==before);},{timeout:5_000});
  assert.doesNotMatch(after.text,/mode (acceptEdits|bypassPermissions|dontAsk)\b/u,'D-10: the footer shows the internal identifier of the permission mode');
});

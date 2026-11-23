/**
 * s01 — first launch in a folder with no project resources and no model (review §B s01; D-03, D-09).
 * R4 (owner Q-R4-1…4): every new folder is asked first, in the alternate screen, before anything is loaded; the boot plays
 * after the answer and says that a key skips it.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {stage} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s01',files:{'README.md':'# demo\n','src/index.js':"console.log('hi')\n"},useModel:false,trusted:false});
let t:TerminalSession;let first:Screen;let boot:Screen;let ready:Screen;
const TRUST=/trust this folder/iu;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('s01 · TALOS starts in the alternate screen',async()=>{
  t=s.launch([],{cols:100,rows:30});
  first=await t.waitFor('the first frame',x=>TRUST.test(x.text)||/BOOT\s+\d+%/u.test(x.text),{timeout:30_000});
  assert.equal(first.buffer,'alternate');
});

test('s01 · R4: D-09 trust is asked for a folder with no project resources',()=>{
  assert.match(first.text,TRUST,'D-09: a plain folder is not asked whether to trust it');
});

test('s01 · after the trust answer the boot animation plays in the alternate screen',async()=>{
  if(TRUST.test(first.text)){
    /* Q-R4-2: keys are ignored for 1 s (judge v2242; 300 ms before); No is highlighted (02/11), so move up to "Yes, trust this folder" first. */
    await sleep(1150);
    for(let i=0;i<4&&!t.screen().lines.some(line=>/[›>]\s*Yes, trust this folder/u.test(line));i++){t.press('up');await sleep(150);}
    t.press('enter');
  }
  boot=await t.waitFor('boot frame',x=>/BOOT\s+\d+%/u.test(x.text),{timeout:30_000});
  assert.equal(boot.buffer,'alternate');
});

test('s01 · R4: D-09 the boot says that any key skips it',()=>{
  assert.match(boot.text,/any key|skip/iu,'D-09: the boot animation does not say that a key skips it');
});

/* P17 (owner decisions 2026-09-26): with no provider the first launch opens the guided setup; Esc skips it and names
   /setup, /provider and /model (before P17: a checklist of the two commands). */
test('s01 · REV-SETUP-OVERLAY-FOOTER: setup opens and Esc restores the model state',async()=>{
  if(/BOOT\s+\d+%/u.test(t.screen().text))t.press('space');
  /* stage 7.10d: the setup is the four-tab sheet */
  await t.waitFor('the guided setup',x=>/── Setup provider, key, model · step by step/u.test(x.text)&&/1 Provider/u.test(x.text),{timeout:30_000});
  /* A tall provider list may cover the footer; check model state after the overlay closes. */
  t.press('esc');
  ready=await t.waitFor('the composer after the setup',x=>/Setup skipped\. \/setup starts it again; \/provider and \/model change one thing\./u.test(x.text)&&composerReady(x)&&idleFooter(x),{timeout:15_000});
  assert.match(ready.text,/^ none · \/provider · /mu);/* the mockup's model row */
});

test('s01 · D-03 the composer is anchored to the bottom of the screen',()=>{
  const row=ready.lines.findIndex(line=>composerReady({...ready,lines:[line],text:line}));
  assert.ok(row>=0,'the composer row is on screen');
  assert.ok(row>=ready.rows-6,`D-03: the composer sits on row ${row+1} of ${ready.rows}; the rows below it are empty`);
});

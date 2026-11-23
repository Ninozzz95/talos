/*
 * P17 (owner decisions 2026-09-26): the first launch runs the guided setup only for what is missing — no provider, a chosen
 * provider with no usable key, no model — and never for a key that exists but is benched (it is explained, Hermes #113720);
 * each window says its step; the end says Ready with the model, or how to come back; `talos setup` is the setup, not a prompt;
 * the first launch's trust question is step 1.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCliArgs} from '../../src/args.ts';
import {setupEndLines,setupStart} from '../../src/tui/setup-wizard.ts';

const base={firstLaunch:true,providerChosen:true,providerUsable:true,keyBenched:false,modelChosen:true};

test('P17: the setup starts at the first missing step, only on the first launch, never for a benched key',()=>{
  assert.deepEqual(setupStart(base),{start:false},'nothing missing');
  assert.deepEqual(setupStart({...base,firstLaunch:false,providerChosen:false}),{start:false},'not the first launch');
  assert.deepEqual(setupStart({...base,providerChosen:false,providerUsable:false,modelChosen:false}),{start:true,from:'provider'});
  assert.deepEqual(setupStart({...base,providerUsable:false}),{start:true,from:'key'});
  assert.deepEqual(setupStart({...base,providerUsable:false,keyBenched:true}),{start:false},'a benched key is explained, not asked again');
  assert.deepEqual(setupStart({...base,modelChosen:false}),{start:true,from:'model'});
});

/* stage 7.10d (owner 03/10): «every window says its step» went with the windows: the steps are the setup sheet's tabs
   (setup-sheet.test.ts, r7-setup-sheet.test.ts). */

test('P17: the end says Ready with the model and three hints, or how to come back',()=>{
  assert.deepEqual(setupEndLines({ready:true,model:'ollama:qwen3'}),['✓ Ready · ollama:qwen3 · type your first message','/help commands · Shift+Tab permissions · /setup to change this']);
  assert.deepEqual(setupEndLines({ready:false}),['Setup skipped. /setup starts it again; /provider and /model change one thing.']);
});

test('P17: `talos setup` is the guided setup, not a prompt saying "setup"; anything else is unchanged',()=>{
  const setup=parseCliArgs(['setup']);
  assert.equal(setup.command,'run');assert.equal(setup.setup,true);assert.equal(setup.prompt,undefined);assert.equal(setup.interactive,true);
  assert.equal(parseCliArgs(['setup','my','project']).setup,undefined,'more words are a prompt');
  assert.equal(parseCliArgs(['setup','my','project']).prompt,'setup my project');
  assert.equal(parseCliArgs(['-p','setup']).setup,undefined,'a headless run never runs the setup');
  assert.equal(parseCliArgs([]).setup,undefined);
});

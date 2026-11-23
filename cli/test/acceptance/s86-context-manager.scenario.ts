/**
 * C4 of the redesign, from the BUILT CLI against the real context engine: /context opens the Context Manager after a real turn; a fact is added
 * and removed through the service, a setting saved and read back, and the fixed row asks before compacting. What it says survives a reopening,
 * because it comes from the engine's store and not from the page.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FAKE_MODEL_ID,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s86',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const TITLE=/── Context Manager This chat only\. The originals stay available\./u;

test('s86 · the Context Manager works on the true engine',async()=>{
  /* the engine runs only for a model with a known window: without it the page says so (context-page.test.ts) */
  const set=await s.profile.talos(['config','set',`models.${FAKE_MODEL_ID}.contextWindow`,'131072','--scope','user']);
  assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
  const t=s.launch([],{cols:120,rows:30});await toComposer(t);
  try{
    await t.submit('A first turn, so that the chat has a context');
    await t.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
    await t.submit('/context');
    const page=await t.waitFor('the page',x=>TITLE.test(x.text)&&/Overview/u.test(x.text),{timeout:15_000});
    assert.match(page.text,/Compact now…/u);
    console.log('FRAME s86 overview\n'+page.text);
    t.press('tab');await t.waitFor('Compactions',x=>/No compactions yet in this chat\./u.test(x.text),{timeout:5_000});
    t.press('tab');await t.waitFor('Keep in mind',x=>/These facts stay separate from the compaction\./u.test(x.text),{timeout:5_000});
    t.send('n');await t.waitFor('the edit row',x=>/Fact to keep:/u.test(x.text),{timeout:5_000});
    await t.type('Never touch the ledger');t.press('enter');
    const saved=await t.waitFor('the fact is there',x=>TITLE.test(x.text)&&/Never touch the ledger/u.test(x.text)&&/Fact saved/u.test(x.text),{timeout:15_000});
    console.log('FRAME s86 fact\n'+saved.text);
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/context');await t.waitFor('open again',x=>TITLE.test(x.text),{timeout:15_000});
    t.press('tab');t.press('tab');
    await t.waitFor('it survived the reopening',x=>/Never touch the ledger/u.test(x.text),{timeout:5_000});
    t.send('d');await t.settled();t.send('d');
    await t.waitFor('removed',x=>/Fact removed/u.test(x.text)&&/No protected facts/u.test(x.text),{timeout:15_000});
    t.press('tab');await t.waitFor('Versions',x=>/No versions yet in this chat\./u.test(x.text),{timeout:5_000});
    t.press('tab');await t.waitFor('Settings',x=>/Recent exchanges to keep +2/u.test(x.text)&&/Set by the CLI: starts by itself at \d+%/u.test(x.text),{timeout:5_000});
    t.press('enter');await t.waitFor('its edit row',x=>/Recent exchanges to keep: +2/u.test(x.text),{timeout:5_000});
    t.press('backspace');t.send('5');t.press('enter');
    await t.waitFor('saved and read back',x=>/Settings saved/u.test(x.text)&&/Recent exchanges to keep +5/u.test(x.text),{timeout:15_000});
    /* owner 01/11: «Request sent», the last request as it went, from the kernel's memory */
    t.press('tab');const sent=await t.waitFor('Request sent',x=>/messages · \d+ tools/u.test(x.text)&&/^ +You\b/mu.test(x.text)&&/Instructions(?: \d+ of \d+)? +\d+ chars/u.test(x.text),{timeout:5_000});
    console.log('FRAME s86 request sent\n'+sent.text);
    t.send('c');await t.waitFor('it asks',x=>/c confirm · esc cancel/u.test(x.text),{timeout:5_000});
    t.press('esc');await t.waitFor('it took it back',x=>TITLE.test(x.text)&&!/c confirm/u.test(x.text),{timeout:5_000});
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

/**
 * FE-048 (agents as a card of the right panel and a full page, as the approved mockup),
 * on the BUILT CLI behind the refusing sink. The parent delegates one slow sub-task (fake keyword DELEGATE:LONG, ~45 s of work), then:
 *   Ctrl+A with the composer empty opens the card on the right (42 columns; the rest of the screen narrower);
 *   Ctrl+A with text in the composer stays readline's line start;
 *   Ctrl+A again opens the page (tabs, the child), Tab filters, Esc goes back to the card, Ctrl+A on the page closes both;
 *   below 110 columns Ctrl+A opens the page directly;
 *   the footer names the agents («← 1 agent»).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clearComposer,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s45',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;
const carded=(x:Screen)=>/▾ Agents\s/u.test(x.text);
const onPage=(x:Screen)=>/^ Agents · this session/mu.test(x.text);

test('s45 · Ctrl+A opens the agents card; with text it is the line start; again the page; Esc and Ctrl+A close',async()=>{
  t=s.launch([],{cols:120,rows:36});await toComposer(t);
  await t.submit('DELEGATE:LONG one sub-task');
  await t.waitFor('the agent is working, and the footer names it',x=>/LONG child work|1 agent working|Delegating to 1 agent/u.test(x.text)&&/← 1 agent /u.test(x.text),{timeout:30_000});

  t.press('ctrl+a');
  const card=await t.waitFor('the agents card',x=>carded(x)&&/LONG child work/u.test(x.text),{timeout:10_000});
  assert.ok(card.lines.every(line=>line.length<=120),'no row is wider than the terminal');
  assert.match(card.lines[0]!,/^ TALOS {2}/u,'the header stays at the left edge');

  /* with text, Ctrl+A is the line start: the card stays, the page does not open, the next key lands at the start */
  await t.type('abc');
  await t.waitFor('the draft',x=>/abc/u.test(x.text));
  t.press('ctrl+a');await t.settled();
  t.send('X');
  const draft=await t.waitFor('the key typed at the line start',x=>/Xabc/u.test(x.text),{timeout:5_000});
  assert.equal(onPage(draft),false,'Ctrl+A with text opened the agents page');
  t.press('ctrl+e');await clearComposer(t);

  t.press('ctrl+a');
  const page=await t.waitFor('the full page',x=>onPage(x)&&/LONG child work/u.test(x.text),{timeout:10_000});
  assert.match(page.text,/ All 1 .* Waiting for you 0 .* Errors 0 .* Finished 0 .* Stopped 0/u);
  assert.equal(carded(page),false,'the page takes the whole screen');
  t.press('tab');
  await t.waitFor('the Waiting for you tab has nobody',x=>onPage(x)&&/No agents here\./u.test(x.text),{timeout:5_000});
  t.press('right');
  await t.waitFor('the Timeline lists the child',x=>onPage(x)&&/Delegations over time/u.test(x.text)&&/LONG child work/u.test(x.text),{timeout:5_000});
  t.press('esc');
  await t.waitFor('Esc goes back to the card',x=>!onPage(x)&&carded(x),{timeout:5_000});
  t.press('ctrl+a');
  await t.waitFor('Ctrl+A from the card opens the page',onPage,{timeout:5_000});
  t.press('ctrl+a');
  const closed=await t.waitFor('Ctrl+A on the page closes both',x=>!onPage(x)&&!carded(x),{timeout:5_000});
  assert.match(closed.lines[0]!,/^ TALOS {2}/u,'the header is back at the left edge');
});

test('s45 · below 110 columns Ctrl+A opens the page directly, and closes it',async()=>{
  t.resize(80,24);
  await t.waitFor('the narrow screen',x=>x.lines.every(line=>line.length<=80)&&/^ TALOS {2}/mu.test(x.text),{timeout:5_000});
  t.press('ctrl+a');
  const page=await t.waitFor('the page at 80 columns',x=>onPage(x)&&/LONG child work/u.test(x.text),{timeout:10_000});
  assert.equal(carded(page),false,'no card below 110 columns');
  t.press('ctrl+a');
  await t.waitFor('closed again',x=>!onPage(x)&&!carded(x),{timeout:5_000});
  await t.close();
});

test.after(async()=>{await sink.close();});

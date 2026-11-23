/**
 * s53 — long chats, tappa D (owner 07/10 night «prima la coda»): a resumed conversation starts with its last 5 turns, a dim row at the top says how many
 * earlier messages wait, scrolling up at the top (or a click on the row) loads them, and the transcript (Ctrl+O) is the whole conversation.
 * Codex tui/src/app_server_session/history.rs:29-31 (5 turns first, pages of 100) and app/event_dispatch.rs:317-326 (the next page when the view nears the top).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {idleFooter} from './checks.ts';
import {stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const TURNS=8;
const prompt=(n:number)=>`history question number ${n}`;
const s=stage({name:'s53',files:{'README.md':'# demo\n'}});
let t:TerminalSession;let resumed:Screen;let afterPageUp:Screen;let transcript:Screen;
const ROW=/↑ (\d+) earlier messages? not loaded · click or scroll up to load/u;

test('s53 · a session of eight turns is made and closed',async()=>{
  t=s.launch([],{cols:100,rows:40});
  await toComposer(t);
  for(let n=1;n<=TURNS;n++)await turn(t,s.fake,prompt(n));
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true,`TALOS is still running\n${t.dump('exit')}`);
});

test('s53 · resuming it shows the last five turns and the row that offers the older ones',async()=>{
  t=s.launch(['--resume','last'],{cols:100,rows:40});
  resumed=await t.waitFor('the resumed conversation with its row',x=>ROW.test(x.text)&&idleFooter(x),{timeout:30_000});
  assert.ok(resumed.text.includes(prompt(TURNS)),'the newest turn is on the screen');
  assert.ok(resumed.text.includes(prompt(TURNS-4)),'the fifth turn from the end is the first one drawn');
  assert.ok(!resumed.text.includes(prompt(TURNS-5)),'the turn before it waits behind the row');
  assert.ok(!resumed.text.includes(prompt(1)),'and so does the first');
  assert.equal(Number(ROW.exec(resumed.text)![1]),(TURNS-5)*2,'three older turns of a prompt and an answer each: six messages');
});

test('s53 · scrolling up at the top loads the older turns and the row goes away',async()=>{
  t.press('pageup');
  afterPageUp=await t.waitFor('the older turns are on the screen',x=>x.text.includes(prompt(1))&&!ROW.test(x.text),{timeout:10_000});
  assert.ok(afterPageUp.text.includes(prompt(1)));
  assert.ok(afterPageUp.text.includes(prompt(TURNS)),'and the newest is still there');
});

test('s53 · Ctrl+C exits',async()=>{
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true,`TALOS is still running\n${t.dump('exit')}`);
  assert.equal(t.exit?.code,0);
});

test('s53 · the transcript mode is the whole conversation, with nothing to load',async()=>{
  t=s.launch(['--resume','last'],{cols:100,rows:40});
  await t.waitFor('the resumed conversation with its row',x=>ROW.test(x.text)&&idleFooter(x),{timeout:30_000});
  t.press('ctrl+o');
  transcript=await t.waitFor('the transcript shows the first question',x=>x.text.includes(prompt(1)),{timeout:10_000});
  assert.ok(transcript.text.includes(prompt(1)));
  t.press('esc');
  const back=await t.waitFor('back to the conversation',x=>idleFooter(x)&&!ROW.test(x.text),{timeout:10_000});
  assert.ok(!ROW.test(back.text),'what the transcript showed stays on the list: no row any more');
});

test('s53 · closes',async()=>{
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true,`TALOS is still running\n${t.dump('exit')}`);
});

test('s53 · on a short screen PageUp first scrolls to the row, and only a PageUp at the top loads the older turns',async()=>{
  t=s.launch(['--resume','last'],{cols:100,rows:20});
  const first=await t.waitFor('the resumed conversation with its row',x=>idleFooter(x)&&x.text.includes(prompt(TURNS)),{timeout:30_000});
  assert.ok(!first.text.includes(prompt(1)));
  let loaded:Screen|null=null;let rowSeenAfterScroll=false;
  for(let press=1;press<=8&&!loaded;press++){
    t.press('pageup');await t.observe(250);
    const now=t.screen();
    if(now.text.includes(prompt(1))&&!ROW.test(now.text))loaded=now;
    else if(ROW.test(now.text))rowSeenAfterScroll=true;
  }
  assert.ok(loaded,`the older turns never loaded\n${t.dump('pageup')}`);
  assert.ok(rowSeenAfterScroll,'the row was on the screen (scrolled to) before the next PageUp loaded the older turns');
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true);
});

test('s53 · a click on the row loads the older turns',async()=>{
  const ESC='\u001b';
  t=s.launch(['--resume','last'],{cols:100,rows:40});
  await t.waitFor('the resumed conversation with its row',x=>ROW.test(x.text)&&idleFooter(x),{timeout:30_000});
  await t.observe(300); /* the mouse reports are asked for once the first frame is up */
  const lines=t.screen().lines;const row=lines.findIndex(line=>ROW.test(line));
  assert.ok(row>=0);
  const col=lines[row]!.indexOf('earlier')+1;
  t.send(`${ESC}[<0;${col+1};${row+1}M${ESC}[<0;${col+1};${row+1}m`);
  const loaded=await t.waitFor('the older turns are on the screen',x=>x.text.includes(prompt(1))&&!ROW.test(x.text),{timeout:10_000});
  assert.ok(loaded.text.includes(prompt(TURNS)));
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true);
});

test('s53 · the mouse wheel up at the top loads the older turns, and the wheel down does not',async()=>{
  const ESC='\u001b';
  t=s.launch(['--resume','last'],{cols:100,rows:40});
  await t.waitFor('the resumed conversation with its row',x=>ROW.test(x.text)&&idleFooter(x),{timeout:30_000});
  await t.observe(300);
  t.send(`${ESC}[<65;10;10M`);                      /* wheel down at the bottom: nothing to scroll, nothing to load */
  await t.observe(400);
  assert.ok(ROW.test(t.screen().text),'a wheel down does not load');
  t.send(`${ESC}[<64;10;10M`);                      /* wheel up */
  const loaded=await t.waitFor('the older turns are on the screen',x=>x.text.includes(prompt(1))&&!ROW.test(x.text),{timeout:10_000});
  assert.ok(loaded.text.includes(prompt(TURNS)));
  for(let i=0;i<3&&!t.exit;i++){t.press('ctrl+c');await t.waitForExit(1_500);}
  assert.equal(await t.waitForExit(10_000),true);
});

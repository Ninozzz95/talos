/**
 * C6 of the redesign, from the BUILT CLI on true sessions: /board lists them in the table and in the lanes, with the state of the PC's cascade; a
 * session opens from there; /resume filters, orders, and a selection of two is deleted for real after a second `d` that says how many.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s87',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const BOARD=/── Board What is running, how it went/u,RESUME=/── Resume a conversation/u;

async function oneTurn(prompt:string){
  const t=s.launch([],{cols:120,rows:36});await toComposer(t);
  await t.submit(prompt);
  await t.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
  /* an ordered exit: `close()` kills the process, and a killed one loses the tail of its journal, so its state is not recorded */
  await t.submit('/exit');await t.waitForExit(15_000);await t.close();
}

test('s87 · the Board and Conversations on true sessions',async()=>{
  await oneTurn('The first piece of work');await oneTurn('The second piece of work');await oneTurn('The third piece of work');
  const t:TerminalSession=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/board');
    const table=await t.waitFor('the table',x=>BOARD.test(x.text)&&/The third piece of work/u.test(x.text),{timeout:15_000});
    assert.match(table.text,/Table +Lanes/u);assert.match(table.text,/All 3 +In progress 0/u);assert.match(table.text,/Concluded 3/u);
    assert.match(table.text,/Session +State +Model +Tokens +Started/u);
    console.log('FRAME s87 table\n'+table.text);
    t.press('tab');
    const lanes=await t.waitFor('the lanes',x=>/In progress 0 +Waiting for you 0 +To resume 0 +Concluded 3/u.test(x.text),{timeout:5_000});
    console.log('FRAME s87 lanes\n'+lanes.text);
    t.press('esc');await t.waitFor('closed',x=>!BOARD.test(x.text),{timeout:5_000});
    await t.submit('/resume');
    await t.waitFor('the list',x=>RESUME.test(x.text)&&/The first piece of work/u.test(x.text),{timeout:15_000});
    await t.waitFor('its filters',x=>/All 3 +In progress 0 +Waiting for you 0 +Concluded 3/u.test(x.text),{timeout:5_000});
    t.send('v');await t.waitFor('selecting',x=>/Select sessions/u.test(x.text),{timeout:5_000});
    t.send(' ');await t.waitFor('one marked',x=>/1 selected/u.test(x.text),{timeout:5_000});
    t.press('down');await t.settled();t.send(' ');
    await t.waitFor('two marked',x=>/2 selected/u.test(x.text),{timeout:5_000});
    t.send('d');
    const asked=await t.waitFor('it says how many',x=>/Delete 2 sessions\? Their transcripts are removed from disk\. This cannot be undone\./u.test(x.text),{timeout:5_000});
    console.log('FRAME s87 delete\n'+asked.text);
    t.send('d');
    await t.waitFor('deleted, and the list reads again',x=>RESUME.test(x.text)&&/All 1 /u.test(x.text),{timeout:15_000});
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

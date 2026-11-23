/**
 * C9 of the redesign, from the BUILT CLI: /automations makes an automation on the page (what, then when), it shows in the List and in the
 * Calendar, space pauses it (and the Calendar no longer draws it), r with no process running the automations says how to start one,
 * d twice deletes it. What the page says comes from the kernel's store on disk.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s90',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const TITLE=/── Automations runs that start by themselves/u;
const flat=(text:string)=>text.replace(/[ │]*\n[ │]*/gu,' ');

test('s90 · the Automations page',async()=>{
  const t=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/automations');
    await t.waitFor('the empty page',x=>TITLE.test(x.text)&&/No automations yet\./u.test(flat(x.text)),{timeout:15_000});
    t.send('n');await t.waitFor('what',x=>/What should it do\?/u.test(x.text),{timeout:5_000});
    await t.type('Check the README for typos');t.press('enter');
    await t.waitFor('when',x=>/When\? \(daily 09:00/u.test(x.text),{timeout:5_000});
    await t.type('hourly');t.press('enter');
    const made=await t.waitFor('the row',x=>TITLE.test(x.text)&&/\[x\] Check the README for typos/u.test(x.text)&&/next in/u.test(x.text),{timeout:15_000});
    assert.match(made.text,/All 1 +Active 1 +Paused 0 +To review 0/u);assert.match(made.text,/hourly · never ran/u);
    console.log('FRAME s90 list\n'+made.text);
    const store=join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','automations');
    assert.ok(existsSync(store)&&readdirSync(store).some(name=>name.endsWith('.json')),'the automation is in the kernel store on disk');
    t.press('tab');
    const week=await t.waitFor('the Calendar',x=>/an hour per cell/u.test(x.text)&&/A {2}Check the README for typos · hourly · \d+ hours with a run/u.test(x.text),{timeout:5_000});
    console.log('FRAME s90 calendar\n'+week.text);
    t.press('tab');await t.waitFor('back to the List',x=>/\[x\] Check the README/u.test(x.text),{timeout:5_000});
    t.send(' ');await t.waitFor('paused',x=>/\[ \] Check the README for typos/u.test(x.text)&&/Paused 1/u.test(x.text),{timeout:15_000});
    t.press('tab');await t.waitFor('nothing drawn',x=>/No active automation runs in the next seven days\./u.test(flat(x.text)),{timeout:5_000});
    t.press('tab');await t.waitFor('the List',x=>/\[ \] Check the README/u.test(x.text),{timeout:5_000});
    t.send('r');await t.waitFor('no host',x=>/Nothing runs the automations now: keep «talos automation serve» open in a terminal\./u.test(flat(x.text)),{timeout:15_000});
    if(!TITLE.test(t.screen().text)){await t.submit('/automations');await t.waitFor('again',x=>TITLE.test(x.text),{timeout:15_000});}
    t.send('d');await t.waitFor('asks',x=>/Press d again to delete/u.test(x.text),{timeout:5_000});
    t.send('d');await t.waitFor('deleted',x=>TITLE.test(x.text)&&/No automations yet\./u.test(flat(x.text)),{timeout:15_000});
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/exit');await t.waitForExit(15_000);
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

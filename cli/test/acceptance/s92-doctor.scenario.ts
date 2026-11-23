/**
 * C9 of the redesign, from the BUILT CLI: /doctor alone opens the Doctor page from `talos doctor --json` (the verdict in two lines, the
 * checks, what was found), r checks again, x writes the report into the profile's data folder. /doctor with its options stays the command.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s92',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const TITLE=/── Doctor Whether TALOS can work here, check by check/u;

test('s92 · the Doctor page',async()=>{
  const t=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/doctor');
    const page=await t.waitFor('the page',x=>TITLE.test(x.text)&&/\d+ of \d+ checks pass · TALOS /u.test(x.text),{timeout:60_000});
    assert.match(page.text,/[✓!] (Ready: a turn can run here\.|Needs attention: )/u);assert.match(page.text,/Checks/u);assert.match(page.text,/Settings folder/u);
    console.log('FRAME s92 doctor\n'+page.text);
    t.send('x');
    const dir=join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','doctor');
    await t.waitFor('written',x=>/Doctor report written to /u.test(x.text.replace(/\n/gu,' '))||(existsSync(dir)&&readdirSync(dir).length>0),{timeout:15_000});
    const file=readdirSync(dir).find(name=>name.endsWith('.json'));assert.ok(file,'the report is on disk');
    assert.equal(JSON.parse(readFileSync(join(dir,file!),'utf8')).schema,'talos.cli.doctor.v1');
    t.send('r');await t.waitFor('again',x=>TITLE.test(x.text)&&/checks pass/u.test(x.text),{timeout:60_000});
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/exit');await t.waitForExit(15_000);
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

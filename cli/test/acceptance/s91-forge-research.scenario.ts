/**
 * C9 of the redesign, from the BUILT CLI: /forge and /research open as pages with their filters and say what is empty and what to do,
 * and space on an empty Forge list or c on an empty Research list does nothing.
 */
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s91',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const flat=(text:string)=>text.replace(/[ │]*\n[ │]*/gu,' ');

test('s91 · the Forge and Research pages',async()=>{
  const t=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/forge');
    const forge=await t.waitFor('Forge',x=>/── Forge Tools made in the forge/u.test(x.text)&&/All 0 +Enabled 0 +Disabled 0/u.test(x.text)&&/No forged tools yet\./u.test(flat(x.text)),{timeout:15_000});
    console.log('FRAME s91 forge\n'+forge.text);
    t.send(' ');t.press('esc');await t.waitFor('closed',x=>!/── Forge /u.test(x.text),{timeout:5_000});
    await t.submit('/research');
    const research=await t.waitFor('Research',x=>/── Research Questions researched on the web/u.test(x.text)&&/All 0 +Running 0 +Paused 0 +Done 0 +Stopped 0/u.test(x.text)&&/No research in this project yet\. Ask for one in a chat\./u.test(flat(x.text)),{timeout:15_000});
    console.log('FRAME s91 research\n'+research.text);
    t.send('c');t.press('tab');await t.waitFor('Evidence',x=>/Its detail is read when you choose it/u.test(flat(x.text)),{timeout:5_000});
    t.press('esc');await t.waitFor('closed',x=>!/── Research /u.test(x.text),{timeout:5_000});
    await t.submit('/exit');await t.waitForExit(15_000);
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

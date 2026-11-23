/**
 * C8 of the redesign, from the BUILT CLI: /capability before any turn says the tools appear after the first one; after a real turn it lists the
 * tools the last request really carried, with the PC's estimate; /mcp, /plugins and /hooks open the same page on their tab.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s89',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const TITLE=/── Capability Tools, skills and connectors/u;

test('s89 · the Capability page',async()=>{
  const t=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/capability');
    const before=await t.waitFor('the page before a turn',x=>TITLE.test(x.text),{timeout:15_000});
    assert.match(before.text,/Tools +Skills +Connectors +Plugins +Hooks/u);
    /* the words wrap in the list's column (s89 found them cut there): read across the wrap */
    assert.match(before.text.replace(/[ │]*\n[ │]*/gu,' '),/No request sent yet in this chat: the tools appear after the first turn\./u);
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('A first turn, so that a request is sent');
    await t.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
    await t.submit('/capability');
    const tools=await t.waitFor('the tools',x=>TITLE.test(x.text)&&/tools? offered in the last request · ~\d+ tokens of schema per turn \(estimate\)/u.test(x.text),{timeout:15_000});
    assert.match(tools.text,/~\d+ tok/u);
    console.log('FRAME s89 tools\n'+tools.text);
    t.press('tab');await t.waitFor('Skills',x=>/No skills in this project\.|Skills/u.test(x.text),{timeout:5_000});
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/mcp');
    const mcp=await t.waitFor('Connectors',x=>TITLE.test(x.text)&&/No connectors configured\./u.test(x.text),{timeout:15_000});
    console.log('FRAME s89 connectors\n'+mcp.text);
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/plugins');await t.waitFor('Plugins',x=>TITLE.test(x.text)&&/No plugins installed\./u.test(x.text),{timeout:15_000});
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/hooks');await t.waitFor('Hooks',x=>TITLE.test(x.text)&&/No hooks configured\./u.test(x.text),{timeout:15_000});
    t.press('esc');await t.waitFor('closed',x=>!TITLE.test(x.text),{timeout:5_000});
    await t.submit('/exit');await t.waitForExit(15_000);
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

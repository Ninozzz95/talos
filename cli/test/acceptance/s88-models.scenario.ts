/**
 * C7 of the redesign, from the BUILT CLI: /model filters by capability and a star survives a new launch, in the file the kernel's module writes; /models
 * shows the providers and the device with figures read from it, and says what is not measured. /provider opens the same page.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s88',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const MODEL=/── Model /u,MODELS=/── Models Choose where models run/u;

test('s88 · the model picker and the Models page',async()=>{
  let t=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/model');
    const page=await t.waitFor('the picker',x=>MODEL.test(x.text)&&/1 {2}Reasons/u.test(x.text),{timeout:15_000});
    assert.match(page.text,/Models +Where it runs/u);assert.match(page.text,/In use/u);
    console.log('FRAME s88 model\n'+page.text);
    t.send('f');await t.waitFor('starred',x=>/\* /u.test(x.text),{timeout:5_000});
    t.send('4');await t.waitFor('the filter on',x=>/✓ Free/u.test(x.text),{timeout:5_000});
    t.send('z');await t.waitFor('the filter off',x=>!/✓ Free/u.test(x.text),{timeout:5_000});
    t.press('esc');await t.waitFor('closed',x=>!MODEL.test(x.text),{timeout:5_000});
  }finally{await t.close();}
  const file=join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','model-preferences.json');
  assert.ok(existsSync(file),'the star is on disk');assert.equal(JSON.parse(readFileSync(file,'utf8')).schema,'talos.model-preferences.v1');
  assert.equal(JSON.parse(readFileSync(file,'utf8')).preferiti.length,1);
  t=s.launch([],{cols:120,rows:36});await toComposer(t);
  try{
    await t.submit('/model');
    await t.waitFor('the star survived',x=>MODEL.test(x.text)&&/\* /u.test(x.text),{timeout:15_000});
    t.press('esc');await t.waitFor('closed',x=>!MODEL.test(x.text),{timeout:5_000});
    await t.submit('/models');
    const models=await t.waitFor('Models',x=>MODELS.test(x.text),{timeout:15_000});
    assert.match(models.text,/Providers +System/u);
    t.press('tab');
    const system=await t.waitFor('System',x=>/The device, without guesses/u.test(x.text),{timeout:5_000});
    assert.match(system.text,/Memory .* free of /u);assert.match(system.text,/Disk .* free of /u);assert.match(system.text,/Graphics memory +not measured/u);
    console.log('FRAME s88 system\n'+system.text);
    t.press('esc');await t.waitFor('closed',x=>!MODELS.test(x.text),{timeout:5_000});
    await t.submit('/provider');await t.waitFor('the same page',x=>MODELS.test(x.text),{timeout:15_000});
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

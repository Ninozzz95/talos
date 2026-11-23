import assert from 'node:assert/strict';
import test from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {clearComposer,exitTalos,runCommand,stage,toComposer,turn} from './harness.ts';

const s=stage({name:'s38',files:{'README.md':'# command chunk\n'},extraEnv:{TALOS_REDUCED_MOTION:'1'}});
test('REV-COMMAND-CHUNK-CLI: coalesced prefix, model selection, natural follow-up and restart',{timeout:90_000},async()=>{
 let t=s.launch([],{cols:100,rows:30});
 try{
  await toComposer(t);
  t.send('/mo');
  await t.waitForText('› /model · Choose a model and its reasoning effort',{timeout:3000});
  t.press('enter');
  /* stage 7.10a: the mockup's sheet; a confirmed list has no «not verified» */
  await t.waitFor('the selected command opens the model sheet',x=>/── Model /u.test(x.text)&&/qwen3-coder-test/u.test(x.text)&&!/not verified/u.test(x.text),{timeout:15000});
  t.press('esc');await t.waitFor('model sheet closed',x=>!/── Model /u.test(x.text)&&composerReady(x));
  await clearComposer(t);
  const first='Comandi: ricrda https://example.com/progetto, grazie.';
  await turn(t,s.fake,first);
  await turn(t,s.fake,'Continua dal progetto precedente.');
  assert.ok(await exitTalos(t));await t.close();
  t=s.launch([],{cols:100,rows:30});await toComposer(t);
  await runCommand(t,'/resume',x=>x.text.includes('── Resume a conversation')&&x.text.includes('Comandi:'));
  t.press('enter');
  await t.waitFor('the same conversation survives restart',x=>!x.text.includes('── Resume a conversation')&&x.text.includes('progetto precedente')&&composerReady(x)&&idleFooter(x),{timeout:15000});
  await turn(t,s.fake,'Riprendi dopo il riavvio.');
  assert.ok(JSON.stringify(s.fake.chatRequests().at(-1)).includes('Riprendi dopo il riavvio.'));
  assert.ok(await exitTalos(t));
 }finally{await t.close();}
});

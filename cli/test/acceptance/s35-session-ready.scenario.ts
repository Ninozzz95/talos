/** Desktop REV-SESSION-READY delivery: real CLI/kernel, synthetic ConPTY, local scripted model. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {exitTalos,runCommand,stage,toComposer,turn} from './harness.ts';

const s=stage({name:'s35',files:{'README.md':'# session readiness\n'},extraEnv:{TALOS_REDUCED_MOTION:'1'}});
for(const size of [{cols:60,rows:30},{cols:120,rows:36}])test(`REV-SESSION-READY-E2E ${size.cols} compact, follow-up, restart and resume`,{timeout:90_000},async()=>{
 const first=`Session ${size.cols}: ricrda il progetto.`;
 const follow=`Continua ${size.cols}, grazie.`;
 let t=s.launch([],size);
 try{
  await toComposer(t);
  await turn(t,s.fake,first);
  /* stage 7.9: /compact runs in the mockup's sheet; its result and the notice stay until Close (Esc) */
  const compact=await runCommand(t,'/compact',x=>/── Compact/u.test(x.text)&&/Compacted: |Context (?:compacted\.|is already compact\.)/u.test(x.text),{timeout:30_000});
  assert.doesNotMatch(compact.text,/SESSION_NOT_READY|no conversation to compact|still running|✗ Writing the summary/iu);
  t.press('esc');await t.waitFor('the sheet closed',x=>!/── Compact/u.test(x.text)&&composerReady(x)&&idleFooter(x),{timeout:10_000});
  await turn(t,s.fake,follow);
  assert.equal(s.fake.chatRequests().at(-1)?.lastUser,follow);
  console.log(`FRAME ${size.cols} compact and follow-up\n${t.screen().text}`);
  assert.ok(await exitTalos(t));
  await t.close();
  t=s.launch([],size);
  await toComposer(t);
  await runCommand(t,'/resume',x=>x.text.includes('── Resume a conversation')&&x.text.includes(first));
  t.press('enter');
  const resumed=await t.waitFor('persisted conversation restored',x=>!x.text.includes('── Resume a conversation')&&x.text.includes(follow)&&/^ {2}OK$/mu.test(x.text)&&composerReady(x)&&idleFooter(x),{timeout:15_000});
  assert.ok(resumed.text.includes(first),'the first prompt survives the restart');
  console.log(`FRAME ${size.cols} resumed\n${resumed.text}`);
  const final=`Riprendi ${size.cols} dal punto precedente.`;
  await turn(t,s.fake,final);
  assert.equal(s.fake.chatRequests().at(-1)?.lastUser,final);
  assert.ok(await exitTalos(t));
 }finally{await t.close();}
});

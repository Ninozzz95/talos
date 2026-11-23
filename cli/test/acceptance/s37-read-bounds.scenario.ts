/** REV-READ-BOUNDS: final composer -> real vendored tool -> local provider -> restart/resume. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {exitTalos,runCommand,stage,toComposer,turn} from './harness.ts';

const cap=1024*1024;
const s=stage({name:'s37',files:{'README.md':'# bounded read\n','big.txt':'a'.repeat(cap*3)},extraEnv:{TALOS_REDUCED_MOTION:'1'}});
test('REV-READ-BOUNDS-CLI: bounded text, honest binary size, restart and follow-up from the composer',{timeout:120_000},async()=>{
 const first='BIGREAD leggi il log, ricrda https://example.com/progetto.';
 let t=s.launch([],{cols:120,rows:36});
 try{
  await toComposer(t);await turn(t,s.fake,first);
  const text=s.fake.chatRequests().at(-1)?.toolTexts?.[0]?.text??'';
  /* G02: the unified kernel reads LINES (owner decision D1): one 3 MiB line is shown up to 2,000 characters, the header
     says so, and the line ends with the byteOffset to continue inside it — bounded, and declared */
  assert.match(text,/^\[TALOS read lines 1-1 of 1 in "big\.txt"; EOF reached; 1 over-long line\(s\) shown up to 2000 characters/u);
  assert.match(text,/continue inside it with leggi byteOffset=2000\]/u);
  assert.ok(text.length<4_000,`bounded: ${text.length} characters reached the model`);
  const binary=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10,0]),Buffer.alloc(cap*2,65)]);
  writeFileSync(join(s.profile.project,'big.txt'),binary);
  const second='BIGREAD ora controlla il nuovo file, grazie.';
  await turn(t,s.fake,second);
  const result=s.fake.chatRequests().at(-1)?.toolTexts?.[0]?.text??'';
  assert.match(result,new RegExp(`${binary.length} bytes on disk`,'u'));
  assert.match(result,/binary file/u);assert.doesNotMatch(result,/\u0000|\uFFFD/u);
  assert.ok(await exitTalos(t));await t.close();
  t=s.launch([],{cols:120,rows:36});await toComposer(t);
  await runCommand(t,'/resume',x=>x.text.includes('── Resume a conversation')&&x.text.includes('BIGREAD'));
  t.press('enter');
  await t.waitFor('the bounded read conversation survives restart',x=>!x.text.includes('── Resume a conversation')&&x.text.includes('nuovo file')&&composerReady(x)&&idleFooter(x),{timeout:15_000});
  writeFileSync(join(s.profile.project,'big.txt'),'restored plain text\n');
  await turn(t,s.fake,'BIGREAD riprendi e rileggi dopo il riavvio.');
  /* F-027 (kernel merge): an implicit full read has no [TALOS read...] header — the whole result is the data boundary
     (probe tmp/sonda-s37-confine.mjs 07/10; contracts r5a-r-context-engine.test.ts, read-cut-frame.test.ts). */
  const resumed=s.fake.chatRequests().at(-1)?.toolTexts?.[0]?.text??'';
  const id=/id=([0-9a-f]{12})/.exec(resumed)?.[1]??'';
  const atteso=`<<<TALOS_DATA id=${id} from="leggi big.txt">>>\nrestored plain text\n\n<<<END_TALOS_DATA id=${id}>>>`;
  assert.equal(resumed,atteso);
  assert.ok(await exitTalos(t));
 }finally{await t.close();}
});

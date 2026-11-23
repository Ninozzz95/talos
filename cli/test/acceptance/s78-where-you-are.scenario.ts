/*
 * s78 — 0.6.11, the kernel's «where you are» note (desktop r4 345177d1e, c53ceddcf `doveNelPrompt`; owner 20/10/2026: «Sì, come
 * nel Desktop», with a Privacy line in the CHANGELOG). agent-service.mjs turns it on for every non-mobile session, the CLI's too:
 * the model is told the working folder's REAL path and the real platform, and the old «Piattaforma: win32» line is gone. On the
 * built CLI and the fake provider: the first request carries one system note with the project's path, in English, and no
 * Italian platform line. The path holds the PC user name: it reaches a cloud provider too (the Privacy line).
 */
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {test} from 'node:test';
import {stage} from './harness.ts';

const s=stage({name:'s78-where-you-are',files:{'README.md':'# demo\n'}});

test('s78 · the first request tells the model the real working folder and platform, once, in English',async()=>{
  const run=await s.profile.talos(['-p','Say hello in one word.','--output-format','json'],120_000);
  assert.equal(run.status,0,`${run.stdout}${run.stderr}`);
  const first=s.fake.chatRequests()[0];
  assert.ok(first,'the fake received a request');
  const notes=(first!.systemTexts??[]).filter(text=>text.startsWith('Where you are — working folder: '));
  assert.equal(notes.length,1,JSON.stringify(first!.systemTexts));
  const folder=notes[0]!.slice('Where you are — working folder: '.length).split('\n')[0]!;
  assert.equal(folder.toLowerCase(),realpathSync.native(s.profile.project).toLowerCase(),notes[0]);
  assert.match(notes[0]!,process.platform==='win32'?/^Platform: Windows\./mu:/^Platform: /mu,notes[0]);
  assert.ok(!(first!.systemTexts??[]).some(text=>/Piattaforma:/u.test(text)),'the old Italian platform line is gone');
});

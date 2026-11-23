/*
 * P19 (owner 27/09, session cad61a7e on talos-code 0.3.0): a turn that fails AFTER its tools answered — there a compaction
 * that failed, here a provider error — left the context archive one exchange ahead of the session's history, and every
 * later turn stopped with "This conversation no longer matches its saved context". The session must go on.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {idleFooter} from './checks.ts';
import {FAKE_MODEL_ID,stage,toComposer,turn} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s17',files:{'README.md':'# demo\n'}});
let t:TerminalSession;

test('s17 · a turn fails after its tool answered (HTTP 500 on the request that carries the result)',async()=>{
  /* F-ENG-3 (09/10/2026): the Context Engine archives only for a model with a known window; the fake's is set here, or this
     scenario passes with no archive to diverge from (it did until then). */
  const set=await s.profile.talos(['config','set',`models.${FAKE_MODEL_ID}.contextWindow`,'131072','--scope','user']);
  assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  const before=s.fake.chatRequests().length;
  await t.submit('TOOLFAIL read the readme');
  const failed=await t.waitFor('the turn failed after the tool',x=>idleFooter(x)&&/^ ✗ Failed after \d/mu.test(x.text)&&s.fake.chatRequests().slice(before).some(r=>r.lastUser?.startsWith('TOOLFAIL')),{timeout:90_000});
  assert.match(failed.text,/● Read 1 file · ctrl\+o|Read file README\.md/u,'the tool ran before the failure');
  assert.ok(existsSync(join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','context','context.sqlite')),'the Context Engine archived nothing: P19 would be proven on nothing');
});

test('s17 · P19: the next turn is answered — no "no longer matches its saved context"',async()=>{
  const screen=await turn(t,s.fake,'hello again');
  assert.doesNotMatch(screen.text,/no longer matches its saved context/u,'P19: the session stopped after a failed turn (CTX_HISTORY_DIVERGED)');
  assert.match(screen.text,/^ {2}OK$/mu);
});

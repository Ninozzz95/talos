/**
 * F-ENG-3 (stress test of 0.5.0, 08/10/2026; known issue of 0.5.0): a session whose TALOS process is killed in the middle of a
 * turn — a crash, a power cut, the system closing it for low memory — could not be resumed: `--resume` failed with
 * CTX_HISTORY_DIVERGED. On the BUILT CLI through ConPTY: a turn reads a file, then its answer streams; the process is killed
 * while it streams; `--resume last` opens the conversation and the next message is answered.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {after,test} from 'node:test';
import {idleFooter} from './checks.ts';
import {FAKE_MODEL_ID,stage,toComposer,turn} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
after(()=>sink.close());
const s=stage({name:'s56',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;

test('s56 · a session killed while its answer streams resumes and answers the next message',async()=>{
  /* The Context Engine archives a session only for a model with a known window (talos-composition.ts profileForSession);
     the fake's own window is not read, so it is set here, as r5a-hermes-form does. Without it this scenario passes on the
     defect: no archive, nothing to diverge from. */
  const set=await s.profile.talos(['config','set',`models.${FAKE_MODEL_ID}.contextWindow`,'131072','--scope','user']);
  assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
  t=s.launch(['--permission-mode','bypassPermissions'],{cols:100,rows:30});
  try{
    await toComposer(t);
    await t.submit('KILLME read the readme then talk');
    await t.waitFor('the answer streams after the read',x=>/esc to stop/u.test(x.text)&&x.text.includes('This answer streams slowly'),{timeout:60_000});
  }finally{await t.close();/* the pty's kill: the process ends with no chance to finish the turn */}
  assert.ok(existsSync(join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','context','context.sqlite')),'the Context Engine did not archive the killed turn: this scenario would prove nothing');
  t=s.launch(['--resume','last'],{cols:100,rows:30});
  try{
    await toComposer(t);
    const end=await turn(t,s.fake,'hello after the kill');
    assert.doesNotMatch(end.text,/CTX_HISTORY_DIVERGED|no longer matches its saved context/u,`the resumed session refused the turn:\n${end.text}`);
    assert.match(end.text,/^ {2}OK$/mu,`the next message was not answered:\n${end.text}`);
    assert.ok(idleFooter(end));
  }finally{await t.close();}
});

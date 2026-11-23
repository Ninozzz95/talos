/**
 * Owner 09/10/2026 («Avvisa, poi chiede o ferma»; the stress test's model read AGENTS.md 130 times in 18 minutes). On the BUILT
 * CLI through ConPTY: a model that reads the same file again and again gets a note from the 2nd time, and at the 5th the person
 * is asked. «No» ends the turn with its reason. In `-p`, with nobody to ask, the turn ends there. Decision 158 (owner
 * 04/11/2026): Full access answers this question by itself, as Claude Code's bypassPermissions (full-access-155-04-11.test.ts),
 * so the scenario runs in the default mode.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {approvalVisible,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer} from './harness.ts';

const s=stage({name:'s59',files:{'README.md':'# demo\n'}});

test('s59 · the 5th identical read asks the person; no ends the turn',async()=>{
  const t=s.launch(['--permission-mode','default'],{cols:110,rows:34});
  try{
    await toComposer(t);
    const before=s.fake.chatRequests().length;
    await t.submit('LOOPME keep reading');
    const card=await t.waitFor('the question after the 5th read',x=>approvalVisible(x)&&/same arguments and got the same result/u.test(x.text),{timeout:30_000});
    assert.match(card.text,/called Read file 5 times/u,card.text);
    assert.equal(s.fake.chatRequests().length-before,5,'five requests, five reads, then the question');
    const told=s.fake.chatRequests().at(-1)?.toolTexts?.map((x:any)=>x.text).join('\n')??'';
    assert.match(told,/same arguments, and the result is the same as before/u,'from the 2nd read the model got the note');
    await answerApproval(t,'2');
    const end=await t.waitFor('the turn ended on the no',x=>idleFooter(x)&&/same tool call again and again|REPEATED_TOOL_CALL/u.test(x.text),{timeout:30_000});
    assert.equal(s.fake.chatRequests().length-before,5,'no request after the no');
    assert.ok(end);
  }finally{await t.close();}
});

test('s59 · in -p nobody can be asked: the turn ends at the 5th',async()=>{
  const before=s.fake.chatRequests().length;
  const r=await s.profile.talos(['-p','LOOPME again','--permission-mode','default','--output-format','json']);
  assert.equal(s.fake.chatRequests().length-before,5,`${r.stdout}${r.stderr}`);
  assert.match(r.stdout,/"ok":false/u);
  assert.match(r.stdout,/5 times with the same arguments/u,r.stdout);
});

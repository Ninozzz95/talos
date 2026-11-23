/**
 * P13, owner decision 8 (2026-09-26), on the BUILT CLI behind the refusing sink. Measured before the cure: the parent delegates
 * (fake keyword `DELEGATE:FAIL`), the child runs a shell command and asks for approval on its own session; nothing appeared
 * and the turn waited forever on "1 agent working". Now the approval opens on top, says it comes from the agent and its
 * task, and once answered the child and the parent finish.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {approvalVisible,composerReady,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s27',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;

/* ASYNC (owner 01/10): the unified kernel delegates in the background — the parent's turn ends at once, the child asks for
   its approval with no parent turn open, and when the child ends the kernel wakes the parent with the result, drawn as an
   agent row (never the model-facing text). */
test('s27 · a sub-agent\'s approval opens on top, says who asks, and the agent\'s result comes back as an agent row',async()=>{
  t=s.launch([],{cols:110,rows:32});await toComposer(t);
  await t.submit('DELEGATE:FAIL one sub-task');
  const asked=await t.waitFor('the child\'s approval',x=>approvalVisible(x)&&x.text.includes('cmd /c exit 3'),{timeout:30_000});
  assert.match(asked.text,/from agent · FAIL child work/u,`the dialog does not say who asks:\n${asked.text}`);
  await answerApproval(t,'1');
  const end=await t.waitFor('the woken turn ended',x=>idleFooter(x)&&composerReady(x)&&x.text.includes('Done: the agent reported back.'),{timeout:60_000});
  assert.match(end.text,/Agent (?:finished|did not finish) · FAIL child work/u,`no agent row:\n${end.text}`);
  assert.doesNotMatch(end.text,/Risultato asincrono|talos\.subagent-result|risultatoNonFidato/u,`the model-facing text reached the screen:\n${end.text}`);
  console.log('FRAME s27 asked\n'+asked.text);
  console.log('FRAME s27 woken turn ended\n'+end.text);
});

test.after(async()=>{await sink.close();});

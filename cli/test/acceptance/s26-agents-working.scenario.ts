/**
 * P14 (owner, 2026-09-25, "lo spinner thinking rimane in conteggio quando gli agenti vengono dispacciati"), on the BUILT
 * CLI behind the refusing sink: the parent delegates one sub-task (fake keyword DELEGATE) and waits on it while the child
 * answers slowly. While the child works, the status says an agent is working, never "thinking".
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s26',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;

test('s26 · while a delegated agent works, the status says so instead of thinking',async()=>{
  t=s.launch([],{cols:110,rows:32});await toComposer(t);
  await t.submit('DELEGATE one sub-task');
  const working:Screen=await t.waitFor('the agent is working',x=>/Delegating to 1 agent/u.test(x.text)||/NO DELEGATION TOOL OFFERED/u.test(x.text),{timeout:30_000});
  assert.doesNotMatch(working.text,/NO DELEGATION TOOL OFFERED/u,'the CLI session does not offer delega_sottotask, so this scenario cannot prove P14');
  assert.match(working.text,/^ \S Delegating to 1 agent · /mu);
  assert.doesNotMatch(working.text,/^ \S Thinking\b/mu,`the status says thinking while the agent works:\n${working.text}`);
  const end=await t.waitFor('the turn ended',x=>idleFooter(x)&&composerReady(x),{timeout:90_000});
  assert.match(end.text,/Done: the agent finished\./u);
});

test.after(async()=>{await sink.close();});

/**
 * FE-048, review of the Frontend (01/11): the agents have left the row under the composer and the bar is closed in Essential, so the footer
 * pill is the only place that shows one. Riga 224 (owner 22/11/2026): the footer shows the agents of the conversation on screen only. On
 * the BUILT CLI: after /clear the agent at work for the conversation before is not counted; back on that conversation with /resume, its
 * agent still at work is counted again. The agents live in the process, so no agent outlives the window it started in.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runCommand,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s80',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;

test('s80 · the footer counts the agents of the conversation on screen: none after /clear, its own again after /resume',async()=>{
  t=s.launch([],{cols:120,rows:36});
  try{
    await toComposer(t);
    await t.submit('DELEGATE:LONG one sub-task');
    await t.waitFor('the agent in the footer',x=>/← 1 agent\b/u.test(x.text)&&/✓ Done in/u.test(x.text),{timeout:30_000});
    /* (a) a new conversation in the same window, with the agent still at work in the old one: it is not this one's */
    await runCommand(t,'/clear',x=>x.text.includes('Start a new conversation')||/New conversation/iu.test(x.text));
    t.press('down');await t.settled();t.press('enter');
    const fresh=await t.waitFor('the new conversation, empty',x=>!x.text.includes('DELEGATE:LONG')&&!/✓ Done in/u.test(x.text),{timeout:10_000});
    await t.settled();
    assert.doesNotMatch(fresh.text,/← \d+ agents?\b/u,'after /clear the footer shows no agent of the conversation before');
    /* (b) back on the old conversation: its agent, still at work, is counted again */
    await runCommand(t,'/resume',x=>x.text.includes('── Resume a conversation')&&x.text.includes('DELEGATE:LONG'));
    t.press('enter');
    await t.waitFor('resumed',x=>!x.text.includes('── Resume a conversation')&&x.text.includes('DELEGATE:LONG'),{timeout:10_000});
    const back=await t.waitFor('the agent back in the footer',x=>/← 1 agent\b/u.test(x.text),{timeout:10_000});
    assert.match(back.text,/← 1 agent\b/u);
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});

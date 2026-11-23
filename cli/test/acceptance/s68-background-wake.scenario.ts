/**
 * s68 — a command that outlives its time goes on in the background, and its end wakes the conversation, on the BUILT CLI
 * (a464f3336; owner 14/10/2026 «Sì, si risveglia da solo»). The fake model runs `shell` with a `timeout` of 1 s on a node
 * one-liner that sleeps 3 s (fake-provider.ts BGWAKE): the answer says IN BACKGROUND, the turn ends, and when the command ends
 * a new turn starts by itself — its request to the fake names the command. Then (BGHOLD, a minute) Ctrl+C Ctrl+C with the command
 * still in the background ends TALOS within the exit bound, with no backstop record (exitTalos, exit-backstop-check.ts).
 * Fake model on 127.0.0.1 only.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {approvalVisible,idleFooter} from './checks.ts';
import {answerApproval,exitTalos,stage,toComposer} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s68',files:{'README.md':'# demo\n'}});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function runUntilBackground(t:TerminalSession,prompt:string){
  await t.submit(prompt);
  const asked=await t.waitFor('the command asks for approval, or runs',x=>approvalVisible(x)||/Started: it goes on in the background/u.test(x.text),{timeout:30_000});
  if(approvalVisible(asked))await answerApproval(t,'1');
  return t.waitFor('the turn ended with the command in the background',x=>idleFooter(x)&&/Started: it goes on in the background/u.test(x.text),{timeout:30_000});
}

test('s68 (a) · the command moves to the background, the turn ends, and its end wakes the conversation by itself',async()=>{
  const t=s.launch([],{cols:120,rows:40});
  try{
    await toComposer(t);
    await runUntilBackground(t,'BGWAKE run the job');
    const turn=s.fake.chatRequests().filter(r=>r.lastUser?.includes('BGWAKE'));
    const told=turn.at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
    assert.match(told,/IN BACKGROUND/u,`the model was told the command went on in the background: ${told.slice(0,400)}`);
    const before=s.fake.chatRequests().length;
    /* nobody types: the command ends about 3 s after it started, and the conversation wakes */
    const deadline=Date.now()+60_000;
    while(s.fake.chatRequests().length===before&&Date.now()<deadline)await sleep(100);
    const woke=s.fake.chatRequests()[before];
    assert.ok(woke,'no new request: the conversation did not wake when the command ended');
    /* measured 14/10/2026: «The background command `node -e "…"` completed (exit code 0). Its full output is in …\call_bg_1.log.» */
    assert.match(String(woke.rawUser??''),/background command `node -e .*finished-bg.*` completed \(exit code 0\)/u,`the wake's request does not say the command ended: ${String(woke.rawUser).slice(-600)}`);
    const after=await t.waitFor('the woken turn on the screen',x=>idleFooter(x)&&/\bOK\b/u.test(x.text.split('Started: it goes on in the background').at(-1)??''),{timeout:30_000});
    assert.doesNotMatch(after.text,/TALOS asks|Allow/u);
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

test('s68 (b) · Ctrl+C Ctrl+C with a command still in the background ends TALOS within the bound',async()=>{
  const t=s.launch([],{cols:120,rows:40});
  try{
    await toComposer(t);
    await runUntilBackground(t,'BGHOLD run the long job');
    /* the command really runs (a first command can wait for the sandbox's own check before it starts): it leaves a file */
    const marker=join(s.profile.project,'bg-started.txt');
    for(let waited=0;!existsSync(marker)&&waited<60_000;waited+=200)await sleep(200);
    assert.ok(existsSync(marker),'the premise: the background command started');
    const started=Date.now();
    assert.equal(await exitTalos(t),true,'TALOS did not end with a command in the background');
    assert.ok(Date.now()-started<10_000,`TALOS took ${Date.now()-started} ms to end`);
    /* and it said what it stopped, the command and its output file (the words of `talos -p`, F-ENG-2) */
    const left=t.screen().text.replace(/\s+/gu,' ');
    assert.match(left,/Stopped 1 background command so the run could end: node -e .*finished-bg.* \(output: /u,`the exit did not say what it stopped:\n${t.screen().text}`);
  }finally{await t.close();}
});

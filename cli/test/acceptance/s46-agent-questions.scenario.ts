/**
 * Stage 6b (owner 02/10: «i figli possono chiederti»; decisions «solo per chi la sa mostrare», «pagina + scheda completa»,
 * «avviso del mockup + notifica», registro 12), on the BUILT CLI with the unified kernel. The parent delegates a child that
 * asks the person (fake keywords DELEGATE:ASKONE, one question with one choice — the mockup's scene at 6 s; DELEGATE:ASKME,
 * three questions with a multiple choice). Checked on the screen, as a person sees it:
 *   - the kernel offers the child the question tool only in the interactive CLI (`domandeDeiFigli`), never in `talos -p`;
 *   - the arrival never opens the card: the mockup's toast says «An agent needs you · ctrl+a» and the pill «needs you»;
 *   - the page shows what it asks, Space starts a reply, Enter sends it to the child, the toast says it went;
 *   - a richer question opens the stage 3 card with Space, titled with the agent that asks.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {APPROVAL_ANSWER_DELAY_MS,exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s46',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const onPage=(x:Screen)=>/^ Agents · this session/mu.test(x.text);
async function leave(t:TerminalSession){if(t.exit)return;t.press('esc');t.press('esc');if(!await exitTalos(t))await t.close();}
const childRequests=(keyword:string)=>s.fake.chatRequests().filter((r:any)=>String(r.lastUser??'').includes(`${keyword} child work`));

test('s46 · a child asks: the toast and the pill say so, the page answers, the answer reaches the child',async()=>{
  const t=s.launch([],{cols:120,rows:36});
  try{
    await toComposer(t);
    await t.submit('DELEGATE:ASKONE one sub-task');
    const asked=await t.waitFor('the toast and the pill',x=>/An agent needs you · ctrl\+a/u.test(x.text)&&/needs you/u.test(x.text),{timeout:30_000});
    assert.doesNotMatch(asked.text,/Agent asks ·|TALOS asks/u,'the arrival opened a question card: it must not steal focus');
    assert.ok(childRequests('ASKONE').some((r:any)=>(r.tools as string[]).includes('ask_user_question')),'the kernel did not offer the child the question tool');
    t.press('ctrl+a');
    await t.waitFor('the card names the question',x=>/▾ Agents +1 running · 1 waiting/u.test(x.text)&&/asks: Should the/u.test(x.text),{timeout:10_000});
    t.press('ctrl+a');
    const page=await t.waitFor('the page on the agent that asks',x=>onPage(x)&&/Asks you/u.test(x.text)&&/ 1\. Local fake \(fast, no network\)/u.test(x.text),{timeout:10_000});
    assert.match(page.text,/ 2\. Stripe test sandbox/u);
    assert.match(page.text,/type a reply, or a number/u);
    t.press('space');
    await t.waitFor('the reply line',x=>onPage(x)&&/ › ▍/u.test(x.text),{timeout:5_000});
    await t.type('use a recorded fixture');
    await t.waitFor('the reply typed',x=>/use a recorded fixture▍/u.test(x.text),{timeout:5_000});
    t.press('enter');
    await t.waitFor('the toast says it went',x=>/Answer sent to the agent/u.test(x.text),{timeout:10_000});
    await t.waitFor('the child got the answer',()=>childRequests('ASKONE').some((r:any)=>(r.toolTexts??[]).some((x:any)=>/answered/u.test(x.text)&&/use a recorded fixture/u.test(x.text))),{timeout:20_000});
    t.press('esc');
    await t.waitFor('back to the main screen',x=>!onPage(x),{timeout:5_000});
  }finally{await leave(t);}
});

test('s46 · a richer question opens the stage 3 card from the page, titled with the agent that asks',async()=>{
  const t=s.launch([],{cols:120,rows:36});
  try{
    await toComposer(t);
    await t.submit('DELEGATE:ASKME one sub-task');
    await t.waitFor('the pill says needs you',x=>/needs you/u.test(x.text),{timeout:30_000});
    t.press('ctrl+a');await t.waitFor('the card',x=>/▾ Agents\s/u.test(x.text),{timeout:10_000});
    t.press('ctrl+a');
    const page=await t.waitFor('the page',x=>onPage(x)&&/\(\+2 more\)/u.test(x.text)&&/space opens the questions/u.test(x.text),{timeout:10_000});
    assert.doesNotMatch(page.text,/type a reply, or a number/u);
    t.press('space');
    const card=await t.waitFor('the card for the agent',x=>!onPage(x)&&/Agent asks · ASKME child work/u.test(x.text),{timeout:10_000});
    assert.match(card.text,/How should the test wait for the session\?/u);
    /* Q-R3-16: for 300 ms after a card appears keys still go to the composer; a person answers after that grace */
    await new Promise(resolve=>setTimeout(resolve,APPROVAL_ANSWER_DELAY_MS));
    t.press('esc');
    await t.waitFor('the card closed and nobody waits',x=>!/Agent asks ·/u.test(x.text)&&!/needs you/u.test(x.text),{timeout:15_000});
  }finally{await leave(t);}
});

test('s46 · talos -p: nobody can answer, so the child is not offered the question tool',async()=>{
  const before=childRequests('ASKONE').length;
  const run=await s.profile.talos(['-p','DELEGATE:ASKONE one sub-task','--output-format','json','--protocol','v2'],120_000);
  assert.equal(run.status,0,`talos -p failed (${run.status}):\n${run.stdout}\n${run.stderr}`);
  const mine=childRequests('ASKONE').slice(before);
  assert.ok(mine.length>0,'the child never ran');
  assert.ok(mine.every((r:any)=>!(r.tools as string[]).includes('ask_user_question')),'a headless child was offered the question tool');
});

test.after(async()=>{await sink.close();});

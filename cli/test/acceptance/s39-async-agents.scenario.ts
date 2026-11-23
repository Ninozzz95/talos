/**
 * ASYNC phase, step 8 (owner 01/10), on the BUILT CLI with the unified kernel: a delegated agent works after its parent's
 * turn has ended. The fake provider answers the child (`SLOW child work`) slowly, about 11 s, so the person can act while
 * it works. Checked on the screen, as a person sees it:
 *  - the status line counts the working agent; /agents opens its card, Ctrl+A its page with what it does and `x stop`;
 *  - /exit asks wait · stop · stay; Stay keeps everything; the agent's result comes back as an agent row;
 *  - /agents stop 1 stops it, and the main agent answers a «did not finish»;
 *  - /exit → «Wait for them, then exit» leaves by itself once the agent ended and the main agent answered;
 *  - `talos -p` waits for the child and the turn that answers it, and prints both answers.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertEnglishOnly,composerReady,idleFooter} from './checks.ts';
import {exitTalos,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s39',files:{'README.md':'# demo\n'}});
const working=(x:Screen)=>/1 agent working/u.test(x.text);
const woken=(x:Screen)=>idleFooter(x)&&composerReady(x)&&x.text.includes('Done: the agent reported back.');
/* Whatever a failed step left open (a list, a question), the session ends here, so the next case can start. */
async function leave(t:TerminalSession){
  if(t.exit)return;
  t.press('esc');t.press('esc');
  if(!await exitTalos(t))await t.close();
}
async function delegated(t:TerminalSession){
  await toComposer(t);
  await t.submit('DELEGATE one sub-task');
  return t.waitFor('the parent turn ended and its agent works',x=>working(x)&&x.text.includes('Done: the agent finished.'),{timeout:30_000});
}

test('s39 · /agents lists the working agent; /exit asks and Stay stays; the result comes back as an agent row',async()=>{
  const t=s.launch([],{cols:110,rows:32});
  try{
    const busy=await delegated(t);
    assert.match(busy.text,/^ ✓ Done in \S+ · 1 agent working/mu,`the status line does not count the agent:\n${busy.text}`);
    /* Stage 6a (mockup verb `agents`): at 110 columns /agents opens the card; Ctrl+A opens the page, which offers x stop. */
    await t.submit('/agents');
    await t.waitFor('the agents card',x=>/▾ Agents +1 running/u.test(x.text)&&x.text.includes('SLOW child work'),{timeout:10_000});
    t.press('ctrl+a');
    const list=await t.waitFor('the agents page',x=>/^ Agents · this session/mu.test(x.text)&&x.text.includes('SLOW child work')&&/x stop/u.test(x.text),{timeout:10_000});
    console.log('FRAME s39 /agents\n'+list.text);
    t.press('esc');
    await t.waitFor('the page closed',x=>!/^ Agents · this session/mu.test(x.text),{timeout:5_000});
    await t.submit('/exit');
    const asked=await t.waitFor('the exit question',x=>x.text.includes('1 agent is still working'),{timeout:10_000});
    assert.match(asked.text,/Wait for them, then exit[\s\S]*Stop them and exit[\s\S]*Stay/u,`the three choices are not there:\n${asked.text}`);
    console.log('FRAME s39 /exit asks\n'+asked.text);
    t.press('esc');
    await t.waitFor('the question closed',x=>!x.text.includes('1 agent is still working'),{timeout:5_000});
    assert.equal(await t.waitForExit(500),false,'Stay must not exit');
    const end=await t.waitFor('the woken turn ended',woken,{timeout:60_000});
    assert.match(end.text,/Agent finished · SLOW child work/u,`no agent row:\n${end.text}`);
    assertEnglishOnly(end.text,'ASYNC-8');
    console.log('FRAME s39 woken\n'+end.text);
  }finally{await leave(t);}
});

test('s39 · /agents stop 1 stops the agent and the main agent answers a «did not finish»',async()=>{
  const t=s.launch([],{cols:110,rows:32});
  try{
    await delegated(t);
    await t.submit('/agents stop 1');
    await t.waitForText('Stopping agent · SLOW child work',{timeout:10_000});
    const end=await t.waitFor('the woken turn after the stop',woken,{timeout:60_000});
    assert.match(end.text,/Agent did not finish · SLOW child work/u,`no «did not finish» row:\n${end.text}`);
    console.log('FRAME s39 stopped\n'+end.text);
  }finally{await leave(t);}
});

test('s39 · /exit → «Wait for them, then exit» leaves by itself once the agent ended and was answered',async()=>{
  const t=s.launch([],{cols:110,rows:32});
  try{
    await delegated(t);
    await t.submit('/exit');
    await t.waitFor('the exit question',x=>x.text.includes('1 agent is still working'),{timeout:10_000});
    t.press('enter');
    const waiting=await t.waitFor('the waiting line',x=>/Exiting when 1 agent finishes/u.test(x.text),{timeout:10_000});
    console.log('FRAME s39 waiting to exit\n'+waiting.text);
    assert.equal(await t.waitForExit(90_000),true,'it did not leave after the agent ended and was answered');
    assert.match(t.scrollback(),/Done: the agent reported back\./u,'it left before the main agent answered the result');
  }finally{await leave(t);}
});

test('s39 · talos -p waits for its child and the turn that answers it',async()=>{
  const started=Date.now();
  const run=await s.profile.talos(['-p','DELEGATE one sub-task','--output-format','json','--protocol','v2'],120_000);
  const took=Date.now()-started;
  assert.equal(run.status,0,`talos -p failed (${run.status}):\n${run.stdout}\n${run.stderr}`);
  const result=JSON.parse(run.stdout.trim().split(/\r?\n/u).at(-1)!);
  assert.equal(result.outcome,'completed');
  assert.match(result.result.text,/Done: the agent finished\.\n\nDone: the agent reported back\./u,`both answers, apart:\n${result.result.text}`);
  assert.ok(took>=5_000,`it answered in ${took} ms: too fast to have waited for the child`);
});

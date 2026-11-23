/**
 * Owner 08/10/2026: «i comandi tipo cambio autorizzazioni cambino istantaneamente … senza quei fastidiosi messaggi di avviso,
 * anche se vengono applicati dal turno dopo, come fa esattamente Claude Code». In 0.5.0 Shift+Tab while the model worked
 * printed «Change permission mode failed: That conversation is busy saving… (SESSION_NOT_READY)» on the way through plan mode.
 * On the BUILT CLI: Shift+Tab during a streaming answer reaches plan mode at once, with no error, and the turn ends normally.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {idleFooter,modeOf} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
after(()=>sink.close());
const s=stage({name:'s53',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;

test('s53 · Shift+Tab while the model answers reaches plan mode at once, with no error',async()=>{
  t=s.launch([],{cols:100,rows:30});
  try{
    await toComposer(t);
    await t.submit('SLOW tell me something');
    await t.waitFor('the answer is streaming',x=>/esc to stop/u.test(x.text)&&x.text.includes('This answer streams slowly'),{timeout:30_000});
    for(const want of ['accept edits','plan mode']){
      t.press('shift+tab');
      const x=await t.waitFor(`mode ${want} while the turn runs`,y=>modeOf(y)===want||/failed/iu.test(y.text),{timeout:5_000});
      assert.doesNotMatch(x.text,/Change permission mode failed|SESSION_NOT_READY|busy saving/u,`no error while the turn runs:\n${x.text}`);
      assert.equal(modeOf(x),want);
      assert.match(x.text,/esc to stop/u,'the turn is still running');
    }
    const end=await t.waitFor('the turn ended',x=>idleFooter(x)&&/✓ Done in/u.test(x.text),{timeout:60_000});
    assert.equal(modeOf(end),'plan mode','the mode stays');
    assert.doesNotMatch(end.text,/Change permission mode failed|SESSION_NOT_READY|busy saving/u,`no error after the turn either:\n${end.text}`);
    /* the kernel got its plan operating mode when the turn ended: the next turn offers the plan tool and the card opens (s41) */
    await t.submit('PLANME move image export to a worker thread');
    const card=await t.waitFor('the plan card of the next turn',x=>x.text.includes('Plan mode · TALOS proposes')||/failed/iu.test(x.text),{timeout:30_000});
    assert.ok(card.text.includes('Plan mode · TALOS proposes'),`the kernel did not get plan mode at the turn end:\n${card.text}`);
  }finally{await t.close();}
});

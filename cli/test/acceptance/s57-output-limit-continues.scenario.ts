/**
 * F-ENG-4 (stress test of 0.5.0, 08/10/2026; owner 09/10 «Lo dice e continua»): an answer cut by the model's output cap
 * ended the turn as "generation stopped without an answer". On the BUILT CLI through ConPTY: the answer is cut once, TALOS
 * says so and asks the model to continue, and the turn ends with both halves on screen and no error.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {idleFooter} from './checks.ts';
import {stage,toComposer} from './harness.ts';

const s=stage({name:'s57',files:{'README.md':'# demo\n'}});

test('s57 · an answer cut by the output limit is said and continued, and the turn ends well',async()=>{
  const t=s.launch([],{cols:110,rows:30});
  try{
    await toComposer(t);
    await t.submit('CUTOFF tell me everything');
    const end=await t.waitFor('the continued answer and the idle footer',x=>idleFooter(x)&&x.text.includes('and the second half.'),{timeout:60_000});
    assert.match(end.text,/hit the model's output limit: TALOS asked the model to continue \(1 of 3\)/u,`the continuation was not said:\n${end.text}`);
    assert.match(end.text,/First half of the answer,/u);
    assert.doesNotMatch(end.text,/without an answer|INTERRUPTED|✗ Failed/u,`the turn ended as a failure:\n${end.text}`);
    assert.equal(s.fake.chatRequests().filter(r=>r.lastUser?.includes('cut off by the output length limit')).length,1,'one continuation was asked');
  }finally{await t.close();}
});

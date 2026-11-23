/**
 * s49 — the restart after a crash (owner 02/10, «Chiave per invio + ripresa visibile»; registro 12). Before: a TALOS closed in
 * the middle of an answer left its start in the journal, and a new TALOS that got the SAME message failed it with «The
 * recovered start was interrupted by the previous process» (RUNTIME_OPERATION_INTERRUPTED), because starts were recognised
 * by their content. Now each send has its own key (IETF Idempotency-Key, Stripe): the same message starts anew, and the new
 * TALOS says once, in one line, which turn the last one left in the middle and how to pick it up.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';

const s=stage({name:'s49',files:{'README.md':'# demo\n'}});
const PROMPT='SLOW tell me about the project';

test('s49 · a TALOS closed in the middle of an answer, then the same message in a new TALOS: it runs, and the cut turn is named once',async()=>{
  const first=s.launch([],{cols:110,rows:30});
  try{
    await toComposer(first);
    await first.submit(PROMPT);
    await first.waitFor('the answer streaming',x=>/esc to stop/u.test(x.text),{timeout:30_000});
  }finally{await first.close();}
  const second=s.launch([],{cols:110,rows:30});
  try{
    await toComposer(second);
    const told=await second.waitFor('the cut turn named',x=>/The last TALOS closed in the middle of “.+”\. \/resume [0-9a-f-]{8} picks it up\./u.test(x.text),{timeout:15_000});
    assert.equal(told.text.split('The last TALOS closed in the middle').length-1,1,'said once');
    await second.submit(PROMPT);
    const done=await second.waitFor('the same message ran',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
    assert.doesNotMatch(done.text,/RUNTIME_OPERATION_INTERRUPTED|recovered start was interrupted/u);
  }finally{await second.close();}
  const third=s.launch([],{cols:110,rows:30});
  try{
    await toComposer(third);
    await new Promise(r=>setTimeout(r,1_500));
    assert.doesNotMatch(third.screen().text,/The last TALOS closed in the middle/u,'a cut turn is told once, not at every start');
  }finally{await third.close();}
});

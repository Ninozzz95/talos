/*
 * Stage 3, interactive requests (owner 01-02/10, registro 12). The kernel asks the person (`UserQuestionRequested`) and says
 * how the question closed (`UserQuestionResolved`); until now both fell into the bridge's `default` and vanished, so the
 * CLI never saw a question and the turn waited forever. Research: Codex app-server `item/tool/requestUserInput` and
 * `serverRequest/resolved` (every request has its close, also when it is cleared without an answer), ACP elicitation,
 * Claude Agent SDK `canUseTool` for AskUserQuestion. The questions are already the kernel contract's English fields; the
 * Italian bookkeeping (`origine`, `ripristinabile`, `da`, `motivo`) is put in English like every v2 record.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../../src/protocol/v2/events.ts';

const clock=()=>'2026-10-02T12:00:00.000Z';
const QUESTIONS=[{id:'fix',header:'Fix',question:'How should the test wait?',why:'It decides what changes.',options:[
  {label:'Wait for the cookie',description:'product unchanged',recommended:true,preview:'-  sleep(500)\n+  await waitForSession()'},
  {label:'Shorten the retry',description:'changes the product'}]}];

test('a kernel question becomes question.required: the questions unchanged, origin and restorable in English, durable',()=>{
  const event=createV2EventBridge('s-1',clock).translate({type:'UserQuestionRequested',_sequenza:7,requestId:'q-1',questions:QUESTIONS,
    at:'2026-10-02T11:59:00.000Z',toolCallId:'call_ask',origine:{modalita:'piano',agente:'principale'},ripristinabile:true});
  assert.ok(event);
  assert.equal(event.type,'question.required');
  assert.equal(event.durability,'durable');
  assert.deepEqual(event.data,{requestId:'q-1',questions:QUESTIONS,at:'2026-10-02T11:59:00.000Z',toolCallId:'call_ask',origin:{mode:'plan',agent:'root'},restorable:true});
});

test('every way a question closes becomes question.resolved, with who and why in English',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  const resolved=(record:Record<string,unknown>)=>bridge.translate({type:'UserQuestionResolved',requestId:'q-1',...record});
  assert.deepEqual(resolved({status:'answered',answers:{fix:'Wait for the cookie'},skipped:['verify'],notes:{fix:'keep it small'},da:'persona'})?.data,
    {requestId:'q-1',status:'answered',answers:{fix:'Wait for the cookie'},skipped:['verify'],notes:{fix:'keep it small'},by:'person'});
  assert.deepEqual(resolved({status:'expired',da:'sistema'})?.data,{requestId:'q-1',status:'expired',by:'system'});
  assert.deepEqual(resolved({status:'unanswerable',da:'sistema',motivo:'nessuna-interfaccia'})?.data,{requestId:'q-1',status:'unanswerable',by:'system',reason:'no-interface'});
  for(const [motivo,reason] of [['interrotta','interrupted'],['non-salvata','not-saved'],['nuovo-messaggio','new-message'],['reindirizzamento','redirected'],['fermato','stopped']]){
    const event=resolved({status:'cancelled',da:'persona',motivo});
    assert.equal(event?.type,'question.resolved');assert.equal(event?.durability,'durable');
    assert.equal((event?.data as any).reason,reason,`motivo ${motivo}`);
  }
});

test('a secret in a question is redacted like every v2 string (the secrets the caller hands the bridge)',()=>{
  const secret='sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789';
  const event=createV2EventBridge('s-1',clock,[secret]).translate({type:'UserQuestionRequested',requestId:'q-2',questions:[{...QUESTIONS[0],question:`Use the key ${secret}?`}]});
  assert.equal(event?.type,'question.required');
  assert.doesNotMatch(JSON.stringify(event),/abcdefghijklmnopqrstuvwxyz0123456789/u);
});

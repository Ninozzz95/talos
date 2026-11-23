/*
 * Stage 6b (owner 02/10: «i figli possono chiederti», decisions «pagina + scheda completa», registro 12). A child's question
 * to the person is answered from the agents page when it is simple — one question, one choice — as the mockup's `answerAgent`:
 * a number picks a choice, a typed reply is a free answer (the kernel's contract admits it for a single choice,
 * user-question-contract.mjs:256-266), Enter on an empty reply takes the first choice (the recommended one goes first).
 * Anything richer (several questions, several choices) opens the stage 3 card instead.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {agentReply,simpleQuestion} from '../../src/tui/agent-questions.ts';

const one={id:'scelta',question:'Sandbox or a local fake?',why:'It decides whether the test needs the network.',options:[{label:'Local fake',description:'Fast, no network',recommended:true},{label:'Stripe sandbox',description:'Real calls'}]};

test('a simple question: one question, one choice; anything richer is not',()=>{
  assert.deepEqual(simpleQuestion([one]),{id:'scelta',q:'Sandbox or a local fake?',options:['Local fake','Stripe sandbox']});
  assert.deepEqual(simpleQuestion([{id:'free',question:'Which branch?'}]),{id:'free',q:'Which branch?',options:[]});
  assert.equal(simpleQuestion([{...one,multiSelect:true}]),null,'several choices need the card');
  assert.equal(simpleQuestion([one,{...one,id:'second'}]),null,'several questions need the card');
  assert.equal(simpleQuestion([]),null);
});

test('the reply: a number picks a choice, text is a free answer, empty takes the first choice',()=>{
  const ask={requestId:'r1',questions:[one]};
  assert.deepEqual(agentReply(ask,{number:2}),{status:'answered',answers:{scelta:'Stripe sandbox'}});
  assert.deepEqual(agentReply(ask,{text:'  use a recorded fixture  '}),{status:'answered',answers:{scelta:'use a recorded fixture'}});
  assert.deepEqual(agentReply(ask,{text:''}),{status:'answered',answers:{scelta:'Local fake'}});
  assert.equal(agentReply(ask,{number:3}),null,'a number past the choices answers nothing');
  assert.equal(agentReply({requestId:'r2',questions:[{id:'free',question:'Which branch?'}]},{text:' '}),null,'an empty reply to an open question answers nothing');
  assert.equal(agentReply({requestId:'r3',questions:[one,{...one,id:'b'}]},{number:1}),null,'not from the page');
});

test('moved into the stage 3 card, a child\'s question says which agent asks; the main session\'s does not',async()=>{
  const {openQuestionCard}=await import('../../src/tui/question-card.ts');
  const {questionCardRows}=await import('../../src/tui/question-card-rows.ts');
  const title=(asker?:string)=>questionCardRows(openQuestionCard({requestId:'r',questions:[one],now:0,timeoutMs:null,asker}),100,0)[0]!.map(s=>s.text).join('');
  assert.match(title('Write the checkout tests'),/Agent asks · Write the checkout tests/);
  assert.match(title(''),/Agent asks · unnamed task/);
  assert.match(title(),/TALOS asks/);
  assert.doesNotMatch(title(),/Agent asks/);
});

/*
 * Stage 6a: what the agents panel shows comes from the kernel's own `talos.agenti` events. The kernel already sends, for
 * every child, its whole task (`task`), when it ended (`conclusaAlle`), its usage (`usageSessione`), its model (`modello`)
 * and how many approvals wait on the person (`approvalPendingCount`); the v2 bridge dropped them. Now they reach the live
 * agents and become the panel's cards: tokens and time beside each agent, «needs you» while an approval waits, the task
 * in full in the details, the result summary as its last message.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {reduceLiveAgents,type LiveAgent} from '../../src/tui/live-agents.ts';
import {agentCards} from '../../src/tui/agents-panel.ts';

function changed(childId:string,reason:string,operation:Record<string,unknown>,agent:Record<string,unknown>={}){
  return{type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'main',parentId:'main',childId,reason,
    agent:{sessionId:childId,taskCorto:`task ${childId}`,task:`Sei una sessione di lavoro autonoma. Compito: The whole task of ${childId}.`,conclusa:false,interrotta:false,avviataAlle:'2026-10-01T09:59:50.000Z',modello:'qwen3-coder',...agent},operation}};
}
function events(raw:readonly unknown[]):TuiEvent[]{
  const adapter=createTuiEventAdapter();adapter.bindSession('main');
  return raw.flatMap(item=>adapter.translateAll(item)).filter(event=>event.type==='agent.changed');
}
const live=(raw:readonly unknown[])=>{let list:readonly LiveAgent[]=[];for(const event of events(raw))list=reduceLiveAgents(list,event);return list;};

test('the bridge carries the whole task, the end, the usage, the model and the approvals waiting',()=>{
  const [event]=events([changed('c1','updated',{kind:'usage',status:'updated'},{usageSessione:{prompt_tokens:900,completion_tokens:300},approvalPendingCount:1,conclusaAlle:null})]) as any[];
  assert.deepEqual([event.prompt,event.tokens,event.model,event.approvalsPending,event.endedAt],['The whole task of c1.',1200,'qwen3-coder',1,null]);
});

/* 0.6.8 (owner 16/10/2026 L3-17, «un nome solo ovunque»): two sisters with the same task are told apart by their names */
test('an agent is called by its name, «-N» among sisters; one with no name keeps its short task',()=>{
  const agents=live([changed('c1','created',{kind:'lifecycle',status:'started'},{nome:'Write the tests',taskCorto:'Write the tests'}),
    changed('c2','created',{kind:'lifecycle',status:'started'},{nome:'Write the tests-2',taskCorto:'Write the tests'}),
    changed('c3','created',{kind:'lifecycle',status:'started'})]);
  assert.deepEqual(agents.map(agent=>agent.task),['Write the tests','Write the tests-2','task c3']);
});

test('the live agent keeps them, and a usage update now changes the tokens on screen',()=>{
  const first=live([changed('c1','created',{kind:'lifecycle',status:'started'})]);
  const later=live([changed('c1','created',{kind:'lifecycle',status:'started'}),changed('c1','updated',{kind:'usage',status:'updated'},{usageSessione:{prompt_tokens:100,completion_tokens:50}})]);
  assert.equal(first[0]!.tokens,0);
  assert.equal(later[0]!.tokens,150);
  assert.equal(later[0]!.prompt,'The whole task of c1.');
  assert.equal(later[0]!.model,'qwen3-coder');
  const ended=live([changed('c1','created',{kind:'lifecycle',status:'started'}),changed('c1','completed',{kind:'lifecycle',status:'completed'},{conclusa:true,conclusaAlle:'2026-10-01T10:00:02.000Z'})]);
  assert.equal(ended[0]!.endedAtMs,Date.parse('2026-10-01T10:00:02.000Z'));
});

test('the cards: needs you while an approval waits, done with its outcome, the result as the last message',()=>{
  const agents=live([
    changed('c1','created',{kind:'lifecycle',status:'started'}),
    changed('c2','created',{kind:'lifecycle',status:'started'}),
    changed('c2','updated',{kind:'approval',status:'waiting'},{approvalPendingCount:1}),
    changed('c3','created',{kind:'lifecycle',status:'started'}),
    changed('c3','completed',{kind:'lifecycle',status:'completed'},{conclusa:true,conclusaAlle:'2026-10-01T10:00:02.000Z'}),
  ]);
  const cards=agentCards(agents,[{kind:'agent',id:'agent:r2:c3',childId:'c3',status:'completed',task:'task c3',summary:'## Docs updated\n- 6 routes added'}] as any);
  const byId=Object.fromEntries(cards.map(card=>[card.id,card]));
  assert.equal(byId.c1!.state,'working');
  assert.equal(byId.c2!.state,'needs');assert.equal(byId.c2!.activity,'Waiting for approval');
  assert.equal(byId.c3!.state,'done');assert.equal(byId.c3!.ok,true);assert.equal(byId.c3!.last,'## Docs updated\n- 6 routes added');
  assert.equal(byId.c1!.task,'task c1');assert.equal(byId.c1!.prompt,'The whole task of c1.');
  assert.equal(byId.c3!.endMs,Date.parse('2026-10-01T10:00:02.000Z'));
  const stopped=agentCards(live([changed('c4','created',{kind:'lifecycle',status:'started'}),changed('c4','completed',{kind:'lifecycle',status:'failed'},{interrotta:true})]),[]);
  assert.deepEqual([stopped[0]!.state,stopped[0]!.ok],['done',false]);
});

/* Stage 6b: a child's question to the person (the controller's list) makes its card «needs you» with the question. */
test('the cards: a child\'s question makes it need you; a simple one is answered on the page, a richer one in the card',()=>{
  const agents=live([changed('c1','created',{kind:'lifecycle',status:'started'}),changed('c2','created',{kind:'lifecycle',status:'started'})]);
  const choice={id:'scelta',question:'Sandbox or a local fake?',options:[{label:'Local fake',description:'Fast'},{label:'Sandbox',description:'Real'}]};
  const cards=agentCards(agents,[],[
    {sessionId:'c1',requestId:'q1',questions:[choice]},
    {sessionId:'c2',requestId:'q2',questions:[choice,{id:'more',question:'Which file?'}]},
  ]);
  const byId=Object.fromEntries(cards.map(card=>[card.id,card]));
  assert.equal(byId.c1!.state,'needs');
  assert.deepEqual(byId.c1!.question,{q:'Sandbox or a local fake?',options:['Local fake','Sandbox'],requestId:'q1',simple:true});
  assert.deepEqual(byId.c2!.question,{q:'Sandbox or a local fake? (+1 more)',options:[],requestId:'q2',simple:false});
  assert.equal(agentCards(agents,[]).every(card=>card.state==='working'&&!card.question),true,'no question, no «needs you»');
});

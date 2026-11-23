/*
 * Stage 6b (owner 02/10: «i figli possono chiederti»; registro 12). The kernel writes a child's question on the CHILD's
 * session (with the host's `domandeDeiFigli`); the controller already watches the descendants for their approvals and now
 * hands over their questions too — kept apart from the main session's: arrival never opens the card (Codex's async
 * questions never steal focus), the panel shows «needs you», the answer goes to the child's own session, and on request the
 * question moves into the stage 3 card (several questions or choices).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
const QUESTIONS=[{id:'scelta',question:'Sandbox or a local fake?',why:'It decides whether the test needs the network.',options:[{label:'Local fake',description:'Fast',recommended:true},{label:'Stripe sandbox',description:'Real'}]}];

function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();const answers:any[]=[];
  let rows:any[]=[{sessionId:'main',parentId:null,depth:0}];
  const r:any={
    restore:async()=>({restored:0,total:0}),start:async()=>'main',listSessions:async()=>rows,export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async()=>{},answerQuestion:async(...args:any[])=>{answers.push(args);return{ok:true};},cancel:async()=>{},close:async()=>{},
  };
  const emit=(id:string,event:any)=>{for(const sink of sinks.get(id)??[])sink(event);};
  return{r,answers,emit,setRows:(next:any[])=>{rows=next;},listeners:(id:string)=>sinks.get(id)?.size??0};
}

async function withChild(){
  const f=fakeRuntime();const seen:{card:any[];agents:any[][]}={card:[],agents:[]};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},
    onQuestion:(q:any)=>seen.card.push(q),onAgentQuestions:(list:any[])=>seen.agents.push(list)} as any);
  const id=(await c.initialize({initialPrompt:'DELEGATE'}))!;
  f.emit(id,{type:'RunStarted',runId:'r1'});
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'Write the checkout tests'}]);
  for(let i=0;i<40&&f.listeners('child')===0;i++)await tick(25);
  assert.equal(f.listeners('child'),1);
  f.emit('child',{type:'UserQuestionRequested',requestId:'q1',questions:QUESTIONS,origine:{modalita:'normale',agente:'figlio'}});
  for(let i=0;i<20&&!seen.agents.at(-1)?.length;i++)await tick(5);
  return{f,c,seen,id};
}

test('a child\'s question is handed over apart from the card, and the answer goes to the child',async()=>{
  const {f,c,seen}=await withChild();
  const list=seen.agents.at(-1)!;
  assert.equal(list.length,1);
  assert.deepEqual([list[0].requestId,list[0].sessionId,list[0].task],['q1','child','Write the checkout tests']);
  assert.equal(list[0].questions[0].question,'Sandbox or a local fake?');
  assert.equal(seen.card.filter(Boolean).length,0,'the arrival opened the card: it must not steal focus');
  await c.answerAgentQuestion('q1',{status:'answered',answers:{scelta:'Local fake'}});
  assert.deepEqual(f.answers.at(-1),['child','q1',{status:'answered',answers:{scelta:'Local fake'}}]);
  assert.deepEqual(seen.agents.at(-1),[],'the answered question stays');
  c.close();
});

test('a child\'s question moves into the card on request, and the card\'s answer goes to the child',async()=>{
  const {f,c,seen}=await withChild();
  c.openAgentQuestion('q1');
  const card=seen.card.at(-1);
  assert.deepEqual([card?.requestId,card?.sessionId],['q1','child']);
  assert.equal(card?.asker,'Write the checkout tests','the card says which agent asks');
  await c.answerQuestion('q1',{status:'answered',answers:{scelta:'Stripe sandbox'}});
  assert.deepEqual(f.answers.at(-1)?.slice(0,2),['child','q1']);
  assert.deepEqual(seen.agents.at(-1),[]);
  assert.equal(seen.card.at(-1),null);
  c.close();
});

test('a question the child no longer waits on (answered elsewhere, stopped) leaves the list',async()=>{
  const {f,c,seen}=await withChild();
  f.emit('child',{type:'UserQuestionResolved',requestId:'q1',status:'cancelled'});
  for(let i=0;i<20&&seen.agents.at(-1)?.length;i++)await tick(5);
  assert.deepEqual(seen.agents.at(-1),[]);
  c.close();
});

/*
 * Riga 224 (owner 22/11/2026 16:56: «Se inizio una nuova sessione non rimane altro di un'altra sessione»), T1: a «yes for this
 * session» belongs to the conversation that gave it. After /clear the new conversation asks again, and so does another
 * conversation opened with /resume; back on the first one with /resume, its yes is there again. A delegated child of the same
 * conversation still shares it (cure round 1 of A5h). Mount: the real session controller and the real permission engine over a
 * fake runtime, no kernel, no network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
const SHELL={tipo:'shell',comando:'npm run lint'};

function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();const answers:any[][]=[];let started=0;
  const rows=['A','B','C'].map(sessionId=>({sessionId,parentId:null,depth:0}));
  const r:any={
    restore:async()=>({restored:0,total:0}),start:async()=>(++started===1?'A':'B'),resume:async(id:string)=>id,listSessions:async()=>rows,export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async(...args:any[])=>{answers.push(args);},setPermissionMode:async()=>{},cancel:async()=>{},close:async()=>{},
  };
  const emit=(id:string,event:any)=>{for(const sink of sinks.get(id)??[])sink(event);};
  return{r,answers,emit};
}

test('riga 224, T1: a «yes for this session» stays with its conversation, through /clear and /resume',async()=>{
  const f=fakeRuntime();const asked:string[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{if(p)asked.push(p.requestId);}} as any);
  /* card q asks in session id, or is answered without asking: which one */
  const card=async(id:string,q:string)=>{const before=f.answers.length;f.emit(id,{type:'ApprovalRequested',requestId:q,azione:SHELL});
    for(let i=0;i<80&&!asked.includes(q)&&f.answers.length===before;i++)await tick(5);
    if(asked.includes(q))return'asked';return f.answers.at(-1)?.[2]===true?'allowed':'refused';};
  const a=(await c.initialize({initialPrompt:'one'}))!;assert.equal(a,'A');
  f.emit('A',{type:'RunStarted',runId:'r1'});
  assert.equal(await card('A','q1'),'asked');
  await c.resolveApproval('q1','allow-session');
  assert.equal(await card('A','q2'),'allowed','the yes holds in its own conversation');

  /* /clear: the next message starts a new conversation */
  c.startFresh({running:false});
  await c.send('two',{model:'m',running:false});await tick(20);
  f.emit('B',{type:'RunStarted',runId:'r2'});
  assert.equal(await card('B','q3'),'asked','after /clear the new conversation asks again');
  await c.resolveApproval('q3','deny-once');

  /* /resume of another conversation */
  await c.resumeSession('C');await tick(20);
  f.emit('C',{type:'RunStarted',runId:'r3'});
  assert.equal(await card('C','q4'),'asked','a conversation opened with /resume asks again');
  await c.resolveApproval('q4','deny-once');

  /* /resume back to A: its yes is there */
  await c.resumeSession('A');await tick(20);
  f.emit('A',{type:'RunStarted',runId:'r4'});
  assert.equal(await card('A','q5'),'allowed','back on A, the yes it gave is there');
  c.close();
});

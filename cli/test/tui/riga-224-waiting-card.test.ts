/*
 * Riga 224, round 2 (judge v2579; security review of 22/11, P1): a card waiting for an answer belongs to the conversation it was
 * asked in. With the card of s1 open, the row «s3» of the home still takes a click (/resume s3); the «yes for this session» given
 * then to the card of s1 must count in s1, not in s3: the same card in s3 asks, and back in s1 it does not.
 * Mounts: the REAL TuiApp (r5a-s-fixture.ts) at 120×40, as the reviewer measured it; and the real session controller and permission
 * engine over a fake runtime. A temp profile, no kernel, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const env=hermeticProfile();after(()=>env.restore());
let n=0;const project=()=>{const root=join(env.root,`waiting-card-${++n}`);mkdirSync(root,{recursive:true});return root;};
const cellOf=(lines:readonly string[],pattern:RegExp)=>{const row=lines.findIndex(line=>pattern.test(line));return row<0?null:{row,col:lines[row]!.search(pattern)+1};};
const LINT={tipo:'comando',comando:'npm run lint'};

test('riga 224, round 2: on the real screen, a yes given to the card of s1 after a click on s3 counts in s1, and s3 still asks',async()=>{
  const answers:any[][]=[];let pointer:any=null;
  const mouseSelection={subscribe:()=>()=>{},key(){},active:()=>false,copyAgain:async()=>false,onClick(handler:any){pointer=handler;}};
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,props:{mouseSelection},
    runtimeExtra:{listSessions:async()=>[{sessionId:'s1'},{sessionId:'s3'}],answerApproval:async(...args:any[])=>{answers.push(args);}}});
  try{
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',azione:LINT});
    await app.waitFor('the card of s1 and s3 in the home',x=>/Allow for this session/u.test(x.text)&&/· s3/u.test(x.text));await sleep(450);
    const cell=cellOf((await app.screen()).lines,/· s3/u);assert.ok(cell,'premise: the row of s3 is on screen');
    const target=pointer.target({row:cell!.row,col:cell!.col+2});assert.match(String(target),/s3$/u,'premise: the row of s3 takes the click under the card');
    pointer.run(target);
    for(let i=0;i<80&&!app.calls.some((c:string)=>/s3/u.test(c));i++)await sleep(25);
    await sleep(400);
    assert.match((await app.screen()).text,/Allow for this session/u,'premise: the card of s1 is still on screen');
    app.press('2');
    for(let i=0;i<80&&!answers.length;i++)await sleep(25);
    assert.deepEqual(answers[0]?.slice(0,3),['s1','q1',true],'the yes went to the card of s1');
    app.emit('run.started',{runId:'r2'});await sleep(50);
    app.emit('approval.required',{requestId:'q2',azione:LINT});
    await app.waitFor('the same card in s3',x=>/Allow for this session/u.test(x.text));await sleep(300);
    assert.equal(answers.find(a=>a[1]==='q2'),undefined,'in s3 the card was answered by itself with the yes given to the card of s1');
  }finally{app.unmount();await sleep(50);}
});

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
test('riga 224, round 2: a card open in A, /resume C, «yes for this session»: C asks, back in A the yes is there',async()=>{
  const sinks=new Map<string,Set<(event:any)=>void>>();const answers:any[][]=[];const asked:string[]=[];
  const r:any={restore:async()=>({restored:0,total:0}),start:async()=>'A',resume:async(id:string)=>id,listSessions:async()=>['A','C'].map(sessionId=>({sessionId,parentId:null,depth:0})),export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async(...args:any[])=>{answers.push(args);},setPermissionMode:async()=>{},cancel:async()=>{},close:async()=>{}};
  const emit=(id:string,event:any)=>{for(const sink of sinks.get(id)??[])sink(event);};
  const c=createTuiSessionController({runtime:r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{if(p)asked.push(p.requestId);}} as any);
  const card=async(id:string,q:string)=>{const before=answers.length;emit(id,{type:'ApprovalRequested',requestId:q,azione:{tipo:'shell',comando:'npm run lint'}});
    for(let i=0;i<80&&!asked.includes(q)&&answers.length===before;i++)await tick(5);
    if(asked.includes(q))return'asked';return answers.at(-1)?.[2]===true?'allowed':'refused';};
  assert.equal(await c.initialize({initialPrompt:'one'}),'A');
  emit('A',{type:'RunStarted',runId:'r1'});
  assert.equal(await card('A','q1'),'asked');
  await c.resumeSession('C');await tick(20);
  await c.resolveApproval('q1','allow-session');
  emit('C',{type:'RunStarted',runId:'r2'});
  assert.equal(await card('C','q2'),'asked','the yes given to the card of A counted in C');
  await c.resolveApproval('q2','deny-once');
  await c.resumeSession('A');await tick(20);
  emit('A',{type:'RunStarted',runId:'r3'});
  assert.equal(await card('A','q3'),'allowed','back in A, the yes given to its card is there');
  c.close();
});

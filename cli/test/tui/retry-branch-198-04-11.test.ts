/*
 * Decision 198 (owner 04/11/2026; 213 = D1 a, «Riprova a ramo»): /retry no longer sends the last message again as a NEW turn of
 * the same conversation (the model saw the question twice, with its old answer in between). «Send it again» forks just before
 * that turn and sends the message in the new branch; «Edit it first» forks and leaves the message in the composer. The first
 * answer stays where it was (/resume). Without the cut (an older kernel), the old path is kept. Source: Hermes
 * hermes_cli/cli_session_mixin.py:777-819 (`retry_last`: the last turn is taken off, the prompt re-sent, the cached prefix kept).
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\u001b[B';
let n=0;const project=()=>{const root=join(env.root,`retry-branch-${++n}`);mkdirSync(root,{recursive:true});return root;};
/* the same words asked earlier too (rq): the LAST turn with them is cut, never the oldest */
const EVENTS=[
  {type:'RunStarted',runId:'rq',input:{consegna:'explain the parser'}},{type:'RunFinished',runId:'rq'},
  {type:'RunStarted',runId:'r0',input:{consegna:'first ask'}},{type:'RunFinished',runId:'r0'},
  {type:'RunStarted',runId:'r1',input:{consegna:'explain the parser'}},{type:'RunFinished',runId:'r1'},
];

async function mount(seen:string[],{cut=true,fails=false}={}){
  return mountR5a({cols:100,rows:30,root:project(),paths:env.paths,runtimeExtra:{
    capabilities:()=>({forkBeforeRun:cut,modelCheck:false}),
    export:(id:string)=>id==='s1'?{eventi:EVENTS}:{eventi:[]},
    forkBeforeRun:async(from:string,runId:string)=>{seen.push(`fork ${from} ${runId}`);if(fails)throw Object.assign(new Error('The source session is still running'),{code:'SESSION_NOT_READY'});return{sessionId:'b1',message:'explain the parser'};},
    resume:async(id:string,prompt?:string)=>{seen.push(`resume ${id} ${prompt}`);return id;},
  }});
}
async function askTwice(app:any,seen:string[]){
  await app.type('first ask');app.press(ENTER);
  await app.waitFor('first sent',()=>seen.includes('resume s1 first ask'));
  app.emit('run.started',{runId:'r0'});app.emit('run.completed',{runId:'r0'});await sleep(120);
  await app.type('explain the parser');app.press(ENTER);
  await app.waitFor('second sent',()=>seen.includes('resume s1 explain the parser'));
  app.emit('run.started',{runId:'r1'});app.emit('run.completed',{runId:'r1'});await sleep(120);
  await app.type('/retry');app.press(ENTER);
  await app.waitFor('the retry sheet',(x:any)=>/Send it again/u.test(x.text)&&/› explain the parser/u.test(x.text));await sleep(60);
}

test('198: «Send it again» forks before the last turn and sends it in the new branch, never twice in the same one',async()=>{
  const seen:string[]=[];const app=await mount(seen);
  try{
    await askTwice(app,seen);app.press(ENTER);
    await app.waitFor('sent in the branch',()=>seen.includes('resume b1 explain the parser'));
    assert.ok(seen.includes('fork s1 r1'),seen.join(' | '));
    assert.equal(seen.filter(call=>call==='resume s1 explain the parser').length,1,'the same conversation never gets the question twice');
    await app.waitFor('said so',x=>/Asked again in a new branch/u.test(x.text));
  }finally{app.unmount();}
});

test('198: «Edit it first» forks and leaves the message in the composer, nothing sent',async()=>{
  const seen:string[]=[];const app=await mount(seen);
  try{
    await askTwice(app,seen);app.press(DOWN);await sleep(60);app.press(ENTER);
    await app.waitFor('forked',()=>seen.includes('fork s1 r1'));await sleep(200);
    assert.ok(!seen.some(call=>call.startsWith('resume b1')),seen.join(' | '));
  }finally{app.unmount();}
});

test('on the contrary: a refused fork sends nothing; an older kernel without the cut keeps the old path',async()=>{
  const seen:string[]=[];const app=await mount(seen,{fails:true});
  try{
    await askTwice(app,seen);app.press(ENTER);
    await app.waitFor('the refusal',x=>/still running/iu.test(x.text)||/could not/iu.test(x.text));await sleep(150);
    assert.equal(seen.filter(call=>call.startsWith('resume')).length,2,seen.join(' | '));
  }finally{app.unmount();}
  const old:string[]=[];const legacy=await mount(old,{cut:false});
  try{
    await askTwice(legacy,old);legacy.press(ENTER);
    await legacy.waitFor('sent again',()=>old.filter(call=>call==='resume s1 explain the parser').length===2);
    assert.ok(!old.some(call=>call.startsWith('fork')));
  }finally{legacy.unmount();}
});

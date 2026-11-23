/*
 * Stage 7.5 (owner 03/10, «Tutto, lato CLI»): the /resume sheet says how many messages a conversation has and shows its last
 * exchange. Both come from the session's own events, read as export-format.ts reads them: your messages are `RunStarted.input`,
 * TALOS's answers are the assistant text messages.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {sessionDigest} from '../../src/sessions/digest.ts';

const run=(prompt:string)=>({type:'RunStarted',input:{prompt}});
const answer=(id:string,...parts:string[])=>[{type:'TextMessageStart',messageId:id,role:'assistant'},...parts.map(delta=>({type:'TextMessageContent',messageId:id,delta})),{type:'TextMessageEnd',messageId:id}];

test('messages are yours and TALOS\'s; the last exchange is your last message and the answer after it',()=>{
  const events=[run('Show me how sessions are refreshed'),...answer('a1','They are ','refreshed on each request.'),{type:'RunFinished'},
    run('The login e2e test is flaky. Find out why and fix it.'),{type:'ToolCallStart',toolCallId:'t1',toolCallName:'leggi'},{type:'ToolCallEnd',toolCallId:'t1'},
    ...answer('a2','Looking.'),...answer('a3','Fixed: the test now waits for the session cookie.'),{type:'RunFinished'}];
  assert.deepEqual(sessionDigest(events),{messages:5,you:'The login e2e test is flaky. Find out why and fix it.',answer:'Fixed: the test now waits for the session cookie.',branch:null});
});

test('a message still waiting for its answer, an empty answer, a user text message, nothing at all',()=>{
  assert.deepEqual(sessionDigest([run('first'),...answer('a1','ok'),run('second')]),{messages:3,you:'second',answer:null,branch:null},'no answer yet');
  assert.deepEqual(sessionDigest([run('hi'),...answer('a1','  ')]),{messages:1,you:'hi',answer:null,branch:null},'an empty answer is not a message');
  assert.deepEqual(sessionDigest([run('hi'),{type:'TextMessageStart',messageId:'u',role:'user'},{type:'TextMessageContent',messageId:'u',delta:'echo'},{type:'TextMessageEnd',messageId:'u'}]),{messages:1,you:'hi',answer:null,branch:null},'the user\'s echo is not TALOS\'s answer');
  assert.deepEqual(sessionDigest([]),{messages:0,you:null,answer:null,branch:null});
  assert.deepEqual(sessionDigest(undefined),{messages:0,you:null,answer:null,branch:null});
  assert.deepEqual(sessionDigest([run('streaming'),{type:'TextMessageStart',messageId:'a',role:'assistant'},{type:'TextMessageContent',messageId:'a',delta:'half an answer'}]),{messages:2,you:'streaming',answer:'half an answer',branch:null},'an answer cut off when the log ended still counts');
});

test('stage 7.6 /fork: your messages with their turn, newest first; a turn without a message is not one',async()=>{
  const {sessionTurns}=await import('../../src/sessions/digest.ts');
  const events=[{type:'RunStarted',runId:'r1',input:{prompt:'first'}},...answer('a1','ok'),{type:'RunStarted',runId:'r2',input:{}},{type:'RunStarted',runId:'r3',input:{prompt:'  second  '}},{type:'RunStarted',input:{prompt:'no run id'}}];
  assert.deepEqual(sessionTurns(events),[{runId:'r3',text:'second'},{runId:'r1',text:'first'}]);
  assert.deepEqual(sessionTurns(null),[]);
});

test('the branch is the kernel\'s, from the last turn (RunStarted.contesto.branch, agent-service.mjs)',()=>{
  const turn=(prompt:string,branch?:unknown)=>({type:'RunStarted',input:{prompt},...(branch===undefined?{}:{contesto:{progetto:null,cartella:'C:/p',branch}})});
  assert.equal(sessionDigest([turn('a','main'),turn('b','fix/rate-limit')]).branch,'fix/rate-limit','the last turn\'s');
  assert.equal(sessionDigest([turn('a','main'),turn('b')]).branch,'main','a turn without it keeps the one before');
  assert.equal(sessionDigest([turn('a',null)]).branch,null,'a detached HEAD or no checkout');
  assert.equal(sessionDigest([turn('a','  ')]).branch,null);
});

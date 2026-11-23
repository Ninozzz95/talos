/*
 * Judge v1611: the screen goes away (Ctrl+C, the end of -p, the terminal closing) while a message is being sent, and the runtime's
 * `start` answers only afterwards. The session controller then attaches the new session and tells the screen its queue is empty:
 * the screen is gone, so that word has nowhere to land. Before the cure it landed on the disposed render coordinator and came out
 * as an UNHANDLED rejection, RENDER_COORDINATOR_DISPOSED (attach -> hydrateQueue -> notifyQueue -> onQueueChange -> enqueueEvent).
 * The path is the one of r7-clear 7.13 (/clear, «Start a new conversation», send), with `start` slow as under load; r7-clear stays
 * as it is. Counted with process.on('unhandledRejection').
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B';
let n=0;const project=()=>{const root=join(env.root,`unmount-${++n}`);mkdirSync(root,{recursive:true});return root;};
const unhandled:string[]=[];
process.on('unhandledRejection',(reason:any)=>{unhandled.push(String(reason?.message??reason));});

async function slowMount(delay:number){
  const calls:string[]=[];
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,runtimeExtra:{
    start:async()=>{calls.push('start');await sleep(delay);return 's1';},
    resume:async(id:string)=>{calls.push('resume');await sleep(delay);return id;},
  }});
  return{app,calls};
}

test('a send whose start answers after the screen is gone leaves no unhandled rejection (the 7.13 path, start slow)',async()=>{
  for(const delay of [5,60]){
    const before=unhandled.length;
    const{app,calls}=await slowMount(delay);
    try{
      await app.type('first');app.press(ENTER);await sleep(delay+80);
      app.emit('run.started',{runId:'r1'});app.emit('message.delta',{messageId:'a1',delta:'x'});app.emit('run.completed',{runId:'r1'});await sleep(100);
      await app.type('/clear');app.press(ENTER);await app.waitFor('the clear sheet',(x:any)=>/── Clear ─/u.test(x.text));
      app.press(DOWN);app.press(ENTER);await app.waitFor('a new conversation',(x:any)=>/New conversation/u.test(x.text));
      await app.type('hello again');app.press(ENTER);await sleep(1);
    }finally{app.unmount();}
    await sleep(delay+400);
    assert.equal(calls.at(-1),'start',`start ${delay} ms: the send after «Start a new conversation» reached the runtime as a new session`);
    assert.deepEqual(unhandled.slice(before),[],`start ${delay} ms: nothing unhandled after the unmount`);
  }
});

test('the same send with the screen still there draws the conversation (the guard drops nothing while mounted)',async()=>{
  const{app,calls}=await slowMount(5);
  try{
    await app.type('hello');app.press(ENTER);await sleep(100);
    app.emit('run.started',{runId:'r1'});app.emit('message.delta',{messageId:'a1',delta:'still drawn'});app.emit('run.completed',{runId:'r1'});
    await app.waitFor('the answer on screen',(x:any)=>/still drawn/u.test(x.text));
    assert.equal(calls.length,1,'one send reached the runtime');
  }finally{app.unmount();}
});

/*
 * Flaky «R1-R — two prompts sent from the composer each show once» (r1-resume-live-app, 4 failures in 12 parallel runs on
 * 14/10/2026, each after 30 s): not load. The second prompt was typed while the first turn was closing: the screen still said
 * the turn was running, so the controller tried the kernel's queue, the kernel refused (the turn was closing), and the message
 * went into the CLI's own queue «goes in when the turn ends» — but the turn had ended during those awaits, its end had already
 * drained an empty queue, and the controller decided from the `running` it was called with. The message waited for a turn end
 * that never came (screen: «You · queued, goes in when the turn ends», «queue 1», nothing sent). Now, once the message is in
 * the CLI's queue, a turn that has ended (and none started since) sends it. Found on the way: a message queued while the queue
 * was starting the next turn was dropped when that dispatch rewrote the queue from its old copy; it now stays and goes next.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function closingTurnRuntime(){
  const sinks=new Map<string,(e:any)=>void>();const resumes:string[]=[];const shells:string[]=[];
  const r:any={restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>({eventi:[]}),start:async()=>'s1',
    resume:async(id:string,prompt?:string)=>{resumes.push(String(prompt));return id;},
    runShellCommand:async(_id:string,command:string)=>{shells.push(command);return{};},
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
    /* the kernel refuses because the turn is closing; the turn's end reaches the CLI while the refusal travels back */
    async queueMessage(id:string){sinks.get(id)?.({type:'RunFinished',runId:'r1'});throw Object.assign(new Error('closing'),{code:'SESSION_NOT_READY'});}};
  return{r,sinks,resumes,shells};
}

test('a message the kernel refused while the turn was closing goes out when that turn has already ended',async()=>{
  const f=closingTurnRuntime();
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',input:{consegna:'alpha prompt one'}});
  await c.send('beta prompt two',{model:'m',running:true});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['beta prompt two'],'sent, not left waiting for a turn end that already happened');
  assert.deepEqual(c.queue(),[],'nothing left in the CLI queue');
});

test('while the turn is still open, the refused message waits for its end, then goes',async()=>{
  const f=closingTurnRuntime();
  f.r.queueMessage=async()=>{throw Object.assign(new Error('closing'),{code:'SESSION_NOT_READY'});};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',input:{consegna:'alpha prompt one'}});
  await c.send('beta prompt two',{model:'m',running:true});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,[],'the turn is open: it waits');
  assert.deepEqual(c.queue(),[{kind:'prompt',text:'beta prompt two'}]);
  f.sinks.get('s1')?.({type:'RunFinished',runId:'r1'});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['beta prompt two'],'and goes at the turn end');
});

test('the screen still says «running» after the controller saw the turn end: the message goes, not into a dead queue',async()=>{
  const f=closingTurnRuntime();
  f.r.queueMessage=async()=>{throw Object.assign(new Error('closing'),{code:'SESSION_NOT_READY'});};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',input:{consegna:'alpha prompt one'}});
  f.sinks.get('s1')?.({type:'RunFinished',runId:'r1'});
  for(let i=0;i<5;i++)await tick();
  await c.send('beta prompt two',{model:'m',running:true});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['beta prompt two']);
  assert.deepEqual(c.queue(),[]);
});

test('a turn the queue started is not doubled: a message typed while that drain is in flight waits for its end',async()=>{
  const f=closingTurnRuntime();
  f.r.queueMessage=async()=>{throw Object.assign(new Error('closing'),{code:'SESSION_NOT_READY'});};
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  f.r.resume=async(id:string,prompt?:string)=>{f.resumes.push(String(prompt));f.sinks.get(id)?.({type:'RunStarted',runId:`r${f.resumes.length+1}`,input:{consegna:prompt}});await gate;return id;};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',input:{consegna:'one'}});
  await c.send('two',{model:'m',running:true});
  f.sinks.get('s1')?.({type:'RunFinished',runId:'r1'});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two'],'the turn end sent «two»');
  await c.send('three',{model:'m',running:true});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two'],'«three» waits: the turn «two» opened is running');
  release();for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two'],'still waiting once that turn is under way');
  await c.send('four',{model:'m',running:true});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two'],'«four» waits too: a turn has started since the last end');
  f.sinks.get('s1')?.({type:'RunFinished',runId:'r2'});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two','three\n\nfour'],'both go at the end of that turn, together, in order');
});

test('typed while the queue is still starting the next turn (before it is announced): it waits for that turn\'s end',async()=>{
  const f=closingTurnRuntime();
  f.r.queueMessage=async()=>{throw Object.assign(new Error('closing'),{code:'SESSION_NOT_READY'});};
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  f.r.resume=async(id:string,prompt?:string)=>{f.resumes.push(String(prompt));await gate;f.sinks.get(id)?.({type:'RunStarted',runId:'r2',input:{consegna:prompt}});return id;};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',input:{consegna:'one'}});
  await c.send('two',{model:'m',running:true});
  f.sinks.get('s1')?.({type:'RunFinished',runId:'r1'});
  for(let i=0;i<5;i++)await tick();
  await c.send('three',{model:'m',running:true});
  release();for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two'],'«three» is not sent into the turn that is starting');
  f.sinks.get('s1')?.({type:'RunFinished',runId:'r2'});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(f.resumes,['two','three']);
});

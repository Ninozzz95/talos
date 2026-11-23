import assert from 'node:assert/strict';import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';
/* `finishOnAnswer`: like the kernel, the turn ends only after the approval is answered (it waits for the answer). */
function runtime(events:any[],finishOnAnswer=false){let answered:any[]=[];let sink:((e:any)=>void)|null=null;return{answered,r:{start:async()=> 's',subscribe(_id:string,next:(e:any)=>void){sink=next;queueMicrotask(()=>events.forEach(next));return()=>{};},answerApproval:async(...x:any[])=>{answered.push(x);if(finishOnAnswer)queueMicrotask(()=>sink?.({type:'RunFinished'}));},cancel:async()=>{},restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}} as any};}
test('acceptEdits auto-approves write approval in headless mode',async()=>{const f=runtime([{type:'ApprovalRequested',requestId:'r1',azione:{tipo:'scrittura',percorso:'src/a.ts'}},{type:'RunFinished'}]);const x=await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'acceptEdits',permissionRules:{allow:[],ask:[],deny:[]}} as any);assert.equal(x.result.ok,true);assert.deepEqual(f.answered[0],['s','r1',true,{motivo:'modalita'}]);});
/* C-005 (owner 01/10): the refusal goes back to the model and the turn ends normally (RunFinished follows the answer). */
test('default headless denies unresolved approval without reading stdin',async()=>{const f=runtime([{type:'ApprovalRequested',requestId:'r1',azione:{tipo:'comando',comando:'npm test'}}],true);const x=await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'default',permissionRules:{allow:[],ask:[],deny:[]}} as any);assert.equal(x.result.ok,true);assert.equal(x.result.permissionDenials?.[0]?.code,'PERMISSION_REQUIRED');assert.deepEqual(f.answered[0]?.slice(0,3),['s','r1',false]);});

test('streaming event sink does not require buffering the event log',async()=>{
  const many=[...Array.from({length:2000},(_,i)=>({type:'TextMessageContent',messageId:'m',delta:i===1999?'done':''})),{type:'RunFinished'}];
  const f=runtime(many);let streamed=0;
  const x=await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]}} as any,()=>{streamed++;});
  assert.equal(streamed,2001);
  assert.equal(x.events.length,0);
  assert.equal(x.result.result?.text,'done');
});


/* C-005 (owner 01/10) replaces "the permission envelope wins over the cleanup cancellation": a denial no longer cancels
   the run at all, so there is no cleanup failure to win against. A cancellation would end the run as failed. */
test('a denial never cancels the run',async()=>{
  let sink:((event:any)=>void)|null=null;const answered:any[]=[];let cancelled=0;
  const runtime:any={
    start:async()=> 's',
    subscribe(_id:string,fn:(event:any)=>void){sink=fn;queueMicrotask(()=>fn({type:'ApprovalRequested',requestId:'r1',azione:{tipo:'comando',comando:'npm test'}}));return()=>{};},
    answerApproval:async(...x:any[])=>{answered.push(x);queueMicrotask(()=>sink?.({type:'RunFinished'}));},
    cancel:async()=>{cancelled++;sink?.({type:'RunError',code:'CANCELLED',message:'cleanup cancellation'});},
    restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}
  };
  const x=await collectHeadlessRun(runtime,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'default',permissionRules:{allow:[],ask:[],deny:[]}} as any);
  assert.equal(cancelled,0);
  assert.equal(x.result.ok,true);
  assert.equal(x.result.permissionDenials?.[0]?.code,'PERMISSION_REQUIRED');
  assert.deepEqual(answered[0]?.slice(0,3),['s','r1',false]);
});

test('timeout envelope wins even when timeout cleanup emits CANCELLED',async()=>{
  let sink:((event:any)=>void)|null=null;
  const runtime:any={
    start:async()=> 's',
    subscribe(_id:string,fn:(event:any)=>void){sink=fn;return()=>{};},
    answerApproval:async()=>{},
    cancel:async()=>{sink?.({type:'RunError',code:'CANCELLED',message:'cleanup cancellation'});},
    restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}
  };
  const x=await collectHeadlessRun(runtime,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]},timeoutSeconds:0} as any);
  assert.equal(x.result.error?.code,'RUN_TIMEOUT');
  assert.equal((x.result as any).failure.envelope.code,'RUN_TIMEOUT');
  assert.equal((x.result as any).failure.envelope.component,'runtime');
});

import assert from 'node:assert/strict';
import {t} from '../../src/i18n/index.ts';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {resolveKeybinding} from '../../src/tui/keybindings.ts';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(){
  let sink:(event:any)=>void=()=>{};const resumes:any[]=[],steers:any[]=[],cancels:string[]=[];
  const runtime:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[],start:async()=> 's1',
    resume:async(id:string,prompt?:string,attachments?:any[])=>{resumes.push([id,prompt,attachments]);return id;},
    fork:async()=> 'fork',compact:async()=>({ok:true}),shell:async()=>{},export:()=>null,close:async()=>{},
    subscribe(_id:string,next:(event:any)=>void){sink=next;return()=>{};},
    answerApproval:async()=>{},
    steer:async(id:string,prompt:string,attachments?:any[])=>{steers.push([id,prompt,attachments]);sink({type:'RunRedirectRequested',redirectId:'r1',testo:prompt});return{redirectId:'r1'};},
    cancel:async(id:string)=>{cancels.push(id);sink({type:'RunRedirectCancelled',redirectId:'r1'});sink({type:'RunError',message:'stopped',code:'ABORTED'});},
  };
  const states:any[]=[];
  const controller=createTuiSessionController({
    runtime,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},
    onSteerState:(state:any)=>states.push(state),
  } as any);
  return{runtime,controller,resumes,steers,cancels,states,emit:(event:any)=>sink(event)};
}

test('M3-E RED — steering is distinct from follow-up and old-run termination cannot drain the queue',async()=>{
  const f=fixture();f.controller.attach('s1');await f.controller.queueReady();
  await f.controller.send('after this',{model:'m',running:true});
  const before=f.controller.queue().map((row:any)=>row.text);
  f.emit({type:'RunRedirectApplied',redirectId:'historical',testo:'old'});assert.deepEqual(f.states,[]);
  const outcome=await f.controller.steer('change direction',{running:true});
  assert.deepEqual(outcome,{status:'requested',redirectId:'r1'});assert.deepEqual(f.controller.queue().map((row:any)=>row.text),before);
  assert.equal(f.states.at(-1)?.status,'requested');
  f.emit({type:'RunError',message:'redirect boundary',code:'ABORTED'});await tick();assert.deepEqual(f.resumes,[]);
  f.emit({type:'RunRedirectApplied',redirectId:'r1',testo:'change direction'});assert.equal(f.states.at(-1)?.status,'applied');
  f.emit({type:'RunStarted',threadId:'s1',runId:'next'});f.emit({type:'RunFinished',threadId:'s1',runId:'next'});await tick();
  assert.equal(f.resumes[0]?.[1],'after this');
});

test('M3-E RED — explicit cancel cannot dispatch queued work through the redirect-cancel race',async()=>{
  const f=fixture();f.controller.attach('s1');await f.controller.queueReady();
  await f.controller.send('later',{model:'m',running:true});await f.controller.steer('change',{running:true});
  await f.controller.cancel();await tick();
  assert.deepEqual(f.resumes,[]);assert.deepEqual(f.controller.queue(),[]);assert.deepEqual(f.cancels,['s1']);
  assert.equal(f.states.some((row:any)=>row.status==='cancelled'),true);
});

test('M3-E RED — inactive or shell steering is rejected without calling runtime steer or consuming queue',async()=>{
  const f=fixture();f.controller.attach('s1');await f.controller.queueReady();await f.controller.send('queued',{model:'m',running:true});
  const inactive=await f.controller.steer('change',{running:false});
  const shell=await f.controller.steer('!git status',{running:true});
  assert.equal(inactive.status,'rejected');assert.equal(shell.status,'rejected');assert.equal(f.steers.length,0);
  assert.deepEqual(f.controller.queue().map((row:any)=>row.text),['queued']);
});

test('M3-E RED — Alt+S is explicit steer while Ctrl+C stays the global safety interrupt',async()=>{
  assert.equal(resolveKeybinding('s',{meta:true},['composer','global']),'steer');
  assert.equal(resolveKeybinding('c',{ctrl:true},['composer','global']),'interrupt');
  const {assertValidKeymap}=await import('../../src/tui/keymap-resolver.ts');
  const effective=assertValidKeymap({steer:['Alt+R']});
  assert.equal(resolveKeybinding('r',{meta:true},['composer','global'],effective),'steer');
});

test('M3-E RED — app keeps ordinary submit/queue separate and labels steering lifecycle truthfully',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/action==='steer'/u);
  /* R2 (Q-R2-10, gate E1/E6): the lifecycle words are dictionary entries and a refusal goes through the error anatomy,
     so the app names the ids and the dictionary keeps the truthful wording. */
  assert.match(source,/t\('screen\.steer\.requested'\)/u);assert.match(t('screen.steer.requested'),/Steering requested/u);
  assert.match(source,/t\('screen\.steer\.applied'\)/u);assert.match(t('screen.steer.applied'),/Steered at safe boundary/u);
  assert.match(source,/\{rejected:true\}/u);assert.match(t('screen.error.rejected',{context:t('screen.action.steering'),what:'x'}),/Steering rejected/u);
  assert.match(source,/controller\.send/u);
  assert.match(source,/controller\.steer/u);
});

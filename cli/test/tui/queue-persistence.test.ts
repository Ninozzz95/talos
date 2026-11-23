import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

function fakeRuntime(){
  const sinks=new Map<string,(event:any)=>void>();const resumes:any[]=[];const shells:any[]=[];
  let resumeImpl=async(id:string,prompt?:string,attachments?:any[])=>{resumes.push([id,prompt,attachments]);return id;};
  const runtime:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[],start:async()=> 'new',
    resume:(id:string,prompt?:string,attachments?:any[])=>resumeImpl(id,prompt,attachments),
    fork:async()=> 'fork',compact:async()=>({ok:true}),subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},
    answerApproval:async()=>{},cancel:async()=>{},shell:async(id:string,command:string)=>{shells.push([id,command]);},
    export:()=>null,close:async()=>{},
  };
  return{runtime,sinks,resumes,shells,setResume(fn:typeof resumeImpl){resumeImpl=fn;}};
}
function paths(root:string){return{dataRoot:root,queueRoot:join(root,'queues'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'sessions'),logsRoot:join(root,'logs'),projectOverridesRoot:join(root,'projects'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}} as any;}
function controller(f:any,root:string){return createTuiSessionController({runtime:f.runtime,projectRoot:root,model:'openai:m',mode:'default',rules:{allow:[],ask:[],deny:[]},paths:paths(root),onEvent:()=>{}} as any);}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('M3-D restart restores per-session FIFO queue paused and never auto-dispatches replayed completion',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-queue-restart-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const first=fakeRuntime();const c1=controller(first,root);c1.attach('s1');await c1.queueReady();
  await c1.send('A',{model:'m',running:true});await c1.send('B',{model:'m',running:true});
  assert.deepEqual(c1.queue().map((x:any)=>x.text),['A','B']);c1.close();

  const second=fakeRuntime();const c2=controller(second,root);c2.attach('s1');await c2.queueReady();
  assert.equal(c2.queuePaused(),true);assert.deepEqual(c2.queue().map((x:any)=>x.text),['A','B']);
  second.sinks.get('s1')?.({type:'RunFinished'});await tick();assert.deepEqual(second.resumes,[]);
  /* F-Q5 (owner 03/10): the queued messages go out together, in order, in one turn */
  await c2.dispatchQueue();assert.equal(c2.queuePaused(),false);assert.equal(second.resumes[0]?.[1],'A\n\nB');assert.deepEqual(c2.queue().map((x:any)=>x.text),[]);
});

test('M3-D stable ids support durable edit reorder delete and clear',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-queue-edit-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const f=fakeRuntime();const c=controller(f,root);c.attach('s1');await c.queueReady();
  await c.send('A',{model:'m',running:true});await c.send('B',{model:'m',running:true});await c.send('C',{model:'m',running:true});
  const [a,b,cEntry]=c.queueEntries();assert.ok(a?.id&&b?.id&&cEntry?.id);
  await c.editQueue(b!.id,'B2');await c.moveQueue(cEntry!.id,-1);await c.deleteQueue(a!.id);
  assert.deepEqual(c.queue().map((x:any)=>x.text),['C','B2']);c.close();

  const second=fakeRuntime();const restored=controller(second,root);restored.attach('s1');await restored.queueReady();
  assert.deepEqual(restored.queue().map((x:any)=>x.text),['C','B2']);assert.equal(restored.queuePaused(),true);
  const dropped=await restored.clearQueue();assert.equal(dropped.length,2);restored.close();
  const third=fakeRuntime();const empty=controller(third,root);empty.attach('s1');await empty.queueReady();assert.deepEqual(empty.queue(),[]);
});

async function until(predicate:()=>boolean,label:string){for(let attempt=0;attempt<300;attempt+=1){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail(`Timed out waiting for ${label}`);}

test('M3-D dispatching state becomes uncertain after restart instead of disappearing or auto-running',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-queue-uncertain-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const first=fakeRuntime();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  first.setResume(async(id,prompt,attachments)=>{first.resumes.push([id,prompt,attachments]);await gate;return id;});
  const c1=controller(first,root);c1.attach('s1');await c1.queueReady();await c1.send('A',{model:'m',running:true});
  /* R0 realignment (2026-09-23): the entry becomes `dispatching` only after two awaited atomic writes (open, write,
     fsync, rename, directory fsync — `queue-store.ts`), which never fit in one tick; the test waits for the state
     instead of assuming it after a single turn of the event loop. */
  const dispatch=c1.dispatchQueue();await until(()=>c1.queueEntries()[0]?.status==='uncertain','the in-flight entry to be persisted as dispatching');

  const second=fakeRuntime();const c2=controller(second,root);c2.attach('s1');await c2.queueReady();
  assert.equal(c2.queuePaused(),true);assert.equal(c2.queueEntries()[0]?.status,'uncertain');
  second.sinks.get('s1')?.({type:'RunFinished'});await tick();assert.deepEqual(second.resumes,[]);
  release();await dispatch;
});

test('M3-D cancel clears durable queued work as well as memory',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-queue-cancel-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const f=fakeRuntime();const c=controller(f,root);c.attach('s1');await c.queueReady();await c.send('later',{model:'m',running:true});await c.cancel();c.close();
  const second=fakeRuntime();const restored=controller(second,root);restored.attach('s1');await restored.queueReady();assert.deepEqual(restored.queue(),[]);
});

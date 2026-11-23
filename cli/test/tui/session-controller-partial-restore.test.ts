/*
 * LONG-CHAT «prima la coda», tappa B1 (07/10/2026): resuming or forking a session by id asks the runtime to restore that session's family only
 * (runtime.restore({sessionIds:[id]})); `last` needs the list, so it restores everything; a plain start restores nothing. Reading what the controller
 * needs about the session it just attached (the outcome of its replayed run) is done on what is already in memory (listSessions({scope:'loaded'})),
 * never by restoring the archive again - that read was on the critical path of every resume.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

function runtime(){
  const restores:unknown[]=[];const lists:unknown[]=[];
  const r:any={
    restore:async(...args:unknown[])=>{restores.push(args.length?args[0]:'all');return{restored:1,total:1};},
    listSessions:async(options?:unknown)=>{lists.push(options??'all');return[{id:'abc123',sessionId:'abc123',avviataAlle:'2026-01-01',outcome:'completed'},{id:'newest',sessionId:'newest',avviataAlle:'2026-02-01'}];},
    export:()=>({eventi:[]}),start:async()=>'new',resume:async(id:string)=>id,fork:async()=>'forked',
    subscribe(){return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
  };
  return{r,restores,lists};
}
const make=(f:any)=>createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);

test('B1 resume by id restores that family only, and settles the replayed run from what is in memory',async()=>{
  const f=runtime();
  await make(f).initialize({resume:'abc123'});
  assert.deepEqual(f.restores,[{sessionIds:['abc123']}]);
  assert.ok(!f.lists.includes('all'),`no whole-archive list on the way: ${JSON.stringify(f.lists)}`);
});

test('B1 fork by id restores the source family only',async()=>{
  const f=runtime();
  await make(f).initialize({fork:'abc123'});
  assert.deepEqual(f.restores,[{sessionIds:['abc123']}]);
});

test('B2 resume last: the start-up call, the list (index-backed), then the family of the newest session - never the whole archive',async()=>{
  const f=runtime();
  const id=await make(f).initialize({resume:'last'});
  assert.equal(id,'newest');
  assert.deepEqual(f.restores,[{sessionIds:[]},{sessionIds:['newest']}]);
  assert.ok(f.lists.includes('all'),'the list that finds the newest session is the default one, which the facade serves from the index');
});

test('B2 fork last restores the family of the newest session the same way',async()=>{
  const f=runtime();
  await make(f).initialize({fork:'last'});
  assert.deepEqual(f.restores,[{sessionIds:[]},{sessionIds:['newest']}]);
});

test('B1 a plain start restores nothing at all from the controller',async()=>{
  const f=runtime();
  await make(f).initialize({initialPrompt:'hello'});
  assert.deepEqual(f.restores,[]);
});

test('B1 the agent tree of the attached session is built from what is in memory, not from the archive',async()=>{
  const f=runtime();const c=make(f);
  await c.initialize({resume:'abc123'});f.lists.length=0;
  await c.agentTree().catch(()=>{/* the fake rows are not a valid tree; only the question asked of the runtime is under test */});
  assert.deepEqual(f.lists,[{scope:'loaded'}]);
});

test('B1 the session picker still lists the whole archive',async()=>{
  const f=runtime();const c=make(f);
  await c.initialize({resume:'abc123'});f.lists.length=0;
  await c.listSessions();
  assert.deepEqual(f.lists,['all']);
});

test('B1 a run the replay left open is settled from what is in memory: one question to the runtime, asked with the loaded scope',async()=>{
  const f=runtime();const events:any[]=[];
  f.r.subscribe=(id:string,sink:(e:any)=>void)=>{sink({type:'RunStarted',threadId:id,runId:'r1'});return()=>{};};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:(e:any)=>events.push(e)} as any);
  await c.initialize({resume:'abc123'});
  assert.deepEqual(f.lists,[{scope:'loaded'}],'the outcome of the replayed run was asked once, from memory');
  assert.ok(events.some(e=>e.type==='run.cancelled'&&e.interrupted===true),'and the settled run (the row says completed) was closed: the question really was asked');
});

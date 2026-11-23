/*
 * LONG-CHAT «prima la coda», tappa B1 (owner 07/10/2026 notte: «Sì, dentro la 0.5.0», «solo opzioni additive nel kernel»). The facade used to restore the
 * WHOLE archive before anything else: `start` (a new task needs no old session), every call that names one session, and every `listSessions`. On a copy
 * of the owner's real archive (43 journals, 57 MB) a plain start cost ~280 ms more than with an empty profile, and every resume paid for the 42 sessions it
 * did not open. Now the facade asks the kernel for what it needs: nothing for a new task (`ripristina({soloSessioni:[]})`, which still does the start-up
 * work), the family of the named session for a call that names one (`ripristina({soloSessioni:[id]})`), the whole archive only for the list and for «last».
 * The kernel side (harness-ui/tests/ripristina-solo-sessioni.test.mjs) proves a partial restore equals the full one for the family asked for; here the
 * facade is proven to ask for exactly that, once, and never for more. Competitors read in cloned code (07/10/2026): Codex thread_rollout_resolver (one
 * rollout per id), Pi SessionManager.open (header, then the file), OpenCode Session.get (one row).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function fake(){
  const restores:string[]=[];const calls:string[]=[];
  const registry:any={
    async ripristina(options?:unknown){restores.push(options===undefined?'all':JSON.stringify(options));return{ripristinate:0,totali:0};},
    avviaLibero(){calls.push('avvia');return{sessionId:'new1'};},
    elenca(){calls.push('elenca');return[{sessionId:'s9',avviataAlle:'2026-02-01'}];},
    resume(id:string){calls.push(`resume:${id}`);return{sessionId:id};},
    forka(id:string){calls.push(`fork:${id}`);return{sessionId:'forked'};},
    aggiornaImpostazioni:async(id:string)=>{calls.push(`settings:${id}`);return{ok:true};},
    elimina:async(id:string)=>{calls.push(`delete:${id}`);return{ok:true};},
    accodaMessaggio:(id:string)=>{calls.push(`queue:${id}`);return{ok:true,posizione:1};},
    compatta:async(id:string)=>{calls.push(`compact:${id}`);return{ok:true,compattato:true};},
    iscriviti:()=>()=>{},ferma:(id:string)=>{calls.push(`stop:${id}`);return true;},rispondiApprovazione:()=>({ok:true}),
  };
  return{registry,restores,calls};
}
/* the kernel's first call is always the empty selection (its start-up work wants to run while no session is in memory) */
const PREPARE='{"soloSessioni":[]}';
const start=(r:any)=>r.start({projectRoot:'/repo',prompt:'fix',model:'m',permissionMode:'default'});

test('B1 a new task restores NOTHING: one start-up call with an empty selection, however many tasks are started',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await start(r);await start(r);
  assert.deepEqual(f.restores,['{"soloSessioni":[]}'],'the kernel is prepared once, with no session');
});

test('B1 a call that names one session restores that session\'s family once, and not again for the same id',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await r.resume('s9','go');await r.resume('s9','again');await r.setReasoningEffort('s9','high');await r.compact('s9');
  await r.cancel('s9'); /* stopping a session that is not in memory has nothing to restore: it never did */
  assert.deepEqual(f.restores,[PREPARE,'{"soloSessioni":["s9"]}']);
  await r.fork('s7');
  assert.deepEqual(f.restores,[PREPARE,'{"soloSessioni":["s9"]}','{"soloSessioni":["s7"]}'],'another id is another family');
});

test('B1 a task started first and a session resumed after it: the start-up call, then the family',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await start(r);await r.resume('s9','go');
  assert.deepEqual(f.restores,['{"soloSessioni":[]}','{"soloSessioni":["s9"]}']);
});

test('B1 the list restores the whole archive, once; after that nothing is restored again',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await r.listSessions();
  assert.deepEqual(f.restores,[PREPARE,'all']);
  await r.listSessions();await r.resume('s9','go');await start(r);
  assert.deepEqual(f.restores,[PREPARE,'all'],'the archive is in memory: no partial call after a full one');
});

test('B1 listSessions({scope:\'loaded\'}) never restores: it answers with what is in memory',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  const rows=await r.listSessions({scope:'loaded'});
  assert.deepEqual(f.restores,[],'no restore at all');
  assert.equal(rows.length,1);
  assert.equal(rows[0]!.sessionId??rows[0]!.id,'s9');
});

test('B1 restore() without a selection is the whole archive; with one it is partial and says so',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  assert.deepEqual(await r.restore(),{restored:0,total:0});
  assert.deepEqual(f.restores,[PREPARE,'all']);
  const g=fake();const q=createSessionFacade(g.registry,{model:'m'});
  assert.deepEqual(await q.restore({sessionIds:['a','b']}),{restored:0,total:0,partial:true});
  assert.deepEqual(g.restores,[PREPARE,'{"soloSessioni":["a","b"]}']);
  await q.resume('a','x');await q.resume('b','x');
  assert.deepEqual(g.restores,[PREPARE,'{"soloSessioni":["a","b"]}'],'both ids were part of the selection: nothing more to restore');
});

test('B1 a kernel that does not know the option (older, or a fixture) still works: it restores everything and the facade does not break',async()=>{
  const calls:unknown[]=[];
  const registry:any={ripristina:async(...args:unknown[])=>{calls.push(args);return{ripristinate:5,totali:5};},avviaLibero:()=>({sessionId:'n'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({})};
  const r=createSessionFacade(registry,{model:'m'});
  assert.equal(await start(r),'n');
  assert.equal(calls.length,1);
});

test('B1 every call that names one session restores exactly that session\'s family, never the archive',async()=>{
  const calls:Array<[string,unknown[]]>=[
    ['setReasoningEffort',['sZ','high']],['setSessionModel',['sZ','m2']],['setPermissionMode',['sZ','plan']],['resume',['sZ','go']],['fork',['sZ']],
    ['deleteSession',['sZ']],['queueMessage',['sZ','hello']],['unqueueMessage',['sZ','q1']],['steer',['sZ','now']],['compact',['sZ']],['shell',['sZ','ls']],['contextStatus',['sZ']],
  ];
  for(const [name,args] of calls){
    const f=fake();const r:any=createSessionFacade(f.registry,{model:'m'});
    assert.equal(typeof r[name],'function',`${name} is part of the runtime`);
    try{await r[name](...args);}catch{/* the method may fail after it restored: only the restore is under test here */}
    assert.deepEqual(f.restores,[PREPARE,'{"soloSessioni":["sZ"]}'],name);
  }
});

test('B1 a list after a new task restores the archive then: the start-up call is not the archive',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await start(r);await r.listSessions();
  assert.deepEqual(f.restores,['{"soloSessioni":[]}','all']);
});

test('B2 a partial restore after the whole archive, or of families already loaded, is not asked of the kernel',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await r.restore();
  assert.deepEqual(await r.restore({sessionIds:['a']}),{restored:0,total:0,partial:true});
  assert.deepEqual(f.restores,[PREPARE,'all']);
  const g=fake();const q=createSessionFacade(g.registry,{model:'m'});
  await q.restore({sessionIds:['a']});await q.restore({sessionIds:['a']});await q.restore({sessionIds:[]});
  assert.deepEqual(g.restores,[PREPARE,'{"soloSessioni":["a"]}','{"soloSessioni":[]}'],'the empty start-up selection is never skipped by "every id is loaded" (there are no ids)');
});

test('B1 prepare-first: the preparing call is made once, whichever call comes first (the whole archive, or a named family)',async()=>{
  const f=fake();const r=createSessionFacade(f.registry,{model:'m'});
  await r.restore();await r.restore();
  assert.deepEqual(f.restores,[PREPARE,'all','all'],'a second explicit restore reads the archive again, as it always did, without preparing again');
  const g=fake();const q=createSessionFacade(g.registry,{model:'m'});
  await q.restore({sessionIds:['a']});await q.restore();
  assert.deepEqual(g.restores,[PREPARE,'{"soloSessioni":["a"]}','all'],'a named family counts as the preparation: the whole-archive call after it does not prepare again');
});

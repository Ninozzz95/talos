import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {REPLAY_WINDOW,createRuntimeReplayBuffer,createStartOperationJournal,startOperationFingerprint} from '../../src/runtime/replay-buffer.ts';

test('M7-C RED — replay buffer keeps native sequence order, deduplicates identical replay and rejects conflicting identity',()=>{
  const buffer=createRuntimeReplayBuffer();
  buffer.push('s1',{type:'RunStarted',_sequenza:1});
  buffer.push('s1',{type:'StateDelta',_sequenza:2,delta:[{path:'/x',value:1}]});
  buffer.push('s1',{type:'StateDelta',_sequenza:2,delta:[{path:'/x',value:1}]});
  assert.deepEqual(buffer.after('s1',1).map((x:any)=>x._sequenza),[2]);
  assert.throws(()=>buffer.push('s1',{type:'RunFinished',_sequenza:2}),/REPLAY_EVENT_CONFLICT/u);
});

/* UI phase stage 2, cure 2b (heap probe 2, 01/10; owner: bounded window): the buffer kept a full copy of every event of
   the session for ever. It now keeps whole events only for the last REPLAY_WINDOW sequences and a small fingerprint for
   every sequence seen, so a conflict is still caught anywhere in the session; a cursor older than the window is an
   explicit REPLAY_EVENTS_EXPIRED, never a silent gap (Hermes _RunStream BACKLOG_LIMIT; open-design #5411 anti-pattern). */
test('the replay window keeps whole events only for the last REPLAY_WINDOW sequences of a session',()=>{
  const buffer=createRuntimeReplayBuffer();
  const total=REPLAY_WINDOW+500;
  for(let sequence=1;sequence<=total;sequence++)buffer.push('s1',{type:'TextMessageContent',_sequenza:sequence,delta:'x'.repeat(200)});
  assert.equal(buffer.retained('s1'),REPLAY_WINDOW);
  const oldest=total-REPLAY_WINDOW+1;
  assert.deepEqual(buffer.after('s1',oldest-1).map((x:any)=>x._sequenza)[0],oldest,'a cursor just before the window gets every retained event');
  assert.equal(buffer.after('s1',oldest-1).length,REPLAY_WINDOW);
  assert.throws(()=>buffer.after('s1',oldest-2),/REPLAY_EVENTS_EXPIRED/u,'a cursor older than the window is said out loud');
  assert.equal(buffer.latest('s1'),total);
});

test('a conflict is caught for a sequence that already left the window, and an identical replay of it is accepted',()=>{
  const buffer=createRuntimeReplayBuffer();
  for(let sequence=1;sequence<=REPLAY_WINDOW+10;sequence++)buffer.push('s1',{type:'StateDelta',_sequenza:sequence,delta:[{path:'/n',value:sequence}]});
  assert.equal(buffer.push('s1',{type:'StateDelta',_sequenza:3,delta:[{path:'/n',value:3}]}),false,'same event again: nothing new');
  assert.throws(()=>buffer.push('s1',{type:'RunFinished',_sequenza:3}),/REPLAY_EVENT_CONFLICT/u);
  assert.equal(buffer.retained('s1'),REPLAY_WINDOW,'re-reading an old sequence does not bring it back into memory');
});

/*
 * Owner 02/10 («Chiave per invio + ripresa visibile»; registro 12; IETF Idempotency-Key, Stripe idempotent requests): a start is
 * recognised by the KEY of the send, never by its content. The M7-C journal reclaimed a dead process's start whose content
 * matched, so the same message typed again after a crash failed (RUNTIME_OPERATION_INTERRUPTED, reproduced 02/10). Now only a
 * retry that carries the same key recovers; the same key with other content is refused; and the starts a dead process left
 * behind are read once (with the session each one began) so the next TALOS can say what was interrupted, then pruned.
 */
test('the same content after a crash is a new start; only the same key recovers',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-journal-key-'));
  try{
    const fingerprint=startOperationFingerprint({projectRoot:'/repo',prompt:'same',model:'m',permissionMode:'default'});
    const crashed=createStartOperationJournal({rootDir:root,pid:111,isProcessAlive:()=>false,operationId:()=>'op-crashed'});
    assert.deepEqual(await crashed.claim(fingerprint),{operationId:'op-crashed',recovered:false});
    const restarted=createStartOperationJournal({rootDir:root,pid:222,isProcessAlive:pid=>pid===222,operationId:()=>'op-new'});
    assert.deepEqual(await restarted.claim(fingerprint),{operationId:'op-new',recovered:false},'the same message typed again starts anew');
    assert.deepEqual(await restarted.claim(fingerprint,'op-crashed'),{operationId:'op-crashed',recovered:true},'a retry of the same send recovers it');
    const other=startOperationFingerprint({projectRoot:'/repo',prompt:'other',model:'m',permissionMode:'default'});
    const fourth=createStartOperationJournal({rootDir:root,pid:444,isProcessAlive:()=>false,operationId:()=>'op-4'});
    await fourth.claim(fingerprint,'op-key');
    const fifth=createStartOperationJournal({rootDir:root,pid:555,isProcessAlive:pid=>pid===555,operationId:()=>'op-5'});
    await assert.rejects(fifth.claim(other,'op-key'),(error:any)=>error?.code==='RUNTIME_OPERATION_KEY_REUSED','a key is never reused for other content');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('the starts a dead process left are read once, with their sessions, then pruned; a clean close leaves none',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-journal-left-'));
  try{
    const fingerprint=startOperationFingerprint({projectRoot:'/repo',prompt:'x',model:'m',permissionMode:'default'});
    let n=0;const dead=createStartOperationJournal({rootDir:root,pid:11,isProcessAlive:()=>false,operationId:()=>`op-${++n}`});
    await dead.claim(fingerprint);await dead.bind('op-1','s-one');
    await dead.claim(fingerprint);
    /* another TALOS still open (a second window): its starts are its own, never read or pruned by this one */
    const open=createStartOperationJournal({rootDir:root,pid:44,isProcessAlive:pid=>pid===44||pid===22,operationId:()=>'op-open'});
    await open.claim(fingerprint);
    const live=createStartOperationJournal({rootDir:root,pid:22,isProcessAlive:pid=>pid===22||pid===44,operationId:()=>'op-live'});
    await live.claim(fingerprint);
    const left=await live.leftovers();
    assert.deepEqual(left.map(row=>[row.operationId,row.sessionId??null]).sort(),[['op-1','s-one'],['op-2',null]],'only the dead process\'s starts, with the session each began');
    await live.prune(left);
    assert.deepEqual(await live.leftovers(),[],'read once');
    assert.deepEqual((await open.leftovers()).map(row=>row.operationId),[],'the open window sees nothing left by the dead one either');
    await live.releaseOwned();await open.releaseOwned();
    const later=createStartOperationJournal({rootDir:root,pid:33,isProcessAlive:pid=>pid===33});
    assert.deepEqual(await later.leftovers(),[],'a clean close leaves nothing behind');
  }finally{await rm(root,{recursive:true,force:true});}
});

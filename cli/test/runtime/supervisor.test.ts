import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createRuntimeSupervisor,DEFAULT_RUNTIME_SUPERVISOR_POLICY} from '../../src/runtime/supervisor.ts';
import {createStartOperationJournal,startOperationFingerprint} from '../../src/runtime/replay-buffer.ts';
import {createReplayCoalescer} from '../../src/runtime/replay-coalescer.ts';
import type {CliRuntime,StartInput} from '../../src/runtime/types.ts';
/* 15/10/2026: the dead process ids these tests make up (4545, 4546…) are not multiples of 4, and Windows reads them as the multiple
   below (4544): when a protected process holds that id, `process.kill(id, 0)` answers EPERM and the record reads as alive. The
   reading journal is told that only this process lives. */
const onlyThisProcess=(id:number)=>id===process.pid;

function baseRuntime(overrides:Partial<CliRuntime>={}):CliRuntime{
  return {
    restore:async()=>({restored:0,total:0}),
    start:async()=> 's1',
    setDefaultReasoningEffort:()=>{},
    setReasoningEffort:async()=>{},
    setPermissionMode:async()=>{},
    resume:async(id)=>id,
    fork:async()=> 'fork-1',
    steer:async()=>({redirectId:'r1'}),
    compact:async()=>({ok:true}),
    listSessions:async()=>[],
    subscribe:()=>()=>{},
    answerApproval:async()=>{},
    answerQuestion:async()=>{},
    cancel:async()=>{},
    shell:async()=>{},
    export:()=>null,
    close:async()=>{},
    ...overrides,
  };
}

const startInput:StartInput={
  projectRoot:'/repo',
  prompt:'ship it',
  model:'openai:gpt',
  permissionMode:'default',
};

test('REV-PERF-FIRST supervisor preserves optional checkpoint ownership and forwards settlement after replacement',async()=>{
 const ids:string[]=[];
 const owner={projectRoot:'/repo',rootDir:'/state',async settle(id:string){ids.push(id);}};
 const first=baseRuntime({modelCheckpoints:owner,restore:async()=>{throw Object.assign(new Error('retry'),{code:'RUNTIME_RESTORE_TRANSIENT'});}});
 const second=baseRuntime({modelCheckpoints:{...owner,async settle(id:string){ids.push('new:'+id);}}});
 const runtime=createRuntimeSupervisor({initialRuntime:first,runtimeFactory:()=>second,sleep:async()=>{}});
 const capability=runtime.modelCheckpoints;assert.ok(capability);await capability.settle('a');
 await runtime.restore();await capability.settle('b');assert.deepEqual(ids,['a','new:b']);await runtime.close();
 const legacy=createRuntimeSupervisor({initialRuntime:baseRuntime(),runtimeFactory:()=>baseRuntime()});
 assert.equal(legacy.modelCheckpoints,undefined);await legacy.close();
});

test('REV-PERF-FIRST supervisor fails closed if a replacement loses checkpoint ownership',async()=>{
 const first=baseRuntime({modelCheckpoints:{projectRoot:'/repo',rootDir:'/state',async settle(){}},restore:async()=>{throw Object.assign(new Error('retry'),{code:'RUNTIME_RESTORE_TRANSIENT'});}});
 const runtime=createRuntimeSupervisor({initialRuntime:first,runtimeFactory:()=>baseRuntime(),sleep:async()=>{}});
 const capability=runtime.modelCheckpoints;assert.ok(capability);await runtime.restore();
 await assert.rejects(()=>capability.settle('a'),{code:'CHECKPOINT_OWNER_CHANGED'});await runtime.close();
});

test('FA-SUPERVISOR-01: permissions reach the runtime exactly once and errors propagate',async()=>{
  const calls:unknown[]=[];const failure=new Error('settings refused');
  const runtime=createRuntimeSupervisor({runtimeFactory:async()=>baseRuntime({setPermissionMode:async(id,mode)=>{calls.push([id,mode]);if(mode==='plan')throw failure;}})});
  try{
    await runtime.setPermissionMode('s1','bypassPermissions');
    await assert.rejects(()=>runtime.setPermissionMode('s1','plan'),error=>error===failure);
    assert.deepEqual(calls,[['s1','bypassPermissions'],['s1','plan']]);
  }finally{await runtime.close();}
});

test('M7-C RED — restore retry is bounded and recreates the runtime only for retryable failures',async()=>{
  let factories=0;
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>{
      factories++;
      if(factories===1)return baseRuntime({restore:async()=>{throw Object.assign(new Error('boot race'),{code:'RUNTIME_RESTORE_TRANSIENT',retryable:true});}});
      return baseRuntime({restore:async()=>({restored:2,total:2})});
    },
    policy:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY,restore:{maxAttempts:2,backoffMs:0},start:{maxAttempts:2,backoffMs:0},replay:{maxAttempts:2,backoffMs:0}},
    sleep:async()=>{},
  });
  assert.deepEqual(await runtime.restore(),{restored:2,total:2});
  assert.equal(factories,2);
  assert.deepEqual(runtime.supervisorEvidence().filter(x=>x.operation==='restore').map(x=>x.outcome),['retrying','succeeded']);
  await runtime.close();
});

test('M7-C RED — non-retryable restore failure never restarts the runtime',async()=>{
  let factories=0;
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>{
      factories++;
      return baseRuntime({restore:async()=>{throw Object.assign(new Error('bad config'),{code:'CONFIG_INVALID',retryable:false});}});
    },
    policy:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY,restore:{maxAttempts:3,backoffMs:0}},
    sleep:async()=>{},
  });
  await assert.rejects(()=>runtime.restore(),(error:any)=>error?.code==='CONFIG_INVALID');
  assert.equal(factories,1);
  await runtime.close();
});

test('M7-C RED — a retry of an ambiguously accepted start reuses one operationId and cannot dispatch twice',async()=>{
  const accepted=new Map<string,string>();
  const seenOperationIds:string[]=[];
  let physicalDispatches=0;
  let factories=0;
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>{
      factories++;
      return baseRuntime({
        start:async(input)=>{
          assert.equal(typeof input.operationId,'string');
          seenOperationIds.push(input.operationId!);
          const existing=accepted.get(input.operationId!);
          if(existing)return existing;
          physicalDispatches++;
          accepted.set(input.operationId!,'s-durable');
          if(factories===1)throw Object.assign(new Error('ack lost'),{code:'RUNTIME_ACK_LOST',retryable:true});
          return 's-durable';
        },
        listSessions:async()=>[{id:'s-durable',sessionId:'s-durable',name:null,project:null,path:null,model:'openai:gpt',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'completed',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null}],
      });
    },
    policy:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY,start:{maxAttempts:2,backoffMs:0}},
    sleep:async()=>{},
    operationId:()=> 'op-fixed',
  });
  assert.equal(await runtime.start(startInput),'s-durable');
  assert.deepEqual(seenOperationIds,['op-fixed','op-fixed']);
  assert.equal(physicalDispatches,1);
  assert.equal(factories,2);
  await runtime.close();
});

test('M7-C RED — cancellation is idempotent per active generation but resets for a later resumed generation',async()=>{
  let cancels=0;
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>baseRuntime({cancel:async()=>{cancels++;},resume:async(id)=>id}),
  });
  await runtime.start(startInput);
  await runtime.cancel('s1');
  await runtime.cancel('s1');
  assert.equal(cancels,1);
  await runtime.resume('s1','next');
  await runtime.cancel('s1');
  assert.equal(cancels,2);
  await runtime.close();
});

test('M7-C RED — supervisor keeps provider/runtime fallback evidence instead of rewriting the underlying failure',async()=>{
  let factories=0;
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>{
      factories++;
      if(factories===1)return baseRuntime({start:async()=>{throw Object.assign(new Error('provider temporarily unavailable'),{code:'PROVIDER_REQUEST_ERROR',retryable:true,provider:'deepseek'});}});
      return baseRuntime({start:async()=> 's2'});
    },
    policy:{...DEFAULT_RUNTIME_SUPERVISOR_POLICY,start:{maxAttempts:2,backoffMs:0}},
    sleep:async()=>{},
    operationId:()=> 'op-provider',
  });
  assert.equal(await runtime.start(startInput),'s2');
  const evidence=runtime.supervisorEvidence().find(x=>x.outcome==='retrying'&&x.operation==='start');
  assert.equal(evidence?.code,'PROVIDER_REQUEST_ERROR');
  assert.equal(evidence?.details?.provider,'deepseek');
  assert.equal(evidence?.fallback,'runtime-restart');
  await runtime.close();
});

/*
 * P13 (2026-09-26), measured on the built CLI: reopening a sub-agent's live view showed an empty transcript, because the
 * supervisor remembered the events already delivered PER SESSION, so a second subscriber to the same session (the viewer
 * reopened, or the viewer after the approvals watcher) had its whole history dropped as "already seen". The position is
 * per subscription (each keeps its own cursor), as a catch-up subscription keeps its own checkpoint.
 */
test('P13: two subscribers to one session each get the history and the live events; one subscriber never gets an event twice',async()=>{
  const history=[{type:'RunStarted',_sequenza:1},{type:'TextMessageContent',delta:'a',_sequenza:2}];
  const sinks=new Set<(event:unknown)=>void>();
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>baseRuntime({subscribe:(_id,sink,from=0)=>{for(const event of history)if(event._sequenza>from)sink(event);sinks.add(sink);return()=>sinks.delete(sink);}}),
    sleep:async()=>{},
  });
  await runtime.restore();
  const first:unknown[]=[],second:unknown[]=[];
  const offFirst=runtime.subscribe('s1',event=>first.push(event));
  const offSecond=runtime.subscribe('s1',event=>second.push(event));
  assert.equal(second.length,2,'the second subscriber got the history');
  const live={type:'TextMessageContent',delta:'b',_sequenza:3};
  for(const sink of [...sinks])sink(live);
  for(const sink of [...sinks])sink(live);
  assert.deepEqual(first.map((event:any)=>event._sequenza),[1,2,3],'one subscriber, each event once');
  assert.deepEqual(second.map((event:any)=>event._sequenza),[1,2,3]);
  offFirst();offSecond();
  await runtime.close();
});

test('stage 3: the supervisor forwards the answer to the model\'s questions to the runtime it supervises',async()=>{
  const calls:unknown[]=[];
  const runtime=createRuntimeSupervisor({initialRuntime:baseRuntime({answerQuestion:async(...args)=>{calls.push(args);}}),runtimeFactory:()=>baseRuntime()});
  await runtime.answerQuestion('s1','q1',{status:'answered',answers:{fix:'Wait'}});
  assert.deepEqual(calls,[['s1','q1',{status:'answered',answers:{fix:'Wait'}}]]);
  await runtime.close();
});

/* Owner 02/10 («Chiave per invio + ripresa visibile», registro 12): the same message typed again after a crash starts anew
   (reproduced on the built CLI: RUNTIME_OPERATION_INTERRUPTED); what the dead process left is told once, then pruned. */
test('after a crash the same message is a new start, and the interrupted turn is named once',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-supervisor-restart-'));
  try{
    const fingerprint=startOperationFingerprint(startInput);
    const dead=createStartOperationJournal({rootDir:root,pid:4242,isProcessAlive:()=>false,operationId:()=>'op-dead'});
    await dead.claim(fingerprint);await dead.bind('op-dead','s-old');
    const seen:string[]=[];
    const sessions=[{id:'s-old',sessionId:'s-old',name:'Flaky login test',project:null,path:null,model:'openai:gpt',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'interrupted',interrupted:true} as any];
    const runtime=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({start:async input=>{seen.push(input.operationId!);return input.operationId==='op-dead'?'s-old':'s-new';},listSessions:async()=>sessions}),
      /* 24/11/2026: this reading journal was the one left on the real check, and Windows read 4242 as 4240 — public run
         45407986939 stopped here when a process held that id (judge v2684). It is told that only this process lives too. */
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:onlyThisProcess,operationId:()=>'op-fresh'}),
      sleep:async()=>{},
    });
    assert.equal(await runtime.start(startInput),'s-new','the same message after a crash starts anew');
    assert.deepEqual(seen,['op-fresh']);
    const told=await runtime.interruptedByPreviousProcess!();
    assert.deepEqual(told.map(row=>[row.id,row.name]),[['s-old','Flaky login test']]);
    assert.deepEqual(await runtime.interruptedByPreviousProcess!(),[],'said once');
    await runtime.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

/* Review of 0.6.4 (acceptance s49): killed just as the answer began, before `bind` named the session: the start still says WHEN it
   began, and the top-level conversation interrupted from then on is the one told. An older interrupted one and a child are not. */
test('a start killed before it was bound still names the conversation it cut, and only that one',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-supervisor-unbound-'));
  try{
    const dead=createStartOperationJournal({rootDir:root,pid:4545,isProcessAlive:()=>false,operationId:()=>'op-unbound',now:()=>'2026-10-14T12:00:00.000Z'});
    await dead.claim('f');
    const row=(id:string,startedAt:string,extra:Record<string,unknown>={})=>({id,sessionId:id,name:id,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt,updatedAt:startedAt,endedAt:null,outcome:'interrupted',interrupted:true,...extra}) as any;
    const sessions=[row('s-cut','2026-10-14T12:00:00.400Z'),row('s-older','2026-10-14T11:00:00.000Z'),row('s-child','2026-10-14T12:00:01.000Z',{parentId:'s-cut',depth:1})];
    const runtime=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({listSessions:async()=>sessions}),
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:onlyThisProcess}),
      sleep:async()=>{},
    });
    assert.deepEqual((await runtime.interruptedByPreviousProcess!()).map(summary=>summary.id),['s-cut']);
    assert.deepEqual(await runtime.interruptedByPreviousProcess!(),[],'said once');
    await runtime.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

/* Seventh review of 0.6.4 (S1): one unbound start cut ONE conversation — the first begun within its minute — even when another
   one begun in that minute (by another TALOS) also reads as interrupted. */
test('an unbound start names only the first conversation of its minute',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-supervisor-unbound-one-'));
  try{
    const dead=createStartOperationJournal({rootDir:root,pid:4646,isProcessAlive:()=>false,operationId:()=>'op-one',now:()=>'2026-10-14T12:00:00.000Z'});
    await dead.claim('f');
    const row=(id:string,startedAt:string)=>({id,sessionId:id,name:id,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt,updatedAt:startedAt,endedAt:null,outcome:'interrupted',interrupted:true}) as any;
    const runtime=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({listSessions:async()=>[row('s-other','2026-10-14T12:00:30.000Z'),row('s-first','2026-10-14T12:00:00.300Z')]}),
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:onlyThisProcess}),
      sleep:async()=>{},
    });
    assert.deepEqual((await runtime.interruptedByPreviousProcess!()).map(summary=>summary.id),['s-first']);
    await runtime.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a start the dead process finished is not told as interrupted',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-supervisor-finished-'));
  try{
    const dead=createStartOperationJournal({rootDir:root,pid:4343,isProcessAlive:()=>false,operationId:()=>'op-done'});
    await dead.claim('f');await dead.bind('op-done','s-done');
    const runtime=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({listSessions:async()=>[{id:'s-done',sessionId:'s-done',name:'Done one',outcome:'completed',interrupted:false} as any]}),
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:onlyThisProcess}),
      sleep:async()=>{},
    });
    assert.deepEqual(await runtime.interruptedByPreviousProcess!(),[]);
    await runtime.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a retry that carries the key of a cut send recovers it, and the supervisor binds each start to its session',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-supervisor-key-'));
  try{
    let firstAlive=true;
    const sessions:any[]=[];
    const factory=async()=>baseRuntime({start:async input=>input.operationId==='op-a'?'s-a':'s-b',listSessions:async()=>sessions});
    const first=createRuntimeSupervisor({runtimeFactory:factory,journal:createStartOperationJournal({rootDir:root,pid:7001,isProcessAlive:()=>true,operationId:()=>'op-a'}),sleep:async()=>{}});
    assert.equal(await first.start(startInput),'s-a');
    firstAlive=false;
    sessions.push({id:'s-a',sessionId:'s-a',name:'Cut one',outcome:'interrupted',interrupted:true});
    const second=createRuntimeSupervisor({runtimeFactory:factory,journal:createStartOperationJournal({rootDir:root,pid:7002,isProcessAlive:pid=>pid===7002||(pid===7001&&firstAlive),operationId:()=>'op-b'}),sleep:async()=>{}});
    await assert.rejects(second.start({...startInput,operationId:'op-a'}),(error:any)=>error?.code==='RUNTIME_OPERATION_INTERRUPTED','the retry of the cut send gets its outcome, as an Idempotency-Key retry does');
    const third=createRuntimeSupervisor({runtimeFactory:factory,journal:createStartOperationJournal({rootDir:root,pid:7003,isProcessAlive:pid=>pid===7003,operationId:()=>'op-c'}),sleep:async()=>{}});
    assert.deepEqual((await third.interruptedByPreviousProcess!()).map(row=>row.id),['s-a'],'the start the first supervisor made carries its session');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('B1 the supervisor passes the restore selection and the list scope through to the runtime it holds',async()=>{
  const seen:unknown[]=[];
  const runtime=createRuntimeSupervisor({initialRuntime:baseRuntime({
    restore:async(selection?:unknown)=>{seen.push(['restore',selection??'all']);return{restored:0,total:0};},
    listSessions:async(options?:unknown)=>{seen.push(['list',options??'all']);return[];},
  }),runtimeFactory:()=>baseRuntime(),sleep:async()=>{}});
  await runtime.restore({sessionIds:['s1']});await runtime.restore();
  await runtime.listSessions({scope:'loaded'});await runtime.listSessions();
  assert.deepEqual(seen,[['restore',{sessionIds:['s1']}],['restore','all'],['list',{scope:'loaded'}],['list','all']]);
  await runtime.close();
});

test('B1 a recovered start looks at the session it began in memory, not by restoring the archive',async()=>{
  const seen:unknown[]=[];
  const journal:any={claim:async()=>({operationId:'op-1',recovered:true}),bind:async()=>{},leftovers:async()=>[],prune:async()=>{},releaseOwned:async()=>{}};
  const runtime=createRuntimeSupervisor({
    runtimeFactory:async()=>baseRuntime({start:async()=>'s1',listSessions:async(options?:unknown)=>{seen.push(options??'all');return[{id:'s1',sessionId:'s1',interrupted:false} as any];}}),
    journal,sleep:async()=>{},
  });
  assert.equal(await runtime.start(startInput),'s1');
  assert.deepEqual(seen,[{scope:'loaded'}]);
  await runtime.close();
});

/*
 * P-D (07/10) against the supervisor's shared buffer, found by the full gate on e7921b835 (s28: viewing a live child agent ended in
 * REPLAY_EVENT_CONFLICT). A FULL replay folds adjacent deltas into one event that carries the LAST sequence, so the second subscriber to a live
 * session was handed a folded event at a sequence the buffer already held as the first subscriber's raw delta: "a different event at a known
 * sequence", a false conflict. The fold is a read-side view (t3code ShellStream.coalesceStoredThreadEvents keeps the survivor's own sequence;
 * Codex remote_control/websocket.rs drops by sequence <= last seen, never by content; AG-UI compactEvents): it is delivered and moves the
 * cursor, but it is not one of the kernel's records, so the buffer that detects diverging copies of those never takes it in.
 */
const delta=(text:string,sequence:number)=>({type:'TextMessageContent',messageId:'m1',delta:text,_sequenza:sequence});
function foldingRuntime(history:any[]){
  const sinks=new Set<(event:unknown)=>void>();
  /* the composed runtime's subscribe: a replay from 0 goes through the fold, a replay from a cursor and every live event as they are */
  const runtime=baseRuntime({subscribe:(_id,sink,from=0)=>{
    const fold=from===0?createReplayCoalescer(sink):null;
    try{for(const event of history)if(event._sequenza>from)(fold?fold.push:sink)(event);}finally{fold?.end();}
    sinks.add(sink);return()=>sinks.delete(sink);
  }});
  return{runtime,sinks};
}
const shape=(events:unknown[])=>events.map((event:any)=>[event.type,event.delta,event._sequenza]);

test('P-D fold: a second subscriber to a live session gets the folded history, and neither gets a replay failure',async()=>{
  const history:any[]=[delta('a',1),delta('b',2)];
  const {runtime:inner,sinks}=foldingRuntime(history);
  const runtime=createRuntimeSupervisor({runtimeFactory:async()=>inner,sleep:async()=>{}});
  await runtime.restore();
  const first:unknown[]=[],second:unknown[]=[];
  const offFirst=runtime.subscribe('s1',event=>first.push(event));
  const live=delta('c',3);history.push(live);for(const sink of [...sinks])sink(live);
  const offSecond=runtime.subscribe('s1',event=>second.push(event));
  assert.deepEqual(shape(second),[['TextMessageContent','abc',3]],'the second subscriber got the whole history folded, not a failure');
  for(const sink of [...sinks])sink(live);
  assert.equal(second.length,1,'the folded event moved the cursor: the raw delta it already contains is not delivered again');
  assert.equal(first.length,2,'and the first subscriber never gets an event twice');
  const next=delta('d',4);history.push(next);for(const sink of [...sinks])sink(next);
  assert.deepEqual(shape(first),[['TextMessageContent','ab',2],['TextMessageContent','c',3],['TextMessageContent','d',4]]);
  assert.deepEqual(shape(second),[['TextMessageContent','abc',3],['TextMessageContent','d',4]],'one subscriber, each event once, after its folded history');
  assert.ok(![...first,...second].some((event:any)=>event.type==='RunError'),'no replay failure');
  offFirst();offSecond();
  await runtime.close();
});

test('P-D fold: a DIVERGING copy of one of the kernel\'s own events is still a replay failure',async()=>{
  const history:any[]=[{type:'RunStarted',_sequenza:1},delta('a',2)];
  const {runtime:inner}=foldingRuntime(history);
  const runtime=createRuntimeSupervisor({runtimeFactory:async()=>inner,sleep:async()=>{}});
  await runtime.restore();
  const first:unknown[]=[],second:unknown[]=[];
  const offFirst=runtime.subscribe('s1',event=>first.push(event));
  history[1]=delta('X',2);
  const offSecond=runtime.subscribe('s1',event=>second.push(event));
  const failure:any=second.find((event:any)=>event.type==='RunError');
  assert.equal(failure?.code,'RUNTIME_REPLAY_FAILED','the buffer still catches the same sequence with different content');
  assert.match(String(failure?.message),/REPLAY_EVENT_CONFLICT/u);
  offFirst();offSecond();
  await runtime.close();
});

/*
 * C2 (08/10): the option the TUI alone asks for (`resultsForScreen`) is handed to the runtime as it came, on the first attach and on the retry after
 * a restart; a giant result cut to a view moves the cursor but is not recorded in the buffer of the kernel's own events (a second subscriber that
 * holds the whole event at that sequence must not read the view as a diverging copy).
 */
test('C2 the supervisor hands the subscribe options to the runtime, and a cut result is a view the buffer does not take in',async()=>{
  const seenOptions:unknown[]=[];const history:any[]=[{type:'ToolCallResult',toolCallId:'t',content:'x'.repeat(500),_sequenza:1}];
  const inner=baseRuntime({subscribe:(_id,sink,from=0,options)=>{
    seenOptions.push(options);
    const cut=options?.resultsForScreen===true;
    const replay=createReplayCoalescer(sink,cut?{giantResults:{over:100,head:10,tail:20}}:{});
    try{for(const event of history)if(event._sequenza>from)replay.push(event);}finally{replay.end();}
    return()=>{};
  }});
  const runtime=createRuntimeSupervisor({runtimeFactory:async()=>inner,sleep:async()=>{}});
  await runtime.restore();
  const screen:any[]=[],whole:any[]=[];
  const offScreen=runtime.subscribe('s1',event=>screen.push(event),0,{resultsForScreen:true});
  const offWhole=runtime.subscribe('s1',event=>whole.push(event),0);
  assert.deepEqual(seenOptions,[{resultsForScreen:true},undefined]);
  assert.ok(String(screen[0].content).length<100,'the screen subscriber got the view');
  assert.equal(whole[0].content.length,500,'and the other the whole event, with no replay failure in between');
  assert.ok(![...screen,...whole].some((event:any)=>event.type==='RunError'));
  offScreen();offWhole();
  await runtime.close();
});

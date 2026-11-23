/*
 * Review of 0.6.4, eighth round (bugfixer, 14/10/2026) — written RED against adb2a4a7b, NOT RUN (a gate was running).
 *
 * 064h-2 — `interruptedByPreviousProcess` (supervisor.ts, adb2a4a7b) gives every unbound leftover the earliest top-level
 *   conversation begun in [createdAt−1 s, createdAt+60 s], whoever began it. A start that FAILED keeps its record unbound until a
 *   clean close (supervisor.ts `start`: nothing removes it on the definitive `throw`), and a failed start begins no conversation of
 *   its own (session-facade `start` → kernel `erroreAvvio`). The person then retries in the same TALOS — that conversation is bound
 *   and named by its own record — but a conversation ANOTHER TALOS began in between takes the failed start's minute: when it is
 *   mid-turn (read from disk as interrupted: session-registry.mjs restore `interrotta: !conclusa`), the next TALOS says «The last
 *   TALOS closed in the middle of …» about a conversation that is running right now elsewhere.
 *   A killed-before-bind start (the s49 case the unbound path exists for) can only be the LAST start of its process: an unbound
 *   record followed by a later start of the same pid is a failed start. Either cure turns this green: drop the record when a start
 *   fails for good, or ignore an unbound record that is not the newest of its pid.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {createStartOperationJournal} from '../../src/runtime/replay-buffer.ts';
import type {CliRuntime,StartInput} from '../../src/runtime/types.ts';

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
const startInput:StartInput={projectRoot:'/repo',prompt:'ship it',model:'openai:gpt',permissionMode:'default'};
const row=(id:string,startedAt:string,interrupted:boolean)=>({id,sessionId:id,name:id,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt,updatedAt:startedAt,endedAt:null,outcome:interrupted?'interrupted':'completed',interrupted}) as any;

test('review of 0.6.4, 064h-2: a failed start followed by a good one does not name a conversation another TALOS began in that minute',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-064h-failed-then-good-'));
  const DEAD=4748;
  try{
    /* the TALOS that will die: its first start fails for good (no conversation), its retry 20 s later starts `s-mine` */
    const clock=['2026-10-14T12:00:00.000Z','2026-10-14T12:00:20.000Z'];
    let attempt=0;
    const dying=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({start:async()=>{attempt+=1;if(attempt===1)throw Object.assign(new Error('no address'),{code:'PROVIDER_ADDRESS_REQUIRED',retryable:false});return 's-mine';}}),
      journal:createStartOperationJournal({rootDir:root,pid:DEAD,isProcessAlive:()=>true,now:()=>clock.shift()??'2026-10-14T12:00:59.000Z'}),
      sleep:async()=>{},
    });
    await assert.rejects(dying.start(startInput),{code:'PROVIDER_ADDRESS_REQUIRED'});
    assert.equal(await dying.start(startInput),'s-mine');
    /* … and its window is closed: no `close()`, its records stay */
    const sessions=[
      /* begun 10 s after the failed start by ANOTHER TALOS, mid-turn now: read from disk as interrupted */
      row('s-live-elsewhere','2026-10-14T12:00:10.000Z',true),
      /* the dying TALOS's own conversation, idle when it was closed */
      row('s-mine','2026-10-14T12:00:20.300Z',false),
    ];
    const next=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({listSessions:async()=>sessions}),
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:pid=>pid===process.pid}),
      sleep:async()=>{},
    });
    assert.deepEqual((await next.interruptedByPreviousProcess!()).map(summary=>summary.id),[],'a conversation running in another TALOS was told as cut by the last one');
    await next.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

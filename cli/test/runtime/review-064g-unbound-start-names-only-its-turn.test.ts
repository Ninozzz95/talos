/*
 * Review of 0.6.4, seventh round (bugfixer, 14/10/2026) — written RED against f512dc126, NOT RUN (a gate was running).
 *
 * 064g-2 — `interruptedByPreviousProcess` (supervisor.ts, f512dc126) names, for a dead TALOS's start that was never bound, EVERY
 *   top-level conversation started from that moment on and now interrupted. But:
 *   - the journal is one folder for every project (`create-runtime.ts` supervisorRoot: `<dataRoot>/runtime-supervisor`) and
 *     `listSessions()` lists the whole store (`cartellaStore: paths.sessionsRoot`), every folder's conversations;
 *   - a conversation another LIVE TALOS is running right now is read from disk as interrupted (session-registry.mjs, restore:
 *     `interrotta: !conclusa` — its last event is not RunFinished yet);
 *   - a conversation interrupted by an EARLIER crash stays interrupted on disk until resumed, and it was already told (and its
 *     record pruned) by the TALOS that started after that crash;
 *   - a start that FAILED (`runtime.start` throws, e.g. the kernel's `erroreAvvio` — no Z.AI session starts without an address)
 *     keeps its record, unbound, until a clean close: a TALOS closed by its window hours later leaves it, with the time of that
 *     failed start.
 *   A start creates its own conversation at once (session-facade.ts `start` → `registry.avviaLibero`), right after its claim; a
 *   conversation started half an hour later is not the one it cut.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {createStartOperationJournal} from '../../src/runtime/replay-buffer.ts';
import type {CliRuntime} from '../../src/runtime/types.ts';
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
const row=(id:string,startedAt:string,extra:Record<string,unknown>={})=>({id,sessionId:id,name:id,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt,updatedAt:startedAt,endedAt:null,outcome:'interrupted',interrupted:true,...extra}) as any;

test('review of 0.6.4, 064g-2: an unbound start names the conversation it began, not a later one running in another TALOS nor one already told',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-064g-unbound-'));
  try{
    const dead=createStartOperationJournal({rootDir:root,pid:4546,isProcessAlive:()=>false,operationId:()=>'op-unbound',now:()=>'2026-10-14T12:00:00.000Z'});
    await dead.claim('f');
    const sessions=[
      row('s-cut','2026-10-14T12:00:00.400Z'),
      /* told at 12:20 by the TALOS that started after ANOTHER crash; still interrupted on disk */
      row('s-told-before','2026-10-14T12:10:00.000Z'),
      /* running now in another TALOS: read from disk, its turn has no RunFinished yet */
      row('s-live-elsewhere','2026-10-14T12:30:00.000Z'),
    ];
    const runtime=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({listSessions:async()=>sessions}),
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:onlyThisProcess}),
      sleep:async()=>{},
    });
    assert.deepEqual((await runtime.interruptedByPreviousProcess!()).map(summary=>summary.id),['s-cut']);
    await runtime.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

test('review of 0.6.4, 064g-2: a start that failed (no conversation) does not name an unrelated conversation started long after it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-064g-failed-'));
  try{
    /* the dead TALOS's start failed at 09:05 (its record kept, unbound, until a clean close that never came) */
    const dead=createStartOperationJournal({rootDir:root,pid:4547,isProcessAlive:()=>false,operationId:()=>'op-failed',now:()=>'2026-10-14T09:05:00.000Z'});
    await dead.claim('f');
    const sessions=[row('s-afternoon','2026-10-14T15:40:00.000Z')];
    const runtime=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({listSessions:async()=>sessions}),
      journal:createStartOperationJournal({rootDir:root,pid:process.pid,isProcessAlive:onlyThisProcess}),
      sleep:async()=>{},
    });
    assert.deepEqual((await runtime.interruptedByPreviousProcess!()).map(summary=>summary.id),[]);
    await runtime.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

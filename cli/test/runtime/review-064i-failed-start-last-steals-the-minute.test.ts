/*
 * Review of 0.6.4, ninth round (bugfixer, 14/10/2026) — written RED against 9cead50d3, NOT RUN (a gate was running).
 *
 * 064i-1 (NIT, residual of 064h-2) — 9cead50d3 ignores an unbound leftover that is not the LATEST record of its pid, which cures
 *   «failed start, then a good one». A failed start that is the LAST start of its process still keeps its record unbound
 *   (supervisor.ts `start`: nothing removes or marks it on the definitive `throw`) and is indistinguishable from the s49 case
 *   (killed before `bind`): the window is closed with the X (SIGHUP/SIGBREAK release only the active-run marker, not the journal),
 *   and the first top-level conversation ANOTHER TALOS began in the next minute, mid-turn now (read from disk as interrupted),
 *   is named «The last TALOS closed in the middle of …».
 *   Cure (after 0.6.4 is fine): on a definitive failure of `start`, drop the record (or write `failed:true` into it and skip it
 *   in `interruptedByPreviousProcess`). A killed-before-bind start never reaches that branch, so the s49 case is untouched.
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

test('review of 0.6.4, 064i-1: a failed start that was the last of its TALOS does not name a conversation another TALOS began in that minute',{todo:'NIT of the ninth review of 0.6.4: a failed start should drop its record; after 0.6.4'},async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-064i-failed-last-'));
  const DEAD=4752;
  try{
    /* the TALOS that will be closed with the X: a good start at 11:59, then a start that fails for good at 12:00 */
    const clock=['2026-10-14T11:59:00.000Z','2026-10-14T12:00:00.000Z'];
    let attempt=0;
    const dying=createRuntimeSupervisor({
      runtimeFactory:async()=>baseRuntime({start:async()=>{attempt+=1;if(attempt===2)throw Object.assign(new Error('no address'),{code:'PROVIDER_ADDRESS_REQUIRED',retryable:false});return 's-mine';}}),
      journal:createStartOperationJournal({rootDir:root,pid:DEAD,isProcessAlive:()=>true,now:()=>clock.shift()??'2026-10-14T12:00:59.000Z'}),
      sleep:async()=>{},
    });
    assert.equal(await dying.start(startInput),'s-mine');
    await assert.rejects(dying.start(startInput),{code:'PROVIDER_ADDRESS_REQUIRED'});
    /* … and its window is closed: no `close()`, its records stay */
    const sessions=[
      /* the dying TALOS's own conversation, idle when it was closed */
      row('s-mine','2026-10-14T11:59:00.300Z',false),
      /* begun 10 s after the failed start by ANOTHER TALOS, mid-turn now: read from disk as interrupted */
      row('s-live-elsewhere','2026-10-14T12:00:10.000Z',true),
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

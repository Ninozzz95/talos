/*
 * Decision 198 (owner 04/11/2026): after a finished turn, a resume with nothing in it is refused by the kernel with
 * `SESSION_NOT_READY` / `nothing-to-resume` (session-registry.mjs on fix/riprendi-198-199-2026-11-04). The CLI's page for
 * SESSION_NOT_READY says «busy saving… Try again in a moment», which would be false here: the refusal reads as what happened
 * (CLI condition 1 of FORMA-RIPRENDI-198-199). `talos session resume <id>` with no text ends with that sentence and an error,
 * never a silent replay. Source: Hermes hermes_cli/cli_session_mixin.py:777-819 (nothing to retry is said, not replayed).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {describeError} from '../../src/i18n/error-view.ts';

const KERNEL='The last turn finished: there is nothing to resume. Write a message, or use Retry on the answer.';
function facade(answer:Record<string,unknown>){
  const registry:any={
    async ripristina(){return{ripristinate:0,totali:0};},
    iscriviti(){return()=>{};},
    elenca(){return[{sessionId:'s1',conclusa:true}];},
    esporta(id:string){return{schema:'talos.harness-ui.session-export.v1',sessionId:id,eventi:[]};},
    resume(){return answer;},
  };
  return createSessionFacade(registry,{model:'openai:gpt-5-mini'} as any);
}

test('198: nothing to resume reads as what happened, with its reason',async()=>{
  const runtime:any=facade({erroreAvvio:KERNEL,code:'SESSION_NOT_READY',reason:'nothing-to-resume'});
  const error:any=await runtime.resume('s1',undefined).then(()=>null,(e:unknown)=>e);
  assert.ok(error,'refused');
  assert.equal(error.code,'NOTHING_TO_RESUME');
  assert.equal(error.details.reason,'nothing-to-resume');
  const view=describeError(error);
  assert.equal(view.what,'The last turn finished: there is nothing to resume.');
  assert.match(String(view.todo),/Write a message to go on, or ask the last one again with \/retry\./u);
  assert.doesNotMatch(`${view.what} ${view.todo}`,/busy saving|Try again in a moment/u);
});

test('on the contrary: another SESSION_NOT_READY keeps its code and page, now with its reason',async()=>{
  const runtime:any=facade({erroreAvvio:'The session is still running: wait for it to finish before resuming it',code:'SESSION_NOT_READY',reason:'running-wait-resume'});
  const error:any=await runtime.resume('s1','go on').then(()=>null,(e:unknown)=>e);
  assert.equal(error.code,'SESSION_NOT_READY');
  assert.equal(error.details.reason,'running-wait-resume');
  assert.notEqual(describeError(error).what,'The last turn finished: there is nothing to resume.');
});

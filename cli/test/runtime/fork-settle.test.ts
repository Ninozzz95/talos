/*
 * g-q18/g-q19 (registro 12): `/fork last` typed right after a turn ended answered «Fork failed … SESSION_NOT_READY».
 * Between the turn's final event and its settling the kernel refuses `forka` and `resume` (REV-SESSION-READY, the
 * history is still the previous turn's) and offers `attendiFuoriDallaFinestra`; its HTTP routes wait for it before fork,
 * resume and queue (`http-app.mjs:6069`, `:6109`), the CLI's facade did not. Now the facade waits too — milliseconds —
 * and, like the routes, never waits on a turn still running: there the registry answers as always.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function closing(){
  let open=true;const calls:string[]=[];
  const registry:any={
    ripristina:async()=>({}),avviaLibero:()=>({sessionId:'s1'}),iscriviti:()=>()=>{},rispondiApprovazione:()=>({ok:true}),ferma:()=>true,
    staChiudendoIlGiro:(id:string)=>{calls.push(`closing?:${id}`);return open;},
    attendiFuoriDallaFinestra:async(id:string)=>{calls.push(`wait:${id}`);await new Promise(resolve=>setTimeout(resolve,5));open=false;},
    forka:(id:string)=>{calls.push(`forka:${id}`);return open?{erroreAvvio:'La sessione sta chiudendo il giro',code:'SESSION_NOT_READY'}:{sessionId:'s2'};},
    resume:(id:string)=>{calls.push(`resume:${id}`);return open?{erroreAvvio:'La sessione sta chiudendo il giro',code:'SESSION_NOT_READY'}:{sessionId:id};},
  };
  return{registry,calls,close:()=>{open=false;}};
}

test('a fork asked while the turn is closing waits for it to settle, then forks',async()=>{
  const f=closing();const runtime=createSessionFacade(f.registry,{model:'m'});
  assert.equal(await runtime.fork!('s1',''),'s2');
  assert.deepEqual(f.calls,['closing?:s1','wait:s1','forka:s1']);
});

test('a resume asked while the turn is closing waits for it to settle, then resumes',async()=>{
  const f=closing();const runtime=createSessionFacade(f.registry,{model:'m'});
  assert.equal(await runtime.resume!('s1','again'),'s1');
  assert.deepEqual(f.calls,['closing?:s1','wait:s1','resume:s1']);
});

/* The second cause (registro 12): the kernel starts a turn on a fork, and refuses a change of OPERATING mode while a turn
   runs; re-sending the permission after the fork carried the operating mode even when it did not change. As Codex's
   `OverrideTurnContext` (every field optional, «None leaves the value unchanged»), only what changes travels. */
test('a permission change sends the operating mode only when it changes, read from the kernel',async()=>{
  const patches:unknown[]=[];let operating='normale';
  const registry:any={...closing().registry,
    elenca:()=>[{sessionId:'s1',modalitaOperativa:operating}],
    aggiornaImpostazioni:async(_id:string,patch:any)=>{patches.push(patch);if(patch.modalitaOperativa)operating=patch.modalitaOperativa;return{ok:true};}};
  const runtime=createSessionFacade(registry,{model:'m'});
  await runtime.setPermissionMode('s1','acceptEdits');
  await runtime.setPermissionMode('s1','plan');
  await runtime.setPermissionMode('s1','plan');
  await runtime.setPermissionMode('s1','default');
  assert.deepEqual(patches,[{permessi:'On request'},{permessi:'Read only',modalitaOperativa:'piano'},{permessi:'Read only'},{permessi:'On request',modalitaOperativa:'normale'}]);
  /* a session the kernel does not list still gets the whole patch (nothing to compare with) */
  patches.length=0;await runtime.setPermissionMode('s9','plan');
  assert.deepEqual(patches,[{permessi:'Read only',modalitaOperativa:'piano'}]);
});

test('outside the closing window nothing waits, and a refusal still reaches the person',async()=>{
  const f=closing();f.close();const runtime=createSessionFacade(f.registry,{model:'m'});
  assert.equal(await runtime.fork!('s1',''),'s2');
  assert.ok(!f.calls.includes('wait:s1'),'a settled session is forked at once');
  f.registry.forka=()=>({erroreAvvio:'ancora in corso',code:'SESSION_NOT_READY'});
  await assert.rejects(()=>runtime.fork!('s1',''),(error:any)=>error.code==='SESSION_NOT_READY');
});

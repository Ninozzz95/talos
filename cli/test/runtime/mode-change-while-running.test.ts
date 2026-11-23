/*
 * Owner 08/10/2026: «i comandi tipo cambio autorizzazioni cambino istantaneamente, o almeno l'interfaccia, senza quei
 * fastidiosi messaggi di avviso, anche se vengono applicati dal turno dopo, come fa esattamente Claude Code». Shift+Tab while
 * the model worked said «Change permission mode failed: That conversation is busy saving… (SESSION_NOT_READY)»: the kernel
 * refuses a change of its OPERATING mode while a turn runs (session-registry.mjs `mode-change-while-running`), and plan is an
 * operating mode. Claude Code: «You can also change a running session's permission mode at any time» (permission-modes,
 * read 09/10/2026); Codex applies OverrideTurnContext to the turns after it, an absent field unchanged.
 * Now: the permission goes to the kernel at once (it accepts it while running), the operating mode waits for the turn's end,
 * and nobody sees an error.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function facadeWithRunningTurn(){
  const updates:any[]=[];let running=true;
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},elenca:()=>[{sessionId:'s-1',modalitaOperativa:'normale'}],
    aggiornaImpostazioni:async(id:string,patch:any)=>{
      updates.push([id,patch]);
      if(running&&Object.hasOwn(patch,'modalitaOperativa'))return{erroreAvvio:'The working mode is changed between turns, not while the model is working',code:'SESSION_NOT_READY',reason:'mode-change-while-running'};
      return{ok:true};
    }};
  return{runtime:createSessionFacade(registry,{model:'m'}),updates,end:()=>{running=false;}};
}

test('while a turn runs, plan mode sends the permission at once and says the operating mode waits for the turn end',async()=>{
  const {runtime,updates}=facadeWithRunningTurn();
  const result=await runtime.setPermissionMode('s-1','plan');
  assert.deepEqual(result,{operatingModeDeferred:true});
  assert.deepEqual(updates,[['s-1',{permessi:'Read only',modalitaOperativa:'piano'}],['s-1',{permessi:'Read only'}]]);
});

test('after the turn the same call carries the operating mode, and nothing is deferred',async()=>{
  const {runtime,updates,end}=facadeWithRunningTurn();
  end();
  const result=await runtime.setPermissionMode('s-1','plan');
  assert.deepEqual(result,{operatingModeDeferred:false});
  assert.deepEqual(updates,[['s-1',{permessi:'Read only',modalitaOperativa:'piano'}]]);
});

test('another refusal is still an error: only the running turn defers the operating mode',async()=>{
  const registry:any={avviaLibero(){return{sessionId:'s-1'};},iscriviti(){return()=>{};},elenca:()=>[{sessionId:'s-1',modalitaOperativa:'normale'}],
    aggiornaImpostazioni:async()=>({erroreAvvio:'This delegation is read-only.',code:'DELEGATION_READ_ONLY',reason:'delegation-read-only'})};
  await assert.rejects(createSessionFacade(registry,{model:'m'}).setPermissionMode('s-1','plan'),(error:any)=>error?.code==='DELEGATION_READ_ONLY');
});

/*
 * Stage 3, the plan card (registro 12, measured by s41 on 02/10): the CLI's plan mode reached the kernel only as the
 * «Read only» permission, never as the kernel's operating mode, so the kernel never offered `present_plan`
 * (talosHarness.mjs: only with modalitaOperativa 'piano') and no plan could ever be proposed. The facade now states the
 * operating mode with the permission, at start and on every mode change.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function facade(){
  const starts:any[]=[],updates:any[]=[];
  const registry:any={avviaLibero(input:any){starts.push(input);return{sessionId:'s-1'};},iscriviti(){return()=>{};},
    aggiornaImpostazioni:async(id:string,patch:any)=>{updates.push([id,patch]);return{ok:true};}};
  return{runtime:createSessionFacade(registry,{model:'m'}),starts,updates};
}

test('a run started in plan mode is the kernel\'s plan mode; any other mode is normal',async()=>{
  const {runtime,starts}=facade();
  await runtime.start({projectRoot:process.cwd(),prompt:'plan it',permissionMode:'plan'} as any);
  await runtime.start({projectRoot:process.cwd(),prompt:'do it',permissionMode:'default'} as any);
  await runtime.start({projectRoot:process.cwd(),prompt:'do it',permissionMode:'acceptEdits'} as any);
  assert.deepEqual(starts.map(s=>[s.permessi,s.modalitaOperativa]),[['Read only','piano'],['On request','normale'],['On request','normale']]);
});

test('changing the mode changes the kernel\'s operating mode with the permission',async()=>{
  const {runtime,updates}=facade();
  await runtime.setPermissionMode('s-1','plan');
  await runtime.setPermissionMode('s-1','default');
  assert.deepEqual(updates,[['s-1',{permessi:'Read only',modalitaOperativa:'piano'}],['s-1',{permessi:'On request',modalitaOperativa:'normale'}]]);
});

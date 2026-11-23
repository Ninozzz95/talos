/*
 * F-P-001 (stress test 0.5.2, owner 09/10/2026 «Come Claude Code»). In acceptEdits file edits and the filesystem commands
 * (mkdir, touch, rm, rmdir, cp, mv inside the project) go without asking; every other command asks, and in `-p` it is refused.
 * The kernel was told "Workspace write" for acceptEdits, a level at which it never asks the CLI: `echo x > f` ran unasked.
 * The same level let a deny rule the person wrote go unheard in acceptEdits and in Full access (owner «Valgono sempre»: a deny
 * rule holds in every mode, as in Claude Code). Every mode but plan is now the kernel's "On request", so every write and
 * command reaches the CLI's engine, which applies the mode. A plan approved with «accept edits» puts the kernel at "Workspace
 * write" by itself (plan-contract.mjs PERMESSI_DOPO_IL_PIANO): the CLI brings it back to "On request" right after the answer.
 * Sources (09/10/2026): Claude Code permission-modes docs (acceptEdits: edits plus mkdir/touch/rm/rmdir/mv/cp/sed in the
 * working directory, all other Bash commands still prompt); Gemini CLI `--approval-mode auto_edit` (edits applied, shell
 * still confirmed); OpenCode permissions (`edit` and `bash` are separate allow/ask/deny keys).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {sessionModeOf} from '../../src/runtime/session-modes.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const HASH='sha256:'+'c'.repeat(64);
function facade(){
  const starts:any[]=[],updates:any[]=[],order:string[]=[];
  const registry:any={
    avviaLibero(input:any){starts.push(input);return{sessionId:'s-1'};},iscriviti(){return()=>{};},elenca:()=>[],
    async aggiornaImpostazioni(id:string,patch:any){order.push('settings');updates.push([id,patch]);return{ok:true};},
    async rispondiPiano(){order.push('plan');return{ok:true};},
  };
  return{runtime:createSessionFacade(registry,{model:'m'}),starts,updates,order};
}

test('acceptEdits and Full access are the kernel\'s "On request": every command reaches the CLI\'s engine',async()=>{
  const {runtime,starts,updates}=facade();
  await runtime.start({projectRoot:process.cwd(),prompt:'x',permissionMode:'acceptEdits'} as any);
  await runtime.start({projectRoot:process.cwd(),prompt:'x',permissionMode:'bypassPermissions'} as any);
  assert.deepEqual(starts.map(s=>s.permessi),['On request','On request']);
  await runtime.setPermissionMode('s-1','acceptEdits');
  await runtime.setPermissionMode('s-1','bypassPermissions');
  assert.deepEqual(updates.map(([,patch])=>patch.permessi),['On request','On request']);
  assert.equal(sessionModeOf('s-1'),'bypassPermissions');
});

test('the engine: a deny rule the person wrote holds in acceptEdits and Full access; everything else goes in Full access',async()=>{
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:['Bash(mkdir denied-dir)']}});
  for(const mode of ['acceptEdits','bypassPermissions'] as const)
    assert.equal((await engine.decide({tool:'Bash',command:'mkdir denied-dir'},{interactive:false,mode})).kind,'deny',mode);
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},{interactive:false,mode:'bypassPermissions'})).kind,'allow');
});

test('a plan approved with «accept edits» brings the kernel back to "On request" right after the answer',async()=>{
  const {runtime,updates,order}=facade();
  await runtime.answerPlan('s-1',{requestId:'r-1',hash:HASH,decision:'accept-edits'});
  assert.deepEqual(order,['plan','settings']);
  assert.equal(updates[0][1].permessi,'On request');
  assert.equal(sessionModeOf('s-1'),'acceptEdits');
  updates.length=0;order.length=0;
  await runtime.answerPlan('s-1',{requestId:'r-2',hash:HASH,decision:'ask-before-edits'});
  assert.deepEqual(order,['plan'],'the kernel already asks after «ask before edits»');
  assert.equal(sessionModeOf('s-1'),'default');
  await runtime.answerPlan('s-1',{requestId:'r-3',hash:HASH,decision:'keep-planning'});
  assert.deepEqual(order,['plan','plan']);
});

test('the engine in acceptEdits: edits and filesystem commands go, any other command asks, and -p refuses it',async()=>{
  const root=process.cwd();
  const engine=createPermissionEngine({projectRoot:root,rules:{allow:[],ask:[],deny:[]}});
  const decide=(action:any,interactive:boolean)=>engine.decide(action,{interactive,mode:'acceptEdits'});
  assert.equal((await decide({tool:'Write',resource:'notes.txt'},false)).kind,'allow');
  assert.equal((await decide({tool:'Bash',command:'mkdir build-out'},false)).kind,'allow');
  assert.equal((await decide({tool:'Bash',command:'npm test'},true)).kind,'ask');
  assert.equal((await decide({tool:'Bash',command:'npm test'},false)).kind,'deny');
});

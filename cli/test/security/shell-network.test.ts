/*
 * The shell's network (owner 09/10/2026, «Segue il modo + si chiede (Consigliata)»). Codex: «Full Access» reaches the internet
 * without asking, «Default» asks; Claude Code: bypassPermissions lets a host outside the allowed list through, the other modes
 * ask. Here: a command that asks for the network (the kernel's `rete: true`) is allowed in Full access, asked to the person in
 * the other modes (no allow rule or session grant answers it), and refused with nobody to ask.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
import {networkOpenFor,rememberSessionMode} from '../../src/runtime/session-modes.ts';

const raw={tipo:'shell',comando:'npm view left-pad version',rete:true,toolCallId:'c'};
const action=permissionActionFromApproval({azione:raw});
const engine=(allow:string[]=[])=>createPermissionEngine({projectRoot:process.cwd(),rules:{allow,ask:[],deny:[]}});

test('shell network: Full access allows it, the other modes ask the person, nobody to ask means no',async()=>{
  assert.equal(action.networkRequested,true);
  assert.equal((await engine().decide(action,{interactive:true,mode:'bypassPermissions'})).kind,'allow');
  for(const mode of ['default','acceptEdits'] as const)assert.equal((await engine().decide(action,{interactive:true,mode})).kind,'ask',mode);
  assert.equal((await engine(['Bash(npm view:*)']).decide(action,{interactive:true,mode:'default'})).kind,'ask','an allow rule for the command does not open the network');
  assert.equal((await engine().decide(action,{interactive:false,mode:'default'})).kind,'deny');
});

test('shell network: the card says it, with only once and deny',()=>{
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action,rawPayload:raw,reason:'x'};
  const model=approvalDialogModel(pending,{expanded:false});
  assert.match(model.title,/with network access/u,model.title);
  assert.deepEqual((model.choices??[]).map(row=>row.action),['approval-once','approval-deny-once']);
});

test('shell network: the session mode decides the commands of a run, read each time',()=>{
  rememberSessionMode('s-net','default');assert.equal(networkOpenFor('s-net'),false);
  rememberSessionMode('s-net','bypassPermissions');assert.equal(networkOpenFor('s-net'),true);
  assert.equal(networkOpenFor('unknown'),false,'a session TALOS did not see a mode for stays closed');
});

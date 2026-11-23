/*
 * Owner 09/10/2026: a change of OpenRouter's excluded providers («Sì, con la carta») and going on after the model went round in
 * circles («Avvisa, poi chiede o ferma») are answered by a person, every time: no rule or session grant says yes; with nobody to
 * ask (-p, dontAsk) the answer is no, with the reason. Decision 158 (owner 04/11/2026) lifts both in Full access only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const engine=(allow:string[]=[])=>createPermissionEngine({projectRoot:process.cwd(),rules:{allow,ask:[],deny:[]}});
const loop={tipo:'giri-in-tondo',strumento:'leggi',volte:5,toolCallId:'c'};
const exclude={tipo:'provider_exclude',fornitore:'deepinfra',cambi:[{campo:'persona',modello:null,prima:[],dopo:['deepinfra']}],toolCallId:'c'};

for(const [name,raw] of [['going on after a loop',loop],['a provider exclusion',exclude]] as const){
  /* Decision 158 (owner 04/11/2026): Full access now answers it, as Claude Code's bypassPermissions; in every other mode no rule
     or grant does, and with nobody to ask it is refused */
  test(`person only: ${name} is asked outside Full access, refused with nobody to ask, answered by Full access`,async()=>{
    const action=permissionActionFromApproval({azione:raw});
    assert.equal((await engine().decide(action,{interactive:true,mode:'default'})).kind,'ask');
    assert.equal((await engine([`TalosService(${raw.tipo})`]).decide(action,{interactive:true,mode:'default'})).kind,'ask','an allow rule does not answer it');
    assert.equal((await engine().decide(action,{interactive:false,mode:'default'})).kind,'deny');
    for(const interactive of [true,false])assert.equal((await engine().decide(action,{interactive,mode:'bypassPermissions'})).kind,'allow');
  });
}

test('person only: the loop card says what happened, with only once and deny',()=>{
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:loop}),rawPayload:loop,reason:'x'};
  const model=approvalDialogModel(pending,{expanded:false});
  assert.match(model.summary,/called Read file 5 times with the same arguments and got the same result · let it go on\?/u,model.summary);
  assert.deepEqual((model.choices??[]).map(row=>row.action),['approval-once','approval-deny-once']);
});

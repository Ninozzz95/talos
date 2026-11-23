/*
 * Owner 02/11/2026 (decisions 35, 44-46; Desktop's review R2): from the chat a deep research starts only with the person's yes on its card, in
 * every mode. The kernel builds the action (`azioneCartaRicerca`): question, depth and cost in words. In the CLI it is a person-only question.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const engine=(allow:string[]=[])=>createPermissionEngine({projectRoot:process.cwd(),rules:{allow,ask:[],deny:[]}});
const card={tipo:'research_start',toolCallId:'c',question:'Which local models read images?',frase:'about 12 searches, 40 pages, 90k tokens, 6 minutes'};
const action=permissionActionFromApproval({azione:card});

test('the research card is asked even in Full access and under an allow rule, and refused with nobody to ask',async()=>{
  assert.equal(action.operation,'research_start');
  assert.equal((await engine().decide(action,{interactive:true,mode:'bypassPermissions'})).kind,'ask');
  assert.equal((await engine(['TalosService(research_start)']).decide(action,{interactive:true,mode:'default'})).kind,'ask');
  const refused=await engine().decide(action,{interactive:false,mode:'bypassPermissions'});
  assert.equal(refused.kind,'deny');assert.equal((refused as any).code,'NEEDS_PERSON');
});

test('the card says the question and the cost, and offers Start, Cancel and the change of the question',async()=>{
  const asked:any=await engine().decide(action,{interactive:true,mode:'bypassPermissions'});
  assert.match(asked.reason,/Which local models read images\?/u);assert.match(asked.reason,/90k tokens/u);
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action,rawPayload:card,reason:asked.reason};
  assert.deepEqual((approvalDialogModel(pending,{expanded:false}).choices??[]).map(row=>row.action),['approval-once','approval-deny-once','approval-edit']);
});

test('the question is the model\'s text: no control character reaches the card',async()=>{
  const hostile=permissionActionFromApproval({azione:{...card,question:'x\u001b]52;c;ZXZpbA==\u0007\u001b[2Jy'}});
  const asked:any=await engine().decide(hostile,{interactive:true,mode:'default'});
  assert.doesNotMatch(asked.reason,/[\u0000-\u001f\u007f-\u009f]/u);
});

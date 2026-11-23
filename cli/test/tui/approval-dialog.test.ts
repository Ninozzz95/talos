import assert from 'node:assert/strict';
import test from 'node:test';
import {approvalDialogModel,approvalChoiceForAction} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

test('approval view exposes full redacted payload and only sourced runtime hints',()=>{
  const p:PendingTuiApproval={requestId:'r',sessionId:'s',action:{tool:'Bash',command:'curl x'},rawPayload:{comando:'curl -H "Authorization: [REDACTED:6]" x',trifecta:true},reason:'no rule matched',runtimeHint:'trifecta'};
  const model=approvalDialogModel(p,{expanded:true});
  assert.doesNotMatch(model.fullPayload,/secret/u);assert.match(model.fullPayload,/REDACTED/u);assert.equal(model.runtimeHint,'trifecta');
});

test('approval cancel actions can never resolve to allow',()=>{
  assert.equal(approvalChoiceForAction('approval-cancel'),'deny-once');
  assert.equal(approvalChoiceForAction('interrupt'),'deny-once');
});

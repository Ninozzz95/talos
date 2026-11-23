/*
 * Owner 09/10/2026 («Sì, con la carta»): when the model asks to exclude or allow again a downstream provider on OpenRouter, the card
 * says what changes, before → after, in words (the kernel's fields are Italian: `fornitore`, `cambi`, `campo`, `prima`, `dopo`),
 * and offers only «once» and «deny»: «always» would let the next change through without the card the owner asked for.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const card=(raw:Record<string,unknown>,expanded=false)=>{
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:raw}),rawPayload:raw,reason:'no rule matched'};
  return approvalDialogModel(pending,{expanded});
};

test('provider card: excluding for every model says before → after, in words',()=>{
  const model=card({tipo:'provider_exclude',toolCallId:'c',fornitore:'deepinfra',cambi:[{campo:'persona',modello:null,prima:[],dopo:['deepinfra']}]});
  assert.equal(model.summary,'Exclude deepinfra on OpenRouter, for every model · excluded: none → deepinfra');
  assert.deepEqual((model.choices??[]).map(row=>row.action),['approval-once','approval-deny-once'],'only once and deny');
});

test('provider card: allowing again names the list and a default exclusion of one model',()=>{
  const model=card({tipo:'provider_allow',toolCallId:'c',fornitore:'open-inference',cambi:[
    {campo:'persona',modello:null,prima:['open-inference','together'],dopo:['together']},
    {campo:'di-serie',modello:'z-ai/glm-5.3-flash',prima:true,dopo:false},
  ]});
  assert.equal(model.summary,'Allow open-inference again on OpenRouter · excluded: open-inference, together → together · excluded by default for z-ai/glm-5.3-flash: yes → no');
});

test('provider card: the full review shows no kernel field names',()=>{
  const model=card({tipo:'provider_exclude',toolCallId:'c',fornitore:'deepinfra',cambi:[{campo:'persona',modello:null,prima:[],dopo:['deepinfra']}]},true);
  assert.doesNotMatch(model.fullPayload,/fornitore|cambi|campo|prima|dopo/u,model.fullPayload);
  assert.match(model.fullPayload,/excluded: none → deepinfra/u);
});

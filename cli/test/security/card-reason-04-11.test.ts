/*
 * Release candidate 04/11/2026: the kernel's guard gives its card a REASON (`segreto.perche`, path-policy.mjs CHIAVI_DELLA_FRASE): `biglietti`
 * for a command that can make a sign-in link or read its key, `troppo-complesso` when the guard went past its limits. The path is then a
 * placeholder («biglietto-talos») or the first 120 characters of the command, so the CLI card saying «It touches a file that may hold keys or
 * passwords: biglietto-talos» would be false and would show an internal name. The reason wins over the class, as in the kernel's own card.
 * Hermes shows the reason beside the command (tools/approval.py:1258 «command parser limit exceeded», shown at :2766); NN/g «Confirmation
 * Dialogs Can Prevent User Errors»: say the specific consequence, never a generic line.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {t} from '../../src/i18n/index.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const PATH_POLICY=readFileSync(new URL('../../../harness-ui/src/path-policy.mjs',import.meta.url),'utf8');
const shell=(segreto:Record<string,unknown>)=>({tipo:'shell',toolCallId:'c1',comando:'node make-link.mjs',segreto});
const translate=(azione:Record<string,unknown>)=>(createV2EventBridge('s-1',()=>'2026-11-04T09:00:00.000Z')
  .translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione:structuredClone(azione)})?.data as any).action;
const lines=(payload:Record<string,unknown>)=>{
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:payload}),rawPayload:payload,reason:'no rule matched'};
  return approvalDialogModel(pending,{expanded:true}).fullPayload;
};

test('the kernel still gives the two reasons (pinned)',()=>{
  assert.ok(PATH_POLICY.includes("perche: esito === 'troppo-complesso' ? 'troppo-complesso' : 'biglietti'"));
  assert.ok(PATH_POLICY.includes("'biglietti|shell': 'server.approval.command.signInLink'"));
  assert.ok(PATH_POLICY.includes("'troppo-complesso|shell': 'server.approval.command.tooComplex'"));
});

test('v2 names the reason in English, and its values too',()=>{
  assert.deepEqual(translate(shell({classe:'segreto',percorso:'biglietto-talos',perche:'biglietti'})).sensitive,{class:'secret',path:'biglietto-talos',reason:'sign-in-link'});
  assert.equal(translate(shell({classe:'segreto',percorso:'node make-link.mjs',perche:'troppo-complesso'})).sensitive.reason,'too-complex');
});

test('the card says the reason, never «a file that may hold keys» about a placeholder; both spellings',()=>{
  const signIn=t('approval.review.signInLink'),tooComplex=t('approval.review.tooComplex');
  for(const segreto of [{classe:'segreto',percorso:'biglietto-talos',perche:'biglietti'},{class:'secret',path:'biglietto-talos',reason:'sign-in-link'}]){
    const text=lines(shell(segreto));
    assert.ok(text.includes(signIn),text);
    assert.doesNotMatch(text,/keys or passwords|biglietto-talos/u);
  }
  for(const segreto of [{classe:'segreto',percorso:'node make-link.mjs',perche:'troppo-complesso'},{class:'secret',path:'node make-link.mjs',reason:'too-complex'}]){
    const text=lines(shell(segreto));
    assert.ok(text.includes(tooComplex),text);
    assert.doesNotMatch(text,/keys or passwords/u);
  }
});

test('the other way: with no reason a secret still says so, and the class decides as before',()=>{
  const text=lines(shell({classe:'segreto',percorso:'~/.ssh/id_rsa'}));
  assert.ok(text.includes(t('approval.review.sensitive',{path:'~/.ssh/id_rsa'})),text);
  assert.doesNotMatch(text,new RegExp(t('approval.review.signInLink').slice(0,20),'u'));
  /* a reason never makes a secret less of one: the decision reads the class, not the reason */
  assert.equal(permissionActionFromApproval({azione:shell({classe:'segreto',percorso:'biglietto-talos',perche:'biglietti'})}).sensitive,'secret');
});

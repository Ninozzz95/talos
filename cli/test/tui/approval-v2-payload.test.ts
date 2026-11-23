/*
 * 0.6.15 (triage of the 0614b stress run): the TUI's approval card reads the action AFTER the v2 bridge has put it in English
 * (event-adapter.ts reads `data.action`), so it must read the English names. Two fields were read only by the kernel's name:
 * - D-A1's class (`segreto.classe: 'fuori-workspace'`) arrives as `sensitive.class: 'outside'`: a plain file outside the project was
 *   described as «keys or passwords»;
 * - the before/after texts of a write (`contenutoPrima`/`contenutoProposto`), English in v2 since 0.6.15 (`contentBefore`/
 *   `proposedContent`, contract R12): the card's diff must keep working.
 * The test drives the real path: kernel event → TUI adapter (v2 bridge) → pending approval → the card's text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
import {t} from '../../src/i18n/index.ts';

function pendingFrom(azione:Record<string,unknown>):PendingTuiApproval{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const event=adapter.translate({type:'ApprovalRequested',requestId:'r1',azione}) as any;
  assert.equal(event?.type,'approval.required');
  const payload=event.payload as Record<string,unknown>;
  return{requestId:'r1',sessionId:'s1',action:permissionActionFromApproval(payload),rawPayload:payload,reason:'asks'};
}

test('the v2 approval payload is English: no kernel key reaches the card',()=>{
  const pending=pendingFrom({tipo:'scrivi',percorso:'a.txt',contenutoPrima:'old\n',contenutoProposto:'new\n',toolCallId:'c1'});
  assert.equal('contenutoPrima' in pending.rawPayload,false);
  assert.equal('contenutoProposto' in pending.rawPayload,false);
  assert.equal(pending.rawPayload.contentBefore,'old\n');
  assert.equal(pending.rawPayload.proposedContent,'new\n');
});

test('a write approval keeps its diff from the English v2 payload',()=>{
  const pending=pendingFrom({tipo:'scrivi',percorso:'a.txt',contenutoPrima:'old\n',contenutoProposto:'new\n',toolCallId:'c1'});
  const view=approvalDialogModel(pending,{expanded:false}) as any;
  const text=JSON.stringify(view);
  assert.match(text,/new/u);
  assert.ok(view.change,'the card shows the change');
  /* review block 3 (M8): the text BEFORE comes from `contentBefore` — read only `contenutoPrima` and an edit looks like a new file */
  assert.doesNotMatch(view.change.counts,/new file/iu);
  assert.ok(view.change.rows.some((row:{kind:string;text:string})=>row.kind==='remove'&&row.text.includes('old')),'the old line is removed in the diff');
  assert.doesNotMatch(text,/contenutoPrima|contenutoProposto|contentBefore|proposedContent/u,'never a field name on screen');
  /* the full review (Ctrl+E) too: the texts are the diff, never «Other details» */
  const full=approvalDialogModel(pending,{expanded:true});
  assert.doesNotMatch(full.fullPayload,/contenutoPrima|contenutoProposto|contentBefore|proposedContent/u);
});

test('D-A1 through v2: a plain file outside the project says «outside the project», never «keys or passwords»',()=>{
  const outside=pendingFrom({tipo:'leggi',percorso:'/home/u/notes.txt',segreto:{classe:'fuori-workspace',percorso:'/home/u/notes.txt'}});
  assert.equal(outside.action.sensitive,'outside');
  const text=JSON.stringify(approvalDialogModel(outside,{expanded:true}));
  assert.ok(text.includes(t('approval.review.outside',{path:'/home/u/notes.txt'})),text);
  assert.doesNotMatch(text,/keys or passwords/u);
  const secret=JSON.stringify(approvalDialogModel(pendingFrom({tipo:'leggi',percorso:'/home/u/.env',segreto:{classe:'segreto',percorso:'/home/u/.env'}}),{expanded:true}));
  assert.match(secret,/keys or passwords/u,'a secret still says so');
});

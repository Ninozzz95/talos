/*
 * Adversarial review of 0.6.0 (bugfixer, 13/10/2026). Was RED on 13/10/2026, cured in 0.6.1 (permission-engine.ts
 * PERSON_ONLY_OPERATIONS now holds `chatgpt_account`; the card says what it does and offers once and deny). What follows is the
 * finding as it was in 0.6.0.
 *
 * 0.6.0 offers the model `chatgpt_account` (kernel fornitori-per-il-modello.mjs; linked by talos-composition.ts
 * `linkProviderExclusions(…, chatgptPlan.kernelFacade)`). Its `disconnect` signs the person out of their ChatGPT plan and
 * REVOKES the session at OpenAI. The kernel asks first with a card (`anteprima` → `carta: true`, payload
 * `{fornitore:'chatgpt', email, tipo:'chatgpt_account'}` through `chiediApprovazioneFn`), exactly like `provider_exclude` and
 * `provider_allow`. Those two are the person's to answer every time (permission-engine.ts PERSON_ONLY_OPERATIONS, owner
 * 09/10/2026 «Sì, con la carta»), and are not even offered where nobody can answer (WITHOUT_PERSON_LEFT_OUT).
 * `chatgpt_account` is in neither list, so its card is an ordinary TalosService approval:
 *   - in Full access (the screen, or `talos -p --permission-mode bypassPermissions`) the mode says yes: the model signs the
 *     person out and revokes with nobody asked;
 *   - on the screen the card offers «for this session» and «always», and an allow rule answers every later one;
 *   - the card does not say what is about to happen (no word of signing out, nor of whom).
 * The kernel itself refuses the same call in an automation run «nobody could approve it».
 * Decision 158 (owner 04/11/2026): Full access now signs out without a card, as Claude Code's bypassPermissions; every other mode
 * keeps the card, and with nobody to ask outside Full access it is refused.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
import {describeError} from '../../src/i18n/error-view.ts';

const engine=(allow:string[]=[])=>createPermissionEngine({projectRoot:process.cwd(),rules:{allow,ask:[],deny:[]}});
/* what the kernel hands `chiediApprovazioneFn` for a disconnect (talosHarness.mjs: `{...anteprima.azione, tipo, toolCallId}`) */
const disconnect={tipo:'chatgpt_account',fornitore:'chatgpt',email:'nino@example.com',toolCallId:'c'};

test('signing the person out of ChatGPT is asked outside Full access, and refused with nobody to ask',async()=>{
  const action=permissionActionFromApproval({azione:disconnect});
  assert.equal(action.tool,'TalosService');assert.equal(action.operation,'chatgpt_account');
  assert.equal((await engine().decide(action,{interactive:true,mode:'default'})).kind,'ask');
  assert.equal((await engine(['TalosService(chatgpt_account)']).decide(action,{interactive:true,mode:'default'})).kind,'ask','an allow rule answers every later sign-out');
  assert.equal((await engine().decide(action,{interactive:false,mode:'default'})).kind,'deny','`talos -p` signs out and revokes with nobody asked');
  for(const interactive of [true,false])assert.equal((await engine().decide(action,{interactive,mode:'bypassPermissions'})).kind,'allow','decision 158: Full access signs out');
});

test('the card says that it signs out of ChatGPT, and offers only once and deny',()=>{
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:disconnect}),rawPayload:disconnect,reason:'x'};
  const model=approvalDialogModel(pending,{expanded:false});
  assert.match(model.summary,/sign(s|ing)? out|disconnect/iu,`the card does not say what it does: ${model.summary}`);
  assert.deepEqual((model.choices??[]).map(row=>row.action),['approval-once','approval-deny-once']);
});

/* Review of 0.6.1 (13/10/2026; was RED that day, cured after 0.6.1): the refusal's words spoke only of the excluded providers and
   of a model that repeats itself, and are now read for a sign-out too. They name all three, and the person's own command for each. */
test('what a person reads for NEEDS_PERSON is true for a sign-out too, and says how they sign out themselves',async()=>{
  const refused=await engine().decide(permissionActionFromApproval({azione:disconnect}),{interactive:false,mode:'default'});
  assert.equal(refused.kind,'deny');assert.equal((refused as any).code,'NEEDS_PERSON');
  const view=describeError(Object.assign(new Error(String((refused as any).message)),{code:(refused as any).code}));
  assert.match(view.what,/sign(ing)? out of ChatGPT/u,view.what);
  assert.match(view.what,/excluded providers/u);assert.match(view.what,/repeats itself/u);
  assert.match(view.todo??'',/talos provider logout chatgpt/u,view.todo??'');
  assert.match(view.todo??'',/talos provider exclude/u);assert.match(view.todo??'',/talos provider allow/u);
});

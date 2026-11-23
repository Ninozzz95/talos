/*
 * D-A1 (owner 04/10, «nuovo valore `outside`, bypassabile come `outside-hidden`; Full access la tace già nel kernel»).
 * The merged kernel (path-policy.mjs `letturaFuoriDalWorkspace`, desktop D2) asks BEFORE a read or a listing outside the session
 * folder and tags the question with `azione.segreto.classe: 'fuori-workspace'`. The CLI table did not know that class, and a class
 * it does not know is read as a secret: bypassPermissions would still refuse a read the owner wants to flow (C-005), and the
 * approval card would say «may hold keys or passwords» about a plain file. Now: class `outside`, never a secret.
 * Claude Code (permissions doc): reads inside the working directory and `additionalDirectories` need no approval, the rest asks;
 * Codex asks outside the workspace under `on-request`.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {t} from '../../src/i18n/index.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
import type {PermissionAction} from '../../src/security/types.ts';

const PATH_POLICY=readFileSync(new URL('../../../harness-ui/src/path-policy.mjs',import.meta.url),'utf8');
const approval=(classe:string,tipo='leggi')=>permissionActionFromApproval({azione:{tipo,percorso:'/home/u/notes.txt',segreto:{classe,percorso:'/home/u/notes.txt',frase:'…'}}});
const engine=()=>createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:[]}});

test('D-A1: the kernel still names the class `fuori-workspace` (pinned)',()=>{
  assert.ok(PATH_POLICY.includes("return { classe: 'fuori-workspace', percorso: grezzo };"));
});

test('D-A1: the kernel class `fuori-workspace` is `outside`, for a read and for a listing; other classes unchanged',()=>{
  assert.equal(approval('fuori-workspace').sensitive,'outside');
  assert.equal(approval('fuori-workspace','elenca').sensitive,'outside');
  assert.equal(approval('segreto').sensitive,'secret');
  assert.equal(approval('portachiavi').sensitive,'keychain');
  assert.equal(approval('fuori-workspace-nascosto').sensitive,'outside-hidden');
  assert.equal(approval('qualcosa-di-nuovo').sensitive,'secret','an unknown class is still the strictest');
});

/* 0.6.8 (owner 16/10/2026, «Come il Desktop: non chiede»; the desktop's rule of 12/10 «Full access non chiede mai»): Full access no longer asks for a secret or the keychain */
test('D-A1: bypassPermissions lets an `outside` read through, and since 0.6.8 a secret or the keychain too',async()=>{
  const decide=(sensitive:PermissionAction['sensitive'])=>engine().decide({tool:'Read',resource:'/home/u/notes.txt',sensitive},{interactive:false,mode:'bypassPermissions'});
  assert.equal((await decide('outside')).kind,'allow');
  assert.equal((await decide('outside-hidden')).kind,'allow');
  assert.equal((await decide('secret')).kind,'allow');
  assert.equal((await decide('keychain')).kind,'allow');
  for(const sensitive of ['secret','keychain'] as const)assert.equal((await engine().decide({tool:'Read',resource:'/home/u/notes.txt',sensitive},{interactive:false,mode:'default'})).kind,'deny',`default refuses a ${sensitive} with nobody in front`);
});

test('D-A1: with nobody to ask, an `outside` read in default mode is not allowed on its own',async()=>{
  const decision=await engine().decide({tool:'Read',resource:'/home/u/notes.txt',sensitive:'outside'},{interactive:false,mode:'default'});
  assert.notEqual(decision.kind,'allow');
});

test('D-A1: the approval card says «outside the project», never «keys or passwords», for that class only',()=>{
  const lines=(classe:string)=>{const raw={tipo:'leggi',percorso:'/home/u/notes.txt',segreto:{classe,percorso:'/home/u/notes.txt'}};const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:raw}),rawPayload:raw,reason:'no rule matched'};return approvalDialogModel(pending,{expanded:true}).fullPayload;};
  assert.ok(lines('fuori-workspace').includes(t('approval.review.outside',{path:'/home/u/notes.txt'})),lines('fuori-workspace'));
  assert.equal(t('approval.review.outside',{path:'/x'}),'It reads outside the project: /x');
  assert.doesNotMatch(lines('fuori-workspace'),/keys or passwords/u);
  assert.match(lines('segreto'),/keys or passwords/u,'a secret still says so');
});

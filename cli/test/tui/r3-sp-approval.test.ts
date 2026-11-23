/*
 * R3 lane SP — the approval dialog (gate E11; owner decisions Q-R3-5, Q-R3-6, Q-R3-13, Q-R3-14) and the approval key race
 * (owner decision, binding: a grace period of APPROVAL_GRACE_MS). Measured before (gate §0.10): no question, no highlight,
 * digits only, Esc denied even from the full review, and the full review was `JSON.stringify` of the kernel payload
 * (`"tool": "scrivi"`, `"contenutoPrima": null`). Key race (coordinator, R3 acceptance): a key typed while the dialog
 * opened answered it or not depending on paint timing, because routing read the last render's focus.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {APPROVAL_DEFAULT_SELECTED,APPROVAL_GRACE_MS,approvalDialogLines,approvalDialogModel,approvalInputGate,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
import {sanitizeInputText,splitInputChunk} from '../../src/tui/keybindings.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
const texts=(lines:any[])=>lines.flatMap((line:any)=>line.kind==='row'?[line.gutter,...line.commandLines,...line.deciderLines]:[line.text]);
const SHELL:PendingTuiApproval={requestId:'r',sessionId:'s',action:{tool:'Bash',command:'npm test'},rawPayload:{tool:'shell',command:'npm test',toolCallId:'t1'},reason:'no rule matched'};
const WRITE:PendingTuiApproval={requestId:'w',sessionId:'s',action:{tool:'Write',resource:'notes.txt'},rawPayload:{tool:'scrivi',path:'notes.txt',toolCallId:'t2',contenutoPrima:null,contenutoProposto:'one\ntwo\nthree'},reason:'no rule matched'};

test('R3-SP E11 / Q-R3-6: a question, four choices, Deny highlighted; Enter on it denies and the turn goes on',()=>{
  const shown=texts(approvalDialogLines(approvalDialogModel(SHELL,{expanded:false}),{columns:80}));
  assert.ok(shown.includes('Run this command?'),shown.join('\n'));
  for(const choice of [' [1] Allow once',' [2] Allow for this session',' [3] Always allow','›[4] Deny'])assert.ok(shown.includes(choice),`missing ${JSON.stringify(choice)}:\n${shown.join('\n')}`);
  assert.equal(shown.some(line=>/deny always/iu.test(line)),false,'Q-R3-6: "deny always" is in the full review only');
  assert.equal(APPROVAL_DEFAULT_SELECTED,3);
  assert.deepEqual(approvalKeyOutcome('approval-confirm',{expanded:false,selected:APPROVAL_DEFAULT_SELECTED,escape:false}),{kind:'answer',choice:'deny-once',stop:false});
  assert.deepEqual(approvalKeyOutcome('approval-up',{expanded:false,selected:3,escape:false}),{kind:'select',selected:2});
  assert.deepEqual(approvalKeyOutcome('approval-down',{expanded:false,selected:3,escape:false}),{kind:'select',selected:3});
  assert.deepEqual(approvalKeyOutcome('approval-confirm',{expanded:false,selected:0,escape:false}),{kind:'answer',choice:'allow-once',stop:false});
  assert.deepEqual(approvalKeyOutcome('approval-session',{expanded:false,selected:3,escape:false}),{kind:'answer',choice:'allow-session',stop:false});
  const moved=texts(approvalDialogLines(approvalDialogModel(SHELL,{expanded:false,selected:0}),{columns:80}));
  assert.ok(moved.includes('›[1] Allow once')&&moved.includes(' [4] Deny'),moved.join('\n'));
});

test('R3-SP Q-R3-5 / Q-R3-14: Esc denies and stops from the summary, goes back from the full review; Ctrl+C always stops',()=>{
  assert.deepEqual(approvalKeyOutcome('approval-cancel',{expanded:false,selected:3,escape:true}),{kind:'answer',choice:'deny-once',stop:true});
  assert.deepEqual(approvalKeyOutcome('approval-cancel',{expanded:true,selected:3,escape:true}),{kind:'back'});
  assert.deepEqual(approvalKeyOutcome('approval-cancel',{expanded:true,selected:3,escape:false}),{kind:'answer',choice:'deny-once',stop:true});
  assert.deepEqual(approvalKeyOutcome('approval-deny-always',{expanded:false,selected:3,escape:false}),{kind:'ignore'});
  assert.deepEqual(approvalKeyOutcome('approval-deny-always',{expanded:true,selected:3,escape:false}),{kind:'answer',choice:'deny-always',stop:false});
  assert.deepEqual(approvalKeyOutcome('approval-view',{expanded:false,selected:3,escape:false}),{kind:'toggle-review'});
});

test('R3-SP E11 / §0.10: the full review is for a person — English names, the diff, no JSON and no kernel keys',()=>{
  const review=texts(approvalDialogLines(approvalDialogModel(WRITE,{expanded:true}),{columns:80})).join('\n');
  for(const kernel of ['scrivi','contenutoPrima','contenutoProposto','toolCallId','{','"tool"'])assert.equal(review.includes(kernel),false,`the full review shows ${JSON.stringify(kernel)}:\n${review}`);
  assert.match(review,/Tool: Write file/u);assert.match(review,/Path: notes\.txt/u);
  assert.match(review,/new file · 3 lines/u,'Q-R3-4: the change is stated in the approval');
  assert.match(review,/Write this file\?/u);
  assert.match(review,/\[5\] deny always/u,'the full review offers "deny always"');
  const summary=texts(approvalDialogLines(approvalDialogModel(WRITE,{expanded:false}),{columns:80})).join('\n');
  assert.match(summary,/new file · 3 lines/u,'Q-R3-4: the diff is shown in the approval, not only in the full review');
});

test('R3-SP Q-R3-13: a command approval on a host with no verified sandbox says (unsandboxed) in its title; a write does not',()=>{
  assert.equal(approvalDialogModel(SHELL,{expanded:false,unsandboxed:true}).title,'Permission: Shell (unsandboxed)');
  assert.equal(approvalDialogModel(SHELL,{expanded:false}).title,'Permission: Shell');
  assert.equal(approvalDialogModel(WRITE,{expanded:false,unsandboxed:true}).title,'Permission: Write file');
});

test('R3-SP key race: the grace gate — composer before APPROVAL_GRACE_MS, dialog after',()=>{
  assert.equal(APPROVAL_GRACE_MS,300);
  assert.equal(approvalInputGate(null,1_000),'none');
  assert.equal(approvalInputGate({shownAt:1_000},1_050),'grace');
  assert.equal(approvalInputGate({shownAt:1_000},1_350),'dialog');
});

test('R3-KEYS: a leading control character is its key; no C0 or DEL reaches the text but a line break',()=>{
  assert.deepEqual(splitInputChunk('\u000fKEYS glued',{}),[{ch:'o',key:{ctrl:true}},{ch:'KEYS glued',key:{}}]);
  assert.deepEqual(splitInputChunk('abc',{}),[{ch:'abc',key:{}}]);
  assert.deepEqual(splitInputChunk('o',{ctrl:true}),[{ch:'o',key:{ctrl:true}}]);
  assert.deepEqual(splitInputChunk('a\u0007b\r\nc',{}),[{ch:'ab\nc',key:{}}]);
  assert.equal(sanitizeInputText('x\u001b[31my\u007fz\tw'),'x[31myz\tw');// owner decision (R3 follow-up): TAB is kept
});


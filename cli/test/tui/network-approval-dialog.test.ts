/*
 * Network-path series, owner decisions 02/10: «Solo tu, sempre» and the dialog preview approved the same day. A network path
 * is answered once, every time (a session folder on a share: once per session, remembered by the kernel), so the dialog
 * offers only the choices that hold — no «always» — and says that opening it sends the Windows credentials to that host.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {approvalChoicesFor,approvalDialogLines,approvalDialogModel,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

function pending(extra:Record<string,unknown>={},percorso='\\\\files.example\\share\\notes.txt'){
  const raw={tipo:'leggi',toolCallId:'c1',percorso,percorsoDiRete:{ospite:'files.example',frase:'…',via:'stringa',...extra}};
  return{requestId:'r1',sessionId:'s1',action:permissionActionFromApproval({azione:raw}),reason:'opening a network path sends your Windows credentials to that computer',rawPayload:raw} as any;
}
const text=(p:any,selected?:number)=>approvalDialogLines(approvalDialogModel(p,{expanded:false,...(selected===undefined?{}:{selected})}),{columns:100}).map((line:any)=>line.text).join('\n');

test('a network file: «Allow once» and «Deny» only, Deny selected, the host and the credentials said',()=>{
  const screen=text(pending(),3);
  assert.match(screen,/^Permission: Read file on a network computer$/mu);
  assert.match(screen,/Opening it sends your Windows credentials to files\.example\./u);
  assert.match(screen,/^ \[1\] Allow once$/mu);
  assert.match(screen,/^›\[2\] Deny$/mu);
  assert.doesNotMatch(screen,/Always allow|Allow for this session|\[3\]|\[4\]/u);
});

test('the project folder on a share: «Allow for this session» and «Deny», asked once per session',()=>{
  const screen=text(pending({via:'cartella',ambito:'sessione'},'\\\\files.example\\proj\\README.md'));
  assert.match(screen.replace(/\s*\n\s*/gu,' '),/The project folder is on files\.example: opening it sends your Windows credentials to that computer\. TALOS asks once for this session\./u);
  assert.match(screen,/^ \[1\] Allow for this session$/mu);
  assert.match(screen,/^›\[2\] Deny$/mu);
  assert.doesNotMatch(screen,/Allow once|Always allow/u);
});

test('keys follow the choices on screen: 1 allows, 2 denies, 3 does nothing; Enter answers the highlighted one',()=>{
  const once=approvalChoicesFor(pending().action);const folder=approvalChoicesFor(pending({via:'cartella',ambito:'sessione'}).action);
  const key=(action:string,choices:any,selected=1)=>approvalKeyOutcome(action,{expanded:false,selected,escape:false,choices});
  assert.deepEqual(key('approval-once',once),{kind:'answer',choice:'allow-once',stop:false});
  assert.deepEqual(key('approval-once',folder),{kind:'answer',choice:'allow-session',stop:false});
  assert.deepEqual(key('approval-session',once),{kind:'answer',choice:'deny-once',stop:false},'the key 2 is Deny here');
  assert.deepEqual(key('approval-always',once),{kind:'ignore'});
  assert.deepEqual(key('approval-deny-always',once),{kind:'ignore'});
  assert.deepEqual(approvalKeyOutcome('approval-deny-always',{expanded:true,selected:1,escape:false,choices:once}),{kind:'ignore'},'no «deny always» in the full review either: it is not offered');
  assert.deepEqual(key('approval-up',once,3),{kind:'select',selected:0},'a selection left from a four-choice dialog is brought inside this one');
  assert.deepEqual(key('approval-down',once,0),{kind:'select',selected:1});
  assert.deepEqual(key('approval-down',once,1),{kind:'select',selected:1});
  assert.deepEqual(key('approval-confirm',folder,0),{kind:'answer',choice:'allow-session',stop:false});
  assert.deepEqual(key('approval-confirm',once,1),{kind:'answer',choice:'deny-once',stop:false});
});

test('any other approval keeps its four choices and keys',()=>{
  const read={requestId:'r2',sessionId:'s1',action:{tool:'Read',resource:'README.md'},reason:'no rule matched',rawPayload:{tipo:'leggi',percorso:'README.md'}} as any;
  const screen=text(read);
  assert.match(screen,/\[3\] Always allow/u);
  assert.deepEqual(approvalKeyOutcome('approval-session',{expanded:false,selected:3,escape:false}),{kind:'answer',choice:'allow-session',stop:false});
});

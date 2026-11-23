/*
 * Stage 6c «tutto cliccabile» (owner 01/10; decisions 02/10, clicks on the release; registro 12). The approved mockup's
 * approval card makes each choice a target (`aopt:i`, `click` → chooseApproval), and Claude Code's fullscreen lets a click on
 * an option of a permission prompt choose it. Here every choice row carries the cells it covers, in the full layout and in
 * the compact one (several choices packed on a row), and a click answers like the choice's digit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {APPROVAL_CHOICES,approvalChoicesFor,approvalClickChoice,approvalDialogFit,approvalDialogLines,approvalDialogModel,approvalDialogViewport,type ApprovalDialogLine} from '../../src/tui/overlays/approval-dialog.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:{tool:'Bash',command:'npm test'},rawPayload:{command:'npm test'},reason:'no rule matched'};
/* the text under each target, cut by cells as the screen shows it */
function targetsOf(lines:readonly ApprovalDialogLine[]){
  const out:Array<{action:string;text:string}>=[];
  for(const line of lines){
    if(line.kind!=='text'||!line.targets)continue;
    for(const target of line.targets){
      let at=0,text='';
      for(const ch of line.text){const w=displayWidth(ch);if(at>=target.start&&at<target.start+target.width)text+=ch;at+=w;}
      out.push({action:target.action,text});
    }
  }
  return out;
}

test('in the full layout each choice row is the target of its choice',()=>{
  const model=approvalDialogModel(pending,{expanded:false});
  const targets=targetsOf(approvalDialogLines(model,{columns:80}));
  assert.deepEqual(targets.map(x=>x.action),['aopt:0','aopt:1','aopt:2','aopt:3']);
  targets.forEach((x,i)=>assert.match(x.text,new RegExp(`\\[${APPROVAL_CHOICES[i]!.digit}\\] \\S`,'u'),`choice ${i}: «${x.text}»`));
});

test('in the compact layout each packed choice covers its own cells, and nothing else is a target',()=>{
  const model=approvalDialogModel(pending,{expanded:false});
  const view=approvalDialogViewport(model,{columns:60,rows:6});
  const targets=targetsOf(view.lines);
  assert.deepEqual(targets.map(x=>x.action),['aopt:0','aopt:1','aopt:2','aopt:3']);
  assert.ok(view.lines.some(line=>line.kind==='text'&&(line.targets?.length??0)>1),'at least two choices share a row');
  for(const [i,x] of targets.entries()){
    assert.match(x.text,new RegExp(`^\\S?\\[${APPROVAL_CHOICES[i]!.digit}\\] \\S`,'u'),`choice ${i} starts its own cells: «${x.text}»`);
    assert.doesNotMatch(x.text,/  \S/u,`choice ${i} does not run into the next item: «${x.text}»`);
  }
});

test('a click on a choice answers it, as its digit does; anything else is not a choice',()=>{
  assert.equal(approvalClickChoice('aopt:0',APPROVAL_CHOICES),'allow-once');
  assert.equal(approvalClickChoice('aopt:1',APPROVAL_CHOICES),'allow-session');
  assert.equal(approvalClickChoice('aopt:3',APPROVAL_CHOICES),'deny-once');
  const network=approvalChoicesFor({tool:'Read',sensitive:'network',network:{scope:'once'}} as any);
  assert.equal(approvalClickChoice('aopt:1',network),'deny-once','a network path has two choices, numbered as shown');
  assert.equal(approvalClickChoice('aopt:2',network),null);
  assert.equal(approvalClickChoice('aopt:4',APPROVAL_CHOICES),null);
  assert.equal(approvalClickChoice('opt:0',APPROVAL_CHOICES),null);
});

/* g-q22 (02/10): the s48 click on «Allow once» did nothing — the dialog is drawn through approvalDialogFit, which wraps the
   fixed rows again (wrappedFixed) and dropped their targets. The fit is what the screen shows, so it is what is tested. */
test('the fit the screen draws keeps the targets, roomy or tight, and a choice wrapped on two rows is a target on both',()=>{
  const model=approvalDialogModel(pending,{expanded:false});
  for(const [columns,maxRows] of [[110,30],[80,14],[60,8]] as const){
    const fit=approvalDialogFit(model,{columns,maxRows});
    assert.deepEqual([...new Set(targetsOf(fit.lines).map(x=>x.action))],['aopt:0','aopt:1','aopt:2','aopt:3'],`${columns}×${maxRows}`);
  }
  const narrow=approvalDialogFit(model,{columns:16,maxRows:40});
  const wrapped=targetsOf(narrow.lines).filter(x=>x.action==='aopt:1');
  assert.ok(wrapped.length>=2,`«Allow for this session» wraps at 16 columns and both rows answer it: ${JSON.stringify(wrapped)}`);
});

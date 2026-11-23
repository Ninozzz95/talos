import assert from 'node:assert/strict';
/* R2 lane T (Q-R2-3): the dialog's title and summary name the tool by its on-screen label, so the shell is "Shell"
   ("Permission: Shell", "Shell · npm test"); rule text keeps its `Bash(…)` grammar. Assertions realigned, none removed. */
import test from 'node:test';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

function visualHeight(lines:any[]){return lines.reduce((total,line)=>total+(line.kind==='row'?Math.max(1,line.commandLines.length,line.deciderLines.length):1),0);}
function texts(lines:any[]){return lines.flatMap(line=>line.kind==='row'?[line.gutter,...line.commandLines,...line.deciderLines]:[line.text]);}

test('short approval viewport always retains title, operation/reason and deny path',async()=>{
  const dialog:any=await import('../../src/tui/overlays/approval-dialog.ts');
  assert.equal(typeof dialog.approvalDialogViewport,'function','approval dialog needs a bounded viewport');
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:{tool:'Bash',command:'npm test'},rawPayload:{command:'npm test',detail:'x'.repeat(600)},reason:'no rule matched'};
  const model=dialog.approvalDialogModel(pending,{expanded:false});
  const view=dialog.approvalDialogViewport(model,{columns:48,rows:6,scrollOffset:0});
  const visible=texts(view.lines).join('\n');
  assert.ok(visualHeight(view.lines)<=6,'viewport exceeded terminal budget: '+visualHeight(view.lines));
  assert.match(visible,/Permission: Shell/u);
  assert.match(visible,/no rule allows or blocks/u);/* UI Phase 0 D17: the engine's `no rule matched`, in words */
  assert.match(visible,/Shell · npm test/u);
  assert.match(visible,/Esc deny/u);// R3 E11: "Esc deny and stop" (Q-R3-14)
});

test('expanded approval review is bounded, scrollable, and can reveal the complete tail without moving the decision chrome',async()=>{
  const dialog:any=await import('../../src/tui/overlays/approval-dialog.ts');
  assert.equal(typeof dialog.approvalDialogViewport,'function');
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:{tool:'Bash',command:'npm publish'},rawPayload:{lines:Array.from({length:30},(_,i)=>'payload-'+i),tail:'TAIL_MARKER'},reason:'no rule matched'};
  const model=dialog.approvalDialogModel(pending,{expanded:true});
  const first=dialog.approvalDialogViewport(model,{columns:52,rows:9,scrollOffset:0});
  assert.ok(first.maxOffset>0,'long full review must have a scroll range');
  assert.ok(visualHeight(first.lines)<=9);
  const last=dialog.approvalDialogViewport(model,{columns:52,rows:9,scrollOffset:Number.MAX_SAFE_INTEGER});
  assert.equal(last.offset,last.maxOffset,'scroll offset is clamped to the final page');
  assert.ok(visualHeight(last.lines)<=9);
  for(const view of [first,last]){
    const visible=texts(view.lines).join('\n');
    assert.match(visible,/Permission: Shell/u);
    assert.match(visible,/Shell · npm publish/u);
    /* R3 Q-R3-5: in the full review Esc goes back, so the deny path there is the Deny choice itself. */
    assert.match(visible,/\[4\] Deny/u);
  }
  assert.notDeepEqual(texts(first.lines),texts(last.lines),'scrolling changes only the review body');
  assert.match(texts(last.lines).join('\n'),/TAIL_MARKER/u,'the last viewport reaches the end of the full payload');
  assert.match(texts(last.lines).join('\n'),/PgUp\/PgDn/u,'expanded review advertises its scroll controls');
});

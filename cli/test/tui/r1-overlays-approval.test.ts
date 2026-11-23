/*
 * R1 lane O (Q-R1-3, gate E3): the approval dialog honours the `maxRows` budget lane L computes. Its choices are
 * always on screen; the command preview is cut with an explicit "… N more lines" marker instead of pushing the
 * dialog past the screen (review D-02: an overlay taller than the screen prints its last lines over its own border).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const React=(await import('react')).default;
const Ink:any=await import('ink');
const h=React.createElement as any;
const dialog:any=await import('../../src/tui/overlays/approval-dialog.ts');

/* Copied from cli/test/acceptance/checks.ts (brokenBorders, R0) — lane I owns that file. */
function brokenBorders(lines:readonly string[]):string[]{
  return lines.map(line=>line.trimEnd()).filter(line=>
    (/^[┌└╭╰]/u.test(line)&&!/^[┌└╭╰][─━═][^]*[┐┘╮╯]$/u.test(line))||
    (/[┐┘╮╯]$/u.test(line)&&!/^[┌└╭╰]/u.test(line)));
}
function screen(element:unknown,columns:number):string[]{
  const lines=(Ink.renderToString(element,{columns}) as string).split('\n');
  while(lines.length&&lines.at(-1)!.trim()==='')lines.pop();
  return lines;
}

const longCommand=Array.from({length:40},(_,i)=>`echo step-${i}`).join(' && ');
const PENDING:Record<string,PendingTuiApproval>={
  short:{requestId:'r',sessionId:'s',action:{tool:'Bash',command:'npm test'},rawPayload:{command:'npm test'},reason:'no rule matched'},
  long:{requestId:'r',sessionId:'s',action:{tool:'Bash',command:longCommand},rawPayload:{command:longCommand},reason:'no rule matched '.repeat(12)},
  payload:{requestId:'r',sessionId:'s',action:{tool:'Bash',command:'npm publish'},rawPayload:{lines:Array.from({length:30},(_,i)=>'payload-'+i),tail:'TAIL_MARKER'},reason:'no rule matched'},
};

test('Q-R1-3: the approval dialog stays inside maxRows, keeps every choice visible, and says how much of the preview it cut',()=>{
  const failures:string[]=[];
  for(const [name,pending] of Object.entries(PENDING))for(const expanded of [false,true])for(const columns of [60,100])for(const maxRows of [4,6,8,12,30]){
    const where=`${name}${expanded?' (full review)':''} at maxRows ${maxRows}, ${columns} columns`;
    const model=dialog.approvalDialogModel(pending,{expanded});
    const lines=screen(dialog.renderApprovalDialog(h,Ink,model,{columns,maxRows,scrollOffset:0}),columns);
    const shown=lines.join('\n');
    const check=(ok:boolean,message:string)=>{if(!ok)failures.push(`${where}: ${message}\n${shown}`);};
    check(lines.length<=maxRows,`${lines.length} rows rendered, budget ${maxRows}`);
    check(lines.every(line=>displayWidth(line)<=columns),'a row is wider than the screen');
    check(brokenBorders(lines).length===0,'rows mix a border with content');
    /* R3 E11 (Q-R3-5/6/14): four choices, Deny highlighted; "deny always" and "Esc back" in the full review, "Esc deny and
       stop" in the summary. The property is unchanged: every choice and the deny path are on screen at every height. */
    check(/\[1\] Allow once/u.test(shown)&&/\[4\] Deny/u.test(shown),'the choices are not all visible');
    check((expanded?/\[5\] [Dd]eny always/u:/Esc deny and stop/u).test(shown),'the deny path is not visible');
    if(maxRows>=6){
      check(/\[2\] Allow for this session/u.test(shown)&&/\[3\] Always allow/u.test(shown),'the allow choices are not visible');
      check(/^╭/u.test(lines[0]??'')&&/^╰/u.test(lines.at(-1)??''),'the dialog does not open and close with its border');
    }
    const whole=dialog.approvalDialogFit(model,{columns,scrollOffset:0});
    const fit=dialog.approvalDialogFit(model,{columns,maxRows,scrollOffset:0});
    if(fit.below>0)check(new RegExp(`… ${fit.below} more lines?`,'u').test(shown),'the preview is cut without an explicit "… N more lines" marker');
    /* R3 E11: a dialog too tall for its budget first packs its choices on fewer rows (`compact`, nothing dropped); only a
       body that still does not fit is cut, and then the marker above says so. */
    if(maxRows>=8&&whole.rows>maxRows-2&&!fit.compact)check(fit.below>0||fit.offset>0,'the dialog is too tall and nothing says it was cut');
    if(fit.compact&&fit.below===0&&fit.offset===0)check(fit.rows-whole.rows<=0,'packed choices must not make the dialog taller');
  }
  assert.deepEqual(failures,[],failures.join('\n\n'));
});

test('Q-R1-3: the full review scrolls inside maxRows to the end of the payload, the choices never moving',()=>{
  const model=dialog.approvalDialogModel(PENDING.payload!,{expanded:true});
  const first=dialog.approvalDialogFit(model,{columns:60,maxRows:12,scrollOffset:0});
  const last=dialog.approvalDialogFit(model,{columns:60,maxRows:12,scrollOffset:Number.MAX_SAFE_INTEGER});
  assert.ok(first.maxOffset>0);
  assert.equal(last.offset,last.maxOffset,'the offset is clamped to the last page');
  const lastScreen=screen(dialog.renderApprovalDialog(h,Ink,model,{columns:60,maxRows:12,scrollOffset:Number.MAX_SAFE_INTEGER}),60).join('\n');
  assert.match(lastScreen,/TAIL_MARKER/u,'the last page reaches the end of the payload');
  assert.match(lastScreen,/\[1\] Allow once/u);// R3 E11 words
  assert.equal(last.below,0,'nothing is left below the last page');
});

test('Q-R1-3: a dialog that fits is rendered whole, with no marker, and legacy callers without maxRows are unchanged',()=>{
  const model=dialog.approvalDialogModel(PENDING.short!,{expanded:false});
  const lines=screen(dialog.renderApprovalDialog(h,Ink,model,{columns:100,maxRows:30}),100);
  assert.doesNotMatch(lines.join('\n'),/… \d+ more/u);
  assert.match(lines.join('\n'),/Permission: Shell/u);// R2 lane T (Q-R2-3): the shell is shown as "Shell"; rules keep `Bash(…)`.
  const legacy=screen(dialog.renderApprovalDialog(h,Ink,model,{columns:100}),100);
  assert.deepEqual(legacy,screen(dialog.renderApprovalDialog(h,Ink,model,{columns:100,rows:undefined}),100));
});

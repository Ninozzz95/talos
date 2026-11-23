/* The owner's decision of 02/11: the research card has the question to change, Start and Cancel. The change is an optional field of the
   answer (`domandaModificata`): without it the question goes as the model wrote it, and the kernel checks it either way. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor,approvalKeyOutcome,researchEditRows,researchEditStep} from '../../src/tui/overlays/approval-dialog.ts';

const research={tool:'TalosService',operation:'research_start'} as any;

test('the card offers Start, Cancel and the change of the question; another card does not',()=>{
  const rows=approvalChoicesFor(research);
  assert.deepEqual(rows.map(row=>row.action),['approval-once','approval-deny-once','approval-edit']);
  assert.ok(!approvalChoicesFor({tool:'TalosService',operation:'chatgpt_account'} as any).some(row=>row.action==='approval-edit'));
  assert.equal(approvalKeyOutcome('approval-confirm',{expanded:false,selected:2,escape:false,choices:rows}).kind,'edit');
  assert.equal((approvalKeyOutcome('approval-confirm',{expanded:false,selected:1,escape:false,choices:rows}) as any).choice,'deny-once');
});

test('the field: letters go in, backspace takes the last, Enter starts, Esc goes back without changing anything',()=>{
  assert.deepEqual(researchEditStep('ab','c',{}),{kind:'text',text:'abc'});
  assert.deepEqual(researchEditStep('abc','',{backspace:true}),{kind:'text',text:'ab'});
  assert.deepEqual(researchEditStep('abc','',{delete:true}),{kind:'text',text:'ab'});
  assert.deepEqual(researchEditStep(' abc ','',{return:true}),{kind:'start',text:'abc'});
  assert.deepEqual(researchEditStep('abc','',{escape:true}),{kind:'back'});
  assert.deepEqual(researchEditStep('ab','\u001b[31m',{}),{kind:'text',text:'ab'},'a control sequence is not text');
  assert.deepEqual(researchEditStep('   ','',{return:true}),{kind:'text',text:'   '},'an empty question starts nothing');
  assert.deepEqual(researchEditStep('😀','',{backspace:true}),{kind:'text',text:''},'a whole character, never half of one');
});

test('the field wraps to the card and never reaches past its width',()=>{
  const rows=researchEditRows('x'.repeat(200),40);
  assert.ok(rows.length>=5);
  for(const row of rows)assert.ok(row.map(segment=>segment.text).join('').length<=40);
  assert.match(rows.at(-1)!.map(segment=>segment.text).join(''),/enter start/u);
});

test('the question reaches the kernel in the answer, and a yes without a change sends nothing more',async()=>{
  const answers:any[]=[];
  const engine=createPermissionEngine({projectRoot:'/p',rules:{allow:[],ask:[],deny:[]},mode:'default'} as any);
  const coordinator=createApprovalCoordinator({engine,interactive:true,mode:'default',answer:async(...args:any[])=>{answers.push(args);}} as any);
  await coordinator.request('s','r1',research);await coordinator.request('s','r2',research);
  await (coordinator as any).resolve('r1','allow-once',{domandaModificata:'better question'});
  await coordinator.resolve('r2','allow-once');
  assert.deepEqual(answers[0],['s','r1',true,{domandaModificata:'better question'}]);
  assert.equal(answers[1].length,3);
});

test('the card carries the question alone, to start the field from',()=>{
  const action=permissionActionFromApproval({azione:{tipo:'research_start',question:'What is X?',frase:'Quick · about $0.05'}} as any);
  assert.equal((action as any).question,'What is X?');
});

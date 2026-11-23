/* Owner's decision 41 (02/11) and the CLI's own finding of 03/11: the card of a command that would run as root in WSL is the person's.
   No rule, grant or mode says yes for it; with nobody to ask it is refused. Decision 157 (owner 04/11/2026): Full access is the
   exception, as Claude Code's bypassPermissions (full-access-155-04-11.test.ts). «Allow once» is a yes the kernel does not remember
   (`ambito: 'volta'`); «Allow for this chat» is the plain yes the kernel keeps for the chat. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const kernelCard={azione:{tipo:'shell',toolCallId:'t1',comando:'wsl -u root apt-get install x',wslRoot:{distro:'Ubuntu',utente:'root',sceltoDalComando:true}}};
const action=()=>permissionActionFromApproval(kernelCard as any);
const engine=(rules:any={allow:[],ask:[],deny:[]})=>createPermissionEngine({projectRoot:ROOT,rules,mode:'default'} as any);

test('the card carries the root mark from the kernel, in its names and in the v2 ones',()=>{
  assert.deepEqual((action() as any).wslRoot,{distro:'Ubuntu',user:'root'});
  assert.deepEqual((permissionActionFromApproval({action:{tool:'shell',command:'id',wslRoot:{distro:'Debian',user:'root'}}} as any) as any).wslRoot,{distro:'Debian',user:'root'});
  assert.equal((permissionActionFromApproval({azione:{tipo:'shell',comando:'ls'}} as any) as any).wslRoot,undefined);
});

test('no rule, mode but Full access or grant answers it; a deny rule still refuses; with nobody to ask it is refused',async()=>{
  const allowed=engine({allow:['Bash(wsl:*)','Bash(*)'],ask:[],deny:[]});
  for(const mode of ['default','acceptEdits'])assert.equal((await allowed.decide(action(),{interactive:true,mode} as any)).kind,'ask',mode);
  assert.equal((await engine({allow:[],ask:[],deny:['Bash(wsl:*)']}).decide(action(),{interactive:true,mode:'default'} as any)).kind,'deny');
  const nobody=await allowed.decide(action(),{interactive:false,mode:'default'} as any) as any;
  assert.equal(nobody.kind,'deny');assert.equal(nobody.code,'WSL_ROOT_NEEDS_PERSON');
  const e=engine();const asked:any=await e.decide(action(),{interactive:true,mode:'default'} as any);
  await e.resolve(asked.requestId,'allow-session');
  assert.equal((await e.decide(action(),{interactive:true,mode:'default'} as any)).kind,'ask','the engine keeps no grant: the kernel holds the chat\'s yes');
});

test('the card offers Allow once, Allow for this chat and Deny, Deny highlighted',()=>{
  const rows=approvalChoicesFor(action());
  assert.deepEqual(rows.map(row=>row.action),['approval-once','approval-session','approval-deny-once']);
  assert.equal(approvalKeyOutcome('approval-confirm',{expanded:false,selected:99,escape:false,choices:rows}).kind,'answer');
  assert.equal((approvalKeyOutcome('approval-always',{expanded:false,selected:0,escape:false,choices:rows}) as any).choice,'deny-once','3 is Deny here');
});

test('Allow once reaches the kernel as a yes it does not remember; the chat\'s yes is the plain one',async()=>{
  const answers:any[]=[];
  const coordinator=createApprovalCoordinator({engine:engine(),interactive:true,mode:'default',answer:async(...args:any[])=>{answers.push(args);}} as any);
  await coordinator.request('s','r1',action());await coordinator.request('s','r2',action());await coordinator.request('s','r3',action());
  await coordinator.resolve('r1','allow-once');await coordinator.resolve('r2','allow-session');await coordinator.resolve('r3','deny-once');
  assert.deepEqual(answers[0],['s','r1',true,{ambito:'volta'}]);
  assert.deepEqual(answers[1],['s','r2',true]);
  assert.deepEqual(answers[2],['s','r3',false]);
});

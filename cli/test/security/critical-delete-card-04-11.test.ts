/*
 * Owner's decision 155 (04/11/2026): in Full access, as Claude Code's bypassPermissions («Permission modes»: rm on critical paths
 * always prompts), deleting the root of a disk, a top-level folder, the user folder, the project folder or one of its parents is
 * asked to the person, every time: no allow rule, no «for this session» and no mode answers it; a deny rule still refuses; with
 * nobody in front it is refused. The kernel marks that card with `azione.cancellazioneCritica = {percorso, perche, frase,…}`
 * (harness-ui kernel/cancellazioni-critiche.mjs, desktop 14fcda773). Before this test the CLI read the card as a plain shell
 * command, and Full access said yes to it.
 * Source: Hermes tools/approval.py:1051-1072 (`_floor_block` before yolo); Claude Code docs «Permission modes».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const SENTENCE=`The command deletes ${ROOT}, the project folder.`;
const critical=()=>permissionActionFromApproval({azione:{tipo:'shell',toolCallId:'c',comando:`rm -rf ${ROOT}`,cancellazioneCritica:{percorso:ROOT,perche:'progetto',frase:SENTENCE,fraseChiave:'server.approval.criticalDelete.project',fraseParams:{percorso:ROOT}}}} as any);
const engine=(rules:any={allow:[],ask:[],deny:[]},mode='bypassPermissions')=>createPermissionEngine({projectRoot:ROOT,rules,mode} as any);

test('the kernel\'s critical deletion mark reaches the action, with the path, the why and the sentence',()=>{
  assert.deepEqual((critical() as any).criticalDelete,{path:ROOT,why:'progetto',sentence:SENTENCE});
  assert.equal((permissionActionFromApproval({azione:{tipo:'shell',comando:'rm -rf build'}} as any) as any).criticalDelete,undefined);
});

test('Full access asks a critical deletion, with the kernel\'s sentence; an allow rule and a session grant do not answer it',async()=>{
  const allowed=engine({allow:['Bash(*)','Bash(rm:*)'],ask:[],deny:[]});
  const asked:any=await allowed.decide(critical(),{interactive:true,mode:'bypassPermissions'} as any);
  assert.equal(asked.kind,'ask',JSON.stringify(asked));
  assert.equal(asked.reason,SENTENCE);
  await allowed.resolve(asked.requestId,'allow-session');
  assert.equal((await allowed.decide(critical(),{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask','a «for this session» is not kept');
  const plainSame=permissionActionFromApproval({azione:{tipo:'shell',comando:`rm -rf ${ROOT}`}} as any);
  const inDefault=engine({allow:[],ask:[],deny:[]},'default');const once:any=await inDefault.decide(critical(),{interactive:true,mode:'default'} as any);
  await inDefault.resolve(once.requestId,'allow-session');
  assert.equal((await inDefault.decide(plainSame,{interactive:true,mode:'default'} as any)).kind,'ask','the «for this session» of a critical card is not kept for the same command');
  for(const mode of ['default','acceptEdits'])assert.equal((await engine({allow:['Bash(*)'],ask:[],deny:[]},mode).decide(critical(),{interactive:true,mode} as any)).kind,'ask',mode);
});

test('with nobody in front a critical deletion is refused, saying why; a deny rule refuses it first',async()=>{
  for(const [interactive,mode] of [[false,'bypassPermissions'],[true,'dontAsk'],[false,'default']] as const){
    const d:any=await engine({allow:['Bash(*)'],ask:[],deny:[]},mode).decide(critical(),{interactive,mode} as any);
    assert.equal(d.kind,'deny',`${mode} ${interactive}`);assert.equal(d.code,'CRITICAL_DELETE_NEEDS_PERSON');
    assert.match(d.message,/project folder/u);
  }
  assert.equal((await engine({allow:[],ask:[],deny:['Bash(rm:*)']}).decide(critical(),{interactive:true,mode:'bypassPermissions'} as any)).kind,'deny');
});

test('an «always» that reaches a critical card (a remote answer, an old client) writes no rule',async()=>{
  const persisted:any[]=[];
  const e=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},mode:'default',persistRule:async(effect:any,action:any)=>{persisted.push([effect,action]);}} as any);
  const asked:any=await e.decide(critical(),{interactive:true,mode:'default'} as any);
  await e.resolve(asked.requestId,'allow-always');
  assert.deepEqual(persisted,[],'no allow rule for rm of the project folder');
});

test('the card offers only once and deny, Deny highlighted; a plain rm in Full access is unchanged',async()=>{
  assert.deepEqual(approvalChoicesFor(critical()).map(row=>row.action),['approval-once','approval-deny-once']);
  const plain=permissionActionFromApproval({azione:{tipo:'shell',comando:'rm -rf build'}} as any);
  assert.equal((await engine().decide(plain,{interactive:false,mode:'bypassPermissions'} as any)).kind,'allow');
});

/* Cure 208 (Desktop, fix/cura-208-2026-11-04): the kernel now marks `rm -rf .`, `..`, the whole path or a folder above in EVERY
   mode of its gate, not only for the host in Full access. The CLI's branch does not read the mode: outside Full access too, an
   allow rule such as Bash(rm:*) does not answer it, a mode that never asks refuses it, and plan mode refuses it. */
test('208: outside Full access a marked critical deletion still asks, whatever the allow rules say',async()=>{
  for(const mode of ['default','acceptEdits'] as const){
    const e=engine({allow:['Bash(*)','Bash(rm:*)'],ask:[],deny:[]},mode);
    const asked:any=await e.decide(critical(),{interactive:true,mode} as any);
    assert.equal(asked.kind,'ask',`${mode}: ${JSON.stringify(asked)}`);
    assert.equal(asked.reason,SENTENCE,mode);
  }
  const never:any=await engine({allow:['Bash(rm:*)'],ask:[],deny:[]},'dontAsk').decide(critical(),{interactive:true,mode:'dontAsk'} as any);
  assert.equal(never.kind,'deny');assert.equal(never.code,'CRITICAL_DELETE_NEEDS_PERSON');
  assert.equal((await engine({allow:['Bash(rm:*)'],ask:[],deny:[]},'plan').decide(critical(),{interactive:true,mode:'plan'} as any)).kind,'deny');
});

/* ALTO-CLI (Desktop's review 3 of the permissions block, 04/11/2026): in Full access a critical card whose command TALOS cannot
   split — a subshell, `$(…)`, a backtick or a redirection — was ALLOWED: the lift of the «unsupported shell composition» refusal
   ran before the critical deletion was read. The card asks there too; with nobody in front it is refused; a Bash deny rule still
   refuses. A command TALOS cannot split that deletes nothing critical keeps the Full access lift. */
const BT=String.fromCharCode(96);
const criticalCommand=(comando:string)=>permissionActionFromApproval({azione:{tipo:'shell',toolCallId:'c',comando,cancellazioneCritica:{percorso:ROOT,perche:'progetto',frase:SENTENCE,fraseChiave:'server.approval.criticalDelete.project',fraseParams:{percorso:ROOT}}}} as any);
const UNSPLIT=['(rm -rf ..)','rm -rf "$(pwd)"','rm -rf .. > out.txt','(cd .. && rm -rf project)',`rm -rf ${BT}pwd${BT}`];
test('ALTO-CLI: in Full access a critical card TALOS cannot split still asks, never a silent yes',async()=>{
  for(const command of UNSPLIT){
    const asked:any=await engine({allow:['Bash(*)'],ask:[],deny:[]}).decide(criticalCommand(command),{interactive:true,mode:'bypassPermissions'} as any);
    assert.equal(asked.kind,'ask',`${command}: ${JSON.stringify(asked)}`);
    assert.equal(asked.reason,SENTENCE,command);
    const alone:any=await engine().decide(criticalCommand(command),{interactive:false,mode:'bypassPermissions'} as any);
    assert.equal(alone.kind,'deny',command);assert.equal(alone.code,'CRITICAL_DELETE_NEEDS_PERSON',command);
    assert.equal((await engine({allow:[],ask:[],deny:['Bash(rm:*)']}).decide(criticalCommand(command),{interactive:true,mode:'bypassPermissions'} as any)).kind,'deny',command);
  }
});
test('on the contrary: a command TALOS cannot split that deletes nothing critical keeps the Full access lift',async()=>{
  const plain=permissionActionFromApproval({azione:{tipo:'shell',comando:'(cd build && ls) > out.txt'}} as any);
  assert.equal((await engine().decide(plain,{interactive:false,mode:'bypassPermissions'} as any)).kind,'allow');
});
/* Owner's decision (05/11/2026, «Chiedi con la frase»): outside Full access too, a critical card TALOS cannot split asks with the
   kernel's sentence, as the kernel does, instead of the plain «unsupported shell composition» refusal; a mode that never asks
   refuses it saying why; plan mode refuses it. Any other command TALOS cannot split is still refused outside Full access. */
test('decision of 05/11: in Normal and accept-edits a critical card TALOS cannot split asks with the sentence',async()=>{
  for(const command of UNSPLIT)for(const mode of ['default','acceptEdits'] as const){
    const asked:any=await engine({allow:['Bash(*)'],ask:[],deny:[]},mode).decide(criticalCommand(command),{interactive:true,mode} as any);
    assert.equal(asked.kind,'ask',`${mode} ${command}: ${JSON.stringify(asked)}`);
    assert.equal(asked.reason,SENTENCE,`${mode} ${command}`);
    const never:any=await engine({allow:['Bash(*)'],ask:[],deny:[]},'dontAsk').decide(criticalCommand(command),{interactive:true,mode:'dontAsk'} as any);
    assert.equal(never.code,'CRITICAL_DELETE_NEEDS_PERSON',command);
    assert.equal((await engine({allow:[],ask:[],deny:[]},'plan').decide(criticalCommand(command),{interactive:true,mode:'plan'} as any)).kind,'deny',command);
  }
  const plain=permissionActionFromApproval({azione:{tipo:'shell',comando:'(cd build && ls) > out.txt'}} as any);
  const refused:any=await engine({allow:['Bash(*)'],ask:[],deny:[]},'default').decide(plain,{interactive:true,mode:'default'} as any);
  assert.equal(refused.kind,'deny');assert.equal(refused.code,'PERMISSION_DENIED');
});

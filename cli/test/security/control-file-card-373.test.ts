/*
 * Decision 373 (owner 07/11/2026, «Come Hermes»): outside Full access, a model's shell command that names one of the two computer use
 * settings files (.computer-use-impostazione.json, .computer-use-luoghi.json) asks the person; the W1-13 gate does the same for a write
 * to a TALOS control file (hook, MCP, instructions, memory), in Full access too. The kernel marks both cards with
 * `azione.fileDiControllo = true` and `sempreNonBasta = true` (harness-ui session-registry.mjs `cancelloShellDelComputerUse` and the
 * per-path gate), and it turns a yes that says it came from a rule, the mode or the classifier into a no (`MOTIVI_DEL_SI_SENZA_PERSONA`).
 * Before this test the CLI read neither field: an allow rule, a «for this session», accept-edits or Full access answered the card
 * by itself, the kernel turned that yes into a no and the person was never asked; and the card offered «session» and «always».
 * Sources: Hermes tools/approval_detection.py:24-25 (the config file IS the security policy, terminal-side coverage), Codex
 * codex-rs/protocol/src/approvals.rs:365-376 (the client offers the decisions the sender allows), Claude Code docs «Permission
 * modes» (code.claude.com, read 19/11/2026: deny rules block in every mode; the CLI follows the kernel, which sends this card only
 * when the person must answer it).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {approvalChoicesFor,approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {t} from '../../src/i18n/index.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const COMMAND='type .computer-use-luoghi.json';
const SHELL_CARD={tipo:'shell',comando:COMMAND,fileDiControllo:true,sempreNonBasta:true};
const WRITE_CARD={tipo:'scrivi',toolCallId:'c2',percorso:'.harness-ui-hooks.json',fileDiControllo:true,sempreNonBasta:true};
const shell=()=>permissionActionFromApproval({azione:{...SHELL_CARD}} as any);
const write=()=>permissionActionFromApproval({azione:{...WRITE_CARD}} as any);
const engine=(rules:any={allow:[],ask:[],deny:[]},mode='default',persistRule?:any)=>createPermissionEngine({projectRoot:ROOT,rules,mode,...(persistRule?{persistRule}:{})} as any);
const ALLOW_ALL={allow:['Bash(*)','Write(*)','Edit(*)'],ask:[],deny:[]};
const SHELL_WHY='This command names a TALOS computer use settings file (.computer-use-impostazione.json or .computer-use-luoghi.json): only the person can allow it, once.';
const WRITE_WHY='It wants to write a TALOS control file: an agent rule (hook, MCP, instructions, memory), not a project file. Only the person can allow it, once.';

test('the kernel\'s mark reaches the action, in its name and in the v2 one; a plain card carries none',()=>{
  assert.equal(shell().controlFile,true);assert.equal(write().controlFile,true);
  assert.equal(permissionActionFromApproval({action:{tool:'shell',command:COMMAND,controlFile:true}} as any).controlFile,true);
  assert.equal(permissionActionFromApproval({azione:{tipo:'shell',comando:COMMAND}} as any).controlFile,undefined);
  assert.equal(permissionActionFromApproval({azione:{tipo:'shell',comando:COMMAND,fileDiControllo:'true'}} as any).controlFile,undefined,'only a real true');
});

test('the v2 action names it in English, and the TUI reads it the same from both',()=>{
  const v2=createV2EventBridge('s-1',()=>'2026-11-19T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione:{...SHELL_CARD}} as any)?.data as any;
  assert.equal(v2.action.controlFile,true);assert.equal(Object.hasOwn(v2.action,'fileDiControllo'),false);
  assert.equal(permissionActionFromApproval(v2).controlFile,true);
});

test('every mode asks the person, with the reason; an allow rule, accept-edits and Full access do not answer it',async()=>{
  for(const mode of ['default','acceptEdits','bypassPermissions'] as const){
    const s:any=await engine(ALLOW_ALL,mode).decide(shell(),{interactive:true,mode} as any);
    assert.equal(s.kind,'ask',`${mode} shell: ${JSON.stringify(s)}`);assert.equal(s.reason,SHELL_WHY,mode);
    const w:any=await engine(ALLOW_ALL,mode).decide(write(),{interactive:true,mode} as any);
    assert.equal(w.kind,'ask',`${mode} write: ${JSON.stringify(w)}`);assert.equal(w.reason,WRITE_WHY,mode);
  }
});

test('a «for this session» or an «always» that reaches the card keeps nothing: the next card asks again, no rule is written',async()=>{
  const persisted:any[]=[];
  const e=engine({allow:[],ask:[],deny:[]},'default',async(effect:any,action:any)=>{persisted.push([effect,action]);});
  const first:any=await e.decide(shell(),{interactive:true,mode:'default'} as any);
  await e.resolve(first.requestId,'allow-session');
  assert.equal((await e.decide(shell(),{interactive:true,mode:'default'} as any)).kind,'ask','a session grant is not kept');
  const second:any=await e.decide(write(),{interactive:true,mode:'default'} as any);
  await e.resolve(second.requestId,'allow-always');
  const third:any=await e.decide(write(),{interactive:true,mode:'default'} as any);
  await e.resolve(third.requestId,'deny-always');
  assert.deepEqual(persisted,[],'no rule for a control file');
  assert.equal((await e.decide(write(),{interactive:true,mode:'default'} as any)).kind,'ask');
  /* a «for this session» the person gave to an ordinary command does not open the control file's card either */
  const ordinary=engine({allow:[],ask:[],deny:[]},'default');
  const asked:any=await ordinary.decide(permissionActionFromApproval({azione:{tipo:'shell',comando:'npm test'}} as any),{interactive:true,mode:'default'} as any);
  await ordinary.resolve(asked.requestId,'allow-session');
  assert.equal((await ordinary.decide(permissionActionFromApproval({azione:{tipo:'shell',comando:'npm test'}} as any),{interactive:true,mode:'default'} as any)).kind,'allow','the ordinary grant holds');
  assert.equal((await ordinary.decide(shell(),{interactive:true,mode:'default'} as any)).kind,'ask','with a grant in the session the card still asks');
  assert.equal((await ordinary.decide(write(),{interactive:true,mode:'default'} as any)).kind,'ask');
});

test('with nobody in front it is refused saying why; a deny rule refuses first; plan mode refuses the write',async()=>{
  for(const [interactive,mode] of [[false,'bypassPermissions'],[true,'dontAsk'],[false,'default'],[false,'acceptEdits']] as const){
    const d:any=await engine(ALLOW_ALL,mode).decide(shell(),{interactive,mode} as any);
    assert.equal(d.kind,'deny',`${mode} ${interactive}`);assert.equal(d.code,'CONTROL_FILE_NEEDS_PERSON');assert.match(d.message,/computer use settings file/u);
    const w:any=await engine(ALLOW_ALL,mode).decide(write(),{interactive,mode} as any);
    assert.equal(w.code,'CONTROL_FILE_NEEDS_PERSON',`${mode} ${interactive}`);assert.match(w.message,/control file/u);
  }
  assert.equal((await engine({allow:[],ask:[],deny:['Bash(type:*)']},'bypassPermissions').decide(shell(),{interactive:true,mode:'bypassPermissions'} as any)).kind,'deny');
  const plan:any=await engine(ALLOW_ALL,'plan').decide(write(),{interactive:true,mode:'plan'} as any);
  assert.equal(plan.code,'PLAN_MODE_READ_ONLY');
  assert.ok(t('error.code.CONTROL_FILE_NEEDS_PERSON.what').length>20);assert.ok(t('error.code.CONTROL_FILE_NEEDS_PERSON.todo').length>20);
});

test('in Full access a marked command TALOS cannot split asks, never a silent yes; outside it the refusal stays',async()=>{
  const unsplit=permissionActionFromApproval({azione:{...SHELL_CARD,comando:'type .computer-use-luoghi.json > out.txt'}} as any);
  assert.equal((await engine(ALLOW_ALL,'bypassPermissions').decide(unsplit,{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask');
  const refused:any=await engine(ALLOW_ALL,'default').decide(unsplit,{interactive:true,mode:'default'} as any);
  assert.equal(refused.kind,'deny');assert.equal(refused.code,'PERMISSION_DENIED');
});

test('the card offers only once and deny, Deny highlighted, and the full review shows no «always» line nor the kernel key',async()=>{
  assert.deepEqual(approvalChoicesFor(shell()).map(row=>row.action),['approval-once','approval-deny-once']);
  assert.deepEqual(approvalChoicesFor(write()).map(row=>row.action),['approval-once','approval-deny-once']);
  const pending:any={requestId:'q1',sessionId:'s-1',action:write(),rawPayload:{...WRITE_CARD},reason:WRITE_WHY,alwaysSimulation:{writes:'Write(.harness-ui-hooks.json)',effect:'allow',decidedByNewRule:true,compound:false,changedSegments:[],wildcard:false}};
  const model=approvalDialogModel(pending,{expanded:true});
  assert.equal(model.selected,1);assert.equal(model.reason,WRITE_WHY);
  assert.equal(model.alwaysPreview,undefined,'no [3] always line on a card that has no [3]');
  assert.doesNotMatch(model.fullPayload,/fileDiControllo/u);
});

/* Decision 375 (owner 07/11/2026): the experience counts as much as the security. Twenty everyday cards the kernel sends without the
   mark are decided exactly as before (the same count is measured on f45c1dbed in the block's report): one card each, none added. */
const EVERYDAY:ReadonlyArray<Record<string,unknown>>=[
  {tipo:'shell',comando:'npm test'},{tipo:'shell',comando:'git status'},{tipo:'shell',comando:'git diff'},{tipo:'shell',comando:'ls -la'},
  {tipo:'shell',comando:'npm run build'},{tipo:'shell',comando:'node scripts/check.mjs'},{tipo:'shell',comando:'git add src/app.ts'},
  {tipo:'shell',comando:'git commit -m "fix"'},{tipo:'shell',comando:'npx tsc --noEmit'},{tipo:'shell',comando:'cat package.json'},
  {tipo:'shell',comando:'rg TODO src'},{tipo:'shell',comando:'python -m pytest'},{tipo:'shell',comando:'mkdir -p out'},
  {tipo:'shell',comando:'type .computer-use-luoghi.json.bak'},{tipo:'scrivi',percorso:'src/app.ts'},{tipo:'scrivi',percorso:'README.md'},
  {tipo:'file_edit',percorso:'src/util.ts'},{tipo:'leggi',percorso:'src/app.ts'},{tipo:'scrivi',percorso:'test/app.test.ts'},
  {tipo:'shell',comando:'curl https://example.com',rete:true},
];
/* measured on f45c1dbed (cli 0.6.16) with the same twenty cards: A = a card, . = allowed without one */
const BEFORE:Readonly<Record<string,string>>={'default/none':'A...AAAAA..AA.AAA.AA','default/allowAll':'...................A',
  'acceptEdits/none':'A...AAAAA..A.......A','acceptEdits/allowAll':'...................A','bypassPermissions/none':'....................','bypassPermissions/allowAll':'....................'};
test('twenty everyday cards without the mark: the same cards as 0.6.16, none added (decision 375)',async()=>{
  assert.equal(EVERYDAY.length,20);
  for(const mode of ['default','acceptEdits','bypassPermissions'] as const)for(const [name,rules] of [['none',{allow:[],ask:[],deny:[]}],['allowAll',ALLOW_ALL]] as const){
    let shape='';
    for(const azione of EVERYDAY){
      const action=permissionActionFromApproval({azione} as any);
      assert.equal(action.controlFile,undefined);
      const d:any=await engine(structuredClone(rules),mode).decide(action,{interactive:true,mode} as any);
      shape+=d.kind==='ask'?'A':d.kind==='allow'?'.':'x';
    }
    assert.equal(shape,BEFORE[`${mode}/${name}`],`${mode}/${name}`);
  }
});

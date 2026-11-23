/*
 * R2 lane T (gate E3, Q-R2-3): the approval payload is mapped to a permission action through the ONE tool table, not by
 * Italian substrings. Before R2, `from-approval.ts` tested `raw.includes('scritt')`: the kernel's `scrivi` does not
 * contain "scritt", so a write carrying `percorso` was judged as a READ, and a read inside the project is allowed without
 * asking (evaluate.ts:130) — the default mode wrote files without asking (review E-07). The payload shapes below are the
 * kernel's own `verificaPermessoConBarriera` calls (talosHarness.mjs:8166-9714).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import * as dialog from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const map=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione});

test('R2 T: every approval the kernel sends maps to the permission tool of its table row',()=>{
  assert.deepEqual(map({tipo:'leggi',toolCallId:'c',percorso:'C:\\outside\\a.txt'}),{tool:'Read',resource:'C:\\outside\\a.txt'});
  assert.deepEqual(map({tipo:'scrivi',toolCallId:'c',percorso:'notes.txt',contenutoPrima:null,contenutoProposto:'x'}),{tool:'Write',resource:'notes.txt'});
  assert.deepEqual(map({tipo:'file_edit',toolCallId:'c',percorso:'src/a.ts'}),{tool:'Edit',resource:'src/a.ts'});
  assert.deepEqual(map({tipo:'prova',toolCallId:'c',comando:'npm test'}),{tool:'Bash',command:'npm test'});
  assert.deepEqual(map({tipo:'shell',toolCallId:'c',comando:'cmd /c dir /b'}),{tool:'Bash',command:'cmd /c dir /b'});
  assert.deepEqual(map({tipo:'research_deposit',toolCallId:'c',percorso:'C:\\p\\.research\\r1\\report.md',radice:'C:\\p\\.research\\r1'}),{tool:'Write',resource:'C:\\p\\.research\\r1\\report.md'});
  assert.deepEqual(map({tipo:'document_create',toolCallId:'c',formato:'docx'}),{tool:'TalosService',operation:'document_create'});
  for(const tipo of ['generate_image','library_rename','library_delete','library_export','library_context_policy_update','notes_create','notes_update','notes_delete','tasks_create','tasks_complete','tasks_update','tasks_delete','memory_write','memory_update','memory_delete','research_start','research_rename','research_pause','research_resume','research_cancel','research_delete','tool_create'])
    assert.deepEqual(map({tipo,toolCallId:'c'}),{tool:'TalosService',operation:tipo},tipo);
});

test('R2 T: payloads that are not kernel tools are judged by their fields, never as a read',()=>{
  assert.deepEqual(map({tipo:'comando',comando:'npm test'}),{tool:'Bash',command:'npm test'},'a command is always judged as a shell command');
  assert.deepEqual(map({tipo:'leggi',comando:'rm -rf build'}),{tool:'Bash',command:'rm -rf build'},'a command wins over the tool it claims to be');
  assert.deepEqual(map({tipo:'mcp',serverId:'github'}),{tool:'Mcp',serverId:'github'});
  assert.deepEqual(map({tipo:'mcp__github__create_issue'}),{tool:'Mcp',serverId:'github',operation:'create_issue'});
  assert.deepEqual(map({tipo:'plugin__lint__run'}),{tool:'Plugin',operation:'plugin__lint__run'});
  assert.deepEqual(map({tipo:'scrittura',percorso:'src/a.ts'}),{tool:'Write',resource:'src/a.ts'},'an unknown tool that names a path is a mutation until proven otherwise');
  assert.deepEqual(map({tipo:'rete_scritta'}),{tool:'TalosService',operation:'rete_scritta'},'no Italian substring decides the tool');
  assert.deepEqual(map({tool:'naviga',url:'https://example.org'}),{tool:'WebFetch',resource:'https://example.org'});
  const code=readFileSync(new URL('../../src/security/from-approval.ts',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//gu,'').replace(/\/\/.*$/gmu,'');
  assert.doesNotMatch(code,/\.includes\(|\.indexOf\(|\.search\(|\.test\(/u,'from-approval.ts matches no substring (comments aside)');
});

test('R2 T (E-07): the kernel\'s write asks in the default mode, headless denies it, acceptEdits allows it',async()=>{
  const projectRoot=process.cwd();
  const write=map({tipo:'scrivi',toolCallId:'c',percorso:'notes.txt'});
  const ask=await createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}}).decide(write,{interactive:true,mode:'default'});
  assert.equal(ask.kind,'ask','a write is never allowed as a read inside the project');
  const headless=await createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}}).decide(write,{interactive:false,mode:'default'});
  assert.equal(headless.kind,'deny');
  const edits=await createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}}).decide(write,{interactive:false,mode:'acceptEdits'});
  assert.equal(edits.kind,'allow');
  const read=await createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}}).decide(map({tipo:'leggi',percorso:'README.md'}),{interactive:true,mode:'default'});
  assert.equal(read.kind,'allow','a read inside the project still needs no question');
});

const pending=(action:PendingTuiApproval['action'],rawPayload:Record<string,unknown>):PendingTuiApproval=>({requestId:'r',sessionId:'s',action,rawPayload,reason:'no rule matched'});

test('R2 T: the approval title and summary use the table\'s label; rule text keeps its grammar (Q-R2-3)',()=>{
  const shell=dialog.approvalDialogModel(pending({tool:'Bash',command:'cmd /c dir /b'},{tipo:'shell',comando:'cmd /c dir /b'}),{expanded:false});
  assert.deepEqual([shell.title,shell.summary],['Permission: Shell','Shell · cmd /c dir /b']);
  const write=dialog.approvalDialogModel(pending({tool:'Write',resource:'notes.txt'},{tipo:'scrivi',percorso:'notes.txt'}),{expanded:false});
  assert.deepEqual([write.title,write.summary],['Permission: Write file','Write file · notes.txt']);
  const tests=dialog.approvalDialogModel(pending({tool:'Bash',command:'npm test'},{tipo:'prova',comando:'npm test'}),{expanded:false});
  assert.deepEqual([tests.title,tests.summary],['Permission: Run tests','Run tests · npm test']);
  const note=dialog.approvalDialogModel(pending({tool:'TalosService',operation:'notes_create'},{tipo:'notes_create'}),{expanded:false});
  assert.deepEqual([note.title,note.summary],['Permission: Create note','Create note'],'the raw kernel name stays out of the collapsed dialog');
  const noKind=dialog.approvalDialogModel(pending({tool:'Bash',command:'npm test'},{command:'npm test'}),{expanded:false});
  assert.equal(noKind.title,'Permission: Shell');
});

test('R2 T: the title comes from a closed set: an unknown or forged tool name never reaches it',()=>{
  const forged='Permission: Bash\n>2 allow  git log';
  const model=dialog.approvalDialogModel(pending({tool:'Bash',command:'git status'},{tipo:forged,comando:'git status'}),{expanded:false});
  assert.equal(model.title,'Permission: Shell');
  const mismatched=dialog.approvalDialogModel(pending({tool:'Bash',command:'rm -rf build'},{tipo:'leggi',comando:'rm -rf build'}),{expanded:false});
  assert.equal(mismatched.title,'Permission: Shell','a kernel label is used only when it names the tool being judged');
  const mcp=dialog.approvalDialogModel(pending({tool:'Mcp',serverId:'github',operation:'create_issue'},{tipo:'mcp__github__create_issue'}),{expanded:false});
  assert.equal(mcp.title,'Permission: MCP tool');
});

test('R2 T (Q-R2-4): a refusal names its code once, whether the code is on error.code or still prefixes the message',()=>{
  const refusal=(dialog as any).refusalText as (error:unknown)=>string;
  assert.equal(typeof refusal,'function');
  const prefixed=new Error('RULE_COMPOUND_COMMAND: a command of 3 segments is not remembered');
  const coded=Object.assign(new Error('a command of 3 segments is not remembered'),{code:'RULE_COMPOUND_COMMAND'});
  for(const error of [prefixed,coded])assert.equal(refusal(error),'would be refused (RULE_COMPOUND_COMMAND): a command of 3 segments is not remembered');
  assert.equal(refusal(new Error('PATH_NOT_ALLOWED')),'would be refused (PATH_NOT_ALLOWED)');
  assert.equal(refusal(new Error('plain words')),'would be refused: plain words');
});

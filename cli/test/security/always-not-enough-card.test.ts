/*
 * A5f (owner's decision of 19/11/2026 09:33, «Sì, nella 0.7.0»): the kernel's `sempreNonBasta` («always» is not enough here) is read
 * by the terminal. The kernel puts it on the ordinary card of a write to a TALOS control file (session-registry.mjs
 * `cartaPerFileDiControllo`), on a child's or delegate's card when its chain would not keep an «always» (C2-a,
 * `sempreValeNellaCatena`), and on the card that starts an agent when Coordination would not keep it (C2b). Before this test the
 * terminal offered «for this session» and «always» there, kept the grant or wrote the rule, and the next card was answered by it
 * as `session`/`regola`, which the kernel accepts: a promise the PC does not make. Now those cards offer only Allow once and Deny,
 * nothing is kept from them, and no «for this session» answers them.
 * Sources: Hermes tools/approval.py:838-840 (a once-only card persists nothing, even when an older client answers «session» or
 * «always») and :848 (`allow_session`/`allow_permanent` go to the transport, so the card does not offer them); Codex
 * codex-rs/protocol/src/approvals.rs:365-376 (the client offers only the decisions the sender allows).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {approvalChoicesFor,approvalDefaultSelected,approvalDialogModel,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
/* the kernel's shapes: a child's command and write (C2-a), the ordinary write card of a control file, an agent start (C2b) */
const CHILD_SHELL={tipo:'shell',comando:'npm test',sempreNonBasta:true};
const CHILD_WRITE={tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',sempreNonBasta:true};
const CONTROL_WRITE={tipo:'file_edit',toolCallId:'c2',percorso:'AGENTS.md',sempreNonBasta:true};
const AGENT_START={tipo:'delega_sottotask',sempreNonBasta:true};
const MARKED=[CHILD_SHELL,CHILD_WRITE,CONTROL_WRITE,AGENT_START,{tipo:'prova',comando:'npm test',sempreNonBasta:true},{tipo:'document_create',sempreNonBasta:true},{tipo:'generate_image',sempreNonBasta:true}];
const act=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione:{...azione}} as any);
const engine=(rules:any={allow:[],ask:[],deny:[]},mode='default',persistRule?:any)=>createPermissionEngine({projectRoot:ROOT,rules,mode,...(persistRule?{persistRule}:{})} as any);
const ask={interactive:true,mode:'default'} as any;

test('A5f: the kernel\'s mark reaches the action on every card of a per-tool tool and on the agent start, in its name and the v2 one',()=>{
  for(const azione of MARKED)assert.equal(act(azione).alwaysNotEnough,true,String(azione.tipo));
  assert.equal(permissionActionFromApproval({action:{tool:'shell',command:'npm test',alwaysNotEnough:true}} as any).alwaysNotEnough,true);
  assert.equal(act({tipo:'shell',comando:'npm test'}).alwaysNotEnough,undefined,'no mark, nothing');
  assert.equal(act({tipo:'shell',comando:'npm test',sempreNonBasta:'true'}).alwaysNotEnough,undefined,'only a real true');
  /* not read on a tool outside the kernel's per-tool set: an MCP card keeps its «always» of one (server, tool) pair (step 3 of
     «one line», as the PC's «for this tool»), a TALOS service its own rule; the A5f report asks about them */
  for(const azione of [{tipo:'mcp_tool',server:'gh',attrezzo:'x',sempreNonBasta:true},{tipo:'notes_create',sempreNonBasta:true}]){
    assert.equal(act(azione).alwaysNotEnough,undefined,String(azione.tipo));
    /* A5j: the MCP card keeps the four and adds «No to this tool until your next message» */
    assert.equal(approvalChoicesFor(act(azione)).length,azione.tipo==='mcp_tool'?5:4,String(azione.tipo));
    assert.ok(approvalChoicesFor(act(azione)).some(row=>row.action==='approval-always'),String(azione.tipo));
  }
});

test('A5f: the v2 action names it in English, and no raw kernel key reaches the full review of any card',()=>{
  const v2=createV2EventBridge('s-1',()=>'2026-11-19T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione:{...CHILD_WRITE}} as any)?.data as any;
  assert.equal(v2.action.alwaysNotEnough,true);assert.equal(Object.hasOwn(v2.action,'sempreNonBasta'),false);
  assert.equal(permissionActionFromApproval(v2).alwaysNotEnough,true);
  for(const raw of [CHILD_WRITE,v2.action,{tipo:'mcp_tool',server:'gh',attrezzo:'x',sempreNonBasta:true}]){
    const pending:any={requestId:'q1',sessionId:'s-1',action:permissionActionFromApproval({azione:raw} as any),rawPayload:{...raw},reason:'no rule matched'};
    const model=approvalDialogModel(pending,{expanded:true});
    assert.doesNotMatch(model.fullPayload,/sempreNonBasta|alwaysNotEnough/u,JSON.stringify(raw));
  }
});

test('A5f: the marked card offers only Allow once and Deny, Deny highlighted, and its full review has no «always» line',()=>{
  for(const azione of MARKED){
    const choices=approvalChoicesFor(act(azione));
    assert.deepEqual(choices.map(row=>[row.digit,row.action]),[['1','approval-once'],['2','approval-deny-once']],String(azione.tipo));
    assert.equal(approvalDefaultSelected(choices),1);
  }
  const pending:any={requestId:'q1',sessionId:'s-1',action:act(CHILD_WRITE),rawPayload:{...CHILD_WRITE},reason:'no rule matched',alwaysSimulation:{writes:'Write(src/app.ts)',simulation:{effect:'allow',explanation:{effect:'allow',rule:'Write(src/app.ts)',segments:[]}}}};
  assert.equal(approvalDialogModel(pending,{expanded:true}).alwaysPreview,undefined,'no [3] always line on a card without [3]');
  /* the same for the other two-choice cards (A5a reviewer, list point 3): a network command, a critical deletion */
  for(const azione of [{tipo:'shell',comando:'curl https://example.com',rete:true},{tipo:'shell',comando:'rm -rf C:/',cancellazioneCritica:{percorso:'C:/',perche:'radice'}}]){
    const other:any={...pending,action:act(azione),rawPayload:{...azione}};
    assert.equal(approvalDialogModel(other,{expanded:true}).alwaysPreview,undefined,String(azione.comando));
  }
  /* a four-choice card keeps its line */
  assert.notEqual(approvalDialogModel({...pending,action:act({tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts'}),rawPayload:{tipo:'scrivi',percorso:'src/app.ts'}},{expanded:true}).alwaysPreview,undefined);
});

/* The giudice's addition 1 (reviewer of A5a, point a): on a two-choice card [2] is Deny, as the row shows, and no digit chooses a
   choice that is not on the screen ([3], [4], [5] do nothing there, in the summary and in the full review). */
test('A5f: on the marked card each digit answers the row shown with it, and nothing else',()=>{
  const choices=approvalChoicesFor(act(CHILD_SHELL));
  const key=(action:string,expanded=false)=>approvalKeyOutcome(action,{expanded,selected:1,escape:false,choices});
  for(const expanded of [false,true]){
    assert.deepEqual(key('approval-once',expanded),{kind:'answer',choice:'allow-once',stop:false});
    assert.deepEqual(key('approval-session',expanded),{kind:'answer',choice:'deny-once',stop:false},'[2] is Deny, as shown');
    for(const off of ['approval-always','approval-deny-once','approval-deny-always'])assert.deepEqual(key(off,expanded),{kind:'ignore'},`${off} is not on the card`);
    assert.deepEqual(key('approval-confirm',expanded),{kind:'answer',choice:'deny-once',stop:false});
  }
  /* the card's own rows are what the keys answer: [1] and [2], nothing else */
  const model=approvalDialogModel({requestId:'q1',sessionId:'s-1',action:act(CHILD_SHELL),rawPayload:{...CHILD_SHELL},reason:'no rule matched'} as any,{expanded:false});
  assert.deepEqual(model.choices?.map(row=>row.digit),['1','2']);
});

test('A5f: nothing is kept from a marked card, and no «for this session» answers it (the test the other way round)',async()=>{
  const persisted:any[]=[];
  const e=engine({allow:[],ask:[],deny:[]},'default',async(effect:any,action:any)=>{persisted.push([effect,action.tool]);});
  for(const azione of [CHILD_SHELL,CHILD_WRITE,CONTROL_WRITE]){
    for(const answer of ['allow-session','allow-always','deny-always'] as const){
      const d:any=await e.decide(act(azione),ask);assert.equal(d.kind,'ask',`${azione.tipo} before ${answer}`);
      await e.resolve(d.requestId,answer);
      assert.equal((await e.decide(act(azione),ask)).kind,'ask',`${azione.tipo}: after ${answer} the card asks again`);
    }
  }
  assert.deepEqual(persisted,[],'no rule from a marked card');
  /* a «for this session» the person gave on the root's unmarked card does not answer the child's marked one */
  const root=engine();const asked:any=await root.decide(act({tipo:'shell',comando:'npm test'}),ask);await root.resolve(asked.requestId,'allow-session');
  assert.equal((await root.decide(act({tipo:'shell',comando:'npm test'}),ask)).kind,'allow','the root\'s own grant holds');
  assert.equal((await root.decide(act(CHILD_SHELL),ask)).kind,'ask','the child\'s marked card still asks');
});

/* Decision 375: the same twenty everyday cards as A5a (control-file-card-373.test.ts), decided exactly as at ba5ffcc65 both
   without the mark and with it (a child's cards): A = a card, . = allowed without one. No card added, none doubled. */
const EVERYDAY:ReadonlyArray<Record<string,unknown>>=[
  {tipo:'shell',comando:'npm test'},{tipo:'shell',comando:'git status'},{tipo:'shell',comando:'git diff'},{tipo:'shell',comando:'ls -la'},
  {tipo:'shell',comando:'npm run build'},{tipo:'shell',comando:'node scripts/check.mjs'},{tipo:'shell',comando:'git add src/app.ts'},
  {tipo:'shell',comando:'git commit -m "fix"'},{tipo:'shell',comando:'npx tsc --noEmit'},{tipo:'shell',comando:'cat package.json'},
  {tipo:'shell',comando:'rg TODO src'},{tipo:'shell',comando:'python -m pytest'},{tipo:'shell',comando:'mkdir -p out'},
  {tipo:'shell',comando:'type .computer-use-luoghi.json.bak'},{tipo:'scrivi',percorso:'src/app.ts'},{tipo:'scrivi',percorso:'README.md'},
  {tipo:'file_edit',percorso:'src/util.ts'},{tipo:'leggi',percorso:'src/app.ts'},{tipo:'scrivi',percorso:'test/app.test.ts'},
  {tipo:'shell',comando:'curl https://example.com',rete:true},
];
const ALLOW_ALL={allow:['Bash(*)','Write(*)','Edit(*)'],ask:[],deny:[]};
/* measured on ba5ffcc65 with these twenty cards, unmarked and marked (rumore-prima.json in the block's fake profile) */
const BEFORE:Readonly<Record<string,string>>={'default/none':'A...AAAAA..AA.AAA.AA','default/allowAll':'...................A',
  'acceptEdits/none':'A...AAAAA..A.......A','acceptEdits/allowAll':'...................A','bypassPermissions/none':'....................','bypassPermissions/allowAll':'....................'};
test('A5f: twenty everyday cards, unmarked and marked, are the same cards as before (decision 375)',async()=>{
  assert.equal(EVERYDAY.length,20);
  for(const marked of [false,true])for(const mode of ['default','acceptEdits','bypassPermissions'] as const)for(const [name,rules] of [['none',{allow:[],ask:[],deny:[]}],['allowAll',ALLOW_ALL]] as const){
    let shape='';
    for(const azione of EVERYDAY){
      const d:any=await engine(structuredClone(rules),mode).decide(act(marked?{...azione,sempreNonBasta:true}:azione),{interactive:true,mode} as any);
      shape+=d.kind==='ask'?'A':d.kind==='allow'?'.':'x';
    }
    assert.equal(shape,BEFORE[`${mode}/${name}`],`${marked?'marked':'unmarked'} ${mode}/${name}`);
  }
});

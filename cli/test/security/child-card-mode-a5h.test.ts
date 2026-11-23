/*
 * A5h (owner 19/11/2026, «Uguale al PC, modo per modo»; the giudice's form v2266: the CLI alone). The CLI starts its root «On
 * request» (runtime/session-facade.ts:20) so that the kernel asks it for every call, and the kernel therefore marks every card of a
 * child with `sempreNonBasta` (C2-a, session-registry.mjs:8171-8173): measured 6 tools of 6 (A5f report). On the PC, with the root
 * in Workspace write or Full access, the same chain marks 0 of 6. So in acceptEdits and in Full access the CLI lifts the mark from a
 * child's card, and the card offers «for this session» again, as in 0.6.16; nothing passes by itself (the kernel still asks). The
 * mark STAYS unless all four stakes hold: (1) a child's card, (2) acceptEdits or Full access, (3) one of the six tools, (4) no other
 * reason for the two choices (the kernel's control file mark, a control file named by path, the network, a critical deletion,
 * credentials, root in WSL, an agent start, the trifecta, suspicious content, a write outside the project). In doubt it stays.
 * Sources: Claude Code CHANGELOG.md:4788 (subagents inherit the parent session's permission mode) and :4224 (session-scoped answers
 * on a subagent's prompt are kept); Hermes tools/delegate_tool_config.py:57-61 (a subagent's approvals follow one delegation setting);
 * Hermes tools/approval.py:838-840 (a once-only card persists nothing).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {controlPathCheckLoaded,namesControlFile} from '../../src/security/control-path.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const NONE={allow:[],ask:[],deny:[]};
/* an «ask» rule for everything: every mode then shows a card, so the mark can be read on it */
const ASK_ALL={allow:[],ask:['Bash(*)','Write(*)','Edit(*)','TalosService(*)'],deny:[]};
const act=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione:{...azione}} as any);
const engine=(rules:any=NONE,mode='default',classifier?:any)=>createPermissionEngine({projectRoot:ROOT,rules:structuredClone(rules),mode,...(classifier?{classifier}:{})} as any);
const SHELL={tipo:'shell',comando:'npm test',sempreNonBasta:true};
const LIFT_MODES=['acceptEdits','bypassPermissions'] as const;
async function card(azione:Record<string,unknown>,mode:string,{child=true,rules=ASK_ALL,interactive=true}:{child?:boolean;rules?:any;interactive?:boolean}={}){
  return await engine(rules,mode,mode==='auto'?async()=>'ask':undefined).decide(act(azione),{interactive,mode,child} as any) as any;
}

test('A5h stakes 1-3 hold: in acceptEdits and Full access a child\'s card of the six tools has «for this session» again',async()=>{
  const six=[SHELL,{tipo:'prova',comando:'npm test',sempreNonBasta:true},{tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',sempreNonBasta:true},
    {tipo:'file_edit',toolCallId:'c2',percorso:'src/util.ts',sempreNonBasta:true},{tipo:'document_create',sempreNonBasta:true},{tipo:'generate_image',sempreNonBasta:true}];
  for(const mode of LIFT_MODES)for(const azione of six){
    const d=await card(azione,mode);
    assert.equal(d.kind,'ask',`${mode} ${azione.tipo}`);
    assert.equal(d.action.alwaysNotEnough,undefined,`${mode} ${azione.tipo}: the mark is lifted`);
    /* cure round 1 (giudice, G3): three choices, once, for this session, deny; never «always» */
    assert.deepEqual(approvalChoicesFor(d.action).map(row=>[row.digit,row.action]),[['1','approval-once'],['2','approval-session'],['3','approval-deny-once']],`${mode} ${azione.tipo}: three choices`);
  }
  /* the lifted action is the root's own action, field for field, but for the card's «at most this session» */
  const lifted=await card(SHELL,'acceptEdits');
  const {sessionOnly,...rest}=lifted.action;assert.equal(sessionOnly,true);
  assert.equal(JSON.stringify(rest),JSON.stringify(act({tipo:'shell',comando:'npm test'})));
  /* acceptEdits without any rule: the child's shell card asks and offers «for this session» */
  const plain=await card(SHELL,'acceptEdits',{rules:NONE});
  assert.equal(plain.kind,'ask');assert.equal(plain.action.alwaysNotEnough,undefined);
});

test('A5h stake 1: the root\'s card keeps the mark in every mode',async()=>{
  for(const mode of LIFT_MODES){const d=await card(SHELL,mode,{child:false});assert.equal(d.action.alwaysNotEnough,true,mode);}
});

test('A5h stake 2: default, plan and auto keep the mark on a child\'s card',async()=>{
  for(const mode of ['default','auto'] as const){const d=await card(SHELL,mode);assert.equal(d.kind,'ask',mode);assert.equal(d.action.alwaysNotEnough,true,mode);}
  const plan=await card({tipo:'shell',comando:'git status',sempreNonBasta:true},'plan');
  assert.equal(plan.kind,'ask');assert.equal(plan.action.alwaysNotEnough,true,'plan');
});

test('A5h stake 3: an agent start keeps the mark (C2b), in both modes',async()=>{
  for(const mode of LIFT_MODES){const d=await card({tipo:'delega_sottotask',sempreNonBasta:true},mode);assert.equal(d.kind,'ask',mode);assert.equal(d.action.alwaysNotEnough,true,mode);}
});

/* stake 4, one card per reason; each one is the child's marked card of one of the six tools */
/* the run's own home (scripts/run-tests.mjs gives every run a private profile): a login credential of «this computer» */
const HOME=path.join(os.homedir(),'.ssh','id_ed25519');
const OTHER_REASONS:ReadonlyArray<readonly [string,Record<string,unknown>]>=[
  ['the kernel\'s control file mark',{tipo:'shell',comando:'type .computer-use-luoghi.json',fileDiControllo:true,sempreNonBasta:true}],
  ['a write to a control file, by path',{tipo:'scrivi',toolCallId:'c1',percorso:'AGENTS.md',sempreNonBasta:true}],
  ['an edit of a control file in a control folder, by path',{tipo:'file_edit',toolCallId:'c1',percorso:path.join('.talos','hooks.json'),sempreNonBasta:true}],
  ['a shell command that writes a control file',{tipo:'shell',comando:'cp notes.txt CLAUDE.md',sempreNonBasta:true}],
  ['a shell command that writes into a control folder',{tipo:'shell',comando:'tee .talos/hooks.json',sempreNonBasta:true}],
  ['a test command that names a control file',{tipo:'prova',comando:'node check.mjs --out=.harness-ui-hooks.json',sempreNonBasta:true}],
  ['a shell command TALOS cannot read for paths (a variable)',{tipo:'shell',comando:'cp x $TARGET',sempreNonBasta:true}],
  ['a command that asks for the network',{tipo:'shell',comando:'curl https://example.com',rete:true,sempreNonBasta:true}],
  ['a network path',{tipo:'scrivi',toolCallId:'c1',percorso:'\\\\server\\share\\a.txt',percorsoDiRete:{ospite:'server',via:'stringa'},sempreNonBasta:true}],
  ['a critical deletion',{tipo:'shell',comando:'rm -rf C:/',cancellazioneCritica:{percorso:'C:/',perche:'radice'},sempreNonBasta:true}],
  ['a secret',{tipo:'scrivi',toolCallId:'c1',percorso:'.env',segreto:{classe:'segreto',percorso:'.env'},sempreNonBasta:true}],
  ['a login credential of this computer, read by a command',{tipo:'shell',comando:`type ${HOME}`,sempreNonBasta:true}],
  ['a login credential of this computer, written',{tipo:'scrivi',toolCallId:'c1',percorso:HOME,sempreNonBasta:true}],
  ['root in WSL',{tipo:'shell',comando:'wsl -u root ls',wslRoot:{distro:'Ubuntu',utente:'root'},sempreNonBasta:true}],
  ['the trifecta',{tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',trifecta:true,sempreNonBasta:true}],
  ['suspicious content',{tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',contenutoSospetto:{fonte:'web',motivi:['x']},sempreNonBasta:true}],
  ['a write outside the project',{tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',fuoriDalProgetto:{cartella:'..',chiave:'k'},sempreNonBasta:true}],
];
for(const [reason,azione] of OTHER_REASONS){
  test(`A5h stake 4 (${reason}): the child's card keeps the mark in acceptEdits and Full access`,async()=>{
    let asked=0;
    for(const mode of LIFT_MODES){
      const d=await card(azione,mode);
      if(d.kind==='ask')asked+=1;
      if(d.kind==='ask')assert.equal(d.action.alwaysNotEnough,true,`${mode}: ${JSON.stringify(d.action)}`);
      /* no card (Full access opens the network, a deny): decided exactly as the root's same card, as at 92f1ed153 */
      else{const root=await card(azione,mode,{child:false});assert.deepEqual([d.kind,d.code,d.source],[root.kind,root.code,root.source],mode);}
    }
    assert.ok(asked>0,'at least one of the two modes shows the card, so the mark is read on it');
  });
}
test('A5h stake 4: the v2 spellings of the reasons keep the mark too',async()=>{
  for(const v2 of [{tool:'scrivi',path:'src/app.ts',trifecta:true,alwaysNotEnough:true},{tool:'scrivi',path:'src/app.ts',suspiciousContent:{source:'web'},alwaysNotEnough:true},
    {tool:'scrivi',path:'src/app.ts',outsideProject:{folder:'..'},alwaysNotEnough:true}]){
    const action=permissionActionFromApproval({action:v2} as any);
    const d:any=await engine(ASK_ALL,'acceptEdits').decide(action,{interactive:true,mode:'acceptEdits',child:true} as any);
    assert.equal(d.action.alwaysNotEnough,true,JSON.stringify(v2));
  }
});

test('A5h, in doubt the mark stays: an untrusted folder, a kernel rule for control files that is missing or throws',async()=>{
  for(const mode of LIFT_MODES){
    const e=createPermissionEngine({projectRoot:ROOT,rules:structuredClone(ASK_ALL),mode,askEverything:true} as any);
    const d:any=await e.decide(act(SHELL),{interactive:true,mode,child:true} as any);
    assert.equal(d.kind,'ask',mode);assert.equal(d.action.alwaysNotEnough,true,`${mode}: untrusted folder`);
  }
  const plain=act({tipo:'shell',comando:'npm test'});
  assert.equal(namesControlFile(plain,ROOT,null),true,'without the kernel\'s rule: yes, it may');
  assert.equal(namesControlFile(plain,ROOT,()=>{throw new Error('x');}),true,'a rule that throws: yes, it may');
  assert.equal(namesControlFile(plain,ROOT,()=>false),false);
  assert.equal(controlPathCheckLoaded(),true,'the kernel\'s own rule is the one read here');
  /* the kernel's mark counts by itself, even on a path the CLI's reading would let pass */
  for(const mode of LIFT_MODES){
    const d=await card({tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',fileDiControllo:true,sempreNonBasta:true},mode);
    assert.equal(d.kind,'ask',mode);assert.equal(d.action.alwaysNotEnough,true,`${mode}: the kernel's control file mark`);
  }
  /* a secret the CLI's own second check finds (F-P-004) keeps the mark too */
  for(const mode of LIFT_MODES){
    const e=createPermissionEngine({projectRoot:ROOT,rules:structuredClone(ASK_ALL),mode,secretRecheck:async()=>'secret'} as any);
    const d:any=await e.decide(act({tipo:'scrivi',toolCallId:'c1',percorso:'src/app.ts',sempreNonBasta:true}),{interactive:true,mode,child:true} as any);
    assert.equal(d.kind,'ask',mode);assert.equal(d.action.alwaysNotEnough,true,`${mode}: the CLI's secret check`);
  }
});

test('A5h, -p: with nobody in front nothing changes (the twenty everyday cards of a child, every mode, both rule sets)',async()=>{
  const everyday=['npm test','git status','ls -la','npm run build','git add src/app.ts','rg TODO src','mkdir -p out'].map(comando=>({tipo:'shell',comando,sempreNonBasta:true}))
    .concat([{tipo:'scrivi',toolCallId:'w',percorso:'src/app.ts',sempreNonBasta:true} as any,{tipo:'shell',comando:'curl https://example.com',rete:true,sempreNonBasta:true} as any]);
  for(const mode of ['default','acceptEdits','plan','dontAsk','bypassPermissions'] as const)for(const rules of [NONE,{allow:['Bash(*)','Write(*)'],ask:[],deny:[]}]){
    for(const azione of everyday){
      const child=await card(azione,mode,{rules,interactive:false});
      const root=await card(azione,mode,{rules,interactive:false,child:false});
      assert.deepEqual([child.kind,child.code,child.source],[root.kind,root.code,root.source],`${mode} ${azione.comando??azione.percorso}`);
    }
  }
});

test('A5h: a «for this session» given in acceptEdits does not survive the switch to default (two choices again)',async()=>{
  const e=engine(NONE,'acceptEdits');
  const first:any=await e.decide(act(SHELL),{interactive:true,mode:'acceptEdits',child:true} as any);
  assert.equal(first.kind,'ask');await e.resolve(first.requestId,'allow-session');
  const again:any=await e.decide(act(SHELL),{interactive:true,mode:'acceptEdits',child:true} as any);
  assert.deepEqual([again.kind,again.source],['allow','session'],'kept while acceptEdits holds');
  const after:any=await e.decide(act(SHELL),{interactive:true,mode:'default',child:true} as any);
  assert.equal(after.kind,'ask','in default the card asks again');assert.equal(after.action.alwaysNotEnough,true);
  assert.equal(approvalChoicesFor(after.action).length,2);
});

test('A5h: the coordinator hands the child flag to the engine, and the card it returns has the four choices',async()=>{
  const answers:any[]=[];
  const c=createApprovalCoordinator({engine:engine(NONE,'acceptEdits'),answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'acceptEdits'});
  const child:any=await c.request('child-1','q1',act(SHELL),{child:true});
  assert.equal(child.pending,true);assert.equal(child.action.alwaysNotEnough,undefined);assert.equal(approvalChoicesFor(child.action).length,3);
  const root:any=await c.request('main','q2',act(SHELL));
  assert.equal(root.action.alwaysNotEnough,true,'no flag, the mark stays');
});

/* Cure round 1 (giudice, after the reviewer of A5f + A5h, G1): the ten command shapes the reviewer found writing a control file
   unseen, and a compound command that writes one. If the CLI cannot say where a command writes, the mark stays: two choices. */
const UNSEEN_WRITES:ReadonlyArray<string>=[
  'cp hooks.json .talos','cp hooks.json .talos/','mv settings.json .claude','cp -r cfg skills','cp -t .talos hooks.json',
  'Copy-Item evil.json -Destination .talos','Set-Content -Path:.talos/hooks.json -Value x','sort -o.claude/settings.json in.txt',
  "cp evil.json '.talos\\hooks.json'",'cp evil.json ".talos\\hooks.json"',
  'npm test && cp x .talos/hooks.json','cp a AGENTS.md.',
];
for(const comando of UNSEEN_WRITES){
  test(`A5h cure 1, G1: «${comando}» keeps the mark in acceptEdits and Full access`,async()=>{
    let asked=0;
    for(const mode of LIFT_MODES){
      const d=await card({tipo:'shell',comando,sempreNonBasta:true},mode);
      if(d.kind==='ask'){asked+=1;assert.equal(d.action.alwaysNotEnough,true,mode);assert.equal(approvalChoicesFor(d.action).length,2,mode);}
      else{const root=await card({tipo:'shell',comando,sempreNonBasta:true},mode,{child:false});assert.deepEqual([d.kind,d.code,d.source],[root.kind,root.code,root.source],mode);}
    }
    assert.ok(asked>0,'at least one mode shows the card');
    assert.equal(namesControlFile(act({tipo:'shell',comando}),ROOT),true,'the CLI says it may touch a control file');
  });
}

/* G3: on the lifted card «always» is never kept, whatever answer arrives; «for this session» is */
test('A5h cure 1, G3: the child\'s three-choice card keeps no rule, an «always» that arrives writes nothing and keeps nothing',async()=>{
  for(const mode of LIFT_MODES){
    const persisted:any[]=[];
    const e=createPermissionEngine({projectRoot:ROOT,rules:structuredClone(ASK_ALL),mode,persistRule:async(effect:any)=>{persisted.push(effect);}} as any);
    const ctx={interactive:true,mode,child:true} as any;
    for(const answer of ['allow-always','deny-always'] as const){const d:any=await e.decide(act(SHELL),ctx);assert.equal(d.kind,'ask');await e.resolve(d.requestId,answer);}
    assert.deepEqual(persisted,[],`${mode}: no rule`);
    assert.equal((await e.decide(act(SHELL),ctx)).kind,'ask',`${mode}: nothing kept`);
    const s:any=await e.decide(act(SHELL),ctx);await e.resolve(s.requestId,'allow-session');
    assert.deepEqual([(await e.decide(act(SHELL),ctx) as any).source],['session'],`${mode}: «for this session» holds`);
  }
});

/* the reviewer's test hole M33/M34: a reason key the kernel sends as false or null is no reason, the mark is lifted */
test('A5h cure 1: a reason key that is false or null does not keep the mark',async()=>{
  for(const extra of [{trifecta:false},{rete:false},{wslRoot:null},{segreto:false}]){
    const d=await card({...SHELL,...extra},'acceptEdits');
    assert.equal(d.action.alwaysNotEnough,undefined,JSON.stringify(extra));
  }
});

/* «for this session» given on a child's card still answers the root's same command, and the other way round, as in 0.6.16 */
test('A5h cure 1: the session grant is the same for the root and the child (the card\'s «at most this session» is not part of it)',async()=>{
  const e=engine(NONE,'acceptEdits');
  const c:any=await e.decide(act(SHELL),{interactive:true,mode:'acceptEdits',child:true} as any);await e.resolve(c.requestId,'allow-session');
  assert.equal((await e.decide(act({tipo:'shell',comando:'npm test'}),{interactive:true,mode:'acceptEdits'} as any) as any).source,'session');
});

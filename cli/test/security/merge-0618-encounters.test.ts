/*
 * 0.7.0, the merge of 0.6.18 (correctness reviewer of 21/11/2026, M1-M10; judge v2451, list items 12-17): where the two lines meet.
 * Real engine, real card reader, real choice list, real coordinator; an invented project folder, nothing on disk or on the network.
 * M10 kills PE5 (resolve forgetting the control file card); the explicit «two marks together» test kills M01 (the card checking the
 * child's «for this session» before «only once»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalChoicesFor,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';

const ROOT='C:\\progetto-inventato';
const ASK_ALL={allow:[],ask:['Bash(*)','Write(*)','Edit(*)','TalosService(*)'],deny:[]};
const NONE={allow:[],ask:[],deny:[]};
const card=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione:{...azione}});
const eng=(rules:any=NONE,extra:any={})=>createPermissionEngine({projectRoot:ROOT,rules:structuredClone(rules),persistRule:async()=>{},...extra}) as any;
const rows=(a:any)=>approvalChoicesFor(a).map((r:any)=>r.action);
const mcp=(tool:string,extra:any={})=>({tipo:'mcp_tool',nome:`mcp__srv__${tool}`,server:'srv',attrezzo:tool,toolCallId:`c-${tool}`,...extra});
const plugin=(p:string,tool:string,extra:any={})=>({tipo:'plugin_tool',nome:`plugin__${p}__${tool}`,plugin:p,attrezzo:tool,toolCallId:`p-${p}-${tool}`,...extra});
const forge=(tool:string,extra:any={})=>({tipo:'forge_tool',nome:`forge_${tool}`,attrezzo:tool,toolCallId:`f-${tool}`,...extra});

test('M1 the card reader keeps both lines: a plugin card has noToThisTool AND the string tool name and plugin of 0.6.18',()=>{
  const a=card(plugin('alfa','uno'));
  assert.equal(a.noToThisTool,true);assert.equal(a.outsideTool,'uno');assert.equal(a.plugin,'alfa');
  const f=card(forge('uno'));assert.equal(f.noToThisTool,true);assert.equal(f.outsideTool,'uno');assert.equal(f.plugin,undefined);
  const m=card(mcp('create_pr'));assert.equal(m.noToThisTool,true);assert.equal(m.outsideTool,undefined);
  assert.equal(card({tipo:'shell',comando:'npm test'}).noToThisTool,undefined,'a kernel tool has no «No to this tool»');
});

test('M2 the choices: outside card five rows; «only once» outside card two rows; only once beats the child mark',()=>{
  for(const raw of [mcp('a'),plugin('alfa','uno'),forge('uno')]){
    assert.deepEqual(rows(card(raw)),['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-tool'],raw.tipo);
    assert.deepEqual(rows(card({...raw,soloUnaVolta:true})),['approval-once','approval-deny-once'],`${raw.tipo} only once`);
  }
  assert.deepEqual(rows({tool:'Bash',command:'x',sessionOnly:true}),['approval-once','approval-session','approval-deny-once']);
  assert.deepEqual(rows({tool:'Bash',command:'x',sessionOnly:true,onlyOnce:true}),['approval-once','approval-deny-once'],'only once and the child mark: two rows');
  assert.deepEqual(rows({tool:'Bash',command:'x',sessionOnly:true,personOnly:true}),['approval-once','approval-deny-once']);
});

test('the two marks together («only once» + the child\'s «for this session»): two choices, no key reaches more, nothing kept',async()=>{
  const both={tool:'Bash',command:'npm test',sessionOnly:true,onlyOnce:true} as any;
  const choices=approvalChoicesFor(both);
  assert.deepEqual(choices.map(row=>row.action),['approval-once','approval-deny-once']);
  /* every key, folded and in the full review, on every row: only «once» and «deny» are ever answered (keys are numbered as shown) */
  const reached=new Set<string>();
  for(const expanded of [false,true])for(let selected=0;selected<choices.length;selected++)
    for(const key of ['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-always','approval-deny-tool','approval-confirm']){
      const outcome=approvalKeyOutcome(key,{expanded,selected,escape:false,choices}) as any;if(outcome.kind==='answer')reached.add(outcome.choice);
    }
  assert.deepEqual([...reached].sort(),['allow-once','deny-once'],[...reached].join(','));
  for(const mode of ['acceptEdits','bypassPermissions']){
    let persisted=0;const e=eng(ASK_ALL,{persistRule:async()=>{persisted++;}});const ctx={interactive:true,mode,sessionId:'s1',child:true};
    const raw={tipo:'shell',comando:'npm test',sempreNonBasta:true,soloUnaVolta:true};
    const d=await e.decide(card(raw),ctx);
    assert.equal(d.kind,'ask',mode);assert.equal(d.action.onlyOnce,true,mode);assert.equal(d.action.sessionOnly,true,`${mode}: the lifted child card carries both marks`);
    assert.deepEqual(rows(d.action),['approval-once','approval-deny-once'],mode);
    for(const decision of ['allow-session','allow-always']){await e.resolve(d.requestId,decision);const again=await e.decide(card(raw),ctx);assert.equal(again.kind,'ask',`${mode} ${decision}: nothing kept`);d.requestId=again.requestId;}
    assert.equal(persisted,0,`${mode}: no rule saved`);
  }
});

test('M3 key 6: pressed on a card without the row it is ignored, on an outside card it answers deny-tool',()=>{
  const opts=(a:any)=>({expanded:false,selected:0,escape:false,choices:approvalChoicesFor(a)});
  const outside=approvalKeyOutcome('approval-deny-tool',opts(card(mcp('a')))) as any;
  assert.equal(outside.kind,'answer');assert.equal(outside.choice,'deny-tool');
  for(const a of [card({tipo:'shell',comando:'npm test'}),card(mcp('a',{soloUnaVolta:true})),{tool:'Bash',command:'x',sessionOnly:true}])
    assert.equal(approvalKeyOutcome('approval-deny-tool',opts(a)).kind,'ignore',JSON.stringify(rows(a)));
});

test('M4 a session yes for plugin alfa/uno covers that one tool, never alfa/due nor beta/uno, with noToThisTool in the card',async()=>{
  const e=eng();const ctx={interactive:true,mode:'default',sessionId:'s1'};
  const asked=await e.decide(card(plugin('alfa','uno')),ctx);assert.equal(asked.kind,'ask');
  await e.resolve(asked.requestId,'allow-session');
  assert.equal((await e.decide(card(plugin('alfa','uno')),ctx)).kind,'allow','the same tool');
  assert.equal((await e.decide(card(plugin('alfa','due')),ctx)).kind,'ask','another tool of the plugin');
  assert.equal((await e.decide(card(plugin('beta','uno')),ctx)).kind,'ask','the same tool name in another plugin');
  assert.equal((await e.decide(card(forge('uno')),ctx)).kind,'ask','a Tool Forge tool of the same name');
});

test('M5 a session yes given before does not answer an «only once» card of the same tool, and the only once card keeps nothing',async()=>{
  for(const raw of [mcp('create_pr'),plugin('alfa','uno'),forge('uno'),{tipo:'shell',comando:'npm test'}]){
    const e=eng(NONE);const ctx={interactive:true,mode:'default',sessionId:'s1'};
    const first=await e.decide(card(raw),ctx);
    if(first.kind==='ask'){await e.resolve(first.requestId,'allow-session');}
    const once=await e.decide(card({...raw,soloUnaVolta:true}),ctx);
    assert.equal(once.kind,'ask',`${raw.tipo}: the only once card asks after a session yes`);
    await e.resolve(once.requestId,'allow-session');
    await e.resolve((await e.decide(card({...raw,soloUnaVolta:true}),ctx)).requestId,'allow-always');
    assert.equal((await e.decide(card({...raw,soloUnaVolta:true}),ctx)).kind,'ask',`${raw.tipo}: still asks after a session and an always`);
    const nobody=await e.decide(card({...raw,soloUnaVolta:true}),{...ctx,interactive:false});
    assert.equal(nobody.kind,'deny',`${raw.tipo}: with nobody in front it is a no`);
  }
});

test('M6 a child card with the chain mark AND only once: asked, two rows, nothing kept, in acceptEdits and Full access',async()=>{
  for(const mode of ['acceptEdits','bypassPermissions']){
    let persisted=0;
    const e=eng(ASK_ALL,{persistRule:async()=>{persisted++;}});const ctx={interactive:true,mode,sessionId:'s1',child:true};
    const raw={tipo:'shell',comando:'npm test',sempreNonBasta:true,soloUnaVolta:true};
    const d=await e.decide(card(raw),ctx);
    assert.equal(d.kind,'ask',mode);
    assert.deepEqual(rows(d.action),['approval-once','approval-deny-once'],`${mode}: an only once card never offers more`);
    await e.resolve(d.requestId,'allow-session');
    const again=await e.decide(card(raw),ctx);assert.equal(again.kind,'ask',`${mode}: nothing kept by the session yes`);
    await e.resolve(again.requestId,'allow-always');
    assert.equal(persisted,0,`${mode}: no rule saved`);
    assert.equal((await e.decide(card({tipo:'shell',comando:'npm test',sempreNonBasta:true}),ctx)).kind,'ask',`${mode}: the child card without only once still asks`);
  }
});

test('M7 the child card alone (no only once) still gets «for this session» and its grant is shared with the root command (0.7.0 A5h)',async()=>{
  const e=eng(ASK_ALL);const ctx={interactive:true,mode:'acceptEdits',sessionId:'s1'};
  const child=await e.decide(card({tipo:'shell',comando:'npm test',sempreNonBasta:true}),{...ctx,child:true});
  assert.equal(child.kind,'ask');assert.equal(child.action.sessionOnly,true);
  assert.deepEqual(rows(child.action),['approval-once','approval-session','approval-deny-once']);
  await e.resolve(child.requestId,'allow-session');
  assert.equal((await e.decide(card({tipo:'shell',comando:'npm test'}),ctx)).kind,'allow','the root command shares it');
});

test('M8 «No to this tool» on a plugin card leaves no grant and no rule; the kernel hears the tool scope',async()=>{
  let persisted=0;const answers:any[]=[];
  const e=eng(NONE,{persistRule:async()=>{persisted++;}});
  const c=createApprovalCoordinator({engine:e,answer:async(...a:any[])=>{answers.push(a);},interactive:true,mode:'default'});
  const r=await c.request('s1','q1',card(plugin('alfa','uno')));assert.equal(r.pending,true);
  await c.resolve('q1','deny-tool');
  assert.deepEqual(answers.at(-1),['s1','q1',false,{ambito:'strumento'}]);
  assert.equal(persisted,0);
  for(const raw of [plugin('alfa','uno'),plugin('alfa','due')])assert.equal((await e.decide(card(raw),{interactive:true,mode:'default',sessionId:'s1'})).kind,'ask',raw.nome);
});

test('M9 plan mode (0.6.18 cure 1) still refuses an outside tool with noToThisTool on the card, after a session yes',async()=>{
  for(const raw of [mcp('a'),plugin('alfa','uno'),forge('uno')]){
    const e=eng();const asked=await e.decide(card(raw),{interactive:true,mode:'default'});await e.resolve(asked.requestId,'allow-session');
    const d=await e.decide(card(raw),{interactive:true,mode:'plan'});assert.equal(d.kind,'deny',raw.tipo);assert.equal(d.code,'PLAN_MODE_READ_ONLY',raw.tipo);
  }
});

test('M10 a control file card keeps no grant and saves no rule even without the «always is not enough» mark (decision 373)',async()=>{
  for(const raw of [{tipo:'scrivi',toolCallId:'w1',percorso:'AGENTS.md',fileDiControllo:true},{tipo:'shell',comando:'type .computer-use-luoghi.json',fileDiControllo:true}]){
    let persisted=0;const e=eng(NONE,{persistRule:async()=>{persisted++;}});const ctx={interactive:true,mode:'default',sessionId:'s1'};
    const a=card(raw);assert.equal(a.controlFile,true);assert.equal(a.alwaysNotEnough,undefined,'no «always is not enough» mark on this card');
    for(const decision of ['allow-session','allow-always','deny-always']){const d=await e.decide(card(raw),ctx);assert.equal(d.kind,'ask',`${raw.tipo} ${decision}`);await e.resolve(d.requestId,decision);}
    assert.equal(persisted,0,`${raw.tipo}: no rule saved`);
  }
});

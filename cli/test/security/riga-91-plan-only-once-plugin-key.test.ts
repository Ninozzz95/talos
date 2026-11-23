/*
 * Riga 91 (giro vero of 19/11/2026 on 0.6.17 and 0.7.0, three roads measured): the cure of 0.6.18, three points, CLI only.
 * 1 · Plan mode refuses a tool that runs outside TALOS (an MCP tool, a plugin or Tool Forge tool) as it refuses a write: no allow
 *     rule and no session yes opens it (Claude Code CHANGELOG.md:6219, plan mode blocks a write even with an allow rule). Road 1
 *     (plan taken while the model works) and road 2 (automation `--mode plan`) ran `Mcp(github:create_pr)` from its saved rule.
 * 2 · The kernel's card «only once» (`soloUnaVolta`, a card made in Read only, talosHarness.mjs:15917) is answered by the person
 *     once: no rule, session yes or mode answers it, with nobody in front it is a no, and nothing is kept (Hermes
 *     tools/approval.py:813, once/deny only, nothing persists; a session yes is kept per session key, :263-266). The card offers only «Allow once» and «Deny».
 * 3 · The card of a plugin or Tool Forge tool carries its plugin and its tool, so «Allow for this session» (and «always», which
 *     falls back to the session, persist.ts:31) covers ONE (kind, plugin, tool), as the kernel's key (talosHarness.mjs:11797-11799,
 *     Codex core/src/mcp_tool_call.rs:1523-1529). Road 3: a yes to plugin alfa ran plugin beta without a card.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalChoicesFor,approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';

const ROOT=process.cwd();
const engine=(allow:string[]=[],extra:Record<string,unknown>={})=>createPermissionEngine({projectRoot:ROOT,rules:{allow,ask:[],deny:[]},...extra});
const MCP={tipo:'mcp_tool',nome:'mcp__github__create_pr',server:'github',attrezzo:'create_pr',toolCallId:'c1'};
const card=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione});
const v2=(action:Record<string,unknown>)=>permissionActionFromApproval({action});
const plugin=(name:string,tool:string)=>({tipo:'plugin_tool',nome:`plugin__${name}__${tool}`,plugin:name,attrezzo:tool,toolCallId:`p-${name}-${tool}`});
const forge=(tool:string)=>({tipo:'forge_tool',nome:`forge_${tool}`,attrezzo:tool,toolCallId:`f-${tool}`});

/* ---------- cure 1 ---------- */
test('riga 91, cure 1: in plan an MCP tool with its saved allow rule is refused as a write (road 1, screen and nobody in front)',async()=>{
  for(const interactive of [true,false]){
    const d=await engine(['Mcp(github:create_pr)']).decide(card(MCP),{interactive,mode:'plan'});
    assert.equal(d.kind,'deny',`interactive ${interactive}`);
    assert.equal((d as {code:string}).code,'PLAN_MODE_READ_ONLY');
  }
});
test('riga 91, cure 1: in plan a session yes given before does not open an MCP tool, a plugin or a Tool Forge tool',async()=>{
  for(const raw of [MCP,plugin('alfa','uno'),forge('uno')]){
    const e=engine();const asked=await e.decide(card(raw),{interactive:true,mode:'default'});
    assert.equal(asked.kind,'ask');await e.resolve((asked as {requestId:string}).requestId,'allow-session');
    assert.equal((await e.decide(card(raw),{interactive:true,mode:'default'})).kind,'allow',`${raw.tipo}: the yes holds outside plan`);
    const d=await e.decide(card(raw),{interactive:true,mode:'plan'});
    assert.equal(d.kind,'deny',raw.tipo);assert.equal((d as {code:string}).code,'PLAN_MODE_READ_ONLY',raw.tipo);
  }
});
test('riga 91, cure 1: in plan a hand-written rule for a whole kind of outside tool opens nothing (road 2, automation)',async()=>{
  for(const [raw,rule] of [[plugin('alfa','uno'),'TalosService(:plugin_tool)'],[forge('uno'),'TalosService(:forge_tool)'],[MCP,'Mcp(github:*)']] as const){
    const d=await engine([rule]).decide(card(raw),{interactive:false,mode:'plan'});
    assert.equal(d.kind,'deny',rule);assert.equal((d as {code:string}).code,'PLAN_MODE_READ_ONLY',rule);
  }
});
test('riga 91, cure 1, the other way: outside plan the saved rule still runs the MCP tool, on the screen and with nobody in front',async()=>{
  for(const mode of ['default','acceptEdits','dontAsk','bypassPermissions'] as const)for(const interactive of [true,false])
    assert.equal((await engine(['Mcp(github:create_pr)']).decide(card(MCP),{interactive,mode})).kind,'allow',`${mode} ${interactive}`);
});
test('riga 91, cure 1, the other way: a TALOS service that is no outside tool is not refused by plan mode',async()=>{
  const d=await engine(['TalosService(:notes_create)']).decide(card({tipo:'notes_create',toolCallId:'n'}),{interactive:true,mode:'plan'});
  assert.equal(d.kind,'allow');
});

/* ---------- cure 2 ---------- */
test('riga 91, cure 2: the kernel card «only once» is read, in its names and in the v2 ones',()=>{
  assert.equal(card({...MCP,soloUnaVolta:true}).onlyOnce,true);
  assert.equal(v2({tool:'mcp_tool',server:'github',attrezzo:'create_pr',soloUnaVolta:true}).onlyOnce,true);
  assert.equal(card(MCP).onlyOnce,undefined,'a plain card is not «only once»');
});
test('riga 91, cure 2: on an «only once» card no allow rule and no mode says yes: the person is asked',async()=>{
  for(const mode of ['default','acceptEdits','bypassPermissions'] as const){
    const d=await engine(['Mcp(github:create_pr)']).decide(card({...MCP,soloUnaVolta:true}),{interactive:true,mode});
    assert.equal(d.kind,'ask',mode);
  }
});
test('riga 91, cure 2: with nobody in front (-p, dontAsk, automations) an «only once» card is a no, even with the rule',async()=>{
  for(const [interactive,mode] of [[false,'default'],[false,'bypassPermissions'],[true,'dontAsk']] as const){
    const d=await engine(['Mcp(github:create_pr)']).decide(card({...MCP,soloUnaVolta:true}),{interactive,mode});
    assert.equal(d.kind,'deny',`${mode} ${interactive}`);
    assert.match((d as {message:string}).message,/^in Read only a tool that runs outside TALOS runs only with the person's yes, once/u);
  }
  const asked=await engine().decide(card({...plugin('alfa','uno'),soloUnaVolta:true}),{interactive:true,mode:'default'});
  assert.match((asked as {reason:string}).reason,/^the session is in Read only/u,'the card says why it asks');
});
test('riga 91, cure 2: «for this session» or «always» on an «only once» card keeps nothing',async()=>{
  const persisted:unknown[]=[];
  for(const answer of ['allow-session','allow-always'] as const){
    const e=engine([],{persistRule:async(...args:unknown[])=>{persisted.push(args);}});
    const first=await e.decide(card({...MCP,soloUnaVolta:true}),{interactive:true,mode:'default'});
    await e.resolve((first as {requestId:string}).requestId,answer);
    assert.equal((await e.decide(card({...MCP,soloUnaVolta:true}),{interactive:true,mode:'default'})).kind,'ask',answer);
    assert.equal((await e.decide(card(MCP),{interactive:true,mode:'default'})).kind,'ask',`${answer}: no yes kept for the plain card either`);
  }
  assert.deepEqual(persisted,[]);
});
test('riga 91, cure 2: a session yes given before does not answer an «only once» card; a deny rule still refuses it',async()=>{
  const e=engine();const first=await e.decide(card(MCP),{interactive:true,mode:'default'});
  await e.resolve((first as {requestId:string}).requestId,'allow-session');
  assert.equal((await e.decide(card({...MCP,soloUnaVolta:true}),{interactive:true,mode:'default'})).kind,'ask');
  const denied=await createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:['Mcp(github:create_pr)']}}).decide(card({...MCP,soloUnaVolta:true}),{interactive:true,mode:'default'});
  assert.equal(denied.kind,'deny');
});
test('riga 91, cure 2: the «only once» card offers two choices, once and deny',()=>{
  assert.deepEqual(approvalChoicesFor(card({...MCP,soloUnaVolta:true})).map(row=>row.action),['approval-once','approval-deny-once']);
  /* 0.7.0 (giudice v2443, choice a): a plain MCP card keeps the four of 0.6.18, by name and in order, and adds only A5j's «No to this tool» at the end */
  assert.deepEqual(approvalChoicesFor(card(MCP)).map(row=>row.action),['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-tool'],'a plain card keeps the four, then «No to this tool»');
});
test('riga 91, cure 2, the other way: «Allow once» on a plain card keeps nothing, the second card asks',async()=>{
  const e=engine();const first=await e.decide(card(MCP),{interactive:true,mode:'default'});
  await e.resolve((first as {requestId:string}).requestId,'allow-once');
  assert.equal((await e.decide(card(MCP),{interactive:true,mode:'default'})).kind,'ask');
});

/* ---------- cure 4 ---------- */
test('riga 91, cure 4: the plugin and Tool Forge cards carry their plugin and tool, in the kernel names and the v2 ones',()=>{
  for(const action of [card(plugin('alfa','uno')),v2({tool:'plugin_tool',plugin:'alfa',attrezzo:'uno'})]){
    assert.equal(action.tool,'TalosService');assert.equal(action.operation,'plugin_tool');
    assert.equal(action.plugin,'alfa');assert.equal(action.outsideTool,'uno');
  }
  const f=card(forge('uno'));assert.equal(f.operation,'forge_tool');assert.equal(f.outsideTool,'uno');assert.equal(f.plugin,undefined);
});
for(const answer of ['allow-session','allow-always'] as const){
  test(`riga 91, cure 4: «${answer}» to plugin alfa/uno covers alfa/uno only (road 3)`,async()=>{
    const persisted:unknown[]=[];const e=engine([],{persistRule:async(...args:unknown[])=>{persisted.push(args);}});
    const first=await e.decide(card(plugin('alfa','uno')),{interactive:true,mode:'default'});
    assert.equal(first.kind,'ask');await e.resolve((first as {requestId:string}).requestId,answer);
    assert.equal((await e.decide(card(plugin('alfa','uno')),{interactive:true,mode:'default'})).kind,'allow');
    assert.equal((await e.decide(card(plugin('beta','due')),{interactive:true,mode:'default'})).kind,'ask','another plugin');
    assert.equal((await e.decide(card(plugin('alfa','altro')),{interactive:true,mode:'default'})).kind,'ask','another tool of the same plugin');
    assert.equal((await e.decide(card(forge('uno')),{interactive:true,mode:'default'})).kind,'ask','a Tool Forge tool of the same name');
    assert.deepEqual(persisted,[],'no rule is written for a plugin (persist.ts:31)');
  });
  test(`riga 91, cure 4: «${answer}» to Tool Forge tool uno covers uno only`,async()=>{
    const e=engine([],{persistRule:async()=>{}});
    const first=await e.decide(card(forge('uno')),{interactive:true,mode:'default'});
    await e.resolve((first as {requestId:string}).requestId,answer);
    assert.equal((await e.decide(card(forge('uno')),{interactive:true,mode:'default'})).kind,'allow');
    assert.equal((await e.decide(card(forge('due')),{interactive:true,mode:'default'})).kind,'ask');
    assert.equal((await e.decide(card(plugin('alfa','uno')),{interactive:true,mode:'default'})).kind,'ask');
  });
}
/* judge v2328: the collapsed card of a plugin or Tool Forge tool said only «TALOS service · Plugin tool», never which plugin or tool */
test('riga 91, cure 4: the collapsed card names the plugin and its tool, or the Tool Forge tool',()=>{
  const summary=(raw:Record<string,unknown>)=>approvalDialogModel({requestId:'r',sessionId:'s',action:card(raw),rawPayload:raw,reason:'x'},{expanded:false}).summary;
  assert.match(summary(plugin('alfa','uno')),/Plugin tool · plugin alfa, tool uno$/u,summary(plugin('alfa','uno')));
  assert.match(summary(forge('uno')),/ · tool uno$/u,summary(forge('uno')));
  assert.equal(summary(MCP),'MCP tool · github:create_pr','the MCP card stays as it was');
});
/* reproduction reviewer, R6 (20/11/2026): no test saw a plugin name turned to lower case in from-approval.ts. The kernel's key keeps
   names as they are (`chiaveAttrezzoDiFuori`, talosHarness.mjs:11792-11795): `Alfa` and `alfa` are two plugins, `Uno` and `uno` two tools */
for(const answer of ['allow-session','allow-always'] as const){
  test(`riga 91, cure 4: «${answer}» to plugin Alfa/Uno does not cover a plugin or a tool whose name differs only in case`,async()=>{
    const e=engine([],{persistRule:async()=>{}});
    const first=await e.decide(card(plugin('Alfa','Uno')),{interactive:true,mode:'default'});
    assert.equal(first.kind,'ask');await e.resolve((first as {requestId:string}).requestId,answer);
    assert.equal((await e.decide(card(plugin('Alfa','Uno')),{interactive:true,mode:'default'})).kind,'allow');
    assert.equal((await e.decide(card(plugin('alfa','Uno')),{interactive:true,mode:'default'})).kind,'ask','plugin alfa is not plugin Alfa');
    assert.equal((await e.decide(card(plugin('Alfa','uno')),{interactive:true,mode:'default'})).kind,'ask','tool uno is not tool Uno');
    assert.equal((await e.decide(card(forge('uno')),{interactive:true,mode:'default'})).kind,'ask');
  });
}
test('riga 91, cure 4, the other way: the MCP card keeps its (server, tool) yes as before',async()=>{
  const e=engine();const first=await e.decide(card(MCP),{interactive:true,mode:'default'});
  await e.resolve((first as {requestId:string}).requestId,'allow-session');
  assert.equal((await e.decide(card(MCP),{interactive:true,mode:'default'})).kind,'allow');
  assert.equal((await e.decide(card({...MCP,attrezzo:'merge_pr',nome:'mcp__github__merge_pr'}),{interactive:true,mode:'default'})).kind,'ask');
});

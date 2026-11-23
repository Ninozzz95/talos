/*
 * «One line», step 3 (11/11/2026, brief point a). The PC's P018 (kernel `9c3e33d8c`/`ef78b744c`) asks for an MCP tool with the card
 * `{tipo:'mcp_tool', server, attrezzo}` and keeps a «yes» for ONE (server, tool) pair (`chiaveAttrezzoMcp`, as Hermes
 * `tools/mcp_tool_handlers.py:60-64` and Codex `McpToolApprovalKey`). The terminal must read that card the same way: an `Mcp`
 * action for server `gh`, operation `x`; «always» writes `Mcp(gh:x)`, never `TalosService(:mcp_tool)`, which matched every MCP
 * call of every server. The v2 action keeps `server` and `attrezzo` as they are (protocol/v2/events.ts, `english`: unknown keys pass).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {permissionActionToRule} from '../../src/security/persist.ts';
import {approvalChoicesFor,approvalDialogModel,approvalDialogViewport} from '../../src/tui/overlays/approval-dialog.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const ROOT=process.cwd();

for(const [label,data] of [
  ['kernel event',{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x'}}],
  ['v2 action',{action:{tool:'mcp_tool',server:'gh',attrezzo:'x'}}],
] as const){
  test(`LINEA-3 a (${label}): the MCP card is an Mcp action for its server and tool`,()=>{
    const action=permissionActionFromApproval(data as any);
    assert.equal(action.tool,'Mcp');
    assert.equal(action.serverId,'gh');
    assert.equal(action.operation,'x');
  });
  test(`LINEA-3 a (${label}): «always» writes Mcp(gh:x), never a rule for every MCP call`,()=>{
    const rule=permissionActionToRule(permissionActionFromApproval(data as any),ROOT);
    assert.equal(rule,'Mcp(gh:x)');
    assert.notEqual(rule,'TalosService(:mcp_tool)');
  });
}

/* Riga 72 of 0.7.0 (owner 11/11/2026 13:34: «sempre» holds only for that pair). Rewritten: this test used to keep `Mcp(gh:*)` for a
   card without its tool, that is every tool of the server. A card names one (server, tool) pair or it writes nothing: «always» and
   «for this session» are not offered, only once and no, and an answer that arrives anyway keeps no grant and no rule (Codex offers
   remembering only with a (server, tool) key, core/src/mcp_tool_call.rs:1638-1639). */
const NO_TOOL=[{azione:{tipo:'mcp_tool',server:'gh'}},{azione:{tipo:'mcp',serverId:'gh'}},{action:{tool:'mcp_tool',server:'gh'}},{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'*'}},/* reviewer 23/11, mutants m2 and m6: a pattern at either end is not a tool */{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x*'}},{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'*x'}},{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'**'}}];
test('LINEA-3 a, riga 72: an MCP card without its tool writes no rule for the whole server',()=>{
  for(const data of NO_TOOL)
    assert.throws(()=>permissionActionToRule(permissionActionFromApproval(data as any),ROOT),(error:any)=>error?.code==='RULE_NOT_NARROWED',JSON.stringify(data));
});
test('LINEA-3 a, riga 72: an MCP card without its tool offers only once and no',()=>{
  for(const data of NO_TOOL)
    assert.deepEqual(approvalChoicesFor(permissionActionFromApproval(data as any)).map(row=>row.action),['approval-once','approval-deny-once'],JSON.stringify(data));
});
test('LINEA-3 a, riga 72: «always» or «for this session» arriving on that card keeps nothing, and the next call asks again',async()=>{
  for(const decision of ['allow-always','allow-session','deny-always'] as const){
    const written:string[]=[];
    const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},persistRule:async(effect)=>{written.push(effect);}});
    const asked=await engine.decide(permissionActionFromApproval(NO_TOOL[0] as any),{interactive:true,mode:'default'});
    assert.equal(asked.kind,'ask');await engine.resolve((asked as {requestId:string}).requestId,decision);
    assert.deepEqual(written,[],decision);
    assert.equal((await engine.decide(permissionActionFromApproval(NO_TOOL[0] as any),{interactive:true,mode:'default'})).kind,'ask',decision);
  }
});
test('LINEA-3 a, riga 72, the other way: the card with its tool keeps the four choices and writes Mcp(gh:x)',async()=>{
  const action=permissionActionFromApproval({azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x'}});
  assert.ok(approvalChoicesFor(action).some(row=>row.action==='approval-always'));
  const written:string[]=[];
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},persistRule:async(_effect,kept)=>{written.push(permissionActionToRule(kept,ROOT));}});
  const asked=await engine.decide(action,{interactive:true,mode:'default'});
  await engine.resolve((asked as {requestId:string}).requestId,'allow-always');
  assert.deepEqual(written,['Mcp(gh:x)']);
});
test('LINEA-3 a, riga 72, the other way: a Mcp(gh:*) rule the person wrote by hand still answers both cards',async()=>{
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:['Mcp(gh:*)'],ask:[],deny:[]}});
  for(const data of [NO_TOOL[0],{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x'}}])
    assert.equal((await engine.decide(permissionActionFromApproval(data as any),{interactive:false,mode:'default'})).kind,'allow',JSON.stringify(data));
});
/* riga 72, round 2 (giudice v2613): a card names one server and one tool by plain names, or it offers once and no and keeps nothing */
const ODD_SERVER=[...['*','g?','g*','?h'].flatMap(server=>[{azione:{tipo:'mcp_tool',server,attrezzo:'x'}},{action:{tool:'mcp_tool',server,attrezzo:'x'}}]),{azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x?'}}];
test('LINEA-3 a, riga 72, round 2: a server name that is not a plain name offers once and no and writes no rule',()=>{
  for(const data of ODD_SERVER){
    const action=permissionActionFromApproval(data as any);
    assert.deepEqual(approvalChoicesFor(action).map(row=>row.action),['approval-once','approval-deny-once'],JSON.stringify(data));
    assert.throws(()=>permissionActionToRule(action,ROOT),(error:any)=>error?.code==='RULE_NOT_NARROWED',JSON.stringify(data));
  }
});
test('LINEA-3 a, riga 72, round 2: on that card an arriving «always» or «for this session» keeps nothing',async()=>{
  for(const data of ODD_SERVER)for(const decision of ['allow-always','allow-session'] as const){
    const written:string[]=[];
    const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},persistRule:async(effect)=>{written.push(effect);}});
    const asked=await engine.decide(permissionActionFromApproval(data as any),{interactive:true,mode:'default'});
    assert.equal(asked.kind,'ask');await engine.resolve((asked as {requestId:string}).requestId,decision);
    assert.deepEqual(written,[],`${JSON.stringify(data)} ${decision}`);
    assert.equal((await engine.decide(permissionActionFromApproval(data as any),{interactive:true,mode:'default'})).kind,'ask',`${JSON.stringify(data)} ${decision}`);
  }
});
test('LINEA-3 a, riga 72, round 2, the other way: a plain server and tool keep the five choices',()=>{
  for(const server of ['gh','my-server_2.local'])
    assert.deepEqual(approvalChoicesFor(permissionActionFromApproval({azione:{tipo:'mcp_tool',server,attrezzo:'x'}})).map(row=>row.action),['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-tool'],server);
});

/* mutant a3 of step 3 (the card not forced to Mcp) lived: the kernel also sends `server: null` when it cannot split the name
   (talosHarness.mjs of ef78b744c, `voceDelloStrumentoMcp`: `{ server: null, attrezzo: nome }`); that card is still an MCP call */
test('LINEA-3 a: an MCP card whose server the kernel could not name is still an Mcp action, never TalosService(:mcp_tool)',()=>{
  const action=permissionActionFromApproval({azione:{tipo:'mcp_tool',server:null,attrezzo:'x'}});
  assert.equal(action.tool,'Mcp');
  assert.equal(action.operation,'x');
  let rule:string|null=null;try{rule=permissionActionToRule(action,ROOT);}catch{rule=null;}
  assert.notEqual(rule,'TalosService(:mcp_tool)');
});

test('LINEA-3 a: no rule is ever written for a whole kind of outside tool',()=>{
  for(const operation of ['mcp_tool','plugin_tool','forge_tool'])
    assert.throws(()=>permissionActionToRule({tool:'TalosService',operation} as any,ROOT),(error:any)=>error?.code==='RULE_NOT_NARROWED',operation);
});

/* switched on by riga 91 (0.6.18): P018 round 2 is on the line, its Read only card carries `soloUnaVolta` (talosHarness.mjs:15917) */
test('LINEA-3 a: in Read only, an MCP card never offers «always»',()=>{
  const choices=approvalChoicesFor(permissionActionFromApproval({azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x',soloUnaVolta:true}})).map(row=>row.action);
  assert.ok(!choices.includes('approval-always')&&!choices.includes('approval-session'),choices.join(','));
});

/* riga 72, on screen at 80×24 and 120×40, summary and full review: the card without its tool shows [1] once and [2] Deny, no [3], no
   wildcard and no `Mcp(gh:*)`; the card with its tool keeps [3] */
const lines=(view:any)=>view.lines.flatMap((line:any)=>line.kind==='row'?[line.gutter,...line.commandLines,...line.deciderLines]:[line.text]).join('\n');
test('LINEA-3 a, riga 72: on screen at 80×24 and 120×40 the card without its tool offers once and Deny only',()=>{
  for(const [columns,rows] of [[80,24],[120,40]])for(const expanded of [false,true]){
    const bare=approvalDialogModel({requestId:'r',sessionId:'s',action:permissionActionFromApproval(NO_TOOL[0] as any),rawPayload:NO_TOOL[0],reason:'no rule matched'} as any,{expanded});
    const shown=lines(approvalDialogViewport(bare,{columns,rows,scrollOffset:Number.MAX_SAFE_INTEGER}));
    const where=`${columns}×${rows} ${expanded?'review':'summary'}`;
    assert.match(shown,/\[1\] Allow once/u,where);assert.match(shown,/\[2\] Deny/u,where);
    assert.doesNotMatch(shown,/\[3\]|wildcard|Mcp\(gh:\*\)/u,where);
    const paired=approvalDialogModel({requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:{tipo:'mcp_tool',server:'gh',attrezzo:'x'}}),rawPayload:{},reason:'no rule matched'} as any,{expanded});
    assert.match(lines(approvalDialogViewport(paired,{columns,rows,scrollOffset:Number.MAX_SAFE_INTEGER})),/\[3\]/u,where);
  }
});

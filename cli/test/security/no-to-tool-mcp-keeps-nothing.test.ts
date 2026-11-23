/*
 * 0.7.0, the merge of 0.6.18 (giudice v2443, 21/11/2026, choice a): «No to this tool until your next message» (A5j) stays on the MCP
 * card too, next to riga 91 of 0.6.18. Measured here, with the real engine and the real coordinator:
 *  (a) the no leaves no yes behind: the next card of ANOTHER tool of the same server still asks (and so does the same tool's: the
 *      kernel holds the no for the turn, the CLI keeps nothing);
 *  (b) it saves no permission rule;
 *  (c) it leaves the deny rules as they were: a deny rule already there refuses as before.
 * And riga 91, cure 2, with the tool named: the «only once» card of an MCP, plugin or Tool Forge tool keeps its two choices.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';

const ROOT=process.cwd();
const mcp=(tool:string)=>({tipo:'mcp_tool',nome:`mcp__github__${tool}`,server:'github',attrezzo:tool,toolCallId:`c-${tool}`});
const card=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione});

function setup(deny:string[]=[]){
  const persisted:unknown[]=[];const answers:unknown[][]=[];
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny},persistRule:async(...args:unknown[])=>{persisted.push(args);}});
  const coordinator=createApprovalCoordinator({engine,answer:async(...args:unknown[])=>{answers.push(args);},interactive:true,mode:'default'});
  return{engine,coordinator,persisted,answers};
}
async function noToTool(s:ReturnType<typeof setup>,tool:string,id:string){
  const r=await s.coordinator.request('s1',id,card(mcp(tool)));
  assert.equal(r.pending,true,`${tool}: the card is shown`);
  await s.coordinator.resolve(id,'deny-tool');
  assert.deepEqual(s.answers.at(-1),['s1',id,false,{ambito:'strumento'}],'the kernel hears a no with the tool scope');
}

test('No to this tool on an MCP card (a): the next card of another tool of the same server still asks, and so does the same tool',async()=>{
  const s=setup();
  await noToTool(s,'create_pr','q1');
  for(const tool of ['merge_pr','create_pr']){
    const d=await s.engine.decide(card(mcp(tool)),{interactive:true,mode:'default',sessionId:'s1'});
    assert.equal(d.kind,'ask',`${tool}: no yes was left behind`);
  }
});

test('No to this tool on an MCP card (b): no permission rule is saved',async()=>{
  const s=setup();
  await noToTool(s,'create_pr','q1');
  await noToTool(s,'merge_pr','q2');
  assert.deepEqual(s.persisted,[],'nothing persisted');
});

test('No to this tool on an MCP card (c): a deny rule already there refuses as before',async()=>{
  const ctx={interactive:true,mode:'default' as const,sessionId:'s1'};
  const before=setup(['Mcp(github:delete_repo)']);
  const refusedBefore=await before.engine.decide(card(mcp('delete_repo')),ctx);
  assert.equal(refusedBefore.kind,'deny','the deny rule refuses before any no');
  const s=setup(['Mcp(github:delete_repo)']);
  await noToTool(s,'create_pr','q1');
  const refusedAfter=await s.engine.decide(card(mcp('delete_repo')),ctx);
  assert.deepEqual(refusedAfter,refusedBefore,'the same refusal after the no');
  assert.equal((await s.engine.decide(card(mcp('merge_pr')),ctx)).kind,'ask','a tool the deny rule does not name still asks');
});

test('riga 91, cure 2, with the tool named: the «only once» card of an MCP, plugin or Tool Forge tool offers once and deny only',()=>{
  const cards=[
    {...mcp('create_pr'),soloUnaVolta:true},
    {tipo:'plugin_tool',nome:'plugin__alfa__uno',plugin:'alfa',attrezzo:'uno',toolCallId:'p1',soloUnaVolta:true},
    {tipo:'forge_tool',nome:'forge_uno',attrezzo:'uno',toolCallId:'f1',soloUnaVolta:true},
  ];
  for(const raw of cards){
    const action=card(raw);
    assert.equal(action.onlyOnce,true,raw.tipo);
    if(raw.tipo!=='mcp_tool')assert.equal(action.outsideTool,'uno',`${raw.tipo}: the tool is named`);
    else assert.equal(action.operation,'create_pr','mcp: the tool is named');
    assert.deepEqual(approvalChoicesFor(action).map(row=>row.action),['approval-once','approval-deny-once'],raw.tipo);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';
import {agentRosterLine} from '../../src/tui/components/terminal-shell.ts';
import {
  agentTreeOverlayLines,
  createAgentTreeOverlayModel,
  moveAgentTreeSelection,
  selectedAgentRow,
} from '../../src/tui/overlays/agent-tree.ts';
import type {AgentRosterRow} from '../../src/tui/agent-roster.ts';

function row(overrides:Partial<AgentRosterRow>={}):AgentRosterRow{
  return{
    id:'main',parentId:null,level:0,nativeDepth:0,role:'main',focused:true,
    name:'main',task:null,model:'openai:gpt-5',outcome:'running',interrupted:false,
    startedAt:'2026-09-20T20:00:00.000Z',updatedAt:'2026-09-20T20:00:10.000Z',endedAt:null,
    usage:null,collisionCount:0,hasCollision:false,delegationOutcome:null,delegationEvidence:null,
    ...overrides,
  };
}

test('agent overlay selection preserves the full native hierarchy',()=>{
  const rows=[
    row(),
    row({id:'child',parentId:'main',level:1,nativeDepth:1,role:'subagent',focused:false,task:'inspect auth flow'}),
    row({id:'grandchild',parentId:'child',level:2,nativeDepth:2,role:'subagent',focused:false,task:'trace token write'}),
  ];
  const original=createAgentTreeOverlayModel(rows,'child');
  assert.equal(original.rows.length,3);
  assert.equal(selectedAgentRow(original)?.id,'child');
  const moved=moveAgentTreeSelection(original,1);
  assert.equal(selectedAgentRow(moved)?.id,'grandchild');
  assert.deepEqual(moved.rows.map(item=>[item.id,item.parentId,item.level]),[
    ['main',null,0],['child','main',1],['grandchild','child',2],
  ]);
});

test('roster and overlay expose measured status duration task model and escalate collisions',()=>{
  const collision=row({
    id:'child',parentId:'main',level:1,nativeDepth:1,role:'subagent',focused:false,
    task:'merge generated files',model:'openai:gpt-5-mini',outcome:'failed',
    startedAt:'2026-09-20T20:00:00.000Z',endedAt:'2026-09-20T20:01:05.000Z',
    collisionCount:2,hasCollision:true,
  });
  const line=agentRosterLine({row:collision,width:100,nowMs:Date.parse('2026-09-20T20:02:00.000Z')});
  assert.ok(displayWidth(line)<=100);
  assert.match(line,/^  · agent/u);
  assert.match(line,/merge generated files/u);
  assert.match(line,/openai:gpt-5-mini/u);
  assert.match(line,/1m 5s/u);
  assert.match(line,/COLLISION 2/u);
  const constrained=agentRosterLine({row:{...collision,task:'a '.repeat(80)},width:48,nowMs:Date.parse('2026-09-20T20:02:00.000Z')});
  assert.match(constrained,/COLLISION 2/u);

  const model=createAgentTreeOverlayModel([row(),collision],'child');
  const lines=agentTreeOverlayLines(model,{width:100,nowMs:Date.parse('2026-09-20T20:02:00.000Z'),currentSessionId:'main',running:true});
  assert.ok(lines.some(value=>/COLLISION 2/u.test(value)));
  /* P13 (owner decision 2026-09-26): a sub-agent is watched live, read-only; it is still never steered. */
  assert.ok(lines.some(value=>/Enter watch live/u.test(value)));
  assert.equal(lines.some(value=>/Alt\+S steer/u.test(value)),false);
  const narrow=agentTreeOverlayLines(model,{width:24,nowMs:Date.now(),currentSessionId:'main',running:true});
  assert.ok(narrow.every(value=>displayWidth(value)<=24));
});

test('steering guidance is shown only for the already attached active session',()=>{
  const rows=[row(),row({id:'child',parentId:'main',level:1,nativeDepth:1,role:'subagent',focused:false})];
  const main=createAgentTreeOverlayModel(rows,'main');
  const active=agentTreeOverlayLines(main,{width:100,nowMs:Date.now(),currentSessionId:'main',running:true});
  assert.ok(active.some(value=>/Alt\+S steer active session/u.test(value)));

  const child=createAgentTreeOverlayModel(rows,'child');
  const childLines=agentTreeOverlayLines(child,{width:100,nowMs:Date.now(),currentSessionId:'main',running:true});
  assert.equal(childLines.some(value=>/Alt\+S steer/u.test(value)),false);
  assert.ok(childLines.some(value=>/Enter watch live/u.test(value)));
});

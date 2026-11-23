/*
 * P14 (owner, 2026-09-25, "lo spinner thinking rimane in conteggio quando gli agenti vengono dispacciati"): a tool row is
 * born `queued` and turns `running` only after an approval or `streaming` only when it prints, so a tool that runs
 * silently without asking — the delegation, which waits for its sub-agents — was not active and the line said
 * "thinking" with its clock running. Now `queued` is active, and delegations say how many agents are working.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveLiveActivity} from '../../src/tui/live-activity.ts';
import {activityWord} from '../../src/tui/components/status-indicator.ts';
import {activityHeader} from '../../src/tui/activity-line.ts';

const base={running:true,reasoning:null,streamingAssistant:null};
const row=(name:string,status:string)=>({name,status});

test('P14: a silent tool without approval (queued) is running, not thinking',()=>{
  const live=deriveLiveActivity({...base,tools:[row('leggi','queued')]},1000);
  assert.equal(live.kind,'tool');
  assert.ok(live.tool&&live.tool.length>0,'the tool is named');
});

test('P14: delegations say how many agents are working, in the line and in the roster word',()=>{
  const one=deriveLiveActivity({...base,tools:[row('delega_sottotask','queued')]},1000);
  assert.deepEqual({kind:one.kind,agents:one.agents},{kind:'agents',agents:1});
  const two=deriveLiveActivity({...base,tools:[row('delega_sottotask','queued'),row('delega_sottotask','running'),row('leggi','completed')]},1000);
  assert.deepEqual({kind:two.kind,agents:two.agents},{kind:'agents',agents:2});
  assert.equal(activityWord('agents',undefined,1),'1 agent working');
  assert.equal(activityWord('agents',undefined,2),'2 agents working');
  /* Stage 4: the activity line of the mockup names the delegation («Delegating to 3 agents»). */
  assert.equal(activityHeader({...base,tools:[]} as any,{kind:'agents',startedAt:0,agents:2}),'Delegating to 2 agents');
});

test('P14: when the delegations end, the parent is thinking again (the model reads their results)',()=>{
  const after=deriveLiveActivity({...base,tools:[row('delega_sottotask','completed'),row('delega_sottotask','completed')]},1000);
  assert.equal(after.kind,'thinking');
});

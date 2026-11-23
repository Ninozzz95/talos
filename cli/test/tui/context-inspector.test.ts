import assert from 'node:assert/strict';
import test from 'node:test';
import {contextInspectorLines} from '../../src/tui/overlays/context-inspector.ts';
import {buildContextStatus,unavailableContextStatus} from '../../src/runtime/context-status.ts';

test('context inspector states measurement provenance, 50% trigger, cache and cost provenance',()=>{
  const status=buildContextStatus({sessionId:'s',snapshot:{
    revision:2,settings:{auto:true,triggerRatio:0.5},measurement:{revision:2,measuredAt:'2026-09-20T20:00:00.000Z',tokens:{
      inputTokens:50_000,windowTokens:200_000,responseReserve:8_000,method:'provider',exact:false,requestHash:'h',
    }},activeVersion:{id:'v',sourceIds:['a','b'],summary:{sources:[]}},
  },sessionUsage:{promptTokens:10_000,completionTokens:2_000,cachedTokens:2_500,turns:1,executions:1}});
  const lines=contextInspectorLines(status,{width:120});
  assert.ok(lines.some(line=>/25%/u.test(line)));
  assert.ok(lines.some(line=>/50%/u.test(line)));
  assert.ok(lines.some(line=>/effective input budget/iu.test(line)));
  assert.ok(lines.some(line=>/provider measurement/u.test(line)));
  assert.ok(lines.some(line=>/cache.*25%/iu.test(line)));
  assert.ok(lines.some(line=>/cost.*not reported/iu.test(line)));
  assert.ok(lines.some(line=>/sources.*2/iu.test(line)));
});

test('unknown context profile shows the 50% policy but no current occupancy percentage',()=>{
  const lines=contextInspectorLines(unavailableContextStatus('s','profile-unavailable'),{width:100});
  assert.ok(lines.some(line=>/trigger 50%/iu.test(line)));
  assert.equal(lines.some(line=>/Measured context.*%/iu.test(line)),false);
  assert.ok(lines.some(line=>/not measured|unavailable/iu.test(line)));
});

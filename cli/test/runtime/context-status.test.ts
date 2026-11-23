import assert from 'node:assert/strict';
import test from 'node:test';
import {buildContextStatus,unavailableContextStatus} from '../../src/runtime/context-status.ts';

const snapshot={
  schema:'talos.context.snapshot.v1',sessionId:'s1',revision:7,stateRevision:9,headSequence:12,
  settings:{auto:true,triggerRatio:0.5,targetRatio:0.4,retainRecentTurns:2,focus:'',nativeMode:'off',semanticSearch:true},
  measurement:{schema:'talos.context.measurement.v1',revision:7,measuredAt:'2026-09-20T20:00:00.000Z',tokens:{
    schema:'talos.context.tokens.v1',inputTokens:40_000,windowTokens:100_000,responseReserve:8_000,
    method:'provider',exact:false,requestHash:'abc',
  }},
  activeVersion:{id:'v1',sourceIds:['m1','m2','m3'],summary:{sources:[{recordId:'m1',quote:'x'}]}},
  usage:null,
};

test('context status percentage comes only from prepared-context measurement, never whole-session usage',()=>{
  const status=buildContextStatus({
    sessionId:'s1',snapshot,
    sessionUsage:{promptTokens:90_000,completionTokens:20_000,cachedTokens:18_000,turns:3,executions:3},
  });
  assert.equal(status.available,true);
  assert.equal(status.measurement?.inputTokens,40_000);
  assert.equal(status.measurement?.percentOfWindow,40);
  assert.equal(status.measurement?.method,'provider');
  assert.equal(status.measurement?.exact,false);
  assert.equal(status.measurement?.stale,false);
  assert.equal(status.autoCompaction.enabled,true);
  assert.equal(status.autoCompaction.triggerRatio,0.5);
  assert.equal(status.autoCompaction.triggerPercent,50);
  assert.equal(status.budget?.safetyMarginTokens,5_000);
  assert.equal(status.budget?.inputLimitTokens,87_000);
  assert.equal(status.budget?.triggerTokens,43_500);
  assert.equal(status.cache.percent,20);
  assert.equal(status.cache.provenance,'whole-session measured usage');
  assert.equal(status.cost.usd,null);
  assert.equal(status.cost.provenance,'not reported by runtime');
  assert.equal(status.sources.activeSourceCount,3);
});

test('unknown or stale context measurement never becomes a current percentage claim',()=>{
  const unavailable=unavailableContextStatus('s2','profile-unavailable');
  assert.equal(unavailable.measurement,null);
  assert.equal(unavailable.autoCompaction.triggerRatio,0.5);
  assert.equal(unavailable.available,false);

  const stale=buildContextStatus({sessionId:'s1',snapshot:{...snapshot,revision:8},sessionUsage:null});
  assert.equal(stale.measurement?.stale,true);
  assert.equal(stale.measurement?.percentOfWindow,40);
});

test('missing cache evidence stays not measured rather than zero',()=>{
  const status=buildContextStatus({
    sessionId:'s1',snapshot,
    sessionUsage:{promptTokens:1000,completionTokens:100,cachedTokens:null,turns:1,executions:1},
  });
  assert.equal(status.cache.cachedTokens,null);
  assert.equal(status.cache.percent,null);
  assert.equal(status.cache.provenance,'not measured');
});

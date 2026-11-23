/*
 * R5a (coordinator wiring, lanes R and S hand-backs): the status row reads lane R's facts as lane R defined them.
 * - `inputTokens`/`outputTokens` are the RUN's totals; the context in use is `contextTokens` (the last request's input plus
 *   output, Pi's rule): `ctx used/window` must show the latter, or a run of many requests reads as a full window.
 * - A cost the provider declared (`costSource: 'provider-reported'`) is not an estimate: `$`, not `~$` (Q-R5-5, E1).
 * - The compaction count is the screen's count of `context.compacted` events (Q-R5-4), passed to usageSnapshot.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';
import {statusBar} from '../../src/tui/status-bar.ts';
import {usageFacts} from '../../src/tui/usage-view.ts';

const snapshot=(over:Record<string,unknown>={})=>({inputTokens:50_000,outputTokens:1_200,cachedTokens:null,windowTokens:131_072,percent:2,estimated:false,costUsd:0.004,costSource:'models.dev 2026-09-24',local:false,compactions:0,contextTokens:3_100,...over}) as any;
const row=(s:any)=>statusBar({snapshot:s,model:'openai:gpt-test',width:200,safety:{fullAccess:false,noSandbox:false}}).text;

test('R5a wiring: ctx shows the context in use (contextTokens), not the run\'s input total',()=>{
  const text=row(snapshot());
  assert.match(text,/ctx 3\.1k\/131k 2%/u,text);
  assert.match(text,/↑50k ↓1\.2k/u,`the run totals stay on the token segment: ${text}`);
});

test('R5a wiring: a provider-reported cost has no ~, a list-price cost keeps it',()=>{
  assert.match(row(snapshot({costSource:'provider-reported'})),/(?:^|\s)\$0\.004\b/u);
  assert.doesNotMatch(row(snapshot({costSource:'provider-reported'})),/~\$/u);
  assert.match(row(snapshot()),/~\$0\.004/u);
});

test('R5a wiring: the screen counts compactions and hands the count to usageSnapshot',()=>{
  let state=initialTuiState({model:'ollama:qwen3',permissionMode:'default'}) as any;
  for(let i=0;i<2;i++)state=reduceTuiEvent(state,{type:'context.compacted',engine:'kernel',messagesSummarized:4,tokensBefore:null,tokensAfter:null,eventId:`c${i}`} as any);
  assert.equal(state.compactions,2);
  const facts=usageFacts({model:'ollama:qwen3',usage:null,contextStatus:null,compactions:state.compactions} as any);
  assert.equal(facts.snapshot?.compactions,2);
});

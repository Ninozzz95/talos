import assert from 'node:assert/strict';
import test from 'node:test';

import {createEventBridge} from '../../src/events/bridge.ts';
import {createRunResultAccumulator,reduceRunResult,renderJson} from '../../src/headless/result.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';
import {renderTool} from '../../src/tui/tools/registry.ts';

const receipt=(overrides:Record<string,unknown>={})=>({
  schema_version:1,
  azione:'shell',
  toolCallId:'tool-1',
  consentito:true,
  via:'permesso-per-attrezzo-sempre',
  motivo:null,
  status:'succeeded',
  risk:'R2',
  evidence:{exitCode:0,sandboxEnforcement:'windows-sandbox'},
  ...overrides,
});

test('M4-E RED: TUI tracks truthful queued → approval → running → streaming → completed lifecycle with structured evidence',()=>{
  const adapter=createTuiEventAdapter();
  adapter.bindSession('s1');
  let state=initialTuiState({model:'m',permissionMode:'ask'});
  const feed=(raw:Record<string,unknown>)=>{
    const event=adapter.translate(raw);
    assert.ok(event, `expected translated event for ${String(raw.type)}`);
    state=reduceTuiEvent(state,event);
  };

  feed({type:'ToolCallStart',toolCallId:'tool-1',toolCallName:'Bash'});
  assert.equal(state.tools[0]?.status,'queued');

  feed({type:'ApprovalRequested',requestId:'approval-1',azione:{tipo:'shell',comando:'npm test',toolCallId:'tool-1'}});
  assert.equal(state.tools[0]?.status,'approval');
  assert.equal(state.approval?.toolCallId,'tool-1');

  feed({type:'ApprovalResolved',requestId:'approval-1',approvato:true});
  assert.equal(state.tools[0]?.status,'running');

  feed({type:'ToolCallOutput',toolCallId:'tool-1',delta:'running tests'});
  assert.equal(state.tools[0]?.status,'streaming');

  feed({type:'ToolCallResult',toolCallId:'tool-1',content:'ok',receipt:receipt()});
  const row=state.tools[0]!;
  assert.equal(row.status,'completed');
  assert.deepEqual(row.outcome,{
    toolCallId:'tool-1',
    status:'completed',
    content:'ok',
    receiptStatus:'succeeded',
    exitCode:0,
    enforcement:'windows-sandbox',
    /* 0.6.15 (0614b F-L-001): the screen reads the receipt through v2, so the permission's way is in English */
    allowed:true,
    permissionVia:'tool-always-allowed',
    permissionReason:null,
    risk:'R2',
  });

  const compact=renderTool(row,80,false);
  const expanded=renderTool(row,80,true);
  assert.doesNotMatch(compact.detailLines.join('\n'),/enforcement|permission|exit 0/iu);
  assert.match(expanded.detailLines.join('\n'),/exit 0/iu);
  assert.match(expanded.detailLines.join('\n'),/enforcement.*windows-sandbox/iu);
  assert.match(expanded.detailLines.join('\n'),/permission.*allowed.*tool-always-allowed/iu);
});

test('M4-E RED: failed, cancelled and effect-unknown terminal facts are never recovered from prose',()=>{
  const adapter=createTuiEventAdapter();
  adapter.bindSession('s1');
  let state=initialTuiState({model:'m',permissionMode:'ask'});
  const feed=(raw:Record<string,unknown>)=>{
    const event=adapter.translate(raw);
    assert.ok(event);
    state=reduceTuiEvent(state,event);
  };

  feed({type:'ToolCallStart',toolCallId:'failed-1',toolCallName:'Bash'});
  feed({
    type:'ToolCallResult',
    toolCallId:'failed-1',
    content:'looks harmless',
    receipt:receipt({
      toolCallId:'failed-1',
      consentito:true,
      status:'failed',
      evidence:{exitCode:7,sandboxEnforcement:'none'},
    }),
  });
  assert.equal(state.tools.find(row=>row.id==='failed-1')?.status,'failed');
  assert.equal(state.tools.find(row=>row.id==='failed-1')?.outcome?.exitCode,7);

  feed({type:'ToolCallStart',toolCallId:'cancel-1',toolCallName:'Bash'});
  feed({type:'ToolCallResult',toolCallId:'cancel-1',content:'ordinary words only',outcome:'cancelled'});
  assert.equal(state.tools.find(row=>row.id==='cancel-1')?.status,'cancelled');

  feed({type:'ToolCallStart',toolCallId:'unknown-1',toolCallName:'Write'});
  feed({
    type:'ToolCallResult',
    toolCallId:'unknown-1',
    content:'written',
    receipt:receipt({toolCallId:'unknown-1',status:'effect_unknown',evidence:null}),
  });
  assert.equal(state.tools.find(row=>row.id==='unknown-1')?.status,'unknown');
});

test('M4-E RED: headless retains the same normalized tool outcome internally while v1 event/result bytes stay enumerable-compatible',()=>{
  const bridge=createEventBridge('session-1',()=> '2026-09-20T15:30:00.000Z');

  /* F-ENG-5 (owner 09/10/2026, «Tengo la cura nel v1»): v1 stays frozen in the events and fields it had, and gains one addition:
     each call's result, as a `tool.completed` (a type v1 already had) with `content`, `status` and, for a command, `exitCode`.
     The internal evidence below is unchanged. */
  const result1=bridge.translate({
    type:'ToolCallResult',
    toolCallId:'tool-1',
    content:'ok',
    receipt:receipt(),
  });
  assert.equal(JSON.stringify(result1),JSON.stringify({schema:'talos.cli.event.v1',seq:1,ts:'2026-09-20T15:30:00.000Z',sessionId:'session-1',type:'tool.completed',data:{toolCallId:'tool-1',content:'ok',status:'completed',exitCode:0}}),'the one addition to v1, and nothing else');

  const terminal=bridge.translate({type:'RunFinished',result:{detto:'ok'}});
  assert.ok(terminal);
  const outcomes=(terminal as any).toolOutcomes;
  assert.deepEqual(outcomes,[{
    toolCallId:'tool-1',
    status:'completed',
    content:'ok',
    receiptStatus:'succeeded',
    exitCode:0,
    enforcement:'windows-sandbox',
    allowed:true,
    permissionVia:'permesso-per-attrezzo-sempre',
    permissionReason:null,
    risk:'R2',
  }]);
  assert.equal(Object.keys(terminal as any).includes('toolOutcomes'),false);
  assert.equal(
    JSON.stringify(terminal),
    JSON.stringify({
      schema:'talos.cli.event.v1',
      seq:2,
      ts:'2026-09-20T15:30:00.000Z',
      sessionId:'session-1',
      type:'run.completed',
      data:{result:{detto:'ok'}},
    }),
  );

  const result=reduceRunResult([terminal]);
  assert.deepEqual((result as any).toolOutcomes,outcomes);
  assert.equal(Object.keys(result as any).includes('toolOutcomes'),false);
  assert.equal(
    renderJson(result),
    '{"schema":"talos.cli.result.v1","ok":true,"sessionId":"session-1","result":{"text":"","outcome":"success","changedFiles":[],"usage":null},"warnings":[]}\n',
  );
});

test('M4-E RED: receipt text is redacted before it reaches normalized TUI evidence',()=>{
  const adapter=createTuiEventAdapter(['sekret']);
  adapter.bindSession('s1');
  const event=adapter.translate({
    type:'ToolCallResult',
    toolCallId:'tool-secret',
    content:'done sekret',
    receipt:receipt({
      toolCallId:'tool-secret',
      motivo:'because sekret',
      evidence:{exitCode:1,sandboxEnforcement:'none'},
    }),
  });
  assert.ok(event&&event.type==='tool.completed');
  assert.doesNotMatch(JSON.stringify(event),/sekret/u);
  assert.match(JSON.stringify(event),/REDACTED/u);
});

test('M4-E review RED: approval resolution without an explicit boolean never implies approval',()=>{
  const adapter=createTuiEventAdapter();
  adapter.bindSession('s1');
  let state=initialTuiState({model:'m',permissionMode:'ask'});
  const feed=(raw:Record<string,unknown>)=>{
    const event=adapter.translate(raw);
    assert.ok(event);
    state=reduceTuiEvent(state,event);
  };

  feed({type:'ToolCallStart',toolCallId:'approval-unknown',toolCallName:'Bash'});
  feed({type:'ApprovalRequested',requestId:'approval-unknown-r1',azione:{tipo:'shell',toolCallId:'approval-unknown'}});
  assert.equal(state.tools.find(row=>row.id==='approval-unknown')?.status,'approval');

  const resolved=adapter.translate({type:'ApprovalResolved',requestId:'approval-unknown-r1'});
  assert.ok(resolved&&resolved.type==='approval.resolved');
  assert.equal(resolved.approved,undefined);
  state=reduceTuiEvent(state,resolved);

  assert.equal(
    state.tools.find(row=>row.id==='approval-unknown')?.status,
    'approval',
    'missing approval verdict must not be converted to running',
  );

  let transcript=createTranscriptModel();
  transcript=reduceTranscriptEvent(transcript,{type:'tool.started',toolCallId:'approval-unknown',toolName:'Bash'});
  transcript=reduceTranscriptEvent(transcript,{type:'approval.required',requestId:'approval-unknown-r1',payload:{tipo:'shell',toolCallId:'approval-unknown'},toolCallId:'approval-unknown'});
  transcript=reduceTranscriptEvent(transcript,resolved);
  const transcriptTool=transcript.items.find((item:any)=>item.id==='tool:approval-unknown') as any;
  assert.equal(
    transcriptTool?.status,
    'approval',
    'semantic transcript must not invent approval when the verdict field is missing',
  );
});

test('M4-E review RED: hidden tool outcomes survive the sequence-offset spread used by headless collection',()=>{
  const bridge=createEventBridge('session-offset',()=> '2026-09-20T15:31:00.000Z');
  assert.equal(bridge.translate({
    type:'ToolCallResult',
    toolCallId:'tool-offset',
    content:'ok',
    receipt:receipt({toolCallId:'tool-offset'}),
  })?.type,'tool.completed','F-ENG-5: the one public addition to v1');

  const terminal=bridge.translate({type:'RunFinished',result:{detto:'ok'}});
  assert.ok(terminal);
  const shifted={...terminal,seq:terminal.seq+1};
  assert.deepEqual((reduceRunResult([shifted as any]) as any).toolOutcomes,[{
    toolCallId:'tool-offset',
    status:'completed',
    content:'ok',
    receiptStatus:'succeeded',
    exitCode:0,
    enforcement:'windows-sandbox',
    allowed:true,
    permissionVia:'permesso-per-attrezzo-sempre',
    permissionReason:null,
    risk:'R2',
  }]);
  assert.equal(Object.keys(shifted).includes('toolOutcomes'),false);
  assert.equal(JSON.stringify(shifted).includes('toolOutcomes'),false);
});

test('M4-E review RED: a locally synthesized headless failure retains tool outcomes already observed by the bridge',()=>{
  const bridge=createEventBridge('session-local-fail',()=> '2026-09-20T15:32:00.000Z');
  const started=bridge.translate({type:'RunStarted',sessionId:'session-local-fail',runId:'run-1'});
  assert.ok(started);
  const shiftedStarted={...started,seq:started.seq+1};

  const accumulator=createRunResultAccumulator();
  accumulator.add(shiftedStarted as any);

  assert.equal(bridge.translate({
    type:'ToolCallResult',
    toolCallId:'tool-before-fail',
    content:'ok',
    receipt:receipt({toolCallId:'tool-before-fail'}),
  })?.type,'tool.completed','F-ENG-5: the one public addition to v1');

  accumulator.add({
    schema:'talos.cli.event.v1',
    seq:shiftedStarted.seq+1,
    ts:'2026-09-20T15:32:01.000Z',
    sessionId:'session-local-fail',
    type:'run.failed',
    data:{code:'PERMISSION_REQUIRED',message:'approval required'},
  });

  assert.deepEqual((accumulator.result() as any).toolOutcomes,[{
    toolCallId:'tool-before-fail',
    status:'completed',
    content:'ok',
    receiptStatus:'succeeded',
    exitCode:0,
    enforcement:'windows-sandbox',
    allowed:true,
    permissionVia:'permesso-per-attrezzo-sempre',
    permissionReason:null,
    risk:'R2',
  }]);
});


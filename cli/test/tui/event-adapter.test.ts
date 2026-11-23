import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createV2EventBridge,createV2RunResultAccumulator} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';

test('M7-D RED — TUI projection uses the canonical v2 identity and keeps complete tool truth',()=>{
  const adapter=createTuiEventAdapter(['sekret']);
  adapter.bindSession('s1');
  assert.deepEqual(
    adapter.translate({type:'RunStarted',_sequenza:1,sessionId:'s1',runId:'r1'}),
    {type:'run.started',sessionId:'s1',runId:'r1',eventId:'talos:s1:native:1'}
  );
  assert.deepEqual(
    adapter.translate({type:'ToolCallStart',_sequenza:2,toolCallId:'t1',toolCallName:'bash'}),
    {type:'tool.started',toolCallId:'t1',toolName:'bash',eventId:'talos:s1:native:2'}
  );
  assert.deepEqual(
    adapter.translate({type:'ToolCallArgs',_sequenza:3,toolCallId:'t1',delta:'{"command":"echo'}),
    {type:'tool.args',toolCallId:'t1',delta:'{"command":"echo',eventId:'talos:s1:native:3'}
  );
  assert.deepEqual(
    adapter.translate({type:'ToolCallOutput',_sequenza:4,toolCallId:'t1',delta:'live sekret'}),
    {type:'tool.output',toolCallId:'t1',delta:'live [REDACTED:6]',eventId:'talos:s1:native:4'}
  );
  const completed:any=adapter.translate({
    type:'ToolCallResult',_sequenza:5,toolCallId:'t1',content:'done',
    receipt:{
      status:'succeeded',consentito:true,via:'rule',motivo:'explicit allow',risk:'low',
      evidence:{exitCode:0,sandboxEnforcement:'windows-sandbox',backend:'mxc'}
    }
  });
  assert.equal(completed?.type,'tool.completed');
  assert.equal(completed?.eventId,'talos:s1:native:5');
  assert.deepEqual(completed?.result,{
    toolCallId:'t1',
    status:'completed',
    content:'done',
    receipt:{status:'succeeded',allowed:true,via:'rule',reason:'explicit allow',risk:'low'},
    enforcement:{
      exitCode:0,requested:null,applied:null,sandbox:'windows-sandbox',backend:'mxc',
      appContainer:null,filesystem:null,network:null,processTree:null,sandboxSpecVersion:null
    }
  });
  assert.deepEqual(completed?.outcome,{
    toolCallId:'t1',status:'completed',content:'done',receiptStatus:'succeeded',exitCode:0,
    enforcement:'windows-sandbox',allowed:true,permissionVia:'rule',permissionReason:'explicit allow',risk:'low'
  });
  assert.deepEqual(
    adapter.translate({type:'StateDelta',_sequenza:6,delta:[{op:'replace',path:'/usage',value:{prompt_tokens:12,completion_tokens:3}}]}),
    {type:'usage.updated',value:{prompt_tokens:12,completion_tokens:3},eventId:'talos:s1:native:6'}
  );
});

test('R0 — usage counters stay numbers on screen and in v2 result.usage while secret-named keys are masked, never dropped',()=>{
  const counters={
    prompt_tokens:12,completion_tokens:3,total_tokens:15,
    prompt_tokens_details:{cached_tokens:4},completion_tokens_details:{reasoning_tokens:2},
    input_tokens:20,output_tokens:5,cache_read_input_tokens:6,cache_creation_input_tokens:7,
    'gen_ai.usage.input_tokens':20,'gen_ai.usage.output_tokens':5,'gen_ai.usage.cache_read.input_tokens':6,
    'gen_ai.usage.cache_write.input_tokens':7,'gen_ai.usage.reasoning.output_tokens':2,
    token_count:17,
  };
  const secrets={api_key:'fake-key-1',Authorization:'Bearer fake-2',access_token:'fake-3'};
  const masked={api_key:'[REDACTED:10]',Authorization:'[REDACTED:13]',access_token:'[REDACTED:6]'};
  const raw={type:'StateDelta',_sequenza:7,delta:[{op:'replace',path:'/usage',value:{...counters,...secrets}}]};

  const canonical=createV2EventBridge('s1',()=> '2026-09-23T09:00:00.000Z').translate(raw);
  assert.equal(canonical?.type,'usage.updated');
  assert.deepEqual(canonical?.data,{value:{...counters,...masked}});
  const accumulator=createV2RunResultAccumulator();
  accumulator.add(canonical!);
  const result:any=accumulator.result();
  assert.deepEqual(result.result.usage,{...counters,...masked});

  const adapter=createTuiEventAdapter();
  adapter.bindSession('s1');
  const tui:any=adapter.translate(raw);
  assert.deepEqual(tui,{type:'usage.updated',value:{...counters,...masked},eventId:'talos:s1:native:7'});
  assert.equal(reduceTuiEvent(initialTuiState({model:'m',permissionMode:'default'}),tui).status.contextLabel,'12+3');

  const approval:any=createTuiEventAdapter().translate(createV2EventBridge('s1',()=> '2026-09-23T09:00:00.000Z').translate({
    type:'ApprovalRequested',_sequenza:8,requestId:'approval-2',
    azione:{tool:'http',toolCallId:'tool-2',headers:{...secrets},env:{GITHUB_TOKEN:'fake-4'},max_tokens:100}
  }));
  assert.deepEqual(approval?.payload,{
    /* R2 lane J (E11): v2 approvals carry the on-screen tool name from the tool table. */
    tool:'http',displayName:'Http',toolCallId:'tool-2',headers:{...masked},env:{GITHUB_TOKEN:'[REDACTED:6]'},max_tokens:100
  });
  for(const leaked of ['fake-key-1','fake-2','fake-3','fake-4']){
    assert.equal(JSON.stringify([canonical,result,tui,approval]).includes(leaked),false,leaked);
  }
});

test('M7-D RED — TUI run failure retains the exact canonical redacted TALOS error envelope',()=>{
  const adapter=createTuiEventAdapter(['sekret']);
  adapter.bindSession('s1');
  adapter.translate({type:'RunStarted',_sequenza:10,sessionId:'s1',runId:'run-1'});
  const raw={
    type:'RunError',_sequenza:11,runId:'run-1',code:'PROVIDER_UNREACHABLE',
    message:'offline sekret',component:'provider',retryable:true,traceId:'trace-1',
    hint:'retry later',docs:'https://example.invalid/provider'
  };
  const canonical=createV2EventBridge('s1',()=> '2026-09-21T09:00:00.000Z',['sekret']).translate(raw);
  const tui:any=adapter.translate(raw);
  assert.ok(canonical);
  assert.equal(tui?.type,'run.failed');
  assert.equal(tui?.eventId,canonical.eventId);
  assert.equal(tui?.runId,'run-1');
  assert.deepEqual(tui?.error,canonical.data.error);
  // R2 lane E realignment (gate E4, Q-R2-4): the TUI message is the English three-part view of the code; the redacted
  // original survives in `error` (asserted above) and as the English detail.
  assert.equal(tui?.message,'TALOS could not reach the model provider.\nretry later\nDetails: offline [REDACTED:6] · (PROVIDER_UNREACHABLE) · see talos provider list');
  assert.equal(String(tui?.message).includes('sekret'),false);
});

test('M7-D RED — canonical but currently unrendered facts are accepted by the TUI projection without a second native taxonomy',()=>{
  const adapter=createTuiEventAdapter();
  const fileEvent=createV2EventBridge('s1',()=> '2026-09-21T09:00:00.000Z').translate({
    type:'FileChanged',_sequenza:21,path:'src/a.ts',kind:'modified'
  });
  assert.ok(fileEvent);
  assert.deepEqual(adapter.translate(fileEvent),{
    type:'file.changed',
    data:{path:'src/a.ts',kind:'modified'},
    eventId:'talos:s1:native:21'
  });

  const snapshot:any={
    schema:'talos.cli.event.v2',version:2,sessionId:'s1',eventId:'talos:s1:native:22',
    cursor:{sessionId:'s1',sequence:22},ts:'2026-09-21T09:00:00.000Z',
    durability:'durable',type:'session.snapshot',data:{summary:{sessionId:'s1'}}
  };
  assert.deepEqual(adapter.translate(snapshot),{
    type:'session.snapshot',
    data:{summary:{sessionId:'s1'}},
    eventId:'talos:s1:native:22'
  });
});

test('M7-D RED — approval is projected from canonical redacted data, not parsed independently from native input',()=>{
  const adapter=createTuiEventAdapter(['sekret']);
  adapter.bindSession('s1');
  adapter.translate({type:'RunStarted',_sequenza:30,sessionId:'s1'});
  const raw={
    type:'ApprovalRequested',_sequenza:31,requestId:'approval-1',
    azione:{tool:'shell',toolCallId:'tool-1',command:'echo sekret'}
  };
  const canonical=createV2EventBridge('s1',()=> '2026-09-21T09:00:00.000Z',['sekret']).translate(raw);
  const tui:any=adapter.translate(raw);
  assert.ok(canonical);
  assert.equal(tui?.eventId,canonical.eventId);
  assert.equal(tui?.requestId,'approval-1');
  assert.equal(tui?.toolCallId,'tool-1');
  assert.deepEqual(tui?.payload,(canonical.data as any).action); // R2 lane J (E11): v2 key `azione` is `action`
  assert.equal(JSON.stringify(tui).includes('sekret'),false);
});

test('M7-D RED — interactive and headless v2 source both depend on the same canonical bridge',()=>{
  const tuiSource=readFileSync(new URL('../../src/tui/event-adapter.ts',import.meta.url),'utf8');
  const headlessSource=readFileSync(new URL('../../src/headless/run.ts',import.meta.url),'utf8');
  assert.match(tuiSource,/createV2EventBridge/u);
  assert.match(headlessSource,/createV2EventBridge/u);
  assert.doesNotMatch(tuiSource,/normalizeToolOutcome/u);
});


test('M7-D RED — explicit persistent session binding owns native identity and resets bridge state',()=>{
  const adapter:any=createTuiEventAdapter();
  adapter.bindSession('persistent-a');
  assert.deepEqual(
    adapter.translate({type:'RunStarted',_sequenza:1,threadId:'ephemeral-thread-a',runId:'run-a'}),
    {type:'run.started',sessionId:'persistent-a',runId:'run-a',eventId:'talos:persistent-a:native:1'}
  );
  assert.equal(
    adapter.translate({type:'RuntimeFallback',message:'first fallback'})?.eventId,
    'talos:persistent-a:transient:2'
  );

  adapter.bindSession('persistent-b');
  assert.deepEqual(
    adapter.translate({type:'RuntimeFallback',message:'second fallback'}),
    {type:'warning',message:'second fallback',eventId:'talos:persistent-b:transient:1'}
  );
});

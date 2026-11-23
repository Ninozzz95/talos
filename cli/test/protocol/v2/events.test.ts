import assert from 'node:assert/strict';
import test from 'node:test';
import {describeError} from '../../../src/i18n/error-view.ts';
import {createV2EventBridge,createV2FailureEvent} from '../../../src/protocol/v2/events.ts';

const NOW='2026-09-21T08:30:00.000Z';
const clock=()=>NOW;

test('M7-B v2 derives stable event identity and replay cursor from native TALOS sequence',()=>{
  const raw={type:'RunStarted',_sequenza:11,sessionId:'session-1',runId:'run-1'};
  const first=createV2EventBridge('session-1',clock).translate(raw);
  const second=createV2EventBridge('session-1',clock).translate(raw);
  assert.ok(first);
  assert.equal(first.schema,'talos.cli.event.v2');
  assert.equal(first.version,2);
  assert.equal(first.type,'run.started');
  assert.equal(first.sessionId,'session-1');
  assert.deepEqual(first.cursor,{sessionId:'session-1',sequence:11});
  assert.equal(first.durability,'durable');
  assert.equal(first.eventId,second?.eventId);
  assert.notEqual(first.eventId,'11');
});

test('M7-B classifies progress as transient without discarding its native ordering cursor',()=>{
  const event=createV2EventBridge('session-1',clock).translate({
    type:'TextMessageContent',_sequenza:12,messageId:'m-1',delta:'working'
  });
  assert.ok(event);
  assert.equal(event.type,'message.delta');
  assert.equal(event.durability,'transient');
  assert.deepEqual(event.cursor,{sessionId:'session-1',sequence:12});
  assert.deepEqual(event.data,{messageId:'m-1',delta:'working'});
});

test('M7-B emits ToolCallResult as an enumerable complete tool result with permission and enforcement evidence',()=>{
  const event=createV2EventBridge('session-1',clock).translate({
    type:'ToolCallResult',
    _sequenza:13,
    toolCallId:'tool-1',
    content:'done',
    receipt:{
      status:'succeeded',
      consentito:true,
      via:'rule',
      motivo:'explicit allow',
      risk:'low',
      evidence:{
        exitCode:0,
        requestedEnforcement:'windows-sandbox',
        appliedEnforcement:'windows-sandbox',
        sandboxEnforcement:'windows-sandbox',
        backend:'mxc',
        appContainer:true,
        filesystem:'bfs',
        network:'deny',
        processTree:'job-object-kill-on-close',
        sandboxSpecVersion:'0.1.0'
      }
    }
  });
  assert.ok(event);
  assert.equal(event.type,'tool.completed');
  assert.equal(event.durability,'durable');
  assert.deepEqual(event.cursor,{sessionId:'session-1',sequence:13});
  assert.deepEqual(event.data,{
    toolCallId:'tool-1',
    status:'completed',
    content:'done',
    receipt:{
      status:'succeeded',
      allowed:true,
      via:'rule',
      reason:'explicit allow',
      risk:'low'
    },
    enforcement:{
      exitCode:0,
      requested:'windows-sandbox',
      applied:'windows-sandbox',
      sandbox:'windows-sandbox',
      backend:'mxc',
      appContainer:true,
      filesystem:'bfs',
      network:'deny',
      processTree:'job-object-kill-on-close',
      sandboxSpecVersion:'0.1.0'
    }
  });
  assert.doesNotThrow(()=>JSON.stringify(event));
  const encoded=JSON.stringify(event);
  assert.match(encoded,/"requested":"windows-sandbox"/u);
  assert.match(encoded,/"receipt":/u);
  assert.match(encoded,/"enforcement":/u);
});

test('M7-B failure uses the canonical TALOS error envelope directly',()=>{
  const event=createV2EventBridge('session-1',clock).translate({
    type:'RunError',_sequenza:14,code:'PROVIDER_UNREACHABLE',message:'offline',
    component:'provider',retryable:true,traceId:'trace-1',hint:'retry later',docs:'https://example.invalid/provider'
  });
  assert.ok(event);
  assert.equal(event.type,'run.failed');
  assert.equal(event.durability,'durable');
  // R2 realignment (Q-R2-4, gate E11, owner 2026-09-24): the canonical envelope is unchanged and gains the three parts of the
  // error as fields from lane E's describeError; the words belong to the dictionary, so they are compared with the describer.
  const view=describeError({code:'PROVIDER_UNREACHABLE',message:'offline',component:'provider',retryable:true,traceId:'trace-1',hint:'retry later',docs:'https://example.invalid/provider'});
  assert.deepEqual(event.data,{
    error:{
      /* Owner 2026-09-24: `message` is the English headline; the original, redacted message is `raw`. */
      message:view.what,
      raw:'offline',
      envelope:{
        code:'PROVIDER_UNREACHABLE',
        component:'provider',
        retryable:true,
        hint:'retry later',
        docs:'https://example.invalid/provider',
        traceId:'trace-1',
        what:view.what,
        todo:view.todo,
        where:view.where
      }
    }
  });
});

test('M7-B exposes native cancellation as explicit terminal v2 truth',()=>{
  const event=createV2EventBridge('session-1',clock).translate({
    type:'RunCancelled',_sequenza:15,reason:'cancelled by user'
  });
  assert.ok(event);
  assert.equal(event.type,'run.cancelled');
  assert.equal(event.durability,'durable');
  assert.deepEqual(event.cursor,{sessionId:'session-1',sequence:15});
  assert.equal(event.data.reason,'cancelled by user');
});


test('M7-B synthetic failure details obey the same secret redaction boundary',()=>{
  const event=createV2FailureEvent({
    sessionId:'session-1',
    error:{code:'TOOL_FAILED',message:'failed with sk-secret',component:'tool',retryable:false,traceId:'trace-secret'},
    component:'tool',
    details:{diagnostic:'token sk-secret',apiKey:'must disappear'},
    secretValues:['sk-secret'],
    clock
  });
  const encoded=JSON.stringify(event);
  assert.equal(encoded.includes('sk-secret'),false);
  assert.equal(encoded.includes('must disappear'),false);
  assert.match(encoded,/\[REDACTED:/u);
});


test('M7-B separates transient message progress from a durable completed semantic message',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  const start=bridge.translate({type:'TextMessageStart',_sequenza:20,messageId:'m-1',role:'assistant'});
  const first=bridge.translate({type:'TextMessageContent',_sequenza:21,messageId:'m-1',delta:'hel'});
  const second=bridge.translate({type:'TextMessageContent',_sequenza:22,messageId:'m-1',delta:'lo'});
  const end=bridge.translate({type:'TextMessageEnd',_sequenza:23,messageId:'m-1'});
  assert.equal(start?.durability,'transient');
  assert.equal(first?.durability,'transient');
  assert.equal(second?.durability,'transient');
  assert.equal(end?.durability,'durable');
  assert.equal(end?.type,'message.completed');
  assert.deepEqual(end?.data,{messageId:'m-1',text:'hello'});
  assert.deepEqual(end?.cursor,{sessionId:'session-1',sequence:23});
});

test('M7-B applies the same durable completion rule to reasoning without replaying reasoning deltas',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  bridge.translate({type:'ReasoningMessageStart',_sequenza:24,messageId:'r-1'});
  bridge.translate({type:'ReasoningMessageContent',_sequenza:25,messageId:'r-1',delta:'step '});
  bridge.translate({type:'ReasoningMessageContent',_sequenza:26,messageId:'r-1',delta:'two'});
  const end=bridge.translate({type:'ReasoningMessageEnd',_sequenza:27,messageId:'r-1'});
  assert.equal(end?.durability,'durable');
  assert.deepEqual(end?.data,{messageId:'r-1',text:'step two'});
});


test('M7-D RED — canonical terminal failure retains native run identity for every surface',()=>{
  const event=createV2EventBridge('session-1',clock).translate({
    type:'RunError',_sequenza:40,runId:'run-40',code:'PROVIDER_UNREACHABLE',message:'offline',
    component:'provider',retryable:true,traceId:'trace-40'
  });
  assert.ok(event);
  assert.equal(event.type,'run.failed');
  assert.equal(event.data.runId,'run-40');
  assert.equal((event.data.error as any).envelope.code,'PROVIDER_UNREACHABLE');
});

test('M7-D RED — canonical cancellation retains native run identity for every surface',()=>{
  const event=createV2EventBridge('session-1',clock).translate({
    type:'RunCancelled',_sequenza:41,runId:'run-41',reason:'cancelled by user'
  });
  assert.ok(event);
  assert.equal(event.type,'run.cancelled');
  assert.deepEqual(event.data,{reason:'cancelled by user',runId:'run-41'});
});

test('ASYNC: the kernel\'s talos.agenti becomes agent.changed with machine fields only, never its Italian labels',()=>{
  const bridge=createV2EventBridge('main',clock);
  const event=bridge.translate({type:'CUSTOM',name:'talos.agenti',_sequenza:7,value:{version:1,sessionId:'main',parentId:'main',childId:'child',reason:'completed',
    agent:{sessionId:'child',taskCorto:'Read the ten files',task:'Sei una sessione di lavoro autonoma…',conclusa:true},
    operation:{kind:'lifecycle',status:'failed',label:'Agente non concluso',toolName:null}}});
  assert.equal(event?.type,'agent.changed');
  assert.equal(event?.durability,'durable');
  /* stage 6a/6b: the panel's fields; without the kernel's «Compito:» marker no prompt is guessed from its preamble */
  assert.deepEqual(event?.data,{childId:'child',parentId:'main',reason:'completed',kind:'lifecycle',status:'failed',task:'Read the ten files',name:null,tool:null,startedAt:null,interrupted:false,count:null,ended:true,
    prompt:null,endedAt:null,tokens:null,model:null,approvalsPending:null,questionsPending:null});
  const marked=bridge.translate({type:'CUSTOM',name:'talos.agenti',value:{childId:'c3',reason:'updated',agent:{task:'Sei una sessione di lavoro autonoma. Compito: Read the ten files and list the TODOs.',questionPendingCount:1},operation:{kind:'question',status:'waiting'}}});
  assert.deepEqual([marked?.data.prompt,marked?.data.questionsPending,marked?.data.kind],['Read the ten files and list the TODOs.',1,'question'],'the delegated task after «Compito:», and the question waiting');
  assert.doesNotMatch(JSON.stringify(event),/Agente|concluso|Sei una sessione/u,'the kernel\'s Italian labels and preamble stay out');
  /* 0.6.8 L3-17: the agent's own name, «-N» among sisters with the same task, rides beside the short task */
  const named=bridge.translate({type:'CUSTOM',name:'talos.agenti',value:{childId:'c4',reason:'created',agent:{nome:'Write tests for the export queue-2',taskCorto:'Write tests for the export queue'}}});
  assert.deepEqual([named?.data.name,named?.data.task],['Write tests for the export queue-2','Write tests for the export queue']);
  assert.equal(bridge.translate({type:'CUSTOM',name:'talos.agenti',value:{reason:'created'}}),null,'no child id, nothing said');
  const started=bridge.translate({type:'CUSTOM',name:'talos.agenti',value:{childId:'c2',reason:'odd',agent:{conclusa:false},operation:{kind:'tool',status:'running'}}});
  assert.deepEqual([started?.data.reason,started?.data.ended,started?.data.task],['updated',false,null],'an unknown reason reads as an update');
  const late=bridge.translate({type:'CUSTOM',name:'talos.agenti',value:{childId:'c3',reason:'updated',agent:{conclusa:true},operation:{kind:'response',status:'completed'}}});
  assert.equal(late?.data.ended,true,'an update about a child that has already concluded says it ended');
});

test('FE-049: the shortened results become a quiet warning in the Desktop\'s words; none, no row',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  const row=(numero:unknown)=>bridge.translate({type:'CUSTOM',_sequenza:1,name:'talos.risultati-accorciati',value:{numero,runId:'r1'}} as any) as any;
  assert.equal(row(1).type,'warning');
  assert.equal(row(1).data.message,'1 result shortened: TALOS may not have seen everything.');
  assert.equal(row(3).data.message,'3 results shortened: TALOS may not have seen everything.');
  assert.equal(row(3).data.code,'RESULTS_SHORTENED');
  assert.equal(row(0),null);
});

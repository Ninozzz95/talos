import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createEventBridge,type CliEvent} from '../../src/events/bridge.ts';
import {reduceRunResult,renderJson,renderStreamJson} from '../../src/headless/result.ts';

const FIXTURE_ROOT=new URL('../fixtures/protocol/v1/',import.meta.url);
const fixture=(name:string)=>readFile(new URL(name,FIXTURE_ROOT),'utf8');
const event=(seq:number,type:CliEvent['type'],data:Record<string,unknown>):CliEvent=>({schema:'talos.cli.event.v1',seq,ts:'2026-09-16T10:00:00.000Z',sessionId:'session-1',type,data});

test('v1 event bytes match immutable completed, tool, failure, and cancellation fixtures',async()=>{
  const cases=[
    ['event-completed.jsonl',{type:'RunFinished',result:{detto:'ok'}}],
    ['event-tool.jsonl',{type:'ToolCallOutput',toolCallId:'tool-1',content:'done',isError:false}],
    ['event-failed.jsonl',{type:'RunError',code:'PROVIDER_UNREACHABLE',message:'offline'}],
    ['event-cancelled.jsonl',{type:'RunError',code:'CANCELLED',message:'cancelled by user'}]
  ] as const;
  for(const[name,raw]of cases){
    const bridge=createEventBridge('session-1',()=> '2026-09-16T10:00:00.000Z');
    const translated=bridge.translate(raw);
    assert.ok(translated);
    assert.equal(renderStreamJson([translated]),await fixture(name));
  }
});

test('v1 result bytes match immutable success, failure, and cancellation fixtures',async()=>{
  const success=reduceRunResult([
    event(1,'message.delta',{messageId:'message-1',delta:'OK'}),
    event(2,'file.changed',{path:'src/example.ts'}),
    event(3,'usage.updated',{value:{inputTokens:3,outputTokens:1}}),
    event(4,'run.completed',{})
  ]);
  const failure=reduceRunResult([event(1,'run.failed',{code:'PROVIDER_UNREACHABLE',message:'offline'})]);
  const cancelled=reduceRunResult([event(1,'run.failed',{code:'CANCELLED',message:'cancelled by user'})]);
  assert.equal(renderJson(success),await fixture('result-success.json'));
  assert.equal(renderJson(failure),await fixture('result-error.json'));
  assert.equal(renderJson(cancelled),await fixture('result-cancelled.json'));
});

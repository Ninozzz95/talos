import assert from 'node:assert/strict';
import test from 'node:test';
import {encodeV2Event,encodeV2Result,encodeV2Stream} from '../../../src/protocol/v2/codec.ts';
import type {TalosV2Event,TalosV2RunResult} from '../../../src/protocol/v2/types.ts';

const event:TalosV2Event={
  schema:'talos.cli.event.v2',version:2,sessionId:'session-1',
  eventId:'session-1:native:7',cursor:{sessionId:'session-1',sequence:7},
  ts:'2026-09-21T08:30:00.000Z',durability:'durable',type:'run.completed',data:{}
};

test('M7-B codec emits exactly one JSON value per line with final newline',()=>{
  const line=encodeV2Event(event);
  assert.equal(line.at(-1),'\n');
  assert.equal(line.trim().split('\n').length,1);
  assert.deepEqual(JSON.parse(line),event);
  const stream=encodeV2Stream([event,{...event,eventId:'session-1:native:8',cursor:{sessionId:'session-1',sequence:8}}]);
  assert.equal(stream.at(-1),'\n');
  assert.equal(stream.trim().split('\n').length,2);
  assert.doesNotThrow(()=>stream.trim().split('\n').forEach(row=>JSON.parse(row)));
});

test('M7-B result codec carries explicit v2 identity, terminal cursor and enumerable tool results',()=>{
  const result:TalosV2RunResult={
    schema:'talos.cli.result.v2',version:2,ok:true,sessionId:'session-1',
    cursor:{sessionId:'session-1',sequence:7},outcome:'completed',
    result:{text:'OK',changedFiles:[],usage:null},
    warnings:[],
    toolResults:[{
      toolCallId:'tool-1',status:'completed',content:'done',
      receipt:{status:'succeeded',allowed:true,via:'rule',reason:'allow',risk:'low'},
      enforcement:{exitCode:0,requested:'windows-sandbox',applied:'windows-sandbox',sandbox:'windows-sandbox',backend:'mxc',appContainer:true,filesystem:'bfs',network:'deny',processTree:'job-object-kill-on-close',sandboxSpecVersion:'0.1.0'}
    }]
  };
  const line=encodeV2Result(result);
  assert.equal(line.at(-1),'\n');
  const parsed=JSON.parse(line);
  assert.equal(parsed.schema,'talos.cli.result.v2');
  assert.equal(parsed.version,2);
  assert.equal(parsed.toolResults[0].enforcement.backend,'mxc');
});

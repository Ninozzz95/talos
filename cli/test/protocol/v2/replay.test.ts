import assert from 'node:assert/strict';
import test from 'node:test';
import {replayDurableAfter} from '../../../src/protocol/v2/replay.ts';
import type {TalosV2Event} from '../../../src/protocol/v2/types.ts';

function event(sequence:number,durability:'durable'|'transient',type:TalosV2Event['type']):TalosV2Event{
  return{
    schema:'talos.cli.event.v2',version:2,sessionId:'session-1',
    eventId:`session-1:native:${sequence}`,
    cursor:{sessionId:'session-1',sequence},
    ts:'2026-09-21T08:30:00.000Z',durability,type,data:{}
  };
}

test('M7-B replay is exclusive-after and returns durable facts only',()=>{
  const events=[
    event(20,'durable','run.started'),
    event(21,'transient','message.delta'),
    event(22,'durable','message.completed'),
    event(23,'transient','reasoning.delta'),
    event(24,'durable','tool.completed'),
    event(25,'durable','run.completed'),
  ];
  assert.deepEqual(
    replayDurableAfter(events,{sessionId:'session-1',sequence:20}).map(row=>row.cursor?.sequence),
    [22,24,25]
  );
  assert.deepEqual(
    replayDurableAfter(events,{sessionId:'session-1',sequence:21}).map(row=>row.cursor?.sequence),
    [22,24,25]
  );
});

test('M7-B replay rejects a cursor from another session',()=>{
  assert.throws(
    ()=>replayDurableAfter([event(5,'durable','run.started')],{sessionId:'other',sequence:5}),
    (error:any)=>error?.code==='PROTOCOL_CURSOR_SESSION_MISMATCH'
  );
});

test('M7-B replay reports an unavailable retained range instead of pretending completeness',()=>{
  const retained=[event(10,'durable','tool.completed'),event(11,'durable','run.completed')];
  assert.throws(
    ()=>replayDurableAfter(retained,{sessionId:'session-1',sequence:4}),
    (error:any)=>error?.code==='PROTOCOL_CURSOR_UNAVAILABLE'
  );
  assert.throws(
    ()=>replayDurableAfter(retained,{sessionId:'session-1',sequence:99}),
    (error:any)=>error?.code==='PROTOCOL_CURSOR_UNAVAILABLE'
  );
});

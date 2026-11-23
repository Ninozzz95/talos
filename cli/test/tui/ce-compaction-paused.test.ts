/*
 * Desktop CE fix 5f78b1316+4ceb232a5 (aligned 2026-09-25): after a refused summary the Context Engine pauses automatic
 * compaction (60 s, then 300, then 900) and writes ONE `context.compaction.cooling` notice per failed job, id
 * `cooling-<jobId>`, payload {code, attempts, waitSeconds, retryAfter}. The CLI read only `context.version.committed`
 * from `talos.context`, so the pause was invisible. Now it is one dim line with the code, the local time of the next
 * automatic try and that /compact does not wait; the same notice replayed or delivered twice stays one line.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

const SESSION='s-paused';
const cooling=(jobId:string,payload:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.context',value:{schema:'talos.context.event.v1',id:`cooling-${jobId}`,sessionId:SESSION,jobId,kind:'context.compaction.cooling',state:'failed',createdAt:'2026-09-25T11:28:16.815Z',payload}});
const lines=(raw:any[])=>{
  const adapter=createTuiEventAdapter([]);adapter.bindSession(SESSION);
  const events=raw.flatMap(e=>adapter.translateAll(e));
  const model=events.reduce((m:any,e:any)=>reduceTranscriptEvent(m,e),createTranscriptModel());
  return model.items.filter((item:any)=>item.kind==='warning'&&/Automatic compaction is paused/u.test(item.text)).map((item:any)=>item.text as string);
};
test('CE pause: a cooling notice is one dim line with the code, the next automatic try and /compact',()=>{
  const retryAfter='2026-09-25T11:29:16.815Z';
  const [line,...rest]=lines([cooling('j1',{code:'CTX_INVALID_SUMMARY',attempts:1,waitSeconds:60,retryAfter})]);
  assert.equal(rest.length,0);
  assert.ok(line,'no pause line');
  assert.match(line!,/its summary was not accepted \(CTX_INVALID_SUMMARY\)/u);
  assert.ok(line!.includes(`next automatic try is after ${retryAfter}`),line);
  assert.match(line!,/\/compact tries now/u);
  assert.match(line!,/cost.*not estimated/iu);
});

test('CE pause: the same notice twice is one line; a second failed job is a second line, counted in a row',()=>{
  const first=cooling('j1',{code:'CTX_INVALID_SUMMARY',attempts:1,waitSeconds:60,retryAfter:'2026-09-25T11:29:16.815Z'});
  const second=cooling('j2',{code:'CTX_INVALID_SUMMARY',attempts:2,waitSeconds:300,retryAfter:'2026-09-25T11:35:00.000Z'});
  const out=lines([first,first,second]);
  assert.equal(out.length,2,out.join('\n'));
  assert.match(out[1]!,/not accepted 2 times in a row/u);
});

test('CE pause: the v2 protocol carries the notice as `context.compaction.paused`, and drops one without a code or time',()=>{
  const bridge=createV2EventBridge(SESSION,()=>'2026-09-25T11:28:17.000Z');
  const event=bridge.translate(cooling('j1',{code:'CTX_INVALID_SUMMARY',attempts:1,waitSeconds:60,retryAfter:'2026-09-25T11:29:16.815Z'})) as any;
  assert.equal(event?.type,'context.compaction.paused');
  assert.deepEqual(event.data,{noticeId:'cooling-j1',code:'CTX_INVALID_SUMMARY',attempts:1,waitSeconds:60,retryAfter:'2026-09-25T11:29:16.815Z'});
  assert.equal(bridge.translate(cooling('j2',{attempts:1,retryAfter:'2026-09-25T11:29:16.815Z'})),null);
  assert.equal(bridge.translate(cooling('j3',{code:'CTX_INVALID_SUMMARY',retryAfter:'later'})),null);
});

test('CE pause: a notice without a code or a readable time says nothing, and other kinds stay silent',()=>{
  assert.deepEqual(lines([cooling('j1',{attempts:1,retryAfter:'2026-09-25T11:29:16.815Z'})]),[]);
  assert.deepEqual(lines([cooling('j2',{code:'CTX_INVALID_SUMMARY',attempts:1,retryAfter:'later'})]),[]);
  assert.deepEqual(lines([{type:'CUSTOM',name:'talos.context',value:{kind:'context.usage.recorded',payload:{code:'X_Y'}}}]),[]);
});

/**
 * R1 lane I — unit checks behind the idle scenario (gate E5, E6). They live next to the acceptance harness because lane I
 * owns only `test/acceptance/**`; they run with the unit suite (`*.test.ts`), not with the pty scenarios.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {COALESCE_WINDOW_MS,MOTION_FRAME_MS} from '../../src/tui/render-scheduler.ts';
import {createRenderCoordinator} from '../../src/tui/render-coordinator.ts';

function fakeTime(){
  let now=0,nextId=1;
  const timers=new Map<number,{at:number;fn:()=>void}>();
  const setTimer=(fn:()=>void,delay:number)=>{const id=nextId++;timers.set(id,{at:now+delay,fn});return id;};
  const clearTimer=(id:unknown)=>{timers.delete(Number(id));};
  const advance=(ms:number)=>{
    const target=now+ms;
    for(;;){const due=[...timers.entries()].filter(([,row])=>row.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();}
    now=target;
  };
  return{clock:()=>now,setTimer,clearTimer,advance,pending:()=>timers.size};
}

test('E5 — stopping motion drops its queued frame: no spinner commit lands after the session went idle',()=>{
  const time=fakeTime();
  const coordinator=createRenderCoordinator({clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer});
  const batches:any[]=[];let ticks=0;
  coordinator.subscribe(batch=>batches.push(batch));
  const stop=coordinator.startMotion(()=>{ticks++;});
  time.advance(MOTION_FRAME_MS);           /* the tick is queued; its flush is COALESCE_WINDOW_MS away */
  stop();                                  /* the run ended inside that window */
  time.advance(COALESCE_WINDOW_MS*4);
  assert.equal(ticks,0,'a spinner frame queued before the stop was still applied');
  assert.equal(batches.length,0,'a spinner frame queued before the stop still committed after idle');
  assert.equal(time.pending(),0,'a timer is still armed after motion stopped');
});

test('E5 — stopping motion keeps an event queued in the same window',()=>{
  const time=fakeTime();
  const coordinator=createRenderCoordinator({clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer});
  const batches:any[]=[];const applied:string[]=[];
  coordinator.subscribe(batch=>batches.push(batch));
  const stop=coordinator.startMotion(()=>applied.push('motion'));
  time.advance(MOTION_FRAME_MS);
  coordinator.enqueueEvent('run-completed',()=>applied.push('event'));
  stop();
  time.advance(COALESCE_WINDOW_MS);
  assert.deepEqual(applied,['event']);
  assert.equal(batches.length,1);
  assert.equal(batches[0].reason,'event');
  assert.deepEqual(batches[0].eventIds,['run-completed']);
});

test('E6 in-process — the output meter counts bytes, DEC 2026 frames and full clears, across chunk boundaries',async()=>{
  const {createTuiMetricsCollector,createTerminalOutputMeter,summarizeTuiMetrics}=await import('../../src/tui/metrics.ts');
  const collector=createTuiMetricsCollector();const meter=createTerminalOutputMeter(collector.sink);
  const ink=(frame:string)=>`\u001B[?2026h\u001B[2J\u001B[3J\u001B[H${frame}\u001B[?2026l`;
  const stream=ink('é frame one')+ink('frame two');
  /* Split every sequence at every possible point: a sequence cut in two must still count once. */
  for(let cut=1;cut<stream.length;cut+=3){meter.observe(stream.slice(0,cut));meter.observe(Buffer.from(stream.slice(cut)));}
  const runs=Math.ceil((stream.length-1)/3);
  const summary=summarizeTuiMetrics(collector.snapshot());
  assert.equal(summary.frames,2*runs);
  assert.deepEqual(summary.clears,{display:2*runs,scrollback:2*runs});
  assert.equal(summary.bytes,Buffer.byteLength(stream)*runs);
});

test('E6 in-process — the tap observes every write and restores the stream; Ink renders are counted',async()=>{
  const {createTuiMetricsCollector,createTuiRenderMetricsTap,summarizeTuiMetrics}=await import('../../src/tui/metrics.ts');
  const collector=createTuiMetricsCollector();const written:unknown[]=[];
  const original=function(this:unknown,chunk:unknown){written.push(chunk);return true;};
  const stdout={write:original as (...args:any[])=>boolean};
  const tap=createTuiRenderMetricsTap({stdout,sink:collector.sink});
  assert.notEqual(stdout.write,original);
  stdout.write('\u001B[?2026hA\u001B[?2026l');stdout.write(Buffer.from('\u001B[2J'));
  tap.inkOptions.onRender({renderTime:3});tap.inkOptions.onRender({renderTime:7});
  tap.dispose();
  assert.equal(stdout.write,original,'dispose restores the original write');
  stdout.write('\u001B[?2026hnot counted\u001B[?2026l');
  assert.equal(written.length,3,'every chunk still reaches the terminal');
  const summary=summarizeTuiMetrics(collector.snapshot());
  assert.equal(summary.frames,1);
  assert.deepEqual(summary.clears,{display:1,scrollback:0});
  assert.equal(summary.bytes,Buffer.byteLength('\u001B[?2026hA\u001B[?2026l\u001B[2J'));
  assert.equal(summary.inkRenders.count,2);
  assert.equal(summary.inkRenders.maxMs,7);
});

test('E6 in-process — a summary without output rows reports zeros, not missing fields',async()=>{
  const {summarizeTuiMetrics}=await import('../../src/tui/metrics.ts');
  const summary=summarizeTuiMetrics([]);
  assert.equal(summary.frames,0);assert.equal(summary.bytes,0);
  assert.deepEqual(summary.clears,{display:0,scrollback:0});
  assert.deepEqual(summary.inkRenders,{count:0,maxMs:0});
});

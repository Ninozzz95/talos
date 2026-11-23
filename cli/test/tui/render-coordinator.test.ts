import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiMetricsCollector,createTuiMetricsProfiler,summarizeTuiMetrics} from '../../src/tui/metrics.ts';
import {COALESCE_WINDOW_MS,MOTION_FRAME_MS} from '../../src/tui/render-scheduler.ts';
import {createRenderCoordinator} from '../../src/tui/render-coordinator.ts';

function fakeTime(){
  let now=0,nextId=1;
  const timers=new Map<number,{at:number;fn:()=>void}>();
  const clock=()=>now;
  const setTimer=(fn:()=>void,delay:number)=>{const id=nextId++;timers.set(id,{at:now+delay,fn});return id;};
  const clearTimer=(id:unknown)=>{timers.delete(Number(id));};
  const advance=(ms:number)=>{
    const target=now+ms;
    while(true){
      const due=[...timers.entries()].filter(([,row])=>row.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
      if(!due)break;
      timers.delete(due[0]);now=due[1].at;due[1].fn();
    }
    now=target;
  };
  return{clock,setTimer,clearTimer,advance,pending:()=>timers.size};
}

test('M2-B-RED-1 — runtime events within the coalescing window flush once with every event id',()=>{
  const time=fakeTime(),collector=createTuiMetricsCollector();
  const coordinator=createRenderCoordinator({
    clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer,
    profiler:createTuiMetricsProfiler({sink:collector.sink,clock:time.clock}),
  });
  const applied:string[]=[];const batches:any[]=[];
  coordinator.subscribe(batch=>batches.push(batch));

  coordinator.enqueueEvent('e1',()=>applied.push('e1'));
  time.advance(5);
  coordinator.enqueueEvent('e2',()=>applied.push('e2'));
  assert.deepEqual(applied,[]);
  assert.equal(batches.length,0);
  time.advance(COALESCE_WINDOW_MS-5);

  assert.deepEqual(applied,['e1','e2']);
  assert.equal(batches.length,1);
  assert.deepEqual(batches[0].eventIds,['e1','e2']);
  assert.equal(batches[0].reason,'event');
  assert.ok(batches[0].coalescedMs<=COALESCE_WINDOW_MS);
  coordinator.markVisible(batches[0].epoch);

  const summary=summarizeTuiMetrics(collector.snapshot());
  assert.equal(summary.committed,1);
  assert.equal(summary.eventToVisible.count,2);
  assert.ok(summary.eventToVisible.p95<=50);
});

test('M2-B-RED-2 — input and approval flush immediately and absorb pending cosmetic motion',()=>{
  const time=fakeTime();
  const coordinator=createRenderCoordinator({clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer});
  const applied:string[]=[];const batches:any[]=[];
  coordinator.subscribe(batch=>batches.push(batch));

  coordinator.enqueueMotion(()=>applied.push('motion'));
  assert.equal(time.pending(),1);
  coordinator.immediate('input',()=>applied.push('input'));
  assert.deepEqual(applied,['motion','input']);
  assert.equal(batches.length,1);
  assert.equal(batches[0].reason,'input');
  assert.equal(time.pending(),0,'input must cancel the pending cosmetic timer');

  coordinator.enqueueMotion(()=>applied.push('motion-2'));
  coordinator.immediate('approval',()=>applied.push('approval'));
  assert.equal(batches.at(-1).reason,'approval');
  assert.deepEqual(applied.slice(-2),['motion-2','approval']);
});

test('M2-B-RED-3 — idle coordinator emits no render and motion exists only while active',()=>{
  const time=fakeTime(),collector=createTuiMetricsCollector();
  const coordinator=createRenderCoordinator({
    clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer,
    profiler:createTuiMetricsProfiler({sink:collector.sink,clock:time.clock}),
  });
  const batches:any[]=[];let ticks=0;
  coordinator.subscribe(batch=>{batches.push(batch);coordinator.markVisible(batch.epoch);});

  time.advance(10_000);
  assert.equal(batches.length,0);
  assert.equal(time.pending(),0);

  const stop=coordinator.startMotion(()=>{ticks++;});
  assert.equal(time.pending(),1);
  time.advance(MOTION_FRAME_MS);
  time.advance(COALESCE_WINDOW_MS);
  assert.equal(ticks,1);
  assert.equal(batches.length,1);
  assert.equal(batches[0].reason,'motion');

  stop();
  time.advance(MOTION_FRAME_MS*4);
  assert.equal(batches.length,1);
  assert.equal(time.pending(),0);
  assert.equal(summarizeTuiMetrics(collector.snapshot()).idle,0);
});

test('M2-B-RED-4 — deterministic burst stays within the p95 and coalescing budgets',()=>{
  const time=fakeTime(),collector=createTuiMetricsCollector();
  const coordinator=createRenderCoordinator({
    clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer,
    profiler:createTuiMetricsProfiler({sink:collector.sink,clock:time.clock}),
  });
  coordinator.subscribe(batch=>{
    time.advance(2);
    coordinator.markVisible(batch.epoch);
  });

  for(let burst=0;burst<10;burst++){
    coordinator.enqueueEvent('e'+burst,()=>{});
    time.advance(COALESCE_WINDOW_MS);
  }
  const summary=summarizeTuiMetrics(collector.snapshot());
  assert.equal(summary.idle,0);
  assert.ok(summary.coalesceMaxMs<=16,JSON.stringify(summary));
  assert.ok(summary.eventToVisible.p95<=50,JSON.stringify(summary));
});


test('M2-B app wiring centralizes main-screen event input approval motion and resize scheduling',async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(app,/coordinator\.enqueueEvent/u);
  assert.match(app,/coordinator\.immediate\('approval'/u);
  assert.match(app,/coordinator\.immediate\('input'/u);
  assert.match(app,/coordinator\.startMotion/u);
  /* R1 E5/E8 (lane I, measured): the resize-scheduling effect committed even when nothing changed; a resize now reaches the app
     through the terminal-size store in run.ts, which ignores same-size events, and the budget is recomputed from it. */
  assert.doesNotMatch(app,/coordinator\.immediate\('resize'/u);
  assert.match(app,/React\.useLayoutEffect[\s\S]{0,300}coordinator\.markVisible/u);
  assert.match(app,/activityRow\(shownActivity/u);
  assert.doesNotMatch(app,/createStatusIndicatorComponent/u);
  assert.doesNotMatch(app,/setTimeout\(\(\)=>setViewport/u,'resize scheduling must not happen during render');
});


test('a later visible epoch accounts for earlier coordinator batches absorbed by the same React commit',()=>{
  const time=fakeTime(),collector=createTuiMetricsCollector();
  const coordinator=createRenderCoordinator({
    clock:time.clock,setTimer:time.setTimer,clearTimer:time.clearTimer,
    profiler:createTuiMetricsProfiler({sink:collector.sink,clock:time.clock}),
  });
  const batches:any[]=[];
  coordinator.subscribe(batch=>batches.push(batch));

  coordinator.enqueueEvent('event-before-input',()=>{});
  time.advance(COALESCE_WINDOW_MS);
  coordinator.immediate('input',()=>{});
  assert.equal(batches.length,2);

  time.advance(3);
  coordinator.markVisible(batches[1].epoch);
  const summary=summarizeTuiMetrics(collector.snapshot());
  assert.equal(summary.committed,1,'one React commit may absorb multiple coordinator epochs');
  assert.equal(summary.eventToVisible.count,1,'the earlier event must still receive visible latency evidence');
  coordinator.markVisible(batches[0].epoch);
  assert.equal(summarizeTuiMetrics(collector.snapshot()).committed,1,'an already-accounted epoch must not double count');
});

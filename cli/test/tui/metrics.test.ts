import assert from 'node:assert/strict';
import test from 'node:test';
import {NOOP_TUI_METRICS_SINK,createTuiMetricsCollector,createTuiMetricsProfiler} from '../../src/tui/metrics.ts';

test('TUI metrics default sink is no-op and safe for production callers',()=>{
  const profiler=createTuiMetricsProfiler({clock:()=>10});
  profiler.eventReceived('event-1');
  profiler.renderCommitted({eventIds:['event-1'],reason:'event'});
  NOOP_TUI_METRICS_SINK.record({name:'tui.render.committed',value:1,unit:'count'});
});

test('TUI metrics record committed, idle, and event-to-visible measurements',()=>{
  const collector=createTuiMetricsCollector();
  let now=100;
  const profiler=createTuiMetricsProfiler({sink:collector.sink,clock:()=>now});
  profiler.eventReceived('event-1');
  now=112;
  profiler.renderCommitted({eventIds:['event-1'],reason:'event'});
  profiler.renderCommitted({reason:'idle'});
  assert.deepEqual(collector.snapshot().map(metric=>[metric.name,metric.value,metric.unit]),[
    ['tui.render.committed',1,'count'],
    ['tui.event_to_visible_ms',12,'milliseconds'],
    ['tui.render.committed',1,'count'],
    ['tui.render.idle',1,'count']
  ]);
  collector.reset();
  assert.deepEqual(collector.snapshot(),[]);
});


test('M2-B-RED-4 — metrics summarize event-to-visible percentiles and render budgets',async()=>{
  const {summarizeTuiMetrics}=await import('../../src/tui/metrics.ts');
  const rows=[
    {name:'tui.render.committed',value:1,unit:'count',tags:{reason:'event'}},
    {name:'tui.render.coalesce_ms',value:16,unit:'milliseconds'},
    ...[8,12,18,22,30,34,40,44,48,49].map(value=>({name:'tui.event_to_visible_ms',value,unit:'milliseconds'})),
  ] as any[];
  const summary=summarizeTuiMetrics(rows);
  assert.equal(summary.committed,1);
  assert.equal(summary.idle,0);
  assert.equal(summary.coalesceMaxMs,16);
  assert.equal(summary.eventToVisible.count,10);
  assert.equal(summary.eventToVisible.p95,49);
  assert.equal(summary.eventToVisible.max,49);
});

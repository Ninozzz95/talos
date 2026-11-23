/* UI phase stage 2, cure 2a (heap probe 2, 01/10, registro 12): run.ts created the render-metrics collector on every launch
   and kept every sample of every frame for the whole session (~1.5 MB per 200 short turns), although the samples are read
   only with TALOS_TUI_RENDER_METRICS=1. Metrics are collected only when asked for, as Claude Code and Gemini CLI do with
   their opt-in telemetry; otherwise nothing is kept. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {NOOP_TUI_METRICS_SINK,createTuiRenderMetrics} from '../../src/tui/metrics.ts';

test('without TALOS_TUI_RENDER_METRICS=1 the TUI keeps no render metrics at all',()=>{
  for(const env of [{},{TALOS_TUI_RENDER_METRICS:'0'},{TALOS_TUI_RENDER_METRICS:'true'}]){
    const metrics=createTuiRenderMetrics(env);
    assert.equal(metrics.enabled,false);
    assert.equal(metrics.sink,NOOP_TUI_METRICS_SINK,'the null sink keeps nothing');
    for(let n=0;n<10_000;n++)metrics.sink.record({name:'tui.render.committed',value:1,unit:'count'});
    assert.equal(metrics.summary(),null);
  }
});

test('with TALOS_TUI_RENDER_METRICS=1 every sample is collected and summarized at exit',()=>{
  const metrics=createTuiRenderMetrics({TALOS_TUI_RENDER_METRICS:'1'});
  assert.equal(metrics.enabled,true);
  for(let n=0;n<3;n++)metrics.sink.record({name:'tui.render.committed',value:1,unit:'count'});
  const summary=metrics.summary() as Record<string,unknown>|null;
  assert.ok(summary,'a summary when metrics were asked for');
  assert.match(JSON.stringify(summary),/3/u);
});

test('run.ts takes its render metrics from createTuiRenderMetrics(env) and never builds a collector itself',async()=>{
  const source=await readFile(new URL('../../src/tui/run.ts',import.meta.url),'utf8');
  assert.match(source,/createTuiRenderMetrics\(env\)/u);
  assert.doesNotMatch(source,/createTuiMetricsCollector\(/u);
});

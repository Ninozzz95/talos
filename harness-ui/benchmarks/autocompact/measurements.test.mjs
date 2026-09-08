import test from 'node:test';
import assert from 'node:assert/strict';
import { startMemorySampler, summarizeMemory } from './measurements.mjs';

test('AQ-M01 missing process or GPU counters remain unknown', () => {
  assert.deepEqual(summarizeMemory([]), { samples: 0, rssBytes: null, gpuDedicatedBytes: null, gpuSharedBytes: null });
  assert.deepEqual(summarizeMemory([{ rssBytes: 50 }, { rssBytes: 70, gpuDedicatedBytes: 0, gpuSharedBytes: 20 }, { rssBytes: 60, gpuDedicatedBytes: 40, gpuSharedBytes: 10 }]), { samples: 3, rssBytes: 70, gpuDedicatedBytes: 40, gpuSharedBytes: 20 });
});

test('AQ-M02 sampler awaits each probe and flushes on stop', async () => {
  let concurrent = 0, maximum = 0;
  const events = [];
  const sampler = await startMemorySampler({ intervalMs: 1, record: async (kind, value) => events.push({ kind, ...value }), probe: async () => {
    maximum = Math.max(maximum, ++concurrent);
    await new Promise(resolve => setTimeout(resolve, 8));
    concurrent--;
    return { rssBytes: 12, processId: 7 };
  } });
  await new Promise(resolve => setTimeout(resolve, 25));
  await sampler.stop();
  const count = events.length;
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(events.length, count);
  assert.equal(maximum, 1);
  assert.ok(events.length >= 2);
  assert.ok(events.every(event => event.kind === 'memory-sample' && event.at && event.intervalMs === 1));
});

test('AQ-M03 sample retains scope from before the asynchronous probe', async () => {
  let scope={repetition:1};
  const events=[];
  const sampler=await startMemorySampler({intervalMs:1000,captureScope:()=>({...scope}),record:async(kind,value)=>events.push(value),probe:async()=>{scope={repetition:2};return {rssBytes:10};}});
  await sampler.stop();
  assert.deepEqual(events[0].scope,{repetition:1});
});

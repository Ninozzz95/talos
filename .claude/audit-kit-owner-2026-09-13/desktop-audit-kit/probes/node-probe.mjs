import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance, monitorEventLoopDelay} from 'node:perf_hooks';
/** Opt-in, process-local probe. No network, fetch interception, prompts, paths or credentials. */
export async function startNodeProbe({directory, intervalMs = 1000, maxPendingSamples = 8} = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new TypeError('directory must be absolute');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 20) throw new RangeError('intervalMs must be integer >=20');
  if (!Number.isSafeInteger(maxPendingSamples) || maxPendingSamples < 1 || maxPendingSamples > 1024) throw new RangeError('Invalid queue bound');
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  const file = path.join(directory, `node-${process.pid}-${randomUUID()}.ndjson`);
  const handle = await fs.open(file, 'wx', 0o600);
  const runId = randomUUID(), clockId = randomUUID();
  const base = {schema_version: 1, run_id: runId, clock_id: clockId, pid: process.pid, scope: 'single_node_process'};
  const serialize = event => JSON.stringify({...base, ...event})+'\n';
  try {
    await handle.writeFile(serialize({event: 'probe_start', mono_ms: performance.now(), node: process.version,
      interval_ms: intervalMs, max_pending_samples: maxPendingSamples,
      notes: ['RSS is this process, not the whole desktop or the model.', 'Event-loop delay is timer delay, not HTTP latency.']}));
  } catch(e) {await handle.close(); throw e;}
  const histogram = monitorEventLoopDelay({resolution: 10}); histogram.enable();
  let lastCpu = process.cpuUsage(), lastTime = performance.now(), pending = 0, dropped = 0;
  let chain = Promise.resolve(), stopped = false, stopPromise = null, writeError = null;
  function sample() {
    if (stopped) return false;
    const now = performance.now(), cpu = process.cpuUsage(), mem = process.memoryUsage();
    const elapsed = now - lastTime, user = cpu.user-lastCpu.user, system = cpu.system-lastCpu.system;
    const count = Number(histogram.count);
    const event = {event: 'sample', mono_ms: now, interval_actual_ms: elapsed,
      cpu_user_us: user, cpu_system_us: system,
      cpu_percent_one_core: elapsed > 0 ? (user+system)/(elapsed*1000)*100 : null,
      rss_bytes: mem.rss, heap_used_bytes: mem.heapUsed, external_bytes: mem.external,
      loop_delay_count: count, loop_delay_p95_ms: count ? histogram.percentile(95)/1e6 : null,
      loop_delay_max_ms: count ? histogram.max/1e6 : null, dropped_samples_so_far: dropped};
    lastTime = now; lastCpu = cpu; histogram.reset();
    if (pending >= maxPendingSamples || writeError) {dropped++; return false;}
    pending++;
    const line = serialize(event);
    chain = chain.then(async () => {
      if (!writeError) {
        try {await handle.writeFile(line);} catch(e) {writeError = e.code ?? 'WRITE_ERROR';}
      }
    }).finally(() => {pending--;});
    return true;
  }
  const timer = setInterval(sample, intervalMs); timer.unref();
  function stop() {
    if (stopPromise) return stopPromise;
    stopped = true; clearInterval(timer); histogram.disable();
    stopPromise = (async () => {
      await chain;
      try {
        if (!writeError) await handle.writeFile(serialize({event:'probe_stop', mono_ms:performance.now(), dropped_samples:dropped}));
      } catch(e) {writeError = e.code ?? 'WRITE_ERROR';}
      finally {await handle.close();}
      return {file, dropped_samples:dropped, write_error:writeError, complete:!writeError};
    })();
    return stopPromise;
  }
  return {file, sample, stop};
}

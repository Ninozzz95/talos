import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const maxKnown = (samples, key) => {
  const values = samples.map(sample => sample[key]).filter(value => Number.isFinite(value) && value >= 0);
  return values.length ? Math.max(...values) : null;
};

export function summarizeMemory(samples) {
  return { samples: samples.length, rssBytes: maxKnown(samples, 'rssBytes'), gpuDedicatedBytes: maxKnown(samples, 'gpuDedicatedBytes'), gpuSharedBytes: maxKnown(samples, 'gpuSharedBytes') };
}

async function probeOwnedRuntime() {
  // PID originates in this process, never in external text. Only its direct
  // llama child is measured; missing GPU counters remain unknown.
  const script = `$taskLlama = @(Get-CimInstance Win32_Process -Filter "Name = 'llama-server.exe' AND ParentProcessId = ${process.pid}"); if ($taskLlama.Count -ne 1) { throw 'OWNED_RUNTIME_NOT_UNIQUE' }; $taskGpu = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ('pid_' + $taskLlama[0].ProcessId + '_*') }); [pscustomobject]@{processId=[int]$taskLlama[0].ProcessId; rssBytes=[long]$taskLlama[0].WorkingSetSize; gpuDedicatedBytes=$(if($taskGpu.Count){[long](($taskGpu | Measure-Object DedicatedUsage -Sum).Sum)}else{$null}); gpuSharedBytes=$(if($taskGpu.Count){[long](($taskGpu | Measure-Object SharedUsage -Sum).Sum)}else{$null})} | ConvertTo-Json -Compress`;
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 15_000 });
  return JSON.parse(stdout);
}

export async function startMemorySampler({ record, probe = probeOwnedRuntime, intervalMs = 5000, captureScope }) {
  let stopped = false, timer, pending;
  const take = async () => {
    const scope = captureScope?.();
    const startedAt = new Date().toISOString();
    let sample;
    try { sample = await probe(); } catch (error) { sample = { error: error.message }; }
    await record('memory-sample', { at: new Date().toISOString(), startedAt, ...(scope ? {scope} : {}), intervalMs, ...sample });
  };
  const schedule = () => { timer = setTimeout(() => {
    pending = take().then(() => { if (!stopped) schedule(); });
  }, intervalMs); };
  pending = take();
  await pending;
  schedule();
  return { async stop() { stopped = true; clearTimeout(timer); await pending; } };
}

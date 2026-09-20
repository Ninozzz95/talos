#!/usr/bin/env node
/**
 * Compare supervisor preflight using real OS probe processes and a separate HTTP
 * client process. Inference server spawn/health are fixtures: these measurements
 * are backend responsiveness, NOT GGUF load time, TTFT, decode, or desktop paint.
 *
 * node scripts/bench-llama-preflight.mjs --baseline /path/to/baseline/harness-ui \
 *   --output preflight.json --iterations 31 --probe-delay-ms 50
 */
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';
import { cpus, freemem, totalmem, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { createLlamaBinaryProbe } from '../src/llama-binary-probe.mjs';
import { createLlamaServerSupervisor as candidateFactory } from '../src/llama-server-supervisor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
const tick = () => new Promise(r => setImmediate(r));

function childStub() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kill = signal => { child.emit('close', 0, signal); return true; };
  return child;
}

async function clientMain() {
  process.send({ ready: true });
  process.once('message', ({ port, delayMs }) => {
    setTimeout(() => {
      const started = performance.now();
      const req = request({ host: '127.0.0.1', port, path: '/sentinel', agent: false }, response => {
        response.resume();
        response.once('end', () => {
          process.send({ rttMs: performance.now() - started, status: response.statusCode }, () => process.disconnect());
        });
      });
      req.setTimeout(5_000, () => req.destroy(new Error('sentinel timeout')));
      req.once('error', error => {
        process.send({ error: error.message }, () => process.disconnect());
      });
      req.end();
    }, delayMs);
  });
}

async function startClient() {
  const child = fork(scriptPath, ['--sentinel-client'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true });
  const ready = new Promise((resolveReady, rejectReady) => {
    child.once('message', message => message.ready ? resolveReady() : rejectReady(new Error('client handshake failed')));
    child.once('error', rejectReady);
    child.once('exit', () => rejectReady(new Error('client exited before ready')));
  });
  let resolveResult, rejectResult;
  const result = new Promise((r, j) => { resolveResult = r; rejectResult = j; });
  result.catch(() => {});
  child.on('message', message => {
    if (message.ready) return;
    if (message.error) rejectResult(new Error(message.error)); else resolveResult(message);
  });
  child.once('error', rejectResult);
  child.once('exit', () => rejectResult(new Error('client exited before its result')));
  const exited = new Promise(r => child.once('exit', r));
  await ready;
  return { child, result, exited };
}

function stripSecret(argv) {
  return argv.map((value, i) => argv[i - 1] === '--api-key' ? '<redacted>' : value);
}

function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (sorted.length - 1) * fraction, lower = Math.floor(p);
  return sorted[lower] + (sorted[Math.ceil(p)] - sorted[lower]) * (p - lower);
}
function summary(values) {
  const median = quantile(values, .5), mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, median, p95: values.length >= 20 ? quantile(values, .95) : null,
    mean, standardDeviation: Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1)),
    mad: quantile(values.map(v => Math.abs(v - median)), .5) };
}
function pairedCI(pairs, metric) {
  let state = 0x172026;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const ratios = [];
  for (let b = 0; b < 2_000; b++) {
    const sampled = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    const denominator = quantile(sampled.map(p => p.baseline[metric]), .5);
    if (denominator <= 0) return null; // A relative CI is undefined for zero CPU-time samples.
    ratios.push(quantile(sampled.map(p => p.candidate[metric]), .5) / denominator);
  }
  return [quantile(ratios, .025), quantile(ratios, .975)];
}

async function runOne({ factory, asyncProbe, scenario, port, probeDelayMs }) {
  const probes = [];
  const locks = [];
  const launch = [];
  const asyncRunner = createLlamaBinaryProbe({ onObservation: o => probes.push(o) });
  const probe = asyncProbe
    ? (_exe, args, timeout, { signal } = {}) => {
      const text = args.includes('--help') ? '--spec-type none,ngram-mod' : args.includes('q8_0') ? '-ngl -1' : scenario === 'fit-q8' ? '-ngl 12' : '-ngl -1';
      return asyncRunner(process.execPath, ['-e', `setTimeout(()=>process.stdout.write(${JSON.stringify(text)}),${probeDelayMs})`], timeout, { signal });
    }
    : (_exe, args, timeout = 30_000) => {
      const text = args.includes('--help') ? '--spec-type none,ngram-mod' : args.includes('q8_0') ? '-ngl -1' : scenario === 'fit-q8' ? '-ngl 12' : '-ngl -1';
      const began = performance.now();
      const out = spawnSync(process.execPath, ['-e', `setTimeout(()=>process.stdout.write(${JSON.stringify(text)}),${probeDelayMs})`], {
        shell: false, windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
      });
      probes.push({ kind: args.includes('--help') ? 'help' : 'fit', durationMs: performance.now() - began, exitCode: out.status });
      if (out.error) return null;
      return `${out.stdout ?? ''}\n${out.stderr ?? ''}`;
    };
  const supervisor = factory({
    binaryPath: scenario === 'native-node-help' ? process.execPath : join(tmpdir(), 'talos-preflight-fixture', 'llama-server'),
    gpuLayers: scenario === 'native-node-help' ? 0 : 99,
    ...(scenario === 'native-node-help' ? { onProbe: o => probes.push(o) } : { sondaBinario: probe }),
    modelStore: { lock: async id => locks.push(['lock', id]), unlock: async id => locks.push(['unlock', id]) },
    portAllocator: async () => 18080,
    spawnImpl: (_exe, args) => { launch.push(stripSecret(args)); return childStub(); },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  const load = { modelId: 'fixture-model', modelPath: join(tmpdir(), 'talos-preflight-fixture.gguf'), contextLength: 4096 };
  if (scenario === 'warm-cache') { await supervisor.start(load); await supervisor.stop(); probes.length = 0; launch.length = 0; locks.length = 0; }
  const client = await startClient();
  const cpuStart = process.cpuUsage();
  let previous = performance.now(), maxHeartbeatGapMs = 0;
  const interval = setInterval(() => { const now = performance.now(); maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - previous); previous = now; }, 2);
  try {
    client.child.send({ port, delayMs: scenario === 'warm-cache' ? 0 : 5 });
    const started = performance.now();
    const state = await supervisor.start(load);
    const supervisorReadyMs = performance.now() - started;
    assert.equal(state.state, 'ready');
    const sentinel = await client.result;
    assert.equal(sentinel.status, 200);
    await tick();
    await supervisor.stop();
    assert.equal(launch.length, 1);
    assert.deepEqual(locks, [['lock', 'fixture-model'], ['unlock', 'fixture-model']]);
    const cpu = process.cpuUsage(cpuStart);
    return { supervisorReadyMs, sentinelRttMs: sentinel.rttMs, maxHeartbeatGapMs, probeCount: scenario === 'native-node-help' && !asyncProbe ? null : probes.length,
      parentCpuUserUs: cpu.user, parentCpuSystemUs: cpu.system, parentRssEndBytes: process.memoryUsage().rss,
      probes, launch: launch[0] };
  } finally {
    clearInterval(interval);
    await supervisor.stop();
    if (client.child.connected) client.child.disconnect();
    client.child.kill();
    await client.exited;
  }
}

async function benchmarkMain() {
  const { values } = parseArgs({ options: {
    baseline: { type: 'string' }, output: { type: 'string' }, iterations: { type: 'string', default: '31' },
    'probe-delay-ms': { type: 'string', default: '50' }, scenario: { type: 'string', default: 'fit-q8' },
    control: { type: 'boolean', default: false },
  } });
  if (!values.baseline || !values.output) throw new Error('--baseline and --output are required');
  const iterations = Number(values.iterations), probeDelayMs = Number(values['probe-delay-ms']);
  if (!Number.isInteger(iterations) || iterations < 5 || iterations > 1_000 || !Number.isInteger(probeDelayMs) || probeDelayMs < 0 || probeDelayMs > 1_000) throw new Error('Invalid repetition count or fixture delay');
  if (!['fit-f16', 'fit-q8', 'warm-cache', 'native-node-help'].includes(values.scenario)) throw new Error('Unknown scenario');
  const baselineFile = resolve(values.baseline, 'src/llama-server-supervisor.mjs');
  const { createLlamaServerSupervisor: baselineFactory } = await import(pathToFileURL(baselineFile));
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('OK'); });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const port = server.address().port;
  const rows = [];
  try {
    for (let i = -3; i < iterations; i++) {
      const row = { order: i % 2 === 0 ? 'AB' : 'BA' };
      for (const label of row.order === 'AB' ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
        const isCandidate = label === 'candidate' && !values.control;
        row[label] = await runOne({ factory: isCandidate ? candidateFactory : baselineFactory, asyncProbe: isCandidate,
          scenario: values.scenario, port, probeDelayMs });
      }
      assert.deepEqual(row.baseline.launch, row.candidate.launch, 'successful launch arguments must remain equivalent');
      if (i >= 0) rows.push(row);
    }
  } finally { await new Promise(r => server.close(r)); }
  const sourceFiles = [baselineFile, resolve(here, '../src/llama-server-supervisor.mjs'), resolve(here, '../src/llama-binary-probe.mjs'), scriptPath];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  const metrics = {};
  for (const metric of ['supervisorReadyMs', 'sentinelRttMs', 'maxHeartbeatGapMs', 'parentCpuUserUs', 'parentCpuSystemUs', 'parentRssEndBytes']) {
    metrics[metric] = { baseline: summary(rows.map(r => r.baseline[metric])), candidate: summary(rows.map(r => r.candidate[metric])), pairedMedianRatioCI95: pairedCI(rows, metric) };
  }
  const result = {
    schema: 'talos.preflight-benchmark.v1', baseSha: '13f65c15cdeaf8986b882993a0773cdeafb867d2', generatedAt: new Date().toISOString(),
    scenario: values.scenario, comparison: values.control ? 'A/A baseline control' : 'A/B', probeDelayMs,
    method: '3 warmup pairs excluded; alternating AB/BA; successful launch argv/lock equivalence each pair; paired bootstrap of medians, 2000 resamples',
    scope: 'Real child probe processes; real independent HTTP client process and Node HTTP service. Model server spawn/health are fixtures, no inference.',
    unavailable: ['GGUF loading', 'TTFT', 'TTFV', 'prefill', 'decode', 'tool roundtrip', 'frontend paint', 'per-variant peak RSS', 'VRAM'],
    environment: { node: process.version, platform: process.platform, arch: process.arch, osRelease: release(), cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytesAtEnd: freemem() },
    sourceHashes, metrics, rows,
  };
  await writeFile(resolve(values.output), JSON.stringify(result, null, 2) + '\n');
  for (const [metric, data] of Object.entries(metrics)) console.log(`${metric}: ${data.baseline.median.toFixed(3)} -> ${data.candidate.median.toFixed(3)}; ratio CI ${data.pairedMedianRatioCI95?.map(v => v.toFixed(3)).join('–') ?? 'unavailable (zero denominator)'}`);
}

if (process.argv.includes('--sentinel-client')) await clientMain();
else await benchmarkMain().catch(error => { console.error(error); process.exitCode = 1; });

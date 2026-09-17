/** Deterministic adapter replay, NOT an inference, tool-execution or UI benchmark.
 * node --expose-gc scripts/bench-local-runtime-stream.mjs --baseline /path/to/base/src/local-runtime-llama-server.mjs --output results.json
 * Baseline must be an unmodified checkout with its adjacent imports. No downloads.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ownPath = fileURLToPath(import.meta.url);
const encoder = new TextEncoder();
const instant = new Date('2026-01-01T00:00:00.000Z');
const frame = (delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
const end = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n';

export function makeFixture(kind, size, fragmentSize = 32) {
  const frames = [];
  let expected;
  if (kind === 'tool') {
    const args = JSON.stringify({ payload: 'x'.repeat(size) });
    for (let offset = 0; offset < args.length; offset += fragmentSize) {
      // Repeated ID deliberately avoids conflating the baseline ID/index defect
      // with performance. First-ID-only streams have separate correctness tests.
      frames.push(frame({ tool_calls: [{ index: 0, id: 'call-1', function: {
        ...(offset === 0 ? { name: 'fixture_tool' } : {}), arguments: args.slice(offset, offset + fragmentSize),
      } }] }));
    }
    expected = [{ type: 'tool_call', id: 'call-1', name: 'fixture_tool', arguments: args }, { type: 'done' }];
  } else if (kind === 'text') {
    for (let index = 0; index < size; index++) frames.push(frame({ content: 'plain response text ' }));
    expected = Array.from({ length: size }, () => ({ type: 'text', value: 'plain response text ' }));
    expected.push({ type: 'done' });
  } else throw new TypeError(`Unknown fixture kind: ${kind}`);
  const bytes = encoder.encode(frames.join('') + end);
  // Fixed transport chunking, independent of model fragment boundaries.
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 4096) chunks.push(bytes.subarray(offset, offset + 4096));
  return { name: `${kind}-${size}`, kind, size, fragmentSize: kind === 'tool' ? fragmentSize : null,
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), chunks, expected, frames: frames.length };
}

export async function replay(createRuntime, fixture, { diagnostic = false } = {}) {
  const runtime = createRuntime({ now: () => instant, supervisor: {
    status: () => ({ state: 'ready', baseUrl: 'http://127.0.0.1:1' }),
    request: async () => {
      let offset = 0;
      return { ok: true, body: new ReadableStream({ pull(controller) {
        if (offset < fixture.chunks.length) controller.enqueue(fixture.chunks[offset++]);
        else controller.close();
      } }) };
    },
  } });
  const events = [];
  const parse = JSON.parse;
  let argumentParseCalls = 0;
  let argumentParsedChars = 0;
  if (diagnostic) JSON.parse = function (value, ...rest) {
    if (typeof value === 'string' && value.startsWith('{"payload":')) {
      argumentParseCalls++;
      argumentParsedChars += value.length;
    }
    return parse(value, ...rest);
  };
  const beforeMemory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const elu = performance.eventLoopUtilization();
  const start = performance.now();
  let firstEventMs = null;
  let firstToolMs = null;
  try {
    for await (const event of runtime.generateStream({ runId: 'bench', turnId: 'turn', modelId: 'fixture', messages: [] })) {
      const elapsed = performance.now() - start;
      if (firstEventMs === null) firstEventMs = elapsed;
      if (event.type === 'tool_call' && firstToolMs === null) firstToolMs = elapsed;
      const { runId, turnId, runtimeId, seq, at, ...payload } = event;
      events.push(payload);
    }
  } finally { JSON.parse = parse; }
  const elapsedMs = performance.now() - start;
  const cpuDelta = process.cpuUsage(cpu);
  const eventLoop = performance.eventLoopUtilization(elu);
  const memory = process.memoryUsage();
  // Outside the timed interval, but every repetition must validate its output.
  assert.deepEqual(events, fixture.expected, `${fixture.name} changed output`);
  return { elapsedMs, firstEventMs, firstToolMs, cpuMs: (cpuDelta.user + cpuDelta.system) / 1000,
    bytesPerSecond: fixture.bytes / (elapsedMs / 1000), eventLoopUtilization: eventLoop.utilization,
    rssBeforeBytes: beforeMemory.rss, rssAfterBytes: memory.rss,
    heapUsedBeforeBytes: beforeMemory.heapUsed, heapUsedAfterBytes: memory.heapUsed,
    externalAfterBytes: memory.external, events: events.length,
    ...(diagnostic ? { argumentParseCalls, argumentParsedChars } : {}) };
}

export function quantile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const index = Math.floor(position);
  return sorted[index] + (sorted[Math.min(index + 1, sorted.length - 1)] - sorted[index]) * (position - index);
}

function summarize(values) {
  const median = quantile(values, 0.5);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, median, p95: values.length >= 20 ? quantile(values, 0.95) : null, mean,
    standardDeviation: values.length > 1 ? Math.sqrt(values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1)) : null,
    medianAbsoluteDeviation: quantile(values.map((x) => Math.abs(x - median)), 0.5) };
}

function pairedInterval(baseline, candidate) {
  let seed = 1729;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const ratios = baseline.map((x, index) => candidate[index] / x);
  const bootstrap = [];
  for (let iteration = 0; iteration < 4000; iteration++) {
    bootstrap.push(quantile(ratios.map(() => ratios[Math.floor(random() * ratios.length)]), 0.5));
  }
  return { statistic: 'median paired candidate/baseline elapsed ratio', seed: 1729, resamples: 4000,
    estimate: quantile(ratios, 0.5), lower95: quantile(bootstrap, 0.025), upper95: quantile(bootstrap, 0.975) };
}

async function main() {
  const { values } = parseArgs({ options: {
    baseline: { type: 'string' }, candidate: { type: 'string' }, output: { type: 'string' },
    repetitions: { type: 'string', default: '21' }, warmups: { type: 'string', default: '3' },
    'base-sha': { type: 'string' }, scenario: { type: 'string' },
  } });
  const repetitions = Number(values.repetitions), warmups = Number(values.warmups);
  if (!Number.isInteger(repetitions) || repetitions < 2 || !Number.isInteger(warmups) || warmups < 0) throw new TypeError('Invalid repetitions/warmups');
  const paths = { ...(values.baseline ? { baseline: path.resolve(values.baseline) } : {}),
    candidate: path.resolve(values.candidate ?? path.join(path.dirname(ownPath), '../src/local-runtime-llama-server.mjs')) };
  const variants = {};
  for (const [name, filename] of Object.entries(paths)) {
    const bytes = await readFile(filename);
    const module = await import(pathToFileURL(filename).href);
    variants[name] = { createRuntime: module.createLlamaServerRuntime, filename,
      moduleSha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const fixtures = [['text', 1024], ...[4096, 16384, 65536, 262144].map((n) => ['tool', n])]
    .filter(([kind, size]) => !values.scenario || values.scenario.split(',').includes(`${kind}-${size}`))
    .map(([kind, size]) => makeFixture(kind, size));
  if (!fixtures.length) throw new Error('Unknown scenario');
  const report = { schema: 'talos.local-stream-benchmark.v1', recordedAt: new Date().toISOString(),
    baseSha: values['base-sha'] ?? null, harnessSha256: createHash('sha256').update(await readFile(ownPath)).digest('hex'), benchmark: 'synthetic SSE replay through real TALOS generateStream; no inference',
    machine: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version,
      cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length, totalRamBytes: os.totalmem(), freeRamBytes: os.freemem(),
      gpu: null, vram: null, driver: null, storage: null, physicalCores: null, powerProfile: null },
    protocol: { repetitions, warmups, order: 'alternate AB/BA by repetition; same process', forcedGc: typeof global.gc === 'function',
      clock: 'performance.now monotonic; epoch timestamps not compared',
      caveats: ['Synthetic fixture, not a recorded model stream.', 'No network, model, tools, AG-UI or frontend.',
        'RSS/heap endpoints are not per-variant peak memory or allocation counts.', 'Shared process high-water RSS cannot establish a memory regression.',
        'Event-loop utilization describes replay only. Thermal state and power profile unobserved.'] },
    unavailable: { modelLoadMs: null, fitProbeMs: null, ttftMs: null, ttfvMs: null, prefillTokS: null, decodeTokS: null,
      toolExecutionMs: null, continuationTtftMs: null, cachedTokens: null, peakVramBytes: null, allocations: null },
    complete: false, modules: Object.fromEntries(Object.entries(variants).map(([name, { filename, moduleSha256 }]) => [name, { filename, moduleSha256 }])), scenarios: [] };
  for (const fixture of fixtures) {
    const { chunks, expected, ...description } = fixture;
    const result = { ...description, iterations: {}, diagnostics: {}, summary: {} };
    for (const [name, variant] of Object.entries(variants)) {
      for (let warmup = 0; warmup < warmups; warmup++) await replay(variant.createRuntime, fixture);
      result.iterations[name] = [];
    }
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const order = Object.keys(variants);
      if (repetition % 2) order.reverse();
      for (const name of order) {
        await new Promise((resolve) => setImmediate(resolve));
        global.gc?.(); // Never inside the timed region.
        result.iterations[name].push({ repetition, ...await replay(variants[name].createRuntime, fixture) });
      }
    }
    for (const [name, variant] of Object.entries(variants)) {
      const { argumentParseCalls, argumentParsedChars } = await replay(variant.createRuntime, fixture, { diagnostic: true });
      result.diagnostics[name] = { argumentParseCalls, argumentParsedChars };
      result.summary[name] = { elapsedMs: summarize(result.iterations[name].map((x) => x.elapsedMs)),
        cpuMs: summarize(result.iterations[name].map((x) => x.cpuMs)) };
    }
    if (variants.baseline) result.comparison = pairedInterval(result.iterations.baseline.map((x) => x.elapsedMs), result.iterations.candidate.map((x) => x.elapsedMs));
    report.scenarios.push(result);
    console.error(fixture.name, JSON.stringify(result.summary));
    if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
  }
  report.complete = true;
  report.processMaxRssBytes = process.resourceUsage().maxRSS * 1024;
  const json = JSON.stringify(report, null, 2) + '\n';
  if (values.output) await writeFile(values.output, json); else process.stdout.write(json);
}

if (process.argv[1] && path.resolve(process.argv[1]) === ownPath) main().catch((error) => { console.error(error); process.exitCode = 1; });

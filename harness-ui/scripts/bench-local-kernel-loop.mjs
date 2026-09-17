/** Simulated inference, real loopback/kernel/tools. Not a model-performance benchmark. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release, totalmem } from 'node:os';
import { createKernelFixture, editScenario, FIXED_SOURCE, textFrames, toolFrames } from '../tests/fixtures/local-kernel-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILES = [
  'server.mjs', 'src/agent-service.mjs', 'src/config.mjs', 'src/llama-server-supervisor.mjs',
  'src/runtime-owner-adapter.mjs', 'src/session-registry.mjs', 'src/kernel/talosHarness.mjs',
  'src/kernel/talosHarness.desktop-hotfix.mjs', 'src/local-kernel-session.mjs', 'src/local-kernel-stream.mjs',
  'tests/fixtures/local-kernel-fixture.mjs', 'scripts/bench-local-kernel-loop.mjs',
];
const quantile = (values, p) => { const v = [...values].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(p * v.length))]; };
const median = values => { const v = [...values].sort((a, b) => a - b), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
function summary(values) {
  const m = median(values), mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { count: values.length, median: m, mean, mad: median(values.map(v => Math.abs(v - m))),
    stddev: Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1)),
    p95Exploratory: quantile(values, .95), min: Math.min(...values), max: Math.max(...values) };
}
function pairedInterval(pairs) {
  let seed = 0x13579bdf;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const values = [];
  for (let b = 0; b < 5000; b++) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    values.push(median(sample.map(p => p.candidate.elapsedMs)) / median(sample.map(p => p.baseline.elapsedMs)));
  }
  return { method: 'paired bootstrap of ratio of medians', seed: '0x13579bdf', resamples: 5000,
    low: quantile(values, .025), high: quantile(values, .975) };
}
async function productionFrom(root) {
  const load = name => import(pathToFileURL(resolve(root, 'harness-ui/src', name)).href);
  const [supervisor, owner, agent, registry, store] = await Promise.all([
    load('llama-server-supervisor.mjs'), load('runtime-owner-adapter.mjs'), load('agent-service.mjs'), load('session-registry.mjs'), load('session-store.mjs'),
  ]);
  return { createLlamaServerSupervisor: supervisor.createLlamaServerSupervisor, createOwnerRuntimeAdapter: owner.createOwnerRuntimeAdapter,
    avviaSessione: agent.avviaSessione, createSessionRegistry: registry.createSessionRegistry, registraRiga: store.registraRiga,
    kernelPath: resolve(root, 'harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs') };
}
async function identity(root) {
  const sources = {};
  for (const file of FILES) {
    try { sources[`harness-ui/${file}`] = createHash('sha256').update(await readFile(resolve(root, 'harness-ui', file))).digest('hex'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; sources[`harness-ui/${file}`] = null; }
  }
  return { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '', sources };
}
async function runOne({ variant, scenario, production }) {
  const fixture = await createKernelFixture({ scenario: scenario === 'read-write-test' ? editScenario : (body =>
    body.messages.some(m => m.role === 'tool') ? textFrames('File letto.') : toolFrames('leggi', { percorso: 'sum.mjs' }, 'read-only-1')),
  legacy: variant === 'baseline', enabled: variant !== 'baseline', production });
  try {
    const begin = performance.now();
    fixture.start();
    await fixture.finished();
    const elapsedMs = performance.now() - begin;
    assert.equal(fixture.results[0].ok, true, JSON.stringify(fixture.results[0]));
    assert.equal(fixture.requests.length, scenario === 'read-write-test' ? 4 : 2);
    if (scenario === 'read-write-test') assert.equal(await fixture.source(), FIXED_SOURCE);
    const starts = new Map(), toolDurations = [];
    for (const item of fixture.observations) {
      if (item.type === 'ToolCallStart') starts.set(item.toolCallId, item.at);
      if (item.type === 'ToolCallResult' && starts.has(item.toolCallId)) toolDurations.push(item.at - starts.get(item.toolCallId));
    }
    return { elapsedMs, requests: fixture.requests.length, toolDurationsMs: toolDurations,
      milestones: fixture.observations.map(({ at, ...rest }) => ({ ...rest, offsetMs: at - begin })), correct: true };
  } finally { await fixture.close(); }
}
export async function benchmark({ baselineRoot, iterations = 31, warmup = 3 } = {}) {
  if (!baselineRoot || !Number.isSafeInteger(iterations) || iterations < 3 || iterations > 200
      || !Number.isSafeInteger(warmup) || warmup < 0 || warmup > 20) throw new TypeError('baselineRoot and bounded integer repetitions are required');
  const baselineProduction = await productionFrom(resolve(baselineRoot));
  const result = { schema: 'talos.local-kernel.fixture-benchmark.v1', realInference: false,
    labels: { baseline: 'original shared kernel, cloud-classified local: model plus fixture-only dummy key',
      candidate: 'opt-in bound local kernel, no cloud key, template probe and strict terminal validation' },
    exclusions: ['llama inference', 'model load', 'GPU', 'real TTFT/TTFV', 'Electron rendering', 'peak RSS/VRAM'],
    protocol: { iterations, warmup, order: 'alternating AB/BA; separate warmup; correctness every run',
      timing: 'registry start through completion and persistence drain; fixture setup and cleanup excluded',
      p95: 'exploratory order statistic; insufficient samples for a robust tail claim',
      caveats: 'fresh temporary workspaces per run; paths/IDs differ; provider responses deterministic; auto-approved permission wait included; OS caches not flushed' },
    machine: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0]?.model ?? null,
      logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
    baseline: await identity(baselineRoot), candidate: await identity(ROOT), scenarios: [] };
  for (const scenario of ['read-write-test', 'read-only']) {
    for (let i = 0; i < warmup; i++) for (const variant of ['baseline', 'candidate']) {
      await runOne({ variant, scenario, production: variant === 'baseline' ? baselineProduction : null });
    }
    const pairs = [];
    for (let i = 0; i < iterations; i++) {
      const pair = { iteration: i, order: i % 2 ? 'BA' : 'AB' };
      for (const variant of i % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
        pair[variant] = await runOne({ variant, scenario, production: variant === 'baseline' ? baselineProduction : null });
      }
      pairs.push(pair);
    }
    const baseline = summary(pairs.map(p => p.baseline.elapsedMs)), candidate = summary(pairs.map(p => p.candidate.elapsedMs));
    result.scenarios.push({ scenario, baselineMs: baseline, candidateMs: candidate,
      deltaPercent: (candidate.median / baseline.median - 1) * 100, ratio95CI: pairedInterval(pairs), pairs });
  }
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = new Map();
    for (let i = 2; i < process.argv.length; i += 2) {
      if (!['--baseline-root', '--iterations', '--warmup', '--out'].includes(process.argv[i]) || process.argv[i + 1] === undefined) throw new Error('Usage: --baseline-root PATH [--iterations N] [--warmup N] [--out PATH]');
      args.set(process.argv[i], process.argv[i + 1]);
    }
    const result = await benchmark({ baselineRoot: args.get('--baseline-root'), iterations: Number(args.get('--iterations') ?? 31), warmup: Number(args.get('--warmup') ?? 3) });
    const text = JSON.stringify(result, null, 2) + '\n';
    if (args.has('--out')) { const out = resolve(args.get('--out')); await mkdir(dirname(out), { recursive: true }); await writeFile(out, text); }
    else process.stdout.write(text);
    for (const row of result.scenarios) console.error(`${row.scenario}: ${row.baselineMs.median.toFixed(3)} -> ${row.candidateMs.median.toFixed(3)} ms (${row.deltaPercent.toFixed(2)}%), ratio CI ${row.ratio95CI.low.toFixed(4)}..${row.ratio95CI.high.toFixed(4)}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
}

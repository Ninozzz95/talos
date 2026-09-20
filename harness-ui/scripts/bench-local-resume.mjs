/** Diagnostic overhead only: real loopback HTTP/filesystem, synthetic SSE, actual TALOS adapter. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir, cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalResumeDiagnostics, createResumeRecorder, createBoundedResumeSink } from '../src/local-resume-diagnostics.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';

const median = x => { const a = [...x].sort((a, b) => a - b), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const summarize = a => { const m = median(a); return { median: m, mad: median(a.map(x => Math.abs(x - m))), p95: a.length >= 20 ? [...a].sort((a, b) => a - b)[Math.ceil(a.length * .95) - 1] : null, min: Math.min(...a), max: Math.max(...a) }; };
function pairedInterval(pairs, field) {
  let seed = 912781; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const ratios = pairs.map(p => p.B[field] / p.A[field]); const samples = [];
  for (let k = 0; k < 2000; k++) samples.push(median(ratios.map(() => ratios[Math.floor(random() * ratios.length)])));
  samples.sort((a, b) => a - b); return { medianPairedRatio: median(ratios), bootstrap95: [samples[49], samples[1949]] };
}
const hash = x => createHash('sha256').update(x).digest('hex');
export async function benchmarkResume({ repetitions = 31, warmups = 5 } = {}) {
  const scenarios = [
    { name: 'stream-1024-metadata', bytes: 8192, frames: 1024, enabled: true, raw: false },
    { name: 'history-128KiB-metadata', bytes: 128 * 1024, frames: 32, enabled: true, raw: false },
    { name: 'history-1MiB-private-capture', bytes: 1024 * 1024, frames: 32, enabled: true, raw: true },
    { name: 'AA-stream-1024-disabled', bytes: 8192, frames: 1024, enabled: false, raw: false },
  ];
  const report = { schema: 'talos.resume-observer-overhead.v1', generatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length, ramBytes: totalmem() }, methodology: { repetitions, excludedWarmupPairs: warmups, order: 'alternating AB/BA', bootstrapSamples: 2000, transport: 'real localhost HTTP', output: 'synthetic deterministic SSE', adapter: 'actual production createLlamaServerRuntime', disk: 'actual queued writes; directory creation excluded; flush both included and separate', noModelInference: true, peakMemoryMeasured: false }, sourceSha256: {}, realModel: { ttftMs: null, prefillMs: null, cachedTokens: null, peakVram: null }, scenarios: [] };
  for (const file of ['../src/local-resume-diagnostics.mjs', '../src/local-resume-observer.mjs', '../src/local-resume-prefix.mjs', '../src/local-runtime-llama-server.mjs', './bench-local-resume.mjs']) report.sourceSha256[file] = hash(await readFile(new URL(file, import.meta.url)));
  const root = await mkdtemp(join(tmpdir(), 'talos-resume-bench-'));
  try {
    for (const scenario of scenarios) {
      const payload = Array.from({ length: scenario.frames }, () => 'data: {"choices":[{"delta":{"content":"risposta à "}}]}\n\n').join('') + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
      const messages = [{ role: 'system', content: 'Agent semantics unchanged.' }, { role: 'user', content: 'x'.repeat(scenario.bytes) }];
      let expectedRequest = null, received = 0;
      const server = createServer(async (req, res) => {
        try {
          const pieces = []; for await (const part of req) pieces.push(part);
          const raw = Buffer.concat(pieces).toString('utf8');
          if (expectedRequest === null) expectedRequest = raw; else assert.equal(raw, expectedRequest);
          received++; res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(payload);
        } catch { res.writeHead(500); res.end(); }
      });
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      try {
        const make = async (label, enabled) => {
          const dir = join(root, scenario.name, label); await mkdir(join(dir, 'private'), { recursive: true });
          const sink = createBoundedResumeSink({ directory: dir });
          const diagnostic = enabled ? createResumeRecorder({ sink, sessionId: 'benchmark', captureRaw: scenario.raw }) : await createLocalResumeDiagnostics({ env: {} });
          const supervisor = diagnostic.wrapSupervisor({ status: () => ({ state: 'ready', modelId: 'fixture' }), request: (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options) });
          const runtime = diagnostic.wrapRuntime(createLlamaServerRuntime({ supervisor })); let pending;
          const registry = diagnostic.wrapRegistry({ resume() {
            pending = (async () => {
              const output = [];
              for await (const event of runtime.generateStream({ runId: 'run', turnId: 'turn', modelId: 'fixture', messages })) {
                output.push({ type: event.type, value: event.value, name: event.name, arguments: event.arguments });
              }
              return JSON.stringify(output);
            })(); return { sessionId: 'benchmark' };
          } });
          return async () => {
            const cpuStart = process.cpuUsage(), memoryBefore = process.memoryUsage(), start = performance.now();
            registry.resume('benchmark'); const output = await pending; const streamEnd = performance.now();
            const sinkStats = await diagnostic.flush(); const end = performance.now();
            const cpu = process.cpuUsage(cpuStart);
            return { elapsedMs: streamEnd - start, withFlushMs: end - start, flushMs: end - streamEnd, parentCpuUserUs: cpu.user, parentCpuSystemUs: cpu.system, rssBefore: memoryBefore.rss, rssAfter: process.memoryUsage().rss, outputSha256: hash(output), sink: sinkStats ?? null };
          };
        };
        const A = await make('A', false), B = await make('B', scenario.enabled); const pairs = [], discardedWarmups = [];
        for (let i = -warmups; i < repetitions; i++) {
          const order = (i + warmups) % 2 ? ['B', 'A'] : ['A', 'B']; const pair = { iteration: i, order: order.join('') };
          for (const label of order) pair[label] = await (label === 'A' ? A : B)();
          assert.equal(pair.A.outputSha256, pair.B.outputSha256);
          if (scenario.enabled) { assert.equal(pair.B.sink.errors, 0); assert.equal(pair.B.sink.dropped, 0); }
          (i < 0 ? discardedWarmups : pairs).push(pair);
        }
        assert.equal(received, (repetitions + warmups) * 2);
        const summaries = {};
        for (const field of ['elapsedMs', 'withFlushMs', 'parentCpuUserUs', 'parentCpuSystemUs']) summaries[field] = { A: summarize(pairs.map(p => p.A[field])), B: summarize(pairs.map(p => p.B[field])), ...(field.endsWith('Ms') ? pairedInterval(pairs, field) : {}) };
        report.scenarios.push({ ...scenario, requestBytes: Buffer.byteLength(expectedRequest), requestSha256: hash(expectedRequest), responseBytes: Buffer.byteLength(payload), responseSha256: hash(payload), summaries, warmups: discardedWarmups, pairs });
      } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
  return report;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [output, count] = process.argv.slice(2); const repetitions = count === undefined ? 31 : Number(count);
  if (!output || !Number.isSafeInteger(repetitions) || repetitions < 5 || repetitions > 100) { console.error('Usage: node scripts/bench-local-resume.mjs OUTPUT.json [5..100 pairs]'); process.exitCode = 2; }
  else { try { const report = await benchmarkResume({ repetitions }); await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); console.log('Synthetic diagnostic overhead report written; no model timings measured.'); } catch (error) { console.error(error); process.exitCode = 1; } }
}

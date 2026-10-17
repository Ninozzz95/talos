/*
 * Le prove di `local-resume-diagnostics.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createLocalResumeDiagnostics, createResumeRecorder, createBoundedResumeSink, RESUME_LIMITS } from '../src/local-resume-diagnostics.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { buildResumeReport } from '../scripts/report-local-resume.mjs';
const enc = new TextEncoder();
const raw = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
const response = () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(raw)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
function memory() { const records = [], files = new Map(); return { records, files, record: r => { records.push(r); return true; }, privateRequest: (id, body) => { files.set(id, body); return true; }, flush: async () => ({ errors: 0, dropped: 0 }) }; }
function fakeSupervisor(fn = async () => response()) { return { status: () => ({ state: 'ready', modelId: 'm' }), request: fn, start: async () => ({ state: 'ready' }), stop: async () => ({ state: 'unavailable' }) }; }
function harness({ captureRaw = false, selected = 's', limits } = {}) {
  const sink = memory(), diag = createResumeRecorder({ sink, sessionId: selected, captureRaw, ...(limits ? { limits } : {}) });
  let pending;
  const supervisor = diag.wrapSupervisor(fakeSupervisor());
  const registry = diag.wrapRegistry({ resume(id, body) { pending = Promise.resolve().then(async () => { const r = await diag.withRoute('owner-transport', () => supervisor.request('/v1/chat/completions', { method: 'POST', body })); return r.text(); }); return { sessionId: id }; } });
  return { sink, diag, registry, supervisor, get pending() { return pending; } };
}



















test('report whitelists metadata and distinguishes unknown model metrics and EOF', async () => {
  const h = harness(); h.registry.resume('s', '{"model":"m","messages":[]}'); await h.pending;
  const r = buildResumeReport([...h.sink.records, { schema: 'talos.local-resume.v1', type: 'unknown', messages: 'SECRET' }]);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].serverCacheN, null); assert.equal(r.rows[0].frontendVisibleMs, null); assert.equal(r.rows[0].completedModelTurn, null); assert.equal(r.rows[0].outcome, 'eof'); assert.ok(!JSON.stringify(r).includes('SECRET'));
});


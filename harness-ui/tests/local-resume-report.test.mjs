import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loopbackBase, reconstructPair } from '../scripts/compare-local-resume.mjs';
import { buildResumeReport } from '../scripts/report-local-resume.mjs';
import { compareRequestBodies } from '../src/local-resume-prefix.mjs';
import { createResumeRecorder } from '../src/local-resume-diagnostics.mjs';

const raw = n => JSON.stringify({ model: 'model', messages: [{ role: 'system', content: 'PRIVATE prompt' }, { role: 'user', content: `turn ${n}` }], tools: [{ type: 'function', function: { name: 'PRIVATE_tool', parameters: { type: 'object' } } }], chat_template_kwargs: { enable_thinking: true }, stream: true });
function fakeServer(change = null) {
  const calls = []; let props = 0;
  const fetchFn = async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, options });
    let body;
    if (path === '/props') body = { chat_template: props++ && change === 'props' ? 'changed' : 'template', build_info: 'b10517-deadbeef' };
    else if (path === '/v1/models') body = { data: [{ id: change === 'model' ? 'other' : 'model' }] };
    else if (path === '/apply-template') body = { prompt: JSON.parse(options.body).messages.map(m => m.content).join('\n') };
    else if (path === '/tokenize') body = { tokens: [...JSON.parse(options.body).content].map(c => c.codePointAt(0)) };
    else throw new Error('generation or unknown endpoint must not be called');
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchFn };
}

test('reconstruction refuses nonliteral loopback, credentials, redirects endpoints and paths', () => {
  for (const url of ['https://example.org', 'http://localhost:8080', 'http://127.0.0.1.evil:8080', 'http://127.0.0.1:8080/v1', 'http://key@127.0.0.1:8080', 'http://127.0.0.1:8080/?token=x', 'http://127.0.0.1:8080/#x']) assert.throws(() => loopbackBase(url));
  assert.equal(loopbackBase('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.equal(loopbackBase('http://[::1]:8080'), 'http://[::1]:8080');
});

test('reconstruction forwards the entire captured tools/template body without generation', async () => {
  const f = fakeServer();
  const r = await reconstructPair(raw(1), raw(2), { baseUrl: 'http://127.0.0.1:8080', apiKey: 'PRIVATE-key', addSpecial: true, fetchFn: f.fetchFn });
  assert.deepEqual(f.calls.map(c => c.path), ['/props', '/v1/models', '/apply-template', '/tokenize', '/apply-template', '/tokenize', '/props', '/v1/models']);
  assert.equal(f.calls[2].options.body, raw(1)); assert.equal(f.calls[4].options.body, raw(2));
  for (const call of f.calls) { assert.equal(call.options.redirect, 'error'); assert.equal(call.options.headers.Authorization, 'Bearer PRIVATE-key'); }
  for (const call of f.calls.filter(c => c.path === '/tokenize')) { const b = JSON.parse(call.options.body); assert.equal(b.add_special, true); assert.equal(b.parse_special, true); }
  assert.ok(r.commonPromptTokens > 0); assert.equal(r.reconstruction.capturedRuntimeIdentityVerified, false);
  assert.ok(!JSON.stringify(r).includes('PRIVATE')); assert.ok(!Object.hasOwn(r, 'tokens'));
});

test('model and add-special preconditions fail before any request', async () => {
  const f = fakeServer();
  await assert.rejects(reconstructPair(raw(1), raw(2), { baseUrl: 'http://127.0.0.1', fetchFn: f.fetchFn }), /explicit-add-special/);
  await assert.rejects(reconstructPair(raw(1), raw(2).replace('"model":"model"', '"model":"other"'), { baseUrl: 'http://127.0.0.1', addSpecial: false, fetchFn: f.fetchFn }), /same-model/);
  assert.equal(f.calls.length, 0);
});

test('multimodal input is refused rather than claiming text-token equivalence', async () => {
  const b = JSON.stringify({ model: 'model', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'PRIVATE' } }] }] });
  const f = fakeServer(); await assert.rejects(reconstructPair(b, b, { baseUrl: 'http://127.0.0.1', addSpecial: false, fetchFn: f.fetchFn }), /text-only/); assert.equal(f.calls.length, 0);
});

test('wrong loaded alias and changed server properties cannot produce a causal prefix claim', async () => {
  for (const change of ['model', 'props']) {
    const f = fakeServer(change);
    await assert.rejects(reconstructPair(raw(1), raw(2), { baseUrl: 'http://127.0.0.1', addSpecial: false, fetchFn: f.fetchFn }), change === 'model' ? /alias-mismatch/ : /profile-changed/);
  }
});

test('oversized or invalid tokenization response is refused', async () => {
  await assert.rejects(reconstructPair(raw(1), raw(2), { baseUrl: 'http://127.0.0.1', addSpecial: true, fetchFn: async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)) }), /too-large/);
  const f = fakeServer();
  await assert.rejects(reconstructPair(raw(1), raw(2), { baseUrl: 'http://127.0.0.1', addSpecial: false, fetchFn: (url, options) => url.endsWith('/tokenize') ? new Response('{"tokens":["not-a-token"]}') : f.fetchFn(url, options) }), /integer token/);
});

test('report includes metadata-only first-byte comparisons and health, no supplied secret values', () => {
  const prefix = compareRequestBodies(raw(1), raw(2)); prefix.extra = 'PRIVATE';
  prefix.firstChangedMessage.fields.push('PRIVATE');
  const base = { schema: 'talos.local-resume.v1', bootId: 'boot' };
  const report = buildResumeReport([
    { ...base, type: 'request-start', requestId: 'r00002', snapshot: { prefix, previousRequestId: 'r00001' } },
    { ...base, type: 'recording-limit' }, { ...base, type: 'recorder-flush', sink: { errors: 1, dropped: 2, PRIVATE: 'PRIVATE' } },
  ]);
  assert.equal(report.rows[0].prefixComparison.firstChangedMessage.index, 1);
  assert.ok(report.rows[0].prefixComparison.fields.messages.commonBytes > 0);
  assert.equal(report.rows[0].commonPromptTokens, null); assert.equal(report.captureHealth.limitReached, true); assert.equal(report.captureHealth.lastFlushSnapshot.dropped, 2);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('report rejects concatenated boots instead of correlating colliding request IDs', () => {
  assert.throws(() => buildResumeReport(['a', 'b'].map(bootId => ({ schema: 'talos.local-resume.v1', type: 'request-start', bootId, requestId: 'r00001' }))), /multiple-boots/);
});

test('standalone byte comparator does not contact a server or export source text', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-compare-')); t.after(() => rm(dir, { force: true, recursive: true }));
  const a = join(dir, 'a.json'), b = join(dir, 'b.json'), out = join(dir, 'out.json');
  await writeFile(a, raw(1)); await writeFile(b, raw(2));
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/compare-local-resume.mjs', import.meta.url)), a, b, out]);
  const result = await readFile(out, 'utf8'); assert.ok(!result.includes('PRIVATE')); assert.equal(JSON.parse(result).commonPromptTokens, null);
});

test('real loopback HTTP response crosses wrapped transport byte-for-byte and disconnects on cancel', { timeout: 10_000 }, async t => {
  const records = []; let disconnected; const closed = new Promise(r => { disconnected = r; });
  const payload = 'data: {"choices":[{"delta":{"content":"à"}}]}\n\n';
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(payload); res.on('close', disconnected); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const recorder = createResumeRecorder({ sink: { record: r => records.push(r) } });
  const wrapped = recorder.wrapSupervisor({ status: () => ({ state: 'ready', modelId: 'model' }), request: (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options) });
  const response = await wrapped.request('/v1/chat/completions', { method: 'POST', body: raw(1) });
  const reader = response.body.getReader(); const first = await reader.read(); assert.equal(Buffer.from(first.value).toString(), payload);
  await reader.cancel(); await closed;
  const end = records.find(r => r.type === 'request-end'); assert.equal(end.observation.outcome, 'cancelled'); assert.equal(end.observation.server['timings.cache_n'], null);
});

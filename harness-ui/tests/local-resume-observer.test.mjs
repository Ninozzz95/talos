import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacketObserver, createSseObserver, observeResponse } from '../src/local-resume-observer.mjs';
import { compareRequestBodies, compareRenderedPrompts, byteComparison } from '../src/local-resume-prefix.mjs';
const enc = new TextEncoder();
const frame = p => `data: ${JSON.stringify(p)}\n\n`;
function response(text, { bytewise = false, type = 'text/event-stream' } = {}) {
  const bytes = enc.encode(text); let i = 0;
  return new Response(new ReadableStream({ pull(c) { if (i === bytes.length) return c.close(); const end = bytewise ? i + 1 : bytes.length; c.enqueue(bytes.slice(i, end)); i = end; } }, { highWaterMark: 0 }), { headers: { 'content-type': type, 'x-fixture': 'intact' } });
}

test('byte-identical stream, split UTF-8, reasoning, native tools, metrics and DONE', async () => {
  const raw = ': ping\r\n\r\n' + frame({ prompt_progress: { total: 80, cache: 70, processed: 80, time_ms: 13 } }) + frame({ choices: [{ delta: { reasoning_content: 'pensiero è' } }] }) + frame({ choices: [{ delta: { content: 'risposta 😀' } }] }) + frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] }, finish_reason: 'tool_calls' }], timings: { prompt_n: 10, prompt_ms: 13, cache_n: 70, predicted_n: 12 } }) + 'data: [DONE]\n\n';
  let end, clock = 0;
  const r = observeResponse(response(raw, { bytewise: true }), { now: () => ++clock, onEnd: e => { end = e; } });
  assert.equal(r.headers.get('x-fixture'), 'intact'); assert.equal(await r.text(), raw);
  assert.equal(end.doneMarker, true); assert.equal(end.finishReason, 'tool_calls');
  assert.equal(end.server['timings.prompt_n'], 10); assert.equal(end.server['prompt_progress.cache'], 70);
  assert.equal(end.server['tokens_cached'], null);
  assert.ok(end.firstReasoningDeltaMs < end.firstContentDeltaMs); assert.ok(end.firstContentDeltaMs < end.firstToolDeltaMs);
  assert.equal(end.outcome, 'eof'); assert.equal(end.oversizedFrames, 0);
});

test('no read ahead: zero upstream pulls until downstream asks', async () => {
  let pulls = 0;
  const r = observeResponse(new Response(new ReadableStream({ pull(c) { pulls++; c.close(); } }, { highWaterMark: 0 }), { headers: { 'content-type': 'text/event-stream' } }));
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(pulls, 0);
  await r.text(); assert.equal(pulls, 1);
});

test('cancellation reason and acknowledgement reach the original body', async () => {
  const reason = new Error('stop-secret'); let cancelled, end;
  const r = observeResponse(new Response(new ReadableStream({ cancel(r) { cancelled = r; } }, { highWaterMark: 0 }), { headers: { 'content-type': 'text/event-stream' } }), { onEnd: e => { end = e; } });
  await r.body.cancel(reason); assert.equal(cancelled, reason); assert.equal(end.outcome, 'cancelled'); assert.ok(!JSON.stringify(end).includes('stop-secret'));
});

test('transport error object is propagated unchanged', async () => {
  const error = new Error('network-failure'); let end;
  const r = observeResponse(new Response(new ReadableStream({ pull(c) { c.error(error); } }, { highWaterMark: 0 }), { headers: { 'content-type': 'text/event-stream' } }), { onEnd: e => { end = e; } });
  await assert.rejects(r.text(), e => e === error); assert.equal(end.outcome, 'transport-error');
});

test('heartbeat only is not a model token or success', async () => {
  let end; await observeResponse(response(': ping\n\n'), { onEnd: e => { end = e; } }).text();
  assert.notEqual(end.firstChunkMs, null); assert.equal(end.firstModelDeltaMs, null); assert.equal(end.finishReason, null); assert.equal(end.doneMarker, false);
});

test('malformed SSE is observed but not repaired, deleted or made fatal', async () => {
  const raw = 'data: not json\n\n' + frame({ choices: [{ delta: { content: 'ok' } }] }); let end;
  assert.equal(await observeResponse(response(raw), { onEnd: e => { end = e; } }).text(), raw);
  assert.equal(end.malformedPackets, 1); assert.notEqual(end.firstContentDeltaMs, null);
});

test('multi-line data, BOM, CR and CRLF framing', () => {
  const packets = []; const s = createSseObserver(x => packets.push(x));
  for (const b of enc.encode('\uFEFF: c\r\rdata: {\r\ndata: "a": 1}\r\n\r\n')) s.push(Uint8Array.of(b));
  assert.deepEqual(packets, ['{\n"a": 1}']); assert.equal(s.finish().unterminatedFrame, false);
});

test('over-limit frame is skipped for observation only, recovery at blank boundary', async () => {
  let end;
  const raw = frame({ content: 'x'.repeat(500) }) + frame({ content: 'ok', stop: true });
  assert.equal(await observeResponse(response(raw), { maxBytes: 100, onEnd: e => { end = e; } }).text(), raw);
  assert.equal(end.oversizedFrames, 1); assert.notEqual(end.firstContentDeltaMs, null); assert.equal(end.nativeStop, true);
});

test('unterminated SSE final buffer is not promoted to an observed terminal event', async () => {
  let end; const raw = 'data: {"stop":true}';
  assert.equal(await observeResponse(response(raw), { onEnd: e => { end = e; } }).text(), raw);
  assert.equal(end.unterminatedFrame, true); assert.equal(end.nativeStop, null);
});

test('non-streaming JSON preserves payload and observes native timing sources', async () => {
  let end; const raw = JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 60, prompt_tokens_details: { cached_tokens: 0 } } });
  assert.deepEqual(await observeResponse(response(raw, { type: 'application/json', bytewise: true }), { onEnd: e => { end = e; } }).json(), JSON.parse(raw));
  assert.equal(end.server['usage.prompt_tokens'], 60); assert.equal(end.server['usage.prompt_tokens_details.cached_tokens'], 0);
});

test('invalid and negative numeric fields never become estimates', () => {
  const o = createPacketObserver(); o.packet(JSON.stringify({ timings: { prompt_n: '120', prompt_ms: -1 }, prompt_progress: { cache: null } }));
  assert.equal(o.observation.server['timings.prompt_n'], null); assert.equal(o.observation.server['timings.prompt_ms'], null);
});

test('observer callbacks may throw without corrupting the stream', async () => {
  const raw = frame({ content: 'safe' });
  assert.equal(await observeResponse(response(raw), { onMilestone() { throw new Error('telemetry'); }, onEnd() { throw new Error('telemetry'); } }).text(), raw);
});

test('JSON over the cap is forwarded and explicitly marked', async () => {
  let end; const raw = JSON.stringify({ content: 'x'.repeat(500) });
  assert.equal(await observeResponse(response(raw, { type: 'application/json' }), { maxBytes: 50, onEnd: e => { end = e; } }).text(), raw);
  assert.equal(end.oversizedFrames, 1); assert.equal(end.firstModelDeltaMs, null);
});

test('empty response is the same object', () => {
  const r = new Response(null, { status: 204 }); assert.equal(observeResponse(r), r);
});

test('response metadata url/type/redirected and clone behavior remain available', async () => {
  const r = response(frame({ content: 'ok' })); Object.defineProperty(r, 'url', { value: 'http://127.0.0.1:1/v1/chat/completions' });
  const o = observeResponse(r); assert.equal(o.url, r.url); assert.equal(o.type, r.type); assert.equal(o.redirected, r.redirected);
  const copy = o.clone(); assert.equal(await o.text(), await copy.text());
});

test('prefix metadata identifies changed system content without emitting it', () => {
  const a = JSON.stringify({ model: 'secret-model', messages: [{ role: 'system', content: 'SECRET alpha' }, { role: 'user', content: 'hi' }] });
  const b = JSON.stringify({ model: 'secret-model', messages: [{ role: 'system', content: 'SECRET beta' }, { role: 'user', content: 'hi' }] });
  const c = compareRequestBodies(a, b); assert.equal(c.firstChangedMessage.index, 0); assert.deepEqual(c.firstChangedMessage.fields, ['content']);
  assert.equal(c.firstChangedMessage.roleAfter, 'system'); assert.equal(c.commonPromptTokens, null); assert.ok(!JSON.stringify(c).includes('SECRET'));
});

test('appended messages and tool-order churn are distinct', () => {
  const base = { model: 'm', tools: [{ name: 'a' }, { name: 'b' }], messages: [{ role: 'user', content: 'x' }] };
  const append = compareRequestBodies(JSON.stringify(base), JSON.stringify({ ...base, messages: [...base.messages, { role: 'user', content: 'y' }] }));
  assert.equal(append.firstChangedMessage.change, 'appended'); assert.equal(append.firstChangedMessage.index, 1);
  const reorder = compareRequestBodies(JSON.stringify(base), JSON.stringify({ ...base, tools: [...base.tools].reverse() }));
  assert.equal(reorder.firstChangedMessage, null); assert.equal(reorder.fields.tools.equal, false);
});

test('byte offsets, not UTF-16 offsets', () => {
  assert.deepEqual(byteComparison('😀é', '😀è'), { previousBytes: 6, currentBytes: 6, commonBytes: 5, firstDifferentByte: 5, equal: false });
  assert.equal(byteComparison('a', 'a').firstDifferentByte, null);
});

test('token comparison requires actual integer arrays and does not export IDs', () => {
  const r = compareRenderedPrompts({ prompt: 'one', tokens: [99991, 22, 33] }, { prompt: 'two', tokens: [99991, 22, 44] });
  assert.equal(r.commonPromptTokens, 2); assert.ok(!JSON.stringify(r).includes('99991'));
  assert.throws(() => compareRenderedPrompts({ prompt: '', tokens: ['1'] }, { prompt: '', tokens: [] }));
});

test('100 deterministic byte partitions preserve SSE packets and multibyte content', () => {
  const payload = '\ufeff:heartbeat\r\n\r\ndata: {"choices":[{"delta":{"content":"à😀"}}]}\r\n\r\ndata: [DONE]\n\n';
  const bytes = enc.encode(payload); let seed = 70139;
  for (let trial = 0; trial < 100; trial++) {
    const packets = []; const parser = createSseObserver(x => packets.push(x));
    for (let i = 0; i < bytes.length;) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const next = Math.min(i + 1 + seed % 11, bytes.length); parser.push(bytes.subarray(i, next)); i = next; }
    assert.deepEqual(parser.finish(), { oversizedFrames: 0, unterminatedFrame: false });
    assert.deepEqual(packets, ['{"choices":[{"delta":{"content":"à😀"}}]}', '[DONE]']);
  }
});

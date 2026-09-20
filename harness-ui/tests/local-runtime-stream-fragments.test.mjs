import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';

const input = { runId: 'r', turnId: 't', modelId: 'm', messages: [] };
const encode = (value) => new TextEncoder().encode(value);
const frame = (delta, finish_reason) => `data: ${JSON.stringify({ choices: [{ delta, ...(finish_reason ? { finish_reason } : {}) }] })}\n\n`;
const call = (index, args, { id, name } = {}) => ({ index, ...(id ? { id } : {}), function: { ...(name ? { name } : {}), arguments: args } });
const toolFrame = (...calls) => frame({ tool_calls: calls });
const finish = frame({}, 'tool_calls');

function setup(parts, { signal, onRead = () => {}, failAfter = false } = {}) {
  let position = 0, cancelled = 0, requestSignal;
  const chunks = parts.map((part) => typeof part === 'string' ? encode(part) : part);
  const runtime = createLlamaServerRuntime({
    supervisor: { status: () => ({ state: 'ready', baseUrl: 'http://127.0.0.1:1' }), request: async (_path, options) => {
      position = 0;
      requestSignal = options.signal;
      options.signal.throwIfAborted();
      return { ok: true, body: { getReader: () => ({
        read: async () => {
          onRead(position, options.signal);
          options.signal.throwIfAborted();
          if (position < chunks.length) return { value: chunks[position++], done: false };
          if (failAfter) throw new Error('read beyond supplied boundary');
          return { done: true };
        },
        cancel: async () => { cancelled++; },
      }) } };
    } },
  });
  return { runtime, stream: () => runtime.generateStream({ ...input, requestId: 'request', signal }),
    cancelled: () => cancelled, requestSignal: () => requestSignal };
}
async function collect(stream) { const events = []; for await (const event of stream) events.push(event); return events; }
const tools = (events) => events.filter((event) => event.type === 'tool_call');

test('native fragments keep identity when only the first fragment supplies id/name', async () => {
  const fixture = setup([toolFrame(call(0, '{"q":', { id: 'call-real', name: 'search' })), toolFrame(call(0, '"value"}')), finish, 'data: [DONE]\n\n']);
  const events = await collect(fixture.stream());
  assert.deepEqual(events.map((e) => e.type), ['tool_call', 'done']);
  assert.equal(tools(events)[0].id, 'call-real');
  assert.equal(tools(events)[0].arguments, '{"q":"value"}');
});

test('interleaved calls are independent and retain first-seen ordering', async () => {
  const fixture = setup([
    toolFrame(call(1, '{"x":', { id: 'b', name: 'second' }), call(0, '{"x":', { id: 'a', name: 'first' })),
    toolFrame(call(0, '1}'), call(1, '2}')), finish,
  ]);
  const events = await collect(fixture.stream());
  assert.deepEqual(tools(events).map((e) => [e.id, e.name, e.arguments]), [['b', 'second', '{"x":2}'], ['a', 'first', '{"x":1}']]);
});

test('legacy id-only fragments still assemble', async () => {
  const fixture = setup([toolFrame(call(undefined, '{"q":', { id: 'legacy', name: 'search' })), toolFrame(call(undefined, '0}', { id: 'legacy' })), finish]);
  assert.equal(tools(await collect(fixture.stream()))[0]?.arguments, '{"q":0}');
});

test('index and id namespaces do not collide', async () => {
  const fixture = setup([toolFrame(call(0, '{"a":', { id: '1', name: 'first' }), call(1, '{"b":', { id: '0', name: 'second' })), toolFrame(call(0, '0}'), call(1, '1}')), finish]);
  assert.deepEqual(tools(await collect(fixture.stream())).map((e) => [e.id, e.arguments]), [['1', '{"a":0}'], ['0', '{"b":1}']]);
});

test('a valid scalar prefix is not emitted before remaining bytes', async () => {
  const fixture = setup([toolFrame(call(0, '1', { id: 'a', name: 'number' })), toolFrame(call(0, '2', { id: 'a' })), finish]);
  const events = await collect(fixture.stream());
  assert.equal(tools(events).length, 1);
  assert.equal(tools(events)[0].arguments, '12');
});

test('invalid suffix after a valid object is reported, never silently dropped', async () => {
  const fixture = setup([toolFrame(call(0, '{}', { id: 'a', name: 'search' })), toolFrame(call(0, 'garbage', { id: 'a' })), finish]);
  const events = await collect(fixture.stream());
  assert.equal(tools(events).length, 0);
  assert.equal(events[0].code, 'TOOL_CALL_MALFORMED');
});

test('finish_reason without delta flushes before reading another frame', async () => {
  const fixture = setup([toolFrame(call(0, '{}', { id: 'a', name: 'search' })), 'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n'], { failAfter: true });
  const iterator = fixture.stream();
  assert.equal((await iterator.next()).value.type, 'tool_call');
  await iterator.return();
  assert.equal(fixture.cancelled(), 1);
});

test('name fragments finish before tool emission', async () => {
  const fixture = setup([toolFrame(call(0, '{}', { id: 'a', name: 'file_' })), toolFrame(call(0, '', { name: 'read' })), finish]);
  assert.equal(tools(await collect(fixture.stream()))[0]?.name, 'file_read');
});

test('ordinary EOF retains complete legacy calls without finish_reason', async () => {
  const fixture = setup([toolFrame(call(0, '{"ok":true}', { id: 'a', name: 'search' })).trimEnd()]);
  assert.equal(tools(await collect(fixture.stream()))[0]?.arguments, '{"ok":true}');
});

test('malformed JSON and missing names yield typed errors once per call', async () => {
  const fixture = setup([toolFrame(call(0, '{', { id: 'broken', name: 'search' }), call(1, '{}', { id: 'nameless' })), finish]);
  const events = await collect(fixture.stream());
  assert.deepEqual(events.map((e) => e.type), ['error', 'error', 'done']);
  assert.equal(events.every((e) => e.type === 'done' || e.code === 'TOOL_CALL_MALFORMED'), true);
});

test('malformed SSE does not hide later valid text', async () => {
  const fixture = setup(['data: {broken\r\n\r\n', frame({ content: 'visible' }), 'data: [DONE]\n\n']);
  const events = await collect(fixture.stream());
  assert.deepEqual(events.map((e) => e.type), ['error', 'text', 'done']);
  assert.equal(events[0].code, 'RUNTIME_SSE_INVALID');
});

test('one-byte UTF-8 chunks preserve reasoning, text and tagged tools', async () => {
  const payload = frame({ content: '<think>€😀</think>answer<tool_call>{"name":"read","arguments":{"q":"caffè"}}</tool_call>' }) + 'data: [DONE]\n\n';
  const fixture = setup([...encode(payload)].map((byte) => Uint8Array.of(byte)));
  const events = await collect(fixture.stream());
  assert.equal(events.filter((e) => e.type === 'reasoning').map((e) => e.value).join(''), '€😀');
  assert.equal(events.filter((e) => e.type === 'text').map((e) => e.value).join(''), 'answer');
  assert.equal(JSON.parse(tools(events)[0].arguments).q, 'caffè');
});

test('[DONE] and final flush do not duplicate completed native calls', async () => {
  const fixture = setup([toolFrame(call(0, '{}', { id: 'a', name: 'search' })), finish, 'data: [DONE]\n\n']);
  const events = await collect(fixture.stream());
  assert.deepEqual(events.map((e) => e.seq), [0, 1]);
  assert.equal(tools(events).length, 1);
  assert.equal(fixture.cancelled(), 1);
});

test('cancellation before request propagates', async () => {
  const controller = new AbortController(); controller.abort();
  const fixture = setup([], { signal: controller.signal });
  await assert.rejects(() => collect(fixture.stream()), { name: 'AbortError' });
  assert.equal(fixture.runtime.cancel('request'), false);
});

test('cancellation during assembly cannot emit a buffered valid call', async () => {
  const controller = new AbortController();
  const emitted = [];
  const fixture = setup([toolFrame(call(0, '{}', { id: 'a', name: 'search' })), finish], {
    signal: controller.signal, onRead: (position) => { if (position === 1) controller.abort(); },
  });
  await assert.rejects(async () => { for await (const e of fixture.stream()) emitted.push(e); }, { name: 'AbortError' });
  assert.equal(tools(emitted).length, 0);
  assert.equal(fixture.cancelled(), 1);
  assert.equal(fixture.runtime.cancel('request'), false);
});

test('requestId cancellation aborts the active reader and cleans registration', async () => {
  let fixture;
  fixture = setup([frame({ content: 'before abort' }), frame({ content: 'after abort' })], { onRead: (position) => { if (position === 1) assert.equal(fixture.runtime.cancel('request'), true); } });
  await assert.rejects(() => collect(fixture.stream()), { name: 'AbortError' });
  assert.equal(fixture.requestSignal().aborted, true);
  assert.equal(fixture.runtime.cancel('request'), false);
});

test('repeated requests on one runtime do not retain pending native calls', async () => {
  const fixture = setup([toolFrame(call(0, '{}', { id: 'call-reused', name: 'search' })), finish]);
  for (let index = 0; index < 3; index++) {
    const events = await collect(fixture.stream());
    assert.deepEqual(tools(events).map((e) => e.id), ['call-reused']);
    assert.deepEqual(events.map((e) => e.seq), [0, 1]);
    assert.equal(fixture.runtime.cancel('request'), false);
  }
});

test('large fragmented arguments are parsed only at completion, not per prefix', async () => {
  const args = JSON.stringify({ payload: 'x'.repeat(256 * 1024) });
  const parts = [];
  for (let offset = 0; offset < args.length; offset += 32) parts.push(toolFrame(call(0, args.slice(offset, offset + 32), { id: 'a', ...(offset === 0 ? { name: 'search' } : {}) })));
  parts.push(finish);
  const parse = JSON.parse; let attempts = 0, chars = 0;
  JSON.parse = function (value, ...rest) {
    if (typeof value === 'string' && value.startsWith('{"payload":')) { attempts++; chars += value.length; }
    return parse(value, ...rest);
  };
  let events;
  try { events = await collect(setup(parts).stream()); } finally { JSON.parse = parse; }
  assert.equal(tools(events)[0]?.arguments, args);
  // Complexity contract, deliberately not a hardware-dependent time limit.
  assert.equal(attempts, 1);
  assert.equal(chars, args.length);
});


test('abort between two completed buffered calls prevents the second emission', async () => {
  const controller = new AbortController();
  const fixture = setup([toolFrame(call(0, '{}', { id: 'a', name: 'first' }), call(1, '{}', { id: 'b', name: 'second' })), finish], { signal: controller.signal });
  const iterator = fixture.stream();
  assert.equal((await iterator.next()).value.id, 'a');
  controller.abort();
  await assert.rejects(() => iterator.next(), { name: 'AbortError' });
  assert.equal(fixture.cancelled(), 1);
});

test('deterministic fragment boundaries preserve nested JSON and escaped Unicode', async () => {
  let seed = 1729;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let sample = 0; sample < 100; sample++) {
    const args = JSON.stringify({ sample, content: 'quotes " and backslash \\ and €😀'.repeat(1 + sample % 10), nested: [true, null, { value: sample }] });
    const parts = [];
    for (let offset = 0; offset < args.length;) {
      const length = 1 + Math.floor(random() * 31);
      parts.push(toolFrame(call(0, args.slice(offset, offset + length), offset === 0 ? { id: 'fuzz', name: 'read' } : {})));
      offset += length;
    }
    parts.push(finish);
    assert.equal(tools(await collect(setup(parts).stream()))[0]?.arguments, args);
  }
});

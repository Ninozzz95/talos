import assert from 'node:assert/strict';
import test from 'node:test';
import { localKernelStream, readLocalJson, validateLocalCompletion } from '../src/local-kernel-stream.mjs';

const p = (delta, finish_reason = null) => ({ choices: [{ index: 0, delta, finish_reason }] });
const call = (args = '{}', id = 'c1', index = 0, name = 'write') => p({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: args } }] });
const done = [p({}, 'tool_calls'), '[DONE]'];
function response(frames, { bytes = null, ending = '\n', onCancel = () => {} } = {}) {
  const input = new TextEncoder().encode(frames.map(f => `data:${typeof f === 'string' ? f : JSON.stringify(f)}${ending}${ending}`).join(''));
  let offset = 0;
  return new Response(new ReadableStream({
    pull(c) {
      if (offset >= input.length) { c.close(); return; }
      const next = offset + (bytes ?? input.length);
      c.enqueue(input.slice(offset, next)); offset = next;
    },
    cancel: onCancel,
  }));
}
async function decode(frames, options) {
  const text = await localKernelStream(response(frames, options)).text();
  return text.split('\n\n').filter(Boolean).map(s => s.slice(6)).filter(s => s !== '[DONE]').map(JSON.parse);
}

test('native fragments become one call only after a valid finish and terminal marker', async () => {
  const frames = [call('{"text":"caf'), p({ reasoning_content: 'analisi' }), p({ content: 'testo' }),
    p({ tool_calls: [{ index: 0, function: { arguments: 'fè ☕"}' } }] }), ...done];
  const output = await decode(frames, { bytes: 1, ending: '\r\n' });
  assert.equal(output[0].choices[0].delta.reasoning_content, 'analisi');
  assert.equal(output[1].choices[0].delta.content, 'testo');
  const calls = output.flatMap(x => x.choices[0].delta.tool_calls ?? []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.arguments, '{"text":"caffè ☕"}');
  assert.equal(output.at(-1).choices[0].finish_reason, 'tool_calls');
});

for (const [name, frames] of [
  ['ordinary EOF', [call()]],
  ['finish without DONE', [call(), p({}, 'tool_calls')]],
  ['DONE without finish', [call(), '[DONE]']],
  ['length-capped call', [call(), p({}, 'length'), '[DONE]']],
  ['stop on call', [call(), p({}, 'stop'), '[DONE]']],
  ['malformed arguments', [call('{'), ...done]],
  ['valid scalar prefix', [call('1'), ...done]],
  ['trailing garbage', [call('{}garbage'), ...done]],
  ['conflicting ID', [call('{', 'one'), call('}', 'two'), ...done]],
  ['duplicate ID', [call('{}', 'one', 0), call('{}', 'one', 1), ...done]],
  ['missing index', [p({ tool_calls: [{ id: 'one', function: { name: 'write', arguments: '{}' } }] }), ...done]],
  ['missing ID', [p({ tool_calls: [{ index: 0, function: { name: 'write', arguments: '{}' } }] }), ...done]],
  ['malformed event JSON', [call(), 'not-json', ...done]],
  ['provider error', [call(), { error: { message: 'bad' }, choices: [] }, ...done]],
  ['empty tool completion', [...done]],
  ['delta after finish', [call(), p({}, 'tool_calls'), p({ content: 'late' }), '[DONE]']],
  ['invalid content type', [p({ content: { bad: true } }), p({}, 'stop'), '[DONE]']],
  ['foreign native state', [p({ talos_provider_state: { version: 1 } }), p({}, 'stop'), '[DONE]']],
]) test(`fail closed: ${name}`, async () => {
  await assert.rejects(decode(frames), error => error.code === 'LOCAL_KERNEL_PROTOCOL_INVALID');
});

test('one plain text stream retains usage and finish without fabricating tool events', async () => {
  const output = await decode([p({ content: 'ciao' }), p({}, 'stop'), { choices: [], usage: { completion_tokens: 1 } }, '[DONE]']);
  assert.equal(output[0].choices[0].delta.content, 'ciao');
  assert.equal(output[1].usage.completion_tokens, 1);
  assert.equal(output[2].choices[0].finish_reason, 'stop');
});

test('interleaved native arguments are correlated by stable upstream index', async () => {
  const output = await decode([call('{"a":', 'a', 1), call('{"b":', 'b', 9),
    p({ tool_calls: [{ index: 9, function: { arguments: '2}' } }, { index: 1, function: { arguments: '1}' } }] }), ...done]);
  const tools = output.flatMap(x => x.choices[0].delta.tool_calls ?? []);
  assert.deepEqual(tools.map(t => [t.index, t.id, t.function.arguments]), [[0, 'a', '{"a":1}'], [1, 'b', '{"b":2}']]);
});

test('cancelling a pending stream releases the upstream reader and rejects promptly', async () => {
  let canceled = 0;
  const abort = new AbortController();
  const upstream = new Response(new ReadableStream({ cancel() { canceled++; } }));
  const reading = localKernelStream(upstream, { signal: abort.signal }).text();
  abort.abort(new DOMException('stop', 'AbortError'));
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(canceled, 1);
});

test('downstream cancellation propagates before any tool is exposed', async () => {
  let canceled = 0;
  const stream = localKernelStream(response([call(), ...done], { bytes: 1, onCancel: () => canceled++ }));
  await stream.body.cancel();
  assert.equal(canceled, 1);
});

test('no native tool is visible while waiting for DONE', async () => {
  let source;
  const upstream = new Response(new ReadableStream({ start(c) { source = c; } }));
  const stream = localKernelStream(upstream);
  const reader = stream.body.getReader();
  let resolved = false;
  const reading = reader.read().then(v => { resolved = true; return v; });
  source.enqueue(new TextEncoder().encode([call(), p({}, 'tool_calls')].map(f => `data: ${JSON.stringify(f)}\n\n`).join('')));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  source.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
  const result = await reading;
  assert.match(new TextDecoder().decode(result.value), /tool_calls/);
  await reader.cancel();
});

test('transport buffers and call counts are bounded', async () => {
  await assert.rejects(decode(['x'.repeat(1024 * 1024 + 1)]), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
  const frames = Array.from({ length: 129 }, (_, i) => call('{}', `id${i}`, i));
  await assert.rejects(decode([...frames, ...done]), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
});

test('non-streaming tool calls also require valid terminal reason and JSON object', () => {
  const valid = { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call().choices[0].delta.tool_calls[0]] } }] };
  assert.equal(validateLocalCompletion(valid), valid);
  assert.throws(() => validateLocalCompletion({ choices: [{ ...valid.choices[0], finish_reason: 'length' }] }), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
});

test('bounded JSON reader rejects truncated, oversized and aborted bodies', async () => {
  assert.deepEqual(await readLocalJson(Response.json({ a: 1 })), { a: 1 });
  await assert.rejects(readLocalJson(new Response('{')), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
  await assert.rejects(readLocalJson(Response.json({ a: 'xx' }), { maxBytes: 3 }), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(readLocalJson(Response.json({ a: 1 }), { signal: abort.signal }), { name: 'AbortError' });
});

test('SSE complete-message variant is accepted only without earlier deltas', async () => {
  const whole = { choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
    tool_calls: [{ id: 'whole', type: 'function', function: { name: 'read', arguments: '{}' } }] } }] };
  const output = await decode([whole, '[DONE]']);
  assert.equal(output.flatMap(x => x.choices[0].delta.tool_calls ?? [])[0].id, 'whole');
  await assert.rejects(decode([p({ content: 'earlier' }), whole, '[DONE]']), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
});

test('malformed UTF-8 is not silently replaced in local arguments', async () => {
  const bytes = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
  await assert.rejects(readLocalJson(new Response(bytes)), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
  await assert.rejects(localKernelStream(new Response(bytes)).text(), { code: 'LOCAL_KERNEL_PROTOCOL_INVALID' });
});

test('abort before the first pull releases the upstream reader lock', async () => {
  const controller = new AbortController();
  const upstream = new Response(new ReadableStream({ start() {} }));
  const guarded = localKernelStream(upstream, { signal: controller.signal });
  controller.abort(new Error('cancel before pull'));
  await assert.rejects(guarded.text(), /cancel before pull/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(upstream.body.locked, false);
});

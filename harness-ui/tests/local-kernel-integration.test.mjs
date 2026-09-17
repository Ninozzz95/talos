import assert from 'node:assert/strict';
import test from 'node:test';
import { createKernelFixture, FIXED_SOURCE, MODEL_ID, textFrames, toolFrames } from './fixtures/local-kernel-fixture.mjs';

test('WP01 actual registry/owner/desktop kernel executes read-write-test and continues without a cloud key', async t => {
  const f = await createKernelFixture(); t.after(() => f.close());
  f.start();
  const result = await f.finished();
  assert.equal(await f.source(), FIXED_SOURCE);
  assert.equal(f.results[0].ok, true, JSON.stringify(f.results[0]));
  assert.equal(f.requests.length, 4);
  assert.ok(f.requests.every(r => r.model === MODEL_ID && r.stream === true));
  const names = f.requests[0].tools.map(x => x.function.name);
  for (const name of ['leggi', 'scrivi', 'prova']) assert.ok(names.includes(name));
  assert.equal(f.requests[0].max_tokens, undefined, 'no hidden output cap');
  assert.equal(f.requests[0].tool_choice, 'auto');
  const history = f.results[0].esito.messaggiFinali;
  assert.deepEqual(history.filter(m => m.role === 'tool').map(m => m.tool_call_id), ['read-1', 'write-1', 'test-1']);
  assert.ok(result.eventi.some(e => e.type === 'ApprovalRequested'));
  assert.equal(result.eventi.filter(e => e.type === 'ToolCallResult').length, 3);
  assert.ok(result.eventi.filter(e => e.type === 'RunStarted' || e.type === 'RunFinished').every(e => e.provider === 'local' && e.runtimeId === 'llama.cpp'));
});

test('WP01 denied write has a real failure result and leaves the file untouched', async t => {
  const f = await createKernelFixture({ scenario: (_body, n) => n === 1
    ? toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }, 'denied')
    : textFrames('Permesso negato; file invariato.') });
  t.after(() => f.close());
  f.start({ approve: false }); await f.finished();
  assert.match(await f.source(), /a - b/);
  assert.equal(f.requests.length, 2);
  assert.match(f.requests[1].messages.find(m => m.role === 'tool').content, /negat|rifiut|consent|REFUSED/i);
});

for (const [name, frames] of [
  ['EOF without terminator', toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }).slice(0, -1)],
  ['DONE without provider finish', [...toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }).slice(0, -2), '[DONE]']],
  ['malformed tool arguments', toolFrames('scrivi', '{"percorso":')],
  ['length-limited tool', [...toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }).slice(0, -2), { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }, '[DONE]']],
]) test(`WP01 ${name}: no tool effect and no model continuation`, async t => {
  const f = await createKernelFixture({ scenario: () => frames }); t.after(() => f.close());
  f.start(); await f.finished();
  assert.match(await f.source(), /a - b/);
  assert.equal(f.requests.length, 1);
  assert.equal(f.events.some(e => e.type === 'ApprovalRequested'), false);
  assert.ok(f.events.some(e => e.type === 'RunError' && e.code === 'LOCAL_KERNEL_PROTOCOL_INVALID'));
});

test('WP01 user stop during an approval denies it and terminates without a write', async t => {
  const f = await createKernelFixture({ scenario: () => toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }) }); t.after(() => f.close());
  f.start({ approve: null, onEvent: (event, id) => {
    if (event.type === 'ApprovalRequested') queueMicrotask(() => f.registry.ferma(id));
  } });
  await f.finished();
  assert.match(await f.source(), /a - b/);
  assert.ok(f.events.some(e => e.type === 'ApprovalResolved' && e.approvato === false));
  assert.equal(f.requests.length, 1);
});

test('WP01 model unload during approval invalidates the registry controller and pending consent', async t => {
  const f = await createKernelFixture({ scenario: () => toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: FIXED_SOURCE }) }); t.after(() => f.close());
  f.start({ approve: null, onEvent: event => {
    if (event.type === 'ApprovalRequested') queueMicrotask(() => { void f.supervisor.stop(); });
  } });
  await f.finished();
  assert.match(await f.source(), /a - b/);
  assert.ok(f.events.some(e => e.type === 'ApprovalResolved' && e.approvato === false));
  assert.ok(f.events.some(e => e.type === 'RuntimeInvalidated'));
  assert.equal(f.requests.length, 1);
});

test('WP01 control-file gate remains mandatory even in Full access', async t => {
  const { writeFile, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const f = await createKernelFixture({ scenario: (_body, n) => n === 1
    ? toolFrames('scrivi', { percorso: 'CLAUDE.md', contenuto: 'changed rules' })
    : textFrames('La modifica alle regole è stata negata.') }); t.after(() => f.close());
  await writeFile(join(f.root, 'CLAUDE.md'), 'original rules');
  f.start({ permessiScelto: 'Full access', approve: false }); await f.finished();
  assert.equal(await readFile(join(f.root, 'CLAUDE.md'), 'utf8'), 'original rules');
  assert.ok(f.events.some(e => e.type === 'ApprovalRequested' && e.azione.fileDiControllo === true));
});

test('WP01 CRLF provider framing is normalized for the unchanged shared kernel', async t => {
  const f = await createKernelFixture({ lineEnding: '\r\n' }); t.after(() => f.close());
  f.start(); await f.finished(); assert.equal(await f.source(), FIXED_SOURCE);
});

test('WP01 unsupported template fails before entering the shared kernel', async t => {
  const f = await createKernelFixture({ props: { chat_template: 'unknown' } }); t.after(() => f.close());
  f.start(); await f.finished();
  assert.equal(f.requests.length, 0); assert.equal(f.results.length, 0);
  assert.ok(f.events.some(e => e.code === 'LOCAL_KERNEL_TEMPLATE_UNSUPPORTED'));
});

test('WP01 explicit cloud fallback cannot replay a local effectful run', async t => {
  const f = await createKernelFixture(); t.after(() => f.close());
  f.start({ fallbackConsent: true }); await f.finished();
  assert.equal(f.requests.length, 0);
  assert.ok(f.events.some(e => e.code === 'LOCAL_KERNEL_FALLBACK_UNSUPPORTED'));
  assert.equal(f.events.some(e => e.type === 'RuntimeFallback'), false);
});

test('WP01 disabling the feature preserves the old local route', async t => {
  const f = await createKernelFixture({ enabled: false }); t.after(() => f.close());
  f.start(); await f.finished();
  assert.equal(f.requests.length, 0); assert.equal(f.results.length, 0);
  assert.ok(f.events.some(e => e.type === 'TextMessageContent' && e.delta === 'legacy route'));
});

test('WP01 a protocol error AFTER an approved append never replays the effect', async t => {
  const f = await createKernelFixture({ rawResponse: async ({ res, body }) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (body.messages.some(m => m.role === 'tool')) { res.end('data: not-json\n\n'); return; }
    const frames = toolFrames('scrivi', { percorso: 'sum.mjs', contenuto: '// unique-effect\n', mode: 'append' }, 'append-1');
    res.end(frames.map(frame => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n\n`).join(''));
  } }); t.after(() => f.close());
  f.start(); await f.finished();
  assert.equal((await f.source()).split('// unique-effect').length - 1, 1);
  assert.equal(f.requests.length, 2);
  assert.ok(f.events.some(e => e.code === 'LOCAL_KERNEL_PROTOCOL_INVALID'));
  assert.equal(f.events.some(e => e.type === 'RuntimeFallback'), false);
});

test('WP01 canonical tool-result history is reused on resume without replaying the completed tools', async t => {
  const f = await createKernelFixture(); t.after(() => f.close());
  const id = f.start(); await f.finished();
  assert.equal(f.registry.resume(id, 'Conferma senza riscrivere.').sessionId, id);
  await f.finished();
  assert.equal(f.requests.length, 5);
  const messages = f.requests.at(-1).messages;
  assert.equal(messages.filter(m => m.role === 'tool').length, 3);
  assert.equal(messages.at(-1).content, 'Conferma senza riscrivere.');
  assert.equal(await f.source(), FIXED_SOURCE);
  assert.equal(f.events.filter(e => e.type === 'ToolCallResult').length, 3);
});

test('WP01 complete JSON response to a streaming request still executes and continues safely', async t => {
  const f = await createKernelFixture({ rawResponse: async ({ res, body }) => {
    const hasResult = body.messages.some(m => m.role === 'tool');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ index: 0, finish_reason: hasResult ? 'stop' : 'tool_calls', message: hasResult
      ? { role: 'assistant', content: 'File letto.' }
      : { role: 'assistant', content: null, tool_calls: [{ id: 'read-json', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"sum.mjs"}' } }] } }] }));
  } }); t.after(() => f.close());
  f.start(); await f.finished();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].messages.filter(m => m.role === 'tool')[0].tool_call_id, 'read-json');
  assert.equal(f.results[0].ok, true);
});

test('WP01 valid pre-existing shared-kernel local-prefix route is a working fixture control', async t => {
  const f = await createKernelFixture({ enabled: false, legacy: true }); t.after(() => f.close());
  f.start(); await f.finished();
  assert.equal(await f.source(), FIXED_SOURCE);
  assert.equal(f.requests.length, 4);
  assert.equal(f.results[0].ok, true);
});

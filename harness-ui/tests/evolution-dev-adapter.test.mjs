import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createEvolutionDevAdapter } from '../src/evolution-dev-adapter.mjs';
import { runDevSession } from '../src/evolution-dev/session.mjs';
import { Kind, Status, encodeDevPayload, encodeDevFrame, decodeDevPayload, createDevDecoder } from '../src/evolution-dev/codec.mjs';
const digest = Buffer.alloc(32, 7), id = Buffer.alloc(16, 1);
const base = (kind = Kind.RUN) => ({ version: 1, invocationId: id, kind });
const ready = f => ({ ...f, kind: Kind.READY, workerDigest: digest });
const done = (f, extra = {}) => ({ ...f, kind: Kind.FINISHED, status: Status.SUCCEEDED,
  value: 4275, bytesReleased: 49, workerTerminated: true, cleanupComplete: true, ...extra });
function fake(handler, { killCloses = true } = {}) {
  const child = new EventEmitter(); child.pid = 123; child.commands = []; child.kills = 0;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.send = frame => child.stdout.write(encodeDevFrame(frame));
  child.finish = (code = 0, signal = null) => {
    child.stdout.end(); child.stderr.end(); setImmediate(() => child.emit('close', code, signal));
  };
  child.kill = () => { child.kills++; if (killCloses) child.finish(null, 'SIGTERM'); return true; };
  child.unref = () => {};
  child.stdin = new Writable({ write(data, encoding, callback) {
    try {
      assert.equal(data.readUInt32LE(), data.length - 4);
      const frame = decodeDevPayload(data.subarray(4)); child.commands.push(frame.kind);
      queueMicrotask(() => handler(frame, child)); callback();
    } catch (error) { callback(error); }
  } });
  return child;
}
const session = (child, options = {}) => runDevSession({ launch: () => child, workerDigest: digest,
  totalMs: 1500, cancelGraceMs: 100, killWaitMs: 100, ...options });
const errorCode = code => error => error.code === code;
const good = (f, c) => { if (f.kind === Kind.RUN) c.send(ready(f));
  if (f.kind === Kind.CONTINUE) { c.send(done(f)); c.finish(); } };

test('disabled factory does not validate or touch nonexistent binaries', async () => {
  const adapter = createEvolutionDevAdapter({ supervisorPath: '/does/not/exist' });
  assert.equal(adapter.enabled, false);
  await assert.rejects(adapter.invoke(), errorCode('EVOLUTION_DEV_DISABLED'));
});
test('environment cannot enable the adapter', async () => {
  const previous = process.env.TALOS_EVOLUTION_DEV;
  process.env.TALOS_EVOLUTION_DEV = '1';
  try { await assert.rejects(createEvolutionDevAdapter().invoke(), errorCode('EVOLUTION_DEV_DISABLED')); }
  finally { if (previous === undefined) delete process.env.TALOS_EVOLUTION_DEV; else process.env.TALOS_EVOLUTION_DEV = previous; }
});
test('config rejects injected launcher, arbitrary options and string enable', () => {
  for (const config of [{ enabled: 'true' }, { enabled: 1 }, { spawn: () => {} }, { env: {} }, [], null]) {
    assert.throws(() => createEvolutionDevAdapter(config));
  }
});
test('bootstrap configuration is copied, not mutable authority', async () => {
  const config = { enabled: false }; const adapter = createEvolutionDevAdapter(config); config.enabled = true;
  await assert.rejects(adapter.invoke(), errorCode('EVOLUTION_DEV_DISABLED'));
});
test('dispose stays disabled and rejects invocation', async () => {
  const adapter = createEvolutionDevAdapter({ enabled: true }); adapter.dispose(); adapter.dispose();
  assert.equal(adapter.enabled, false); await assert.rejects(adapter.invoke(), errorCode('ADAPTER_DISPOSED'));
});
test('pre-aborted invocation never opens a binary or spawns', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createEvolutionDevAdapter({ enabled: true }).invoke({ signal: controller.signal }), errorCode('CANCELLED_BEFORE_LAUNCH'));
  let spawned = false;
  await assert.rejects(runDevSession({ launch: () => { spawned = true; }, workerDigest: digest, signal: controller.signal }), errorCode('CANCELLED_BEFORE_LAUNCH'));
  assert.equal(spawned, false);
});
test('invocation cannot supply source, paths, deadlines or fabricated signal', async () => {
  const a = createEvolutionDevAdapter({ enabled: true });
  for (const options of [{ source: 'x' }, { workerPath: 'x' }, { timeout: 0 }, { signal: {} }, { onReady: 'callback' }]) {
    await assert.rejects(a.invoke(options));
  }
});
test('Prost-compatible RUN golden vector', () => {
  const expected = Buffer.from([8, 1, 18, 16, ...Array(16).fill(1), 24, 1]);
  assert.deepEqual(encodeDevPayload(base()), expected);
  assert.equal(decodeDevPayload(expected).kind, Kind.RUN);
});
for (const kind of Object.values(Kind)) test(`kind ${kind} roundtrips`, () => {
  const out = decodeDevPayload(encodeDevPayload(base(kind))); assert.equal(out.kind, kind);
});
test('uint32 max and boolean fields survive protobuf roundtrip', () => {
  const out = decodeDevPayload(encodeDevPayload(done(base(), { workerExitCode: 0xffffffff })));
  assert.equal(out.workerExitCode, 0xffffffff); assert.equal(out.workerTerminated, true);
});
for (const value of [-1, 2 ** 32, 0.1, NaN, Infinity, '1', null]) test(`codec rejects uint ${String(value)}`, () => {
  assert.throws(() => encodeDevPayload({ ...base(), value }));
});
test('unknown duplicate default and overlong varints reject', () => {
  const b = encodeDevPayload(base());
  for (const suffix of [[8, 1], [88, 1], [32, 0]]) {
    assert.throws(() => decodeDevPayload(Buffer.concat([b, Buffer.from(suffix)])));
  }
  assert.throws(() => decodeDevPayload(Buffer.concat([Buffer.from([8, 129, 0]), b.subarray(2)])));
  assert.throws(() => decodeDevPayload(Buffer.from([8, 255, 255, 255, 255, 31])));
});
test('identity, version, type and size are required', () => {
  for (const invocationId of [Buffer.alloc(0), Buffer.alloc(16), Buffer.alloc(17, 1), '1']) {
    assert.throws(() => encodeDevPayload({ ...base(), invocationId }));
  }
  for (const version of [0, 2]) assert.throws(() => encodeDevPayload({ ...base(), version }));
  assert.throws(() => encodeDevPayload({ ...base(), workerTerminated: 1 }));
  assert.throws(() => encodeDevPayload({ ...base(), workerDigest: Buffer.alloc(257) }));
  assert.throws(() => encodeDevPayload({ ...base(), capability: 'grant' }));
});
test('every frame split and byte-at-a-time decoding preserves one message', () => {
  const bytes = encodeDevFrame(base());
  for (let cut = 0; cut <= bytes.length; cut++) {
    const frames = [], d = createDevDecoder(f => frames.push(f));
    d.push(bytes.subarray(0, cut)); d.push(bytes.subarray(cut)); d.finish();
    assert.equal(frames.length, 1);
  }
  const frames = [], d = createDevDecoder(f => frames.push(f));
  for (const byte of bytes) d.push(Buffer.from([byte])); d.finish(); assert.equal(frames.length, 1);
});
test('zero, oversized, truncated and total-overflow frames reject', () => {
  for (const n of [0, 257, 0xffffffff]) {
    const d = createDevDecoder(() => {}), prefix = Buffer.alloc(4); prefix.writeUInt32LE(n);
    assert.throws(() => d.push(prefix));
  }
  for (const cut of [1, 3, 5]) {
    const d = createDevDecoder(() => {}); d.push(encodeDevFrame(base()).subarray(0, cut)); assert.throws(() => d.finish());
  }
  assert.throws(() => createDevDecoder(() => {}).push(Buffer.alloc(521)));
});
test('successful session requires ready, typed result and close', async () => {
  const c = fake(good), out = await session(c);
  assert.deepEqual(c.commands, [Kind.RUN, Kind.CONTINUE]);
  assert.equal(out.actualWasmResult, 4275); assert.equal(out.brokerBytesReleased, 49);
  assert.equal(out.supervisorClosed, true); assert.equal(out.cleanupComplete, true); assert.equal(out.productReady, false);
});
test('exit is not close and a result alone never resolves', async () => {
  let final; const c = fake((f, child) => {
    if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CONTINUE) { child.send(done(f)); child.emit('exit', 0); final = child; }
  });
  let settled = false; const p = session(c).finally(() => { settled = true; });
  await new Promise(r => setTimeout(r, 15)); assert.equal(settled, false); final.finish(); await p;
});
test('onReady cancellation sends CANCEL, never CONTINUE, and retains native cleanup', async () => {
  const controller = new AbortController();
  const c = fake((f, child) => {
    if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CANCEL) { child.send(done(f, { status: Status.CANCELLED, value: 0, bytesReleased: 0, workerExitCode: 1 })); child.finish(); }
  });
  await assert.rejects(session(c, { signal: controller.signal, onReady: () => controller.abort() }), e => {
    assert.equal(e.code, 'CANCELLED'); assert.equal(e.details.cleanupComplete, true);
    assert.equal(e.details.brokerBytesReleased, 0); return true;
  });
  assert.deepEqual(c.commands, [Kind.RUN, Kind.CANCEL]); assert.equal(c.kills, 0);
});
test('repeated abort is idempotent', async () => {
  const controller = new AbortController();
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CANCEL) { child.send(done(f, { status: Status.CANCELLED, value: 0, bytesReleased: 0 })); child.finish(); } });
  await assert.rejects(session(c, { signal: controller.signal, onReady: () => { controller.abort(); controller.abort(); } }), errorCode('CANCELLED'));
  assert.equal(c.commands.filter(x => x === Kind.CANCEL).length, 1);
});
test('callback failure does not become cancellation success', async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CANCEL) child.finish(); });
  await assert.rejects(session(c, { onReady: () => { throw new Error('private callback details'); } }), errorCode('READY_CALLBACK_FAILED'));
});
const badResponses = {
  'wrong nonce': f => ready({ ...f, invocationId: Buffer.alloc(16, 9) }),
  'wrong worker hash': f => ({ ...ready(f), workerDigest: Buffer.alloc(32, 8) }),
  'result before ready': f => done(f),
  'unexpected command': f => ({ ...f, kind: Kind.RUN }),
  'ready with authority/result fields': f => ({ ...ready(f), value: 1 }),
};
for (const [name, response] of Object.entries(badResponses)) test(`reject ${name}`, async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(response(f));
    if (f.kind === Kind.CANCEL) child.finish(); });
  await assert.rejects(session(c), errorCode('INVALID_SUPERVISOR_RESPONSE'));
});
for (const [name, change] of Object.entries({
  'wrong value': { value: 7 }, 'wrong byte count': { bytesReleased: 48 },
  'worker alive': { workerTerminated: false }, 'cleanup missing': { cleanupComplete: false },
  'worker abnormal': { workerExitCode: 5 }, 'unknown status': { status: 99 },
  'unrequested cancel': { status: Status.CANCELLED, value: 0, bytesReleased: 0 },
})) test(`reject result ${name}`, async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CONTINUE) child.send(done(f, change)); if (f.kind === Kind.CANCEL) child.finish(); });
  await assert.rejects(session(c), errorCode('INVALID_SUPERVISOR_RESPONSE'));
});
test('native failure and unknown cleanup are distinct', async () => {
  for (const cleanupComplete of [true, false]) {
    const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
      if (f.kind === Kind.CONTINUE) { child.send(done(f, { status: Status.FAILED, value: 0, cleanupComplete })); child.finish(); } });
    await assert.rejects(session(c), errorCode(cleanupComplete ? 'NATIVE_INVOCATION_FAILED' : 'NATIVE_CLEANUP_UNCONFIRMED'));
  }
});
test('process abnormal exit cannot follow a claimed success', async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CONTINUE) { child.send(done(f)); child.finish(86); } });
  await assert.rejects(session(c), errorCode('SUPERVISOR_ABNORMAL_EXIT'));
});
test('duplicate ready and trailing result are protocol errors', async () => {
  for (const atReady of [true, false]) {
    const c = fake((f, child) => {
      if (f.kind === Kind.RUN) { child.send(ready(f)); if (atReady) child.send(ready(f)); }
      if (f.kind === Kind.CONTINUE && !atReady) { child.send(done(f)); child.send(done(f)); child.finish(); }
      if (f.kind === Kind.CANCEL) child.finish();
    });
    await assert.rejects(session(c), errorCode('INVALID_SUPERVISOR_RESPONSE'));
  }
});
test('stderr flood is bounded and never leaks raw text', async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.stderr.write(Buffer.alloc(8193, 65));
    if (f.kind === Kind.CANCEL) child.finish(); });
  await assert.rejects(session(c), e => e.code === 'DIAGNOSTIC_LIMIT' && !e.message.includes('AAAA'));
});
test('silent supervisor is terminated at outer deadline, never declared clean', async () => {
  const c = fake(() => {});
  await assert.rejects(session(c, { totalMs: 20 }), e => {
    assert.equal(e.code, 'ADAPTER_DEADLINE'); assert.equal(e.details.cleanupComplete, false); return true;
  }); assert.equal(c.kills, 1);
});
test('unconfirmed kill is reported explicitly', async () => {
  const c = fake(() => {}, { killCloses: false });
  await assert.rejects(session(c, { totalMs: 10, killWaitMs: 10 }), e => {
    assert.equal(e.code, 'SUPERVISOR_TERMINATION_UNCONFIRMED'); assert.equal(e.details.supervisorClosed, false); return true;
  });
});
test('failed spawn and missing final report are errors', async () => {
  await assert.rejects(runDevSession({ launch() { throw new Error('path'); }, workerDigest: digest }), errorCode('SUPERVISOR_SPAWN_FAILED'));
  const c = fake((f, child) => child.finish());
  await assert.rejects(session(c), errorCode('MISSING_SUPERVISOR_RESULT'));
});
test('completion committed by native can win a concurrent abort', async () => {
  const a = new AbortController();
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CONTINUE) { a.abort(); child.send(done(f)); child.finish(); } });
  const out = await session(c, { signal: a.signal });
  assert.equal(out.actualWasmResult, 4275); assert.equal(out.cancellationRequested, true);
});

test('async ready callbacks are rejected and their rejections are handled', async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.send(ready(f));
    if (f.kind === Kind.CANCEL) { child.send(done(f, { status: Status.CANCELLED, value: 0, bytesReleased: 0 })); child.finish(); } });
  await assert.rejects(session(c, { onReady: async () => { throw new Error('private detail'); } }), errorCode('ASYNC_READY_CALLBACK_UNSUPPORTED'));
});
test('stdout overflow fails without forwarding output', async () => {
  const c = fake((f, child) => { if (f.kind === Kind.RUN) child.stdout.write(Buffer.alloc(521));
    if (f.kind === Kind.CANCEL) child.finish(); });
  await assert.rejects(session(c), errorCode('INVALID_SUPERVISOR_RESPONSE'));
});

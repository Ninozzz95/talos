import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { getEventListeners } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createLlamaBinaryProbe } from '../src/llama-binary-probe.mjs';

const nodeArgs = code => ['-e', code];

test('probe captures stdout and stderr after a successful direct child exit', async () => {
  const probe = createLlamaBinaryProbe();
  assert.equal(await probe(process.execPath, nodeArgs('process.stdout.write("-ngl -1"); process.stderr.write("info")')), '-ngl -1\ninfo');
});

test('probe decodes UTF-8 split into individual bytes without corrupting output', async () => {
  const probe = createLlamaBinaryProbe();
  const code = 'const b = Buffer.from("à🐈漢字"); let i=0; const t=setInterval(()=>{process.stdout.write(b.subarray(i,i+1)); if(++i===b.length)clearInterval(t)},1)';
  assert.equal(await probe(process.execPath, nodeArgs(code)), 'à🐈漢字\n');
});

test('nonzero exits are unknown even when stdout looks like valid fit/capability output', async () => {
  const observations = [];
  const probe = createLlamaBinaryProbe({ onObservation: o => observations.push(o) });
  assert.equal(await probe(process.execPath, nodeArgs('process.stdout.write("-ngl -1"); process.exitCode=7')), null);
  assert.equal(observations[0].outcome, 'failed');
  assert.equal(observations[0].exitCode, 7);
});

test('missing executable and synchronous spawn error resolve as unknown', async () => {
  assert.equal(await createLlamaBinaryProbe()(join(tmpdir(), 'talos-nonexistent-probe-executable'), []), null);
  assert.equal(await createLlamaBinaryProbe({ spawnImpl() { throw new Error('spawn denied'); } })('missing', []), null);
});

test('pre-aborted probe performs no spawn and preserves abort reason', async () => {
  let spawned = 0;
  const controller = new AbortController();
  const reason = new Error('cancelled by test');
  controller.abort(reason);
  const probe = createLlamaBinaryProbe({ spawnImpl() { spawned++; } });
  await assert.rejects(probe(process.execPath, [], 1_000, { signal: controller.signal }), error => error === reason);
  assert.equal(spawned, 0);
});

test('abort terminates the child, rejects after close, and removes abort listeners', async () => {
  const controller = new AbortController();
  const reason = new Error('stop');
  let closed = false;
  const probe = createLlamaBinaryProbe({ spawnImpl(executable, args, options) {
    const child = spawn(executable, args, options);
    child.once('spawn', () => controller.abort(reason));
    child.once('close', () => { closed = true; });
    return child;
  } });
  await assert.rejects(probe(process.execPath, nodeArgs('setInterval(()=>{},1000)'), 5_000, { signal: controller.signal }), e => e === reason);
  assert.equal(closed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('timeout discards even valid-looking output and observes direct-child close', async () => {
  let closed = false;
  const observations = [];
  const probe = createLlamaBinaryProbe({ onObservation: o => observations.push(o), spawnImpl(...args) {
    const child = spawn(...args);
    child.once('close', () => { closed = true; });
    return child;
  } });
  const code = 'process.on("SIGTERM",()=>{});process.stdout.write("-ngl -1");setInterval(()=>{},1000)';
  assert.equal(await probe(process.execPath, nodeArgs(code), 150), null);
  assert.equal(closed, true);
  assert.equal(observations[0].outcome, 'timed_out');
});

test('one combined byte budget bounds stdout plus stderr', async () => {
  const observations = [];
  const probe = createLlamaBinaryProbe({ outputLimitBytes: 100, onObservation: o => observations.push(o) });
  assert.equal(await probe(process.execPath, nodeArgs('process.stdout.write("x".repeat(60)); process.stderr.write("y".repeat(60));setInterval(()=>{},1000)')), null);
  assert.equal(observations[0].outcome, 'output_limit');
  assert.ok(observations[0].outputBytes > 100);
});

test('exact output budget succeeds; limit is bytes, not UTF-16 characters', async () => {
  assert.equal(await createLlamaBinaryProbe({ outputLimitBytes: 4 })(process.execPath, nodeArgs('process.stdout.write("🐈")')), '🐈\n');
  assert.equal(await createLlamaBinaryProbe({ outputLimitBytes: 3 })(process.execPath, nodeArgs('process.stdout.write("🐈")')), null);
});

test('probe leaves no signal listeners after a successful request', async () => {
  const controller = new AbortController();
  await createLlamaBinaryProbe()(process.execPath, nodeArgs(''), 1_000, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('observer is isolated and observations contain no raw prompt, paths, args or output', async () => {
  const observations = [];
  const probe = createLlamaBinaryProbe({ onObservation: o => { observations.push(o); throw new Error('observer'); } });
  assert.equal(await probe(process.execPath, nodeArgs('process.stdout.write("PRIVATE")')), 'PRIVATE\n');
  assert.deepEqual(Object.keys(observations[0]).sort(), ['kind', 'outcome', 'durationMs', 'outputBytes', 'exitCode'].sort());
  assert.equal(JSON.stringify(observations).includes('PRIVATE'), false);
  assert.ok(Object.isFrozen(observations[0]));
  assert.ok(observations[0].durationMs >= 0);
  assert.equal(await createLlamaBinaryProbe({ onObservation: async () => { throw new Error('async observer'); } })(process.execPath, nodeArgs('')), '\n');
});

test('shell syntax in an argument remains an argument, never a shell command', async () => {
  let options;
  const probe = createLlamaBinaryProbe({ spawnImpl(exe, args, opts) { options = opts; return spawn(exe, args, opts); } });
  const marker = '$(touch SHOULD_NOT_EXIST); echo nope';
  assert.equal(await probe(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', marker]), `${marker}\n`);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
});

for (const [name, args] of [
  ['empty executable', ['', []]], ['NUL executable', ['a\0b', []]],
  ['nonstring argument', ['exe', [1]]], ['NUL argument', ['exe', ['\0']]],
  ['zero timeout', ['exe', [], 0]], ['negative timeout', ['exe', [], -1]],
  ['timer overflow', ['exe', [], 2_147_483_648]],
]) {
  test(`invalid probe request: ${name}`, async () => {
    let calls = 0;
    const probe = createLlamaBinaryProbe({ spawnImpl() { calls++; } });
    await assert.rejects(probe(...args), TypeError);
    assert.equal(calls, 0);
  });
}

test('invalid configuration is rejected before any request', () => {
  for (const config of [{ outputLimitBytes: 0 }, { outputLimitBytes: NaN }, { spawnImpl: 1 }, { onObservation: 1 }, { monotonicNow: 1 }]) {
    assert.throws(() => createLlamaBinaryProbe(config), TypeError);
  }
});

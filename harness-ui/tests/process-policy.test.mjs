import assert from 'node:assert/strict';
import test from 'node:test';

import { ProcessPolicyError, createProcessPolicy, resolveApprovedExecutable } from '../src/process-policy.mjs';

test('process policy approves only an allowlisted executable with shell disabled', () => {
  const calls = [];
  const policy = createProcessPolicy({
    allowedExecutables: ['git'],
    spawnFn: (command, args, options) => {
      calls.push({ command, args, options });
      return { pid: 1 };
    },
  });
  const child = policy.spawn('git', ['--version'], { cwd: process.cwd() });
  assert.equal(child.pid, 1);
  assert.deepEqual(calls[0].args, ['--version']);
  assert.equal(calls[0].options.shell, false);
});

test('process policy rejects unapproved executables, shell escape and malformed argv', () => {
  const policy = createProcessPolicy({ allowedExecutables: ['git'], spawnFn: () => ({}) });
  assert.throws(() => policy.spawn('powershell', [], { cwd: process.cwd() }), (error) => error instanceof ProcessPolicyError && error.code === 'EXECUTABLE_NOT_ALLOWED');
  assert.throws(() => policy.spawn('git', [], { cwd: process.cwd(), shell: true }), (error) => error instanceof ProcessPolicyError && error.code === 'SHELL_NOT_ALLOWED');
  assert.throws(() => policy.spawn('git', ['--ok', 7], { cwd: process.cwd() }), (error) => error instanceof ProcessPolicyError && error.code === 'ARGS_INVALID');
});

test('process policy fences working directory and forwards only approved environment keys', () => {
  const calls = [];
  const policy = createProcessPolicy({
    allowedExecutables: ['git'],
    cwdRoot: process.cwd(),
    envAllowlist: ['PATH', 'TALOS_TEST_VALUE'],
    spawnFn: (command, args, options) => { calls.push(options); return {}; },
  });
  policy.spawn('git', [], { cwd: process.cwd(), env: { TALOS_TEST_VALUE: 'ok', SECRET_TOKEN: 'no' } });
  assert.equal(calls[0].env.TALOS_TEST_VALUE, 'ok');
  assert.equal(calls[0].env.SECRET_TOKEN, undefined);
  assert.throws(() => policy.spawn('git', [], { cwd: 'C:\\outside' }), (error) => error instanceof ProcessPolicyError && error.code === 'CWD_NOT_ALLOWED');
});

test('process policy requires an explicit working directory for spawned commands', () => {
  const policy = createProcessPolicy({ allowedExecutables: ['git'], spawnFn: () => ({}) });
  assert.throws(() => policy.spawn('git', []), (error) => error instanceof ProcessPolicyError && error.code === 'CWD_REQUIRED');
});

test('runApprovedProcess captures bounded output and returns a truthful exit envelope', async () => {
  const listeners = {};
  const child = {
    pid: 42,
    stdout: { on: (event, fn) => { listeners[`stdout:${event}`] = fn; } },
    stderr: { on: (event, fn) => { listeners[`stderr:${event}`] = fn; } },
    once: (event, fn) => { listeners[event] = fn; },
    kill: () => { listeners.killed = true; },
  };
  const policy = createProcessPolicy({
    allowedExecutables: ['node'],
    cwdRoot: process.cwd(),
    capabilities: { workspace: process.cwd() },
    spawnFn: () => child,
  });
  const running = policy.runApprovedProcess({ executable: 'node', args: ['-e', 'ok'], cwd: process.cwd(), capability: 'workspace', captureLimitBytes: 8 });
  listeners['stdout:data']?.('abcdefghijk');
  listeners['stderr:data']?.('warn');
  listeners.close(7, null);
  const result = await running;
  assert.equal(result.code, 7);
  assert.equal(result.stdout, 'abcdefgh');
  assert.equal(result.stderr, 'warn');
  assert.equal(result.outputTruncated, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.aborted, false);
});

test('runApprovedProcess aborts the child and reports aborted without hanging', async () => {
  const listeners = {};
  let killed = false;
  const child = {
    stdout: { on: () => {} }, stderr: { on: () => {} },
    once: (event, fn) => { listeners[event] = fn; },
    kill: () => { killed = true; queueMicrotask(() => listeners.close(null, 'SIGTERM')); },
  };
  const policy = createProcessPolicy({ allowedExecutables: ['node'], cwdRoot: process.cwd(), capabilities: { workspace: process.cwd() }, spawnFn: () => child });
  const controller = new AbortController();
  const running = policy.runApprovedProcess({ executable: 'node', cwd: process.cwd(), capability: 'workspace', signal: controller.signal });
  controller.abort();
  const result = await running;
  assert.equal(killed, true);
  assert.equal(result.aborted, true);
  assert.equal(result.signal, 'SIGTERM');
});

test('runApprovedProcess requires a named capability and rejects a cwd outside it', async () => {
  const policy = createProcessPolicy({ allowedExecutables: ['node'], capabilities: { workspace: process.cwd() }, spawnFn: () => ({}) });
  await assert.rejects(() => policy.runApprovedProcess({ executable: 'node', cwd: process.cwd() }), (error) => error instanceof ProcessPolicyError && error.code === 'CAPABILITY_REQUIRED');
  await assert.rejects(() => policy.runApprovedProcess({ executable: 'node', cwd: 'C:\\outside', capability: 'workspace' }), (error) => error instanceof ProcessPolicyError && error.code === 'CWD_NOT_ALLOWED');
});

test('resolveApprovedExecutable validates an absolute configured binary and optional digest', async () => {
  const result = await resolveApprovedExecutable({ id: 'node', configuredPath: process.execPath });
  assert.equal(result.id, 'node');
  assert.equal(result.path, process.execPath);
  await assert.rejects(() => resolveApprovedExecutable({ id: 'node', configuredPath: 'node' }), (error) => error instanceof ProcessPolicyError && error.code === 'EXECUTABLE_PATH_INVALID');
});

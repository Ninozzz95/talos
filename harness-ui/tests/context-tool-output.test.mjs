import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createProcessPolicy } from '../src/process-policy.mjs';
import { createToolOutputCompressor } from '../src/context-tool-output.mjs';

const makeStore = (text, sessionId = 's') => ({ async readOriginals(input) {
  assert.equal(input.sessionId, 's'); assert.deepEqual(input.ids, ['r']);
  const message = { role: 'tool', content: text, tool_call_id: 'call' };
  return [{ id: 'r', sessionId, message, sha256: createHash('sha256').update(JSON.stringify(message)).digest('hex') }];
} });
const fakePolicy = ({ output = 'short\n', code = 0, hang = false } = {}) => {
  const calls = [];
  return { calls, spawn(binary, args, options) {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { child.emit('close', null, 'SIGTERM'); return true; };
    const call = { binary, args, options, stdin: '' }; calls.push(call);
    child.stdin.on('data', data => { call.stdin += data.toString('utf8'); });
    child.stdin.on('finish', () => { if (!hang) queueMicrotask(() => { child.stdout.write(output); child.emit('close', code); }); });
    return child;
  } };
};

test('CTX-RAW-TOOL-8000 requires exact archived original and pipes captured text only', async () => {
  const text = 'original captured output 😀\n'.repeat(500); const policy = fakePolicy();
  const compressor = createToolOutputCompressor({ binaryPath: process.execPath, processPolicy: policy, store: makeStore(text) });
  const result = await compressor.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text, filter: 'git-status', command: 'DO NOT EXECUTE', exitCode: 17 });
  assert.equal(policy.calls[0].stdin, text);
  assert.deepEqual(policy.calls[0].args, ['pipe', '--filter', 'git-status']);
  assert.equal(policy.calls[0].options.shell, false);
  assert.equal(result.exitCode, 17); assert.equal(result.command, 'DO NOT EXECUTE');
  assert.equal(result.originalRef.recordId, 'r'); assert.equal(result.originalChars, text.length);
  assert.equal(result.compressed, true);
  await assert.rejects(compressor.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text: text.slice(0, 8000), filter: 'git-status' }), { code: 'CTX_ORIGINAL_MISMATCH' });
  assert.equal(policy.calls.length, 1);
});

test('CTX-OUTPUT-FALLBACK unknown filters and oversize UTF8 preserve full original', async () => {
  for (const [text, filter] of [['x'.repeat(9000), 'unrecognized'], ['😀'.repeat(3 * 1024 * 1024), 'git-status']]) {
    const policy = fakePolicy();
    const api = createToolOutputCompressor({ binaryPath: process.execPath, processPolicy: policy, store: makeStore(text) });
    const result = await api.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text, filter });
    assert.equal(result.text, text); assert.equal(result.compressed, false); assert.equal(policy.calls.length, 0);
  }
});

test('CTX-OUTPUT-FAILURE preserves original on filter failure or timeout', async () => {
  for (const scenario of [{ code: 1 }, { output: '' }, { hang: true }]) {
    const policy = fakePolicy(scenario); const text = 'original';
    const api = createToolOutputCompressor({ binaryPath: process.execPath, processPolicy: policy, store: makeStore(text), timeoutMs: 20 });
    const result = await api.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text, filter: 'git-status' });
    assert.equal(result.text, text); assert.equal(result.compressed, false);
  }
});

test('CTX-OUTPUT-CANCEL and session mismatch do not launch another process', async () => {
  const controller = new AbortController(); controller.abort(); const policy = fakePolicy();
  const api = createToolOutputCompressor({ binaryPath: process.execPath, processPolicy: policy, store: makeStore('raw', 'other') });
  await assert.rejects(api.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text: 'raw', filter: 'git-status', signal: controller.signal }), { code: 'CTX_CANCELLED' });
  await assert.rejects(api.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text: 'raw', filter: 'git-status' }), { code: 'CTX_ORIGINAL_MISMATCH' });
  assert.equal(policy.calls.length, 0);
});

test('CTX-RTK-REAL-STDIN pinned RTK compresses a safe captured git-status fixture', async t => {
  const binaryPath = process.env.TALOS_TEST_RTK_PATH ?? join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'rtk.exe' : 'rtk');
  let bytes;
  try { bytes = await readFile(binaryPath); } catch (error) { if (error.code === 'ENOENT') return t.skip('Pinned RTK is not installed; upstream gate remains unqualified'); throw error; }
  if (process.platform === 'win32') assert.equal(createHash('sha256').update(bytes).digest('hex'), '60640b970fdf10451813ab4d9d24deb5c6370e43a5192eb14c6ba101a15b633c');
  const text = 'On branch main\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n\n\tmodified:   src/example.mjs\n\nno changes added to commit (use "git add" and/or "git commit -a")\n';
  const api = createToolOutputCompressor({ binaryPath, processPolicy: createProcessPolicy({ allowedExecutables: [binaryPath] }), store: makeStore(text) });
  const result = await api.compressCapturedToolOutput({ sessionId: 's', recordId: 'r', text, filter: 'git-status', exitCode: 9 });
  assert.equal(result.compressed, true); assert.ok(result.text.includes('example.mjs')); assert.equal(result.exitCode, 9);
});

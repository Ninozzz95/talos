/**
 * Per-request environment narrowing must survive the final process boundary.
 * Only synthetic TALOS_TEST_ENV_* values are observed. Most checks inject
 * spawnFn; the final check also observes those values in a real Node child.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createProcessPolicy } from '../src/process-policy.mjs';

const KEEP = 'TALOS_TEST_ENV_REQUESTED';
const DROP = 'TALOS_TEST_ENV_POLICY_ONLY';
const OTHER = 'TALOS_TEST_ENV_OTHER';
const FOREIGN = 'TALOS_TEST_ENV_FORBIDDEN';
const KEYS = [KEEP, DROP, OTHER, FOREIGN];
const CWD = process.cwd();

function parentEnvironment(t, values = {}) {
  const before = KEYS.map(key => [key, process.env[key]]);
  t.after(() => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of KEYS) {
    delete process.env[key];
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
  }
}

function capturePolicy(envAllowlist = [KEEP, DROP]) {
  const calls = [];
  const policy = createProcessPolicy({
    allowedExecutables: ['node'],
    capabilities: { fixture: CWD },
    envAllowlist,
    spawnFn: (command, args, options) => {
      calls.push({ command, args, options: { ...options, env: { ...options.env } } });
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    },
  });
  return { policy, calls };
}

async function run(policy, request = {}) {
  const result = await policy.runApprovedProcess({
    executable: 'node', cwd: CWD, capability: 'fixture', ...request,
  });
  assert.equal(result.code, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.aborted, false);
}

test('request subset does not reintroduce a policy-only parent variable', async t => {
  parentEnvironment(t, { [DROP]: 'parent-must-not-return' });
  const { policy, calls } = capturePolicy();
  await run(policy, { envKeys: [KEEP], env: { [KEEP]: 'requested' } });
  assert.deepEqual(calls[0].options.env, { [KEEP]: 'requested' });
});

test('empty envKeys excludes both inherited and explicitly supplied values', async t => {
  parentEnvironment(t, { [KEEP]: 'parent-kept', [DROP]: 'parent-dropped' });
  const { policy, calls } = capturePolicy();
  await run(policy, { envKeys: [], env: { [KEEP]: 'explicit', [DROP]: 'explicit' } });
  assert.deepEqual(calls[0].options.env, {});
});

test('explicit env cannot opt a policy-only key back into the request', async t => {
  parentEnvironment(t, { [DROP]: 'parent-must-not-return' });
  const { policy, calls } = capturePolicy();
  await run(policy, { envKeys: [KEEP], env: { [KEEP]: 'ok', [DROP]: 'also-denied' } });
  assert.deepEqual(calls[0].options.env, { [KEEP]: 'ok' });
});

test('request keys cannot widen the policy, even when a foreign key is inherited', async t => {
  parentEnvironment(t, { [FOREIGN]: 'parent-forbidden' });
  const { policy, calls } = capturePolicy([KEEP]);
  await run(policy, { envKeys: [KEEP, FOREIGN], env: { [KEEP]: 'ok', [FOREIGN]: 'forbidden' } });
  assert.deepEqual(calls[0].options.env, { [KEEP]: 'ok' });
});

test('omitted envKeys keeps the policy default and explicit values override the parent', async t => {
  parentEnvironment(t, { [KEEP]: 'parent', [DROP]: 'inherited', [FOREIGN]: 'forbidden' });
  const { policy, calls } = capturePolicy();
  await run(policy, { env: { [KEEP]: 'override', [FOREIGN]: 'still-forbidden' } });
  assert.deepEqual(calls[0].options.env, { [KEEP]: 'override', [DROP]: 'inherited' });
});

test('empty policy remains empty regardless of requested keys or values', async t => {
  parentEnvironment(t, { [KEEP]: 'parent', [FOREIGN]: 'parent-forbidden' });
  const { policy, calls } = capturePolicy([]);
  await run(policy, { envKeys: KEYS, env: { [KEEP]: 'explicit' } });
  assert.deepEqual(calls[0].options.env, {});
});

test('narrowing does not mutate request inputs or affect later requests on the same policy', async t => {
  parentEnvironment(t, { [KEEP]: 'parent', [DROP]: 'inherited' });
  const envKeys = Object.freeze([KEEP, KEEP, FOREIGN]);
  const env = Object.freeze({ [KEEP]: 'override', [FOREIGN]: 'forbidden' });
  const { policy, calls } = capturePolicy(Object.freeze([KEEP, DROP]));
  await run(policy, { envKeys, env });
  await run(policy, { envKeys: [] });
  await run(policy);
  assert.deepEqual(envKeys, [KEEP, KEEP, FOREIGN]);
  assert.deepEqual(env, { [KEEP]: 'override', [FOREIGN]: 'forbidden' });
  assert.deepEqual(calls.map(call => call.options.env), [
    { [KEEP]: 'override' }, {}, { [KEEP]: 'parent', [DROP]: 'inherited' },
  ]);
});

test('malformed envKeys is rejected before spawn', async () => {
  const { policy, calls } = capturePolicy();
  for (const envKeys of [null, KEEP, 1, {}, [KEEP, null], [KEEP, 2]]) {
    await assert.rejects(
      policy.runApprovedProcess({ executable: 'node', cwd: CWD, capability: 'fixture', envKeys }),
      { code: 'ENV_KEYS_INVALID' },
    );
  }
  assert.equal(calls.length, 0);
});

test('malformed env is rejected before spawn, including with empty envKeys', async () => {
  const { policy, calls } = capturePolicy();
  for (const env of [null, [], 'bad', 1]) {
    await assert.rejects(
      policy.runApprovedProcess({ executable: 'node', cwd: CWD, capability: 'fixture', envKeys: [], env }),
      { code: 'ENV_INVALID' },
    );
  }
  assert.equal(calls.length, 0);
});

for (const method of ['spawn', 'execFile', 'execFileSync']) {
  test(`${method} retains policy-wide filtering and ignores an untrusted options.envKeys override`, t => {
    parentEnvironment(t, { [KEEP]: 'parent', [DROP]: 'inherited', [FOREIGN]: 'forbidden' });
    const calls = [];
    const adapter = (command, args, options, callback) => {
      calls.push({ command, args, options, callback });
      return 'adapter-result';
    };
    const policy = createProcessPolicy({
      allowedExecutables: ['node'], envAllowlist: [KEEP, DROP],
      spawnFn: adapter, execFileFn: adapter, execFileSyncFn: adapter,
    });
    const callback = () => {};
    const value = policy[method]('node', [], {
      cwd: CWD, env: { [KEEP]: 'override', [FOREIGN]: 'forbidden' }, envKeys: [FOREIGN],
    }, callback);
    assert.equal(value, 'adapter-result');
    assert.equal(calls[0].options.shell, false);
    assert.deepEqual(calls[0].options.env, { [KEEP]: 'override', [DROP]: 'inherited' });
    if (method === 'execFile') assert.equal(calls[0].callback, callback);
  });
}

test('narrowed requests preserve command, args, cwd, signal and capture options', async t => {
  parentEnvironment(t, { [KEEP]: 'parent', [DROP]: 'must-not-return' });
  const { policy, calls } = capturePolicy();
  const controller = new AbortController();
  await run(policy, {
    args: ['--version'], envKeys: [KEEP], signal: controller.signal,
    timeoutMs: 1000, captureLimitBytes: 1234,
  });
  const { command, args, options } = calls[0];
  assert.equal(command, 'node');
  assert.deepEqual(args, ['--version']);
  assert.equal(options.cwd, CWD);
  assert.equal(options.signal, controller.signal);
  assert.equal(options.timeout, 1000);
  assert.equal(options.captureLimitBytes, 1234);
  assert.equal(options.shell, false);
  assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(options.env, { [KEEP]: 'parent' });
});

test('all 1024 subset/parent/override combinations obey the policy intersection', async t => {
  parentEnvironment(t);
  const policyKeys = [KEEP, DROP, OTHER];
  const subset = (values, mask) => values.filter((_, index) => mask & (1 << index));
  const { policy, calls } = capturePolicy(policyKeys);
  for (let parentMask = 0; parentMask < 8; parentMask += 1) {
    for (const key of KEYS) delete process.env[key];
    const parent = Object.fromEntries(subset(policyKeys, parentMask).map(key => [key, 'parent']));
    Object.assign(process.env, parent, { [FOREIGN]: 'forbidden-parent' });
    for (let overrideMask = 0; overrideMask < 8; overrideMask += 1) {
      const env = Object.fromEntries(subset(policyKeys, overrideMask).map(key => [key, 'override']));
      env[FOREIGN] = 'forbidden-override';
      for (let requestMask = 0; requestMask < 16; requestMask += 1) {
        const envKeys = subset(KEYS, requestMask);
        await run(policy, { envKeys, env });
        const expected = Object.fromEntries(Object.entries({ ...parent, ...env })
          .filter(([key]) => policyKeys.includes(key) && envKeys.includes(key)));
        assert.deepEqual(calls.at(-1).options.env, expected,
          `parent=${parentMask}, override=${overrideMask}, request=${requestMask}`);
      }
    }
  }
  assert.equal(calls.length, 1024);
});

test('real child observes only requested synthetic variables, not policy-only parent values', async t => {
  parentEnvironment(t, { [DROP]: 'must-not-reach-child', [FOREIGN]: 'forbidden-parent' });
  const policy = createProcessPolicy({
    allowedExecutables: [process.execPath], capabilities: { fixture: CWD },
    // Windows may need SystemRoot to start the child; it is explicitly requested too.
    envAllowlist: [KEEP, DROP, 'SystemRoot'],
  });
  const script = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(KEYS)}.filter(key => Object.hasOwn(process.env, key)).map(key => [key, process.env[key]]))))`;
  const result = await policy.runApprovedProcess({
    executable: process.execPath, args: ['-e', script], cwd: CWD, capability: 'fixture',
    envKeys: [KEEP, 'SystemRoot'], env: { [KEEP]: 'ok', [FOREIGN]: 'forbidden' },
    timeoutMs: 5000, captureLimitBytes: 4096,
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.timedOut, false);
  assert.equal(result.aborted, false);
  assert.equal(result.outputTruncated, false);
  assert.deepEqual(JSON.parse(result.stdout), { [KEEP]: 'ok' });
});

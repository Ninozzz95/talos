import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {createProcessTreeEvidenceStore,hostFingerprint} from '../../src/security/process-tree-evidence-store.ts';
import type {ProcessTreeProbeResult} from '../../src/security/process-tree-probe.ts';

const DAY = 24 * 60 * 60 * 1000;
const QUARTER_HOUR = 15 * 60 * 1000;

function result(verified: boolean): ProcessTreeProbeResult {
  return {
    verified,
    ...(verified ? {} : {reason: 'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED'}),
    evidence: {
      schema: 'talos.cli.process-tree-evidence.v1',
      scope: 'createprocess-descendant',
      signals: verified ? {heartbeat: 'gone', signalZero: 'gone', enumeration: 'gone'} : {heartbeat: 'alive', signalZero: 'alive', enumeration: 'alive'},
      executorPid: 4242,
      descendantPid: 4343,
      observedAtMs: 1_000,
      durationMs: 12,
      cleanup: {descendantKilled: !verified, executorKilled: false, directoryRemoved: true}
    }
  };
}

const roots: string[] = [];
async function cacheRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'talos-evidence-'));
  roots.push(directory);
  return directory;
}
after(async () => {for (const directory of roots) await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});});

test('host fingerprint is deterministic and moves with every host field', () => {
  const base = {platform: 'win32', release: '10.0.26200', arch: 'x64', hostname: 'talos-host'};
  assert.equal(hostFingerprint(base), hostFingerprint({...base}));
  assert.match(hostFingerprint(base), /^[0-9a-f]{64}$/u);
  for (const key of ['platform', 'release', 'arch', 'hostname'] as const) {
    assert.notEqual(hostFingerprint({...base, [key]: 'changed'}), hostFingerprint(base), `${key} must change the fingerprint`);
  }
  assert.match(hostFingerprint(), /^[0-9a-f]{64}$/u);
});

test('a positive result is cached for 24 hours and expires after it', async () => {
  const root = await cacheRoot();
  let clock = 1_700_000_000_000;
  const store = createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-a', now: () => clock});
  await store.write(result(true));
  assert.deepEqual(await store.read(), result(true));
  clock += DAY;
  assert.deepEqual(await store.read(), result(true));
  clock += 1;
  assert.equal(await store.read(), null);
});

test('a negative result is cached for 15 minutes only', async () => {
  const root = await cacheRoot();
  let clock = 1_700_000_000_000;
  const store = createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-a', now: () => clock});
  await store.write(result(false));
  clock += QUARTER_HOUR;
  assert.deepEqual(await store.read(), result(false));
  clock += 1;
  assert.equal(await store.read(), null);
});

test('a host fingerprint change invalidates the cached evidence', async () => {
  const root = await cacheRoot();
  const clock = () => 1_700_000_000_000;
  await createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-a', now: clock}).write(result(true));
  assert.equal(await createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-b', now: clock}).read(), null);
  assert.deepEqual(await createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-a', now: clock}).read(), result(true));
});

test('a missing, corrupt, or foreign-schema record reads as a miss instead of throwing', async () => {
  const root = await cacheRoot();
  const store = createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-a'});
  assert.equal(await store.read(), null);
  const [file] = await (async () => {
    await store.write(result(true));
    return (await readdir(root)).map(name => join(root, name));
  })();
  await writeFile(file!, '{not json', 'utf8');
  assert.equal(await store.read(), null);
  await writeFile(file!, JSON.stringify({schema: 'something.else.v9', hostFingerprint: 'host-a', recordedAtMs: Date.now(), result: result(true)}), 'utf8');
  assert.equal(await store.read(), null);
});

test('a failing write never truncates the record in place', async () => {
  const root = await cacheRoot();
  const store = createProcessTreeEvidenceStore({cacheRoot: root, fingerprint: 'host-a'});
  await store.write(result(true));
  const [name] = await readdir(root);
  const file = join(root, name!);
  const preserved = 'x'.repeat(36 * 1024);
  await writeFile(file, preserved, 'utf8');
  const poisoned = {...result(true), evidence: {...result(true).evidence, durationMs: 1n as unknown as number}};
  await assert.rejects(() => store.write(poisoned), TypeError); // JSON cannot carry a BigInt
  assert.equal(await readFile(file, 'utf8'), preserved, 'the existing record must survive a failed write byte for byte');
  assert.deepEqual(await readdir(root), [name], 'a failed write must not leave a temporary file behind');
});

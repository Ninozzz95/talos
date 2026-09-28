import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  acquireStoreOwner,
  proveStoreOwnerLiveness,
  readStoreOwner,
  releaseStoreOwner,
} from '../src/workflow/store-owner.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function ownerChild(root) {
  const owner = await acquireStoreOwner({ workflowDataRoot: root });
  process.stdout.write(`READY ${JSON.stringify({ endpoint: owner.endpoint, record: owner.record })}\n`);
  await new Promise((resolve) => process.stdin.once('data', resolve));
  await releaseStoreOwner(owner);
}

async function startOwnerChild(root) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--owner-child', root], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`owner child timeout: ${stderr}`)), 10_000);
    const inspect = () => {
      const line = stdout.split('\n').find((entry) => entry.startsWith('READY '));
      if (!line) return;
      clearTimeout(timeout);
      resolve(JSON.parse(line.slice(6)));
    };
    child.stdout.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`owner child exited ${code}: ${stderr}`));
    });
  });
  return { child, ready };
}

async function stopOwnerChild(child, { crash = false } = {}) {
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (crash) child.kill();
  else child.stdin.end('release\n');
  await exited;
}

const tempRoot = (prefix = 'talos-workflow-owner-') => mkdtempSync(join(tmpdir(), prefix));

if (process.argv[2] === '--owner-child') {
  await ownerChild(process.argv[3]);
} else {
  test('OWNER-01 / M044_SECOND_PROCESS_WRITER_ACCEPTED / M079_STOREOWNER_LIVE_SECOND_PROCESS_STEALS_ROOT — real second process is fenced', async (t) => {
    const root = tempRoot();
    const { child, ready } = await startOwnerChild(root);
    t.after(async () => { if (child.exitCode === null) await stopOwnerChild(child, { crash: true }); rimuoviCartellaDiProva(root); });
    assert.equal(await proveStoreOwnerLiveness({ workflowDataRoot: root }), true);
    await assert.rejects(
      () => acquireStoreOwner({ workflowDataRoot: root }),
      (error) => error?.code === 'WORKFLOW_STORE_OWNED',
    );
    assert.equal(ready.record.state, 'active');
    await stopOwnerChild(child);
  });

  test('OWNER-02 — different roots can be owned concurrently', async (t) => {
    const rootA = tempRoot('talos-owner-a-');
    const rootB = tempRoot('talos-owner-b-');
    const first = await acquireStoreOwner({ workflowDataRoot: rootA });
    const second = await acquireStoreOwner({ workflowDataRoot: rootB });
    t.after(async () => { await releaseStoreOwner(first); await releaseStoreOwner(second); rimuoviCartellaDiProva(rootA); rimuoviCartellaDiProva(rootB); });
    assert.notEqual(first.endpoint, second.endpoint);
  });

  test('OWNER-03 — process crash releases OS authority and permits reacquisition', async (t) => {
    const root = tempRoot();
    const { child } = await startOwnerChild(root);
    t.after(() => rimuoviCartellaDiProva(root));
    await stopOwnerChild(child, { crash: true });
    const recovered = await acquireStoreOwner({ workflowDataRoot: root });
    assert.equal(recovered.record.state, 'active');
    await releaseStoreOwner(recovered);
  });

  test('OWNER-04 / M064_STOREOWNER_PID_ONLY_STALE_PROOF — stale JSON and reused-looking PID never grant authority', async (t) => {
    const root = tempRoot();
    writeFileSync(join(root, 'owner.json'), JSON.stringify({
      schema: 'talos.workflow-store-owner.v1',
      bootId: randomUUID(),
      pid: process.pid,
      processStartIdentity: 'looks-live-but-is-diagnostic-only',
      hostFingerprint: null,
      acquiredAt: '2020-01-01T00:00:00.000Z',
      heartbeatAt: '2020-01-01T00:00:00.000Z',
      dataRootFingerprint: `sha256:${'0'.repeat(64)}`,
      endpointKey: '0'.repeat(40),
      platform: process.platform,
      state: 'active',
    }), 'utf8');
    const owner = await acquireStoreOwner({ workflowDataRoot: root });
    t.after(async () => { await releaseStoreOwner(owner); rimuoviCartellaDiProva(root); });
    assert.notEqual(owner.record.processStartIdentity, 'looks-live-but-is-diagnostic-only');
    assert.equal(owner.record.state, 'active');
  });

  test('OWNER-05 / M090_STOREOWNER_RECORD_GRANTS_AUTHORITY_WITHOUT_OS_BIND — owner JSON alone is never authority', async (t) => {
    const root = tempRoot();
    const first = await acquireStoreOwner({ workflowDataRoot: root });
    t.after(async () => { await releaseStoreOwner(first); rimuoviCartellaDiProva(root); });
    const durable = await readStoreOwner({ workflowDataRoot: root });
    assert.equal(durable.bootId, first.record.bootId);
    await assert.rejects(
      () => acquireStoreOwner({ workflowDataRoot: root }),
      (error) => error?.code === 'WORKFLOW_STORE_OWNED',
    );
  });

  test('OWNER-08 — owner-record persistence failure releases the just-bound endpoint', async (t) => {
    const root = tempRoot();
    t.after(() => rimuoviCartellaDiProva(root));
    await assert.rejects(
      () => acquireStoreOwner({ workflowDataRoot: root }, {
        persistOwnerRecord: async () => { throw Object.assign(new Error('injected write failure'), { code: 'EIO' }); },
      }),
      (error) => error?.code === 'WORKFLOW_STORE_IO',
    );
    const recovered = await acquireStoreOwner({ workflowDataRoot: root });
    await releaseStoreOwner(recovered);
  });

  test('OWNER-09 — bind-to-record failures leave no pre-authority store effects and release the endpoint', async (t) => {
    const emptyRoot = tempRoot('talos-owner-after-bind-');
    const staleRoot = tempRoot('talos-owner-before-persist-');
    const staleBytes = Buffer.from('{"diagnostic":"stale owner bytes"}\n', 'utf8');
    writeFileSync(join(staleRoot, 'owner.json'), staleBytes);
    t.after(() => {
      rimuoviCartellaDiProva(emptyRoot);
      rimuoviCartellaDiProva(staleRoot);
    });

    await assert.rejects(
      () => acquireStoreOwner({
        workflowDataRoot: emptyRoot,
        failpoint: async (name) => {
          if (name === 'store.owner.after_bind') throw new Error('injected after-bind crash');
        },
      }),
      (error) => error?.code === 'WORKFLOW_STORE_IO',
    );
    assert.equal(existsSync(join(emptyRoot, 'owner.json')), false);
    assert.equal(existsSync(join(emptyRoot, 'owner-history')), false);
    const recoveredEmpty = await acquireStoreOwner({ workflowDataRoot: emptyRoot });
    await releaseStoreOwner(recoveredEmpty);

    await assert.rejects(
      () => acquireStoreOwner({ workflowDataRoot: staleRoot }, {
        persistOwnerRecord: async () => { throw Object.assign(new Error('injected record failure'), { code: 'EIO' }); },
      }),
      (error) => error?.code === 'WORKFLOW_STORE_IO',
    );
    assert.deepEqual(readFileSync(join(staleRoot, 'owner.json')), staleBytes);
    assert.equal(existsSync(join(staleRoot, 'owner-history')), false);
    const recoveredStale = await acquireStoreOwner({ workflowDataRoot: staleRoot });
    await releaseStoreOwner(recoveredStale);
  });

  test('OWNER-10 — IPC endpoint contains only the derived key, never the raw root', async (t) => {
    const root = tempRoot('talos-sensitive-root-name-');
    const owner = await acquireStoreOwner({ workflowDataRoot: root });
    t.after(async () => { await releaseStoreOwner(owner); rimuoviCartellaDiProva(root); });
    assert.equal(owner.endpoint.includes(root), process.platform !== 'win32' && process.platform !== 'linux');
    assert.match(owner.record.endpointKey, /^[0-9a-f]{40}$/u);
  });

  test('M091_STOREOWNER_UNIX_STALE_CLEANUP_DELETES_NONSOCKET — non-socket endpoint is never removed', {
    skip: process.platform === 'win32' || process.platform === 'linux' ? 'filesystem Unix socket contract runs on macOS/other Unix CI' : false,
  }, async (t) => {
    const root = tempRoot();
    t.after(() => rimuoviCartellaDiProva(root));
    writeFileSync(join(root, '.store-owner.sock'), 'not a socket', 'utf8');
    await assert.rejects(
      () => acquireStoreOwner({ workflowDataRoot: root }),
      (error) => error?.code === 'WORKFLOW_STORE_OWNED' || error?.code === 'WORKFLOW_STORE_NEEDS_ATTENTION',
    );
    assert.equal(existsSync(join(root, '.store-owner.sock')), true);
  });
}

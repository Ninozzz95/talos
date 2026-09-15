import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';

import { WorkspaceLaunchError, createWorkspaceLaunchStore } from '../src/workspace-launch-store.mjs';

const CREDENTIAL = 'a'.repeat(64);

function fixture({ now = 1_787_000_000_000, ttlMs = 120_000 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workspace-launch-'));
  const workspace = join(root, 'Progetto con spazi Ω');
  mkdirSync(workspace);
  const credentialFile = join(root, 'launcher-token');
  writeFileSync(credentialFile, `${CREDENTIAL}\n`, 'utf8');
  let tick = now;
  let randomCounter = 0;
  const store = createWorkspaceLaunchStore({
    credentialFile,
    ttlMs,
    clock: () => tick,
    randomBytesFn: (bytes) => Buffer.alloc(bytes, ++randomCounter),
  });
  return { root, workspace, credentialFile, store, advance: (ms) => { tick += ms; } };
}

test('OPEN-WITH-TALOS-STORE-01 — crea un’intenzione opaca senza esporre il percorso', () => {
  const { workspace, store } = fixture();
  const created = store.create({ percorso: workspace, credential: CREDENTIAL });
  assert.match(created.id, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(created.nome, 'Progetto con spazi Ω');
  assert.equal('percorso' in created, false);
  assert.equal(JSON.stringify(created).includes(workspace), false);
  assert.deepEqual(store.inspect(created.id), created);
  assert.equal(store.resolve(created.id).percorso, workspace);
});

test('OPEN-WITH-TALOS-STORE-02 — credenziale errata vince sul controllo percorso e non crea un oracolo filesystem', () => {
  const { store } = fixture();
  assert.throws(
    () => store.create({ percorso: 'C:\\percorso-che-non-esiste', credential: 'b'.repeat(64) }),
    (error) => error instanceof WorkspaceLaunchError && error.code === 'WORKSPACE_LAUNCH_UNAUTHORIZED',
  );
});

test('OPEN-WITH-TALOS-STORE-03 — file, percorso relativo e cartella assente sono rifiutati', () => {
  const { root, store } = fixture();
  const file = join(root, 'non-cartella.txt');
  writeFileSync(file, 'x');
  for (const percorso of [file, 'relativo', join(root, 'assente')]) {
    assert.throws(
      () => store.create({ percorso, credential: CREDENTIAL }),
      (error) => error instanceof WorkspaceLaunchError && error.code === 'WORKSPACE_NOT_AVAILABLE',
      percorso,
    );
  }
});

test('OPEN-WITH-TALOS-STORE-04 — realpath canonizza il workspace prima di conservarlo', () => {
  const { root, workspace, store } = fixture();
  const nonCanonico = `${workspace}${sep}..${sep}Progetto con spazi Ω`;
  const created = store.create({ percorso: nonCanonico, credential: CREDENTIAL });
  assert.equal(store.resolve(created.id).percorso, workspace);
  assert.notEqual(store.resolve(created.id).percorso, nonCanonico);
  assert.equal(root.length > 0, true);
});

test('OPEN-WITH-TALOS-STORE-05 — una intenzione scaduta sparisce e non è distinguibile da una inesistente', () => {
  const { workspace, store, advance } = fixture({ ttlMs: 1_000 });
  const { id } = store.create({ percorso: workspace, credential: CREDENTIAL });
  advance(1_001);
  for (const candidate of [id, 'A'.repeat(32)]) {
    assert.throws(
      () => store.resolve(candidate),
      (error) => error instanceof WorkspaceLaunchError && error.code === 'WORKSPACE_LAUNCH_NOT_AVAILABLE',
    );
  }
});

test('OPEN-WITH-TALOS-STORE-06 — consume rende l’intenzione monouso', () => {
  const { workspace, store } = fixture();
  const { id } = store.create({ percorso: workspace, credential: CREDENTIAL });
  assert.equal(store.consume(id), true);
  assert.equal(store.consume(id), false);
  assert.throws(() => store.inspect(id), { code: 'WORKSPACE_LAUNCH_NOT_AVAILABLE' });
});

test('OPEN-WITH-TALOS-STORE-07 — la credenziale viene generata una volta e poi riutilizzata', () => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workspace-launch-token-'));
  const credentialFile = join(root, 'launcher-token');
  let calls = 0;
  const options = { credentialFile, randomBytesFn: (bytes) => { calls += 1; return Buffer.alloc(bytes, 7); } };
  createWorkspaceLaunchStore(options);
  const first = readFileSync(credentialFile, 'utf8').trim();
  createWorkspaceLaunchStore(options);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(readFileSync(credentialFile, 'utf8').trim(), first);
  assert.equal(calls, 1);
});

test('OPEN-WITH-TALOS-STORE-08 — una credenziale corrotta fallisce chiusa', () => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workspace-launch-corrupt-'));
  const credentialFile = join(root, 'launcher-token');
  writeFileSync(credentialFile, 'troppo-corta');
  assert.throws(
    () => createWorkspaceLaunchStore({ credentialFile }),
    (error) => error instanceof WorkspaceLaunchError && error.code === 'WORKSPACE_LAUNCH_CONFIG_INVALID',
  );
});

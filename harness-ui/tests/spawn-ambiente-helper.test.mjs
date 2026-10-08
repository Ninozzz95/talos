/*
 * ⛔ SPAWN-AMBIENTE-HELPER (08/10/2026, bugfixer) — la build dell'helper di caricamento file (BUG-20, `chat-file-upload.mjs`) nasceva
 *   con l'ambiente INTERO del server: SPAWN-AMBIENTE-01 era rosso da 2d3d02c86. Ora riceve quello del server meno le sue variabili,
 *   e tiene `ELECTRON_RUN_AS_NODE` quando c'è, perché rilancia `process.execPath` (Electron, nell'app installata).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { ambienteDellaBuildHelper } from '../src/chat-file-upload.mjs';

const SERVER = {
  TALOS_HARNESS_UI_TOKEN: 'gettone', TALOS_HARNESS_RECEIPT_KEY_ID: 'id', TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: 'chiave',
  TALOS_HARNESS_SEARCH_API_KEY: 'ricerca',
};

test('SPAWN-HELPER-01 — via le variabili del server; restano quelle della persona che la build usa (PATH, TALOS_GO_BINARY)', () => {
  const env = ambienteDellaBuildHelper({ ...SERVER, PATH: 'C:\\go\\bin', TALOS_GO_BINARY: 'C:\\go\\bin\\go.exe', GH_TOKEN: 'della-persona' });
  for (const nome of Object.keys(SERVER)) assert.equal(env[nome], undefined, `${nome} non deve arrivare alla build`);
  assert.equal(env.PATH, 'C:\\go\\bin');
  assert.equal(env.TALOS_GO_BINARY, 'C:\\go\\bin\\go.exe');
  assert.equal(env.GH_TOKEN, 'della-persona', 'le credenziali della persona non sono del server: restano, come nel Terminale');
});

test('SPAWN-HELPER-02 — ELECTRON_RUN_AS_NODE resta se il server ce l\'ha (anche scritta in un altro modo), e non si inventa se manca', () => {
  assert.equal(ambienteDellaBuildHelper({ ...SERVER, ELECTRON_RUN_AS_NODE: '1' }).ELECTRON_RUN_AS_NODE, '1');
  assert.equal(ambienteDellaBuildHelper({ ...SERVER, electron_run_as_node: '1' }).ELECTRON_RUN_AS_NODE, '1');
  assert.equal(Object.hasOwn(ambienteDellaBuildHelper({ ...SERVER }), 'ELECTRON_RUN_AS_NODE'), false);
});

test('SPAWN-HELPER-03 — capo a capo: un figlio di process.execPath con questo ambiente non vede il gettone del server', () => {
  const prima = process.env.TALOS_HARNESS_UI_TOKEN;
  process.env.TALOS_HARNESS_UI_TOKEN = 'gettone-della-prova';
  try {
    const figlio = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.env.TALOS_HARNESS_UI_TOKEN))'],
      { env: ambienteDellaBuildHelper(), encoding: 'utf8', windowsHide: true });
    assert.equal(figlio.status, 0, figlio.stderr);
    assert.equal(figlio.stdout, 'undefined');
  } finally {
    if (prima === undefined) delete process.env.TALOS_HARNESS_UI_TOKEN; else process.env.TALOS_HARNESS_UI_TOKEN = prima;
  }
});

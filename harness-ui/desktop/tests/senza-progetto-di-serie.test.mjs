import assert from 'node:assert/strict';
import test from 'node:test';
import { creaAvvioFiglio } from '../runtime.mjs';

/* 29/10/2026 (owner: «Scegli una cartella» al primo avvio): il guscio dice al server di non prendere la cartella del programma come progetto. */
test('GUSCIO-SENZA-PROGETTO-01 — il server dell\'app parte con TALOS_HARNESS_UI_DEFAULT_PROJECT=none', () => {
  const avvio = creaAvvioFiglio({ execPath: process.execPath, percorsi: { root: 'C:\app\resources', server: 'C:\app\resources\server.mjs', bootstrap: 'C:\app\child-bootstrap.mjs' }, port: 4321, token: 'a'.repeat(64), reportFile: 'C:\dati\r.json', dataDir: 'C:\dati', env: {} });
  const ambiente = avvio.options.env;
  assert.equal(ambiente.TALOS_HARNESS_UI_DEFAULT_PROJECT, 'none');
});

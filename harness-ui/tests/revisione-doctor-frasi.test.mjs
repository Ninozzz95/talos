/*
 * REVISIONE AVVERSARIA di b90500cb0 (15/10/2026 sera, bugfixer) — «la frase del catalogo ha la sua chiave».
 * «[REGGE]» = attaccato, ha retto. «[ROSSO]» = difetto mostrato.
 *
 * DOCTOR-REV-01: la funzione spostata dice le STESSE cose della vecchia `diagnosiFn` (copiata qui parola per parola dal commit
 *   prima, server.mjs:920-930 di 2bd1b3e27) su tutta la matrice di ingressi, e cambia SOLO la chiave del messaggio del catalogo.
 * DOCTOR-REV-02: dal vivo — il server vero, su una porta sua (listen 0, owner 30/09), con un kernel che non espone il catalogo:
 *   l'errore è quello VERO dell'adattatore (`runtime-owner-adapter.mjs:1759`), non una copia della frase. La prova del commit
 *   costruisce l'errore a mano: se l'adattatore cambiasse una parola, la chiave sparirebbe in silenzio e quella prova resterebbe
 *   verde (mutante provato). Questa no.
 * DOCTOR-REV-03 [ROSSO]: lo stesso difetto curato, nella frase SORELLA. Se il kernel non si carica (`OWNER_RUNTIME_LOAD_FAILED`,
 *   l'altro errore che `taskCatalogProvider` può dare), sotto «Servizio agente» resta l'inglese anche in italiano — e una voce
 *   con la stessa frase inglese esiste già nel dizionario (`errori.kernel.runtimeNonDisponibile`, errori.js:1571). Owner 03/10:
 *   «ogni parola in inglese e italiano, non negoziabile».
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { statoDelServizioAgente } from '../src/doctor.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const RADICE = fileURLToPath(new URL('..', import.meta.url));

/* La funzione di PRIMA, parola per parola (server.mjs @ 2bd1b3e27, dentro `diagnosiFn`). */
function primaDelCommit({ configurato, snapshot, taskCatalogError }) {
  return {
    configurato,
    pronto: snapshot?.status === 'available',
    ...(snapshot?.status === 'available'
      ? { dettaglio: 'Agent runtime ready.', dettaglioChiave: 'server.doctor.runtime.ready' }
      : taskCatalogError?.message
        ? { dettaglio: taskCatalogError.message }
        : { dettaglio: 'The agent runtime is not ready for all the required features.', dettaglioChiave: 'server.doctor.runtime.notReady' }),
  };
}

const CATALOGO = 'The agent runtime does not expose the requested task catalog.';
const errore = (message, code) => Object.assign(new Error(message), code ? { code } : {});

test('DOCTOR-REV-01 [REGGE] — la funzione spostata dice le stesse cose di prima su tutta la matrice; cambia solo la chiave del catalogo', () => {
  const snapshots = [undefined, null, {}, { status: 'available' }, { status: 'unavailable', reason: 'x' }, { status: 'degraded' }, { status: 'AVAILABLE' }];
  const errori = [undefined, null, errore(CATALOGO, 'OWNER_RUNTIME_CONTRACT_INVALID'), errore(CATALOGO), errore(CATALOGO, 'OWNER_RUNTIME_LOAD_FAILED'),
    errore('The agent runtime is not available. Check the server configuration.', 'OWNER_RUNTIME_LOAD_FAILED'),
    errore('The agent runtime does not expose the requested operation (x).', 'OWNER_RUNTIME_CONTRACT_INVALID'),
    errore('', 'OWNER_RUNTIME_CONTRACT_INVALID'), { message: CATALOGO, code: 'OWNER_RUNTIME_CONTRACT_INVALID' }, { code: 'X' }, errore(`${CATALOGO} `, 'OWNER_RUNTIME_CONTRACT_INVALID')];
  let casi = 0; let conChiaveNuova = 0;
  for (const configurato of [true, false]) for (const snapshot of snapshots) for (const taskCatalogError of errori) {
    const prima = primaDelCommit({ configurato, snapshot, taskCatalogError });
    const dopo = statoDelServizioAgente({ configurato, snapshot, taskCatalogError });
    const atteso = { ...prima };
    const catalogoVero = snapshot?.status !== 'available' && taskCatalogError?.code === 'OWNER_RUNTIME_CONTRACT_INVALID' && taskCatalogError?.message === CATALOGO;
    if (catalogoVero) { atteso.dettaglioChiave = 'server.doctor.runtime.noTaskCatalog'; conChiaveNuova += 1; }
    /* cura di DOCTOR-REV-03 (15/10): anche il kernel che non si carica ha la sua chiave, alle stesse condizioni (codice + frase esatta) */
    const caricamentoVero = snapshot?.status !== 'available' && taskCatalogError?.code === 'OWNER_RUNTIME_LOAD_FAILED' && taskCatalogError?.message === 'The agent runtime is not available. Check the server configuration.';
    if (caricamentoVero) { atteso.dettaglioChiave = 'server.doctor.runtime.unavailable'; conChiaveNuova += 1; }
    assert.deepEqual(dopo, atteso, JSON.stringify({ configurato, snapshot, taskCatalogError: taskCatalogError && { m: taskCatalogError.message, c: taskCatalogError.code } }));
    casi += 1;
  }
  assert.equal(casi, 2 * snapshots.length * errori.length);
  assert.equal(conChiaveNuova, 2 * 6 * 3, 'due ingressi esatti del catalogo e uno del caricamento: le due chiavi nuove solo per il messaggio esatto col suo codice, e mai quando il servizio è pronto');
});

async function portaLibera() {
  const s = createServer();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}

/** Il server vero, in una cartella di prova, col kernel scritto qui; ritorna il Doctor della rotta. */
async function doctorDalVivo(t, sorgenteDelKernel) {
  const radice = cartellaDiProva('talos-doctor-rev-');
  const temp = join(radice, 'temp');
  mkdirSync(temp, { recursive: true });
  mkdirSync(join(radice, 'workspace'), { recursive: true });
  const kernel = join(radice, 'kernel-di-prova.mjs');
  writeFileSync(kernel, sorgenteDelKernel);
  const porta = await portaLibera();
  const env = {
    ...process.env,
    TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: '',
    TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
    TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'), TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_SCRATCH_DIR: join(radice, 'scratch'),
    TEMP: temp, TMP: temp, TMPDIR: temp, TALOS_OWNER_RUNTIME_MODULE: kernel,
  };
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  t.after(() => { figlio.kill(); });
  let scritto = '';
  figlio.stdout.on('data', (c) => { scritto += c; });
  figlio.stderr.on('data', (c) => { scritto += c; });
  for (let i = 0; i < 300 && figlio.exitCode === null && !/Harness UI disponibile/u.test(scritto); i += 1) await delay(100);
  assert.match(scritto, /Harness UI disponibile/u, `il server non è partito: ${scritto.slice(-1500)}`);
  const risposta = await fetch(`http://127.0.0.1:${porta}/api/v1/doctor`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  return corpo.data ?? corpo;
}

test('DOCTOR-REV-02 [REGGE] — dal vivo: un kernel senza catalogo ⇒ la rotta del Doctor porta la frase VERA dell’adattatore con la chiave nuova', async (t) => {
  const r = await doctorDalVivo(t, 'export async function talosLavora() { return null; }\n');
  assert.deepEqual(r.ownerRuntime, {
    configurato: true, pronto: false, dettaglio: CATALOGO, dettaglioChiave: 'server.doctor.runtime.noTaskCatalog',
  });
  assert.equal(r.catalogoTask?.dettaglioChiave, 'server.doctor.catalog.unavailable');
});

test('DOCTOR-REV-03 [ROSSO] — dal vivo: un kernel che non si carica ⇒ «Servizio agente» resta in inglese anche in italiano (la frase sorella)', async (t) => {
  const r = await doctorDalVivo(t, 'export const rotto = ;\n');
  assert.equal(r.ownerRuntime?.pronto, false);
  assert.equal(r.ownerRuntime?.dettaglio, 'The agent runtime is not available. Check the server configuration.', JSON.stringify(r.ownerRuntime));
  assert.equal(typeof r.ownerRuntime?.dettaglioChiave, 'string',
    'la frase del kernel che non si carica arriva senza chiave: in italiano il Doctor la mostra in inglese (stessa classe del difetto curato)');
});

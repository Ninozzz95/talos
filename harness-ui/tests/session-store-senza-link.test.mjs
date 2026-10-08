/*
 * EXFAT — sessioni su dischi senza hard link (23/09/2026, decisione owner «ripiego sicuro»).
 *
 * Su questa macchina esistono solo volumi NTFS: il file system senza link si SIMULA iniettando
 * una `linkSyncFn` che fallisce coi codici che Node restituisce davvero su quei dischi:
 * - EISDIR su exFAT (libuv traduce ERROR_INVALID_FUNCTION, nodejs/node#65817, 05/09/2026);
 * - EPERM / EXDEV (lista di ripiego di Netcatty PR #3484, 22/09/2026).
 * ⛔ Nessuna prova su un exFAT vero: vedi il rapporto della corsia.
 */
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import * as sessionStore from '../src/session-store.mjs';
import { toPublicProblem } from '../src/public-problem.mjs';

const { elencaSessioniPersistite, leggiRegistro, registraIntestazioneSync, registraRiga } = sessionStore;

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-exfat-'));
}

function linkCheFallisce(code, conta = { n: 0 }) {
  return () => {
    conta.n += 1;
    throw Object.assign(new Error(`${code}: operazione non supportata, link`), { code });
  };
}

function loggerMuto() {
  const righe = [];
  return { righe, warn: (riga) => righe.push(String(riga)), error: (riga) => righe.push(String(riga)) };
}

function intestazione(sessionId) {
  return { tipo: 'intestazione', sessionId, task: 'consegna' };
}

for (const code of ['EISDIR', 'EPERM', 'EXDEV']) {
  test(`EXFAT-FALLBACK-BIRTH-${code} — senza link la sessione nasce con creazione esclusiva e byte verificati`, async () => {
    const cartellaStore = cartellaVera();
    const sessionId = `sess-exfat-${code.toLowerCase()}`;
    const logger = loggerMuto();
    try {
      registraIntestazioneSync(
        { cartellaStore, sessionId, record: intestazione(sessionId) },
        { linkSyncFn: linkCheFallisce(code), logger },
      );
      assert.equal(readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8'), `${JSON.stringify(intestazione(sessionId))}\n`);
      // Nessun alias `.pending` e nessun residuo della prova del link.
      assert.deepEqual(readdirSync(cartellaStore), [`${sessionId}.jsonl`]);
      assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), [sessionId]);
      assert.equal(sessionStore.modalitaPubblicazioneIntestazione(cartellaStore), 'senza-link');
      // Annunciata nel registro del server, senza percorsi.
      assert.equal(logger.righe.length, 1);
      assert.match(logger.righe[0], /without links/i);
      assert.doesNotMatch(logger.righe[0], /talos-exfat-/);
      // Il journal resta appendibile dopo la nascita.
      await registraRiga({ cartellaStore, sessionId, record: { type: 'TextMessageContent', delta: 'ciao' } });
      assert.equal((await leggiRegistro({ cartellaStore, sessionId })).length, 2);
    } finally { rimuoviCartellaDiProva(cartellaStore); }
  });
}

test('EXFAT-PROBE-ONCE — la prova del link si fa una volta per cartella e si annuncia una volta', () => {
  const cartellaStore = cartellaVera();
  const conta = { n: 0 };
  const logger = loggerMuto();
  try {
    for (const sessionId of ['sess-uno', 'sess-due', 'sess-tre']) {
      registraIntestazioneSync({ cartellaStore, sessionId, record: intestazione(sessionId) },
        { linkSyncFn: linkCheFallisce('EISDIR', conta), logger });
    }
    assert.equal(conta.n, 1, 'una sola prova del link per cartella');
    assert.equal(logger.righe.length, 1, 'annuncio una volta sola');
    assert.deepEqual(readdirSync(cartellaStore).sort(), ['sess-due.jsonl', 'sess-tre.jsonl', 'sess-uno.jsonl']);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-PROBE-NTFS — su un disco coi link la modalità resta quella B2 e la prova non lascia residui', () => {
  const cartellaStore = cartellaVera();
  const conta = { n: 0 };
  try {
    registraIntestazioneSync({ cartellaStore, sessionId: 'sess-ntfs', record: intestazione('sess-ntfs') },
      { linkSyncFn: (a, b) => { conta.n += 1; linkSync(a, b); }, logger: loggerMuto() });
    assert.equal(sessionStore.modalitaPubblicazioneIntestazione(cartellaStore), 'link');
    // La prova è il primo link vero, fatto sul file di staging nella cartella dell'archivio.
    assert.equal(conta.n, 1, 'la pubblicazione stessa fa da prova');
    assert.deepEqual(readdirSync(cartellaStore), ['sess-ntfs.jsonl']);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-READBACK-CORRUPT — la rilettura che trova byte diversi ferma la sessione e toglie il file', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-corrotta';
  try {
    assert.throws(() => registraIntestazioneSync(
      { cartellaStore, sessionId, record: intestazione(sessionId) },
      {
        linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(),
        readFileSyncFn: (path) => {
          const bytes = readFileSync(path);
          if (path.endsWith('.jsonl')) bytes[bytes.length - 3] ^= 0x20; // un byte cambiato dal disco
          return bytes;
        },
      },
    ), (errore) => errore?.code === 'SESSION_STORE_HEADER_FAILED' && /rilett|byte/i.test(errore.message));
    assert.deepEqual(readdirSync(cartellaStore), []);
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-READBACK-UNVERIFIABLE-QUARANTINE — rilettura e rimozione fallite: il finale resta in quarantena, mai sessione al replay', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-incerta';
  try {
    assert.throws(() => registraIntestazioneSync(
      { cartellaStore, sessionId, record: intestazione(sessionId) },
      {
        linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(),
        readFileSyncFn: (path) => { if (path.endsWith('.jsonl')) throw Object.assign(new Error('read EIO'), { code: 'EIO' }); return readFileSync(path); },
        unlinkSyncFn: (path) => { if (path.endsWith('.jsonl')) throw Object.assign(new Error('unlink EBUSY'), { code: 'EBUSY' }); unlinkSync(path); },
      },
    ));
    // Il file c'è ed è una testata valida: senza quarantena il replay lo caricherebbe.
    assert.ok(readdirSync(cartellaStore).includes(`${sessionId}.jsonl`));
    const indice = await elencaSessioniPersistite({ cartellaStore, conDiagnostica: true });
    assert.deepEqual(indice.sessionIds, []);
    assert.deepEqual(indice.quarantined, [{ sessionId, motivo: 'intestazione-in-quarantena' }]);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-PARTIAL-WRITE — una scrittura parziale del finale non diventa sessione e non lascia file', async () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-parziale';
  try {
    assert.throws(() => registraIntestazioneSync(
      { cartellaStore, sessionId, record: intestazione(sessionId) },
      {
        linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(),
        writeFileSyncFn: (path, data, options) => {
          if (!path.endsWith('.jsonl')) return writeFileSync(path, data, options);
          writeFileSync(path, Buffer.from(data).subarray(0, 7), options);
          throw Object.assign(new Error('write EIO'), { code: 'EIO' });
        },
      },
    ));
    assert.deepEqual(readdirSync(cartellaStore), []);
    assert.deepEqual(await elencaSessioniPersistite({ cartellaStore }), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-EXISTING-NEVER-OVERWRITTEN — un finale già presente non si sovrascrive, nemmeno se compare dopo il controllo', () => {
  const cartellaStore = cartellaVera();
  const sessionId = 'sess-esistente';
  const finale = join(cartellaStore, `${sessionId}.jsonl`);
  const precedente = '{"tipo":"intestazione","sessionId":"precedente"}\n';
  try {
    // La cartella è già nota «senza link» (una sessione è nata col ripiego): si prova il ripiego, non B2.
    registraIntestazioneSync({ cartellaStore, sessionId: 'sess-apri', record: intestazione('sess-apri') },
      { linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto() });
    assert.equal(sessionStore.modalitaPubblicazioneIntestazione(cartellaStore), 'senza-link');
    writeFileSync(finale, precedente);
    // 1) presente prima del controllo
    assert.throws(() => registraIntestazioneSync({ cartellaStore, sessionId, record: intestazione(sessionId) },
      { linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto() }), { code: 'SESSION_STORE_HEADER_EXISTS' });
    // 2) comparso fra il controllo e la creazione (il controllo dice «assente»)
    assert.throws(() => registraIntestazioneSync({ cartellaStore, sessionId, record: intestazione(sessionId) },
      { linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(), existsSyncFn: () => false }), { code: 'SESSION_STORE_HEADER_EXISTS' });
    assert.equal(readFileSync(finale, 'utf8'), precedente);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-FALLBACK-FAILS-TRUE-CAUSE — se anche il ripiego fallisce il messaggio dice la causa vera', () => {
  const cartellaStore = cartellaVera();
  const scritturaFinaleCheFallisce = (code) => (path, data, options) => {
    if (!path.endsWith('.jsonl')) return writeFileSync(path, data, options);
    throw Object.assign(new Error(`${code}: finale`), { code });
  };
  try {
    let erroreNonSupportato;
    assert.throws(() => registraIntestazioneSync({ cartellaStore, sessionId: 'sess-nonsupp', record: intestazione('sess-nonsupp') },
      { linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(), writeFileSyncFn: scritturaFinaleCheFallisce('ENOTSUP') }),
    (errore) => { erroreNonSupportato = errore; return true; });
    assert.equal(erroreNonSupportato.code, 'SESSION_STORE_FS_UNSUPPORTED');
    const pubblico = toPublicProblem(erroreNonSupportato, { requestId: 'r', operation: 'new-session' });
    assert.match(`${pubblico.explanation} ${pubblico.action}`, /disco|file system/i);
    assert.match(pubblico.action, /NTFS|disco interno/i);
    assert.doesNotMatch(JSON.stringify(pubblico), /spazio|permess/i);

    let erroreSpazio;
    assert.throws(() => registraIntestazioneSync({ cartellaStore, sessionId: 'sess-pieno', record: intestazione('sess-pieno') },
      { linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(), writeFileSyncFn: scritturaFinaleCheFallisce('ENOSPC') }),
    (errore) => { erroreSpazio = errore; return true; });
    assert.equal(erroreSpazio.code, 'SESSION_STORE_HEADER_FAILED');
    assert.equal(erroreSpazio.causa, 'spazio');
    assert.deepEqual(readdirSync(cartellaStore), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('EXFAT-HEADER-FAILED-COPY — il messaggio generico non afferma spazio o permessi come causa', () => {
  const pubblico = toPublicProblem(Object.assign(new Error('x'), { code: 'SESSION_STORE_HEADER_FAILED' }), { requestId: 'r', operation: 'new-session' });
  assert.doesNotMatch(JSON.stringify(pubblico), /Controlla spazio e permessi/i);
  assert.match(pubblico.action, /Doctor|riprova/i);
});

test('EXFAT-PROBE-UNKNOWN-ERROR — un errore del link che non dice «non supportato» non attiva il ripiego né si memorizza', () => {
  const cartellaStore = cartellaVera();
  try {
    // Resta il fail-closed di B2: l'errore originale risale (il registro lo logga col suo codice).
    assert.throws(() => registraIntestazioneSync({ cartellaStore, sessionId: 'sess-eio', record: intestazione('sess-eio') },
      { linkSyncFn: linkCheFallisce('EIO'), logger: loggerMuto() }), { code: 'EIO' });
    assert.equal(sessionStore.modalitaPubblicazioneIntestazione(cartellaStore), null);
    assert.deepEqual(readdirSync(cartellaStore), []);
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

/*
 * Il giro vero col registro: nascita col ripiego, modello avviato, poi un «riavvio» (registro nuovo
 * sulla stessa cartella) che ripristina la sessione. E i due residui di un crash su exFAT (finale
 * vuoto, riga spezzata) che al ripristino devono restare fuori, non diventare sessioni.
 */
function preparaEsecuzioneFinta(taskId) {
  return { cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

function sessioneControllabile() {
  let risolvi;
  const attesa = new Promise((r) => { risolvi = r; });
  let onEvento = null;
  let chiamate = 0;
  return {
    avviaSessioneFn: async (input) => {
      chiamate += 1;
      onEvento = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return attesa;
    },
    concludi() { onEvento?.({ type: 'RunFinished' }); risolvi({ ok: true }); },
    get chiamate() { return chiamate; },
  };
}

test('EXFAT-REGISTRY-REPLAY — sessione nata senza link riparte dopo il riavvio; i residui di crash no', async () => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const cartellaStore = cartellaVera();
  const giro = sessioneControllabile();
  try {
    const registro = createSessionRegistry({
      cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {},
      preparaEsecuzioneFn: preparaEsecuzioneFinta, avviaSessioneFn: giro.avviaSessioneFn,
      registraIntestazioneSyncFn: (input) => registraIntestazioneSync(input, { linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto() }),
    });
    const esito = registro.avvia('task-vero');
    assert.equal(esito.code, undefined, JSON.stringify(esito));
    assert.equal(typeof esito.sessionId, 'string');
    assert.equal(giro.chiamate, 1);
    assert.equal(sessionStore.modalitaPubblicazioneIntestazione(cartellaStore), 'senza-link');
    giro.concludi();
    await new Promise((r) => setTimeout(r, 50));
    // Residui di un crash a metà scrittura su un disco senza giornale.
    writeFileSync(join(cartellaStore, 'sess-crash-vuota.jsonl'), '');
    writeFileSync(join(cartellaStore, 'sess-crash-spezzata.jsonl'), '{"tipo":"intestazione","sessi');
    const riavvio = createSessionRegistry({ cartellaStore, guardaWorkspaceFn: () => () => {} });
    const conto = await riavvio.ripristina();
    assert.deepEqual(riavvio.elenca().map((s) => s.sessionId), [esito.sessionId]);
    assert.equal(conto.ripristinate, 1);
    assert.ok(!readdirSync(cartellaStore).some((n) => n.endsWith('.pending')));
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('EXFAT-REGISTRY-FAIL-CLOSED — se anche il ripiego fallisce nessun modello parte e nessuna sessione torna', async () => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const cartellaStore = cartellaVera();
  const giro = sessioneControllabile();
  try {
    const registro = createSessionRegistry({
      cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {},
      preparaEsecuzioneFn: preparaEsecuzioneFinta, avviaSessioneFn: giro.avviaSessioneFn,
      registraIntestazioneSyncFn: (input) => registraIntestazioneSync(input, {
        linkSyncFn: linkCheFallisce('EISDIR'), logger: loggerMuto(),
        writeFileSyncFn: (path, data, options) => {
          if (!path.endsWith('.jsonl')) return writeFileSync(path, data, options);
          throw Object.assign(new Error('ENOTSUP: finale'), { code: 'ENOTSUP' });
        },
      }),
    });
    const esito = registro.avvia('task-vero');
    assert.equal(esito.code, 'SESSION_STORE_FS_UNSUPPORTED' /* 24/09: il registro propaga il codice del negozio, non appiattisce più */);
    assert.equal(esito.sessionId, undefined);
    assert.equal(giro.chiamate, 0);
    assert.deepEqual(registro.elenca(), []);
    const riavvio = createSessionRegistry({ cartellaStore, guardaWorkspaceFn: () => () => {} });
    await riavvio.ripristina();
    assert.deepEqual(riavvio.elenca(), []);
    assert.deepEqual(readdirSync(cartellaStore), []);
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/*
 * 24/09/2026 — F2, corsia STORE: flush del negozio (`attendiScritture`), riparazione automatica e dichiarata di una
 * coda spezzata (decisione owner 7 del 24/09: backup `.bak` + troncamento all'ultimo `\n`, mai silenziosa), e la
 * distinzione fra un errore TRANSITORIO (EBUSY/EPERM/EAGAIN senza byte scritti) e un append PARZIALE.
 * Tutti RED sulla base `e2eb2a5ce` (misurato prima della cura, vedi RAPPORTO-F2-STORE.md §2).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as sessionStore from '../src/session-store.mjs';
import { leggiRegistro, registraRiga, registraRigaSync } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaTemporanea(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-store-flush-rip-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const backupDi = (cartellaStore, sessionId) => readdirSync(cartellaStore).filter((n) => n.startsWith(`${sessionId}.jsonl.bak-`));

// ───────────────────────────── 1. attendiScritture ─────────────────────────────

test('CTX-STORE-FLUSH-DRAINS-CHAINED — una scrittura che ne accoda un altra durante il flush: al ritorno il file le ha tutte e due', async (t) => {
  assert.equal(typeof sessionStore.attendiScritture, 'function', 'attendiScritture deve essere esportata');
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'flush-chained';
  let libera;
  const attesa = new Promise((resolve) => { libera = resolve; });
  const prima = registraRiga(
    { cartellaStore, sessionId, record: { tipo: 'prima' } },
    { appendFileFn: async (path, data, options) => { await attesa; return appendFile(path, data, options); } },
  );
  // La seconda nasce DENTRO la continuazione della prima: al momento del flush non è ancora in coda.
  const seconda = prima.then(() => registraRiga({ cartellaStore, sessionId, record: { tipo: 'seconda' } }));
  const flush = sessionStore.attendiScritture({ cartellaStore, sessionId });
  libera();
  const esito = await flush;
  assert.equal(readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8'), '{"tipo":"prima"}\n{"tipo":"seconda"}\n');
  assert.ok(esito.giri >= 2, `il flush deve aver fatto almeno due giri, ne ha fatti ${esito.giri}`);
  await seconda;
});

test('CTX-STORE-FLUSH-EMPTY-IS-IMMEDIATE — senza scritture in volo il flush torna subito con zero attese', async () => {
  const esito = await sessionStore.attendiScritture({ cartellaStore: join(tmpdir(), 'inesistente-f2'), sessionId: 'nessuna' });
  assert.equal(esito.scrittureAttese, 0);
});

test('CTX-STORE-FLUSH-SCOPES-BY-FOLDER — il flush di una cartella non aspetta le scritture di un altra', async (t) => {
  const cartellaA = cartellaTemporanea(t);
  const cartellaB = cartellaTemporanea(t);
  let liberaB;
  const attesaB = new Promise((resolve) => { liberaB = resolve; });
  const lentaB = registraRiga(
    { cartellaStore: cartellaB, sessionId: 'lenta', record: { tipo: 'b' } },
    { appendFileFn: async (path, data, options) => { await attesaB; return appendFile(path, data, options); } },
  );
  const velocissimaA = registraRiga({ cartellaStore: cartellaA, sessionId: 'veloce', record: { tipo: 'a' } });
  const esitoA = await sessionStore.attendiScritture({ cartellaStore: cartellaA });
  assert.equal(esitoA.scrittureAttese, 1);
  assert.equal(readFileSync(join(cartellaA, 'veloce.jsonl'), 'utf8'), '{"tipo":"a"}\n');
  liberaB();
  await Promise.all([lentaB, velocissimaA]);
  const tutto = await sessionStore.attendiScritture();
  assert.equal(tutto.scrittureAttese, 0);
});

test('CTX-STORE-FLUSH-GIVES-UP — una coda che non si svuota mai esaurisce il tetto di giri con un errore chiaro', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'flush-infinito';
  let ferma = false;
  const catena = async () => {
    if (ferma) return;
    await registraRiga({ cartellaStore, sessionId, record: { tipo: 'ancora' } });
    return catena();
  };
  const infinita = catena();
  await assert.rejects(
    () => sessionStore.attendiScritture({ cartellaStore, sessionId, giriMassimi: 5 }),
    (errore) => errore?.code === 'SESSION_STORE_FLUSH_EXHAUSTED' && /5/.test(errore.message),
  );
  ferma = true;
  await infinita;
  await sessionStore.attendiScritture({ cartellaStore, sessionId });
});

// ───────────────────────────── 2. riparazione della coda spezzata ─────────────────────────────

const PREFISSO_SANO = '{"tipo":"intestazione","sessionId":"s"}\n{"tipo":"evento","n":1}\n';

test('CTX-STORE-TORN-TAIL-EXPLICIT-REPAIR — leggiRegistro ripara da sola la coda spezzata, lo dichiara, e le scritture dopo riescono', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'torn-tail';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const spezzato = `${PREFISSO_SANO}{"tipo":"messaggi-finali","messaggiFinali":[{"role":"user","content":"a metà`;
  writeFileSync(percorso, spezzato);
  const letto = await leggiRegistro({ cartellaStore, sessionId });
  assert.deepEqual(letto, [{ tipo: 'intestazione', sessionId: 's' }, { tipo: 'evento', n: 1 }]);
  assert.equal(letto.riparazione?.riparato, true, 'il risultato porta il record di riparazione');
  assert.equal(letto.riparazione.righeScartate, 1);
  assert.equal(letto.riparazione.byteScartati, Buffer.byteLength(spezzato) - Buffer.byteLength(PREFISSO_SANO));
  assert.equal(readFileSync(percorso, 'utf8'), PREFISSO_SANO, 'il journal è troncato all ultimo newline');
  // Le tre scritture riescono: async, sync, confermata.
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'dopo-async' } });
  registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'dopo-sync' } });
  await sessionStore.registraRigaConfermata({ cartellaStore, sessionId, record: { tipo: 'dopo-confermata' } });
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((r) => r.tipo),
    ['intestazione', 'evento', 'dopo-async', 'dopo-sync', 'dopo-confermata']);
});

test('CTX-STORE-REPAIR-KEEPS-BACKUP — il .bak contiene i byte originali (sha256 uguale al file prima), il temporaneo sparisce', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'torn-backup';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const originale = Buffer.from(`${PREFISSO_SANO}{"tipo":"checkpoint-ripresa","messaggi":[{"role":"assist`, 'utf8');
  writeFileSync(percorso, originale);
  const impronta = sha256(originale);
  const letto = await leggiRegistro({ cartellaStore, sessionId });
  assert.equal(letto.riparazione?.riparato, true);
  const backup = backupDi(cartellaStore, sessionId);
  assert.equal(backup.length, 1, `atteso un solo .bak, trovati: ${backup.join(', ')}`);
  assert.equal(letto.riparazione.backup, join(cartellaStore, backup[0]));
  assert.equal(sha256(readFileSync(letto.riparazione.backup)), impronta);
  assert.ok(!readdirSync(cartellaStore).some((n) => n.includes('.riparazione')), 'nessun temporaneo rimasto');
  assert.equal(sha256(readFileSync(percorso)), sha256(Buffer.from(PREFISSO_SANO, 'utf8')));
  // Il backup non è una sessione: il replay elenca solo il journal (il nome non finisce in `.jsonl`).
  assert.deepEqual(await sessionStore.elencaSessioniPersistite({ cartellaStore }), [sessionId]);
});

test('CTX-STORE-REPAIR-EXPLICIT-API — riparaCodaSpezzata su un percorso spezzato ritorna il record e toglie il blocco agli append', async (t) => {
  assert.equal(typeof sessionStore.riparaCodaSpezzata, 'function');
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'torn-explicit';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(percorso, `${PREFISSO_SANO}{"tipo":"mezza`);
  // Il writer freddo la avvelena (comportamento di oggi, invariato)…
  await assert.rejects(() => registraRiga({ cartellaStore, sessionId, record: { tipo: 'vietato' } }), (e) => e?.code === 'SESSION_STORE_AMBIGUOUS');
  // …la riparazione esplicita la sblocca.
  const esito = await sessionStore.riparaCodaSpezzata({ percorso });
  assert.equal(esito.riparato, true);
  assert.equal(esito.righeScartate, 1);
  assert.equal(esito.byteScartati, Buffer.byteLength('{"tipo":"mezza'));
  assert.ok(esito.backup.endsWith('.jsonl.bak-' + esito.backup.split('.jsonl.bak-')[1]));
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'permesso' } });
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((r) => r.tipo), ['intestazione', 'evento', 'permesso']);
});

test('⛔ AL CONTRARIO — CTX-STORE-REPAIR-HEALTHY-NOOP: file sano ⇒ nessun .bak, nessuna riparazione, byte identici', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'sano';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(percorso, PREFISSO_SANO);
  const prima = sha256(readFileSync(percorso));
  const letto = await leggiRegistro({ cartellaStore, sessionId });
  assert.equal(letto.length, 2);
  assert.equal(letto.riparazione, undefined);
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
  const esplicita = await sessionStore.riparaCodaSpezzata({ percorso });
  assert.equal(esplicita.riparato, false);
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
  assert.equal(sha256(readFileSync(percorso)), prima);
  // Un file vuoto e un file assente non sono «spezzati».
  writeFileSync(join(cartellaStore, 'vuoto.jsonl'), '');
  assert.equal((await sessionStore.riparaCodaSpezzata({ percorso: join(cartellaStore, 'vuoto.jsonl') })).riparato, false);
  assert.equal((await sessionStore.riparaCodaSpezzata({ percorso: join(cartellaStore, 'assente.jsonl') })).riparato, false);
});

test('CTX-STORE-REPAIR-VALID-TAIL-COMPLETES — un ultima riga JSON valida senza newline NON è spezzata: si completa con \\n, non si scarta', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'valid-tail';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(percorso, `${PREFISSO_SANO}{"tipo":"messaggi-finali","messaggiFinali":[]}`);
  const letto = await leggiRegistro({ cartellaStore, sessionId });
  assert.deepEqual(letto.map((r) => r.tipo), ['intestazione', 'evento', 'messaggi-finali'], 'il record valido resta');
  assert.equal(letto.riparazione?.riparato, true);
  assert.equal(letto.riparazione.completata, true);
  assert.equal(letto.riparazione.righeScartate, 0);
  assert.equal(letto.riparazione.byteScartati, 0);
  assert.equal(readFileSync(percorso, 'utf8'), `${PREFISSO_SANO}{"tipo":"messaggi-finali","messaggiFinali":[]}\n`);
  assert.deepEqual(backupDi(cartellaStore, sessionId), [], 'niente da scartare ⇒ niente backup');
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'dopo' } });
  assert.equal((await leggiRegistro({ cartellaStore, sessionId })).length, 4);
});

test('CTX-STORE-REPAIR-TERMINATED-BROKEN-LAST-LINE — ultima riga rotta ma terminata da newline: si scarta quella sola riga', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'broken-lf';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(percorso, `${PREFISSO_SANO}{"tipo":\n`);
  const letto = await leggiRegistro({ cartellaStore, sessionId });
  assert.deepEqual(letto.map((r) => r.tipo), ['intestazione', 'evento']);
  assert.equal(letto.riparazione?.riparato, true);
  assert.equal(letto.riparazione.righeScartate, 1);
  assert.equal(letto.riparazione.byteScartati, Buffer.byteLength('{"tipo":\n'));
  assert.equal(readFileSync(percorso, 'utf8'), PREFISSO_SANO);
  assert.equal(backupDi(cartellaStore, sessionId).length, 1);
});

test('⛔ AL CONTRARIO — CTX-STORE-REPAIR-NEVER-MID-FILE: una riga rotta NON ultima resta un errore SESSION_STORE_CORRUPT, nessun .bak', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'corrotto-in-mezzo';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const contenuto = '{"tipo":"intestazione"}\n{"tipo":"rot\n{"tipo":"fine"}\n';
  writeFileSync(percorso, contenuto);
  await assert.rejects(() => leggiRegistro({ cartellaStore, sessionId }), (e) => e?.code === 'SESSION_STORE_CORRUPT');
  assert.equal(readFileSync(percorso, 'utf8'), contenuto);
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
});

test('CTX-STORE-REPAIR-FAILURE-KEEPS-POISON — se il backup non si può scrivere, la lettura resta valida ma la coda resta incerta e lo dice', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'repair-fails';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const spezzato = `${PREFISSO_SANO}{"tipo":"mezza`;
  writeFileSync(percorso, spezzato);
  const letto = await leggiRegistro({ cartellaStore, sessionId }, { copyFileFn: async () => { const e = new Error('disco pieno'); e.code = 'ENOSPC'; throw e; } });
  assert.deepEqual(letto.map((r) => r.tipo), ['intestazione', 'evento']);
  assert.equal(letto.riparazione?.riparato, false);
  assert.match(letto.riparazione.errore, /ENOSPC|disco pieno/);
  assert.equal(readFileSync(percorso, 'utf8'), spezzato, 'senza backup non si tronca niente');
  await assert.rejects(() => registraRiga({ cartellaStore, sessionId, record: { tipo: 'vietato' } }), (e) => e?.code === 'SESSION_STORE_AMBIGUOUS');
});

// ───────────────────────────── 3. transitorio ≠ avvelenato ─────────────────────────────

function erroreCodice(codice) { const e = new Error(`${codice}: simulato`); e.code = codice; return e; }

for (const codice of ['EBUSY', 'EPERM', 'EAGAIN']) {
  test(`CTX-STORE-TRANSIENT-${codice}-NOT-POISON — un ${codice} senza byte scritti si propaga ma NON avvelena: il tentativo dopo riesce`, async (t) => {
    const cartellaStore = cartellaTemporanea(t);
    const sessionId = `transitorio-${codice.toLowerCase()}`;
    let chiamate = 0;
    const appendFileFn = async (path, data, options) => { if (++chiamate === 1) throw erroreCodice(codice); return appendFile(path, data, options); };
    await registraRiga({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
    await assert.rejects(() => registraRiga({ cartellaStore, sessionId, record: { tipo: 'primo' } }, { appendFileFn }), (e) => e?.code === codice);
    await registraRiga({ cartellaStore, sessionId, record: { tipo: 'secondo' } }, { appendFileFn });
    registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'terzo' } });
    assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((r) => r.tipo), ['intestazione', 'secondo', 'terzo']);
  });
}

test('CTX-STORE-TRANSIENT-SYNC-NOT-POISON — lo stesso per il writer sincrono', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'transitorio-sync';
  registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
  assert.throws(() => registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'primo' } }, { appendFileSyncFn: () => { throw erroreCodice('EBUSY'); } }), (e) => e?.code === 'EBUSY');
  registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'secondo' } });
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((r) => r.tipo), ['intestazione', 'secondo']);
});

test('⛔ AL CONTRARIO — CTX-STORE-PARTIAL-EBUSY-POISONS: un EBUSY DOPO byte parziali avvelena come oggi', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'parziale-ebusy';
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'intestazione' } });
  await assert.rejects(() => registraRiga(
    { cartellaStore, sessionId, record: { tipo: 'primo', payload: 'y'.repeat(64) } },
    { appendFileFn: async (path, data) => { appendFileSync(path, data.slice(0, 10)); throw erroreCodice('EBUSY'); } },
  ), (e) => e?.code === 'EBUSY');
  await assert.rejects(() => registraRiga({ cartellaStore, sessionId, record: { tipo: 'secondo' } }), (e) => e?.code === 'SESSION_STORE_AMBIGUOUS');
  assert.throws(() => registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'terzo' } }), (e) => e?.code === 'SESSION_STORE_AMBIGUOUS');
});

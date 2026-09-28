/*
 * 24/09/2026 — F2, corsia STORE. I due RED di Codex (`tests/red/session-store-sync-async-red.test.mjs`, 0/2 sulla
 * base `e2eb2a5ce`) promossi qui, sotto la politica esplicita `impostaPoliticaScritturaSync('busy')`.
 *
 * ⛔ Perché una POLITICA e non una guardia fissa: il ledger Codex aveva misurato una guardia BUSY isolata sul sync
 *   incompatibile coi chiamanti del registro (390 test). L'onda 1 va sul 4174 PRIMA che l'onda 2 migri quei
 *   chiamanti ⇒ il default resta `'scavalca'` (comportamento di oggi) e chi vuole il writer unico lo chiede.
 *   L'onda 2 capovolge il default quando i chiamanti del registro reggono `SESSION_STORE_BUSY`.
 */
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as sessionStore from '../src/session-store.mjs';
import { leggiRegistro, registraRiga, registraRigaSync } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaTemporanea(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-store-sync-policy-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

function conPoliticaBusy(t) {
  assert.equal(typeof sessionStore.impostaPoliticaScritturaSync, 'function', 'impostaPoliticaScritturaSync deve esistere');
  const precedente = sessionStore.impostaPoliticaScritturaSync('busy');
  t.after(() => sessionStore.impostaPoliticaScritturaSync(precedente));
}

test('CTX-STORE-SYNC-LEAPFROGS-QUEUED — con politica busy il sync rifiuta un async gia prenotato senza mutare il file', async (t) => {
  conPoliticaBusy(t);
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'sync-queued-race';
  let libera;
  const attesa = new Promise((resolve) => { libera = resolve; });
  const primo = registraRiga(
    { cartellaStore, sessionId, record: { tipo: 'evento-prima' } },
    { appendFileFn: async (path, data, options) => { await attesa; return appendFile(path, data, options); } },
  );
  let erroreSync = null;
  try { registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'checkpoint-dopo' } }); }
  catch (errore) { erroreSync = errore; }
  libera();
  await primo;
  assert.equal(erroreSync?.code, 'SESSION_STORE_BUSY');
  await new Promise((resolve) => setImmediate(resolve));
  registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'checkpoint-dopo' } });
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((riga) => riga.tipo), ['evento-prima', 'checkpoint-dopo']);
});

test('CTX-STORE-SYNC-DURING-PARTIAL-ASYNC — con politica busy BUSY non avvelena un prefisso in-flight', async (t) => {
  conPoliticaBusy(t);
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'sync-partial-race';
  let segnalaPrefisso;
  const prefisso = new Promise((resolve) => { segnalaPrefisso = resolve; });
  let libera;
  const attesa = new Promise((resolve) => { libera = resolve; });
  const primo = registraRiga(
    { cartellaStore, sessionId, record: { tipo: 'evento-prima', payload: 'x'.repeat(4096) } },
    { appendFileFn: async (path, data) => {
      const meta = Math.floor(data.length / 2);
      appendFileSync(path, data.slice(0, meta));
      segnalaPrefisso();
      await attesa;
      appendFileSync(path, data.slice(meta));
    } },
  );
  await prefisso;
  let erroreSync = null;
  try { registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'checkpoint-dopo' } }); }
  catch (errore) { erroreSync = errore; }
  libera();
  await primo;
  assert.equal(erroreSync?.code, 'SESSION_STORE_BUSY');
  await new Promise((resolve) => setImmediate(resolve));
  registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'checkpoint-dopo' } });
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((riga) => riga.tipo), ['evento-prima', 'checkpoint-dopo']);
});

test('CTX-STORE-SYNC-POLICY-DEFAULT-SCAVALCA — senza impostare nulla il sync si comporta come oggi (nessun BUSY)', async (t) => {
  assert.equal(sessionStore.politicaScritturaSync(), 'scavalca');
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'sync-default';
  let libera;
  const attesa = new Promise((resolve) => { libera = resolve; });
  const primo = registraRiga(
    { cartellaStore, sessionId, record: { tipo: 'evento-prima' } },
    { appendFileFn: async (path, data, options) => { await attesa; return appendFile(path, data, options); } },
  );
  // Oggi il sync scavalca: nessun errore, e la riga sync arriva PRIMA dell'async ancora in attesa.
  registraRigaSync({ cartellaStore, sessionId, record: { tipo: 'checkpoint-scavalca' } });
  libera();
  await primo;
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).map((riga) => riga.tipo), ['checkpoint-scavalca', 'evento-prima']);
});

test('CTX-STORE-SYNC-POLICY-REJECTS-UNKNOWN — una politica sconosciuta è un errore, non un default silenzioso', () => {
  assert.throws(() => sessionStore.impostaPoliticaScritturaSync('forse'), (errore) => errore?.code === 'SESSION_STORE_BAD_POLICY');
  assert.equal(sessionStore.politicaScritturaSync(), 'scavalca');
});

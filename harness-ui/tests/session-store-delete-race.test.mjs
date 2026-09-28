// CTX-JOURNAL B0: la cancellazione condivide la coda delle append per percorso.
// Resta fuori da questo test il fencing di append avviate DOPO la delete.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { appendFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eliminaSessionePersistita, leggiRegistro, registraRiga } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('CTX-STORE-DELETE-WAITS-FOR-INFLIGHT-APPEND — delete non scavalca una append gia entrata', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-store-delete-red-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const sessionId = 'delete-inflight-append';

  let segnalaIngresso;
  const entrata = new Promise((resolve) => { segnalaIngresso = resolve; });
  let liberaAppend;
  const attesa = new Promise((resolve) => { liberaAppend = resolve; });
  const append = registraRiga(
    { cartellaStore, sessionId, record: { tipo: 'evento-in-volo' } },
    { appendFileFn: async (path, data, options) => {
      segnalaIngresso();
      await attesa;
      return appendFile(path, data, options);
    } },
  );
  await entrata;

  let unlinkChiamato = false;
  const cancellazione = eliminaSessionePersistita(
    { cartellaStore, sessionId },
    { unlinkFn: async (path) => { unlinkChiamato = true; return unlink(path); } },
  );
  let unlinkPrimaDelDrain = false;
  try {
    await new Promise((resolve) => setImmediate(resolve));
    unlinkPrimaDelDrain = unlinkChiamato;
    // Nel prodotto attuale l'unlink anticipato incontra ENOENT: attenderlo
    // qui rende deterministico il successivo riapparire del file.
    if (unlinkPrimaDelDrain) await cancellazione;
  } finally {
    liberaAppend();
    await Promise.allSettled([append, cancellazione]);
  }

  const registro = await leggiRegistro({ cartellaStore, sessionId });
  assert.deepEqual(
    { unlinkPrimaDelDrain, recordDopoDelete: registro?.map((riga) => riga.tipo) ?? null },
    { unlinkPrimaDelDrain: false, recordDopoDelete: null },
    'unlink deve seguire la append gia in corso e il journal eliminato non deve riapparire',
  );
});

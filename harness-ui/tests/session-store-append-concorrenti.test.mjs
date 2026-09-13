import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { registraRiga } from '../src/session-store.mjs';

/*
 * ⭐⭐⭐ 04/9 — W0-07. LA PERSISTENZA SI CORROMPE DA SOLA.
 *
 * Trovato riparando lo store dell'owner: il file di sessione
 * `b7b1b7d2…` (31/08) aveva 4 righe illeggibili, la prima spezzata a
 * **1.572.866 byte, esattamente 1,5 MiB**, e le tre successive che
 * iniziavano a metà percorso ma finivano con `_sequenza` coerenti —
 * pezzi di append DIVERSI mescolati. La sessione (una conversazione
 * vera, conclusa con successo) era scartata a ogni avvio da allora.
 *
 * Causa: `registraRiga` usa `fsp.appendFile` senza serializzare le
 * scritture per file. Un record più grande di una singola scrittura di
 * sistema viene spezzato, e un secondo append concorrente si infila in
 * mezzo. I `WorkspaceChanged` di una sessione con workspace = `C:\`
 * arrivano a 1,5 MB l'uno: la condizione non è teorica, è successa.
 *
 * ⛔ Questo test scrive FILE VERI (niente finti): è l'unico modo di
 * provare un difetto che vive nel filesystem.
 */

function cartellaTemporanea(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-store-append-'));
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  return cartella;
}

/** Ogni riga del JSONL deve essere leggibile da sola: è il contratto del formato. */
function righeIlleggibili(percorso) {
  const rotte = [];
  readFileSync(percorso, 'utf8').split('\n').forEach((riga, indice) => {
    if (riga.trim() === '') return;
    try { JSON.parse(riga); } catch { rotte.push({ numero: indice + 1, byte: riga.length }); }
  });
  return rotte;
}

test('W0-07 — due append CONCORRENTI di record grandi non si intrecciano: ogni riga resta leggibile', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'sessione-concorrente';
  // 2 MiB ciascuno: sopra il confine di 1,5 MiB dove si è spezzato il file vero.
  const grande = (marchio) => ({ type: 'WorkspaceChanged', marchio, percorsi: [marchio.repeat(2 * 1024 * 1024)] });

  await Promise.all([
    registraRiga({ cartellaStore, sessionId, record: grande('a') }),
    registraRiga({ cartellaStore, sessionId, record: grande('b') }),
    registraRiga({ cartellaStore, sessionId, record: grande('c') }),
  ]);

  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const rotte = righeIlleggibili(percorso);
  assert.deepEqual(rotte, [], `RIPRODOTTO: append concorrenti hanno prodotto righe illeggibili — ${JSON.stringify(rotte)}`);

  const righe = readFileSync(percorso, 'utf8').split('\n').filter((r) => r.trim() !== '');
  assert.equal(righe.length, 3, 'tre append, tre righe: nessuna persa, nessuna spezzata in due');
  assert.deepEqual(righe.map((r) => JSON.parse(r).marchio).sort(), ['a', 'b', 'c']);
});

test('W0-07 — AL CONTRARIO: le scritture piccole e in sequenza continuano a funzionare come sempre, in ordine', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'sessione-sequenziale';
  for (let i = 0; i < 5; i += 1) {
    await registraRiga({ cartellaStore, sessionId, record: { type: 'Evento', i } });
  }
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  assert.deepEqual(righeIlleggibili(percorso), []);
  const ordine = readFileSync(percorso, 'utf8').split('\n').filter((r) => r.trim() !== '').map((r) => JSON.parse(r).i);
  assert.deepEqual(ordine, [0, 1, 2, 3, 4], 'un append-only serializzato conserva anche l\'ORDINE di arrivo');
});

test('W0-07 — sessioni DIVERSE non si aspettano fra loro: la serializzazione è per file, non globale', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const scritture = [];
  for (let s = 0; s < 3; s += 1) {
    for (let i = 0; i < 4; i += 1) {
      scritture.push(registraRiga({ cartellaStore, sessionId: `sessione-${s}`, record: { type: 'Evento', s, i } }));
    }
  }
  await Promise.all(scritture);
  for (let s = 0; s < 3; s += 1) {
    const percorso = join(cartellaStore, `sessione-${s}.jsonl`);
    assert.deepEqual(righeIlleggibili(percorso), []);
    const suoi = readFileSync(percorso, 'utf8').split('\n').filter((r) => r.trim() !== '').map((r) => JSON.parse(r));
    assert.equal(suoi.length, 4, `la sessione ${s} ha tutte le sue righe`);
    assert.ok(suoi.every((r) => r.s === s), 'e nessuna riga di un\'altra sessione è finita qui dentro');
  }
});

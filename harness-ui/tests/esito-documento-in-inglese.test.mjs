/*
 * Dalla CLI, 16/10/2026 notte, sul costruito della 0.6.8: l'esito di `document_create` che legge il modello aveva un pezzo italiano —
 * «Checked by reopening it: 14 caratteri, 1 righe.» — contro la decisione dell'owner del 03/10 (il testo per il modello è inglese).
 * Nasceva in `verifyTalosDocument` (`detail` dei formati di testo, e «formato sconosciuto»). Le sorelle erano già inglesi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTalosDocument, verifyTalosDocument } from '../src/document-generator.mjs';

test('ESITO-DOC-EN-01 — the text check that reaches the model is English: «N characters, M lines»', async () => {
  const documento = await generateTalosDocument({ format: 'md', title: 'nota', body: 'riga uno\nriga due' });
  const controllo = await verifyTalosDocument(documento);
  assert.equal(controllo.ok, true);
  /* i numeri esatti, dal testo vero del file (revisione del bugfixer: con `\d+` un conteggio fisso «1 lines» passava) */
  const testo = new TextDecoder('utf-8').decode(documento.bytes);
  assert.ok(testo.split('\n').length > 1, 'premessa: il file ha più di una riga');
  assert.equal(controllo.detail, `${testo.length} characters, ${testo.split('\n').length} lines`);
});

test('ESITO-DOC-EN-02 — an unknown format is said in English too', async () => {
  const controllo = await verifyTalosDocument({ format: 'xyz', bytes: new Uint8Array([1]) });
  assert.equal(controllo.ok, false);
  assert.match(controllo.detail, /unknown format: xyz/u, controllo.detail);
});

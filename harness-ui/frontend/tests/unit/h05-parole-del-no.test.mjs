/*
 * H-05 (red-team degli attrezzi, ZIP dell'owner del 02/10/2026; owner «Voglio il +1»): il kernel non dice più REFUSED per tutto.
 *   REFUSED resta a sicurezza e permessi; NOT FOUND, AMBIGUOUS e INVALID sono gli altri «no»; NO CHANGE non è un no.
 *   L'interfaccia deve: (1) non dipingere mai di verde un NOT FOUND, un AMBIGUOUS o un INVALID; (2) spiegarli in italiano, con le
 *   frasi già tradotte che valevano per REFUSED (l'HTML vuoto); (3) non trattare NO CHANGE come un guasto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { spiegaRifiutoAttrezzo } from '../../src/components/errori.js';
import { esitoDichiaraFallimento } from '../../src/components/esito-comando.js';

test('H-05: NOT FOUND, AMBIGUOUS e INVALID sono un esito fallito, come REFUSED; NO CHANGE no', () => {
  assert.equal(esitoDichiaraFallimento('file_edit', 'NOT FOUND. Nothing was changed: `old_string` does not appear in a.mjs, not even once.'), true);
  assert.equal(esitoDichiaraFallimento('file_edit', 'AMBIGUOUS. Nothing was changed: `old_string` appears 2 times in a.mjs'), true);
  assert.equal(esitoDichiaraFallimento('artifact_create', 'INVALID. Empty html: nothing was created.'), true);
  assert.equal(esitoDichiaraFallimento('file_edit', 'REFUSED. Nothing was changed: a.bin is a binary file'), true);
  assert.equal(esitoDichiaraFallimento('file_edit', 'NO CHANGE. The edit looks already applied: `new_string` is already in a.mjs (line 1)'), false);
  assert.equal(esitoDichiaraFallimento('leggi', 'testo di un file che PARLA di NOT FOUND. dentro'), false, 'solo in testa');
});

test('H-05: ogni «no» del kernel si spiega con le sue parole, e le traduzioni di prima valgono ancora', () => {
  const nonTrovato = spiegaRifiutoAttrezzo('NOT FOUND. That Library id does not exist.');
  assert.deepEqual([nonTrovato.rifiutato, nonTrovato.tipo], [true, 'non-trovato']);
  assert.match(nonTrovato.detto, /non c’è/u);
  const ambiguo = spiegaRifiutoAttrezzo('AMBIGUOUS. Nothing was changed: `old_string` appears 3 times');
  assert.deepEqual([ambiguo.rifiutato, ambiguo.tipo], [true, 'ambiguo']);
  const vuoto = spiegaRifiutoAttrezzo('INVALID. Empty html: nothing was created.');
  assert.equal(vuoto.tipo, 'non-valido');
  assert.equal(vuoto.detto, 'L’HTML era vuoto: non è stato creato niente.', 'la traduzione di prima, ora sotto INVALID');
  const rifiuto = spiegaRifiutoAttrezzo('REFUSED. the person did not allow it. Nothing was written.');
  assert.deepEqual([rifiuto.rifiutato, rifiuto.tipo, rifiuto.detto], [true, 'rifiuto', 'L’attrezzo ha rifiutato la richiesta.']);
  const nessuno = spiegaRifiutoAttrezzo('NO CHANGE. The edit looks already applied');
  assert.deepEqual([nessuno.rifiutato, nessuno.tipo], [false, null], '«già applicata» non è un no');
});

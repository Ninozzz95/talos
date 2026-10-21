/*
 * 21/10/2026 — la metà di `programma-non-sul-path-tradotto.test.mjs` che legge il dizionario dell'interfaccia (solo desktop: l'albero
 *   della CLI non ha `frontend/`, richiesta della CLI). La frase del rifiuto si dice in inglese e in italiano, coi segnaposto uguali.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import dizionario from '../frontend/src/i18n/testi/server.js';

test('PATH-TRAD-03 — the dictionary says it in English and Italian, with the same placeholders', () => {
  const en = dizionario.en['program.notOnPath'];
  const it = dizionario.it['program.notOnPath'];
  assert.ok(en && it, 'both languages');
  const segnaposto = (s) => [...s.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]).sort();
  assert.deepEqual(segnaposto(en), ['command', 'example']);
  assert.deepEqual(segnaposto(it), segnaposto(en));
  assert.notEqual(it, en);
});

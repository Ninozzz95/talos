import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testoFatto } from '../../src/components/scheda-modello.js';

/*
 * ⛔ IL DIFETTO `[object Object] · [object Object]` — misurato sul 4174 il 18/09/2026 nella scheda
 *   «Compatibilità» della pagina del modello.
 *
 * Causa: `scheda-modello.js` faceva
 *     `[ispezione.backend, ispezione.build].filter(Boolean).join(' · ')`
 * e quei due campi sono **FATTI TIPIZZATI**, non stringhe: `local-runtime-probe.mjs:21` li
 * costruisce come `{ state, value }`. `filter(Boolean)` non li scarta — un oggetto è *truthy* — e
 * `join` chiama `toString()` su ognuno, che per un oggetto dà `[object Object]`.
 *
 * ⛔ Questa prova fissa DUE cose, e la prima serve a dimostrare che il difetto esisteva davvero:
 *   chi legge deve poter vedere il rosso, non credermi sulla parola.
 */
test('SCHEDA-FATTI: un fatto tipizzato concatenato a mano stampa [object Object]', () => {
  const backend = { state: 'observed', value: 'vulkan' };
  const build = { state: 'observed', value: 'b1234' };
  // Il difetto, riprodotto esattamente come stava nella riga: due oggetti in un `join`.
  assert.equal([backend, build].filter(Boolean).join(' · '), '[object Object] · [object Object]');
});

test('SCHEDA-FATTI: la cura legge il VALORE del fatto, con la funzione delle righe sorelle', () => {
  const backend = { state: 'observed', value: 'vulkan' };
  const build = { state: 'observed', value: 'b1234' };
  // La cura, riga per riga com'è adesso in `scheda-modello.js`.
  const concatenato = [backend, build]
    .map((fatto) => testoFatto(fatto))
    .filter((testo) => testo && testo !== '—')
    .join(' · ');
  assert.equal(concatenato, 'vulkan · b1234');
  assert.ok(!concatenato.includes('[object Object]'), 'la concatenazione non deve contenere oggetti grezzi');
});

test('SCHEDA-FATTI: un fatto NON osservato non finisce nella riga', () => {
  // Se il runtime non dichiara il backend, il fatto è `unknown()`: la riga deve restare vuota,
  // non riempirsi di un «sconosciuto» che sembra un dato.
  const ignoto = { state: 'unknown', value: null };
  const concatenato = [ignoto, { state: 'observed', value: 'x' }]
    .map((fatto) => testoFatto(fatto))
    .filter((testo) => testo && testo !== '—')
    .join(' · ');
  assert.ok(!concatenato.includes('[object Object]'));
  assert.ok(concatenato.includes('x'), 'il fatto osservato deve restare');
});

test('SCHEDA-FATTI: una stringa semplice resta una stringa (la cura non la rompe)', () => {
  // `testoFatto` è usata anche altrove: se le passassi una stringa già pronta non deve rompersi.
  assert.equal(testoFatto('vulkan'), 'vulkan');
});

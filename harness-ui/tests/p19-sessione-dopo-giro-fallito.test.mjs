/*
 * P19 (owner 27/09/2026, sessione cad61a7e su talos-code 0.3.0: "molti errori nella nuova versione").
 * Misurato nel registro della sessione: `leggi` su 5 PNG ha restituito i BYTE come testo (1-8 MB l'uno); la
 * compattazione e' fallita (CTX_INVALID_SUMMARY); il registro ha rimesso la cronologia di PRIMA del giro, mentre
 * l'archivio del contesto aveva gia' lo scambio completo ⇒ al giro dopo CTX_HISTORY_DIVERGED, per sempre.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { testoLeggibile } from '../src/kernel/talosHarness.mjs';
import { messaggiDopoUnGiroFallito } from '../src/session-registry.mjs';

test('P19 leggi: un file binario non entra nel contesto come testo; un testo passa identico', () => {
  const png = '�PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR' + 'x'.repeat(5000);
  const esito = testoLeggibile(png, 'ScreenShot Tool -20260925194728.png');
  assert.match(esito, /binary file/u);
  assert.match(esito, /\.png/u);
  assert.ok(esito.length < 400, 'poche righe, non i byte');
  assert.equal(testoLeggibile('ciao\nmondo', 'a.txt'), 'ciao\nmondo');
  assert.equal(testoLeggibile('', 'vuoto.txt'), '');
});

test('P19 registro: dopo un giro fallito la cronologia riprende cio\' che l\'archivio ha gia\', se lo estende', () => {
  const prima = [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }, { role: 'user', content: 'leggi le foto' }];
  const scambio = [{ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: 'binary file' }];
  assert.deepEqual(messaggiDopoUnGiroFallito({ primaDelGiro: prima, archiviati: [...prima, ...scambio] }), [...prima, ...scambio]);
  assert.equal(messaggiDopoUnGiroFallito({ primaDelGiro: prima, archiviati: null }), prima, 'senza archivio (il desktop): come prima');
  assert.equal(messaggiDopoUnGiroFallito({ primaDelGiro: prima, archiviati: prima.slice(0, 2) }), prima, 'un archivio piu\' corto non accorcia');
  assert.equal(messaggiDopoUnGiroFallito({ primaDelGiro: prima, archiviati: [{ role: 'user', content: 'altro' }, ...scambio, ...scambio] }), prima, 'un archivio che non comincia con la cronologia non la sostituisce');
  /* il primo giro di una sessione: nessuna cronologia di prima */
  assert.deepEqual(messaggiDopoUnGiroFallito({ primaDelGiro: null, archiviati: [...prima, ...scambio] }), [...prima, ...scambio]);
  assert.equal(messaggiDopoUnGiroFallito({ primaDelGiro: null, archiviati: [] }), null);
  assert.equal(messaggiDopoUnGiroFallito({ primaDelGiro: null, archiviati: null }), null);
});

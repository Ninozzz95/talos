/*
 * L'ottavo controllo: i veli si guardano dentro.
 * ⛔ Provato anche AL VERSO CONTRARIO: un velo sano non deve produrre un solo motivo, o il
 * controllo diventa rumore e smette di essere letto — è successo con le «classi senza regola».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { veliDelTemplate, giudicaVelo } from '../../scripts/cancello/veli-sani.mjs';

test('i veli si leggono dal template, e solo quelli VERI', () => {
  // il markup vero: un velo e un `.overlay-layer` con un id, non un id qualunque che inizia per «velo»
  const html = [
    '<div class="overlay-layer overlay-layer--modal" id="veloRinomina" hidden></div>',
    '<div class="overlay-layer" id="veloModello" hidden></div>',
    '<div class="overlay-layer" id="veloModello" hidden></div>',
    '<div id="veloAlberoNota"></div>',          // ⛔ un PEZZO dentro un velo: non e un velo
    '<div class="talos-screen" id="schermoChat"></div>',
  ].join('');
  assert.deepEqual(veliDelTemplate(html), ['veloRinomina', 'veloModello']);
  assert.deepEqual(veliDelTemplate(''), []);
});

test('un velo sano non produce nessun motivo', () => {
  const v = giudicaVelo({ id: 'veloRinomina', aperto: true, nudi: [], sbordanti: [], fuoriFinestra: false });
  assert.equal(v.sano, true);
  assert.deepEqual(v.motivi, []);
});

test('il caso VERO del 07/9: il controllo nudo per una variabile che qui non esiste', () => {
  const v = giudicaVelo({ id: 'veloModello', aperto: true, nudi: [{ classe: 'sheet-input', cosa: 'bordo', variabile: '--line' }] });
  assert.equal(v.sano, false);
  assert.match(v.motivi[0], /sheet-input/);
  assert.match(v.motivi[0], /--line/);
  assert.match(v.motivi[0], /fallback/);   // il messaggio dice anche come si cura
});

test('il secondo caso VERO: il contenuto tagliato da un corpo che non scorre', () => {
  const v = giudicaVelo({ id: 'veloModello', aperto: true, sbordanti: [{ classe: 'effort-picker', oltre: 42 }] });
  assert.equal(v.sano, false);
  assert.match(v.motivi[0], /42px/);
  assert.match(v.motivi[0], /non scorre/);
});

test('un velo che non si apre è un difetto, non un silenzio', () => {
  assert.equal(giudicaVelo({ id: 'veloX', aperto: false }).sano, false);
  assert.match(giudicaVelo({ id: 'veloX', aperto: false }).motivi[0], /non si è aperto/);
});

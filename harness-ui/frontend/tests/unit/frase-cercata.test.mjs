import test from 'node:test';
import assert from 'node:assert/strict';
import { fraseCercata } from '../../src/components/frase-cercata.js';

/*
 * ⛔ 07/09/2026, O-60 — owner (screenshot): «Trova di più su ""GLM-5.3" "SAO" "IndexShare" "slime""».
 *   La query del modello porta già le sue virgolette e il composer ne aggiungeva un altro paio.
 */
test('O-60: la query dello screenshot diventa una frase che si può leggere', () => {
  assert.equal(fraseCercata('"GLM-5.3" "SAO" "IndexShare" "slime"'), 'GLM-5.3, SAO, IndexShare e slime');
});

test('O-60: gli operatori del motore non arrivano a schermo', () => {
  assert.equal(fraseCercata('site:nasa.gov filetype:pdf "lunar surface"'), 'lunar surface');
  assert.equal(fraseCercata('react hooks -classi OR componenti'), 'react, hooks e componenti');
  assert.equal(fraseCercata('intitle:changelog talos'), 'talos');
});

test('O-60, al contrario: una query normale resta com’è, e il vuoto non diventa un suggerimento', () => {
  assert.equal(fraseCercata('come si usa fetch'), 'come, si, usa e fetch');
  assert.equal(fraseCercata('talos'), 'talos');
  assert.equal(fraseCercata(''), '');
  assert.equal(fraseCercata('site:example.org'), '', 'restava solo un operatore: meglio nessun suggerimento');
  assert.equal(fraseCercata(null), '');
});

test('O-60: la frase si taglia alla misura dichiarata', () => {
  const lunga = fraseCercata(`"${'x'.repeat(90)}"`, 60);
  assert.equal(lunga.length, 60);
  assert.match(lunga, /…$/);
});

test('O-60: una frase esatta lunghissima resta un termine, non si perde', () => {
  // ⛔ il primo giro tagliava a 80 il testo DENTRO le virgolette: una citazione più lunga non
  //   veniva riconosciuta come frase, finiva nel resto e lì le virgolette la cancellavano — il
  //   suggerimento spariva del tutto invece di accorciarsi.
  const citazione = 'a'.repeat(150);
  assert.equal(fraseCercata(`"${citazione}"`, 200), citazione);
});

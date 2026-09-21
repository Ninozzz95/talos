import test from 'node:test';
import assert from 'node:assert/strict';
import { quantoHaLetto, breve } from '../../src/components/browser.js';

/*
 * ⛔ 08/09/2026. Nella riga della lettura il conteggio dei caratteri si troncava per primo — a
 *   1600 restava «Agente · 07/09, 23:51 (Roma) …» — cioè spariva proprio quando la pagina era
 *   grande, che è l'unico caso in cui quel numero serve.
 *
 * Ricerca 08/09/2026 («Tool-Result Truncation: The Silent Bug That Makes Agents Lie», dev.to;
 * apxml «Strategies for Text Truncation»): una troncatura silenziosa porta l'agente a riassumere
 * con sicurezza cose che non ha mai visto. Il rischio non è che legga poco: è che nessuno lo sappia.
 * ⇒ si mostra il RAPPORTO, e solo quando c'è un taglio da dichiarare.
 */

const TAGLIATA = 'HTTP 200 · https://esempio\n\n… [35067 caratteri tolti nel mezzo: l elenco completo dei test] …\n\nfine';

test('UNA PAGINA TAGLIATA dichiara quanto manca, non solo quanto è arrivato', () => {
  const q = quantoHaLetto(TAGLIATA);
  assert.equal(q.tagliato, true);
  assert.equal(q.tolti, 35067);
  assert.equal(q.ricevuti, TAGLIATA.length);
  assert.equal(q.totale, TAGLIATA.length + 35067);
});

test('AL CONTRARIO — una pagina INTERA non dichiara niente: un avviso sempre acceso non è un avviso', () => {
  const q = quantoHaLetto('HTTP 200 · https://esempio\n\nla pagina intera, tutta qui');
  assert.equal(q.tagliato, false);
  assert.equal(q.tolti, 0);
  assert.equal(q.totale, q.ricevuti);
});

test('PIÙ TAGLI si sommano: due buchi non sono un buco solo', () => {
  const due = '… [100 caratteri tolti nel mezzo: uno] …\n… [250 caratteri tolti nel mezzo: due] …';
  assert.equal(quantoHaLetto(due).tolti, 350);
});

test('AL CONTRARIO — un testo che PARLA di caratteri tolti senza esserlo non conta', () => {
  // ⛔ la trappola: una pagina che spiega la troncatura è una pagina intera, non una tagliata.
  const q = quantoHaLetto('Questo articolo spiega quando 5000 caratteri tolti nel mezzo servono.');
  assert.equal(q.tagliato, false, 'senza la parentesi quadra non è il marcatore del kernel');
});

test('NIENTE TESTO: nessun taglio, nessun numero inventato', () => {
  for (const vuoto of ['', null, undefined]) {
    const q = quantoHaLetto(vuoto);
    assert.deepEqual([q.ricevuti, q.tolti, q.tagliato], [0, 0, false]);
  }
});

test('IL NUMERO SI LEGGE a colpo d\'occhio, non si conta cifra per cifra', () => {
  assert.equal(breve(999), '999', 'sotto mille il numero esatto è ancora leggibile');
  assert.equal(breve(4157), '4,2k');
  assert.equal(breve(39224), '39k', 'sopra i diecimila il decimale è rumore');
  assert.equal(breve(0), '0');
});

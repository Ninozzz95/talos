/*
 * 0.2.4, block 1, item 7 (list item 90, judge v2030): the card of several calls lists at most 20 of them; the kernel says how many more it
 * covers (`nonMostrate`) and the page says it under the list, in English and in Italian. The decision still covers every call.
 * Red on bb6d3799a: a group with `nonMostrate` was refused (the card fell back to the card of one call), and no line said the rest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bloccoDelGruppo, gruppoDellaCarta, testoDelleRisposte } from '../../src/components/carta-gruppo.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { documento } from './aiuto-dom-blocchi.mjs';

const elencate = (n, da = 0) => Array.from({ length: n }, (_, i) => ({ toolCallId: `c${da + i}`, argomenti: { title: `bug ${da + i}` } }));

test('GRUPPO-TETTO-01: 20 calls listed and 80 left out make a group of 100; a count that does not add up is not a group', () => {
  const g = gruppoDellaCarta({ gruppo: { totale: 100, chiamate: elencate(20), nonMostrate: 80 } });
  assert.equal(g?.totale, 100);
  assert.equal(g.chiamate.length, 20);
  assert.equal(g.nonMostrate, 80);
  for (const sbagliato of [{ totale: 100, chiamate: elencate(20), nonMostrate: 79 }, { totale: 100, chiamate: elencate(20), nonMostrate: -80 },
    { totale: 100, chiamate: elencate(20), nonMostrate: '80' }, { totale: 100, chiamate: elencate(20), nonMostrate: 80.5 }, { totale: 100, chiamate: elencate(20) },
    { totale: 21, chiamate: elencate(22), nonMostrate: -1 }]) { // the last one: M31, a negative count that makes the sum
    assert.equal(gruppoDellaCarta({ gruppo: sbagliato }), null, JSON.stringify({ ...sbagliato, chiamate: sbagliato.chiamate.length }));
  }
});

test('GRUPPO-TETTO-02: the card says the calls it does not list, and its answers still name all 100 (English, then Italian)', (t) => {
  t.after(() => impostaLingua('it'));
  const g = gruppoDellaCarta({ gruppo: { totale: 100, chiamate: elencate(20), nonMostrate: 80 } });
  for (const [lingua, attesa, tutte] of [['en', 'And 80 more calls, not listed here: your answer covers them too.', 'Allow all 100'],
    ['it', 'E altre 80 chiamate, non elencate qui: la tua risposta vale anche per loro.', 'Consenti tutte e 100']]) {
    impostaLingua(lingua);
    const doc = documento();
    const blocco = bloccoDelGruppo(doc, g);
    assert.equal(blocco.querySelectorAll('[role="listitem"]').length, 20);
    const resto = blocco.querySelector('.talos-approval__chiamate-in-piu');
    assert.equal(resto?.textContent, attesa);
    assert.equal(resto.dataset.chiamateNonMostrate, '80');
    assert.equal(blocco.querySelector('.talos-approval__mostra-tutto').textContent, lingua === 'en' ? 'Show all 20' : 'Mostra tutte e 20');
    assert.equal(testoDelleRisposte(g).consentiTutte, tutte);
  }
  impostaLingua('en');
  const una = bloccoDelGruppo(documento(), gruppoDellaCarta({ gruppo: { totale: 21, chiamate: elencate(20), nonMostrate: 1 } }));
  assert.equal(una.querySelector('.talos-approval__chiamate-in-piu').textContent, 'And 1 more call, not listed here: your answer covers it too.');
});

test('GRUPPO-TETTO-03: a group with every call listed has no line about calls left out (as before)', () => {
  const blocco = bloccoDelGruppo(documento(), gruppoDellaCarta({ gruppo: { totale: 5, chiamate: elencate(5) } }));
  assert.equal(blocco.querySelector('.talos-approval__chiamate-in-piu'), null);
});

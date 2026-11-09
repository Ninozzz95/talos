/*
 * Decision 398 (owner, 08/11/2026), cure 2: the header of a v2 that has no title of its own keeps the title of the last version that
 * had one, instead of an empty header with only the «⋯». The history is the one the host gives the shell, read in the code, not guessed:
 * `{ nome, prossima, voci: [{ versione, blocco, sorgente, cosaECambiato, origine, quando }] }` (`src/blocchi/versioni.mjs:119-125`
 * `voce`, `:145-148` `creaStorico`, `:151-153` `versioneCorrente` = the last entry), rebuilt from the events by `storicoDagliEventi`
 * (`:193-210`) in `components/blocchi/aggancio.js:669-674` and handed to the shell through `__storicoDalServer`
 * (`components/blocchi/guscio.js:244-248`), which keeps it in `section.__storico`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, orologio } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';

impostaLingua('it');
const GRAFICO = readFileSync(new URL('../../../tests/fixtures/blocchi/02-grafico.txt', import.meta.url), 'utf8').trim(); // Grafico("prezzi", "Prezzo medio", …)
const SENZA_TITOLO = (s) => s.replace('"Prezzo medio"', 'null');
const CON_TITOLO = (s, titolo) => s.replace('"Prezzo medio"', JSON.stringify(titolo));
let seq = 0;
const evento = (value) => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value, _sequenza: ++seq });
const versione = (n, sorgente) => evento({
  conversazione: 's1', messaggio: 'm1', posizione: 0, blocco: 'b1', versione: n, sorgente, impronta: impronta(sorgente),
  cosaECambiato: n === 1 ? '' : 'Marzo cambiato', origine: 'modello',
});

function scena(sorgente1 = GRAFICO) {
  const document = documento();
  const messaggi = new Map();
  const a = creaAggancioBlocchi({
    document, sessione: () => 's1', consegna: () => {}, timer: orologio().timer,
    elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    salvaVersione: () => Promise.resolve({ ok: true }), avvisa: () => {},
  });
  const art = document.createElement('article');
  art.append(a.blocco(sorgente1, true));
  document.body.append(art);
  messaggi.set('m1', art);
  const nodo = [...art.querySelectorAll('section')].find((s) => s.classList.contains('gu'));
  return { a, nodo };
}
const titoloDi = (nodo) => nodo.querySelector('h3.gu__titolo')?.textContent ?? '';

test('D398-2 a model v2 without a title keeps the title of v1 in the header and in the accessible name', () => {
  const { a, nodo } = scena();
  a.aggiornaVersione(versione(1, GRAFICO));
  assert.equal(titoloDi(nodo), 'Prezzo medio', 'premise: v1 has its title');
  assert.equal(a.aggiornaVersione(versione(2, SENZA_TITOLO(GRAFICO.replace('y: 14', 'y: 16')))), true);
  assert.equal(nodo.__storico.voci.length, 2, 'premise: the shell shows v2');
  assert.equal(nodo.__storico.voci[1].blocco.titolo ?? null, null, 'premise: v2 really has no title');
  assert.equal(titoloDi(nodo), 'Prezzo medio', 'the header is not empty');
  assert.equal(nodo.getAttribute('aria-label'), 'Prezzo medio');
});

test('D398-2 a title of its own wins; with none, the LAST version that had one gives it', () => {
  const { a, nodo } = scena();
  a.aggiornaVersione(versione(1, GRAFICO));
  a.aggiornaVersione(versione(2, CON_TITOLO(GRAFICO.replace('y: 14', 'y: 16'), 'Prezzo nuovo')));
  assert.equal(titoloDi(nodo), 'Prezzo nuovo');
  a.aggiornaVersione(versione(3, SENZA_TITOLO(GRAFICO.replace('y: 14', 'y: 18'))));
  assert.equal(titoloDi(nodo), 'Prezzo nuovo', 'v3 without a title takes the one of v2, not the older one of v1');
});

test('D398-2 AL CONTRARIO: a block with no title in any version keeps an empty header (nothing is invented)', () => {
  const v1 = SENZA_TITOLO(GRAFICO);
  const { a, nodo } = scena(v1);
  a.aggiornaVersione(versione(1, v1));
  a.aggiornaVersione(versione(2, v1.replace('y: 14', 'y: 16')));
  assert.equal(nodo.__storico.voci.length, 2);
  assert.equal(nodo.querySelector('h3.gu__titolo'), null);
  assert.equal(nodo.hasAttribute('aria-label'), false);
});

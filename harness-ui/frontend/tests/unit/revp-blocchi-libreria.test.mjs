/*
 * Review P (04/11/2026), D7 on the PC: the "In Library · vN" button after a reload.
 * REVP-PC-02 (mutant QB4): two versions with the same text (a restore): the button says the MOST RECENT, as the server does on click.
 * REVP-PC-01 (mutant QB9): different sessions with the same block (same id, same text: a fork, a copied chat) keep separate memories.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, voceDelMenu } from './aiuto-dom-blocchi.mjs';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { impronta } from '../../../src/blocchi/impronta.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { disegnaBlocco } from '../../src/components/blocchi/guscio.js';
import { creaSalvaInLibreria } from '../../src/components/blocchi/in-libreria.js';

impostaLingua('it');
const FIXTURE = new URL('../../../tests/fixtures/blocchi/', import.meta.url);
const corpo = (nome) => readFileSync(new URL(`${nome}.txt`, FIXTURE), 'utf8');
const aspetta = () => new Promise((r) => setImmediate(r));
const tastoLib = (nodo) => voceDelMenu(nodo, 'libreria');

test('REVP-PC-02 (D7, mutant QB4) — two versions with the same text (a restore): the button says the MOST RECENT, as the server on click', async () => {
  const doc = documento();
  const testo = corpo('01-tabella');
  const altro = testo.replace('["Marzo"]', '["Marzo", 1500]');
  const salva = creaSalvaInLibreria({
    post: async () => null, sessione: () => 's1', avvisa: () => {}, apri: () => {},
    leggi: async () => ({ voce: { id: 'lib-1', nome: 'a.txt', totale: 3, versioni: [
      { n: 1, impronta: impronta(testo.trimEnd()) }, { n: 2, impronta: impronta(altro.trimEnd()) }, { n: 3, impronta: impronta(testo.trimEnd()) }] } }),
  });
  const nodo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  await aspetta();
  await aspetta();
  assert.equal(tastoLib(nodo).textContent, 'In Libreria · v3');
});

test('REVP-PC-01 (D7, mutant QB9) — saved in session A, the same block in session B does not say "In Library"; it asks for B, and A\'s answer does not touch B', async () => {
  const doc = documento();
  const testo = corpo('01-tabella');
  let sessione = 'A';
  const lette = [];
  const risposte = {};
  const salva = creaSalvaInLibreria({
    post: async () => ({ data: { id: 'lib-a', versione: 1, totale: 1, nome: 'a.txt', nuova: true } }),
    sessione: () => sessione, avvisa: () => {}, apri: () => {},
    leggi: (percorso) => { lette.push(percorso); return new Promise((ok) => { risposte[percorso] = ok; }); },
  });
  const disegna = () => { const n = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } }); doc.body.append(n); return n; };
  const inA = disegna();
  clic(tastoLib(inA));
  await aspetta();
  assert.equal(tastoLib(inA).textContent, 'In Libreria · v1');
  sessione = 'B';
  const inB = disegna();
  assert.equal(tastoLib(inB).textContent, 'Salva in Libreria', 'the memory of A does not count for B');
  await aspetta();
  assert.ok(lette.includes('/api/v1/sessions/B/blocks/vendite/library'), JSON.stringify(lette));
  /* the (late) answer to A's question says v1: it must not light B's button */
  const diA = '/api/v1/sessions/A/blocks/vendite/library';
  if (risposte[diA]) risposte[diA]({ voce: { id: 'lib-a', nome: 'a.txt', totale: 1, versioni: [{ n: 1, impronta: impronta(testo.trimEnd()) }] } });
  risposte['/api/v1/sessions/B/blocks/vendite/library']({ voce: null });
  await aspetta();
  assert.equal(tastoLib(inB).textContent, 'Salva in Libreria');
});

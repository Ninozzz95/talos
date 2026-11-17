/*
 * S1-b, ultimo giro «che lo chiude» (owner 11/11/2026 10:48, giudice v1436; reperti del controllore delle 10:45: C6, C7, C12 vivi).
 *   - i numeri nella lingua dell'INTERFACCIA anche senza `locale` (la «M» seguiva già la lingua, ma nessuna prova lo teneva: C7);
 *   - la cache dichiarata a zero è dichiarata (0, non «non so»: C6);
 *   - il testo inglese per intero, cache compresa (C12);
 *   - le chiamate contate per TENTATIVO: una riga `consumo-di-servizio` con `tentativi: 3` sono tre chiamate pagate (consumo-di-servizio.mjs:96);
 *   - il nome vero della somma: riassunti, /compact e motore insieme sono la spesa delle compattazioni, non «del motore»;
 *   - i pezzi morti della testata vecchia («3 · 5597,9k token») non ci sono più.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import * as spesaRiassunti from '../../src/components/spesa-riassunti.js';
import { modelloContesto, disegnaContesto } from '../../src/components/pannello/contesto.js';
import { documento } from './aiuto-dom-blocchi.mjs';
import { creaStato } from '../fixtures/pannello-dati.mjs';
import { kilo } from '../../src/components/pannello/comune.js';
import en from '../../src/i18n/pannello.en.js';
import it from '../../src/i18n/pannello.it.js';

const { nuovaSpesa, registraSpesa, spesaDelMotore, testoSpesaDelMotore, tokenBrevi, cacheDellaRiga } = spesaRiassunti;
const kiloIt = (n) => kilo(n, 'it');
const kiloEn = (n) => kilo(n, 'en');
const riga = (scopo, usage, extra = {}) => ({ schema: 'talos.consumo-di-servizio.v1', scopo, usage, esito: 'completato', inPrimoPiano: false, ...extra });
const uso = (p, c, cache) => ({ prompt_tokens: p, completion_tokens: c, ...(cache === undefined ? {} : { prompt_tokens_details: { cached_tokens: cache } }) });
const due = () => {
  const s = nuovaSpesa();
  registraSpesa(s, riga('motore', uso(3_000_000, 50_000, 1_200_000), { jobId: 'job-1' }), 1);
  registraSpesa(s, riga('motore', uso(2_500_000, 47_900, 900_000), { jobId: 'job-2' }), 2);
  return s;
};

test('SPESA-ULT-01 — senza `locale` la «M» segue la lingua dell\'interfaccia (C7)', () => {
  try {
    impostaLingua('en');
    assert.equal(tokenBrevi(5_597_900, kiloEn), '5.6 M');
    assert.equal(testoSpesaDelMotore(spesaDelMotore(due()), kiloEn), 'Compaction spend: 5.6 M tokens in 2 calls, 2.1 M of them from the cache');
    impostaLingua('it');
    assert.equal(tokenBrevi(5_597_900, kiloIt), '5,6 M');
  } finally { impostaLingua('it'); }
});

test('SPESA-ULT-02 — la cache dichiarata a ZERO è dichiarata: 0, non «non so» (C6); e a zero non si scrive', () => {
  impostaLingua('it');
  assert.equal(cacheDellaRiga(riga('motore', uso(10, 1, 0))), 0);
  const s = nuovaSpesa();
  registraSpesa(s, riga('riassunto', uso(1000, 100, 0), { idRiassunto: 'a' }), 1);
  assert.equal(spesaDelMotore(s).cache, 0);
  assert.equal(testoSpesaDelMotore(spesaDelMotore(s), kiloIt, 'it-IT'), 'Spesa delle compattazioni: 1,1k token in 1 chiamata');
});

test('SPESA-ULT-03 — il nome vero e il testo per intero nelle due lingue, cache compresa (C12)', () => {
  try {
    impostaLingua('it');
    assert.equal(testoSpesaDelMotore(spesaDelMotore(due()), kiloIt, 'it-IT'), 'Spesa delle compattazioni: 5,6 M token in 2 chiamate, di cui 2,1 M dalla cache');
    impostaLingua('en');
    assert.equal(testoSpesaDelMotore(spesaDelMotore(due()), kiloEn, 'en-US'), 'Compaction spend: 5.6 M tokens in 2 calls, 2.1 M of them from the cache');
    const s = due();
    registraSpesa(s, riga('compact', null), 3);
    assert.equal(testoSpesaDelMotore(spesaDelMotore(s), kiloEn, 'en-US'), 'Compaction spend: at least 5.6 M tokens in 3 calls, 2.1 M of them from the cache');
    const ignota = nuovaSpesa();
    registraSpesa(ignota, riga('riassunto', null), 1);
    assert.equal(testoSpesaDelMotore(spesaDelMotore(ignota), kiloEn, 'en-US'), 'Compaction spend: not measured, 1 call');
  } finally { impostaLingua('it'); }
});

test('SPESA-ULT-04 — le chiamate contate per tentativo: `tentativi: 3` sono tre chiamate; un valore storto ne conta una', () => {
  impostaLingua('it');
  const s = nuovaSpesa();
  registraSpesa(s, riga('motore', uso(1000, 100, 400), { jobId: 'job-1', tentativi: 3 }), 1);
  registraSpesa(s, riga('riassunto', uso(1000, 100, 400), { idRiassunto: 'r-1' }), 2);
  assert.deepEqual(spesaDelMotore(s), { stato: 'misurato', token: 2200, chiamate: 4, cache: 800 });
  for (const [k, storto] of [[3, 'tre'], [4, -2], [5, 1.5], [6, 0], [7, 1]]) {
    registraSpesa(s, riga('compact', uso(10, 0, 0), { tentativi: storto }), k);
  }
  assert.equal(spesaDelMotore(s).chiamate, 4 + 5, 'cinque righe storte o da un tentativo: una chiamata ciascuna');
  /* una riga senza uso con due tentativi: due chiamate pagate e non misurate */
  registraSpesa(s, riga('riassunto', null, { tentativi: 2 }), 8);
  assert.equal(spesaDelMotore(s).chiamate, 11);
  assert.equal(spesaDelMotore(s).stato, 'almeno');
  /* gli scopi che non sono compattazioni restano fuori anche coi tentativi */
  registraSpesa(s, riga('giudice', uso(10, 0), { tentativi: 5 }), 9);
  assert.equal(spesaDelMotore(s).chiamate, 11);
});

test('SPESA-ULT-05 — i pezzi morti della testata vecchia non ci sono più (funzione, campo del modello, chiavi)', () => {
  assert.equal('contoTestataRiassunti' in spesaRiassunti, false);
  assert.equal('costoRiassunti' in modelloContesto({ storiaContesto: [], spesaRiassunti: due() }), false);
  for (const diz of [en, it]) assert.deepEqual(Object.keys(diz).filter((k) => k.startsWith('contesto.testata')), []);
  for (const diz of [en, it]) assert.deepEqual(Object.keys(diz).filter((k) => k.startsWith('contesto.spesaMotore')), [], 'le chiavi col nome vero');
});

/* Il disegno della scheda, nel DOM finto dei blocchi (come pannello-contesto-evitati-disegno): i numeri nella lingua dell'interfaccia,
   qualunque sia quella del sistema (qui Node è italiano: senza la cura l'inglese diceva «89,6k» e «4,4%»; su un sistema inglese il
   contrario). */
function disegna(dati) {
  const doc = documento();
  doc.querySelector = (q) => doc.body.querySelector(q);
  doc.querySelectorAll = (q) => doc.body.querySelectorAll(q);
  doc.documentElement = doc.body;
  doc.defaultView = { Node: doc.body.constructor, getComputedStyle: () => ({}) };
  const prima = globalThis.document;
  globalThis.document = doc;
  try {
    const contenitore = doc.createElement('div');
    doc.body.append(contenitore);
    disegnaContesto(contenitore, dati);
    return contenitore.textContent;
  } finally { globalThis.document = prima; }
}

test('SPESA-ULT-06 — la scheda Contesto scrive i numeri nella lingua dell\'interfaccia: punto in inglese, virgola in italiano', () => {
  const S = creaStato(Date.parse('2026-11-04T19:00:00Z'));
  try {
    impostaLingua('en');
    const en = disegna(S.contesto);
    for (const atteso of ['89.6k of 140k before compaction', 'System~6.2k tokens4.4%', 'MCP tools', '~28.5k tokens20.3%', '50.4k free before compaction']) assert.ok(en.includes(atteso), atteso);
    assert.doesNotMatch(en, /\d,\d(?:k|%| M)/u, 'in inglese nessuna virgola decimale');
    impostaLingua('it');
    const it = disegna(S.contesto);
    for (const atteso of ['89,6k di 140k prima della compattazione', 'Sistema~6,2k token4,4%', '~28,5k token20,3%', '50,4k liberi prima della compattazione']) assert.ok(it.includes(atteso), atteso);
    assert.doesNotMatch(it, /\d\.\d(?:k|%| M)/u, 'in italiano nessun punto decimale (il nome del modello «glm-5.3» non è un numero)');
  } finally { impostaLingua('it'); }
});

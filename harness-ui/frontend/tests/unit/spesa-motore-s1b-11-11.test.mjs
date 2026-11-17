/*
 * S1-b (owner 11/11/2026 07:47-07:52, «Piccole subito»): la testata «Compattazioni N» da sola; sotto, la spesa su una riga sua, con le
 * chiamate (non i riassunti), «M» da un milione e la parte della cache SOLO se ogni riga misurata la dichiara (mai dedotta).
 * Prova del lettore: «3 · 5597,9k token» faceva leggere 1,9 M a riassunto; il numero contava le versioni, la spesa ogni chiamata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { nuovaSpesa, registraSpesa, spesaDelMotore, testoSpesaDelMotore, tokenBrevi, cacheDellaRiga, testoCosto } from '../../src/components/spesa-riassunti.js';
import { modelloContesto } from '../../src/components/pannello/contesto.js';
import { kilo } from '../../src/components/pannello/comune.js';

const kiloIt = (n) => kilo(n, 'it');
const kiloEn = (n) => kilo(n, 'en');
const riga = (scopo, usage, extra = {}) => ({ schema: 'talos.consumo-di-servizio.v1', scopo, usage, esito: 'completato', inPrimoPiano: false, ...extra });
const uso = (p, c, cache) => ({ prompt_tokens: p, completion_tokens: c, ...(cache === undefined ? {} : { prompt_tokens_details: { cached_tokens: cache } }) });

test('SPESA-S1B-01 — da un milione «M» con una cifra decimale; sotto, il kilo di chi chiama; 999.950 è già «1,0 M»', () => {
  assert.equal(tokenBrevi(5_597_900, kiloIt, 'it-IT'), '5,6 M');
  assert.equal(tokenBrevi(5_597_900, kiloEn, 'en-US'), '5.6 M');
  assert.equal(tokenBrevi(1_000_000, kiloIt, 'it-IT'), '1,0 M');
  assert.equal(tokenBrevi(999_950, kiloIt, 'it-IT'), '1,0 M', 'mai «1000k»');
  assert.equal(tokenBrevi(999_949, kiloIt, 'it-IT'), kiloIt(999_949));
  assert.equal(tokenBrevi(41_200, kiloIt, 'it-IT'), '41,2k');
  assert.equal(tokenBrevi(Number.NaN, kiloIt, 'it-IT'), kiloIt(Number.NaN));
  /* la riga di ogni compattazione usa la stessa «M» (la lingua dei numeri è quella dell'interfaccia) */
  impostaLingua('it');
  assert.equal(testoCosto({ stato: 'misurato', token: 3_638_000 }, kiloIt), 'costato 3,6 M token');
  assert.equal(testoCosto({ stato: 'almeno', token: 41_200 }, kiloIt), 'almeno 41,2k token');
});

test('SPESA-S1B-02 — la riga: chiamate contate (anche le senza uso), «almeno» se ne manca uno, la cache solo se dichiarata da tutte', () => {
  impostaLingua('it');
  assert.equal(spesaDelMotore(nuovaSpesa()), null, 'niente pagato: nessuna riga');
  assert.equal(testoSpesaDelMotore(null, kiloIt), null);
  const s = nuovaSpesa();
  registraSpesa(s, riga('motore', uso(3_000_000, 50_000, 1_200_000), { jobId: 'job-1' }), 1);
  registraSpesa(s, riga('motore', uso(2_500_000, 47_900, 900_000), { jobId: 'job-2' }), 2);
  registraSpesa(s, riga('giudice', uso(9_999, 1, 9_000)), 3); // non è un riassunto: fuori
  assert.deepEqual(spesaDelMotore(s), { stato: 'misurato', token: 5_597_900, chiamate: 2, cache: 2_100_000 });
  assert.equal(testoSpesaDelMotore(spesaDelMotore(s), kiloIt, 'it-IT'), 'Spesa delle compattazioni: 5,6 M token in 2 chiamate, di cui 2,1 M dalla cache');
  registraSpesa(s, riga('compact', uso(10_000, 100)), 4); // una riga misurata SENZA cache dichiarata: la parte della cache sparisce
  assert.equal(spesaDelMotore(s).cache, null);
  assert.equal(testoSpesaDelMotore(spesaDelMotore(s), kiloIt, 'it-IT'), 'Spesa delle compattazioni: 5,6 M token in 3 chiamate');
  registraSpesa(s, riga('riassunto', null), 5); // una senza uso: «almeno», e conta come chiamata
  assert.equal(testoSpesaDelMotore(spesaDelMotore(s), kiloIt, 'it-IT'), 'Spesa delle compattazioni: almeno 5,6 M token in 4 chiamate');
  impostaLingua('en');
  assert.equal(testoSpesaDelMotore(spesaDelMotore(s), kiloEn, 'en-US'), 'Compaction spend: at least 5.6 M tokens in 4 calls');
  impostaLingua('it');
});

test('SPESA-S1B-03 — al contrario: una chiamata sola al singolare, una non misurata lo dice, la cache a zero non si scrive', () => {
  impostaLingua('it');
  const una = nuovaSpesa();
  registraSpesa(una, riga('riassunto', uso(1000, 100, 0), { idRiassunto: 'a' }), 1);
  assert.equal(testoSpesaDelMotore(spesaDelMotore(una), kiloIt, 'it-IT'), 'Spesa delle compattazioni: 1,1k token in 1 chiamata');
  const ignota = nuovaSpesa();
  registraSpesa(ignota, riga('motore', null), 1);
  registraSpesa(ignota, riga('motore', {}), 2);
  assert.equal(testoSpesaDelMotore(spesaDelMotore(ignota), kiloIt, 'it-IT'), 'Spesa delle compattazioni: non misurata, 2 chiamate');
  impostaLingua('en');
  assert.equal(testoSpesaDelMotore(spesaDelMotore(una), kiloEn, 'en-US'), 'Compaction spend: 1.1k tokens in 1 call');
  assert.equal(testoSpesaDelMotore(spesaDelMotore(ignota), kiloEn, 'en-US'), 'Compaction spend: not measured, 2 calls');
  impostaLingua('it');
});

test('SPESA-S1B-04 — la cache dichiarata nelle tre forme che il nucleo somma già; niente forma, niente numero', () => {
  assert.equal(cacheDellaRiga(riga('motore', uso(10, 1, 7))), 7);
  assert.equal(cacheDellaRiga(riga('motore', { prompt_tokens: 10, cache_read_input_tokens: 6 })), 6);
  assert.equal(cacheDellaRiga(riga('motore', { prompt_tokens: 10, prompt_cache_hit_tokens: 5 })), 5);
  assert.equal(cacheDellaRiga(riga('motore', uso(10, 1))), null);
  assert.equal(cacheDellaRiga(riga('motore', null)), null);
});

test('SPESA-S1B-05 — il modello della scheda porta la spesa del motore accanto al numero (che resta il numero dei riassunti)', () => {
  const spesa = nuovaSpesa();
  registraSpesa(spesa, riga('motore', uso(1000, 100, 400), { jobId: 'job-1' }), 1);
  registraSpesa(spesa, riga('motore', uso(1000, 100, 400), { jobId: 'job-1' }), 2);
  const storiaContesto = [{ giro: 9, at: 2, token: 60_000, compattazione: { prima: 60_000, dopo: 19_000, conModello: true, ids: ['job-1'] } }];
  const m = modelloContesto({ storiaContesto, spesaRiassunti: spesa });
  assert.equal(m.numeroRiassunti, 1);
  assert.deepEqual(m.spesaMotore, { stato: 'misurato', token: 2200, chiamate: 2, cache: 800 });
  assert.equal(modelloContesto({ storiaContesto }).spesaMotore, null, 'senza dati di spesa: niente riga');
});

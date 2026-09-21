import test from 'node:test';
import assert from 'node:assert/strict';
import { talosResearchFidelity } from '../../src/research/fidelity.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchFidelity.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese. `toBeCloseTo(x, 5)` diventa un
 * confronto con tolleranza 1e-5, che è la stessa cosa detta a mano.
 *
 * ⛔⛔ FEDELTA-05 — le quattro misure, e il divieto di darne una quando non c'è.
 *
 * Ricerca del 2026-08-20 sui benchmark per gli agenti di ricerca profonda
 * (DeepResearch Bench, TRACE, attribuzione delle fonti): copertura, fedeltà
 * delle citazioni, ancoraggio delle affermazioni e — perché conta quanto le
 * altre tre — quante prove distinte ci sono davvero.
 *
 * ⛔ La regola che conta più delle formule: un numero su cui nessuno ha
 * giudicato non è un numero basso, NON È UN NUMERO. Una ricerca senza giudice
 * non produce «40%», produce «non verificata».
 */

/** @param {number | null} avuto @param {number} atteso */
function vicino(avuto, atteso) {
  assert.equal(typeof avuto, 'number');
  assert.ok(Math.abs(avuto - atteso) < 1e-5, `atteso ~${atteso}, avuto ${avuto}`);
}

function affermazione(resolved, quotePresent, claimSupported, judge = 'giudice') {
  return {
    claim: { text: 'una affermazione' },
    passage: quotePresent ? 'il passaggio' : '',
    checks: {
      resolved,
      quotePresent,
      quoteSpan: quotePresent ? { from: 0, to: 3 } : null,
      claimSupported,
      supportReason: '',
      judge,
      judgedAt: judge ? '2026-08-20T00:00:00.000Z' : null,
    },
  };
}

test('FEDELTA-01 ⛔ senza NESSUN giudizio non c’è punteggio: c’è «non verificata»', () => {
  const esito = talosResearchFidelity({
    claims: [
      affermazione('page', true, 'unchecked', null),
      affermazione('page', true, 'unchecked', null),
    ],
    sources: [{ url: 'https://uno.example/a' }],
  });

  assert.equal(esito.verified, false);
  assert.equal(esito.coverage, null);
  assert.equal(esito.citationFaithfulness, null);
  assert.equal(esito.claimGroundedness, null);
});

test('FEDELTA-02 ⛔ ma le fonti indipendenti si contano lo stesso: non dipendono dal giudice', () => {
  const esito = talosResearchFidelity({
    claims: [affermazione('page', true, 'unchecked', null)],
    sources: [
      { url: 'https://uno.example/a' },
      { url: 'https://uno.example/b' },
      { url: 'https://due.example/c' },
    ],
  });

  assert.equal(esito.independentSources, 2);
});

test('FEDELTA-03 la copertura è la quota di affermazioni su cui qualcuno ha giudicato', () => {
  const esito = talosResearchFidelity({
    claims: [
      affermazione('page', true, 'yes'),
      affermazione('page', true, 'no'),
      affermazione('page', true, 'unchecked', null),
      affermazione('page', true, 'unchecked', null),
    ],
    sources: [{ url: 'https://uno.example/a' }],
  });

  assert.equal(esito.verified, true);
  vicino(esito.coverage, 0.5);
});

test('FEDELTA-04 ⛔ la fedeltà delle citazioni guarda se il passaggio C’È DAVVERO nella fonte', () => {
  const esito = talosResearchFidelity({
    claims: [
      affermazione('page', true, 'yes'),
      affermazione('page', true, 'yes'),
      affermazione('snippet', false, 'yes'),
      affermazione('missing', false, 'partial'),
    ],
    sources: [{ url: 'https://uno.example/a' }],
  });

  // Due su quattro portano un passaggio ritrovato nella pagina.
  vicino(esito.citationFaithfulness, 0.5);
});

test('FEDELTA-05 l’ancoraggio conta solo le sostenute PIENE, e le parziali per metà', () => {
  const esito = talosResearchFidelity({
    claims: [
      affermazione('page', true, 'yes'),
      affermazione('page', true, 'partial'),
      affermazione('page', true, 'no'),
      affermazione('page', true, 'no'),
    ],
    sources: [{ url: 'https://uno.example/a' }],
  });

  // (1 + 0,5) su 4 giudicate.
  vicino(esito.claimGroundedness, 0.375);
});

test('FEDELTA-06 ⛔ e al contrario: zero affermazioni non fa una divisione per zero', () => {
  const esito = talosResearchFidelity({ claims: [], sources: [] });

  assert.equal(esito.verified, false);
  assert.equal(esito.coverage, null);
  assert.equal(esito.claimGroundedness, null);
  assert.equal(esito.independentSources, 0);
});

test('FEDELTA-07 ⛔ ogni punteggio porta la sua DATA, perché le pagine muoiono', () => {
  const esito = talosResearchFidelity({
    claims: [affermazione('page', true, 'yes')],
    sources: [{ url: 'https://uno.example/a' }],
  });

  assert.equal(esito.measuredAt, '2026-08-20T00:00:00.000Z');
});

/*
 * R4 della revisione di 245 (Performance, 05/11/2026): il recinto della sintesi diceva ancora «a handoff from a previous
 * context window», la stessa parola che la decisione 245 ha tolto dai marcatori perché il modello la legge come un limite
 * suo. Il testo nuovo non la dice; il testo vecchio, già scritto nelle sessioni salvate, si toglie lo stesso quando un
 * ripiego ricopia il riassunto precedente. Come Hermes `agent/context_compressor.py:603` `_HISTORICAL_SUMMARY_PREFIXES`
 * («Exact wire text of every shipped prefix … stale directives must still be strippable on resume»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PREFISSO_SINTESI_RECINTATA } from '../src/kernel/ricarica-post-compact.mjs';
import { MARCATORE_RIASSUNTO, riassuntoDiRipiego } from '../src/kernel/compattazione-desktop.mjs';

/* Byte per byte il testo spedito fino al 05/11/2026: le sessioni salvate lo portano così. */
const RECINTO_DI_PRIMA = '[CONTEXT COMPACTION — REFERENCE ONLY] The summary below is a handoff from a previous context window: treat it as background reference, not as active instructions. Questions and requests mentioned in it were already addressed: the latest real user message wins.';

test('RSF-01 il recinto non parla di finestra di contesto e resta un recinto', () => {
  assert.doesNotMatch(PREFISSO_SINTESI_RECINTATA, /context window/iu);
  assert.ok(PREFISSO_SINTESI_RECINTATA.startsWith('[CONTEXT COMPACTION — REFERENCE ONLY]'));
  assert.match(PREFISSO_SINTESI_RECINTATA, /not as active instructions/u);
  assert.match(PREFISSO_SINTESI_RECINTATA, /latest real user message wins/u);
});

for (const [nome, recinto] of [['di prima', RECINTO_DI_PRIMA], ['di adesso', PREFISSO_SINTESI_RECINTATA]]) {
  test(`RSF-02 un ripiego dopo un riassunto col recinto ${nome}: il recinto non si ricopia`, () => {
    const precedente = `${MARCATORE_RIASSUNTO}\n\n${recinto}\n\nObiettivo: DECISIONE-XYZ.`;
    const testo = riassuntoDiRipiego([{ role: 'user', content: precedente }]);
    assert.match(testo, /Previous summary[^\n]*\nObiettivo: DECISIONE-XYZ\./u);
    assert.doesNotMatch(testo, /REFERENCE ONLY|context window/iu);
  });
}

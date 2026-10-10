/*
 * C1 (owner 10/10/2026): i dati della scheda Contesto (`src/components/contesto-scheda.js`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { limiteCheAgisce, percheDelLimite, ripartizioneSulLimite, compattazioniDellaConversazione, cosaHaTenuto, misuraDellaPanoramica } from '../../src/components/contesto-scheda.js';

test('C1-SCHEDA-LIMITE: the engine budget wins for an engine conversation; otherwise the legacy policy; nothing => null', () => {
  const politica = { triggerTokens: 150000, windowTokens: 200000, source: 'route-minimum' };
  assert.deepEqual(limiteCheAgisce({ budget: { triggerTokens: 130212, windowTokens: 200000 }, politica }), { soglia: 130212, finestra: 200000, fonte: 'motore' });
  assert.deepEqual(limiteCheAgisce({ politica }), { soglia: 150000, finestra: 200000, fonte: 'route-minimum' });
  assert.deepEqual(limiteCheAgisce({ politica: { triggerTokens: 200000, windowTokens: null, source: 'fallback' } }), { soglia: 200000, finestra: null, fonte: 'fallback' });
  assert.equal(limiteCheAgisce({}), null);
  assert.equal(limiteCheAgisce({ politica: { triggerTokens: 0, source: 'fallback' } }), null, 'a zero is not a limit');
  assert.equal(limiteCheAgisce({ politica: { triggerTokens: 1000, source: 'inventata' } }), null, 'an unknown source is not trusted');
});

test('C1-SCHEDA-PERCHE: one sentence per source; the unverified one never quotes a window', () => {
  assert.equal(percheDelLimite({ soglia: 1, finestra: 2, fonte: 'motore' }).chiave, 'processi.inspector.limitWhyEngine');
  assert.equal(percheDelLimite({ soglia: 1, finestra: 2, fonte: 'route-minimum' }).chiave, 'processi.inspector.limitWhyWindow');
  assert.equal(percheDelLimite({ soglia: 1, finestra: 2, fonte: 'explicit-cap' }).chiave, 'processi.inspector.limitWhyCap');
  assert.deepEqual(percheDelLimite({ soglia: 200000, finestra: 1050000, fonte: 'fallback' }), { chiave: 'processi.inspector.limitWhyUnverified', soglia: 200000, finestra: null });
  assert.equal(percheDelLimite(null), null);
});

test('C1-SCHEDA-RIPARTIZIONE: categories in order, as a share of the limit; the measure decides what is left; over the limit is said', () => {
  const r = ripartizioneSulLimite({ ripartizione: { categorie: [{ id: 'conversation', tokens: 50000 }, { id: 'tools', tokens: 19000 }, { id: 'inventata', tokens: 5 }] }, usati: 178247, limite: { soglia: 200000 } });
  assert.deepEqual(r.voci.map((v) => v.id), ['tools', 'conversation'], 'known categories only, in order');
  assert.equal(r.voci[0].percentuale, 9.5);
  assert.equal(r.restanti, 21753);
  assert.equal(r.oltre, false);
  assert.equal(ripartizioneSulLimite({ usati: 210000, limite: { soglia: 200000 } }).oltre, true);
  const senza = ripartizioneSulLimite({ ripartizione: { categorie: [{ id: 'tools', tokens: 10 }] }, usati: 100, limite: null });
  assert.equal(senza.voci[0].percentuale, null, 'the other way round: no limit, no percentages');
  assert.equal(senza.restanti, null);
});

test('C1-SCHEDA-COMPATTAZIONI: engine from committed jobs and the active version; legacy from its tally; none => null', () => {
  const motore = compattazioniDellaConversazione({ motore: { jobs: [{ state: 'committed' }, { state: 'failed' }, { state: 'committed' }], activeVersion: { createdAt: 'T', measurement: { inputTokens: 41000 } } } });
  assert.deepEqual(motore, { numero: 2, ultimaAl: 'T', livello: 'riassunto', tokenPrima: null, tokenDopo: 41000 });
  const legacy = compattazioniDellaConversazione({ legacy: { numero: 3, ultima: { at: 'L', tokenPrima: 184000, tokenDopo: 41000 } } });
  assert.deepEqual(legacy, { numero: 3, ultimaAl: 'L', livello: 'riassunto', tokenPrima: 184000, tokenDopo: 41000 });
  assert.equal(compattazioniDellaConversazione({}), null);
});

test('C1-SCHEDA-TENUTO: engine fields (requests, facts, index), legacy record (summary, index); a version from before says nothing about requests', () => {
  const m = cosaHaTenuto({ activeVersion: { retained: { personRequests: { total: 3, kept: [{ n: 1, text: 'usa SQLite' }] }, anchorIndex: 'INDICE' }, summary: { text: 'sintesi' } }, facts: [{ text: 'niente dipendenze', status: 'active' }, { text: 'tolto', status: 'removed' }] });
  assert.deepEqual(m, { richieste: { total: 3, kept: [{ n: 1, text: 'usa SQLite' }] }, fatti: ['niente dipendenze'], indice: 'INDICE', riassunto: 'sintesi', fonte: 'motore' });
  assert.equal(cosaHaTenuto({ activeVersion: { summary: { text: 's' } } }).richieste, null, 'an old version has no retained field');
  assert.deepEqual(cosaHaTenuto({ recordLegacy: { riassunto: 'R', indice: 'I' } }), { richieste: null, fatti: [], indice: 'I', riassunto: 'R', fonte: 'legacy' });
  assert.equal(cosaHaTenuto({}).fonte, null);
});

test('C1-CM-PANORAMICA: window scale, estimates brought back to the measure, free up to the limit, reserved apart and never counted as used', () => {
  const m = misuraDellaPanoramica({ usati: 98_000, limite: { soglia: 150_000, finestra: 200_000 },
    ripartizione: { categorie: [{ id: 'conversation', tokens: 74_000 }, { id: 'system', tokens: 4_000 }, { id: 'tools', tokens: 20_000 }, { id: 'inventata', tokens: 9 }] } });
  assert.equal(m.scala, 200_000);
  assert.deepEqual(m.segmenti.map((s) => s.id), ['system', 'tools', 'conversation'], 'known categories, in order');
  assert.equal(Math.round(m.segmenti.reduce((s, x) => s + x.pct, 0) * 10) / 10, 49, 'the segments add up to the measure (98k of 200k), not to the estimates');
  assert.equal(m.liberi, 52_000);
  assert.equal(m.riservati, 50_000);
  assert.equal(m.tacca, 75);
  assert.equal(m.pctUsati + m.pctLiberi + m.pctRiservati, 100);
  assert.equal(m.percentualeDelLimite, 65.3, 'the headline percentage is of the LIMIT, not of the window');
  assert.equal(m.oltre, false);
});

test('C1-CM-PANORAMICA-BORDI: over the limit is said; no window => the limit is the scale; no limit => no bar', () => {
  const oltre = misuraDellaPanoramica({ usati: 170_000, limite: { soglia: 150_000, finestra: 200_000 } });
  // review del bugfixer (Y3): uso + riservati VISIBILI = 100%, mai di più; la legenda tiene i riservati interi
  assert.equal(oltre.pctUsati + oltre.pctRiservatiVisibili, 100);
  assert.equal(oltre.riservati, 50_000);
  assert.equal(misuraDellaPanoramica({ usati: 250_000, limite: { soglia: 150_000, finestra: 200_000 } }).pctRiservatiVisibili, 0, 'past the window: nothing reserved is left to draw');
  assert.equal(oltre.oltre, true);
  assert.equal(oltre.liberi, 0);
  assert.equal(oltre.percentualeDelLimite, 113.3);
  const senzaFinestra = misuraDellaPanoramica({ usati: 50_000, limite: { soglia: 200_000, finestra: null } });
  assert.equal(senzaFinestra.scala, 200_000);
  assert.equal(senzaFinestra.riservati, null);
  assert.equal(senzaFinestra.tacca, null);
  assert.equal(misuraDellaPanoramica({ usati: 50_000, limite: null }), null);
  const senzaMisura = misuraDellaPanoramica({ usati: null, limite: { soglia: 150_000, finestra: 200_000 } });
  assert.equal(senzaMisura.liberi, null, 'unmeasured: free is not claimed');
  assert.equal(senzaMisura.percentualeDelLimite, null);
});

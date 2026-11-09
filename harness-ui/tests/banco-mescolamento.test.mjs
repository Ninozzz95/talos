/*
 * 02/11/2026, the night bench: the mixing test (`provaMescolamento`) counted as «another conversation's code» the conversation's OWN code
 * cut short by `max_tokens` (LFM2.5, famiglie-notte.jsonl rows 126-127: «ALFA-77-861» for ALFA-77-86131, «ALFA-57-324» for ALFA-57-32480).
 * Only a code that is not this conversation's, and not a piece of it, is a leak.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classificaRisposta, codiciAltrui, esitoSoloMescolamento, pressioneDiMemoria, regolaCambi, regolaMescolamento, regolaNonPeggiore, regolaTenuta, verdettoBraccio } from '../scripts/banco-regole.mjs';

test('BM-1 its own code cut short by the token limit is not a leak (the two LFM2.5 rows of 02/11)', () => {
  assert.deepEqual(codiciAltrui('ALFA-77-861The user says "Remember this code: ALFA-77-86131."', 'ALFA-77-86131'), []);
  assert.deepEqual(codiciAltrui('I don\'t have any code labeled "ALFA-57-324', 'ALFA-57-32480'), []);
});

test('BM-2 the other conversation\'s code, whole or cut, is a leak; so is an older code of the same side', () => {
  assert.deepEqual(codiciAltrui('The code is BETA-3-18482.', 'ALFA-3-23770'), ['BETA-3-18482']);
  assert.deepEqual(codiciAltrui('ALFA-3-23770 or maybe BETA-3-184', 'ALFA-3-23770'), ['BETA-3-184']);
  assert.deepEqual(codiciAltrui('ALFA-2-15851', 'ALFA-3-23770'), ['ALFA-2-15851']);
});

test('BM-3 a code that only starts like its own but goes on differently is a leak (ALFA-7-… is not a piece of ALFA-77-…)', () => {
  assert.deepEqual(codiciAltrui('ALFA-7-55446', 'ALFA-77-86131'), ['ALFA-7-55446']);
  assert.deepEqual(codiciAltrui('ALFA-77-86132', 'ALFA-77-86131'), ['ALFA-77-86132']);
});

test('BM-4 the guard reads the free RAM too: commit can be high while the machine is paging', () => {
  /* 02/11 08:49: ERNIE Q6 resident 19.2 GB, free RAM 1.0 GB, commit 15.4 GB: the commit guard did not see it */
  assert.deepEqual(pressioneDiMemoria({ impegnabileGb: 15.4, liberaGb: 1.0 }), { ferma: false, sottoPressione: true });
  assert.deepEqual(pressioneDiMemoria({ impegnabileGb: 4.9, liberaGb: 9 }), { ferma: true, sottoPressione: false });
  assert.deepEqual(pressioneDiMemoria({ impegnabileGb: 15, liberaGb: 5 }), { ferma: false, sottoPressione: false });
  assert.deepEqual(pressioneDiMemoria({ impegnabileGb: 15, liberaGb: Number.NaN }), { ferma: false, sottoPressione: false }, 'a missing reading says nothing');
});

/*
 * Performance's review of 34315597a (02/11): S2-1 the «sottoPressione» mark reached no rule; S2-2 its own code cut short fell into
 * «senzaCodice» and switched the whole mixing rule to «non misurato». Its rule of disturbed runs: a marked row never counts, it is redone.
 */
test('BM-5 (S2-2) an answer is classified: mixed, right, its own code cut short, or without the code', () => {
  assert.equal(classificaRisposta('BETA-3-18482', 'ALFA-3-23770'), 'mescolata');
  assert.equal(classificaRisposta('The code is ALFA-3-23770.', 'ALFA-3-23770'), 'giusta');
  assert.equal(classificaRisposta('ALFA-77-861The user says', 'ALFA-77-86131'), 'tagliata');
  assert.equal(classificaRisposta('Remembered.', 'ALFA-77-86131'), 'senza');
});

const pulita = { posti: 1, coppie: 100, mescolate: 0, senzaCodice: 0, ripristiniProvati: 100, motoreUsato: 'router' };
const quattro = { ...pulita, posti: 4, motoreUsato: 'oggi' };

test('BM-6 (S2-2) one answer cut short in a hundred does not switch the mixing rule off', () => {
  assert.equal(regolaMescolamento([{ ...pulita, tagliate: 1 }, quattro]).esito, 'passa');
  assert.equal(regolaMescolamento([{ ...pulita, senzaCodice: 1 }, quattro]).esito, 'non misurato', 'an answer with no code at all still proves nothing');
});

test('BM-7 (S2-1) a row marked under memory pressure never counts: mixing, hold and changes say «non misurato»', () => {
  assert.equal(regolaMescolamento([{ ...pulita, sottoPressione: true }, quattro]).dettagli[0].esito, 'non misurato');
  assert.equal(regolaTenuta({ crollo: true, prima: 100, ultima: 50, sottoPressione: true }).esito, 'non misurato', 'paging invents a collapse');
  assert.equal(regolaTenuta({ crollo: false, prima: 100, ultima: 99, sottoPressione: true }).esito, 'non misurato');
  const passi = Array.from({ length: 5 }, (_, i) => ({ modello: `m${i % 2}`, usataMiB: 1000, ripieghi: 0 }));
  assert.equal(regolaCambi({ passi, liberazione: { tornata: true } }).esito, 'passa');
  assert.equal(regolaCambi({ passi, liberazione: { tornata: true }, sottoPressione: true }).esito, 'non misurato');
});

test('BM-8 (S2-1) an arm with marked runs: they are set aside, and too few clean runs is «non misurato», never «non passa»', () => {
  const buona = { tutteOk: true, motoreUsato: 'oggi' };
  const v = verdettoBraccio({ braccio: 'm|nuovo', corse: [buona, buona, { ...buona, sottoPressione: true }], ripetizioni: 3 });
  assert.equal(v.esito, 'non misurato');
  assert.equal(v.passa, false);
  assert.equal(v.daRifare, 1);
  assert.equal(verdettoBraccio({ braccio: 'm|nuovo', corse: [buona, buona, buona, { ...buona, sottoPressione: true }], ripetizioni: 3 }).esito, 'passa');
  assert.equal(verdettoBraccio({ braccio: 'm|nuovo', corse: [buona, buona, { ...buona, tutteOk: false }], ripetizioni: 3 }).esito, 'non passa');
});

test('BM-9 (S2-1) «not worse» compares only clean runs', () => {
  const c = (avvioS, extra = {}) => ({ tutteOk: true, avvioS, primoSegnoFreddo: { primoSegnoMs: 100 }, ...extra });
  const base = [c(10), c(10), c(10)];
  assert.equal(regolaNonPeggiore(base, [c(10), c(10), c(30, { sottoPressione: true })]).esito, 'non misurato');
});

/* 02/11, owner: after Qwen, LFM2.5 is downloaded again and ONLY the mixing proof is redone (`--solo-mescolamento`): its outcome and exit code */
test('BM-10 the mixing-only run: pass exits 0, a leak exits 5, not measured exits 6', () => {
  assert.deepEqual(esitoSoloMescolamento([pulita, quattro]), { esito: 'passa', uscita: 0, regola: regolaMescolamento([pulita, quattro]) });
  assert.equal(esitoSoloMescolamento([{ ...pulita, mescolate: 1 }, quattro]).uscita, 5);
  assert.equal(esitoSoloMescolamento([{ ...pulita, senzaCodice: 2 }, quattro]).uscita, 6);
  assert.equal(esitoSoloMescolamento([pulita]).uscita, 6, 'the four-slot half missing is not a pass');
});

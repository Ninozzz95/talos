import test from 'node:test';
import assert from 'node:assert/strict';

import { raggruppaInHunk, CONTESTO_PREDEFINITO, TETTO_RIGHE_PREDEFINITO } from '../../src/components/diff-hunk.js';

/*
 * ⛔⛔ PO-11 — i pezzi del diff.
 *
 * La prova che conta non è «raggruppa»: è che su un file lungo con UNA modifica il lettore veda
 * quella modifica e non duemila righe. Il resto sono conseguenze.
 */

/** Un file di N righe uguali, con qualche cambiamento piantato dentro. */
function file(n, cambiamenti = {}) {
  const righe = [];
  for (let i = 1; i <= n; i += 1) {
    const c = cambiamenti[i];
    righe.push([c ?? 'ctx', c ? `${c} alla riga ${i}` : `riga ${i}`]);
  }
  return righe;
}

test('PO-11: una modifica in un file lungo mostra un pezzo solo, non il file', () => {
  const esito = raggruppaInHunk(file(2000, { 1000: 'add' }));
  assert.equal(esito.pezzi.length, 1);
  assert.equal(esito.aggiunte, 1);
  assert.equal(esito.rimozioni, 0);
  /* 3 righe prima + la riga + 3 dopo = 7, la convenzione di git e di cline. */
  assert.equal(esito.pezzi[0].righe.length, 1 + CONTESTO_PREDEFINITO * 2);
  assert.ok(esito.pezzi[0].righe.some((r) => r.tipo === 'add'));
});

test('PO-11: due modifiche vicine diventano UN pezzo, due lontane restano due', () => {
  const vicine = raggruppaInHunk(file(200, { 100: 'add', 104: 'add' }));
  assert.equal(vicine.pezzi.length, 1, 'separate da 3 righe uguali: si leggono meglio insieme');

  const lontane = raggruppaInHunk(file(200, { 100: 'add', 160: 'add' }));
  assert.equal(lontane.pezzi.length, 2, 'sessanta righe in mezzo non sono contesto: sono un altro punto del file');
});

/*
 * ⛔ Una riga TOLTA non esiste più nel file dopo la scrittura: non può avere un numero. Inventarlo
 * sarebbe una bugia piccola e quotidiana — la stessa scelta già fatta in formattaRigheConNumero.
 */
test('PO-11: una riga tolta non ha numero, e non sposta quelli delle altre', () => {
  const esito = raggruppaInHunk([['ctx', 'a'], ['del', 'b'], ['add', 'B'], ['ctx', 'c']]);
  const righe = esito.pezzi[0].righe;
  assert.equal(righe.find((r) => r.tipo === 'del').numero, null);
  assert.deepEqual(righe.filter((r) => r.numero !== null).map((r) => r.numero), [1, 2, 3]);
});

test('PO-11: il pezzo dice da quale riga a quale riga', () => {
  const esito = raggruppaInHunk(file(50, { 20: 'add' }));
  const p = esito.pezzi[0];
  assert.equal(p.daRiga, 17);
  assert.equal(p.aRiga, 23);
});

/* ⛔ Un taglio silenzioso fa credere che un file sia cambiato meno di quanto è cambiato. */
test('PO-11: oltre il tetto si taglia, e si DICE quanto resta fuori', () => {
  const cambiamenti = {};
  for (let i = 10; i < 400; i += 20) cambiamenti[i] = 'add';
  const esito = raggruppaInHunk(file(500, cambiamenti), { tetto: 40 });
  assert.equal(esito.tagliato, true);
  assert.ok(esito.pezziNascosti > 0, 'quanti pezzi non si vedono');
  assert.ok(esito.righeNascoste > 0, 'e quante righe');
  assert.ok(esito.aggiunte > esito.pezzi.length, '⛔ il conteggio totale resta VERO anche se la resa è tagliata');
});

test('PO-11: il primo pezzo si mostra sempre, anche se da solo supera il tetto', () => {
  const cambiamenti = {};
  for (let i = 10; i < 100; i += 1) cambiamenti[i] = 'add';
  const esito = raggruppaInHunk(file(200, cambiamenti), { tetto: 5 });
  assert.equal(esito.pezzi.length, 1, '⛔ mostrare zero righe non è una resa: è una pagina vuota');
  assert.ok(esito.pezzi[0].righe.length > 5);
});

/* ⛔ AL CONTRARIO: senza cambiamenti non si disegna un diff. Un file riscritto identico non è una modifica. */
test('PO-11, AL CONTRARIO: nessun cambiamento, nessun pezzo', () => {
  const esito = raggruppaInHunk(file(100));
  assert.deepEqual(esito.pezzi, []);
  assert.equal(esito.aggiunte, 0);
  assert.equal(esito.rimozioni, 0);
});

test('PO-11, AL CONTRARIO: ingressi vuoti o sbagliati non esplodono', () => {
  for (const brutto of [undefined, null, [], 'niente', 42, {}]) {
    const esito = raggruppaInHunk(brutto);
    assert.deepEqual(esito.pezzi, []);
    assert.equal(esito.tagliato, false);
  }
});

test('PO-11: un file NUOVO è tutte-aggiunte, un pezzo solo', () => {
  const righe = ['uno', 'due', 'tre'].map((t) => ['add', t]);
  const esito = raggruppaInHunk(righe);
  assert.equal(esito.pezzi.length, 1);
  assert.equal(esito.aggiunte, 3);
  assert.equal(esito.rimozioni, 0);
  assert.deepEqual(esito.pezzi[0].righe.map((r) => r.numero), [1, 2, 3]);
});

test('PO-11: contesto a zero mostra solo le righe cambiate', () => {
  const esito = raggruppaInHunk(file(50, { 20: 'add' }), { contesto: 0 });
  assert.equal(esito.pezzi[0].righe.length, 1);
  assert.equal(esito.pezzi[0].righe[0].tipo, 'add');
});

test('PO-11: il tetto predefinito è dichiarato e sensato', () => {
  assert.equal(CONTESTO_PREDEFINITO, 3);
  assert.ok(TETTO_RIGHE_PREDEFINITO >= 100, 'un tetto troppo basso taglia diff normali');
});

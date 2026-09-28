/*
 * grafo-storia.test.mjs — F6-2 passo 3 (27/09/2026): le corsie e le righe «In arrivo» / «In uscita» del grafo di «Commit recenti»,
 * portate da VS Code `scmHistory.ts` (MIT). La forma dei dati veri (`git log --topo-order HEAD @{u}`) la prova il servizio in
 * `harness-ui/tests/git-service-remoto.test.mjs` («F6-2 p3»); qui i casi costruiti, uno per regola.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ID_IN_ARRIVO, ID_IN_USCITA, disegnoDellaRiga, righeDelGrafo, soloDelRemoto } from '../../src/components/grafo-storia.js';

const lin = (...ids) => ids.map((id, i) => ({ commit: id, padri: ids[i + 1] ? [ids[i + 1]] : [] }));
const tipi = (righe) => righe.map((r) => `${r.tipo}:${r.id}`);

test('GRAFO-01 — allineati: nessuna riga in più, tutto in una corsia', () => {
  const righe = righeDelGrafo(lin('c3', 'c2', 'c1'), { testa: 'c3', remoto: 'c3', base: 'c3' });
  assert.deepEqual(tipi(righe), ['testa:c3', 'nodo:c2', 'nodo:c1']);
  assert.ok(righe.every((r) => r.uscita.length <= 1));
  assert.equal(righe[0].uscita[0].colore, 'locale');
});

test('GRAFO-02 — avanti di 2: «In uscita» sopra HEAD, niente «In arrivo»', () => {
  const righe = righeDelGrafo(lin('l2', 'l1', 'b', 'a'), { testa: 'l2', remoto: 'b', base: 'b' });
  assert.deepEqual(tipi(righe), [`in-uscita:${ID_IN_USCITA}`, 'testa:l2', 'nodo:l1', 'nodo:b', 'nodo:a']);
  assert.deepEqual(righe[0].uscita.map((n) => n.id), ['l2'], 'la corsia di «In uscita» scende su HEAD');
  assert.deepEqual(righe[1].ingresso.map((n) => n.id), ['l2']);
});

test('GRAFO-03 — indietro di 2: «In arrivo» subito sopra la base, sulla corsia del remoto; niente «In uscita»', () => {
  const righe = righeDelGrafo(lin('r2', 'r1', 'b', 'a'), { testa: 'b', remoto: 'r2', base: 'b' });
  assert.deepEqual(tipi(righe), ['nodo:r2', 'nodo:r1', `in-arrivo:${ID_IN_ARRIVO}`, 'testa:b', 'nodo:a']);
  assert.equal(righe[0].uscita[0].colore, 'remoto');
  assert.deepEqual(righe[1].uscita.map((n) => n.id), [ID_IN_ARRIVO], 'il remoto scende su «In arrivo», non sulla base');
  assert.deepEqual(righe[2].uscita.map((n) => n.id), ['b']);
});

test('GRAFO-04 — divergenti: tutte e due, ciascuna al suo posto', () => {
  const commit = [
    { commit: 'r1', padri: ['b'] },
    { commit: 'l1', padri: ['b'] },
    { commit: 'b', padri: ['a'] },
    { commit: 'a', padri: [] },
  ];
  const righe = righeDelGrafo(commit, { testa: 'l1', remoto: 'r1', base: 'b' });
  assert.deepEqual(tipi(righe), ['nodo:r1', `in-uscita:${ID_IN_USCITA}`, 'testa:l1', `in-arrivo:${ID_IN_ARRIVO}`, 'nodo:b', 'nodo:a']);
  const colori = righe.find((r) => r.id === 'l1').uscita.map((n) => n.colore);
  assert.ok(colori.includes('locale') && colori.includes('remoto'), 'due corsie, una per lato');
});

test('GRAFO-05 — AL CONTRARIO: senza remoto o senza base, nessuna riga finta', () => {
  assert.deepEqual(tipi(righeDelGrafo(lin('c2', 'c1'), { testa: 'c2' })), ['testa:c2', 'nodo:c1']);
  assert.deepEqual(tipi(righeDelGrafo(lin('c2', 'c1'), { testa: 'c2', remoto: 'c1' })), ['testa:c2', 'nodo:c1']);
});

test('GRAFO-06 — già unito (vscode#276064): se la riga sopra la base è un unione che ha la base per genitore, niente «In arrivo»', () => {
  const unito = [
    { commit: 'm', padri: ['b', 'y'] },
    { commit: 'b', padri: ['a'] },
    { commit: 'y', padri: ['a'] },
    { commit: 'a', padri: [] },
  ];
  assert.equal(righeDelGrafo(unito, { testa: 'b', remoto: 'm', base: 'b' }).filter((r) => r.tipo === 'in-arrivo').length, 0);
  // al contrario: stessa forma, ma sopra la base c'è un commit semplice
  const semplice = [{ commit: 'r', padri: ['b'] }, { commit: 'b', padri: ['a'] }, { commit: 'a', padri: [] }];
  assert.equal(righeDelGrafo(semplice, { testa: 'b', remoto: 'r', base: 'b' }).filter((r) => r.tipo === 'in-arrivo').length, 1);
});

test('GRAFO-07 — due radici: la seconda linea non si interrompe a metà (VS Code la lasciava cadere)', () => {
  const commit = [
    { commit: 'm', padri: ['a2', 'b2'] },
    { commit: 'a2', padri: ['a1'] },
    { commit: 'a1', padri: [] },
    { commit: 'b2', padri: ['b1'] },
    { commit: 'b1', padri: [] },
  ];
  const righe = righeDelGrafo(commit, { testa: 'm' });
  const dopoA1 = righe.find((r) => r.id === 'a1').uscita.map((n) => n.id);
  assert.deepEqual(dopoA1, ['b2'], 'la corsia di b2 sopravvive alla radice a1');
});

test('GRAFO-08 — il disegno a 22 px è quello di VS Code: cerchio al centro della sua corsia, riga verticale', () => {
  const righe = righeDelGrafo(lin('c2', 'c1'), { testa: 'c2', remoto: 'c2', base: 'c2' });
  const d = disegnoDellaRiga(righe[1], 22);
  assert.deepEqual(d.cerchi.map((c) => [c.cx, c.cy, c.r]), [[11, 11, 5]]);
  assert.ok(d.tratti.some((t) => t.d === 'M 11 0 V 11'));
  assert.equal(d.larghezza, 22);
  const alta = disegnoDellaRiga(righe[1], 40);
  assert.deepEqual(alta.cerchi.map((c) => [c.cx, c.cy]), [[11, 20]], 'a 40 px il centro scende a metà');
  const testa = disegnoDellaRiga(righe[0], 22);
  assert.deepEqual(testa.cerchi.map((c) => c.ruolo), ['esterno', 'foro']);
});

test('GRAFO-09 — soloDelRemoto: i commit da scaricare sono quelli del remoto che HEAD non raggiunge; allineati o senza remoto, nessuno', () => {
  const commit = [
    { commit: 'r2', padri: ['r1'] }, { commit: 'r1', padri: ['b'] },
    { commit: 'l1', padri: ['b'] }, { commit: 'b', padri: ['a'] }, { commit: 'a', padri: [] },
  ];
  assert.deepEqual([...soloDelRemoto(commit, { testa: 'l1', remoto: 'r2' })].sort(), ['r1', 'r2']);
  assert.deepEqual([...soloDelRemoto(commit, { testa: 'r2', remoto: 'r2' })], []);
  assert.deepEqual([...soloDelRemoto(commit, { testa: 'l1', remoto: null })], []);
  // HEAD fuori dalla finestra (il remoto è molto avanti): i commit del remoto nella finestra sono tutti da scaricare
  assert.deepEqual([...soloDelRemoto(commit.slice(0, 2), { testa: 'l1', remoto: 'r2' })].sort(), ['r1', 'r2']);
});

test('GRAFO-10 — il segnaposto sotto un commit aperto: le sue corsie d uscita proseguono dritte, nessun cerchio', async () => {
  const { disegnoSegnaposto } = await import('../../src/components/grafo-storia.js');
  const d = disegnoSegnaposto([{ id: 'x', colore: 'remoto' }, { id: 'y', colore: 'locale' }], 32);
  assert.deepEqual(d.tratti, [{ colore: 'remoto', d: 'M 11 0 V 32' }, { colore: 'locale', d: 'M 22 0 V 32' }]);
  assert.deepEqual([d.larghezza, d.altezza, d.cerchi.length], [33, 32, 0]);
  assert.deepEqual(disegnoSegnaposto([], 32).tratti, [], 'la radice non ha corsie che scendono');
});

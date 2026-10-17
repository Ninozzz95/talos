/*
 * 13/10/2026 (bugfixer, lotto 2) — review avversaria dell'adattatore delle deleghe: il verso contrario dei filtri INSIEME, e la
 * riproduzione dal registro. Ogni prova qui è nata rossa sul codice di `8f846ef9a`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { runDalleDeleghe, storiaDallaCronologia } from '../../src/components/grafo/run-dalle-deleghe.js';

const T0 = Date.parse('2026-10-13T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, taskCorto: `Compito ${id}`, ...extra });
const finita = (id, nascita, fine, extra = {}) => figlia(id, nascita, { conclusa: true, conclusaAlle: at(fine), esitoDelega: 'concluso', ...extra });
const MADRE_FINITA = { sessionId: 'madre', avviataAlle: at(0), conclusa: true, ultimaRispostaAlle: at(30), taskCorto: 'Conversazione' };
const MADRE_VIVA = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };

test('DELEGHE-REVIEW-01 — lo stato in cima è della CONVERSAZIONE, non di ciò che il filtro lascia vedere: un agente nascosto che lavora la tiene «in corso»', () => {
  const figli = [finita('a', 10, 20), figlia('b', 11)]; // la conversazione ha risposto, «b» lavora ancora
  assert.equal(runDalleDeleghe({ corrente: MADRE_FINITA, figli }).panoramica.status, 'running');
  assert.equal(runDalleDeleghe({ corrente: MADRE_FINITA, figli }, { stato: 'finished' }).panoramica.status, 'running', 'col filtro «finiti» «b» sparisce dal diagramma, non dal mondo');
  assert.equal(runDalleDeleghe({ corrente: MADRE_FINITA, figli }, { isolato: 'a' }).panoramica.status, 'running', 'isolando «a», «b» lavora ancora');
  /* anche un agente di un'ALTRA richiesta: la scheda in cima è la conversazione intera */
  const richieste = [{ id: 'r1', at: T0 + 5_000, testo: 'prima' }, { id: 'r2', at: T0 + 400_000, testo: 'seconda' }];
  const dueRichieste = [finita('a', 10, 20), figlia('c', 410)];
  assert.equal(runDalleDeleghe({ corrente: MADRE_FINITA, figli: dueRichieste }, { richieste, richiesta: 'r1' }).panoramica.status, 'running');
  // AL CONTRARIO: quando davvero nessuno lavora, un filtro non la riaccende
  const fermi = [finita('a', 10, 20), finita('b', 11, 25)];
  assert.equal(runDalleDeleghe({ corrente: MADRE_FINITA, figli: fermi }, { stato: 'working' }).panoramica.status, 'succeeded');
  assert.equal(runDalleDeleghe({ corrente: MADRE_FINITA, figli: fermi }).panoramica.status, 'succeeded');
  // e una conversazione della stessa CARTELLA che lavora non è un suo agente: non la tiene in corso
  const conCartella = { ...MADRE_FINITA, cartella: 'C:/p' };
  const altra = [{ sessionId: 'altra', avviataAlle: at(1), conclusa: false, cartella: 'C:/p', taskCorto: 'Altra' }];
  assert.equal(runDalleDeleghe({ corrente: conCartella, sessioni: altra, figli: fermi }, { ambito: 'cartella' }).panoramica.status, 'succeeded');
});

test('DELEGHE-REVIEW-02 — con un ramo isolato le voci del menu dello stato contano DENTRO il ramo: una voce accesa non svuota mai il diagramma', () => {
  const figli = [figlia('a', 10), finita('b', 11, 20, { esitoDelega: 'fallito' }), finita('c', 12, 21, { esitoDelega: 'fallito' }),
    { sessionId: 'n1', padreId: 'a', avviataAlle: at(50), conclusa: true, conclusaAlle: at(60), esitoDelega: 'concluso' }];
  const tutti = runDalleDeleghe({ corrente: MADRE_VIVA, figli }).panoramica.filtro;
  assert.deepEqual(tutti.conti, { all: 4, working: 1, waiting: 0, failed: 2, finished: 1 });
  const isolato = runDalleDeleghe({ corrente: MADRE_VIVA, figli }, { isolato: 'a' }).panoramica.filtro;
  assert.deepEqual(isolato.conti, { all: 2, working: 1, waiting: 0, failed: 0, finished: 1 }, 'nel ramo di «a» ci sono «a» e «n1»: nessun fallito da scegliere');
  assert.equal(isolato.inTutto, 4, '«Si vedono N di M»: M resta il totale della conversazione');
  assert.equal(isolato.mostrati, 2);
  /* la regola, per ogni combinazione di stato dentro un ramo: conto > 0 ⇔ scegliendolo si vede qualcuno */
  for (const ramo of [null, 'a', 'b']) {
    const conti = runDalleDeleghe({ corrente: MADRE_VIVA, figli }, { isolato: ramo }).panoramica.filtro.conti;
    for (const stato of ['working', 'waiting', 'failed', 'finished']) {
      const visti = runDalleDeleghe({ corrente: MADRE_VIVA, figli }, { isolato: ramo, stato }).tutte.length;
      assert.equal(visti, conti[stato], `ramo ${ramo}, stato ${stato}: il conto del menu è ciò che si vedrà`);
    }
  }
});

test('DELEGHE-REVIEW-03 — riproduzione: un agente che il diagramma non mostra (filtro, altra richiesta) e che lavora ancora tiene il run «in corso»', () => {
  const run = runDalleDeleghe({ corrente: MADRE_FINITA, figli: [finita('a', 10, 20), finita('nascosto', 11, 90)] }, { isolato: 'a' });
  const faseDi = new Map(run.tutte.map((x) => [x.nodeId, x.phaseId]));
  const nodo = (id, extra) => ({ sessionId: id, padreId: id === 'madre' ? null : 'madre', avviataAlle: at(id === 'madre' ? 0 : 10), conclusa: false, ...extra });
  const record = [
    { seq: 1, at: at(1), node: nodo('madre') }, { seq: 2, at: at(10), node: nodo('a') }, { seq: 3, at: at(11), node: nodo('nascosto') },
    { seq: 4, at: at(20), node: nodo('a', { conclusa: true, esitoDelega: 'concluso' }) },
    { seq: 5, at: at(30), node: nodo('madre', { conclusa: true }) },                                    // la conversazione risponde: «nascosto» lavora ancora
    { seq: 6, at: at(90), node: nodo('nascosto', { conclusa: true, esitoDelega: 'concluso' }) },
  ];
  const storia = storiaDallaCronologia(record, { radice: 'madre', nodoDi: run.nodoDi, faseDi, agenti: run.agenti });
  assert.deepEqual(storia.filter((v) => v.scope === 'run').map((v) => [v.state, v.at]), [['running', at(1)], ['succeeded', at(90)]], 'riuscito solo quando ha finito anche chi non si vede');
  assert.deepEqual(storia.filter((v) => v.scope === 'node').map((v) => v.nodeId), [run.nodoDi.get('a'), run.nodoDi.get('a')], 'chi non è nel diagramma non ha voci sue');
  assert.deepEqual(storia.map((v) => v.seq), storia.map((_, i) => i + 1));
  // AL CONTRARIO: un agente del registro che la conversazione oggi non ha più (eliminato) non tiene il run in corso per sempre
  const senza = storiaDallaCronologia(record, { radice: 'madre', nodoDi: run.nodoDi, faseDi, agenti: new Set(['a']) });
  assert.deepEqual(senza.filter((v) => v.scope === 'run').map((v) => [v.state, v.at]), [['running', at(1)], ['succeeded', at(30)]]);
});

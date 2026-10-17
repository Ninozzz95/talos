/*
 * L3-15 (bugfixer, 15/10/2026) — «5 di 6 terminati» nel pannello Agenti contro «6 di 6 terminati» nel diagramma, sullo stesso gruppo
 * (foto del 4174, 13/10). Erano due definizioni di «terminato»: il pannello contava solo la riuscita (e ci metteva dentro l'esito
 * incerto), il diagramma ogni stato finale. Ora il pannello conta come il diagramma (`contoDellaRichiesta`, inspector.js), e questa
 * prova lo tiene vero su ogni combinazione: un conto solo, letto da due posti.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { contoDellaRichiesta } from '../../src/components/inspector.js';
import { runDalleDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';

const T0 = Date.parse('2026-10-13T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const MADRE = { sessionId: 'madre', avviataAlle: at(0), conclusa: true, ultimaRispostaAlle: at(300), taskCorto: 'Conversazione' };
const TIPI = {
  riuscito: { conclusa: true, esitoDelega: 'concluso' },
  fallito: { conclusa: true, esitoDelega: 'fallito' },
  errore: { conclusa: true, ultimoEsito: 'errore' },
  fermato: { conclusa: true, interrotta: true },
  fermatoDaMotivo: { conclusa: true, motivoChiusura: 'fermata' },
  incerto: { conclusa: true, esitoDelega: 'incerto' },
  inPausa: { conclusa: false, esitoDelega: 'in-pausa' },
  inCorso: { conclusa: false },
  inAttesa: { conclusa: false, inAttesaApprovazione: true },
};
const figlio = (id, tipo, i) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(10 + i), conclusaAlle: TIPI[tipo].conclusa ? at(100 + i) : undefined, taskCorto: `Compito ${id}`, ...TIPI[tipo] });
const diagramma = (figli) => runDalleDeleghe({ corrente: MADRE, figli }).panoramica;
/* la regola del pannello PRIMA della cura (inspector.js @ 139ce49ce): solo `statoDelega(a) === 'conclusa'` */
const primaDellaCura = (figli) => figli.filter((a) => a.conclusa === true && a.interrotta !== true && a.motivoChiusura !== 'fermata'
  && !['errore', 'error', 'fallito', 'failed', 'rifiutato'].includes(a.ultimoEsito || a.esitoDelega)).length;

test('L3-15-01 — il caso della foto: cinque riusciti e uno fermato. Prima «5 di 6» contro «6 di 6»; ora tutti e due «6 di 6»', () => {
  const figli = ['riuscito', 'riuscito', 'riuscito', 'riuscito', 'riuscito', 'fermato'].map((t, i) => figlio(`a${i}`, t, i));
  const d = diagramma(figli);
  assert.deepEqual({ fatti: d.delegated.terminated, totale: d.delegated.total }, { fatti: 6, totale: 6 });
  assert.equal(primaDellaCura(figli), 5, 'il difetto, misurato sulla regola di prima');
  assert.deepEqual(contoDellaRichiesta(figli), { totale: 6, terminati: 6, daControllare: 0 });
});

test('L3-15-02 — su ogni combinazione di due stati (81) e su un gruppo di tutti e nove, il pannello conta come il diagramma', () => {
  const nomi = Object.keys(TIPI);
  const gruppi = [nomi];
  for (const x of nomi) for (const y of nomi) gruppi.push([x, y]);
  for (const tipi of gruppi) {
    const figli = tipi.map((t, i) => figlio(`f${i}`, t, i));
    const d = diagramma(figli);
    const p = contoDellaRichiesta(figli);
    assert.equal(p.terminati, d.delegated.terminated, `terminati per ${tipi.join('+')}`);
    assert.equal(p.totale, d.delegated.total, `totale per ${tipi.join('+')}`);
    assert.equal(p.daControllare, d.attention, `da controllare per ${tipi.join('+')}`);
  }
  /* AL CONTRARIO: l'incerto NON è terminato (aspetta una verifica) e va controllato; il fallito è terminato e va controllato */
  assert.deepEqual(contoDellaRichiesta([figlio('i', 'incerto', 0)]), { totale: 1, terminati: 0, daControllare: 1 });
  assert.deepEqual(contoDellaRichiesta([figlio('f', 'fallito', 0)]), { totale: 1, terminati: 1, daControllare: 1 });
  assert.deepEqual(contoDellaRichiesta([figlio('p', 'inPausa', 0), figlio('c', 'inCorso', 1)]), { totale: 2, terminati: 0, daControllare: 0 });
});

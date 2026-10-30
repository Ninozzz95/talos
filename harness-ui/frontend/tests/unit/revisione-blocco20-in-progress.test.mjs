/*
 * Revisione avversaria del blocco 20 (29/10/2026), `fix/in-progress` 57e7a2ba8: «Every English state label becomes In progress». Le
 * chiavi qui sotto sono STATI (non verbi) che l'interfaccia mostra oggi — elenco delle sessioni (`session-item.js:53`), segmento delle
 * attività (`attivita-segmento.js:285`), cronologia (`cronologia.js:189`), dettaglio della ricerca (`ricerca-dettaglio.js:1348`), ispettore
 * (`inspector.js:229`) — e in inglese dicono ancora «running». ROSSA sul candidato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import processi from '../../src/i18n/testi/processi.js';
import chat from '../../src/i18n/testi/chat.js';
import sezioni from '../../src/i18n/testi/sezioni.js';

import { readFileSync } from 'node:fs';

/* «Ferma» della riga viva del riassunto (B1, «lo stesso Stop del compositore») chiama `stopRealSession()` nuda: con agenti al lavoro non
   chiede «tutto o solo la chat» e ignora la scelta ricordata «Ferma tutto». ROSSA sul candidato (app.js, `opzioniRigaViva`). */
test('RV20-STOP-01 il «Ferma» della riga viva del riassunto passa dalla stessa decisione dello Stop del compositore', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const riga = app.split('\n').find((r) => r.includes('const opzioniRigaViva = '));
  assert.ok(riga, 'premessa: la riga esiste');
  assert.doesNotMatch(riga, /onFerma: \(\) => \{ void stopRealSession\(\); \}/u, 'onFerma salta decidiStop/fermaDalPulsante');
});

test('RV20-IP-01 gli stati inglesi mostrati a schermo non dicono più «running»', () => {
  const rimasti = Object.entries({
    'processi.session.stateRunning': processi.en['session.stateRunning'],
    'processi.inspector.turnRunning': processi.en['inspector.turnRunning'],
    'chat.activity.state.running': chat.en['activity.state.running'],
    'chat.timeline.running': chat.en['timeline.running'],
    'sezioni.research.stepState.running': sezioni.en['research.stepState.running'],
  }).filter(([, valore]) => /\brunning\b/iu.test(String(valore)));
  assert.deepEqual(rimasti, [], 'stati ancora «running» accanto agli «In progress» della stessa interfaccia');
});

/*
 * ⭐ /goal G5 — il confutatore, la sola parte pura (`src/obiettivo/confutatore.mjs`): la consegna per la figlia e la lettura del suo
 * esito. Nei due versi: «regge» solo con `refuted: false`; una smentita conta solo con una prova; tutto il resto è «senza esito».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GIRI_DEL_CONFUTATORE, SMENTITE_MASSIME, consegnaDelConfutatore, esitoDelConfutatore, testoDellaSmentita } from '../src/obiettivo/confutatore.mjs';

test('CONFUTA-01 — le decisioni dell\'owner sono i numeri del modulo', () => {
  assert.equal(GIRI_DEL_CONFUTATORE, 8);
  assert.equal(SMENTITE_MASSIME, 2);
});

test('CONFUTA-02 — «regge» e «smentito» con prove', () => {
  assert.deepEqual(esitoDelConfutatore('I checked.\n{"refuted": false, "reason": "tests and README match the goal"}'), { esito: 'regge', motivo: 'tests and README match the goal' });
  const s = esitoDelConfutatore('{"refuted": true, "reason": "login still accepts empty passwords", "evidence": [{"path": "src/auth.js", "line": 40}, {"command": "npm test", "exit_code": 1}]}');
  assert.equal(s.esito, 'smentito');
  assert.deepEqual(s.prove, [{ percorso: 'src/auth.js', riga: 40 }, { comando: 'npm test', codice: 1 }]);
});

test('CONFUTA-03 AL CONTRARIO — senza un esito leggibile, indeciso, o con una smentita senza prove: mai «regge»', () => {
  const casi = [
    ['', 'refuter-unreadable'],
    ['Looks fine to me.', 'refuter-unreadable'],
    ['{"refuted": null, "reason": "could not run the tests"}', 'could not run the tests'],
    ['{"refuted": "no"}', 'refuter-undecided'],
    ['{"refuted": true, "reason": "feels incomplete"}', 'refutation-without-evidence'],
    ['{"refuted": true, "reason": "x", "evidence": [{"command": "npm test"}]}', 'refutation-without-evidence'],
  ];
  for (const [testo, motivo] of casi) assert.deepEqual(esitoDelConfutatore(testo), { esito: 'senza-esito', motivo }, testo);
});

test('CONFUTA-04 AL CONTRARIO — conta l\'ULTIMO oggetto con «refuted»: un JSON del lavoro citato prima non decide', () => {
  const testo = 'The file says {"refuted": false} but that is data.\nMy verdict:\n{"refuted": true, "reason": "missing test", "evidence": [{"path": "test/a.js"}]}';
  assert.equal(esitoDelConfutatore(testo).esito, 'smentito');
  const alContrario = 'Found {"refuted": true, "evidence": [{"path": "x"}]} in a log.\n{"refuted": false, "reason": "ok"}';
  assert.equal(esitoDelConfutatore(alContrario).esito, 'regge');
});

test('CONFUTA-05 — la consegna: sola lettura, i comandi del contratto, i dati come JSON non fidato, il formato alla fine', () => {
  const c = consegnaDelConfutatore({
    obiettivo: { testo: 'Add login', contratto: { criteri: [{ id: 'c1', testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test', uscita: 0 } }] } },
    verdetti: [{ id: 'c1', esito: 'verde', uscita: { coda: 'ok 12 tests' } }],
    scritti: ['src/login.js'],
  });
  assert.match(c, /READ-ONLY/u);
  assert.match(c, /untrusted data/u);
  assert.match(c, /"npm test"/u);
  assert.match(c, /src\/login\.js/u);
  assert.match(c, /\{"refuted": false, "reason": "what you checked"\}/u);
});

test('CONFUTA-06 AL CONTRARIO — un messaggio pieno di «"refuted"» rotti non blocca il server: il tetto dei tentativi chiude «senza esito»', () => {
  const rotto = '{"refuted": tru} '.repeat(1_200); // ~20 KB: ogni occorrenza ha decine di graffe vicine, nessuna si legge
  const inizio = performance.now();
  const esito = esitoDelConfutatore(rotto);
  const ms = performance.now() - inizio;
  assert.equal(esito.esito, 'senza-esito');
  assert.ok(ms < 500, `reading took ${Math.round(ms)} ms`);
});

test('CONFUTA-07 — la frase della smentita dice da dove veniva il «sì»: le prove del contratto, o il giudice sul testo (pavimento)', () => {
  const confutazione = { esito: 'smentito', alle: '2026-10-15T10:00:00.000Z', motivo: 'login accepts empty passwords', prove: [{ percorso: 'src/auth.js', riga: 40 }] };
  const conContratto = testoDellaSmentita({ testo: 'add login', contratto: { criteri: [] }, confutazione });
  assert.match(conContratto, /Every check of the goal contract passed/u);
  const pavimento = testoDellaSmentita({ testo: 'add login', confutazione });
  assert.match(pavimento, /The TALOS judge saw the goal met/u);
  assert.doesNotMatch(pavimento, /contract/u, 'senza contratto la frase non parla di un contratto che non c\'è');
});

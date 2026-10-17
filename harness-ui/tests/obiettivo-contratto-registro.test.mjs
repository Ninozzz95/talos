/*
 * ⭐⭐⭐ /goal, fase G2 (piano approvato dall'owner il 14/10/2026) — IL CONTRATTO NEL REGISTRO VERO: nasce con l'obiettivo, si
 *   allarga liberamente, si restringe solo con la conferma, sopravvive al riavvio, e un contratto ritoccato sul disco non vale.
 *
 * La forma del contratto ha le sue prove (`obiettivo-contratto.test.mjs`); qui il cablaggio: che cosa arriva sul giornale, che
 * cosa sente chi ascolta, che cosa resta quando una porta rifiuta.
 * Da dove viene la regola della conferma: opencode-goal-plugin `src/goal-plan.ts:54-136` («removing planned scope requires
 * concrete revisit evidence»); Codex la affida a una frase del prompt (`templates/goals/continuation.md`, «do not substitute a
 * narrower … solution»). Qui è una porta che rifiuta. Letti nel codice il 12/10/2026.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { attendiScritture, registraRiga } from '../src/session-store.mjs';
import { CRITERI_MASSIMI, contrattoValido, nuovoContratto } from '../src/obiettivo/contratto.mjs';
import { nuovoObiettivo, rigaObiettivo } from '../src/obiettivo/stato.mjs';
import { TRE_CRITERI, ascolta, conStore, conversazioneFerma, registroAGiri, riavvia, righeObiettivo } from './aiuto/banco-obiettivo.mjs';

const forma = (r) => ({ code: r.code, reason: r.reason, ...(r.params ? { params: r.params } : {}) });
const inPiu = { testo: 'The linter is clean', verifica: { tipo: 'comando', comando: 'npm run lint' } };

test('GOAL-CREG-01 — a goal set with its criteria carries the contract: on the journal, to who listens, and the same after a restart', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const annunci = ascolta(banco.registro, sessionId);
  const giriPrima = banco.giri.length;
  const esito = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  const { contratto } = esito.obiettivo;
  assert.deepEqual(contratto.criteri.map((c) => [c.id, c.verifica.tipo]), [['c1', 'comando'], ['c2', 'file'], ['c3', 'giudizio']]);
  assert.equal(contratto.criteri[0].verifica.uscita, 0);
  assert.equal(contrattoValido(contratto), true);
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => r.obiettivo.contratto), [contratto]);
  assert.deepEqual(annunci.map((v) => v.obiettivo.contratto.impronta), [contratto.impronta]);
  assert.equal(banco.giri.length, giriPrima, 'G2: a contract starts nothing either');

  const secondo = await riavvia(cartellaStore);
  const dopo = secondo.registro.statoObiettivo(sessionId).obiettivo;
  assert.deepEqual(dopo.contratto, contratto, 'the contract comes back as it was');
  assert.equal(dopo.stato, 'in-pausa');
  // un obiettivo SENZA criteri resta possibile (porta della G1): non ha un contratto, e lo dice non avendolo
  const altra = await conversazioneFerma(banco);
  const senza = await banco.registro.impostaObiettivo(altra, 'no criteria yet');
  assert.equal('contratto' in senza.obiettivo, false);
}));

test('GOAL-CREG-02 — AL CONTRARIO: one malformed criterion and the goal is NOT born — the refusal says which criterion and why, and nothing is written', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const annunci = ascolta(banco.registro, sessionId);
  const casi = [
    [[TRE_CRITERI[0], { testo: 'always green', verifica: { tipo: 'comando', comando: 'npm test || true' } }], { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-command-not-attributable', params: { posizione: 2, operatore: '||' } }],
    [[{ testo: 'outside', verifica: { tipo: 'file', percorso: '../secrets.txt', fatto: 'esiste' } }], { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-path-outside', params: { posizione: 1 } }],
    [[TRE_CRITERI[0], TRE_CRITERI[1], { testo: '', verifica: { tipo: 'giudizio' } }], { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-text-invalid', params: { posizione: 3 } }],
    [[], { code: 'GOAL_CONTRACT_INVALID', reason: 'contract-empty' }],
    [Array.from({ length: CRITERI_MASSIMI + 1 }, (_, i) => ({ testo: `criterion ${i + 1}`, verifica: { tipo: 'giudizio' } })), { code: 'GOAL_CONTRACT_INVALID', reason: 'contract-too-many-criteria', params: { massimo: CRITERI_MASSIMI } }],
    [[{ testo: 'two lines', verifica: { tipo: 'comando', comando: 'npm test\necho ok' } }], { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-command-multiline', params: { posizione: 1 } }],
    [[{ testo: 'open quote', verifica: { tipo: 'comando', comando: 'echo "x' } }], { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-command-unreadable', params: { posizione: 1 } }],
  ];
  for (const [criteri, atteso] of casi) {
    assert.deepEqual(forma(await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri })), atteso, atteso.reason);
  }
  const frase = await banco.registro.impostaObiettivo(sessionId, 'x', { criteri: casi[0][0] });
  assert.equal(frase.erroreAvvio, 'Criterion 2: the exit code of this command would not tell how it went. Remove ||', 'the English sentence carries position and operator');
  await attendiScritture({ cartellaStore });
  assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null }, 'no goal was born');
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId), []);
  assert.deepEqual(annunci, []);
  // e il testo dell'obiettivo si guarda lo stesso: criteri buoni non salvano un testo vuoto
  assert.deepEqual(forma(await banco.registro.impostaObiettivo(sessionId, '   ', { criteri: [...TRE_CRITERI] })), { code: 'GOAL_TEXT_INVALID', reason: 'goal-text-empty' });
}));

test('GOAL-CREG-03 — adding criteria is FREE: they go after the others with the next ids, the answer says what was added, and a goal without a contract gets its first one', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  const annunci = ascolta(banco.registro, sessionId);
  const esito = await banco.registro.aggiungiCriteriObiettivo(sessionId, [inPiu, { testo: 'Docs updated', verifica: { tipo: 'giudizio' } }]);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.deepEqual(esito.cambio, { aggiunti: ['c4', 'c5'], tolti: [], cambiati: [] });
  assert.deepEqual(esito.obiettivo.contratto.criteri.slice(0, 3), obiettivo.contratto.criteri, 'the old criteria are untouched');
  assert.equal(esito.obiettivo.revisione, 2);
  assert.equal(esito.obiettivo.id, obiettivo.id, 'the same goal: more is asked of it');
  assert.notEqual(esito.obiettivo.contratto.impronta, obiettivo.contratto.impronta);
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => r.obiettivo.contratto.criteri.length), [3, 5]);
  assert.deepEqual(annunci.map((v) => v.obiettivo.contratto.criteri.length), [5]);

  assert.deepEqual(forma(await banco.registro.aggiungiCriteriObiettivo(sessionId, [{ ...inPiu, id: 'c1' }])), { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-id-not-allowed' });
  assert.deepEqual(forma(await banco.registro.aggiungiCriteriObiettivo(sessionId, [inPiu, { testo: 'bad', verifica: { tipo: 'comando', comando: 'a | b' } }])),
    { code: 'GOAL_CONTRACT_INVALID', reason: 'criterion-command-not-attributable', params: { posizione: 2, operatore: '|' } }, 'the position counts among the NEW criteria');
  assert.equal(banco.registro.statoObiettivo(sessionId).obiettivo.contratto.criteri.length, 5, 'a refused addition adds nothing');

  const altra = await conversazioneFerma(banco);
  await banco.registro.impostaObiettivo(altra, 'no criteria yet');
  const primo = await banco.registro.aggiungiCriteriObiettivo(altra, [inPiu]);
  assert.deepEqual(primo.cambio, { aggiunti: ['c1'], tolti: [], cambiati: [] });
  assert.equal(primo.obiettivo.contratto.criteri[0].id, 'c1');
}));

test('GOAL-CREG-04 — AL CONTRARIO: removing or changing a criterion needs the confirmation — without it the door refuses, says which ones, and nothing changes', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  const [c1, c2, c3] = obiettivo.contratto.criteri;
  const annunci = ascolta(banco.registro, sessionId);

  const senzaC2 = await banco.registro.contrattoObiettivo(sessionId, [c1, c3]);
  assert.deepEqual(forma(senzaC2), { code: 'GOAL_CONTRACT_NEEDS_CONFIRMATION', reason: 'goal-contract-change-needs-confirmation', params: { tolti: 'c2', cambiati: '' } });
  const piuLargo = await banco.registro.contrattoObiettivo(sessionId, [{ ...c1, verifica: { tipo: 'comando', comando: 'node --version' } }, c2, c3]);
  assert.deepEqual(forma(piuLargo).params, { tolti: '', cambiati: 'c1' });
  const tutti = await banco.registro.contrattoObiettivo(sessionId, [{ testo: 'only this now', verifica: { tipo: 'giudizio' } }]);
  /* REV-GOAL-04 (14/10/2026): un criterio senza id non prende più l'id di uno di prima (c1): è nuovo, e i tre di prima sono tolti */
  assert.deepEqual(forma(tutti).params, { tolti: 'c1 c2 c3', cambiati: '' }, 'a brand new list drops all three, and the new one is not c1');
  for (const nonUnSi of [undefined, false, 'true', 1, 'yes', {}]) {
    const esito = await banco.registro.contrattoObiettivo(sessionId, [c1, c3], { conferma: nonUnSi });
    assert.equal(esito.code, 'GOAL_CONTRACT_NEEDS_CONFIRMATION', `conferma: ${JSON.stringify(nonUnSi)} is not a yes`);
  }
  await attendiScritture({ cartellaStore });
  assert.deepEqual(banco.registro.statoObiettivo(sessionId).obiettivo, obiettivo, 'the goal is exactly as it was');
  assert.equal(righeObiettivo(cartellaStore, sessionId).length, 1);
  assert.deepEqual(annunci, []);

  // col sì: si applica, e la risposta dice che cosa è stato tolto
  const confermato = await banco.registro.contrattoObiettivo(sessionId, [c1, c3], { conferma: obiettivo.contratto.impronta });
  assert.equal(confermato.ok, true, JSON.stringify(confermato));
  assert.deepEqual(confermato.cambio, { aggiunti: [], tolti: ['c2'], cambiati: [] });
  assert.deepEqual(confermato.obiettivo.contratto.criteri.map((c) => c.id), ['c1', 'c3']);
  assert.equal(confermato.obiettivo.revisione, 2);
  // e le sole aggiunte passano dalla stessa porta senza conferma
  const conUnoInPiu = await banco.registro.contrattoObiettivo(sessionId, [c1, c3, inPiu]);
  assert.equal(conUnoInPiu.ok, true, JSON.stringify(conUnoInPiu));
  assert.deepEqual(conUnoInPiu.cambio, { aggiunti: ['c4'], tolti: [], cambiati: [] }, 'REV-GOAL-04: c2 was removed, its id is never given again');
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => r.obiettivo.contratto.criteri.length), [3, 2, 3]);
}));

test('GOAL-CREG-05 — the same contract again changes nothing and writes nothing; AL CONTRARIO: no goal, or a goal already done, refuses with its reason', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  for (const porta of ['contrattoObiettivo', 'aggiungiCriteriObiettivo']) {
    assert.deepEqual(forma(await banco.registro[porta](sessionId, [...TRE_CRITERI])), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-not-set' }, porta);
    assert.deepEqual(forma(await banco.registro[porta]('non-esiste', [...TRE_CRITERI])), { code: 'NOT_FOUND', reason: 'session-not-found' }, porta);
  }
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  const annunci = ascolta(banco.registro, sessionId);
  const uguale = await banco.registro.contrattoObiettivo(sessionId, obiettivo.contratto.criteri);
  assert.deepEqual(uguale, { ok: true, obiettivo, invariato: true });
  await attendiScritture({ cartellaStore });
  assert.equal(righeObiettivo(cartellaStore, sessionId).length, 1);
  assert.deepEqual(annunci, []);

  // un obiettivo «fatto» lo è stato CON quel contratto: non si tocca più (lo stato lo scriverà il ciclo: qui a mano)
  const fatta = await conversazioneFerma(banco);
  const base = nuovoObiettivo({ testo: 'done', id: 'ob-00000000-2222-4333-8444-555555555555', adesso: '2026-10-14T10:00:00.000Z', contratto: nuovoContratto({ criteri: [...TRE_CRITERI] }).contratto }).obiettivo;
  await registraRiga({ cartellaStore, sessionId: fatta, record: rigaObiettivo({ ...base, stato: 'fatto', revisione: 6 }), durable: true });
  const secondo = await riavvia(cartellaStore);
  assert.equal(secondo.registro.statoObiettivo(fatta).obiettivo.stato, 'fatto', 'premise: the done goal is read back with its contract');
  for (const porta of ['contrattoObiettivo', 'aggiungiCriteriObiettivo']) {
    assert.deepEqual(forma(await secondo.registro[porta](fatta, [inPiu], { conferma: true })), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-already-done' }, porta);
  }
}));

test('GOAL-CREG-06 — AL CONTRARIO: a contract edited on the disk under the same fingerprint is not this contract — after a restart there is no goal, and the log says so', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(primo);
  await primo.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  await attendiScritture({ cartellaStore });
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const righe = readFileSync(percorso, 'utf8').split('\n').filter(Boolean);
  const ritoccate = righe.map((riga) => {
    const dati = JSON.parse(riga);
    if (dati.tipo !== 'obiettivo') return riga;
    dati.obiettivo.contratto.criteri[0].verifica.comando = 'node --version'; // sempre verde, stessa impronta dichiarata
    return JSON.stringify(dati);
  });
  assert.notDeepEqual(ritoccate, righe, 'premise: the row was really edited');
  writeFileSync(percorso, `${ritoccate.join('\n')}\n`, 'utf8');

  const detti = [];
  const originale = console.error;
  console.error = (...parti) => { detti.push(parti.join(' ')); };
  let secondo;
  try { secondo = await riavvia(cartellaStore); } finally { console.error = originale; }
  assert.deepEqual(secondo.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null }, 'an easier check smuggled under the old fingerprint makes nothing active');
  assert.equal(detti.filter((riga) => riga.includes(sessionId) && riga.includes('goal row cannot be read')).length, 1, detti.join('\n'));
}));

test('GOAL-CREG-07 — when the save fails the contract of before stays, for the addition and for the confirmed change', async (t) => conStore(t, async (cartellaStore) => {
  let rotto = false;
  const banco = registroAGiri(cartellaStore, {
    registraRigaFn: async (argomenti, ...resto) => {
      if (rotto && argomenti.record?.tipo === 'obiettivo') throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return registraRiga(argomenti, ...resto);
    },
  });
  const sessionId = await conversazioneFerma(banco);
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  const annunci = ascolta(banco.registro, sessionId);
  const originale = console.error;
  console.error = () => {};
  t.after(() => { console.error = originale; });
  rotto = true;
  const [c1, , c3] = obiettivo.contratto.criteri;
  for (const esito of [
    await banco.registro.aggiungiCriteriObiettivo(sessionId, [inPiu]),
    await banco.registro.contrattoObiettivo(sessionId, [c1, c3], { conferma: obiettivo.contratto.impronta }),
  ]) {
    assert.deepEqual(forma(esito), { code: 'SESSION_STORE_WRITE_FAILED', reason: 'goal-not-saved' });
    assert.equal('cambio' in esito, false, 'a change that was not saved is not reported as made');
  }
  assert.deepEqual(banco.registro.statoObiettivo(sessionId).obiettivo, obiettivo);
  assert.deepEqual(annunci, []);
  rotto = false;
  assert.equal((await banco.registro.aggiungiCriteriObiettivo(sessionId, [inPiu])).obiettivo.revisione, 2, 'the failed attempts consumed no revision');
}));

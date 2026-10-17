/*
 * ⭐⭐⭐ /goal, fase G4 — le transizioni del ciclo nella macchina a stati (`src/obiettivo/stato.mjs`): i comandi approvati dalla
 * persona col contratto (owner 14/10: «il sì al contratto li approva»), il conto del ciclo, «fatto con N da guardare», il tetto,
 * la ripresa dopo «nessun progresso». Ogni regola nei due versi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { nuovoContratto } from '../src/obiettivo/contratto.mjs';
import { aFatto, aTetto, conCiclo, conContratto, mettiInPausa, nuovoObiettivo, obiettivoDalGiornale, obiettivoValido, riprendi, rigaObiettivo } from '../src/obiettivo/stato.mjs';

const adesso = '2026-10-14T21:00:00.000Z';
const contratto = (criteri) => nuovoContratto({ criteri }).contratto;
const comando = (riga) => ({ testo: `runs ${riga}`, verifica: { tipo: 'comando', comando: riga } });
const giudizio = { testo: 'clear', verifica: { tipo: 'giudizio' } };
const nuovo = (c, extra = {}) => nuovoObiettivo({ testo: 'goal', id: 'ob-12345678-bbbb', adesso, contratto: c, ...extra }).obiettivo;

test('G4-STATO-01 — il contratto della PERSONA approva i suoi comandi; uno cambiato da altri tiene solo quelli già approvati', () => {
  const c1 = contratto([comando('npm test'), comando('npm test'), giudizio, comando('npm run lint')]);
  const o = nuovo(c1);
  assert.deepEqual(o.comandiApprovati, ['npm test', 'npm run lint'], 'una volta sola ciascuno, solo i comandi');
  // dalla persona: il contratto nuovo approva i suoi comandi
  const c2 = contratto([comando('npm test'), comando('node scripts/check.mjs')]);
  assert.deepEqual(conContratto(o, c2, { adesso }).obiettivo.comandiApprovati, ['npm test', 'node scripts/check.mjs']);
  // AL CONTRARIO: non dalla persona (il modello, G6) ⇒ il comando nuovo NON è approvato, quello di prima sì
  assert.deepEqual(conContratto(o, c2, { adesso, dallaPersona: false }).obiettivo.comandiApprovati, ['npm test']);
  // e un obiettivo nato da altri non approva niente
  assert.deepEqual(nuovo(c1, { dallaPersona: false }).comandiApprovati, []);
  // senza contratto: nessun campo
  assert.equal('comandiApprovati' in nuovoObiettivo({ testo: 'g', id: 'ob-12345678-cccc', adesso }).obiettivo, false);
});

test('G4-STATO-02 — il conto del ciclo; «fatto» (con N da guardare) e «tetto» solo da attivo; una forma storta non passa', () => {
  const o = nuovo(contratto([comando('npm test')]));
  const contato = conCiclo(o, { giri: 3, token: 1200, senzaProgresso: 1 }, { adesso }).obiettivo;
  assert.deepEqual(contato.ciclo, { giri: 3, token: 1200, senzaProgresso: 1 });
  assert.throws(() => conCiclo(o, { giri: -1, token: 0, senzaProgresso: 0 }, { adesso }), TypeError);
  const fatto = aFatto(contato, { daGuardare: 2, adesso }).obiettivo;
  assert.equal(fatto.stato, 'fatto');
  assert.equal(fatto.daGuardare, 2);
  assert.equal(obiettivoValido(fatto), true);
  assert.equal(aFatto(fatto, { adesso }).invariato, true);
  assert.deepEqual(conCiclo(fatto, contato.ciclo, { adesso }), { ok: false, motivo: 'goal-already-done' });
  const tetto = aTetto(contato, { tipo: 'giri', adesso }).obiettivo;
  assert.deepEqual([tetto.stato, tetto.motivo], ['tetto', { tipo: 'giri' }]);
  assert.deepEqual(riprendi(tetto, { adesso }), { ok: false, motivo: 'goal-cap-reached' });
  // AL CONTRARIO: da fermo non si diventa né fatto né tetto
  const fermo = mettiInPausa(contato, { adesso }).obiettivo;
  assert.deepEqual(aFatto(fermo, { adesso }), { ok: false, motivo: 'goal-not-active' });
  assert.deepEqual(aTetto(fermo, { tipo: 'token', adesso }), { ok: false, motivo: 'goal-not-active' });
  assert.throws(() => aTetto(contato, { tipo: 'tempo', adesso }), TypeError);
  // forme storte sul giornale: illeggibili, mai «un obiettivo» per approssimazione
  for (const storto of [{ ...contato, ciclo: { giri: '3', token: 0, senzaProgresso: 0 } }, { ...contato, comandiApprovati: [1] }, { ...contato, daGuardare: 1 }, { ...fatto, daGuardare: -1 }]) {
    assert.equal(obiettivoValido(storto), false, JSON.stringify(storto).slice(0, 80));
    assert.deepEqual(obiettivoDalGiornale([{ tipo: 'obiettivo', obiettivo: storto }]), { obiettivo: null, illeggibile: true });
  }
  assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(fatto)]).obiettivo.daGuardare, 2);
});

test('G4-STATO-03 — riprendere dopo «nessun progresso» ridà i giri senza progresso da capo; dopo una pausa della persona no', () => {
  const o = conCiclo(nuovo(contratto([comando('npm test')])), { giri: 5, token: 0, senzaProgresso: 3 }, { adesso }).obiettivo;
  const fermo = mettiInPausa(o, { tipo: 'nessun-progresso', adesso }).obiettivo;
  assert.deepEqual(riprendi(fermo, { adesso }).obiettivo.ciclo, { giri: 5, token: 0, senzaProgresso: 0 });
  const dallaPersona = mettiInPausa(o, { adesso }).obiettivo;
  assert.equal(riprendi(dallaPersona, { adesso }).obiettivo.ciclo.senzaProgresso, 3, 'una pausa della persona non cancella il conto');
});
